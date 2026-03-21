from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.manifold import factorize_round_coefficients
from astar.history.summaries.round_coefficients import fit_round_semimechanistic_coefficients
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    QueryResidualPredictor,
    SeedTranscriptStats,
    _derive_transcript_features_from_stats,
    _ensure_synthetic_dataset,
    _regime_input_vector,
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
    _stats_from_seed_evidence,
    _teacher_seed_adapter,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState


DEFAULT_BUDGET_PREFIXES = (0, 5, 10, 20, 35, 50)


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


def _empty_stats(round_detail: RoundDetail) -> dict[int, SeedTranscriptStats]:
    return {
        seed_index: SeedTranscriptStats(
            query_count=0,
            count_tensor=np.zeros((round_detail.map_height, round_detail.map_width, CLASS_COUNT), dtype=np.float64),
            count_total=np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64),
        )
        for seed_index in range(round_detail.seeds_count)
    }


def _derived_from_evidence(
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    prior_bundle: PredictionBundle,
    evidence: RoundEvidenceBundle | None,
) -> object:
    if evidence is None or evidence.total_queries == 0:
        per_seed_stats = _empty_stats(round_detail)
    else:
        per_seed_stats = {
            seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
            for seed_index in range(round_detail.seeds_count)
        }
    return _derive_transcript_features_from_stats(
        round_detail,
        features,
        prior_bundle,
        per_seed_stats,
        blur_sigmas=DEFAULT_BLUR_SIGMAS,
    )


def _standardize(
    matrix: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(matrix, axis=0)
    scale = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-6, scale, 1.0)
    return ((matrix - mean[None, :]) / scale[None, :]), mean, scale


def _exact_cell_blend(
    prediction: np.ndarray,
    exact_counts: np.ndarray,
    prior: np.ndarray,
    *,
    beta_min: float,
    beta_scale: float,
) -> np.ndarray:
    count_total = np.sum(exact_counts, axis=-1, keepdims=True)
    if not np.any(count_total > 0.0):
        return prediction
    prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
    beta = beta_min + beta_scale * (1.0 - (prior_entropy / math.log(6.0)))
    blended = np.where(
        count_total > 0.0,
        (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
        prediction,
    )
    return np.asarray(blended, dtype=np.float64)


def _load_training_rows(
    paths: WorkspacePaths,
    *,
    selected_round_ids: Sequence[str],
    policy_name: str,
    samples_per_round: int,
) -> tuple[Path, list[dict[str, object]]]:
    from astar.history.datasets.synthetic_live import load_synthetic_episode

    del load_synthetic_episode
    dataset_round_ids = _round_ids_with_analyses_and_replays(paths)
    index_path = _ensure_synthetic_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=dataset_round_ids,
    )
    dataset_dir = index_path.parent
    rows = (
        pl.read_parquet(index_path)
        .filter(pl.col("round_id").is_in(list(selected_round_ids)))
        .to_dicts()
    )
    if not rows:
        raise ValueError("greybox regime predictor synthetic transcript dataset is empty for selected rounds")
    return dataset_dir, rows


def _collect_training_examples(
    paths: WorkspacePaths,
    *,
    selected_round_ids: Sequence[str],
    policy_name: str,
    samples_per_round: int,
    budget_prefixes: Sequence[int],
    model_name: str,
) -> tuple[
    HistoricalBucketPriorPredictor,
    HazardTeacher,
    np.ndarray,
    np.ndarray,
]:
    from astar.history.datasets.synthetic_live import load_synthetic_episode

    base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
        paths,
        round_ids=list(selected_round_ids),
    )
    teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(
        [build_round_episode(paths, round_id) for round_id in selected_round_ids],
    )
    dataset_dir, rows = _load_training_rows(
        paths,
        selected_round_ids=selected_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )

    feature_vectors: list[np.ndarray] = []
    regime_vectors: list[np.ndarray] = []
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
        for budget in budget_values:
            derived = _derive_transcript_features_from_stats(
                round_detail,
                features,
                prior_bundle,
                _stats_from_observations(round_detail, full_observations[:budget]),
                blur_sigmas=DEFAULT_BLUR_SIGMAS,
            )
            feature_vectors.append(np.asarray(_regime_input_vector(derived), dtype=np.float64))
            regime_vectors.append(np.asarray(artifact.regime_vector, dtype=np.float64))

    if not feature_vectors:
        raise ValueError("greybox regime predictor produced no training examples")
    return (
        base_predictor,
        teacher,
        np.stack(feature_vectors, axis=0),
        np.stack(regime_vectors, axis=0),
    )


def _collect_training_episodes(
    paths: WorkspacePaths,
    *,
    selected_round_ids: Sequence[str],
    model_name: str,
) -> tuple[HazardTeacher, dict[str, np.ndarray]]:
    episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
    teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(episodes)
    coefficient_rows = [
        fit_round_semimechanistic_coefficients(episode)
        for episode in episodes
    ]
    manifold = factorize_round_coefficients(coefficient_rows, max_rank=3)
    coords_by_round = {
        round_id: np.asarray(coord, dtype=np.float64)
        for round_id, coord in zip(manifold.round_ids, manifold.coordinates, strict=True)
    }
    return teacher, {
        "coefficient_mean": np.asarray(manifold.mean_vector, dtype=np.float64),
        "coefficient_basis": np.asarray(manifold.basis, dtype=np.float64),
        "coord_low": np.min(manifold.coordinates, axis=0),
        "coord_high": np.max(manifold.coordinates, axis=0),
        "coords_by_round": coords_by_round,
    }


class GreyboxRegimeRidgePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_regime_ridge_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    ridge_lambda: float = Field(default=4.0, ge=0.0)
    prior_blend: float = Field(default=0.25, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_low: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_high: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
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
        ridge_lambda: float = 4.0,
        prior_blend: float = 0.25,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_regime_ridge_v01",
    ) -> GreyboxRegimeRidgePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor, teacher, feature_matrix, regime_matrix = _collect_training_examples(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            budget_prefixes=budget_prefixes,
            model_name=model_name,
        )
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        regime_intercept, regime_weights = _fit_linear_map(
            standardized,
            regime_matrix,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )
        regime_low = np.min(regime_matrix, axis=0)
        regime_high = np.max(regime_matrix, axis=0)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            ridge_lambda=ridge_lambda,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            regime_low=np.asarray(regime_low, dtype=np.float64),
            regime_high=np.asarray(regime_high, dtype=np.float64),
            regime_intercept=np.asarray(regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(regime_weights, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _infer_posterior_from_derived(
        self,
        derived: object,
    ) -> RegimePosteriorState:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        mean = np.asarray(
            self.regime_intercept + standardized @ self.regime_weights,
            dtype=np.float64,
        )
        return RegimePosteriorState(
            mean=np.clip(mean, self.regime_low, self.regime_high),
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        posterior = self._infer_posterior_from_derived(derived)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            teacher_prediction = self.teacher.posterior_predictive(
                _teacher_seed_adapter(round_detail, seed_index),
                posterior,
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


class GreyboxRegimeKnnPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_regime_knn_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    k_neighbors: int = Field(default=16, ge=1)
    prior_blend: float = Field(default=0.25, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    feature_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
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
        k_neighbors: int = 16,
        prior_blend: float = 0.25,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_regime_knn_v01",
    ) -> GreyboxRegimeKnnPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor, teacher, feature_matrix, regime_matrix = _collect_training_examples(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            budget_prefixes=budget_prefixes,
            model_name=model_name,
        )
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            k_neighbors=k_neighbors,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            feature_bank=np.asarray(standardized, dtype=np.float64),
            regime_bank=np.asarray(regime_matrix, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _infer_posterior_from_derived(
        self,
        derived: object,
    ) -> RegimePosteriorState:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.feature_bank - standardized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        particles = tuple(np.asarray(self.regime_bank[index], dtype=np.float64) for index in order)
        mean = np.tensordot(weights, self.regime_bank[order], axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        posterior = self._infer_posterior_from_derived(derived)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            teacher_prediction = self.teacher.posterior_predictive(
                _teacher_seed_adapter(round_detail, seed_index),
                posterior,
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


class GreyboxHazardLowRankPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_lowrank_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    ridge_lambda: float = Field(default=4.0, ge=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    coefficient_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    coefficient_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    coord_low: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    coord_high: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    coord_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    coord_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
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
        ridge_lambda: float = 4.0,
        prior_blend: float = 0.35,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_lowrank_v01",
    ) -> GreyboxHazardLowRankPredictor:
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
        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        coords_by_round = manifold_payload["coords_by_round"]

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        feature_vectors: list[np.ndarray] = []
        coord_vectors: list[np.ndarray] = []
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
            round_coords = np.asarray(coords_by_round[round_id], dtype=np.float64)
            for budget in budget_values:
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    prior_bundle,
                    _stats_from_observations(round_detail, full_observations[:budget]),
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                feature_vectors.append(np.asarray(_regime_input_vector(derived), dtype=np.float64))
                coord_vectors.append(round_coords)

        feature_matrix = np.stack(feature_vectors, axis=0)
        coord_matrix = np.stack(coord_vectors, axis=0)
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        coord_intercept, coord_weights = _fit_linear_map(
            standardized,
            coord_matrix,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            ridge_lambda=ridge_lambda,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            coefficient_mean=np.asarray(manifold_payload["coefficient_mean"], dtype=np.float64),
            coefficient_basis=np.asarray(manifold_payload["coefficient_basis"], dtype=np.float64),
            coord_low=np.asarray(manifold_payload["coord_low"], dtype=np.float64),
            coord_high=np.asarray(manifold_payload["coord_high"], dtype=np.float64),
            coord_intercept=np.asarray(coord_intercept, dtype=np.float64),
            coord_weights=np.asarray(coord_weights, dtype=np.float64),
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
        coords = np.asarray(
            self.coord_intercept + standardized @ self.coord_weights,
            dtype=np.float64,
        )
        coords = np.clip(coords, self.coord_low, self.coord_high)
        coefficient_vector = np.asarray(
            self.coefficient_mean + (coords @ self.coefficient_basis),
            dtype=np.float64,
        )
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


class GreyboxLowRankQueryResidualHybridPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hybrid_lowrank_queryres_v02"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    residual_predictor: BaseRoundPredictor
    lowrank_weight: float = Field(default=0.65, ge=0.0, le=1.0)
    samples_per_round: int = Field(default=4, ge=1)
    query_samples_per_round: int = Field(default=1, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        query_samples_per_round: int = 1,
        lowrank_weight: float = 0.65,
        model_name: str = "greybox_hybrid_lowrank_queryres_v02",
    ) -> GreyboxLowRankQueryResidualHybridPredictor:
        lowrank_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            model_name=f"{model_name}__lowrank",
        ).model_copy(update={"prior_blend": 0.55})
        residual_predictor = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=query_samples_per_round,
            model_name=f"{model_name}__queryres",
        )
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            residual_predictor=residual_predictor,
            lowrank_weight=lowrank_weight,
            samples_per_round=samples_per_round,
            query_samples_per_round=query_samples_per_round,
        )

    def _blend(
        self,
        lowrank_bundle: PredictionBundle,
        residual_bundle: PredictionBundle,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in lowrank_bundle.predictions_by_seed:
            lowrank_prediction = np.asarray(lowrank_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            residual_prediction = np.asarray(
                residual_bundle.predictions_by_seed[seed_index],
                dtype=np.float64,
            )
            predictions_by_seed[seed_index] = (
                (self.lowrank_weight * lowrank_prediction)
                + ((1.0 - self.lowrank_weight) * residual_prediction)
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
        residual_bundle = self.residual_predictor.build_prediction_bundle_from_context(context)
        return self._blend(lowrank_bundle, residual_bundle)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        lowrank_bundle = self.lowrank_predictor.build_prediction_bundle(round_detail, features, evidence)
        residual_bundle = self.residual_predictor.build_prediction_bundle(round_detail, features, evidence)
        return self._blend(lowrank_bundle, residual_bundle)


__all__ = [
    "GreyboxHazardLowRankPredictor",
    "GreyboxLowRankQueryResidualHybridPredictor",
    "GreyboxRegimeKnnPredictor",
    "GreyboxRegimeRidgePredictor",
]
