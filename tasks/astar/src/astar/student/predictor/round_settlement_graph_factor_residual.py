from __future__ import annotations

import hashlib
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, SeedFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_round_record
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)
from astar.student.predictor.transcript_memory import (
    _load_or_build_synthetic_dataset,
    _load_target_tensor,
    _selected_replay_round_ids,
)
from astar.student.predictor.transcript_sequence_factor_residual import _ridge_weights
from astar.student.predictor.transcript_sequence_residual_memory import _blend_with_residual

ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_ALIAS = "round_settlement_graph_factor_residual"
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1 = "round_settlement_graph_factor_residual_v1"
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2 = "round_settlement_graph_factor_residual_v2"
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3 = "round_settlement_graph_factor_residual_v3"
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4 = "round_settlement_graph_factor_residual_v4"
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_MODEL_NAMES = frozenset(
    {
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_ALIAS,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4,
    },
)
ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_MODEL_CHOICE_LIST = [
    ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_ALIAS,
    ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1,
    ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2,
    ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3,
    ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4,
]


class RoundSettlementGraphFactorResidualVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    rank: int = Field(ge=1)
    ridge_lambda: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class RoundSettlementGraphFactorResidualCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    rank: int = Field(ge=1)
    ridge_lambda: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    residual_shape: list[int]
    memory_relpath: str


def is_round_settlement_graph_factor_residual_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_MODEL_NAMES


def resolve_round_settlement_graph_factor_residual_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_ALIAS:
        return ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1
    if normalized in ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported round_settlement_graph_factor_residual model: {model_name}")


def resolve_round_settlement_graph_factor_residual_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> RoundSettlementGraphFactorResidualVariantSpec:
    resolved = resolve_round_settlement_graph_factor_residual_model_name(model_name)
    default_samples = {
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1: 8,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2: 8,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3: 16,
        ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4:
        return RoundSettlementGraphFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            rank=24,
            ridge_lambda=2.0,
            correction_scale=1.0,
        )
    if resolved == ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3:
        return RoundSettlementGraphFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            rank=24,
            ridge_lambda=2.0,
            correction_scale=1.0,
        )
    if resolved == ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2:
        return RoundSettlementGraphFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            rank=12,
            ridge_lambda=1.0,
            correction_scale=0.75,
        )
    return RoundSettlementGraphFactorResidualVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        rank=12,
        ridge_lambda=1.0,
        correction_scale=0.75,
    )


def resolve_round_settlement_graph_factor_residual_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_round_settlement_graph_factor_residual_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    ).samples_per_round


def _round_scope_token(round_ids: Sequence[str] | None) -> str:
    if round_ids is None:
        return "all"
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_model_name(
    *,
    model_name: str,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"{model_name}__policy={policy_name.strip().lower()}"
        f"__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


def _normalize_population(value: float | None) -> float:
    return 0.0 if value is None else float(value) / 4.5


def _normalize_food(value: float | None) -> float:
    return 0.0 if value is None else float(value) / 1.1


def _normalize_wealth(value: float | None) -> float:
    return 0.0 if value is None else float(value) / 1.5


def _normalize_defense(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _pairwise_stats(
    coords: np.ndarray,
    owner_ids: list[int | None],
    *,
    diag: float,
) -> tuple[float, float, float, float]:
    count = coords.shape[0]
    if count < 2:
        return 0.0, 0.0, 0.0, 0.0
    diffs = coords[:, None, :] - coords[None, :, :]
    dists = np.sqrt(np.sum(diffs * diffs, axis=-1, dtype=np.float64), dtype=np.float64) / max(diag, 1.0)
    mask = ~np.eye(count, dtype=bool)
    off_diag = dists[mask]
    nearest = np.min(np.where(mask, dists, np.inf), axis=1)
    close_mask = np.triu(dists <= (3.0 / max(diag, 1.0)), k=1)
    close_pair_frac = float(np.mean(close_mask)) if close_mask.size > 0 else 0.0
    rival_flags = np.zeros((count, count), dtype=np.float64)
    for i in range(count):
        for j in range(i + 1, count):
            if owner_ids[i] is not None and owner_ids[j] is not None and owner_ids[i] != owner_ids[j]:
                rival_flags[i, j] = 1.0
    rival_close_pair_frac = float(np.mean((close_mask.astype(np.float64) * rival_flags))) if close_mask.size > 0 else 0.0
    return (
        float(np.mean(nearest, dtype=np.float64)),
        float(np.mean(off_diag, dtype=np.float64)) if off_diag.size > 0 else 0.0,
        close_pair_frac,
        rival_close_pair_frac,
    )


def _settlement_window_summary(
    settlements: Sequence[LiveSettlementObs],
    seed_features: SeedFeatureBundle,
) -> np.ndarray:
    if not settlements:
        return np.zeros((25,), dtype=np.float64)
    height = seed_features.height
    width = seed_features.width
    diag = float(np.hypot(height, width))
    coords = np.asarray([(float(item.y), float(item.x)) for item in settlements], dtype=np.float64)
    ys = np.clip(coords[:, 0].astype(np.int64), 0, height - 1)
    xs = np.clip(coords[:, 1].astype(np.int64), 0, width - 1)
    owner_ids = [item.owner_id for item in settlements]
    owner_counter = Counter(owner_id for owner_id in owner_ids if owner_id is not None)
    owner_total = float(sum(owner_counter.values()))
    owner_count = float(len(owner_counter))
    largest_owner_share = (
        max(owner_counter.values()) / owner_total if owner_total > 0.0 else 0.0
    )
    owner_hhi = (
        float(np.sum((np.asarray(list(owner_counter.values()), dtype=np.float64) / owner_total) ** 2, dtype=np.float64))
        if owner_total > 0.0
        else 0.0
    )
    mean_nn_dist, mean_pair_dist, close_pair_frac, rival_close_pair_frac = _pairwise_stats(
        coords,
        owner_ids,
        diag=diag,
    )
    buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)[ys, xs]
    settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)[ys, xs]
    coastal_exposure = np.asarray(seed_features.feature("coastal_exposure"), dtype=np.float64)[ys, xs]
    maritime_access = np.asarray(seed_features.feature("maritime_access"), dtype=np.float64)[ys, xs]
    frontier_score = np.asarray(seed_features.feature("frontier_score"), dtype=np.float64)[ys, xs]
    forest_density = np.asarray(seed_features.feature("forest_density"), dtype=np.float64)[ys, xs]
    mountain_density = np.asarray(seed_features.feature("mountain_density"), dtype=np.float64)[ys, xs]
    x_norm = coords[:, 1] / max(float(width - 1), 1.0)
    y_norm = coords[:, 0] / max(float(height - 1), 1.0)
    return np.asarray(
        [
            float(len(settlements)) / 40.0,
            float(np.mean([item.alive for item in settlements], dtype=np.float64)),
            float(np.mean([item.has_port for item in settlements], dtype=np.float64)),
            owner_count / 6.0,
            largest_owner_share,
            owner_hhi,
            float(np.mean([_normalize_population(item.population) for item in settlements], dtype=np.float64)),
            float(np.mean([_normalize_food(item.food) for item in settlements], dtype=np.float64)),
            float(np.mean([_normalize_wealth(item.wealth) for item in settlements], dtype=np.float64)),
            float(np.mean([_normalize_defense(item.defense) for item in settlements], dtype=np.float64)),
            float(np.mean(buildable, dtype=np.float64)),
            float(np.mean(settlement_proximity, dtype=np.float64)),
            float(np.mean(coastal_exposure, dtype=np.float64)),
            float(np.mean(maritime_access, dtype=np.float64)),
            float(np.mean(frontier_score, dtype=np.float64)),
            float(np.mean(forest_density, dtype=np.float64)),
            float(np.mean(mountain_density, dtype=np.float64)),
            float(np.mean(x_norm, dtype=np.float64)),
            float(np.mean(y_norm, dtype=np.float64)),
            float(np.std(x_norm, dtype=np.float64)),
            float(np.std(y_norm, dtype=np.float64)),
            mean_nn_dist,
            mean_pair_dist,
            close_pair_frac,
            rival_close_pair_frac,
        ],
        dtype=np.float64,
    )


def _seed_temporal_settlement_vector(
    observations: Sequence[LiveQueryObs],
    seed_features: SeedFeatureBundle,
) -> np.ndarray:
    ordered = sorted((item for item in observations), key=lambda item: item.query_index)
    split = len(ordered) // 2
    first_half = ordered[:split]
    second_half = ordered[split:]
    full_summary = _settlement_window_summary(
        [settlement for observation in ordered for settlement in observation.settlements],
        seed_features,
    )
    first_summary = _settlement_window_summary(
        [settlement for observation in first_half for settlement in observation.settlements],
        seed_features,
    )
    second_summary = _settlement_window_summary(
        [settlement for observation in second_half for settlement in observation.settlements],
        seed_features,
    )
    return np.concatenate(
        [
            full_summary,
            first_summary,
            second_summary,
            second_summary - first_summary,
        ],
        axis=0,
    )


def _round_settlement_graph_vector(
    observations: Sequence[LiveQueryObs],
    features: RoundFeatureBundle,
) -> np.ndarray:
    observations_by_seed: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in features.per_seed}
    for observation in observations:
        observations_by_seed.setdefault(observation.seed_index, []).append(observation)
    per_seed = [
        _seed_temporal_settlement_vector(
            observations_by_seed.get(seed_index, ()),
            features.per_seed[seed_index],
        )
        for seed_index in sorted(features.per_seed)
    ]
    stacked = np.stack(per_seed, axis=0)
    return np.concatenate(
        [
            stacked.reshape(-1),
            np.mean(stacked, axis=0, dtype=np.float64),
            np.std(stacked, axis=0, dtype=np.float64),
        ],
        axis=0,
    )


class RoundSettlementGraphFactorResidualRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1
    base_predictor: SummaryBankRoundPredictor
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    coeff_mean: np.ndarray
    basis: np.ndarray
    weight_matrix: np.ndarray
    residual_mean: np.ndarray
    residual_shape: tuple[int, ...]
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _predict_round_residual(self, context: LiveInferenceContext) -> np.ndarray:
        feature_vector = _round_settlement_graph_vector(
            context.observations,
            context.geometry_bundle,
        )
        normalized = (feature_vector - self.feature_mean) / self.feature_scale
        coeff = self.coeff_mean + (normalized @ self.weight_matrix)
        flat = self.residual_mean + (coeff @ self.basis)
        return flat.reshape(self.residual_shape)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        round_residual = self._predict_round_residual(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            predictions_by_seed[seed_index] = _blend_with_residual(
                base_prediction,
                round_residual[seed_index],
                correction_scale=self.correction_scale,
                probability_floor=self.probability_floor,
            )
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=evidence or build_round_evidence_from_observations(round_detail, ()),
        )
        return self.build_prediction_bundle_from_context(context)


def _fit_factor_predictor(
    paths: WorkspacePaths,
    *,
    spec: RoundSettlementGraphFactorResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> RoundSettlementGraphFactorResidualRoundPredictor:
    selected_round_ids = _selected_replay_round_ids(paths, round_ids)
    dataset = _load_or_build_synthetic_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=spec.samples_per_round,
        round_ids=selected_round_ids,
    )
    index = pl.read_parquet(dataset.index_path)
    round_detail_cache: dict[str, RoundDetail] = {}
    feature_cache: dict[str, RoundFeatureBundle] = {}
    x_rows: list[np.ndarray] = []
    y_rows: list[np.ndarray] = []
    residual_shape: tuple[int, ...] | None = None
    base_predictor = load_or_fit_named_summary_bank_predictor(
        paths,
        model_name=spec.base_model_name,
        round_ids=list(selected_round_ids),
        policy_name=policy_name,
        samples_per_round=4,
    )
    for row in index.iter_rows(named=True):
        artifact = load_synthetic_episode(Path(row["episode_path"]), paths=paths)
        round_id = str(row["round_id"])
        round_detail = round_detail_cache.get(round_id)
        if round_detail is None:
            round_detail = read_round_record(paths, round_id).round
            round_detail_cache[round_id] = round_detail
        round_features = feature_cache.get(round_id)
        if round_features is None:
            round_features = compute_round_features(round_detail)
            feature_cache[round_id] = round_features
        round_context = build_round_context_from_detail(round_detail)
        round_evidence = build_round_evidence_from_observations(round_detail, artifact.observations)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(
                round_context,
                tuple(artifact.observations),
            ),
            geometry_bundle=round_features,
            evidence_bundle=round_evidence,
        )
        base_bundle = base_predictor.build_prediction_bundle_from_context(context)
        bundle_targets: list[np.ndarray] = []
        bundle_bases: list[np.ndarray] = []
        target_shape: tuple[int, ...] | None = None
        for seed_index in sorted(artifact.target_paths):
            target = _load_target_tensor(paths, artifact, seed_index=seed_index)
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float32)
            if target_shape is None:
                target_shape = tuple(int(v) for v in target.shape)
            if tuple(int(v) for v in target.shape) != target_shape:
                bundle_targets = []
                break
            bundle_targets.append(np.asarray(target, dtype=np.float32))
            bundle_bases.append(base_prediction)
        if not bundle_targets:
            continue
        target_bundle = np.stack(bundle_targets, axis=0)
        base_bundle_tensor = np.stack(bundle_bases, axis=0)
        if residual_shape is None:
            residual_shape = tuple(int(v) for v in target_bundle.shape)
        if tuple(int(v) for v in target_bundle.shape) != residual_shape:
            continue
        x_rows.append(_round_settlement_graph_vector(tuple(artifact.observations), round_features))
        y_rows.append(np.asarray(target_bundle - base_bundle_tensor, dtype=np.float32).reshape(-1))
    if not x_rows or not y_rows or residual_shape is None:
        raise ValueError("round_settlement_graph_factor_residual produced no replay-backed training examples")
    x_matrix = np.asarray(x_rows, dtype=np.float64)
    y_matrix = np.asarray(y_rows, dtype=np.float64)
    feature_mean = np.mean(x_matrix, axis=0, dtype=np.float64)
    feature_scale = np.std(x_matrix, axis=0, dtype=np.float64)
    feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
    normalized = (x_matrix - feature_mean[None, :]) / feature_scale[None, :]
    residual_mean = np.mean(y_matrix, axis=0, dtype=np.float64)
    residual_centered = y_matrix - residual_mean[None, :]
    _, _, vt = np.linalg.svd(residual_centered, full_matrices=False)
    rank = min(spec.rank, vt.shape[0], vt.shape[1])
    basis = np.asarray(vt[:rank], dtype=np.float64)
    coeff_targets = residual_centered @ basis.T
    coeff_mean = np.mean(coeff_targets, axis=0, dtype=np.float64)
    weight_matrix = _ridge_weights(
        normalized,
        coeff_targets - coeff_mean[None, :],
        ridge_lambda=spec.ridge_lambda,
    )
    return RoundSettlementGraphFactorResidualRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
        coeff_mean=coeff_mean,
        basis=basis,
        weight_matrix=weight_matrix,
        residual_mean=residual_mean,
        residual_shape=residual_shape,
        correction_scale=spec.correction_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: RoundSettlementGraphFactorResidualRoundPredictor,
    model_dir: Path,
    *,
    spec: RoundSettlementGraphFactorResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "round_settlement_graph_factor_residual.npz"
    np.savez_compressed(
        memory_path,
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float32),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float32),
        coeff_mean=np.asarray(predictor.coeff_mean, dtype=np.float32),
        basis=np.asarray(predictor.basis, dtype=np.float32),
        weight_matrix=np.asarray(predictor.weight_matrix, dtype=np.float32),
        residual_mean=np.asarray(predictor.residual_mean, dtype=np.float32),
    )
    checkpoint = RoundSettlementGraphFactorResidualCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        rank=spec.rank,
        ridge_lambda=spec.ridge_lambda,
        correction_scale=spec.correction_scale,
        probability_floor=spec.probability_floor,
        residual_shape=list(predictor.residual_shape),
        memory_relpath=memory_path.name,
    )
    checkpoint_path = model_dir / "checkpoint.json"
    checkpoint_path.write_text(checkpoint.model_dump_json(indent=2), encoding="utf-8")
    return checkpoint_path


def _load_checkpoint(
    paths: WorkspacePaths,
    checkpoint_path: Path,
) -> RoundSettlementGraphFactorResidualRoundPredictor:
    checkpoint = RoundSettlementGraphFactorResidualCheckpoint.model_validate_json(
        checkpoint_path.read_text(encoding="utf-8"),
    )
    memory_path = checkpoint_path.parent / checkpoint.memory_relpath
    arrays = load_named_arrays(memory_path)
    base_predictor = load_or_fit_named_summary_bank_predictor(
        paths,
        model_name=checkpoint.base_model_name,
        round_ids=list(checkpoint.round_ids),
        policy_name=checkpoint.policy_name,
        samples_per_round=4,
    )
    return RoundSettlementGraphFactorResidualRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
        feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
        coeff_mean=np.asarray(arrays["coeff_mean"], dtype=np.float64),
        basis=np.asarray(arrays["basis"], dtype=np.float64),
        weight_matrix=np.asarray(arrays["weight_matrix"], dtype=np.float64),
        residual_mean=np.asarray(arrays["residual_mean"], dtype=np.float64),
        residual_shape=tuple(int(v) for v in checkpoint.residual_shape),
        correction_scale=checkpoint.correction_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_round_settlement_graph_factor_residual_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> RoundSettlementGraphFactorResidualRoundPredictor:
    spec = resolve_round_settlement_graph_factor_residual_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    )
    selected_round_ids = _selected_replay_round_ids(paths, round_ids)
    model_dir = paths.model_dir(
        _cached_model_name(
            model_name=spec.model_name,
            policy_name=policy_name,
            samples_per_round=spec.samples_per_round,
            round_ids=selected_round_ids,
        ),
    )
    checkpoint_path = model_dir / "checkpoint.json"
    if checkpoint_path.exists():
        return _load_checkpoint(paths, checkpoint_path)
    predictor = _fit_factor_predictor(
        paths,
        spec=spec,
        policy_name=policy_name,
        round_ids=selected_round_ids,
    )
    _save_checkpoint(
        predictor,
        model_dir,
        spec=spec,
        policy_name=policy_name,
        round_ids=selected_round_ids,
    )
    return predictor


__all__ = [
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_ALIAS",
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_MODEL_CHOICE_LIST",
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V1",
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V2",
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V3",
    "ROUND_SETTLEMENT_GRAPH_FACTOR_RESIDUAL_V4",
    "_round_settlement_graph_vector",
    "_settlement_window_summary",
    "is_round_settlement_graph_factor_residual_model_name",
    "load_or_fit_named_round_settlement_graph_factor_residual_predictor",
    "resolve_round_settlement_graph_factor_residual_samples_per_round",
    "resolve_round_settlement_graph_factor_residual_variant_spec",
]
