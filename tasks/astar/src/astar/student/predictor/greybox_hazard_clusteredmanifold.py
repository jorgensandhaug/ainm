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
from astar.student.predictor.greybox_hazard_mixture import _kmeans
from astar.student.predictor.greybox_regime import (
    DEFAULT_BLUR_SIGMAS,
    DEFAULT_BUDGET_PREFIXES,
    _collect_training_episodes,
    _derive_transcript_features_from_stats,
    _derived_from_evidence,
    _exact_cell_blend,
    _fit_linear_map,
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


def _factorize_cluster(
    coefficient_matrix: np.ndarray,
    *,
    max_rank: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    cluster_mean = np.mean(coefficient_matrix, axis=0)
    if coefficient_matrix.shape[0] <= 1:
        empty = np.zeros(0, dtype=np.float64)
        return (
            np.asarray(cluster_mean, dtype=np.float64),
            np.zeros((0, coefficient_matrix.shape[1]), dtype=np.float64),
            np.zeros((coefficient_matrix.shape[0], 0), dtype=np.float64),
            empty,
            empty,
        )
    centered = coefficient_matrix - cluster_mean[None, :]
    _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
    effective_rank = max(1, min(max_rank, vt_matrix.shape[0], coefficient_matrix.shape[0] - 1))
    basis = np.asarray(vt_matrix[:effective_rank], dtype=np.float64)
    coordinates = np.asarray(centered @ basis.T, dtype=np.float64)
    return (
        np.asarray(cluster_mean, dtype=np.float64),
        basis,
        coordinates,
        np.min(coordinates, axis=0),
        np.max(coordinates, axis=0),
    )


class GreyboxHazardClusteredManifoldPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_clusteredmanifold_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    cluster_count: int = Field(default=2, ge=1)
    cluster_rank: int = Field(default=1, ge=0)
    ridge_lambda: float = Field(default=4.0, ge=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    distance_temperature: float = Field(default=2.5, gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    cluster_feature_centroids: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    cluster_feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    cluster_coefficient_means: tuple[np.ndarray, ...] = ()
    cluster_coefficient_bases: tuple[np.ndarray, ...] = ()
    cluster_coord_lows: tuple[np.ndarray, ...] = ()
    cluster_coord_highs: tuple[np.ndarray, ...] = ()
    cluster_coord_intercepts: tuple[np.ndarray, ...] = ()
    cluster_coord_weights: tuple[np.ndarray, ...] = ()
    training_example_count: int = Field(default=0, ge=0)

    def _standardized_feature_vector(
        self,
        derived: object,
    ) -> np.ndarray:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        return np.asarray((feature_vector - self.feature_mean) / self.feature_scale, dtype=np.float64)

    def _cluster_logits_from_standardized(
        self,
        standardized: np.ndarray,
    ) -> np.ndarray:
        centroid_deltas = (
            self.cluster_feature_centroids - standardized[None, :]
        ) / self.cluster_feature_scales[None, :]
        return np.asarray(
            -self.distance_temperature * np.sum(centroid_deltas**2, axis=1),
            dtype=np.float64,
        )

    def _coefficient_vector_for_cluster(
        self,
        cluster_index: int,
        standardized: np.ndarray,
    ) -> np.ndarray:
        cluster_basis = np.asarray(self.cluster_coefficient_bases[cluster_index], dtype=np.float64)
        if cluster_basis.shape[0] <= 0:
            return np.asarray(self.cluster_coefficient_means[cluster_index], dtype=np.float64)
        coords = np.asarray(
            self.cluster_coord_intercepts[cluster_index]
            + standardized @ self.cluster_coord_weights[cluster_index],
            dtype=np.float64,
        )
        coords = np.clip(
            coords,
            self.cluster_coord_lows[cluster_index],
            self.cluster_coord_highs[cluster_index],
        )
        return np.asarray(
            self.cluster_coefficient_means[cluster_index] + (coords @ cluster_basis),
            dtype=np.float64,
        )

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        cluster_count: int = 2,
        cluster_rank: int = 1,
        ridge_lambda: float = 4.0,
        prior_blend: float = 0.35,
        distance_temperature: float = 2.5,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_clusteredmanifold_v01",
    ) -> GreyboxHazardClusteredManifoldPredictor:
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
        standardized_coefficients, _, _ = _standardize(coefficient_matrix)
        round_labels, _ = _kmeans(standardized_coefficients, cluster_count=cluster_count)
        resolved_cluster_count = int(np.max(round_labels)) + 1

        cluster_means: list[np.ndarray] = []
        cluster_bases: list[np.ndarray] = []
        cluster_coord_lows: list[np.ndarray] = []
        cluster_coord_highs: list[np.ndarray] = []
        coords_by_round: dict[str, np.ndarray] = {}
        label_by_round: dict[str, int] = {}
        for cluster_index in range(resolved_cluster_count):
            mask = round_labels == cluster_index
            cluster_round_ids = [round_id for round_id, keep in zip(selected_round_ids, mask, strict=True) if keep]
            (
                cluster_mean,
                cluster_basis,
                cluster_coordinates,
                cluster_low,
                cluster_high,
            ) = _factorize_cluster(
                coefficient_matrix[mask],
                max_rank=cluster_rank,
            )
            cluster_means.append(np.asarray(cluster_mean, dtype=np.float64))
            cluster_bases.append(np.asarray(cluster_basis, dtype=np.float64))
            cluster_coord_lows.append(np.asarray(cluster_low, dtype=np.float64))
            cluster_coord_highs.append(np.asarray(cluster_high, dtype=np.float64))
            for round_id, coords in zip(cluster_round_ids, cluster_coordinates, strict=True):
                coords_by_round[round_id] = np.asarray(coords, dtype=np.float64)
                label_by_round[round_id] = cluster_index

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        feature_vectors: list[np.ndarray] = []
        feature_targets: list[int] = []
        coord_targets_by_cluster: dict[int, list[np.ndarray]] = {
            cluster_index: []
            for cluster_index in range(resolved_cluster_count)
        }
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
            cluster_coords = np.asarray(coords_by_round[round_id], dtype=np.float64)
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
                coord_targets_by_cluster[cluster_label].append(cluster_coords)

        feature_matrix = np.stack(feature_vectors, axis=0)
        standardized_features, feature_mean, feature_scale = _standardize(feature_matrix)
        feature_targets_array = np.asarray(feature_targets, dtype=np.int64)
        cluster_feature_centroids = np.stack(
            [
                np.mean(standardized_features[feature_targets_array == cluster_index], axis=0)
                for cluster_index in range(resolved_cluster_count)
            ],
            axis=0,
        )
        cluster_feature_scales = np.std(cluster_feature_centroids, axis=0)
        cluster_feature_scales = np.where(cluster_feature_scales > 1e-6, cluster_feature_scales, 1.0)

        cluster_coord_intercepts: list[np.ndarray] = []
        cluster_coord_weights: list[np.ndarray] = []
        feature_dim = int(standardized_features.shape[1])
        for cluster_index in range(resolved_cluster_count):
            cluster_rank_value = int(cluster_bases[cluster_index].shape[0])
            if cluster_rank_value <= 0:
                cluster_coord_intercepts.append(np.zeros(0, dtype=np.float64))
                cluster_coord_weights.append(np.zeros((feature_dim, 0), dtype=np.float64))
                continue
            mask = feature_targets_array == cluster_index
            intercept, weights = _fit_linear_map(
                standardized_features[mask],
                np.stack(coord_targets_by_cluster[cluster_index], axis=0),
                ridge_alpha=max(ridge_lambda, 1e-3),
            )
            cluster_coord_intercepts.append(np.asarray(intercept, dtype=np.float64))
            cluster_coord_weights.append(np.asarray(weights, dtype=np.float64))

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            cluster_count=resolved_cluster_count,
            cluster_rank=cluster_rank,
            ridge_lambda=ridge_lambda,
            prior_blend=prior_blend,
            distance_temperature=distance_temperature,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            cluster_feature_centroids=np.asarray(cluster_feature_centroids, dtype=np.float64),
            cluster_feature_scales=np.asarray(cluster_feature_scales, dtype=np.float64),
            cluster_coefficient_means=tuple(np.asarray(item, dtype=np.float64) for item in cluster_means),
            cluster_coefficient_bases=tuple(np.asarray(item, dtype=np.float64) for item in cluster_bases),
            cluster_coord_lows=tuple(np.asarray(item, dtype=np.float64) for item in cluster_coord_lows),
            cluster_coord_highs=tuple(np.asarray(item, dtype=np.float64) for item in cluster_coord_highs),
            cluster_coord_intercepts=tuple(np.asarray(item, dtype=np.float64) for item in cluster_coord_intercepts),
            cluster_coord_weights=tuple(np.asarray(item, dtype=np.float64) for item in cluster_coord_weights),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        standardized = self._standardized_feature_vector(derived)
        logits = self._cluster_logits_from_standardized(standardized)
        logits = logits - float(np.max(logits))
        cluster_weights = np.exp(logits)
        cluster_weights = cluster_weights / np.maximum(np.sum(cluster_weights), 1e-6)

        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            cluster_predictions: list[np.ndarray] = []
            for cluster_index in range(self.cluster_count):
                coefficient_vector = self._coefficient_vector_for_cluster(cluster_index, standardized)
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
                cluster_predictions.append(np.asarray(prediction, dtype=np.float64))
            mixture_prediction = np.tensordot(
                cluster_weights,
                np.stack(cluster_predictions, axis=0),
                axes=(0, 0),
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            conditioned = _exact_cell_blend(
                np.asarray(mixture_prediction, dtype=np.float64),
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
                beta_min=self.beta_min,
                beta_scale=self.beta_scale,
            )
            predictions_by_seed[seed_index] = apply_probability_floor(
                np.asarray(conditioned, dtype=np.float64),
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


__all__ = ["GreyboxHazardClusteredManifoldPredictor"]
