from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState

SUMMARY_ENCODER_V1 = "summary_v1"
SUMMARY_ENCODER_SPATIAL_V2 = "summary_spatial_v2"
SUMMARY_ENCODER_SEMANTIC_V3 = "summary_semantic_v3"
SUMMARY_ENCODER_TEMPORAL_V4 = "summary_temporal_v4"
SUMMARY_HEAD_KNN = "knn"
SUMMARY_HEAD_RIDGE = "ridge"
SUMMARY_HEADS = frozenset({SUMMARY_HEAD_KNN, SUMMARY_HEAD_RIDGE})
SUMMARY_ENCODERS = frozenset(
    {
        SUMMARY_ENCODER_V1,
        SUMMARY_ENCODER_SPATIAL_V2,
        SUMMARY_ENCODER_SEMANTIC_V3,
        SUMMARY_ENCODER_TEMPORAL_V4,
    },
)


def _optional_float(value: float | None) -> float:
    return 0.0 if value is None else float(value)


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


def _resolve_saved_path(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.exists():
        return candidate
    if not candidate.is_absolute():
        cwd_relative = Path.cwd() / candidate
        if cwd_relative.exists():
            return cwd_relative.resolve()
    parts = candidate.parts
    if "data" in parts:
        data_index = parts.index("data")
        remapped = Path.cwd().joinpath(*parts[data_index:])
        if remapped.exists():
            return remapped.resolve()
    msg = f"saved artifact path not found: {candidate}"
    raise FileNotFoundError(msg)


def _seed_summary_components(seed: object) -> list[float]:
    components = [float(seed.query_count)]
    components.extend(seed.observed_class_frequencies.astype(np.float64).tolist())
    components.append(_optional_float(seed.mean_population))
    components.append(_optional_float(seed.mean_food))
    components.append(_optional_float(seed.mean_wealth))
    components.append(_optional_float(seed.mean_defense))
    return components


def _pooled_bounds(length: int, pool_size: int) -> list[tuple[int, int]]:
    bounds: list[tuple[int, int]] = []
    for chunk in np.array_split(np.arange(length, dtype=np.int64), pool_size):
        if chunk.size == 0:
            bounds.append((0, 0))
        else:
            bounds.append((int(chunk[0]), int(chunk[-1]) + 1))
    return bounds


def _pooled_mean_features(values: np.ndarray, *, pool_size: int) -> list[float]:
    y_bounds = _pooled_bounds(values.shape[0], pool_size)
    x_bounds = _pooled_bounds(values.shape[1], pool_size)
    features: list[float] = []
    for y0, y1 in y_bounds:
        for x0, x1 in x_bounds:
            if y0 >= y1 or x0 >= x1:
                features.append(0.0)
                continue
            features.append(float(np.mean(values[y0:y1, x0:x1], dtype=np.float64)))
    return features


def _pooled_class_frequency_features(
    count_tensor: np.ndarray,
    *,
    class_id: int,
    pool_size: int,
) -> list[float]:
    totals = np.sum(count_tensor, axis=-1, dtype=np.float64)
    y_bounds = _pooled_bounds(count_tensor.shape[0], pool_size)
    x_bounds = _pooled_bounds(count_tensor.shape[1], pool_size)
    features: list[float] = []
    for y0, y1 in y_bounds:
        for x0, x1 in x_bounds:
            if y0 >= y1 or x0 >= x1:
                features.append(0.0)
                continue
            denominator = float(np.sum(totals[y0:y1, x0:x1], dtype=np.float64))
            if denominator <= 0.0:
                features.append(0.0)
                continue
            numerator = float(np.sum(count_tensor[y0:y1, x0:x1, class_id], dtype=np.float64))
            features.append(numerator / denominator)
    return features


def _summary_vector_v1(evidence: RoundEvidenceBundle) -> np.ndarray:
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        components.extend(_seed_summary_components(seed))
    return np.asarray(components, dtype=np.float64)


def _summary_vector_spatial_v2(evidence: RoundEvidenceBundle) -> np.ndarray:
    pooled_class_ids = (1, 2, 3, 4)
    pool_size = 4
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        components.extend(_seed_summary_components(seed))
        query_denom = max(float(seed.query_count), 1.0)
        coverage = np.asarray(seed.coverage_counts, dtype=np.float64)
        count_tensor = np.asarray(seed.observed_class_count_tensor, dtype=np.float64)
        observed_total = np.sum(count_tensor, axis=-1, dtype=np.float64)
        components.append(float(seed.repeated_window_groups))
        components.append(float(seed.repeated_window_groups) / query_denom)
        components.append(float(np.mean(coverage > 0.0)))
        components.extend(_pooled_mean_features(coverage / query_denom, pool_size=pool_size))
        components.extend(_pooled_mean_features(observed_total / query_denom, pool_size=pool_size))
        for class_id in pooled_class_ids:
            components.extend(
                _pooled_class_frequency_features(
                    count_tensor,
                    class_id=class_id,
                    pool_size=pool_size,
                ),
            )
    return np.asarray(components, dtype=np.float64)


def _masked_frequency_summary(
    count_tensor: np.ndarray,
    mask: np.ndarray,
) -> list[float]:
    if not np.any(mask):
        return [0.0] * 6
    observed_mask = np.sum(count_tensor, axis=-1, dtype=np.float64) > 0.0
    masked_counts = np.sum(count_tensor[mask], axis=0, dtype=np.float64)
    total = float(np.sum(masked_counts, dtype=np.float64))
    coverage_fraction = float(np.mean(observed_mask[mask]))
    if total <= 0.0:
        return [coverage_fraction, 0.0, 0.0, 0.0, 0.0, 0.0]
    built = float((masked_counts[1] + masked_counts[2] + masked_counts[3]) / total)
    return [
        coverage_fraction,
        built,
        float(masked_counts[1] / total),
        float(masked_counts[2] / total),
        float(masked_counts[3] / total),
        float(masked_counts[4] / total),
    ]


def _summary_vector_semantic_v3(
    evidence: RoundEvidenceBundle,
    *,
    geometry_bundle: RoundFeatureBundle | None,
) -> np.ndarray:
    if geometry_bundle is None:
        raise ValueError("summary_semantic_v3 requires geometry features")
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        seed_features = geometry_bundle.per_seed[seed_index]
        count_tensor = np.asarray(seed.observed_class_count_tensor, dtype=np.float64)
        buildable = seed_features.feature("buildable") > 0.5
        coast = seed_features.feature("coast") > 0.5
        inland = buildable & ~coast
        frontier = seed_features.feature("frontier_score") >= 0.5
        maritime = seed_features.feature("maritime_access") >= 0.5
        components.extend(_seed_summary_components(seed))
        components.extend(
            [
                float(seed.repeated_window_groups),
                float(seed.repeated_window_groups) / max(float(seed.query_count), 1.0),
                float(np.mean(np.sum(count_tensor, axis=-1, dtype=np.float64) > 0.0)),
                float(seed.mean_settlement_count),
                float(seed.alive_fraction),
                float(seed.port_fraction),
                float(seed.owner_count),
                float(seed.largest_owner_share),
                float(seed.owner_hhi),
            ],
        )
        for mask in (buildable, coast, inland, frontier, maritime):
            components.extend(_masked_frequency_summary(count_tensor, mask))
    return np.asarray(components, dtype=np.float64)


def _summary_vector_temporal_v4(
    evidence: RoundEvidenceBundle,
    *,
    geometry_bundle: RoundFeatureBundle | None,
    observations: tuple[object, ...] | list[object] | None,
    round_detail: object | None,
) -> np.ndarray:
    if geometry_bundle is None or round_detail is None or observations is None:
        raise ValueError("summary_temporal_v4 requires geometry, round_detail, and observations")
    ordered = tuple(observations)
    split_index = max(1, len(ordered) // 2) if ordered else 0
    first_half = ordered[:split_index]
    second_half = ordered[split_index:]
    first_evidence = build_round_evidence_from_observations(round_detail, first_half)
    second_evidence = build_round_evidence_from_observations(round_detail, second_half)
    full_semantic = _summary_vector_semantic_v3(
        evidence,
        geometry_bundle=geometry_bundle,
    )
    first_semantic = _summary_vector_semantic_v3(
        first_evidence,
        geometry_bundle=geometry_bundle,
    )
    second_semantic = _summary_vector_semantic_v3(
        second_evidence,
        geometry_bundle=geometry_bundle,
    )
    return np.concatenate(
        [
            full_semantic,
            first_semantic,
            second_semantic,
            second_semantic - first_semantic,
        ],
        axis=0,
    ).astype(np.float64)


def _summary_vector_from_evidence(
    evidence: RoundEvidenceBundle,
    *,
    summary_encoder: str = SUMMARY_ENCODER_V1,
    geometry_bundle: RoundFeatureBundle | None = None,
    observations: tuple[object, ...] | list[object] | None = None,
    round_detail: object | None = None,
) -> np.ndarray:
    if summary_encoder == SUMMARY_ENCODER_V1:
        return _summary_vector_v1(evidence)
    if summary_encoder == SUMMARY_ENCODER_SPATIAL_V2:
        return _summary_vector_spatial_v2(evidence)
    if summary_encoder == SUMMARY_ENCODER_SEMANTIC_V3:
        return _summary_vector_semantic_v3(
            evidence,
            geometry_bundle=geometry_bundle,
        )
    if summary_encoder == SUMMARY_ENCODER_TEMPORAL_V4:
        return _summary_vector_temporal_v4(
            evidence,
            geometry_bundle=geometry_bundle,
            observations=observations,
            round_detail=round_detail,
        )
    msg = f"unsupported summary encoder: {summary_encoder}"
    raise ValueError(msg)


def _summary_vector_from_artifact(
    path: Path,
    *,
    paths: WorkspacePaths | None = None,
    summary_encoder: str = SUMMARY_ENCODER_V1,
) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path, paths=paths)
    if paths is None:
        raise ValueError("summary-bank artifact loading requires workspace paths")
    round_detail = read_round_record(paths, artifact.round_id).round
    geometry_bundle = compute_round_features(round_detail)
    evidence = build_round_evidence_from_observations(
        round_detail,
        artifact.observations,
    )
    return (
        _summary_vector_from_evidence(
            evidence,
            summary_encoder=summary_encoder,
            geometry_bundle=geometry_bundle,
            observations=artifact.observations,
            round_detail=round_detail,
        ),
        artifact.regime_vector,
    )


class SummaryBankStudentCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    teacher_checkpoint_path: str
    k_neighbors: int = Field(ge=1)
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    summary_encoder: str = SUMMARY_ENCODER_V1
    normalize_summary: bool = False
    inference_head: str = SUMMARY_HEAD_KNN
    ridge_alpha: float = Field(default=1.0, gt=0.0)


class SummaryBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "summary_bank_student_v1"
    dataset_name: str = "synthetic_live_v1"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    summary_encoder: str = SUMMARY_ENCODER_V1
    normalize_summary: bool = False
    inference_head: str = SUMMARY_HEAD_KNN
    ridge_alpha: float = Field(default=1.0, gt=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    teacher: HazardTeacher

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: HazardTeacher,
        *,
        k_neighbors: int = 5,
        summary_encoder: str = SUMMARY_ENCODER_V1,
        normalize_summary: bool = False,
        inference_head: str = SUMMARY_HEAD_KNN,
        ridge_alpha: float = 1.0,
    ) -> SummaryBankStudent:
        if summary_encoder not in SUMMARY_ENCODERS:
            raise ValueError(f"unsupported summary encoder: {summary_encoder}")
        if inference_head not in SUMMARY_HEADS:
            raise ValueError(f"unsupported inference head: {inference_head}")
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        workspace_paths = WorkspacePaths.from_root(dataset.dataset_dir.parents[3])
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for path_value in index_table["episode_path"].to_list():
            summary_vector, regime_vector = _summary_vector_from_artifact(
                Path(str(path_value)),
                paths=workspace_paths,
                summary_encoder=summary_encoder,
            )
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any summary vectors")
        summary_stack = np.stack(summary_vectors, axis=0)
        regime_stack = np.stack(regime_vectors, axis=0)
        feature_mean = np.zeros(summary_stack.shape[1], dtype=np.float64)
        feature_scale = np.ones(summary_stack.shape[1], dtype=np.float64)
        if normalize_summary:
            feature_mean = np.mean(summary_stack, axis=0, dtype=np.float64)
            feature_scale = np.std(summary_stack, axis=0, dtype=np.float64)
            feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
            summary_stack = (summary_stack - feature_mean[None, :]) / feature_scale[None, :]
        regime_intercept = np.mean(regime_stack, axis=0, dtype=np.float64)
        regime_weights = np.zeros(
            (summary_stack.shape[1], regime_stack.shape[1]),
            dtype=np.float64,
        )
        if inference_head == SUMMARY_HEAD_RIDGE:
            regime_intercept, regime_weights = _fit_linear_map(
                summary_stack,
                regime_stack,
                ridge_alpha=ridge_alpha,
            )
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_stack,
            regime_vectors=regime_stack,
            k_neighbors=k_neighbors,
            summary_encoder=summary_encoder,
            normalize_summary=normalize_summary,
            inference_head=inference_head,
            ridge_alpha=ridge_alpha,
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            regime_intercept=regime_intercept,
            regime_weights=regime_weights,
            teacher=teacher,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        teacher_checkpoint_path: Path,
    ) -> SummaryBankStudentCheckpoint:
        return SummaryBankStudentCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            k_neighbors=self.k_neighbors,
            sample_count=int(self.summary_vectors.shape[0]),
            summary_dim=int(self.summary_vectors.shape[1]),
            regime_dim=int(self.regime_vectors.shape[1]),
            summary_encoder=self.summary_encoder,
            normalize_summary=self.normalize_summary,
            inference_head=self.inference_head,
            ridge_alpha=self.ridge_alpha,
        )

    def save_checkpoint(self, checkpoint_dir: Path, teacher_checkpoint_path: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "bank.npz"
        json_path = checkpoint_dir / "summary_bank_student.json"
        np.savez_compressed(
            npz_path,
            summary_vectors=self.summary_vectors,
            regime_vectors=self.regime_vectors,
            feature_mean=self.feature_mean,
            feature_scale=self.feature_scale,
            regime_intercept=self.regime_intercept,
            regime_weights=self.regime_weights,
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(npz_path, teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SummaryBankStudent:
        checkpoint = SummaryBankStudentCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        npz_path = _resolve_saved_path(checkpoint.checkpoint_npz_path)
        teacher_checkpoint_path = _resolve_saved_path(checkpoint.teacher_checkpoint_path)
        arrays = np.load(npz_path)
        summary_vectors = np.asarray(arrays["summary_vectors"], dtype=np.float64)
        feature_mean = (
            np.asarray(arrays["feature_mean"], dtype=np.float64)
            if "feature_mean" in arrays.files
            else np.zeros(summary_vectors.shape[1], dtype=np.float64)
        )
        feature_scale = (
            np.asarray(arrays["feature_scale"], dtype=np.float64)
            if "feature_scale" in arrays.files
            else np.ones(summary_vectors.shape[1], dtype=np.float64)
        )
        regime_vectors = np.asarray(arrays["regime_vectors"], dtype=np.float64)
        regime_dim = regime_vectors.shape[1]
        regime_intercept = (
            np.asarray(arrays["regime_intercept"], dtype=np.float64)
            if "regime_intercept" in arrays.files
            else np.mean(regime_vectors, axis=0, dtype=np.float64)
        )
        regime_weights = (
            np.asarray(arrays["regime_weights"], dtype=np.float64)
            if "regime_weights" in arrays.files
            else np.zeros((summary_vectors.shape[1], regime_dim), dtype=np.float64)
        )
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            summary_vectors=summary_vectors,
            regime_vectors=regime_vectors,
            k_neighbors=checkpoint.k_neighbors,
            summary_encoder=checkpoint.summary_encoder,
            normalize_summary=checkpoint.normalize_summary,
            inference_head=checkpoint.inference_head,
            ridge_alpha=checkpoint.ridge_alpha,
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            regime_intercept=regime_intercept,
            regime_weights=regime_weights,
            teacher=HazardTeacher.load_checkpoint(teacher_checkpoint_path),
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = _summary_vector_from_evidence(
            context.evidence_bundle,
            summary_encoder=self.summary_encoder,
            geometry_bundle=context.geometry_bundle,
            observations=context.observations,
            round_detail=context.round_context.to_round_detail(),
        )
        if self.normalize_summary:
            query_vector = (query_vector - self.feature_mean) / self.feature_scale
        if self.inference_head == SUMMARY_HEAD_RIDGE:
            mean = np.asarray(
                self.regime_intercept + (query_vector @ self.regime_weights),
                dtype=np.float64,
            )
            return RegimePosteriorState(
                mean=mean,
                particles=(mean,),
                weights=np.asarray([1.0], dtype=np.float64),
            )
        distances = np.linalg.norm(self.summary_vectors - query_vector[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        mean = np.tensordot(weights, self.regime_vectors[order], axes=(0, 0))
        particles = tuple(self.regime_vectors[index] for index in order)
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )
