from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import (
    RoundSemimechanisticCoefficients,
    fit_round_semimechanistic_coefficients,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.greybox_regime import (
    DEFAULT_BUDGET_PREFIXES,
    _derived_from_evidence,
    _exact_cell_blend,
    _load_training_rows,
    _round_ids_with_analyses_and_replays,
    _teacher_seed_adapter,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    _derive_transcript_features_from_stats,
    _regime_input_vector,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


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


def _standardize(
    matrix: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(matrix, axis=0)
    scale = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-6, scale, 1.0)
    return ((matrix - mean[None, :]) / scale[None, :]), mean, scale


def _factorize_head_matrix(
    matrix: np.ndarray,
    *,
    max_rank: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(matrix, axis=0)
    centered = matrix - mean[None, :]
    _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
    resolved_rank = max(1, min(int(max_rank), vt_matrix.shape[0], vt_matrix.shape[1]))
    basis = np.asarray(vt_matrix[:resolved_rank], dtype=np.float64)
    coordinates = np.asarray(centered @ basis.T, dtype=np.float64)
    coord_low = np.min(coordinates, axis=0)
    coord_high = np.max(coordinates, axis=0)
    return (
        np.asarray(mean, dtype=np.float64),
        basis,
        coordinates,
        np.asarray(coord_low, dtype=np.float64),
        np.asarray(coord_high, dtype=np.float64),
    )


def _head_vector(
    intercept: float,
    coefficients: np.ndarray,
) -> np.ndarray:
    return np.concatenate(
        [
            np.asarray([intercept], dtype=np.float64),
            np.asarray(coefficients, dtype=np.float64),
        ],
        axis=0,
    )


def _split_row_heads(
    row: RoundSemimechanisticCoefficients,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return (
        _head_vector(row.build_intercept, row.build_coef),
        _head_vector(row.port_intercept, row.port_coef),
        _head_vector(row.ruin_intercept, row.ruin_coef),
    )


def _combine_heads(
    build_head: np.ndarray,
    port_head: np.ndarray,
    ruin_head: np.ndarray,
) -> np.ndarray:
    return np.concatenate(
        [
            np.asarray(build_head, dtype=np.float64),
            np.asarray(port_head, dtype=np.float64),
            np.asarray(ruin_head, dtype=np.float64),
        ],
        axis=0,
    )


class GreyboxHazardPhaseFactoredPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_phasefactored_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    build_rank: int = Field(default=2, ge=1)
    port_rank: int = Field(default=2, ge=1)
    ruin_rank: int = Field(default=2, ge=1)
    ridge_lambda: float = Field(default=6.0, ge=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    build_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    build_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    build_coord_low: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    build_coord_high: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    build_coord_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    build_coord_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    port_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    port_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    port_coord_low: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    port_coord_high: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    port_coord_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    port_coord_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    ruin_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    ruin_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    ruin_coord_low: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    ruin_coord_high: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    ruin_coord_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    ruin_coord_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
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
        build_rank: int = 2,
        port_rank: int = 2,
        ruin_rank: int = 2,
        ridge_lambda: float = 6.0,
        prior_blend: float = 0.35,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_phasefactored_v01",
    ) -> GreyboxHazardPhaseFactoredPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
        teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(episodes)
        coefficient_rows = [
            fit_round_semimechanistic_coefficients(episode)
            for episode in episodes
        ]
        build_matrix = np.stack(
            [_split_row_heads(row)[0] for row in coefficient_rows],
            axis=0,
        )
        port_matrix = np.stack(
            [_split_row_heads(row)[1] for row in coefficient_rows],
            axis=0,
        )
        ruin_matrix = np.stack(
            [_split_row_heads(row)[2] for row in coefficient_rows],
            axis=0,
        )
        (
            build_mean,
            build_basis,
            build_coordinates,
            build_coord_low,
            build_coord_high,
        ) = _factorize_head_matrix(build_matrix, max_rank=build_rank)
        (
            port_mean,
            port_basis,
            port_coordinates,
            port_coord_low,
            port_coord_high,
        ) = _factorize_head_matrix(port_matrix, max_rank=port_rank)
        (
            ruin_mean,
            ruin_basis,
            ruin_coordinates,
            ruin_coord_low,
            ruin_coord_high,
        ) = _factorize_head_matrix(ruin_matrix, max_rank=ruin_rank)

        build_coords_by_round = {
            round_id: np.asarray(coordinates, dtype=np.float64)
            for round_id, coordinates in zip(selected_round_ids, build_coordinates, strict=True)
        }
        port_coords_by_round = {
            round_id: np.asarray(coordinates, dtype=np.float64)
            for round_id, coordinates in zip(selected_round_ids, port_coordinates, strict=True)
        }
        ruin_coords_by_round = {
            round_id: np.asarray(coordinates, dtype=np.float64)
            for round_id, coordinates in zip(selected_round_ids, ruin_coordinates, strict=True)
        }

        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        feature_vectors: list[np.ndarray] = []
        build_target_vectors: list[np.ndarray] = []
        port_target_vectors: list[np.ndarray] = []
        ruin_target_vectors: list[np.ndarray] = []
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
            round_build_coords = build_coords_by_round[round_id]
            round_port_coords = port_coords_by_round[round_id]
            round_ruin_coords = ruin_coords_by_round[round_id]
            for budget in budget_values:
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    prior_bundle,
                    _stats_from_observations(round_detail, full_observations[:budget]),
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                feature_vectors.append(np.asarray(_regime_input_vector(derived), dtype=np.float64))
                build_target_vectors.append(np.asarray(round_build_coords, dtype=np.float64))
                port_target_vectors.append(np.asarray(round_port_coords, dtype=np.float64))
                ruin_target_vectors.append(np.asarray(round_ruin_coords, dtype=np.float64))

        if not feature_vectors:
            raise ValueError("greybox hazard phase-factored predictor produced no training examples")

        feature_matrix = np.stack(feature_vectors, axis=0)
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        build_coord_matrix = np.stack(build_target_vectors, axis=0)
        port_coord_matrix = np.stack(port_target_vectors, axis=0)
        ruin_coord_matrix = np.stack(ruin_target_vectors, axis=0)
        build_coord_intercept, build_coord_weights = _fit_linear_map(
            standardized,
            build_coord_matrix,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )
        port_coord_intercept, port_coord_weights = _fit_linear_map(
            standardized,
            port_coord_matrix,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )
        ruin_coord_intercept, ruin_coord_weights = _fit_linear_map(
            standardized,
            ruin_coord_matrix,
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
            build_rank=int(build_basis.shape[0]),
            port_rank=int(port_basis.shape[0]),
            ruin_rank=int(ruin_basis.shape[0]),
            ridge_lambda=ridge_lambda,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            build_mean=np.asarray(build_mean, dtype=np.float64),
            build_basis=np.asarray(build_basis, dtype=np.float64),
            build_coord_low=np.asarray(build_coord_low, dtype=np.float64),
            build_coord_high=np.asarray(build_coord_high, dtype=np.float64),
            build_coord_intercept=np.asarray(build_coord_intercept, dtype=np.float64),
            build_coord_weights=np.asarray(build_coord_weights, dtype=np.float64),
            port_mean=np.asarray(port_mean, dtype=np.float64),
            port_basis=np.asarray(port_basis, dtype=np.float64),
            port_coord_low=np.asarray(port_coord_low, dtype=np.float64),
            port_coord_high=np.asarray(port_coord_high, dtype=np.float64),
            port_coord_intercept=np.asarray(port_coord_intercept, dtype=np.float64),
            port_coord_weights=np.asarray(port_coord_weights, dtype=np.float64),
            ruin_mean=np.asarray(ruin_mean, dtype=np.float64),
            ruin_basis=np.asarray(ruin_basis, dtype=np.float64),
            ruin_coord_low=np.asarray(ruin_coord_low, dtype=np.float64),
            ruin_coord_high=np.asarray(ruin_coord_high, dtype=np.float64),
            ruin_coord_intercept=np.asarray(ruin_coord_intercept, dtype=np.float64),
            ruin_coord_weights=np.asarray(ruin_coord_weights, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _predict_head(
        self,
        standardized: np.ndarray,
        *,
        mean: np.ndarray,
        basis: np.ndarray,
        coord_low: np.ndarray,
        coord_high: np.ndarray,
        coord_intercept: np.ndarray,
        coord_weights: np.ndarray,
    ) -> np.ndarray:
        coordinates = np.asarray(
            coord_intercept + standardized @ coord_weights,
            dtype=np.float64,
        )
        coordinates = np.clip(coordinates, coord_low, coord_high)
        return np.asarray(mean + (coordinates @ basis), dtype=np.float64)

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        build_head = self._predict_head(
            standardized,
            mean=self.build_mean,
            basis=self.build_basis,
            coord_low=self.build_coord_low,
            coord_high=self.build_coord_high,
            coord_intercept=self.build_coord_intercept,
            coord_weights=self.build_coord_weights,
        )
        port_head = self._predict_head(
            standardized,
            mean=self.port_mean,
            basis=self.port_basis,
            coord_low=self.port_coord_low,
            coord_high=self.port_coord_high,
            coord_intercept=self.port_coord_intercept,
            coord_weights=self.port_coord_weights,
        )
        ruin_head = self._predict_head(
            standardized,
            mean=self.ruin_mean,
            basis=self.ruin_basis,
            coord_low=self.ruin_coord_low,
            coord_high=self.ruin_coord_high,
            coord_intercept=self.ruin_coord_intercept,
            coord_weights=self.ruin_coord_weights,
        )
        coefficient_vector = _combine_heads(build_head, port_head, ruin_head)
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
