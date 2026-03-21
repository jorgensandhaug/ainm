from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
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

TRANSCRIPT_RESIDUAL_MEMORY_ALIAS = "transcript_residual_memory"
TRANSCRIPT_RESIDUAL_MEMORY_V1 = "transcript_residual_memory_v1"
TRANSCRIPT_RESIDUAL_MEMORY_V2 = "transcript_residual_memory_v2"
TRANSCRIPT_RESIDUAL_MEMORY_V3 = "transcript_residual_memory_v3"
TRANSCRIPT_RESIDUAL_MEMORY_V4 = "transcript_residual_memory_v4"
TRANSCRIPT_RESIDUAL_MEMORY_V5 = "transcript_residual_memory_v5"
TRANSCRIPT_RESIDUAL_MEMORY_V6 = "transcript_residual_memory_v6"
TRANSCRIPT_RESIDUAL_MEMORY_V7 = "transcript_residual_memory_v7"
TRANSCRIPT_RESIDUAL_MEMORY_V8 = "transcript_residual_memory_v8"
TRANSCRIPT_RESIDUAL_MEMORY_MODEL_NAMES = frozenset(
    {
        TRANSCRIPT_RESIDUAL_MEMORY_ALIAS,
        TRANSCRIPT_RESIDUAL_MEMORY_V1,
        TRANSCRIPT_RESIDUAL_MEMORY_V2,
        TRANSCRIPT_RESIDUAL_MEMORY_V3,
        TRANSCRIPT_RESIDUAL_MEMORY_V4,
        TRANSCRIPT_RESIDUAL_MEMORY_V5,
        TRANSCRIPT_RESIDUAL_MEMORY_V6,
        TRANSCRIPT_RESIDUAL_MEMORY_V7,
        TRANSCRIPT_RESIDUAL_MEMORY_V8,
    },
)
TRANSCRIPT_RESIDUAL_MEMORY_MODEL_CHOICE_LIST = [
    TRANSCRIPT_RESIDUAL_MEMORY_ALIAS,
    TRANSCRIPT_RESIDUAL_MEMORY_V1,
    TRANSCRIPT_RESIDUAL_MEMORY_V2,
    TRANSCRIPT_RESIDUAL_MEMORY_V3,
    TRANSCRIPT_RESIDUAL_MEMORY_V4,
    TRANSCRIPT_RESIDUAL_MEMORY_V5,
    TRANSCRIPT_RESIDUAL_MEMORY_V6,
    TRANSCRIPT_RESIDUAL_MEMORY_V7,
    TRANSCRIPT_RESIDUAL_MEMORY_V8,
]


class TranscriptResidualMemoryVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class TranscriptResidualMemoryCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    feature_mean: list[float]
    feature_scale: list[float]
    example_count: int = Field(ge=1)
    memory_relpath: str


def is_transcript_residual_memory_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in TRANSCRIPT_RESIDUAL_MEMORY_MODEL_NAMES


def resolve_transcript_residual_memory_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == TRANSCRIPT_RESIDUAL_MEMORY_ALIAS:
        return TRANSCRIPT_RESIDUAL_MEMORY_V1
    if normalized in TRANSCRIPT_RESIDUAL_MEMORY_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported transcript_residual_memory model: {model_name}")


def resolve_transcript_residual_memory_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> TranscriptResidualMemoryVariantSpec:
    resolved = resolve_transcript_residual_memory_model_name(model_name)
    default_samples = {
        TRANSCRIPT_RESIDUAL_MEMORY_V1: 8,
        TRANSCRIPT_RESIDUAL_MEMORY_V2: 8,
        TRANSCRIPT_RESIDUAL_MEMORY_V3: 8,
        TRANSCRIPT_RESIDUAL_MEMORY_V4: 8,
        TRANSCRIPT_RESIDUAL_MEMORY_V5: 16,
        TRANSCRIPT_RESIDUAL_MEMORY_V6: 16,
        TRANSCRIPT_RESIDUAL_MEMORY_V7: 16,
        TRANSCRIPT_RESIDUAL_MEMORY_V8: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V8:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            k_neighbors=3,
            correction_scale=1.25,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V7:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            k_neighbors=3,
            correction_scale=1.25,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V6:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V5:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            k_neighbors=3,
            correction_scale=1.0,
            distance_scale=1.5,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V4:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            k_neighbors=5,
            correction_scale=1.0,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V3:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=8,
            k_neighbors=5,
            correction_scale=1.0,
            distance_scale=2.0,
        )
    if resolved == TRANSCRIPT_RESIDUAL_MEMORY_V2:
        return TranscriptResidualMemoryVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            k_neighbors=5,
            correction_scale=0.75,
            distance_scale=2.0,
        )
    return TranscriptResidualMemoryVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        k_neighbors=5,
        correction_scale=0.75,
        distance_scale=2.0,
    )


def resolve_transcript_residual_memory_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_transcript_residual_memory_variant_spec(
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


class TranscriptResidualMemoryRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = TRANSCRIPT_RESIDUAL_MEMORY_V1
    base_predictor: SummaryBankRoundPredictor
    feature_vectors: np.ndarray
    residual_tensors: np.ndarray
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    k_neighbors: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    distance_scale: float = Field(gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _memory_residual_prediction(
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
        return np.tensordot(weights.astype(np.float64), self.residual_tensors[ordered], axes=(0, 0))

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            memory_residual = self._memory_residual_prediction(
                context.evidence_bundle,
                context.geometry_bundle,
                seed_index=seed_index,
            )
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
    spec: TranscriptResidualMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> TranscriptResidualMemoryRoundPredictor:
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
            vectors.append(_seed_memory_vector(round_evidence, round_features, seed_index=seed_index))
            residuals.append(np.asarray(target - base_prediction, dtype=np.float32))
    if not vectors or not residuals:
        raise ValueError("transcript_residual_memory produced no replay-backed training examples")
    feature_matrix = np.asarray(vectors, dtype=np.float64)
    feature_mean = np.mean(feature_matrix, axis=0, dtype=np.float64)
    feature_scale = np.std(feature_matrix, axis=0, dtype=np.float64)
    feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
    normalized_feature_matrix = (feature_matrix - feature_mean[None, :]) / feature_scale[None, :]
    residual_tensor = np.asarray(residuals, dtype=np.float32)
    return TranscriptResidualMemoryRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        feature_vectors=normalized_feature_matrix,
        residual_tensors=residual_tensor,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
        k_neighbors=spec.k_neighbors,
        correction_scale=spec.correction_scale,
        distance_scale=spec.distance_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: TranscriptResidualMemoryRoundPredictor,
    model_dir: Path,
    *,
    spec: TranscriptResidualMemoryVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "memory.npz"
    np.savez_compressed(
        memory_path,
        feature_vectors=np.asarray(predictor.feature_vectors, dtype=np.float32),
        residual_tensors=np.asarray(predictor.residual_tensors, dtype=np.float32),
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float32),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float32),
    )
    checkpoint = TranscriptResidualMemoryCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        k_neighbors=spec.k_neighbors,
        correction_scale=spec.correction_scale,
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
) -> TranscriptResidualMemoryRoundPredictor:
    checkpoint = TranscriptResidualMemoryCheckpoint.model_validate_json(
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
    return TranscriptResidualMemoryRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        feature_vectors=np.asarray(arrays["feature_vectors"], dtype=np.float64),
        residual_tensors=np.asarray(arrays["residual_tensors"], dtype=np.float64),
        feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
        feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
        k_neighbors=checkpoint.k_neighbors,
        correction_scale=checkpoint.correction_scale,
        distance_scale=checkpoint.distance_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_transcript_residual_memory_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> TranscriptResidualMemoryRoundPredictor:
    spec = resolve_transcript_residual_memory_variant_spec(
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
    "TRANSCRIPT_RESIDUAL_MEMORY_ALIAS",
    "TRANSCRIPT_RESIDUAL_MEMORY_MODEL_CHOICE_LIST",
    "TRANSCRIPT_RESIDUAL_MEMORY_V1",
    "TRANSCRIPT_RESIDUAL_MEMORY_V2",
    "TRANSCRIPT_RESIDUAL_MEMORY_V3",
    "TRANSCRIPT_RESIDUAL_MEMORY_V4",
    "TRANSCRIPT_RESIDUAL_MEMORY_V5",
    "TRANSCRIPT_RESIDUAL_MEMORY_V6",
    "TRANSCRIPT_RESIDUAL_MEMORY_V7",
    "TRANSCRIPT_RESIDUAL_MEMORY_V8",
    "TranscriptResidualMemoryRoundPredictor",
    "_blend_with_residual",
    "is_transcript_residual_memory_model_name",
    "load_or_fit_named_transcript_residual_memory_predictor",
    "resolve_transcript_residual_memory_samples_per_round",
    "resolve_transcript_residual_memory_variant_spec",
]
