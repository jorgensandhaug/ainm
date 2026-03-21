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
from astar.student.predictor.round_heatmap_factor_residual import _round_heatmap_vector
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)
from astar.student.predictor.transcript_memory import (
    _load_or_build_synthetic_dataset,
    _load_target_tensor,
    _selected_replay_round_ids,
)
from astar.student.predictor.transcript_sequence_residual_memory import _blend_with_residual

ROUND_HEATMAP_PROTOTYPE_RESIDUAL_ALIAS = "round_heatmap_prototype_residual"
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1 = "round_heatmap_prototype_residual_v1"
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2 = "round_heatmap_prototype_residual_v2"
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3 = "round_heatmap_prototype_residual_v3"
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4 = "round_heatmap_prototype_residual_v4"
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_MODEL_NAMES = frozenset(
    {
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_ALIAS,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4,
    },
)
ROUND_HEATMAP_PROTOTYPE_RESIDUAL_MODEL_CHOICE_LIST = [
    ROUND_HEATMAP_PROTOTYPE_RESIDUAL_ALIAS,
    ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1,
    ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2,
    ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3,
    ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4,
]


class RoundHeatmapPrototypeResidualVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(ge=1)
    prototype_count: int = Field(ge=1)
    distance_scale: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


class RoundHeatmapPrototypeResidualCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    prototype_count: int = Field(ge=1)
    distance_scale: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    residual_shape: list[int]
    memory_relpath: str


def is_round_heatmap_prototype_residual_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in ROUND_HEATMAP_PROTOTYPE_RESIDUAL_MODEL_NAMES


def resolve_round_heatmap_prototype_residual_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == ROUND_HEATMAP_PROTOTYPE_RESIDUAL_ALIAS:
        return ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1
    if normalized in ROUND_HEATMAP_PROTOTYPE_RESIDUAL_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported round_heatmap_prototype_residual model: {model_name}")


def resolve_round_heatmap_prototype_residual_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> RoundHeatmapPrototypeResidualVariantSpec:
    resolved = resolve_round_heatmap_prototype_residual_model_name(model_name)
    default_samples = {
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1: 8,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2: 8,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3: 16,
        ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4: 16,
    }[resolved]
    effective_samples = default_samples if samples_per_round is None else samples_per_round
    if effective_samples != default_samples:
        raise ValueError(f"{resolved} fixes samples_per_round={default_samples}")
    if resolved == ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4:
        return RoundHeatmapPrototypeResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=16,
            prototype_count=12,
            distance_scale=1.5,
            correction_scale=1.0,
        )
    if resolved == ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3:
        return RoundHeatmapPrototypeResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            samples_per_round=16,
            prototype_count=12,
            distance_scale=1.5,
            correction_scale=1.0,
        )
    if resolved == ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2:
        return RoundHeatmapPrototypeResidualVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            samples_per_round=8,
            prototype_count=8,
            distance_scale=2.0,
            correction_scale=0.75,
        )
    return RoundHeatmapPrototypeResidualVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        samples_per_round=8,
        prototype_count=8,
        distance_scale=2.0,
        correction_scale=0.75,
    )


def resolve_round_heatmap_prototype_residual_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_round_heatmap_prototype_residual_variant_spec(
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


def _normalize_feature_matrix(x_matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    feature_mean = np.mean(x_matrix, axis=0, dtype=np.float64)
    feature_scale = np.std(x_matrix, axis=0, dtype=np.float64)
    feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
    normalized = (x_matrix - feature_mean[None, :]) / feature_scale[None, :]
    return normalized, feature_mean, feature_scale


def _run_kmeans(features: np.ndarray, *, k: int, max_iter: int = 20) -> tuple[np.ndarray, np.ndarray]:
    n = features.shape[0]
    if n == 0:
        raise ValueError("kmeans requires non-empty features")
    k_eff = min(k, n)
    centers = np.asarray(features[:k_eff], dtype=np.float64).copy()
    assignments = np.zeros(n, dtype=np.int64)
    for _ in range(max_iter):
        distances = np.linalg.norm(features[:, None, :] - centers[None, :, :], axis=2)
        new_assignments = np.argmin(distances, axis=1)
        if np.array_equal(new_assignments, assignments):
            break
        assignments = new_assignments
        for idx in range(k_eff):
            members = features[assignments == idx]
            if len(members) > 0:
                centers[idx] = np.mean(members, axis=0, dtype=np.float64)
    return centers, assignments


class RoundHeatmapPrototypeResidualRoundPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1
    base_predictor: SummaryBankRoundPredictor
    centers: np.ndarray
    residual_prototypes: np.ndarray
    residual_shape: tuple[int, ...]
    feature_mean: np.ndarray
    feature_scale: np.ndarray
    distance_scale: float = Field(gt=0.0)
    correction_scale: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def _predict_round_residual(self, context: LiveInferenceContext) -> np.ndarray:
        feature_vector = _round_heatmap_vector(context.evidence_bundle)
        normalized = (feature_vector - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.centers - normalized[None, :], axis=1)
        weights = np.exp(-distances / self.distance_scale)
        weights = weights / np.clip(np.sum(weights, dtype=np.float64), 1e-9, None)
        flat = np.tensordot(weights.astype(np.float64), self.residual_prototypes, axes=(0, 0))
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


def _fit_prototype_predictor(
    paths: WorkspacePaths,
    *,
    spec: RoundHeatmapPrototypeResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> RoundHeatmapPrototypeResidualRoundPredictor:
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
        x_rows.append(_round_heatmap_vector(round_evidence))
        y_rows.append(np.asarray(target_bundle - base_bundle_tensor, dtype=np.float32).reshape(-1))
    if not x_rows or not y_rows or residual_shape is None:
        raise ValueError("round_heatmap_prototype_residual produced no replay-backed training examples")
    x_matrix = np.asarray(x_rows, dtype=np.float64)
    normalized, feature_mean, feature_scale = _normalize_feature_matrix(x_matrix)
    y_matrix = np.asarray(y_rows, dtype=np.float64)
    centers, assignments = _run_kmeans(normalized, k=spec.prototype_count)
    residual_prototypes: list[np.ndarray] = []
    for idx in range(centers.shape[0]):
        members = y_matrix[assignments == idx]
        if len(members) == 0:
            residual_prototypes.append(np.zeros((y_matrix.shape[1],), dtype=np.float64))
        else:
            residual_prototypes.append(np.mean(members, axis=0, dtype=np.float64))
    return RoundHeatmapPrototypeResidualRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        centers=centers,
        residual_prototypes=np.stack(residual_prototypes, axis=0),
        residual_shape=residual_shape,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
        distance_scale=spec.distance_scale,
        correction_scale=spec.correction_scale,
        probability_floor=spec.probability_floor,
    )


def _save_checkpoint(
    predictor: RoundHeatmapPrototypeResidualRoundPredictor,
    model_dir: Path,
    *,
    spec: RoundHeatmapPrototypeResidualVariantSpec,
    policy_name: str,
    round_ids: Sequence[str],
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    memory_path = model_dir / "round_heatmap_prototype_residual.npz"
    np.savez_compressed(
        memory_path,
        centers=np.asarray(predictor.centers, dtype=np.float32),
        residual_prototypes=np.asarray(predictor.residual_prototypes, dtype=np.float32),
        feature_mean=np.asarray(predictor.feature_mean, dtype=np.float32),
        feature_scale=np.asarray(predictor.feature_scale, dtype=np.float32),
    )
    checkpoint = RoundHeatmapPrototypeResidualCheckpoint(
        name=predictor.name,
        base_model_name=spec.base_model_name,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=spec.samples_per_round,
        prototype_count=spec.prototype_count,
        distance_scale=spec.distance_scale,
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
) -> RoundHeatmapPrototypeResidualRoundPredictor:
    checkpoint = RoundHeatmapPrototypeResidualCheckpoint.model_validate_json(
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
    return RoundHeatmapPrototypeResidualRoundPredictor(
        name=checkpoint.name,
        base_predictor=base_predictor,
        centers=np.asarray(arrays["centers"], dtype=np.float64),
        residual_prototypes=np.asarray(arrays["residual_prototypes"], dtype=np.float64),
        residual_shape=tuple(int(v) for v in checkpoint.residual_shape),
        feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
        feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
        distance_scale=checkpoint.distance_scale,
        correction_scale=checkpoint.correction_scale,
        probability_floor=checkpoint.probability_floor,
    )


def load_or_fit_named_round_heatmap_prototype_residual_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> RoundHeatmapPrototypeResidualRoundPredictor:
    spec = resolve_round_heatmap_prototype_residual_variant_spec(
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
    predictor = _fit_prototype_predictor(
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
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_ALIAS",
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_MODEL_CHOICE_LIST",
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V1",
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V2",
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V3",
    "ROUND_HEATMAP_PROTOTYPE_RESIDUAL_V4",
    "_run_kmeans",
    "is_round_heatmap_prototype_residual_model_name",
    "load_or_fit_named_round_heatmap_prototype_residual_predictor",
    "resolve_round_heatmap_prototype_residual_samples_per_round",
    "resolve_round_heatmap_prototype_residual_variant_spec",
]
