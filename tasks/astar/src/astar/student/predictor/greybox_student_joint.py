from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.greybox_regime import (
    DEFAULT_BUDGET_PREFIXES,
    GreyboxHazardLowRankPredictor,
    _derived_from_evidence,
    _exact_cell_blend,
    _load_training_rows,
)
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    _derive_transcript_features_from_stats,
    _regime_input_vector,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor


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


def _standardize(matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(matrix, axis=0)
    scale = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-6, scale, 1.0)
    return ((matrix - mean[None, :]) / scale[None, :]), mean, scale


def _safe_log_probs(probabilities: np.ndarray, floor: float) -> np.ndarray:
    return np.log(np.maximum(np.asarray(probabilities, dtype=np.float64), floor))


def _prediction_summary_features(bundle: PredictionBundle) -> np.ndarray:
    rows: list[np.ndarray] = []
    entropy_rows: list[np.ndarray] = []
    for seed_index in sorted(bundle.predictions_by_seed):
        prediction = np.asarray(bundle.predictions_by_seed[seed_index], dtype=np.float64)
        rows.append(
            np.concatenate(
                [
                    np.mean(prediction, axis=(0, 1)),
                    np.std(prediction, axis=(0, 1)),
                ],
                axis=0,
            ),
        )
        entropy = np.asarray(entropy_map(prediction), dtype=np.float64)
        entropy_rows.append(np.asarray([float(np.mean(entropy)), float(np.std(entropy))], dtype=np.float64))
    if not rows:
        return np.zeros(2 * CLASS_COUNT * 2 + 4, dtype=np.float64)
    row_matrix = np.stack(rows, axis=0)
    entropy_matrix = np.stack(entropy_rows, axis=0)
    return np.concatenate(
        [
            np.mean(row_matrix, axis=0),
            np.std(row_matrix, axis=0),
            np.mean(entropy_matrix, axis=0),
            np.std(entropy_matrix, axis=0),
        ],
        axis=0,
    )


def _center_classwise(delta_logits: np.ndarray) -> np.ndarray:
    return np.asarray(
        delta_logits - np.mean(delta_logits, axis=-1, keepdims=True),
        dtype=np.float64,
    )


def _fit_target_basis(
    target_matrix: np.ndarray,
    *,
    rank: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(target_matrix, axis=0)
    centered = target_matrix - mean[None, :]
    resolved_rank = min(int(rank), centered.shape[0], centered.shape[1])
    if resolved_rank <= 0:
        return (
            np.asarray(mean, dtype=np.float64),
            np.zeros((0, centered.shape[1]), dtype=np.float64),
            np.zeros((centered.shape[0], 0), dtype=np.float64),
        )
    u, singular_values, vt = np.linalg.svd(centered, full_matrices=False)
    basis = np.asarray(vt[:resolved_rank], dtype=np.float64)
    coordinates = np.asarray(u[:, :resolved_rank] * singular_values[:resolved_rank], dtype=np.float64)
    return np.asarray(mean, dtype=np.float64), basis, coordinates


def _flatten_round_logits(
    bundle: PredictionBundle,
    *,
    seed_indexes: Sequence[int],
    probability_floor: float,
) -> np.ndarray:
    tensors = [
        _safe_log_probs(bundle.predictions_by_seed[seed_index], probability_floor)
        for seed_index in seed_indexes
    ]
    return np.asarray(np.stack(tensors, axis=0), dtype=np.float64)


def _flatten_truth_logits(
    truths_by_seed: dict[int, np.ndarray],
    *,
    seed_indexes: Sequence[int],
    probability_floor: float,
) -> np.ndarray:
    tensors = [
        _safe_log_probs(truths_by_seed[seed_index], probability_floor)
        for seed_index in seed_indexes
    ]
    return np.asarray(np.stack(tensors, axis=0), dtype=np.float64)


class GreyboxStudentJointPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_student_joint_v02"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    residual_rank: int = Field(default=3, ge=1)
    ridge_lambda: float = Field(default=8.0, ge=0.0)
    correction_blend: float = Field(default=0.25, ge=0.0, le=1.0)
    correction_scale: float = Field(default=0.25, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    target_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    target_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    target_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    target_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    seed_indexes: tuple[int, ...] = ()
    seed_count: int = Field(default=0, ge=0)
    map_height: int = Field(default=0, ge=0)
    map_width: int = Field(default=0, ge=0)
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
        residual_rank: int = 3,
        ridge_lambda: float = 8.0,
        correction_blend: float = 0.25,
        correction_scale: float = 0.25,
        probability_floor: float = 0.01,
        model_name: str = "greybox_student_joint_v02",
    ) -> GreyboxStudentJointPredictor:
        lowrank_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            model_name=f"{model_name}__lowrank",
        ).model_copy(update={"prior_blend": 0.55})
        selected_round_ids = lowrank_predictor.round_ids
        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        truth_cache: dict[str, dict[int, np.ndarray]] = {}
        round_cache: dict[str, tuple[RoundDetail, RoundFeatureBundle, PredictionBundle]] = {}
        feature_vectors: list[np.ndarray] = []
        target_vectors: list[np.ndarray] = []
        seed_indexes: tuple[int, ...] | None = None
        map_height: int | None = None
        map_width: int | None = None

        for row in rows:
            round_id = str(row["round_id"])
            cached = round_cache.get(round_id)
            if cached is None:
                round_detail = read_round_record(paths, round_id).round
                features = compute_round_features(round_detail)
                prior_bundle = lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
                cached = (round_detail, features, prior_bundle)
                round_cache[round_id] = cached
            round_detail, features, prior_bundle = cached

            truths_by_seed = truth_cache.get(round_id)
            if truths_by_seed is None:
                truths_by_seed = {
                    seed_index: np.asarray(record.analysis.ground_truth, dtype=np.float64)
                    for seed_index, record in sorted(read_analysis_records(paths, round_id).items())
                }
                truth_cache[round_id] = truths_by_seed
            if not truths_by_seed:
                raise ValueError(f"round {round_id} has no analyses for greybox student joint predictor")

            round_seed_indexes = tuple(sorted(truths_by_seed))
            if seed_indexes is None:
                seed_indexes = round_seed_indexes
                map_height = int(round_detail.map_height)
                map_width = int(round_detail.map_width)
            elif round_seed_indexes != seed_indexes:
                raise ValueError("greybox student joint predictor requires consistent analyzed seed indexes")

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
                base_bundle = lowrank_predictor._predict_from_derived(round_detail, features, derived)
                lowrank_feature = np.asarray(_regime_input_vector(derived), dtype=np.float64)
                standardized_feature = (
                    (lowrank_feature - lowrank_predictor.feature_mean) / lowrank_predictor.feature_scale
                )
                lowrank_coords = np.asarray(
                    lowrank_predictor.coord_intercept + standardized_feature @ lowrank_predictor.coord_weights,
                    dtype=np.float64,
                )
                lowrank_coords = np.clip(lowrank_coords, lowrank_predictor.coord_low, lowrank_predictor.coord_high)
                feature_vectors.append(
                    np.concatenate(
                        [
                            lowrank_feature,
                            lowrank_coords,
                            _prediction_summary_features(base_bundle),
                        ],
                        axis=0,
                    ),
                )
                base_logits = _flatten_round_logits(
                    base_bundle,
                    seed_indexes=seed_indexes,
                    probability_floor=probability_floor,
                )
                truth_logits = _flatten_truth_logits(
                    truths_by_seed,
                    seed_indexes=seed_indexes,
                    probability_floor=probability_floor,
                )
                delta_logits = _center_classwise(truth_logits - base_logits)
                target_vectors.append(delta_logits.reshape(-1))

        if not feature_vectors or seed_indexes is None or map_height is None or map_width is None:
            raise ValueError("greybox student joint predictor produced no training examples")

        feature_matrix = np.stack(feature_vectors, axis=0)
        target_matrix = np.stack(target_vectors, axis=0)
        target_mean, target_basis, target_coordinates = _fit_target_basis(
            target_matrix,
            rank=residual_rank,
        )
        standardized, feature_mean, feature_scale = _standardize(feature_matrix)
        if target_coordinates.shape[1] == 0:
            target_intercept = np.zeros(0, dtype=np.float64)
            target_weights = np.zeros((standardized.shape[1], 0), dtype=np.float64)
        else:
            target_intercept, target_weights = _fit_linear_map(
                standardized,
                target_coordinates,
                ridge_alpha=max(ridge_lambda, 1e-3),
            )
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            residual_rank=int(target_basis.shape[0]),
            ridge_lambda=ridge_lambda,
            correction_blend=correction_blend,
            correction_scale=correction_scale,
            probability_floor=probability_floor,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            target_intercept=np.asarray(target_intercept, dtype=np.float64),
            target_weights=np.asarray(target_weights, dtype=np.float64),
            target_mean=np.asarray(target_mean, dtype=np.float64),
            target_basis=np.asarray(target_basis, dtype=np.float64),
            seed_indexes=tuple(int(seed_index) for seed_index in seed_indexes),
            seed_count=len(seed_indexes),
            map_height=map_height,
            map_width=map_width,
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _predict_delta_logits(
        self,
        derived: object,
        base_bundle: PredictionBundle,
    ) -> np.ndarray:
        lowrank_feature = np.asarray(_regime_input_vector(derived), dtype=np.float64)
        standardized_feature = (
            (lowrank_feature - self.lowrank_predictor.feature_mean) / self.lowrank_predictor.feature_scale
        )
        lowrank_coords = np.asarray(
            self.lowrank_predictor.coord_intercept + standardized_feature @ self.lowrank_predictor.coord_weights,
            dtype=np.float64,
        )
        lowrank_coords = np.clip(
            lowrank_coords,
            self.lowrank_predictor.coord_low,
            self.lowrank_predictor.coord_high,
        )
        feature_vector = np.concatenate(
            [
                lowrank_feature,
                lowrank_coords,
                _prediction_summary_features(base_bundle),
            ],
            axis=0,
        )
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        if self.target_basis.shape[0] == 0:
            flat_delta = np.asarray(self.target_mean, dtype=np.float64)
        else:
            coordinates = np.asarray(
                self.target_intercept + standardized @ self.target_weights,
                dtype=np.float64,
            )
            flat_delta = np.asarray(
                self.target_mean + (coordinates @ self.target_basis),
                dtype=np.float64,
            )
        reshaped = flat_delta.reshape(self.seed_count, self.map_height, self.map_width, CLASS_COUNT)
        return _center_classwise(reshaped)

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        if (
            round_detail.map_height != self.map_height
            or round_detail.map_width != self.map_width
            or round_detail.seeds_count < self.seed_count
        ):
            raise ValueError(
                "greybox student joint predictor shape mismatch: "
                f"expected at least {self.seed_count} seeds and map "
                f"{self.map_height}x{self.map_width}, got {round_detail.seeds_count} seeds and "
                f"{round_detail.map_height}x{round_detail.map_width}",
            )
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        base_bundle = self.lowrank_predictor._predict_from_derived(round_detail, features, derived)
        delta_logits = self._predict_delta_logits(derived, base_bundle)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for offset, seed_index in enumerate(self.seed_indexes):
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            corrected = softmax_logits(
                _safe_log_probs(base_prediction, self.probability_floor)
                + (self.correction_scale * delta_logits[offset]),
            )
            blended = (
                ((1.0 - self.correction_blend) * base_prediction)
                + (self.correction_blend * np.asarray(corrected, dtype=np.float64))
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            blended = _exact_cell_blend(
                np.asarray(blended, dtype=np.float64),
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
                beta_min=self.lowrank_predictor.beta_min,
                beta_scale=self.lowrank_predictor.beta_scale,
            )
            predictions_by_seed[seed_index] = apply_probability_floor(
                np.asarray(blended, dtype=np.float64),
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
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
        )
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
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(round_detail, features, derived)
