from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
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
from astar.student.predictor.greybox_student_joint import (
    _center_classwise,
    _fit_linear_map,
    _fit_target_basis,
    _flatten_round_logits,
    _flatten_truth_logits,
    _prediction_summary_features,
    _safe_log_probs,
    _standardize,
)
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    _derive_transcript_features_from_stats,
    _regime_input_vector,
    _stats_from_observations,
    _teacher_seed_adapter,
)
from astar.student.predictor.round import BaseRoundPredictor


def _safe_normalize(total: float, scale: float) -> float:
    if scale <= 0.0:
        return 0.0
    return float(total) / scale


def _class_entropy(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(np.asarray(probabilities, dtype=np.float64), 1e-9, 1.0)
    return np.asarray(-np.sum(clipped * np.log(clipped), axis=-1), dtype=np.float64)


def _masked_moments(array: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    values = np.asarray(array, dtype=np.float64)
    flat_mask = np.asarray(mask, dtype=bool).reshape(-1)
    trailing_shape = values.shape[2:] if values.ndim > 2 else ()
    feature_dim = int(np.prod(trailing_shape, dtype=np.int64)) if trailing_shape else 1
    if not np.any(flat_mask):
        zeros = np.zeros(feature_dim, dtype=np.float64)
        return zeros, zeros
    flat_values = values.reshape(values.shape[0] * values.shape[1], feature_dim)
    selected = flat_values[flat_mask]
    return np.mean(selected, axis=0), np.std(selected, axis=0)


def _mean_or_zeros(vectors: list[np.ndarray], dim: int) -> np.ndarray:
    if not vectors:
        return np.zeros(dim, dtype=np.float64)
    return np.mean(np.stack(vectors, axis=0), axis=0)


def _std_or_zeros(vectors: list[np.ndarray], dim: int) -> np.ndarray:
    if not vectors:
        return np.zeros(dim, dtype=np.float64)
    return np.std(np.stack(vectors, axis=0), axis=0)


def _group_observations_by_seed(
    observations: Sequence[LiveQueryObs],
    *,
    seed_count: int,
) -> dict[int, list[LiveQueryObs]]:
    grouped = {seed_index: [] for seed_index in range(seed_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    return grouped


def _viewport_group_key(observation: LiveQueryObs) -> tuple[int, int, int, int, int]:
    viewport = observation.viewport
    return (
        observation.seed_index,
        viewport.x,
        viewport.y,
        viewport.w,
        viewport.h,
    )


def _window_class_frequency(observation: LiveQueryObs) -> np.ndarray:
    collapsed = collapse_internal_grid(observation.grid)
    counts = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
    total = float(np.sum(counts))
    if total <= 0.0:
        return np.zeros(CLASS_COUNT, dtype=np.float64)
    return counts / total


def _window_prediction_mean(
    prediction: np.ndarray,
    observation: LiveQueryObs,
) -> np.ndarray:
    viewport = observation.viewport
    patch = np.asarray(
        prediction[viewport.y : viewport.y_stop, viewport.x : viewport.x_stop],
        dtype=np.float64,
    )
    return np.mean(patch.reshape(-1, CLASS_COUNT), axis=0)


def _seed_window_group_features(
    observations: Sequence[LiveQueryObs],
    *,
    base_prediction: np.ndarray,
) -> np.ndarray:
    residual_dim = CLASS_COUNT
    if not observations:
        return np.zeros(5 + residual_dim * 5 + 2, dtype=np.float64)

    grouped: dict[tuple[int, int, int, int, int], list[LiveQueryObs]] = {}
    for observation in observations:
        grouped.setdefault(_viewport_group_key(observation), []).append(observation)

    group_residuals: list[np.ndarray] = []
    group_disagreements: list[np.ndarray] = []
    group_entropies: list[np.ndarray] = []
    repeated_group_residuals: list[np.ndarray] = []
    repeated_group_disagreements: list[np.ndarray] = []
    repeated_group_entropies: list[np.ndarray] = []
    repeat_counts: list[float] = []

    for group in grouped.values():
        repeat_count = float(len(group))
        repeat_counts.append(repeat_count)
        class_freq_rows = [_window_class_frequency(item) for item in group]
        group_freq = np.mean(np.stack(class_freq_rows, axis=0), axis=0)
        base_mean = _window_prediction_mean(base_prediction, group[0])
        residual = np.asarray(group_freq - base_mean, dtype=np.float64)
        disagreement = (
            np.std(np.stack(class_freq_rows, axis=0), axis=0)
            if len(class_freq_rows) > 1
            else np.zeros(CLASS_COUNT, dtype=np.float64)
        )
        entropy_value = np.asarray([float(_class_entropy(group_freq[None, :])[0])], dtype=np.float64)
        group_residuals.append(residual)
        group_disagreements.append(np.asarray(disagreement, dtype=np.float64))
        group_entropies.append(entropy_value)
        if repeat_count > 1.0:
            repeated_group_residuals.append(residual)
            repeated_group_disagreements.append(np.asarray(disagreement, dtype=np.float64))
            repeated_group_entropies.append(entropy_value)

    unique_window_count = len(grouped)
    repeated_group_count = len(repeated_group_residuals)
    repeat_query_count = sum(max(int(count) - 1, 0) for count in repeat_counts)
    residual_mean = _mean_or_zeros(group_residuals, residual_dim)
    residual_std = _std_or_zeros(group_residuals, residual_dim)
    disagreement_mean = _mean_or_zeros(group_disagreements, residual_dim)
    repeated_residual_mean = _mean_or_zeros(repeated_group_residuals, residual_dim)
    repeated_disagreement_mean = _mean_or_zeros(repeated_group_disagreements, residual_dim)
    entropy_mean = _mean_or_zeros(group_entropies, 1)
    repeated_entropy_mean = _mean_or_zeros(repeated_group_entropies, 1)

    return np.concatenate(
        [
            np.asarray(
                [
                    _safe_normalize(unique_window_count, 50.0),
                    _safe_normalize(repeated_group_count, 10.0),
                    _safe_normalize(repeat_query_count, 50.0),
                    _safe_normalize(float(np.mean(repeat_counts)) if repeat_counts else 0.0, 5.0),
                    _safe_normalize(float(np.max(repeat_counts)) if repeat_counts else 0.0, 10.0),
                ],
                dtype=np.float64,
            ),
            residual_mean,
            residual_std,
            disagreement_mean,
            repeated_residual_mean,
            repeated_disagreement_mean,
            entropy_mean,
            repeated_entropy_mean,
        ],
        axis=0,
    )


def _seed_repeataware_count_features(
    *,
    exact_counts: np.ndarray,
    base_prediction: np.ndarray,
    query_count: int,
    repeated_window_groups: int,
) -> np.ndarray:
    count_tensor = np.asarray(exact_counts, dtype=np.float64)
    count_total = np.sum(count_tensor, axis=-1)
    observed_mask = count_total > 0.0
    repeated_mask = count_total > 1.0
    exact_freq = np.zeros_like(base_prediction, dtype=np.float64)
    if np.any(observed_mask):
        exact_freq[observed_mask] = count_tensor[observed_mask] / count_total[observed_mask, None]
    residual = np.where(observed_mask[..., None], exact_freq - base_prediction, 0.0)
    exact_entropy = _class_entropy(exact_freq)
    base_entropy = np.asarray(entropy_map(base_prediction), dtype=np.float64)

    observed_freq_mean, observed_freq_std = _masked_moments(exact_freq, observed_mask)
    residual_mean, residual_std = _masked_moments(residual, observed_mask)
    repeated_residual_mean, repeated_residual_std = _masked_moments(residual, repeated_mask)
    observed_exact_entropy_mean, observed_exact_entropy_std = _masked_moments(
        exact_entropy[..., None],
        observed_mask,
    )
    repeated_exact_entropy_mean, repeated_exact_entropy_std = _masked_moments(
        exact_entropy[..., None],
        repeated_mask,
    )
    observed_base_entropy_mean, _ = _masked_moments(base_entropy[..., None], observed_mask)
    repeated_base_entropy_mean, _ = _masked_moments(base_entropy[..., None], repeated_mask)

    mean_count_observed = (
        float(np.mean(count_total[observed_mask])) if np.any(observed_mask) else 0.0
    )
    max_count = float(np.max(count_total)) if count_total.size > 0 else 0.0

    return np.concatenate(
        [
            np.asarray(
                [
                    _safe_normalize(query_count, 50.0),
                    float(np.mean(observed_mask)),
                    float(np.mean(repeated_mask)),
                    _safe_normalize(mean_count_observed, 5.0),
                    _safe_normalize(max_count, 10.0),
                    _safe_normalize(repeated_window_groups, 10.0),
                ],
                dtype=np.float64,
            ),
            observed_freq_mean,
            observed_freq_std,
            residual_mean,
            residual_std,
            repeated_residual_mean,
            repeated_residual_std,
            observed_exact_entropy_mean,
            observed_exact_entropy_std,
            repeated_exact_entropy_mean,
            repeated_exact_entropy_std,
            observed_base_entropy_mean,
            repeated_base_entropy_mean,
        ],
        axis=0,
    )


def _lowrank_feature_and_coords(
    predictor: GreyboxHazardLowRankPredictor,
    derived: object,
) -> tuple[np.ndarray, np.ndarray]:
    lowrank_feature = np.asarray(_regime_input_vector(derived), dtype=np.float64)
    standardized_feature = (lowrank_feature - predictor.feature_mean) / predictor.feature_scale
    lowrank_coords = np.asarray(
        predictor.coord_intercept + standardized_feature @ predictor.coord_weights,
        dtype=np.float64,
    )
    lowrank_coords = np.clip(lowrank_coords, predictor.coord_low, predictor.coord_high)
    return lowrank_feature, lowrank_coords


def _uncorrected_lowrank_bundle(
    predictor: GreyboxHazardLowRankPredictor,
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    derived: object,
    *,
    lowrank_coords: np.ndarray | None = None,
) -> PredictionBundle:
    _, coords = _lowrank_feature_and_coords(predictor, derived)
    if lowrank_coords is not None:
        coords = np.asarray(lowrank_coords, dtype=np.float64)
    coefficient_vector = np.asarray(
        predictor.coefficient_mean + (coords @ predictor.coefficient_basis),
        dtype=np.float64,
    )
    prior_bundle = predictor.base_predictor.build_prediction_bundle(round_detail, features)
    predictions_by_seed: dict[int, np.ndarray] = {}
    for seed_index in range(round_detail.seeds_count):
        teacher_prediction = predictor.teacher._decode_terminal_tensor(
            _teacher_seed_adapter(round_detail, seed_index),
            coefficient_vector,
        )
        prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        blended = (
            ((1.0 - predictor.prior_blend) * teacher_prediction) + (predictor.prior_blend * prior)
            if predictor.prior_blend > 0.0
            else np.asarray(teacher_prediction, dtype=np.float64)
        )
        predictions_by_seed[seed_index] = apply_probability_floor(
            np.asarray(blended, dtype=np.float64),
            predictor.probability_floor,
        )
    return PredictionBundle(
        round_id=round_detail.id,
        model_name=f"{predictor.name}__uncorrected",
        predictions_by_seed=predictions_by_seed,
    )


def _repeataware_feature_vector_from_observations(
    *,
    round_detail: RoundDetail,
    derived: object,
    structural_bundle: PredictionBundle,
    corrected_bundle: PredictionBundle,
    observations: Sequence[LiveQueryObs],
    lowrank_feature: np.ndarray,
    lowrank_coords: np.ndarray,
) -> np.ndarray:
    grouped = _group_observations_by_seed(observations, seed_count=round_detail.seeds_count)
    seed_vectors: list[np.ndarray] = []
    for seed_index in range(round_detail.seeds_count):
        seed_observations = grouped.get(seed_index, [])
        grouped_windows: dict[tuple[int, int, int, int, int], int] = {}
        for observation in seed_observations:
            key = _viewport_group_key(observation)
            grouped_windows[key] = grouped_windows.get(key, 0) + 1
        repeated_window_groups = sum(1 for count in grouped_windows.values() if count > 1)
        count_features = _seed_repeataware_count_features(
            exact_counts=np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
            base_prediction=np.asarray(structural_bundle.predictions_by_seed[seed_index], dtype=np.float64),
            query_count=len(seed_observations),
            repeated_window_groups=repeated_window_groups,
        )
        group_features = _seed_window_group_features(
            seed_observations,
            base_prediction=np.asarray(structural_bundle.predictions_by_seed[seed_index], dtype=np.float64),
        )
        seed_vectors.append(np.concatenate([count_features, group_features], axis=0))

    seed_stack = np.stack(seed_vectors, axis=0)
    return np.concatenate(
        [
            lowrank_feature,
            lowrank_coords,
            _prediction_summary_features(corrected_bundle),
            np.mean(seed_stack, axis=0),
            np.std(seed_stack, axis=0),
            np.max(seed_stack, axis=0),
        ],
        axis=0,
    )


def _repeataware_feature_vector_from_evidence(
    *,
    round_detail: RoundDetail,
    derived: object,
    structural_bundle: PredictionBundle,
    corrected_bundle: PredictionBundle,
    evidence: RoundEvidenceBundle | None,
    lowrank_feature: np.ndarray,
    lowrank_coords: np.ndarray,
) -> np.ndarray:
    seed_vectors: list[np.ndarray] = []
    for seed_index in range(round_detail.seeds_count):
        query_count = 0
        repeated_window_groups = 0
        if evidence is not None and seed_index in evidence.per_seed:
            seed_evidence = evidence.per_seed[seed_index]
            query_count = int(seed_evidence.query_count)
            repeated_window_groups = int(seed_evidence.repeated_window_groups)
        count_features = _seed_repeataware_count_features(
            exact_counts=np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
            base_prediction=np.asarray(structural_bundle.predictions_by_seed[seed_index], dtype=np.float64),
            query_count=query_count,
            repeated_window_groups=repeated_window_groups,
        )
        seed_vectors.append(
            np.concatenate(
                [
                    count_features,
                    np.zeros(5 + CLASS_COUNT * 5 + 2, dtype=np.float64),
                ],
                axis=0,
            ),
        )
    seed_stack = np.stack(seed_vectors, axis=0)
    return np.concatenate(
        [
            lowrank_feature,
            lowrank_coords,
            _prediction_summary_features(corrected_bundle),
            np.mean(seed_stack, axis=0),
            np.std(seed_stack, axis=0),
            np.max(seed_stack, axis=0),
        ],
        axis=0,
    )


class GreyboxStudentJointRepeatAwarePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_student_joint_repeataware_v02"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    residual_rank: int = Field(default=6, ge=1)
    ridge_lambda: float = Field(default=12.0, ge=0.0)
    k_neighbors: int = Field(default=24, ge=1)
    memory_weight: float = Field(default=0.45, ge=0.0, le=1.0)
    correction_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    correction_scale: float = Field(default=0.40, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    target_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    target_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    target_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    target_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    memory_feature_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    memory_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
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
        residual_rank: int = 6,
        ridge_lambda: float = 12.0,
        k_neighbors: int = 24,
        memory_weight: float = 0.45,
        correction_blend: float = 0.35,
        correction_scale: float = 0.40,
        probability_floor: float = 0.01,
        model_name: str = "greybox_student_joint_repeataware_v02",
    ) -> GreyboxStudentJointRepeatAwarePredictor:
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
        round_cache: dict[str, tuple[RoundDetail, RoundFeatureBundle]] = {}
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
                cached = (round_detail, features)
                round_cache[round_id] = cached
            round_detail, features = cached

            truths_by_seed = truth_cache.get(round_id)
            if truths_by_seed is None:
                truths_by_seed = {
                    seed_index: np.asarray(record.analysis.ground_truth, dtype=np.float64)
                    for seed_index, record in sorted(read_analysis_records(paths, round_id).items())
                }
                truth_cache[round_id] = truths_by_seed
            if not truths_by_seed:
                raise ValueError(
                    f"round {round_id} has no analyses for greybox student joint repeataware predictor",
                )

            round_seed_indexes = tuple(sorted(truths_by_seed))
            if seed_indexes is None:
                seed_indexes = round_seed_indexes
                map_height = int(round_detail.map_height)
                map_width = int(round_detail.map_width)
            elif round_seed_indexes != seed_indexes:
                raise ValueError(
                    "greybox student joint repeataware predictor requires consistent analyzed seed indexes",
                )

            artifact = load_synthetic_episode(
                Path(str(row["episode_path"])),
                dataset_dir=dataset_dir,
                workspace_root=paths.root,
            )
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in budget_prefixes})
            for budget in budget_values:
                budget_observations = full_observations[:budget]
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features),
                    _stats_from_observations(round_detail, budget_observations),
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                lowrank_feature, lowrank_coords = _lowrank_feature_and_coords(lowrank_predictor, derived)
                structural_bundle = _uncorrected_lowrank_bundle(
                    lowrank_predictor,
                    round_detail,
                    features,
                    derived,
                    lowrank_coords=lowrank_coords,
                )
                corrected_bundle = lowrank_predictor._predict_from_derived(round_detail, features, derived)
                feature_vectors.append(
                    _repeataware_feature_vector_from_observations(
                        round_detail=round_detail,
                        derived=derived,
                        structural_bundle=structural_bundle,
                        corrected_bundle=corrected_bundle,
                        observations=budget_observations,
                        lowrank_feature=lowrank_feature,
                        lowrank_coords=lowrank_coords,
                    ),
                )
                base_logits = _flatten_round_logits(
                    corrected_bundle,
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
            raise ValueError("greybox student joint repeataware predictor produced no training examples")

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
            memory_coord_bank = np.zeros((standardized.shape[0], 0), dtype=np.float64)
        else:
            target_intercept, target_weights = _fit_linear_map(
                standardized,
                target_coordinates,
                ridge_alpha=max(ridge_lambda, 1e-3),
            )
            memory_coord_bank = np.asarray(target_coordinates, dtype=np.float64)
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            residual_rank=int(target_basis.shape[0]),
            ridge_lambda=ridge_lambda,
            k_neighbors=k_neighbors,
            memory_weight=memory_weight,
            correction_blend=correction_blend,
            correction_scale=correction_scale,
            probability_floor=probability_floor,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            target_intercept=np.asarray(target_intercept, dtype=np.float64),
            target_weights=np.asarray(target_weights, dtype=np.float64),
            target_mean=np.asarray(target_mean, dtype=np.float64),
            target_basis=np.asarray(target_basis, dtype=np.float64),
            memory_feature_bank=np.asarray(standardized, dtype=np.float64),
            memory_coord_bank=np.asarray(memory_coord_bank, dtype=np.float64),
            seed_indexes=tuple(int(seed_index) for seed_index in seed_indexes),
            seed_count=len(seed_indexes),
            map_height=map_height,
            map_width=map_width,
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _direct_feature_vector_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
        *,
        observations: Sequence[LiveQueryObs] | None = None,
        evidence: RoundEvidenceBundle | None = None,
    ) -> tuple[np.ndarray, PredictionBundle]:
        lowrank_feature, lowrank_coords = _lowrank_feature_and_coords(self.lowrank_predictor, derived)
        structural_bundle = _uncorrected_lowrank_bundle(
            self.lowrank_predictor,
            round_detail,
            features,
            derived,
            lowrank_coords=lowrank_coords,
        )
        corrected_bundle = self.lowrank_predictor._predict_from_derived(round_detail, features, derived)
        if observations is not None:
            feature_vector = _repeataware_feature_vector_from_observations(
                round_detail=round_detail,
                derived=derived,
                structural_bundle=structural_bundle,
                corrected_bundle=corrected_bundle,
                observations=observations,
                lowrank_feature=lowrank_feature,
                lowrank_coords=lowrank_coords,
            )
        else:
            feature_vector = _repeataware_feature_vector_from_evidence(
                round_detail=round_detail,
                derived=derived,
                structural_bundle=structural_bundle,
                corrected_bundle=corrected_bundle,
                evidence=evidence,
                lowrank_feature=lowrank_feature,
                lowrank_coords=lowrank_coords,
            )
        return feature_vector, corrected_bundle

    def _predict_delta_logits(
        self,
        feature_vector: np.ndarray,
    ) -> np.ndarray:
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        if self.target_basis.shape[0] == 0:
            flat_delta = np.asarray(self.target_mean, dtype=np.float64)
        else:
            linear_coordinates = np.asarray(
                self.target_intercept + standardized @ self.target_weights,
                dtype=np.float64,
            )
            if self.memory_weight > 0.0 and len(self.memory_feature_bank) > 0:
                distances = np.linalg.norm(self.memory_feature_bank - standardized[None, :], axis=1)
                order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
                neighbor_distances = distances[order]
                weights = 1.0 / np.clip(neighbor_distances, 1e-6, None)
                weights = weights / np.sum(weights)
                memory_coordinates = np.tensordot(weights, self.memory_coord_bank[order], axes=(0, 0))
                coordinates = (
                    ((1.0 - self.memory_weight) * linear_coordinates)
                    + (self.memory_weight * np.asarray(memory_coordinates, dtype=np.float64))
                )
            else:
                coordinates = linear_coordinates
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
        *,
        observations: Sequence[LiveQueryObs] | None = None,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        if (
            round_detail.map_height != self.map_height
            or round_detail.map_width != self.map_width
            or round_detail.seeds_count < self.seed_count
        ):
            raise ValueError(
                "greybox student joint repeataware predictor shape mismatch: "
                f"expected at least {self.seed_count} seeds and map "
                f"{self.map_height}x{self.map_width}, got {round_detail.seeds_count} seeds and "
                f"{round_detail.map_height}x{round_detail.map_width}",
            )
        feature_vector, base_bundle = self._direct_feature_vector_from_derived(
            round_detail,
            features,
            derived,
            observations=observations,
            evidence=evidence,
        )
        delta_logits = self._predict_delta_logits(feature_vector)
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
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
        return self._predict_from_derived(
            round_detail,
            context.geometry_bundle,
            derived,
            observations=context.observations,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(
            round_detail,
            features,
            derived,
            evidence=evidence,
        )
