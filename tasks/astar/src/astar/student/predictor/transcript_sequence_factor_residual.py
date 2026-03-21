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
from astar.student.predictor.transcript_sequence_residual_memory import (
    _blend_with_residual,
    _seed_sequence_vector,
)

TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_ALIAS = "transcript_sequence_factor_residual"
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1 = "transcript_sequence_factor_residual_v1"
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2 = "transcript_sequence_factor_residual_v2"
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3 = "transcript_sequence_factor_residual_v3"
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4 = "transcript_sequence_factor_residual_v4"
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_MODEL_NAMES = frozenset(
    {
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_ALIAS,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4,
    },
)
TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_MODEL_CHOICE_LIST = [
    TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_ALIAS,
    TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1,
    TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2,
    TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3,
    TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4,
]


class TranscriptSequenceFactorResidualVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    max_queries: int = Field(ge=1)
    rank: int = Field(ge=1)
    ridge_lambda: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class TranscriptSequenceFactorResidualCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    max_queries: int = Field(ge=1)
    rank: int = Field(ge=1)
    ridge_lambda: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    residual_shape: list[int]
    memory_relpath: str


def is_transcript_sequence_factor_residual_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_MODEL_NAMES


def resolve_transcript_sequence_factor_residual_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_ALIAS:
        return TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1
    if normalized in TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported transcript_sequence_factor_residual model: {model_name}")


def resolve_transcript_sequence_factor_residual_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> TranscriptSequenceFactorResidualVariantSpec:
    resolved = resolve_transcript_sequence_factor_residual_model_name(model_name)
    default_samples = {
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1: 8,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2: 8,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3: 16,
        TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4:
        return TranscriptSequenceFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            max_queries=8,
            rank=16,
            ridge_lambda=2.0,
            correction_scale=1.0,
        )
    if resolved == TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3:
        return TranscriptSequenceFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            max_queries=8,
            rank=16,
            ridge_lambda=2.0,
            correction_scale=1.0,
        )
    if resolved == TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2:
        return TranscriptSequenceFactorResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            max_queries=4,
            rank=8,
            ridge_lambda=1.0,
            correction_scale=0.75,
        )
    return TranscriptSequenceFactorResidualVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        max_queries=4,
        rank=8,
        ridge_lambda=1.0,
        correction_scale=0.75,
    )


def resolve_transcript_sequence_factor_residual_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_transcript_sequence_factor_residual_variant_spec(
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


def _ridge_weights(
    features: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_lambda: float,
) -> np.ndarray:
    xtx = features.T @ features
    reg = ridge_lambda * np.eye(xtx.shape[0], dtype=np.float64)
    return np.linalg.solve(xtx + reg, features.T @ targets)


class TranscriptSequenceFactorResidualRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1
    base_predictor: SummaryBankRoundPredictor
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    coeff_mean: np.ndarray
    basis: np.ndarray
    weight_matrix: np.ndarray
    residual_mean: np.ndarray
    residual_shape: tuple[int, ...]
    max_queries: int = Field(ge=1)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _predict_residual(
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
        normalized = (feature_vector - self.feature_mean) / self.feature_scale
        coeff = self.coeff_mean + (normalized @ self.weight_matrix)
        flat = self.residual_mean + (coeff @ self.basis)
        return flat.reshape(self.residual_shape)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            residual = self._predict_residual(context, seed_index=seed_index)
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            predictions_by_seed[seed_index] = _blend_with_residual(
                base_prediction,
                residual,
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
    spec: TranscriptSequenceFactorResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> TranscriptSequenceFactorResidualRoundPredictor:
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
        for seed_index in sorted(artifact.target_paths):
            target = _load_target_tensor(paths, artifact, seed_index=seed_index)
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float32)
            if residual_shape is None:
                residual_shape = tuple(int(v) for v in target.shape)
            if tuple(int(v) for v in target.shape) != residual_shape:
                continue
            if tuple(int(v) for v in base_prediction.shape) != residual_shape:
                continue
            x_rows.append(
                _seed_sequence_vector(
                    round_context,
                    round_evidence,
                    round_features,
                    artifact.observations,
                    seed_index=seed_index,
                    max_queries=spec.max_queries,
                )
            )
            y_rows.append(np.asarray(target - base_prediction, dtype=np.float32).reshape(-1))
    if not x_rows or not y_rows or residual_shape is None:
        raise ValueError("transcript_sequence_factor_residual produced no replay-backed training examples")
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
    return TranscriptSequenceFactorResidualRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
        coeff_mean=coeff_mean,
        basis=basis,
        weight_matrix=weight_matrix,
        residual_mean=residual_mean,
        residual_shape=residual_shape,
        max_queries=spec.max_queries,
        correction_scale=spec.correction_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: TranscriptSequenceFactorResidualRoundPredictor,
    model_dir: Path,
    *,
    spec: TranscriptSequenceFactorResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "factor_residual.npz"
    np.savez_compressed(
        memory_path,
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float32),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float32),
        coeff_mean=np.asarray(predictor.coeff_mean, dtype=np.float32),
        basis=np.asarray(predictor.basis, dtype=np.float32),
        weight_matrix=np.asarray(predictor.weight_matrix, dtype=np.float32),
        residual_mean=np.asarray(predictor.residual_mean, dtype=np.float32),
    )
    checkpoint = TranscriptSequenceFactorResidualCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        max_queries=spec.max_queries,
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
) -> TranscriptSequenceFactorResidualRoundPredictor:
    checkpoint = TranscriptSequenceFactorResidualCheckpoint.model_validate_json(
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
    return TranscriptSequenceFactorResidualRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
        feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
        coeff_mean=np.asarray(arrays["coeff_mean"], dtype=np.float64),
        basis=np.asarray(arrays["basis"], dtype=np.float64),
        weight_matrix=np.asarray(arrays["weight_matrix"], dtype=np.float64),
        residual_mean=np.asarray(arrays["residual_mean"], dtype=np.float64),
        residual_shape=tuple(int(v) for v in checkpoint.residual_shape),
        max_queries=checkpoint.max_queries,
        correction_scale=checkpoint.correction_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_transcript_sequence_factor_residual_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> TranscriptSequenceFactorResidualRoundPredictor:
    spec = resolve_transcript_sequence_factor_residual_variant_spec(
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
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_ALIAS",
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_MODEL_CHOICE_LIST",
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V1",
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V2",
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V3",
    "TRANSCRIPT_SEQUENCE_FACTOR_RESIDUAL_V4",
    "_ridge_weights",
    "is_transcript_sequence_factor_residual_model_name",
    "load_or_fit_named_transcript_sequence_factor_residual_predictor",
    "resolve_transcript_sequence_factor_residual_samples_per_round",
    "resolve_transcript_sequence_factor_residual_variant_spec",
]
