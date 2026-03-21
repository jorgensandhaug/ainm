from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import RoundContext, build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_round_record
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)
from astar.student.predictor.transcript_memory import (
    _load_or_build_synthetic_dataset,
    _load_target_tensor,
    _seed_memory_vector,
    _selected_replay_round_ids,
)

TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_ALIAS = "transcript_sequence_residual_memory"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1 = "transcript_sequence_residual_memory_v1"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2 = "transcript_sequence_residual_memory_v2"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3 = "transcript_sequence_residual_memory_v3"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4 = "transcript_sequence_residual_memory_v4"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5 = "transcript_sequence_residual_memory_v5"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6 = "transcript_sequence_residual_memory_v6"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7 = "transcript_sequence_residual_memory_v7"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8 = "transcript_sequence_residual_memory_v8"
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_MODEL_NAMES = frozenset(
    {
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_ALIAS,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8,
    },
)
TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_MODEL_CHOICE_LIST = [
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_ALIAS,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7,
    TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8,
]
QUERY_TOKEN_DIM = 23


class TranscriptSequenceResidualMemoryVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    max_queries: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class TranscriptSequenceResidualMemoryCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    max_queries: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    example_count: int = Field(ge=1)
    memory_relpath: str


def is_transcript_sequence_residual_memory_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_MODEL_NAMES


def resolve_transcript_sequence_residual_memory_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_ALIAS:
        return TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1
    if normalized in TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported transcript_sequence_residual_memory model: {model_name}")


def resolve_transcript_sequence_residual_memory_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> TranscriptSequenceResidualMemoryVariantSpec:
    resolved = resolve_transcript_sequence_residual_memory_model_name(model_name)
    default_samples = {
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1: 8,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2: 8,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3: 8,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4: 8,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5: 16,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6: 16,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7: 16,
        TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            max_queries=8,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            max_queries=8,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            max_queries=4,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            max_queries=4,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            max_queries=8,
            k_neighbors=5,
            correction_scale=0.75,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=8,
            max_queries=8,
            k_neighbors=5,
            correction_scale=0.75,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2:
        return TranscriptSequenceResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            max_queries=4,
            k_neighbors=5,
            correction_scale=0.75,
            distance_scale=2.0,
        )
    return TranscriptSequenceResidualMemoryVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        max_queries=4,
        k_neighbors=5,
        correction_scale=0.75,
        distance_scale=2.0,
    )


def resolve_transcript_sequence_residual_memory_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_transcript_sequence_residual_memory_variant_spec(
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


def _normalize_metric(value: float | None, scale: float) -> float:
    if value is None:
        return 0.0
    return float(value) / scale


def _query_token_vector(
    observation: LiveQueryObs,
    *,
    map_width: int,
    map_height: int,
) -> np.ndarray:
    patch = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
    counts = np.bincount(patch.reshape(-1), minlength=CLASS_COUNT)[:CLASS_COUNT].astype(np.float64)
    freqs = counts / np.clip(np.sum(counts, dtype=np.float64), 1.0, None)
    settlements = observation.settlements
    settlement_count = float(len(settlements))
    port_frac = float(np.mean([item.has_port for item in settlements])) if settlements else 0.0
    alive_frac = float(np.mean([item.alive for item in settlements])) if settlements else 0.0
    owner_ids = [item.owner_id for item in settlements if item.owner_id is not None]
    owner_count = float(len(set(owner_ids)))
    largest_owner_share = 0.0
    if owner_ids:
        owner_values, owner_counts = np.unique(np.asarray(owner_ids, dtype=np.int64), return_counts=True)
        del owner_values
        largest_owner_share = float(np.max(owner_counts) / np.sum(owner_counts))
    mean_population = float(np.mean([item.population or 0.0 for item in settlements])) if settlements else 0.0
    mean_food = float(np.mean([item.food or 0.0 for item in settlements])) if settlements else 0.0
    mean_wealth = float(np.mean([item.wealth or 0.0 for item in settlements])) if settlements else 0.0
    mean_defense = float(np.mean([item.defense or 0.0 for item in settlements])) if settlements else 0.0
    viewport = observation.viewport
    center_x = (viewport.x + (0.5 * viewport.w)) / max(float(map_width), 1.0)
    center_y = (viewport.y + (0.5 * viewport.h)) / max(float(map_height), 1.0)
    return np.asarray(
        [
            float(observation.query_index) / 50.0,
            float(viewport.x) / max(float(map_width), 1.0),
            float(viewport.y) / max(float(map_height), 1.0),
            float(viewport.w) / max(float(map_width), 1.0),
            float(viewport.h) / max(float(map_height), 1.0),
            center_x,
            center_y,
            float(viewport.w * viewport.h) / max(float(map_width * map_height), 1.0),
            *freqs.tolist(),
            settlement_count / 8.0,
            port_frac,
            alive_frac,
            owner_count / 8.0,
            largest_owner_share,
            _normalize_metric(mean_population, 4.5),
            _normalize_metric(mean_food, 1.1),
            _normalize_metric(mean_wealth, 1.5),
            _normalize_metric(mean_defense, 1.0),
        ],
        dtype=np.float64,
    )


def _seed_sequence_vector(
    round_context: RoundContext,
    round_evidence: RoundEvidenceBundle,
    features: RoundFeatureBundle,
    observations: Sequence[LiveQueryObs],
    *,
    seed_index: int,
    max_queries: int,
) -> np.ndarray:
    base_vector = _seed_memory_vector(round_evidence, features, seed_index=seed_index)
    seed_observations = sorted(
        (obs for obs in observations if obs.seed_index == seed_index),
        key=lambda item: item.query_index,
    )
    selected = seed_observations[-max_queries:]
    tokens = np.zeros((max_queries, QUERY_TOKEN_DIM), dtype=np.float64)
    for idx, obs in enumerate(selected):
        row = max_queries - len(selected) + idx
        tokens[row] = _query_token_vector(
            obs,
            map_width=round_context.map_width,
            map_height=round_context.map_height,
        )
    mean_token = np.mean(tokens, axis=0, dtype=np.float64)
    delta_token = tokens[-1] - tokens[0] if len(selected) >= 2 else np.zeros(QUERY_TOKEN_DIM, dtype=np.float64)
    return np.concatenate([base_vector, mean_token, delta_token, tokens.reshape(-1)], axis=0)


def _blend_with_residual(
    base_prediction: np.ndarray,
    memory_residual: np.ndarray,
    *,
    correction_scale: float,
    probability_floor: float,
) -> np.ndarray:
    adjusted = np.asarray(base_prediction, dtype=np.float64) + (
        correction_scale * np.asarray(memory_residual, dtype=np.float64)
    )
    return np.asarray(apply_probability_floor(adjusted, probability_floor), dtype=np.float64)


class TranscriptSequenceResidualMemoryRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1
    base_predictor: SummaryBankRoundPredictor
    feature_vectors: np.ndarray
    residual_tensors: np.ndarray
    max_queries: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _memory_residual_prediction(
        self,
        context: LiveInferenceContext,
        *,
        seed_index: int,
    ) -> np.ndarray:
        feature_vector = _seed_sequence_vector(
            context.round_context,
            context.evidence_bundle,
            context.geometry_bundle,
            context.observations,
            seed_index=seed_index,
            max_queries=self.max_queries,
        )
        distances = np.linalg.norm(self.feature_vectors - feature_vector[None, :], axis=1)
        k = min(self.k_neighbors, len(distances))
        nearest = np.argpartition(distances, k - 1)[:k]
        ordered = nearest[np.argsort(distances[nearest])]
        neighbor_distances = distances[ordered]
        weights = np.exp(-neighbor_distances / self.distance_scale)
        weights = weights / np.clip(np.sum(weights, dtype=np.float64), 1e-9, None)
        return np.tensordot(weights.astype(np.float64), self.residual_tensors[ordered], axes=(0, 0))

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            memory_residual = self._memory_residual_prediction(context, seed_index=seed_index)
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            predictions_by_seed[seed_index] = _blend_with_residual(
                base_prediction,
                memory_residual,
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


def _fit_memory_predictor(
    paths: WorkspacePaths,
    *,
    spec: TranscriptSequenceResidualMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> TranscriptSequenceResidualMemoryRoundPredictor:
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
    residuals: list[np.ndarray] = []
    target_shape: tuple[int, ...] | None = None
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
        for seed_index in sorted(artifact.target_paths):
            target = _load_target_tensor(paths, artifact, seed_index=seed_index)
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float32)
            if target_shape is None:
                target_shape = tuple(int(v) for v in target.shape)
            if tuple(int(v) for v in target.shape) != target_shape:
                continue
            if tuple(int(v) for v in base_prediction.shape) != target_shape:
                continue
            vectors.append(
                _seed_sequence_vector(
                    round_context,
                    round_evidence,
                    round_features,
                    artifact.observations,
                    seed_index=seed_index,
                    max_queries=spec.max_queries,
                )
            )
            residuals.append(np.asarray(target - base_prediction, dtype=np.float32))
    if not vectors or not residuals:
        raise ValueError("transcript_sequence_residual_memory produced no replay-backed training examples")
    feature_matrix = np.asarray(vectors, dtype=np.float32)
    residual_tensor = np.asarray(residuals, dtype=np.float32)
    return TranscriptSequenceResidualMemoryRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        feature_vectors=feature_matrix,
        residual_tensors=residual_tensor,
        max_queries=spec.max_queries,
        k_neighbors=spec.k_neighbors,
        correction_scale=spec.correction_scale,
        distance_scale=spec.distance_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: TranscriptSequenceResidualMemoryRoundPredictor,
    model_dir: Path,
    *,
    spec: TranscriptSequenceResidualMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "memory.npz"
    np.savez_compressed(
        memory_path,
        feature_vectors=np.asarray(predictor.feature_vectors, dtype=np.float32),
        residual_tensors=np.asarray(predictor.residual_tensors, dtype=np.float32),
    )
    checkpoint = TranscriptSequenceResidualMemoryCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        max_queries=spec.max_queries,
        k_neighbors=spec.k_neighbors,
        correction_scale=spec.correction_scale,
        distance_scale=spec.distance_scale,
        probability_floor=spec.probability_floor,
        example_count=int(predictor.feature_vectors.shape[0]),
        memory_relpath=memory_path.name,
    )
    checkpoint_path = model_dir / "checkpoint.json"
    checkpoint_path.write_text(checkpoint.model_dump_json(indent=2), encoding="utf-8")
    return checkpoint_path


def _load_checkpoint(
    paths: WorkspacePaths,
    checkpoint_path: Path,
) -> TranscriptSequenceResidualMemoryRoundPredictor:
    checkpoint = TranscriptSequenceResidualMemoryCheckpoint.model_validate_json(
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
    return TranscriptSequenceResidualMemoryRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        feature_vectors=np.asarray(arrays["feature_vectors"], dtype=np.float32),
        residual_tensors=np.asarray(arrays["residual_tensors"], dtype=np.float32),
        max_queries=checkpoint.max_queries,
        k_neighbors=checkpoint.k_neighbors,
        correction_scale=checkpoint.correction_scale,
        distance_scale=checkpoint.distance_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_transcript_sequence_residual_memory_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> TranscriptSequenceResidualMemoryRoundPredictor:
    spec = resolve_transcript_sequence_residual_memory_variant_spec(
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
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_ALIAS",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_MODEL_CHOICE_LIST",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V1",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V2",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V3",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V4",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V5",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V6",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V7",
    "TRANSCRIPT_SEQUENCE_RESIDUAL_MEMORY_V8",
    "_blend_with_residual",
    "_query_token_vector",
    "is_transcript_sequence_residual_memory_model_name",
    "load_or_fit_named_transcript_sequence_residual_memory_predictor",
    "resolve_transcript_sequence_residual_memory_samples_per_round",
    "resolve_transcript_sequence_residual_memory_variant_spec",
]
