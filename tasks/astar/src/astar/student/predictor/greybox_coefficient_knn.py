from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
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
    _exact_cell_blend,
    _load_training_rows,
    _regime_input_vector,
    _round_ids_with_analyses_and_replays,
    _standardize,
    _stats_from_observations,
    _teacher_seed_adapter,
    GreyboxHazardLowRankPredictor,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


def _softmax_distances(distances: np.ndarray, *, temperature: float) -> np.ndarray:
    if distances.size == 0:
        return np.zeros(0, dtype=np.float64)
    scaled = -(distances - float(np.min(distances))) / max(float(temperature), 1e-6)
    scaled = np.clip(scaled, -60.0, 60.0)
    weights = np.exp(scaled)
    return weights / np.maximum(np.sum(weights), 1e-12)


class GreyboxCoefficientKnnPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_coefficient_knn_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    k_neighbors: int = Field(default=24, ge=1)
    distance_temperature: float = Field(default=1.5, gt=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    feature_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
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
        k_neighbors: int = 24,
        distance_temperature: float = 1.5,
        prior_blend: float = 0.35,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_coefficient_knn_v01",
    ) -> GreyboxCoefficientKnnPredictor:
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
        coords_by_round = manifold_payload["coords_by_round"]
        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        feature_vectors: list[np.ndarray] = []
        coefficient_vectors: list[np.ndarray] = []
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
            coefficient_vector = np.asarray(
                coefficient_mean + (np.asarray(coords_by_round[round_id], dtype=np.float64) @ coefficient_basis),
                dtype=np.float64,
            )
            artifact = load_synthetic_episode(
                Path(str(row["episode_path"])),
                dataset_dir=dataset_dir,
                workspace_root=paths.root,
            )
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in budget_prefixes})
            for budget in budget_values:
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    prior_bundle,
                    _stats_from_observations(round_detail, full_observations[:budget]),
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                feature_vectors.append(np.asarray(_regime_input_vector(derived), dtype=np.float64))
                coefficient_vectors.append(np.asarray(coefficient_vector, dtype=np.float64))

        if not feature_vectors:
            raise ValueError("greybox coefficient knn predictor produced no training examples")

        feature_matrix = np.stack(feature_vectors, axis=0)
        coefficient_matrix = np.stack(coefficient_vectors, axis=0)
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            k_neighbors=min(int(k_neighbors), int(feature_matrix.shape[0])),
            distance_temperature=distance_temperature,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            feature_bank=np.asarray(standardized, dtype=np.float64),
            coefficient_bank=np.asarray(coefficient_matrix, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _infer_coefficient_vector(self, derived: object) -> np.ndarray:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.feature_bank - standardized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        weights = _softmax_distances(distances[order], temperature=self.distance_temperature)
        coefficient_vector = np.tensordot(weights, self.coefficient_bank[order], axes=(0, 0))
        return np.asarray(coefficient_vector, dtype=np.float64)

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        coefficient_vector = self._infer_coefficient_vector(derived)
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
        from astar.student.predictor.query_residual import _derived_from_evidence

        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(round_detail, features, derived)


class GreyboxLowRankCoefficientHybridPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hybrid_lowrank_coefficientknn_v01"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    coefficient_predictor: GreyboxCoefficientKnnPredictor
    lowrank_weight: float = Field(default=0.90, ge=0.0, le=1.0)
    samples_per_round: int = Field(default=4, ge=1)
    coefficient_samples_per_round: int = Field(default=4, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        coefficient_samples_per_round: int = 4,
        lowrank_weight: float = 0.90,
        model_name: str = "greybox_hybrid_lowrank_coefficientknn_v01",
    ) -> GreyboxLowRankCoefficientHybridPredictor:
        lowrank_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            prior_blend=0.55,
            model_name=f"{model_name}__lowrank",
        )
        coefficient_predictor = GreyboxCoefficientKnnPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=coefficient_samples_per_round,
            prior_blend=0.35,
            model_name=f"{model_name}__coefficient",
        )
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            coefficient_predictor=coefficient_predictor,
            lowrank_weight=lowrank_weight,
            samples_per_round=samples_per_round,
            coefficient_samples_per_round=coefficient_samples_per_round,
        )

    def _blend(
        self,
        lowrank_bundle: PredictionBundle,
        coefficient_bundle: PredictionBundle,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in lowrank_bundle.predictions_by_seed:
            lowrank_prediction = np.asarray(lowrank_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            coefficient_prediction = np.asarray(
                coefficient_bundle.predictions_by_seed[seed_index],
                dtype=np.float64,
            )
            predictions_by_seed[seed_index] = (
                (self.lowrank_weight * lowrank_prediction)
                + ((1.0 - self.lowrank_weight) * coefficient_prediction)
            )
        return PredictionBundle(
            round_id=lowrank_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        lowrank_bundle = self.lowrank_predictor.build_prediction_bundle_from_context(context)
        coefficient_bundle = self.coefficient_predictor.build_prediction_bundle_from_context(context)
        return self._blend(lowrank_bundle, coefficient_bundle)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        lowrank_bundle = self.lowrank_predictor.build_prediction_bundle(round_detail, features, evidence)
        coefficient_bundle = self.coefficient_predictor.build_prediction_bundle(round_detail, features, evidence)
        return self._blend(lowrank_bundle, coefficient_bundle)


__all__ = ["GreyboxCoefficientKnnPredictor", "GreyboxLowRankCoefficientHybridPredictor"]
