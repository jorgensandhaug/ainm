from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.greybox_regime import (
    DEFAULT_BLUR_SIGMAS,
    DEFAULT_BUDGET_PREFIXES,
    _collect_training_episodes,
    _derive_transcript_features_from_stats,
    _derived_from_evidence,
    _exact_cell_blend,
    _load_training_rows,
    _regime_input_vector,
    _round_ids_with_analyses_and_replays,
    _standardize,
    _stats_from_observations,
    _teacher_seed_adapter,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


def _kmeans(
    matrix: np.ndarray,
    *,
    cluster_count: int,
    iterations: int = 32,
) -> tuple[np.ndarray, np.ndarray]:
    if matrix.ndim != 2:
        raise ValueError("kmeans matrix must be rank-2")
    if matrix.shape[0] == 0:
        raise ValueError("kmeans requires at least one row")
    resolved_cluster_count = max(1, min(cluster_count, matrix.shape[0]))
    centers = np.empty((resolved_cluster_count, matrix.shape[1]), dtype=np.float64)
    first_index = int(np.argmax(np.linalg.norm(matrix, axis=1)))
    centers[0] = matrix[first_index]
    min_distance = np.linalg.norm(matrix - centers[0][None, :], axis=1)
    for center_index in range(1, resolved_cluster_count):
        next_index = int(np.argmax(min_distance))
        centers[center_index] = matrix[next_index]
        min_distance = np.minimum(
            min_distance,
            np.linalg.norm(matrix - centers[center_index][None, :], axis=1),
        )

    labels = np.zeros(matrix.shape[0], dtype=np.int64)
    for _ in range(iterations):
        distances = np.linalg.norm(matrix[:, None, :] - centers[None, :, :], axis=2)
        next_labels = np.argmin(distances, axis=1)
        if np.array_equal(next_labels, labels):
            break
        labels = next_labels
        for cluster_index in range(resolved_cluster_count):
            mask = labels == cluster_index
            if not np.any(mask):
                farthest_index = int(np.argmax(np.min(distances, axis=1)))
                centers[cluster_index] = matrix[farthest_index]
                continue
            centers[cluster_index] = np.mean(matrix[mask], axis=0)
    return labels.astype(np.int64), np.asarray(centers, dtype=np.float64)


class GreyboxHazardMixturePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_mixture_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    cluster_count: int = Field(default=3, ge=1)
    prior_blend: float = Field(default=0.45, ge=0.0, le=1.0)
    distance_temperature: float = Field(default=2.5, gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    cluster_feature_centroids: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    cluster_feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    coefficient_prototypes: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    training_example_count: int = Field(default=0, ge=0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        cluster_count: int = 3,
        prior_blend: float = 0.45,
        distance_temperature: float = 2.5,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_mixture_v01",
    ) -> GreyboxHazardMixturePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        teacher, manifold_payload = _collect_training_episodes(
            paths,
            selected_round_ids=selected_round_ids,
            model_name=model_name,
        )
        coefficient_mean = np.asarray(manifold_payload["coefficient_mean"], dtype=np.float64)
        coefficient_basis = np.asarray(manifold_payload["coefficient_basis"], dtype=np.float64)
        round_coefficients: list[np.ndarray] = []
        for round_id in selected_round_ids:
            coords = np.asarray(manifold_payload["coords_by_round"][round_id], dtype=np.float64)
            round_coefficients.append(coefficient_mean + (coords @ coefficient_basis))
        coefficient_matrix = np.stack(round_coefficients, axis=0)
        round_labels, _ = _kmeans(coefficient_matrix, cluster_count=cluster_count)
        coefficient_prototypes = np.stack(
            [
                np.mean(coefficient_matrix[round_labels == cluster_index], axis=0)
                for cluster_index in range(int(np.max(round_labels)) + 1)
            ],
            axis=0,
        )
        label_by_round = {
            round_id: int(label)
            for round_id, label in zip(selected_round_ids, round_labels, strict=True)
        }

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        feature_vectors: list[np.ndarray] = []
        feature_targets: list[int] = []
        round_cache: dict[str, tuple[RoundDetail, RoundFeatureBundle, PredictionBundle]] = {}
        for row in rows:
            round_id = str(row["round_id"])
            cached = round_cache.get(round_id)
            if cached is None:
                round_detail = read_round_record(paths, round_id).round
                features = compute_round_features(round_detail)
                prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
                cached = (round_detail, features, prior_bundle)
                round_cache[round_id] = cached
            round_detail, features, prior_bundle = cached
            artifact = load_synthetic_episode(
                Path(str(row["episode_path"])),
                dataset_dir=dataset_dir,
                workspace_root=paths.root,
            )
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in budget_prefixes})
            cluster_label = label_by_round[round_id]
            for budget in budget_values:
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    prior_bundle,
                    _stats_from_observations(round_detail, full_observations[:budget]),
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                feature_vectors.append(np.asarray(_regime_input_vector(derived), dtype=np.float64))
                feature_targets.append(cluster_label)

        feature_matrix = np.stack(feature_vectors, axis=0)
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        resolved_cluster_count = int(np.max(round_labels)) + 1
        feature_targets_array = np.asarray(feature_targets, dtype=np.int64)
        cluster_feature_centroids = np.stack(
            [
                np.mean(standardized[feature_targets_array == cluster_index], axis=0)
                for cluster_index in range(resolved_cluster_count)
            ],
            axis=0,
        )
        cluster_feature_scales = np.std(cluster_feature_centroids, axis=0)
        cluster_feature_scales = np.where(cluster_feature_scales > 1e-6, cluster_feature_scales, 1.0)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            cluster_count=resolved_cluster_count,
            prior_blend=prior_blend,
            distance_temperature=distance_temperature,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            cluster_feature_centroids=np.asarray(cluster_feature_centroids, dtype=np.float64),
            cluster_feature_scales=np.asarray(cluster_feature_scales, dtype=np.float64),
            coefficient_prototypes=np.asarray(coefficient_prototypes, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        centroid_deltas = (self.cluster_feature_centroids - standardized[None, :]) / self.cluster_feature_scales[None, :]
        centroid_distances = np.sum(centroid_deltas**2, axis=1)
        logits = -self.distance_temperature * centroid_distances
        logits = logits - float(np.max(logits))
        weights = np.exp(logits)
        weights = weights / np.maximum(np.sum(weights), 1e-6)
        coefficient_vector = np.tensordot(weights, self.coefficient_prototypes, axes=(0, 0))

        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            teacher_prediction = self.teacher._decode_terminal_tensor(
                _teacher_seed_adapter(round_detail, seed_index),
                coefficient_vector,
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (
                ((1.0 - self.prior_blend) * teacher_prediction) + (self.prior_blend * prior)
                if self.prior_blend > 0.0
                else np.asarray(teacher_prediction, dtype=np.float64)
            )
            prediction = _exact_cell_blend(
                np.asarray(prediction, dtype=np.float64),
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
                beta_min=self.beta_min,
                beta_scale=self.beta_scale,
            )
            predictions_by_seed[seed_index] = apply_probability_floor(
                np.asarray(prediction, dtype=np.float64),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, context.geometry_bundle)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            prior_bundle,
            _stats_from_observations(round_detail, context.observations),
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(round_detail, context.geometry_bundle, derived)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(round_detail, features, derived)


__all__ = ["GreyboxHazardMixturePredictor"]
