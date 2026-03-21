from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, SeedFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import (
    SyntheticEpisodeArtifact,
    SyntheticEpisodeDatasetRef,
    build_synthetic_live_dataset,
    load_synthetic_episode,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_analysis_records, read_round_record
from astar.observe.evidence import (
    RoundEvidenceBundle,
    SeedEvidenceBundle,
    build_round_evidence_from_observations,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)

TRANSCRIPT_MEMORY_ALIAS = "transcript_memory"
TRANSCRIPT_MEMORY_V1 = "transcript_memory_v1"
TRANSCRIPT_MEMORY_V2 = "transcript_memory_v2"
TRANSCRIPT_MEMORY_V3 = "transcript_memory_v3"
TRANSCRIPT_MEMORY_V4 = "transcript_memory_v4"
TRANSCRIPT_MEMORY_V5 = "transcript_memory_v5"
TRANSCRIPT_MEMORY_V6 = "transcript_memory_v6"
TRANSCRIPT_MEMORY_MODEL_NAMES = frozenset(
    {
        TRANSCRIPT_MEMORY_ALIAS,
        TRANSCRIPT_MEMORY_V1,
        TRANSCRIPT_MEMORY_V2,
        TRANSCRIPT_MEMORY_V3,
        TRANSCRIPT_MEMORY_V4,
        TRANSCRIPT_MEMORY_V5,
        TRANSCRIPT_MEMORY_V6,
    },
)
TRANSCRIPT_MEMORY_MODEL_CHOICE_LIST = [
    TRANSCRIPT_MEMORY_ALIAS,
    TRANSCRIPT_MEMORY_V1,
    TRANSCRIPT_MEMORY_V2,
    TRANSCRIPT_MEMORY_V3,
    TRANSCRIPT_MEMORY_V4,
    TRANSCRIPT_MEMORY_V5,
    TRANSCRIPT_MEMORY_V6,
]


class TranscriptMemoryVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    blend: float = Field(ge=0.0, le=1.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class TranscriptMemoryCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    blend: float = Field(ge=0.0, le=1.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    feature_mean: list[float]
    feature_scale: list[float]
    example_count: int = Field(ge=1)
    memory_relpath: str


def is_transcript_memory_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in TRANSCRIPT_MEMORY_MODEL_NAMES


def resolve_transcript_memory_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == TRANSCRIPT_MEMORY_ALIAS:
        return TRANSCRIPT_MEMORY_V1
    if normalized in TRANSCRIPT_MEMORY_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported transcript_memory model: {model_name}")


def resolve_transcript_memory_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> TranscriptMemoryVariantSpec:
    resolved = resolve_transcript_memory_model_name(model_name)
    default_samples = {
        TRANSCRIPT_MEMORY_V1: 8,
        TRANSCRIPT_MEMORY_V2: 8,
        TRANSCRIPT_MEMORY_V3: 16,
        TRANSCRIPT_MEMORY_V4: 16,
        TRANSCRIPT_MEMORY_V5: 16,
        TRANSCRIPT_MEMORY_V6: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == TRANSCRIPT_MEMORY_V6:
        return TranscriptMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            k_neighbors=3,
            blend=0.5,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_MEMORY_V5:
        return TranscriptMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            k_neighbors=3,
            blend=0.5,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_MEMORY_V4:
        return TranscriptMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            k_neighbors=5,
            blend=0.35,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_MEMORY_V3:
        return TranscriptMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            k_neighbors=5,
            blend=0.35,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_MEMORY_V2:
        return TranscriptMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            k_neighbors=5,
            blend=0.35,
            distance_scale=2.0,
        )
    return TranscriptMemoryVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        k_neighbors=5,
        blend=0.35,
        distance_scale=2.0,
    )


def resolve_transcript_memory_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_transcript_memory_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    ).samples_per_round


def _round_scope_token(round_ids: Sequence[str] | None) -> str:
    if round_ids is None:
        return "all"
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_dataset_name(
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"transcript_memory_synthetic_live__policy={policy_name.strip().lower()}"
        f"__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


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


def _selected_replay_round_ids(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    available = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if round_ids is None:
        return available
    available_set = set(available)
    selected = [round_id for round_id in round_ids if round_id in available_set]
    if not selected:
        raise ValueError("transcript_memory requires replay-backed rounds")
    return selected


def _load_or_build_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> SyntheticEpisodeDatasetRef:
    dataset_name = _cached_dataset_name(
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=round_ids,
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "index.parquet"
    if summary_path.exists() and index_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        cached_round_ids = sorted(
            {
                str(value)
                for value in pl.read_parquet(index_path, columns=["round_id"])["round_id"].to_list()
            },
        )
        expected_round_ids = sorted(set(round_ids))
        if cached_round_ids == expected_round_ids:
            return SyntheticEpisodeDatasetRef(
                dataset_name=dataset_name,
                dataset_kind="synthetic_live",
                dataset_dir=dataset_dir,
                summary_path=summary_path,
                index_path=index_path,
                row_count=int(summary["episode_count"]),
                round_count=int(summary["round_count"]),
                policy_name=str(summary["policy_name"]),
                episode_count=int(summary["episode_count"]),
                total_query_count=int(summary["total_query_count"]),
                samples_per_round=int(summary["samples_per_round"]),
            )
    return build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
    )


def _normalize_metric(value: float | None, scale: float) -> float:
    if value is None:
        return 0.0
    return float(value) / scale


def _safe_freq(counts: np.ndarray) -> np.ndarray:
    total = float(np.sum(counts, dtype=np.float64))
    if total <= 0.0:
        return np.zeros(counts.shape, dtype=np.float64)
    return np.asarray(counts, dtype=np.float64) / total


def _seed_memory_vector(
    round_evidence: RoundEvidenceBundle,
    features: RoundFeatureBundle,
    *,
    seed_index: int,
) -> np.ndarray:
    seed_evidence = round_evidence.per_seed[seed_index]
    seed_features = features.per_seed[seed_index]
    pooled_counts = np.zeros(6, dtype=np.float64)
    observed_cell_fracs: list[float] = []
    population_values: list[float] = []
    food_values: list[float] = []
    wealth_values: list[float] = []
    defense_values: list[float] = []
    settlement_values: list[float] = []
    alive_values: list[float] = []
    port_values: list[float] = []
    owner_count_values: list[float] = []
    owner_share_values: list[float] = []
    owner_hhi_values: list[float] = []
    for item in round_evidence.per_seed.values():
        pooled_counts += np.asarray(item.observed_class_counts, dtype=np.float64)
        observed_cell_fracs.append(
            float(
                np.mean(
                    np.sum(np.asarray(item.observed_class_count_tensor, dtype=np.float64), axis=-1) > 0.0,
                ),
            ),
        )
        population_values.append(_normalize_metric(item.mean_population, 4.5))
        food_values.append(_normalize_metric(item.mean_food, 1.1))
        wealth_values.append(_normalize_metric(item.mean_wealth, 1.5))
        defense_values.append(_normalize_metric(item.mean_defense, 1.0))
        settlement_values.append(float(item.mean_settlement_count))
        alive_values.append(float(item.alive_fraction))
        port_values.append(float(item.port_fraction))
        owner_count_values.append(float(item.owner_count))
        owner_share_values.append(float(item.largest_owner_share))
        owner_hhi_values.append(float(item.owner_hhi))

    seed_counts = np.asarray(seed_evidence.observed_class_counts, dtype=np.float64)
    seed_tensor = np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64)
    seed_observed = np.sum(seed_tensor, axis=-1)
    observed_mask = seed_observed > 0.0
    buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
    coast = np.asarray(seed_features.feature("coast"), dtype=np.float64)
    near = (np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64) >= 0.67).astype(
        np.float64,
    )
    return np.asarray(
        [
            float(round_evidence.total_queries) / 50.0,
            float(np.mean(observed_cell_fracs)) if observed_cell_fracs else 0.0,
            *_safe_freq(pooled_counts).tolist(),
            float(np.mean(population_values)) if population_values else 0.0,
            float(np.mean(food_values)) if food_values else 0.0,
            float(np.mean(wealth_values)) if wealth_values else 0.0,
            float(np.mean(defense_values)) if defense_values else 0.0,
            float(np.mean(settlement_values)) if settlement_values else 0.0,
            float(np.mean(alive_values)) if alive_values else 0.0,
            float(np.mean(port_values)) if port_values else 0.0,
            float(np.mean(owner_count_values)) if owner_count_values else 0.0,
            float(np.mean(owner_share_values)) if owner_share_values else 0.0,
            float(np.mean(owner_hhi_values)) if owner_hhi_values else 0.0,
            float(seed_evidence.query_count) / 50.0,
            float(np.mean(observed_mask)),
            *_safe_freq(seed_counts).tolist(),
            _normalize_metric(seed_evidence.mean_population, 4.5),
            _normalize_metric(seed_evidence.mean_food, 1.1),
            _normalize_metric(seed_evidence.mean_wealth, 1.5),
            _normalize_metric(seed_evidence.mean_defense, 1.0),
            float(seed_evidence.mean_settlement_count),
            float(seed_evidence.alive_fraction),
            float(seed_evidence.port_fraction),
            float(seed_evidence.owner_count),
            float(seed_evidence.largest_owner_share),
            float(seed_evidence.owner_hhi),
            float(np.mean(buildable)),
            float(np.mean(coast)),
            float(np.mean(np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64))),
            float(np.mean(np.asarray(seed_features.feature("coastal_exposure"), dtype=np.float64))),
            float(np.mean(np.asarray(seed_features.feature("maritime_access"), dtype=np.float64))),
            float(np.mean(np.asarray(seed_features.feature("frontier_score"), dtype=np.float64))),
            float(np.mean(np.asarray(seed_features.feature("forest_density"), dtype=np.float64))),
            float(np.mean(np.asarray(seed_features.feature("mountain_density"), dtype=np.float64))),
            float(np.mean(observed_mask * buildable)),
            float(np.mean(observed_mask * coast)),
            float(np.mean(observed_mask * near)),
        ],
        dtype=np.float64,
    )


def _resolve_target_path(paths: WorkspacePaths, path_text: str | Path) -> Path:
    candidate = Path(path_text)
    if candidate.exists():
        return candidate
    if candidate.is_absolute():
        return candidate
    return (paths.root / candidate).resolve()


def _load_target_tensor(
    paths: WorkspacePaths,
    artifact: SyntheticEpisodeArtifact,
    *,
    seed_index: int,
) -> np.ndarray:
    source = artifact.target_sources[seed_index]
    path = _resolve_target_path(paths, artifact.target_paths[seed_index])
    if source == "analysis_ground_truth":
        if not path.exists():
            analyses = read_analysis_records(paths, artifact.round_id)
            if seed_index not in analyses:
                raise FileNotFoundError(path)
            return np.asarray(analyses[seed_index].analysis.ground_truth, dtype=np.float32)
        payload = load_named_arrays(path)
        return np.asarray(payload["ground_truth"], dtype=np.float32)
    if source == "replay_mean_terminal_probs":
        payload = load_named_arrays(path)
        return np.asarray(payload["mean_terminal_probs"], dtype=np.float32)
    raise ValueError(f"unsupported target source: {source}")


class TranscriptMemoryRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = TRANSCRIPT_MEMORY_V1
    base_predictor: SummaryBankRoundPredictor
    feature_vectors: np.ndarray
    target_tensors: np.ndarray
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    k_neighbors: int = Field(ge=1)
    blend: float = Field(ge=0.0, le=1.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _memory_prediction(
        self,
        round_evidence: RoundEvidenceBundle,
        features: RoundFeatureBundle,
        *,
        seed_index: int,
    ) -> np.ndarray:
        feature_vector = _seed_memory_vector(round_evidence, features, seed_index=seed_index)
        normalized = (feature_vector - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.feature_vectors - normalized[None, :], axis=1)
        k = min(self.k_neighbors, len(distances))
        nearest = np.argpartition(distances, k - 1)[:k]
        ordered = nearest[np.argsort(distances[nearest])]
        neighbor_distances = distances[ordered]
        weights = np.exp(-neighbor_distances / self.distance_scale)
        weights = weights / np.clip(np.sum(weights, dtype=np.float64), 1e-9, None)
        return np.tensordot(weights.astype(np.float64), self.target_tensors[ordered], axes=(0, 0))

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            memory_prediction = self._memory_prediction(
                context.evidence_bundle,
                context.geometry_bundle,
                seed_index=seed_index,
            )
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            blended = ((1.0 - self.blend) * base_prediction) + (self.blend * memory_prediction)
            predictions_by_seed[seed_index] = apply_probability_floor(
                np.asarray(blended, dtype=np.float64),
                self.probability_floor,
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


def _fit_memory_predictor(
    paths: WorkspacePaths,
    *,
    spec: TranscriptMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> TranscriptMemoryRoundPredictor:
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
    vectors: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    target_shape: tuple[int, ...] | None = None
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
        round_evidence = build_round_evidence_from_observations(round_detail, artifact.observations)
        for seed_index in sorted(artifact.target_paths):
            target = _load_target_tensor(paths, artifact, seed_index=seed_index)
            if target_shape is None:
                target_shape = tuple(int(v) for v in target.shape)
            if tuple(int(v) for v in target.shape) != target_shape:
                continue
            vectors.append(_seed_memory_vector(round_evidence, round_features, seed_index=seed_index))
            targets.append(np.asarray(target, dtype=np.float32))
    if not vectors or not targets:
        raise ValueError("transcript_memory produced no replay-backed training examples")
    feature_matrix = np.asarray(vectors, dtype=np.float64)
    feature_mean = np.mean(feature_matrix, axis=0, dtype=np.float64)
    feature_scale = np.std(feature_matrix, axis=0, dtype=np.float64)
    feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
    normalized_feature_matrix = (feature_matrix - feature_mean[None, :]) / feature_scale[None, :]
    target_tensor = np.asarray(targets, dtype=np.float32)
    base_predictor = load_or_fit_named_summary_bank_predictor(
        paths,
        model_name=spec.base_model_name,
        round_ids=list(selected_round_ids),
        policy_name=policy_name,
        samples_per_round=4,
    )
    return TranscriptMemoryRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        feature_vectors=normalized_feature_matrix,
        target_tensors=target_tensor,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
        k_neighbors=spec.k_neighbors,
        blend=spec.blend,
        distance_scale=spec.distance_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: TranscriptMemoryRoundPredictor,
    model_dir: Path,
    *,
    spec: TranscriptMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "memory.npz"
    np.savez_compressed(
        memory_path,
        feature_vectors=np.asarray(predictor.feature_vectors, dtype=np.float32),
        target_tensors=np.asarray(predictor.target_tensors, dtype=np.float32),
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float32),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float32),
    )
    checkpoint = TranscriptMemoryCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        k_neighbors=spec.k_neighbors,
        blend=spec.blend,
        distance_scale=spec.distance_scale,
        probability_floor=spec.probability_floor,
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float64).tolist(),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float64).tolist(),
        example_count=int(predictor.feature_vectors.shape[0]),
        memory_relpath=memory_path.name,
    )
    checkpoint_path = model_dir / "checkpoint.json"
    checkpoint_path.write_text(checkpoint.model_dump_json(indent=2), encoding="utf-8")
    return checkpoint_path


def _load_checkpoint(
    paths: WorkspacePaths,
    checkpoint_path: Path,
) -> TranscriptMemoryRoundPredictor:
    checkpoint = TranscriptMemoryCheckpoint.model_validate_json(
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
    return TranscriptMemoryRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        feature_vectors=np.asarray(arrays["feature_vectors"], dtype=np.float64),
        target_tensors=np.asarray(arrays["target_tensors"], dtype=np.float64),
        feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
        feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
        k_neighbors=checkpoint.k_neighbors,
        blend=checkpoint.blend,
        distance_scale=checkpoint.distance_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_transcript_memory_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> TranscriptMemoryRoundPredictor:
    spec = resolve_transcript_memory_variant_spec(
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
    predictor = _fit_memory_predictor(
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
    "TRANSCRIPT_MEMORY_ALIAS",
    "TRANSCRIPT_MEMORY_MODEL_CHOICE_LIST",
    "TRANSCRIPT_MEMORY_V1",
    "TRANSCRIPT_MEMORY_V2",
    "TRANSCRIPT_MEMORY_V3",
    "TRANSCRIPT_MEMORY_V4",
    "TRANSCRIPT_MEMORY_V5",
    "TRANSCRIPT_MEMORY_V6",
    "TranscriptMemoryRoundPredictor",
    "_seed_memory_vector",
    "is_transcript_memory_model_name",
    "load_or_fit_named_transcript_memory_predictor",
    "resolve_transcript_memory_samples_per_round",
    "resolve_transcript_memory_variant_spec",
]
