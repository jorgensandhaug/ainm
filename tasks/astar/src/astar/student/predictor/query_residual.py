from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid, map_internal_code
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import InitialSettlementState, InitialWorldState
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import (
    RoundEvidenceBundle,
    SeedEvidenceBundle,
    build_round_evidence_from_observations,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher

LOG_FLOOR_DENOM = math.log(100.0)
MAX_QUERY_BUDGET = 50.0
DEFAULT_BUDGET_PREFIXES = (0, 5, 10, 20, 35, 50)
DEFAULT_BLUR_SIGMAS = (1.5, 4.0)
QUERY_RESIDUAL_ALIAS = "query_residual"
QUERY_RESIDUAL_V7 = "query_residual_v7"
QUERY_RESIDUAL_V8 = "query_residual_v8"
QUERY_RESIDUAL_V9 = "query_residual_v9"
QUERY_RESIDUAL_MODEL_NAMES = frozenset(
    {
        QUERY_RESIDUAL_ALIAS,
        QUERY_RESIDUAL_V7,
        QUERY_RESIDUAL_V8,
        QUERY_RESIDUAL_V9,
    },
)
CELL_SELECTION_TOP_ENTROPY = "top_entropy"
CELL_SELECTION_STRATIFIED_ENTROPY = "stratified_entropy"


def is_query_residual_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in QUERY_RESIDUAL_MODEL_NAMES


def resolve_query_residual_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == QUERY_RESIDUAL_ALIAS:
        return QUERY_RESIDUAL_V7
    if normalized in QUERY_RESIDUAL_MODEL_NAMES:
        return normalized
    msg = f"unsupported query_residual model: {model_name}"
    raise ValueError(msg)


def _round_ids_with_analyses_and_replays(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    analysis_round_ids = {
        item.name
        for item in paths.raw_dir.joinpath("analyses").glob("*")
        if item.is_dir() and any(item.glob("seed_index=*.json"))
    }
    replay_round_ids = {
        item.name
        for item in paths.raw_dir.joinpath("replays").glob("*")
        if item.is_dir()
    }
    available = sorted(analysis_round_ids & replay_round_ids)
    if round_ids is None:
        return available
    selected = [round_id for round_id in round_ids if round_id in replay_round_ids]
    if not selected:
        raise ValueError("query_residual requires rounds with both analyses and replays")
    return selected


def _round_scope_token(round_ids: Sequence[str] | None) -> str:
    if round_ids is None:
        return "all"
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_synthetic_dataset_name(
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str] | None = None,
) -> str:
    normalized_policy = policy_name.strip().lower()
    scope_token = _round_scope_token(round_ids)
    return (
        f"query_residual_synthetic_live__policy={normalized_policy}"
        f"__samples={samples_per_round}__rounds={scope_token}"
    )


def _load_synthetic_dataset_ref(
    paths: WorkspacePaths,
    dataset_name: str,
) -> tuple[Path, Path]:
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "index.parquet"
    if not summary_path.exists() or not index_path.exists():
        raise FileNotFoundError(dataset_name)
    return summary_path, index_path


def _synthetic_dataset_covers_round_ids(
    paths: WorkspacePaths,
    dataset_name: str,
    round_ids: Sequence[str] | None,
) -> bool:
    if round_ids is None:
        return True
    _, index_path = _load_synthetic_dataset_ref(paths, dataset_name)
    available_round_ids = set(pl.read_parquet(index_path, columns=["round_id"])["round_id"].to_list())
    return set(round_ids).issubset(available_round_ids)


def _ensure_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str] | None = None,
) -> Path:
    from astar.history.datasets.synthetic_live import build_synthetic_live_dataset

    legacy_dataset_name = f"synthetic_live_{policy_name.strip().lower()}_v1"
    if samples_per_round == 1:
        try:
            _, index_path = _load_synthetic_dataset_ref(paths, legacy_dataset_name)
            if _synthetic_dataset_covers_round_ids(paths, legacy_dataset_name, round_ids):
                return index_path
        except FileNotFoundError:
            pass

    dataset_name = _cached_synthetic_dataset_name(policy_name, samples_per_round, round_ids)
    try:
        _, index_path = _load_synthetic_dataset_ref(paths, dataset_name)
        if _synthetic_dataset_covers_round_ids(paths, dataset_name, round_ids):
            return index_path
    except FileNotFoundError:
        pass
    dataset = build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        round_ids=None if round_ids is None else list(round_ids),
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
    )
    if dataset.index_path is None:
        raise ValueError("synthetic live dataset did not produce an index path")
    return dataset.index_path


def _safe_log_probs(probabilities: np.ndarray, floor: float) -> np.ndarray:
    return np.log(np.maximum(np.asarray(probabilities, dtype=np.float64), floor))


def _normalize_query_count(query_count: int) -> float:
    return float(query_count) / MAX_QUERY_BUDGET


def _normalize_population(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 4.5


def _normalize_food(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 1.1


def _normalize_wealth(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 1.5


def _normalize_defense(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _terrain_one_hot(initial_grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(initial_grid)
    channels = [(collapsed == class_index).astype(np.float64) for class_index in range(CLASS_COUNT)]
    return np.stack(channels, axis=-1)


def _box_mean(mask: np.ndarray, radius: int) -> np.ndarray:
    height, width = mask.shape
    out = np.zeros((height, width), dtype=np.float64)
    for y in range(height):
        y0 = max(0, y - radius)
        y1 = min(height, y + radius + 1)
        for x in range(width):
            x0 = max(0, x - radius)
            x1 = min(width, x + radius + 1)
            out[y, x] = float(np.mean(mask[y0:y1, x0:x1]))
    return out


def _initial_settlement_maps(round_detail: RoundDetail, seed_index: int) -> tuple[np.ndarray, np.ndarray]:
    settlement_map = np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64)
    port_map = np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64)
    for settlement in round_detail.initial_states[seed_index].settlements:
        settlement_map[settlement.y, settlement.x] = 1.0
        if settlement.has_port:
            port_map[settlement.y, settlement.x] = 1.0
    return settlement_map, port_map


class _TeacherSeedAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    seed_index: int = Field(ge=0)
    initial_state: InitialWorldState


def _teacher_seed_adapter(round_detail: RoundDetail, seed_index: int) -> _TeacherSeedAdapter:
    initial_state = round_detail.initial_states[seed_index]
    return _TeacherSeedAdapter(
        seed_index=seed_index,
        initial_state=InitialWorldState(
            grid=np.asarray(initial_state.grid, dtype=np.int64),
            settlements=tuple(
                InitialSettlementState(
                    x=item.x,
                    y=item.y,
                    has_port=item.has_port,
                    alive=item.alive,
                )
                for item in initial_state.settlements
            ),
        ),
    )


def _gaussian_kernel1d(sigma: float) -> np.ndarray:
    radius = max(1, int(math.ceil(3.0 * sigma)))
    coords = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-(coords**2) / (2.0 * sigma * sigma))
    return kernel / np.sum(kernel)


def _blur_axis(array: np.ndarray, kernel: np.ndarray, axis: int) -> np.ndarray:
    radius = len(kernel) // 2
    pad_width = [(0, 0)] * array.ndim
    pad_width[axis] = (radius, radius)
    padded = np.pad(array, pad_width, mode="edge")
    out = np.zeros_like(array, dtype=np.float64)
    for offset, weight in enumerate(kernel):
        source = [slice(None)] * array.ndim
        source[axis] = slice(offset, offset + array.shape[axis])
        out += weight * padded[tuple(source)]
    return out


def _gaussian_blur(array: np.ndarray, sigma: float) -> np.ndarray:
    kernel = _gaussian_kernel1d(sigma)
    blurred = _blur_axis(np.asarray(array, dtype=np.float64), kernel, axis=0)
    return _blur_axis(blurred, kernel, axis=1)


def _owner_summary(observations: Sequence[LiveQueryObs]) -> tuple[float, float, float]:
    owner_counts: dict[int, int] = {}
    for observation in observations:
        for settlement in observation.settlements:
            if settlement.owner_id is None:
                continue
            owner_counts[settlement.owner_id] = owner_counts.get(settlement.owner_id, 0) + 1
    if not owner_counts:
        return (0.0, 0.0, 0.0)
    total = float(sum(owner_counts.values()))
    shares = np.asarray([count / total for count in owner_counts.values()], dtype=np.float64)
    return (
        float(len(owner_counts)) / 10.0,
        float(np.max(shares)),
        float(np.sum(shares * shares)),
    )


def _settlement_means_from_observations(
    observations: Sequence[LiveQueryObs],
) -> tuple[float | None, float | None, float | None, float | None]:
    populations: list[float] = []
    foods: list[float] = []
    wealths: list[float] = []
    defenses: list[float] = []
    for observation in observations:
        for settlement in observation.settlements:
            if settlement.population is not None:
                populations.append(float(settlement.population))
            if settlement.food is not None:
                foods.append(float(settlement.food))
            if settlement.wealth is not None:
                wealths.append(float(settlement.wealth))
            if settlement.defense is not None:
                defenses.append(float(settlement.defense))
    if not populations:
        return (None, None, None, None)
    return (
        float(np.mean(populations)),
        float(np.mean(foods)) if foods else None,
        float(np.mean(wealths)) if wealths else None,
        float(np.mean(defenses)) if defenses else None,
    )


class SeedTranscriptStats(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    query_count: int = Field(ge=0)
    count_tensor: np.ndarray
    count_total: np.ndarray
    mean_population: float | None = None
    mean_food: float | None = None
    mean_wealth: float | None = None
    mean_defense: float | None = None
    owner_count: float = Field(default=0.0, ge=0.0)
    largest_owner_share: float = Field(default=0.0, ge=0.0, le=1.0)
    owner_hhi: float = Field(default=0.0, ge=0.0, le=1.0)


class TranscriptDerivedFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    global_summary: np.ndarray
    seed_summaries: dict[int, np.ndarray]
    local_evidence: dict[int, np.ndarray]
    exact_counts: dict[int, np.ndarray]


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate(
        [np.ones((inputs.shape[0], 1), dtype=np.float64), inputs],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ targets
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


class QueryResidualPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    cells_per_seed: int = Field(ge=1)
    budget_prefixes: list[int]
    blur_sigmas: list[float]
    cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY
    ridge_lambda: float = Field(ge=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    temperature: float = Field(gt=0.0)
    prior_blend: float = Field(ge=0.0, le=1.0)
    signal_scale: float = Field(gt=0.0)
    min_delta_scale: float = Field(ge=0.0, le=1.0)
    include_exact_local_residual: bool = False
    residual_class_scale: list[float]
    teacher_name: str
    teacher_feature_names: list[str]
    teacher_regime_intercept: list[float]
    teacher_regime_weights: list[list[float]]
    teacher_blend: float = Field(ge=0.0, le=1.0)
    regime_intercept: list[float]
    regime_weights: list[list[float]]
    beta_min: float = Field(ge=0.0)
    beta_scale: float = Field(ge=0.0)
    training_episode_count: int = Field(ge=0)
    sample_count: int = Field(ge=0)
    feature_names: list[str]
    coefficients: list[list[float]]
    intercept: list[float]
    base_checkpoint_relpath: str


def _stats_from_seed_evidence(seed_evidence: SeedEvidenceBundle) -> SeedTranscriptStats:
    count_tensor = np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64)
    return SeedTranscriptStats(
        query_count=seed_evidence.query_count,
        count_tensor=count_tensor,
        count_total=np.sum(count_tensor, axis=-1),
        mean_population=seed_evidence.mean_population,
        mean_food=seed_evidence.mean_food,
        mean_wealth=seed_evidence.mean_wealth,
        mean_defense=seed_evidence.mean_defense,
        owner_count=0.0,
        largest_owner_share=0.0,
        owner_hhi=0.0,
    )


def _stats_from_observations(
    round_detail: RoundDetail,
    observations: Sequence[LiveQueryObs],
) -> dict[int, SeedTranscriptStats]:
    evidence = build_round_evidence_from_observations(round_detail, tuple(observations))
    grouped: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in range(round_detail.seeds_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    stats: dict[int, SeedTranscriptStats] = {}
    for seed_index in range(round_detail.seeds_count):
        seed_observations = grouped.get(seed_index, [])
        seed_evidence = evidence.per_seed[seed_index]
        owner_count, largest_owner_share, owner_hhi = _owner_summary(seed_observations)
        mean_population, mean_food, mean_wealth, mean_defense = _settlement_means_from_observations(
            seed_observations,
        )
        count_tensor = np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64)
        stats[seed_index] = SeedTranscriptStats(
            query_count=len(seed_observations),
            count_tensor=count_tensor,
            count_total=np.sum(count_tensor, axis=-1),
            mean_population=mean_population,
            mean_food=mean_food,
            mean_wealth=mean_wealth,
            mean_defense=mean_defense,
            owner_count=owner_count,
            largest_owner_share=largest_owner_share,
            owner_hhi=owner_hhi,
        )
    return stats


def _observed_residual_maps(
    prior: np.ndarray,
    stats: SeedTranscriptStats,
) -> tuple[np.ndarray, np.ndarray]:
    count_total = stats.count_total
    observed_mask = count_total > 0.0
    exact_freq = np.zeros_like(prior, dtype=np.float64)
    if np.any(observed_mask):
        exact_freq[observed_mask] = (
            stats.count_tensor[observed_mask]
            / count_total[observed_mask, None]
        )
    residual = np.where(observed_mask[..., None], exact_freq - prior, 0.0)
    return residual, observed_mask.astype(np.float64)


def _masked_residual_mean(
    residual: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    count = float(np.sum(mask))
    if count <= 0.0:
        return np.zeros(CLASS_COUNT, dtype=np.float64)
    return np.sum(residual * mask[..., None], axis=(0, 1)) / count


def _derive_transcript_features_from_stats(
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    prior_bundle: PredictionBundle,
    per_seed_stats: dict[int, SeedTranscriptStats],
    *,
    blur_sigmas: tuple[float, float],
    include_exact_local_residual: bool = False,
) -> TranscriptDerivedFeatures:
    residual_by_seed: dict[int, np.ndarray] = {}
    observed_mask_by_seed: dict[int, np.ndarray] = {}
    exact_counts: dict[int, np.ndarray] = {}
    local_evidence: dict[int, np.ndarray] = {}
    seed_summaries: dict[int, np.ndarray] = {}

    total_queries = sum(stats.query_count for stats in per_seed_stats.values())
    total_observed_cells = 0.0
    total_coastal_cells = 0.0
    total_inland_cells = 0.0
    total_buildable_cells = 0.0
    total_nonbuildable_cells = 0.0
    total_near_cells = 0.0
    total_mid_cells = 0.0
    total_far_cells = 0.0
    pooled_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_coastal_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_inland_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_buildable_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_nonbuildable_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_near_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_mid_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    pooled_far_residual = np.zeros(CLASS_COUNT, dtype=np.float64)
    population_values: list[float] = []
    food_values: list[float] = []
    wealth_values: list[float] = []
    defense_values: list[float] = []
    owner_count_values: list[float] = []
    owner_share_values: list[float] = []
    owner_hhi_values: list[float] = []

    for seed_index in range(round_detail.seeds_count):
        stats = per_seed_stats[seed_index]
        prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        residual, observed_mask = _observed_residual_maps(prior, stats)
        residual_by_seed[seed_index] = residual
        observed_mask_by_seed[seed_index] = observed_mask
        exact_counts[seed_index] = np.asarray(stats.count_tensor, dtype=np.float64)

        seed_features = features.per_seed[seed_index]
        coastal_mask = np.asarray(seed_features.feature("coast"), dtype=np.float64)
        inland_mask = 1.0 - coastal_mask
        buildable_mask = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
        nonbuildable_mask = 1.0 - buildable_mask
        settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)
        near_mask = (settlement_proximity >= 0.67).astype(np.float64)
        mid_mask = ((settlement_proximity >= 0.33) & (settlement_proximity < 0.67)).astype(np.float64)
        far_mask = (settlement_proximity < 0.33).astype(np.float64)
        seed_observed_cell_frac = float(np.mean(observed_mask > 0.0))
        seed_resid_mean = _masked_residual_mean(residual, observed_mask)
        seed_buildable_resid = _masked_residual_mean(residual, observed_mask * buildable_mask)
        seed_nonbuildable_resid = _masked_residual_mean(residual, observed_mask * nonbuildable_mask)
        seed_near_resid = _masked_residual_mean(residual, observed_mask * near_mask)
        seed_mid_resid = _masked_residual_mean(residual, observed_mask * mid_mask)
        seed_far_resid = _masked_residual_mean(residual, observed_mask * far_mask)
        seed_summary = np.asarray(
            [
                _normalize_query_count(stats.query_count),
                seed_observed_cell_frac,
                *seed_resid_mean.tolist(),
                *seed_buildable_resid.tolist(),
                *seed_nonbuildable_resid.tolist(),
                *seed_near_resid.tolist(),
                *seed_mid_resid.tolist(),
                *seed_far_resid.tolist(),
                _normalize_population(stats.mean_population),
                _normalize_food(stats.mean_food),
                _normalize_wealth(stats.mean_wealth),
                _normalize_defense(stats.mean_defense),
                stats.owner_count,
                stats.largest_owner_share,
                stats.owner_hhi,
            ],
            dtype=np.float64,
        )
        seed_summaries[seed_index] = seed_summary

        observed_cells = float(np.sum(observed_mask))
        coastal_observed = observed_mask * coastal_mask
        inland_observed = observed_mask * inland_mask
        buildable_observed = observed_mask * buildable_mask
        nonbuildable_observed = observed_mask * nonbuildable_mask
        near_observed = observed_mask * near_mask
        mid_observed = observed_mask * mid_mask
        far_observed = observed_mask * far_mask
        coastal_count = float(np.sum(coastal_observed))
        inland_count = float(np.sum(inland_observed))
        buildable_count = float(np.sum(buildable_observed))
        nonbuildable_count = float(np.sum(nonbuildable_observed))
        near_count = float(np.sum(near_observed))
        mid_count = float(np.sum(mid_observed))
        far_count = float(np.sum(far_observed))
        total_observed_cells += observed_cells
        total_coastal_cells += coastal_count
        total_inland_cells += inland_count
        total_buildable_cells += buildable_count
        total_nonbuildable_cells += nonbuildable_count
        total_near_cells += near_count
        total_mid_cells += mid_count
        total_far_cells += far_count
        pooled_residual += np.sum(residual * observed_mask[..., None], axis=(0, 1))
        pooled_coastal_residual += np.sum(residual * coastal_observed[..., None], axis=(0, 1))
        pooled_inland_residual += np.sum(residual * inland_observed[..., None], axis=(0, 1))
        pooled_buildable_residual += np.sum(residual * buildable_observed[..., None], axis=(0, 1))
        pooled_nonbuildable_residual += np.sum(residual * nonbuildable_observed[..., None], axis=(0, 1))
        pooled_near_residual += np.sum(residual * near_observed[..., None], axis=(0, 1))
        pooled_mid_residual += np.sum(residual * mid_observed[..., None], axis=(0, 1))
        pooled_far_residual += np.sum(residual * far_observed[..., None], axis=(0, 1))

        if stats.query_count > 0:
            population_values.append(_normalize_population(stats.mean_population))
            food_values.append(_normalize_food(stats.mean_food))
            wealth_values.append(_normalize_wealth(stats.mean_wealth))
            defense_values.append(_normalize_defense(stats.mean_defense))
            owner_count_values.append(stats.owner_count)
            owner_share_values.append(stats.largest_owner_share)
            owner_hhi_values.append(stats.owner_hhi)

        observed_count_feature = np.log1p(stats.count_total.astype(np.float64)) / np.log(6.0)
        blur_residual_small = _gaussian_blur(residual, blur_sigmas[0])
        blur_residual_large = _gaussian_blur(residual, blur_sigmas[1])
        blur_coverage_small = _gaussian_blur(observed_count_feature, blur_sigmas[0])[..., None]
        blur_coverage_large = _gaussian_blur(observed_count_feature, blur_sigmas[1])[..., None]
        local_components = [
            observed_count_feature[..., None],
            blur_residual_small,
            blur_residual_large,
            blur_coverage_small,
            blur_coverage_large,
        ]
        if include_exact_local_residual:
            local_components.append(residual)
        local_evidence[seed_index] = np.concatenate(local_components, axis=-1)

    global_summary = np.asarray(
        [
            float(total_queries) / MAX_QUERY_BUDGET,
            total_observed_cells / float(round_detail.seeds_count * round_detail.map_height * round_detail.map_width),
            *(pooled_residual / max(total_observed_cells, 1.0)).tolist(),
            *(pooled_coastal_residual / max(total_coastal_cells, 1.0)).tolist(),
            *(pooled_inland_residual / max(total_inland_cells, 1.0)).tolist(),
            *(pooled_buildable_residual / max(total_buildable_cells, 1.0)).tolist(),
            *(pooled_nonbuildable_residual / max(total_nonbuildable_cells, 1.0)).tolist(),
            *(pooled_near_residual / max(total_near_cells, 1.0)).tolist(),
            *(pooled_mid_residual / max(total_mid_cells, 1.0)).tolist(),
            *(pooled_far_residual / max(total_far_cells, 1.0)).tolist(),
            float(np.mean(population_values)) if population_values else 0.0,
            float(np.mean(food_values)) if food_values else 0.0,
            float(np.mean(wealth_values)) if wealth_values else 0.0,
            float(np.mean(defense_values)) if defense_values else 0.0,
            float(np.mean(owner_count_values)) if owner_count_values else 0.0,
            float(np.mean(owner_share_values)) if owner_share_values else 0.0,
            float(np.mean(owner_hhi_values)) if owner_hhi_values else 0.0,
        ],
        dtype=np.float64,
    )
    return TranscriptDerivedFeatures(
        global_summary=global_summary,
        seed_summaries=seed_summaries,
        local_evidence=local_evidence,
        exact_counts=exact_counts,
    )


def _static_feature_names() -> list[str]:
    names = [f"terrain_{class_name}" for class_name in CLASS_NAMES]
    names.extend(
        [
            "initial_settlement",
            "initial_port",
            "buildable",
            "land",
            "coast",
            "coast_distance",
            "land_distance_to_settlement",
            "sea_distance_to_port",
            "forest_density",
            "mountain_density",
            "frontier_score",
            "settlement_proximity",
            "maritime_access",
        ],
    )
    names.extend([f"terrain_hist3_{class_name}" for class_name in CLASS_NAMES])
    return names


def _global_summary_names() -> list[str]:
    names = ["global_query_count", "global_observed_cell_frac"]
    names.extend([f"global_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_coastal_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_inland_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_buildable_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_nonbuildable_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_near_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_mid_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"global_far_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend(
        [
            "global_mean_population",
            "global_mean_food",
            "global_mean_wealth",
            "global_mean_defense",
            "global_owner_count",
            "global_largest_owner_share",
            "global_owner_hhi",
        ],
    )
    return names


def _seed_summary_names() -> list[str]:
    names = ["seed_query_count", "seed_observed_cell_frac"]
    names.extend([f"seed_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"seed_buildable_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"seed_nonbuildable_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"seed_near_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"seed_mid_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"seed_far_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend(
        [
            "seed_mean_population",
            "seed_mean_food",
            "seed_mean_wealth",
            "seed_mean_defense",
            "seed_owner_count",
            "seed_largest_owner_share",
            "seed_owner_hhi",
        ],
    )
    return names


def _local_evidence_names(
    *,
    include_exact_local_residual: bool = False,
) -> list[str]:
    names = ["local_observed_count"]
    names.extend([f"local_blur15_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"local_blur40_resid_{class_name}" for class_name in CLASS_NAMES])
    names.extend(["local_blur15_coverage", "local_blur40_coverage"])
    if include_exact_local_residual:
        names.extend([f"local_exact_resid_{class_name}" for class_name in CLASS_NAMES])
    return names


def _regime_summary_names() -> list[str]:
    return [
        "regime_build_hit_buildable",
        "regime_build_hit_coast",
        "regime_build_hit_inland",
        "regime_port_hit_buildable",
        "regime_ruin_hit_buildable",
        "regime_owner_flip_buildable",
        "regime_terminal_settlement_mass",
        "regime_terminal_port_mass",
        "regime_terminal_ruin_mass",
        "regime_terminal_built_mass",
        "regime_terminal_port_mass_dup",
        "regime_terminal_ruin_mass_dup",
    ]


def _regime_input_names() -> list[str]:
    names = [f"regime_in__{name}" for name in _global_summary_names()]
    names.extend([f"regime_in__seed_mean__{name}" for name in _seed_summary_names()])
    names.extend([f"regime_in__seed_std__{name}" for name in _seed_summary_names()])
    return names


def _regime_interaction_names() -> list[str]:
    return [
        "regime_build_hit_buildable_x_buildable",
        "regime_build_hit_coast_x_maritime_access",
        "regime_build_hit_inland_x_settlement_proximity",
        "regime_port_hit_buildable_x_maritime_access",
        "regime_ruin_hit_buildable_x_frontier_score",
        "regime_owner_flip_buildable_x_frontier_score",
        "regime_terminal_settlement_mass_x_settlement_proximity",
        "regime_terminal_port_mass_x_maritime_access",
        "regime_terminal_ruin_mass_x_frontier_score",
        "regime_terminal_built_mass_x_buildable",
    ]


def _interaction_names() -> list[str]:
    return [
        "global_empty_x_buildable",
        "global_settlement_x_settlement_proximity",
        "global_port_x_maritime_access",
        "global_ruin_x_frontier_score",
        "global_forest_x_forest_density",
        "global_mountain_x_mountain_density",
        "seed_empty_x_buildable",
        "seed_settlement_x_settlement_proximity",
        "seed_port_x_maritime_access",
        "seed_ruin_x_frontier_score",
        "seed_forest_x_forest_density",
        "seed_mountain_x_mountain_density",
        "global_buildable_settlement_x_buildable",
        "global_buildable_port_x_maritime_access",
        "global_buildable_ruin_x_frontier_score",
        "global_nonbuildable_forest_x_forest_density",
        "global_nonbuildable_mountain_x_mountain_density",
        "global_near_settlement_x_settlement_proximity",
        "seed_buildable_settlement_x_buildable",
        "seed_buildable_port_x_maritime_access",
        "seed_buildable_ruin_x_frontier_score",
        "seed_nonbuildable_forest_x_forest_density",
        "seed_nonbuildable_mountain_x_mountain_density",
        "seed_near_settlement_x_settlement_proximity",
    ]


GLOBAL_SUMMARY_INDEX = {name: index for index, name in enumerate(_global_summary_names())}
SEED_SUMMARY_INDEX = {name: index for index, name in enumerate(_seed_summary_names())}
REGIME_SUMMARY_INDEX = {name: index for index, name in enumerate(_regime_summary_names())}


def _full_feature_names(
    *,
    include_exact_local_residual: bool = False,
) -> list[str]:
    names = _static_feature_names()
    names.extend([f"prior_logit_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"teacher_logit_{class_name}" for class_name in CLASS_NAMES])
    names.extend(_global_summary_names())
    names.extend(_seed_summary_names())
    names.extend(_regime_summary_names())
    names.extend(_local_evidence_names(include_exact_local_residual=include_exact_local_residual))
    names.extend(_regime_interaction_names())
    names.extend(_interaction_names())
    return names


def _build_static_feature_stack(
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    seed_index: int,
) -> np.ndarray:
    initial_grid = np.asarray(round_detail.initial_states[seed_index].grid, dtype=np.int64)
    seed_features = features.per_seed[seed_index]
    terrain_one_hot = _terrain_one_hot(initial_grid)
    settlement_map, port_map = _initial_settlement_maps(round_detail, seed_index)
    collapsed = collapse_internal_grid(initial_grid)
    terrain_hist3 = np.stack(
        [
            _box_mean(collapsed == class_index, radius=1)
            for class_index in range(CLASS_COUNT)
        ],
        axis=-1,
    )
    return np.concatenate(
        [
            terrain_one_hot,
            settlement_map[..., None],
            port_map[..., None],
            seed_features.feature("buildable")[..., None],
            seed_features.feature("land")[..., None],
            seed_features.feature("coast")[..., None],
            seed_features.feature("coast_distance")[..., None],
            seed_features.feature("land_distance_to_settlement")[..., None],
            seed_features.feature("sea_distance_to_port")[..., None],
            seed_features.feature("forest_density")[..., None],
            seed_features.feature("mountain_density")[..., None],
            seed_features.feature("frontier_score")[..., None],
            seed_features.feature("settlement_proximity")[..., None],
            seed_features.feature("maritime_access")[..., None],
            terrain_hist3,
        ],
        axis=-1,
    ).astype(np.float64)


def _interaction_tensor(
    static_stack: np.ndarray,
    global_summary: np.ndarray,
    seed_summary: np.ndarray,
) -> np.ndarray:
    buildable = static_stack[..., len(CLASS_NAMES) + 2]
    forest_density = static_stack[..., len(CLASS_NAMES) + 8]
    mountain_density = static_stack[..., len(CLASS_NAMES) + 9]
    frontier_score = static_stack[..., len(CLASS_NAMES) + 10]
    settlement_proximity = static_stack[..., len(CLASS_NAMES) + 11]
    maritime_access = static_stack[..., len(CLASS_NAMES) + 12]
    return np.stack(
        [
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_empty"]] * buildable,
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_settlement"]] * settlement_proximity,
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_port"]] * maritime_access,
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_ruin"]] * frontier_score,
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_forest"]] * forest_density,
            global_summary[GLOBAL_SUMMARY_INDEX["global_resid_mountain"]] * mountain_density,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_empty"]] * buildable,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_settlement"]] * settlement_proximity,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_port"]] * maritime_access,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_ruin"]] * frontier_score,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_forest"]] * forest_density,
            seed_summary[SEED_SUMMARY_INDEX["seed_resid_mountain"]] * mountain_density,
            global_summary[GLOBAL_SUMMARY_INDEX["global_buildable_resid_settlement"]] * buildable,
            global_summary[GLOBAL_SUMMARY_INDEX["global_buildable_resid_port"]] * maritime_access,
            global_summary[GLOBAL_SUMMARY_INDEX["global_buildable_resid_ruin"]] * frontier_score,
            global_summary[GLOBAL_SUMMARY_INDEX["global_nonbuildable_resid_forest"]] * forest_density,
            global_summary[GLOBAL_SUMMARY_INDEX["global_nonbuildable_resid_mountain"]] * mountain_density,
            global_summary[GLOBAL_SUMMARY_INDEX["global_near_resid_settlement"]] * settlement_proximity,
            seed_summary[SEED_SUMMARY_INDEX["seed_buildable_resid_settlement"]] * buildable,
            seed_summary[SEED_SUMMARY_INDEX["seed_buildable_resid_port"]] * maritime_access,
            seed_summary[SEED_SUMMARY_INDEX["seed_buildable_resid_ruin"]] * frontier_score,
            seed_summary[SEED_SUMMARY_INDEX["seed_nonbuildable_resid_forest"]] * forest_density,
            seed_summary[SEED_SUMMARY_INDEX["seed_nonbuildable_resid_mountain"]] * mountain_density,
            seed_summary[SEED_SUMMARY_INDEX["seed_near_resid_settlement"]] * settlement_proximity,
        ],
        axis=-1,
    )


def _regime_input_vector(derived: TranscriptDerivedFeatures) -> np.ndarray:
    ordered_seed_indexes = sorted(derived.seed_summaries)
    seed_stack = np.stack([derived.seed_summaries[seed_index] for seed_index in ordered_seed_indexes], axis=0)
    return np.concatenate(
        [
            np.asarray(derived.global_summary, dtype=np.float64),
            np.mean(seed_stack, axis=0),
            np.std(seed_stack, axis=0),
        ],
        axis=0,
    ).astype(np.float64)


def _regime_interaction_tensor(
    static_stack: np.ndarray,
    regime_vector: np.ndarray,
) -> np.ndarray:
    buildable = static_stack[..., len(CLASS_NAMES) + 2]
    frontier_score = static_stack[..., len(CLASS_NAMES) + 10]
    settlement_proximity = static_stack[..., len(CLASS_NAMES) + 11]
    maritime_access = static_stack[..., len(CLASS_NAMES) + 12]
    return np.stack(
        [
            regime_vector[REGIME_SUMMARY_INDEX["regime_build_hit_buildable"]] * buildable,
            regime_vector[REGIME_SUMMARY_INDEX["regime_build_hit_coast"]] * maritime_access,
            regime_vector[REGIME_SUMMARY_INDEX["regime_build_hit_inland"]] * settlement_proximity,
            regime_vector[REGIME_SUMMARY_INDEX["regime_port_hit_buildable"]] * maritime_access,
            regime_vector[REGIME_SUMMARY_INDEX["regime_ruin_hit_buildable"]] * frontier_score,
            regime_vector[REGIME_SUMMARY_INDEX["regime_owner_flip_buildable"]] * frontier_score,
            regime_vector[REGIME_SUMMARY_INDEX["regime_terminal_settlement_mass"]] * settlement_proximity,
            regime_vector[REGIME_SUMMARY_INDEX["regime_terminal_port_mass"]] * maritime_access,
            regime_vector[REGIME_SUMMARY_INDEX["regime_terminal_ruin_mass"]] * frontier_score,
            regime_vector[REGIME_SUMMARY_INDEX["regime_terminal_built_mass"]] * buildable,
        ],
        axis=-1,
    )


def _compose_design_tensor(
    static_stack: np.ndarray,
    prior: np.ndarray,
    teacher_prior: np.ndarray,
    derived: TranscriptDerivedFeatures,
    regime_vector: np.ndarray,
    *,
    seed_index: int,
    probability_floor: float,
) -> np.ndarray:
    height, width = prior.shape[:2]
    global_broadcast = np.broadcast_to(derived.global_summary, (height, width, len(derived.global_summary)))
    seed_summary = derived.seed_summaries[seed_index]
    seed_broadcast = np.broadcast_to(seed_summary, (height, width, len(seed_summary)))
    regime_broadcast = np.broadcast_to(regime_vector, (height, width, len(regime_vector)))
    prior_logits = _safe_log_probs(prior, probability_floor) / LOG_FLOOR_DENOM
    teacher_logits = _safe_log_probs(teacher_prior, probability_floor) / LOG_FLOOR_DENOM
    regime_interaction = _regime_interaction_tensor(static_stack, regime_vector)
    interaction = _interaction_tensor(static_stack, derived.global_summary, seed_summary)
    return np.concatenate(
        [
            static_stack,
            prior_logits,
            teacher_logits,
            global_broadcast,
            seed_broadcast,
            regime_broadcast,
            derived.local_evidence[seed_index],
            regime_interaction,
            interaction,
        ],
        axis=-1,
    )


def _select_training_cells(
    ground_truth: np.ndarray,
    round_detail: RoundDetail,
    seed_index: int,
    *,
    cells_per_seed: int,
    selection_strategy: str = CELL_SELECTION_TOP_ENTROPY,
) -> np.ndarray:
    entropy = np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1)
    order = np.argsort(entropy)[::-1]
    target_count = min(cells_per_seed, len(order))
    if selection_strategy == CELL_SELECTION_STRATIFIED_ENTROPY:
        hi_count = max(1, int(round(target_count * 0.5)))
        mid_count = max(0, int(round(target_count * 0.25)))
        low_count = max(0, target_count - hi_count - mid_count)
        third = max(1, len(order) // 3)

        def _take_evenly(indices: np.ndarray, count: int) -> np.ndarray:
            if count <= 0 or indices.size == 0:
                return np.zeros(0, dtype=np.int64)
            if indices.size <= count:
                return np.asarray(indices, dtype=np.int64)
            positions = np.linspace(0, indices.size - 1, num=count, dtype=np.int64)
            return np.asarray(indices[positions], dtype=np.int64)

        high_pool = order[:third]
        mid_pool = order[third : min(2 * third, len(order))]
        low_pool = order[min(2 * third, len(order)) :]
        selected = set(_take_evenly(high_pool, hi_count).tolist())
        selected.update(_take_evenly(mid_pool, mid_count).tolist())
        selected.update(_take_evenly(low_pool, low_count).tolist())
        if len(selected) < target_count:
            for flat_index in order:
                selected.add(int(flat_index))
                if len(selected) >= target_count:
                    break
    else:
        selected = set(order[:target_count].tolist())
    width = ground_truth.shape[1]
    for settlement in round_detail.initial_states[seed_index].settlements:
        selected.add(settlement.y * width + settlement.x)
    return np.asarray(sorted(selected), dtype=np.int64)


class QueryResidualPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = QUERY_RESIDUAL_V7
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=256, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    blur_sigmas: tuple[float, float] = DEFAULT_BLUR_SIGMAS
    cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY
    ridge_lambda: float = Field(default=8.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.15, gt=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    signal_scale: float = Field(default=0.12, gt=0.0)
    min_delta_scale: float = Field(default=0.4, ge=0.0, le=1.0)
    include_exact_local_residual: bool = False
    residual_class_scale: np.ndarray = Field(
        default_factory=lambda: np.asarray([1.0, 0.65, 0.55, 0.55, 0.85, 1.0], dtype=np.float64),
    )
    teacher_blend: float = Field(default=0.12, ge=0.0, le=1.0)
    regime_intercept: np.ndarray = Field(
        default_factory=lambda: np.zeros(len(_regime_summary_names()), dtype=np.float64),
    )
    regime_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((len(_regime_input_names()), len(_regime_summary_names())), dtype=np.float64),
    )
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    training_episode_count: int = Field(default=0, ge=0)
    sample_count: int = Field(default=0, ge=0)
    feature_names: tuple[str, ...] = tuple(_full_feature_names())
    coefficients: np.ndarray = Field(
        default_factory=lambda: np.zeros((len(_full_feature_names()), CLASS_COUNT), dtype=np.float64),
    )
    intercept: np.ndarray = Field(
        default_factory=lambda: np.zeros(CLASS_COUNT, dtype=np.float64),
    )

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        cells_per_seed: int = 256,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        blur_sigmas: Sequence[float] = DEFAULT_BLUR_SIGMAS,
        cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY,
        ridge_lambda: float = 8.0,
        model_name: str = QUERY_RESIDUAL_V7,
        probability_floor: float = 0.01,
        temperature: float = 1.15,
        prior_blend: float = 0.35,
        signal_scale: float = 0.12,
        min_delta_scale: float = 0.4,
        include_exact_local_residual: bool = False,
        residual_class_scale: Sequence[float] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0),
        teacher_blend: float = 0.12,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
    ) -> QueryResidualPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("query_residual requires at least one analyzed round with replay data")
        dataset_round_ids = _round_ids_with_analyses_and_replays(paths)

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(
            [build_round_episode(paths, round_id) for round_id in selected_round_ids],
        )
        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=dataset_round_ids,
        )
        index_table = pl.read_parquet(index_path).filter(
            pl.col("round_id").is_in(selected_round_ids),
        )
        rows = index_table.to_dicts()
        if not rows:
            raise ValueError("query_residual synthetic transcript dataset is empty for selected rounds")

        feature_dim = len(
            _full_feature_names(
                include_exact_local_residual=include_exact_local_residual,
            ),
        )
        xtwx = np.zeros((feature_dim + 1, feature_dim + 1), dtype=np.float64)
        xtwy = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)
        training_episode_count = 0
        sample_count = 0
        training_prefixes: list[tuple[dict[str, object], TranscriptDerivedFeatures, np.ndarray]] = []

        round_cache: dict[str, dict[str, object]] = {}
        for row in rows:
            round_id = str(row["round_id"])
            cached = round_cache.get(round_id)
            if cached is None:
                round_detail = read_round_record(paths, round_id).round
                features = compute_round_features(round_detail)
                analyses = read_analysis_records(paths, round_id)
                if not analyses:
                    continue
                prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
                static_stacks = {
                    seed_index: _build_static_feature_stack(round_detail, features, seed_index)
                    for seed_index in analyses
                }
                target_delta = {}
                row_weights = {}
                selected_indices = {}
                for seed_index, analysis in analyses.items():
                    ground_truth = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
                    prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
                    target_delta[seed_index] = (
                        _safe_log_probs(ground_truth, probability_floor)
                        - _safe_log_probs(prior, probability_floor)
                    ).reshape(-1, CLASS_COUNT)
                    row_weights[seed_index] = (
                        0.05 + np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1) / math.log(6.0)
                    )
                    selected_indices[seed_index] = _select_training_cells(
                        ground_truth,
                        round_detail,
                        seed_index,
                        cells_per_seed=cells_per_seed,
                        selection_strategy=cell_selection_strategy,
                    )
                cached = {
                    "round_detail": round_detail,
                    "features": features,
                    "analyses": analyses,
                    "prior_bundle": prior_bundle,
                    "static_stacks": static_stacks,
                    "target_delta": target_delta,
                    "row_weights": row_weights,
                    "selected_indices": selected_indices,
                }
                round_cache[round_id] = cached

            from astar.history.datasets.synthetic_live import load_synthetic_episode

            artifact = load_synthetic_episode(Path(str(row["episode_path"])), paths=paths)
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in budget_prefixes})
            for budget in budget_values:
                observations = full_observations[:budget]
                derived = _derive_transcript_features_from_stats(
                    cached["round_detail"],  # type: ignore[arg-type]
                    cached["features"],  # type: ignore[arg-type]
                    cached["prior_bundle"],  # type: ignore[arg-type]
                    _stats_from_observations(cached["round_detail"], observations),  # type: ignore[arg-type]
                    blur_sigmas=tuple(float(item) for item in blur_sigmas),
                    include_exact_local_residual=include_exact_local_residual,
                )
                training_episode_count += 1
                training_prefixes.append(
                    (
                        cached,
                        derived,
                        np.asarray(artifact.regime_vector, dtype=np.float64),
                    ),
                )
        regime_inputs = np.stack(
            [_regime_input_vector(derived) for _, derived, _ in training_prefixes],
            axis=0,
        )
        regime_targets = np.stack([target for _, _, target in training_prefixes], axis=0)
        regime_intercept, regime_weights = _fit_linear_map(
            regime_inputs,
            regime_targets,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )

        for cached, derived, _ in training_prefixes:
            predicted_regime = np.asarray(
                regime_intercept + (_regime_input_vector(derived) @ regime_weights),
                dtype=np.float64,
            )
            predicted_regime = np.clip(predicted_regime, -0.25, 1.25)
            for seed_index in cached["analyses"]:  # type: ignore[operator]
                teacher_prior = teacher.terminal_tensor(
                    _teacher_seed_adapter(cached["round_detail"], seed_index),  # type: ignore[arg-type]
                    predicted_regime,
                )
                design = _compose_design_tensor(
                    cached["static_stacks"][seed_index],  # type: ignore[index]
                    cached["prior_bundle"].predictions_by_seed[seed_index],  # type: ignore[index]
                    teacher_prior,
                    derived,
                    predicted_regime,
                    seed_index=seed_index,
                    probability_floor=probability_floor,
                )
                flat_design = design.reshape(-1, feature_dim)
                selected = cached["selected_indices"][seed_index]  # type: ignore[index]
                batch_x = flat_design[selected]
                batch_y = cached["target_delta"][seed_index][selected]  # type: ignore[index]
                batch_w = cached["row_weights"][seed_index][selected]  # type: ignore[index]
                batch_aug = np.concatenate(
                    [np.ones((batch_x.shape[0], 1), dtype=np.float64), batch_x],
                    axis=1,
                )
                xtwx += batch_aug.T @ (batch_w[:, None] * batch_aug)
                xtwy += batch_aug.T @ (batch_w[:, None] * batch_y)
                sample_count += int(batch_x.shape[0])

        regularizer = np.eye(feature_dim + 1, dtype=np.float64)
        regularizer[0, 0] = 0.0
        regularizer *= ridge_lambda
        solved = np.linalg.solve(xtwx + regularizer + 1e-6 * np.eye(feature_dim + 1), xtwy)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            cells_per_seed=cells_per_seed,
            budget_prefixes=tuple(int(item) for item in budget_prefixes),
            blur_sigmas=tuple(float(item) for item in blur_sigmas),
            cell_selection_strategy=cell_selection_strategy,
            ridge_lambda=ridge_lambda,
            probability_floor=probability_floor,
            temperature=temperature,
            prior_blend=prior_blend,
            signal_scale=signal_scale,
            min_delta_scale=min_delta_scale,
            include_exact_local_residual=include_exact_local_residual,
            residual_class_scale=np.asarray(residual_class_scale, dtype=np.float64),
            teacher_blend=teacher_blend,
            regime_intercept=np.asarray(regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(regime_weights, dtype=np.float64),
            beta_min=beta_min,
            beta_scale=beta_scale,
            training_episode_count=training_episode_count,
            sample_count=sample_count,
            feature_names=tuple(
                _full_feature_names(
                    include_exact_local_residual=include_exact_local_residual,
                ),
            ),
            intercept=np.asarray(solved[0], dtype=np.float64),
            coefficients=np.asarray(solved[1:], dtype=np.float64),
        )

    @classmethod
    def load_checkpoint(cls, path: Path) -> QueryResidualPredictor:
        checkpoint = QueryResidualPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        base_path = path.parent / checkpoint.base_checkpoint_relpath
        return cls(
            name=checkpoint.name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(base_path),
            teacher=HazardTeacher(
                name=checkpoint.teacher_name,
                feature_names=list(checkpoint.teacher_feature_names),
                regime_intercept=np.asarray(checkpoint.teacher_regime_intercept, dtype=np.float64),
                regime_weights=np.asarray(checkpoint.teacher_regime_weights, dtype=np.float64),
            ),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            cells_per_seed=checkpoint.cells_per_seed,
            budget_prefixes=tuple(checkpoint.budget_prefixes),
            blur_sigmas=tuple(checkpoint.blur_sigmas),  # type: ignore[arg-type]
            cell_selection_strategy=checkpoint.cell_selection_strategy,
            ridge_lambda=checkpoint.ridge_lambda,
            probability_floor=checkpoint.probability_floor,
            temperature=checkpoint.temperature,
            prior_blend=checkpoint.prior_blend,
            signal_scale=checkpoint.signal_scale,
            min_delta_scale=checkpoint.min_delta_scale,
            include_exact_local_residual=checkpoint.include_exact_local_residual,
            residual_class_scale=np.asarray(checkpoint.residual_class_scale, dtype=np.float64),
            teacher_blend=checkpoint.teacher_blend,
            regime_intercept=np.asarray(checkpoint.regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(checkpoint.regime_weights, dtype=np.float64),
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            training_episode_count=checkpoint.training_episode_count,
            sample_count=checkpoint.sample_count,
            feature_names=tuple(checkpoint.feature_names),
            coefficients=np.asarray(checkpoint.coefficients, dtype=np.float64),
            intercept=np.asarray(checkpoint.intercept, dtype=np.float64),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        base_path = path.parent / "base_prior.json"
        self.base_predictor.save_checkpoint(base_path)
        checkpoint = QueryResidualPredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            cells_per_seed=self.cells_per_seed,
            budget_prefixes=list(self.budget_prefixes),
            blur_sigmas=list(self.blur_sigmas),
            cell_selection_strategy=self.cell_selection_strategy,
            ridge_lambda=self.ridge_lambda,
            probability_floor=self.probability_floor,
            temperature=self.temperature,
            prior_blend=self.prior_blend,
            signal_scale=self.signal_scale,
            min_delta_scale=self.min_delta_scale,
            include_exact_local_residual=self.include_exact_local_residual,
            residual_class_scale=np.asarray(self.residual_class_scale, dtype=np.float64).tolist(),
            teacher_name=self.teacher.name,
            teacher_feature_names=list(self.teacher.feature_names),
            teacher_regime_intercept=np.asarray(self.teacher.regime_intercept, dtype=np.float64).tolist(),
            teacher_regime_weights=np.asarray(self.teacher.regime_weights, dtype=np.float64).tolist(),
            teacher_blend=self.teacher_blend,
            regime_intercept=np.asarray(self.regime_intercept, dtype=np.float64).tolist(),
            regime_weights=np.asarray(self.regime_weights, dtype=np.float64).tolist(),
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            training_episode_count=self.training_episode_count,
            sample_count=self.sample_count,
            feature_names=list(self.feature_names),
            coefficients=np.asarray(self.coefficients, dtype=np.float64).tolist(),
            intercept=np.asarray(self.intercept, dtype=np.float64).tolist(),
            base_checkpoint_relpath=base_path.name,
        )
        path.write_text(json.dumps(to_jsonable(checkpoint), indent=2), encoding="utf-8")
        return path

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: TranscriptDerivedFeatures,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        delta_scale = self._transcript_delta_scale(derived)
        effective_prior_blend = 1.0 - (delta_scale * (1.0 - self.prior_blend))
        inferred_regime = self._infer_regime_from_derived(derived)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            teacher_prior = self._teacher_prior_for_seed(round_detail, seed_index, inferred_regime)
            design = _compose_design_tensor(
                static_stack,
                prior,
                teacher_prior,
                derived,
                inferred_regime,
                seed_index=seed_index,
                probability_floor=self.probability_floor,
            )
            flat_design = design.reshape(-1, self.coefficients.shape[0])
            delta = (
                self.intercept[None, :]
                + flat_design @ np.asarray(self.coefficients, dtype=np.float64)
            ).reshape(prior.shape)
            delta *= delta_scale
            delta *= np.asarray(self.residual_class_scale, dtype=np.float64)[None, None, :]
            logits = _safe_log_probs(prior, self.probability_floor) + np.clip(delta, -4.0, 4.0)
            prediction = softmax_logits(logits)
            exact_counts = np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
            prediction = self._exact_cell_blend(
                prediction,
                exact_counts,
                prior,
            )
            if self.temperature != 1.0:
                prediction = softmax_logits(_safe_log_probs(prediction, self.probability_floor) / self.temperature)
            if self.teacher_blend > 0.0:
                teacher_weight = np.where(
                    np.sum(exact_counts, axis=-1, keepdims=True) > 0.0,
                    0.0,
                    self.teacher_blend,
                )
                prediction = ((1.0 - teacher_weight) * prediction) + (teacher_weight * teacher_prior)
            if effective_prior_blend > 0.0:
                prediction = ((1.0 - effective_prior_blend) * prediction) + (effective_prior_blend * prior)
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def _infer_regime_from_derived(self, derived: TranscriptDerivedFeatures) -> np.ndarray:
        regime = np.asarray(
            self.regime_intercept + (_regime_input_vector(derived) @ self.regime_weights),
            dtype=np.float64,
        )
        return np.clip(regime, -0.25, 1.25)

    def _teacher_prior_for_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        inferred_regime: np.ndarray,
    ) -> np.ndarray:
        return np.asarray(
            self.teacher.terminal_tensor(
                _teacher_seed_adapter(round_detail, seed_index),
                inferred_regime,
            ),
            dtype=np.float64,
        )

    def _transcript_delta_scale(self, derived: TranscriptDerivedFeatures) -> float:
        summary = np.asarray(derived.global_summary, dtype=np.float64)
        signal_names = [
            "global_resid_settlement",
            "global_resid_ruin",
            "global_resid_port",
            "global_buildable_resid_settlement",
            "global_buildable_resid_ruin",
            "global_buildable_resid_port",
            "global_near_resid_settlement",
            "global_nonbuildable_resid_forest",
            "global_nonbuildable_resid_mountain",
        ]
        signal = float(
            np.linalg.norm(
                np.asarray(
                    [summary[GLOBAL_SUMMARY_INDEX[name]] for name in signal_names],
                    dtype=np.float64,
                ),
            ),
        )
        return float(np.clip(signal / self.signal_scale, self.min_delta_scale, 1.0))

    def _exact_cell_blend(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
        prior: np.ndarray,
    ) -> np.ndarray:
        count_total = np.sum(exact_counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prediction
        prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
        beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / math.log(6.0)))
        blended = np.where(
            count_total > 0.0,
            (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
            prediction,
        )
        return np.asarray(blended, dtype=np.float64)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        per_seed_stats = _stats_from_observations(round_detail, context.observations)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            self.base_predictor.build_prediction_bundle(round_detail, context.geometry_bundle),
            per_seed_stats,
            blur_sigmas=self.blur_sigmas,
            include_exact_local_residual=self.include_exact_local_residual,
        )
        return self._predict_from_derived(round_detail, context.geometry_bundle, derived)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        if evidence is None or evidence.total_queries == 0:
            empty_stats = {
                seed_index: SeedTranscriptStats(
                    query_count=0,
                    count_tensor=np.zeros((round_detail.map_height, round_detail.map_width, CLASS_COUNT), dtype=np.float64),
                    count_total=np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64),
                )
                for seed_index in range(round_detail.seeds_count)
            }
        else:
            empty_stats = {
                seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
                for seed_index in range(round_detail.seeds_count)
            }
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            self.base_predictor.build_prediction_bundle(round_detail, features),
            empty_stats,
            blur_sigmas=self.blur_sigmas,
            include_exact_local_residual=self.include_exact_local_residual,
        )
        return self._predict_from_derived(round_detail, features, derived)


def fit_named_query_residual_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
) -> QueryResidualPredictor:
    resolved_model_name = resolve_query_residual_model_name(model_name)
    if resolved_model_name == QUERY_RESIDUAL_V8:
        return QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            model_name=resolved_model_name,
            samples_per_round=samples_per_round,
            cell_selection_strategy=CELL_SELECTION_STRATIFIED_ENTROPY,
            include_exact_local_residual=True,
        )
    if resolved_model_name == QUERY_RESIDUAL_V9:
        return QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            model_name=resolved_model_name,
            samples_per_round=samples_per_round,
            include_exact_local_residual=True,
        )
    return QueryResidualPredictor.fit_from_workspace(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        model_name=resolved_model_name,
        samples_per_round=samples_per_round,
    )


def _named_query_residual_checkpoint_path(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
) -> Path:
    resolved_model_name = resolve_query_residual_model_name(model_name)
    resolved_policy_name = policy_name.strip().lower()
    scope_token = _round_scope_token(round_ids)
    return (
        paths.model_dir(
            (
                f"{resolved_model_name}"
                f"__policy={resolved_policy_name}"
                f"__samples={samples_per_round}"
                f"__rounds={scope_token}"
            ),
        )
        / "checkpoint.json"
    )


def load_or_fit_named_query_residual_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
) -> QueryResidualPredictor:
    checkpoint_path = _named_query_residual_checkpoint_path(
        paths,
        model_name=model_name,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    if checkpoint_path.exists():
        return QueryResidualPredictor.load_checkpoint(checkpoint_path)
    predictor = fit_named_query_residual_predictor(
        paths,
        model_name=model_name,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor.save_checkpoint(checkpoint_path)
    return predictor


__all__ = [
    "QueryResidualPredictor",
    "QueryResidualPredictorCheckpoint",
    "fit_named_query_residual_predictor",
    "is_query_residual_model_name",
    "load_or_fit_named_query_residual_predictor",
    "resolve_query_residual_model_name",
]
