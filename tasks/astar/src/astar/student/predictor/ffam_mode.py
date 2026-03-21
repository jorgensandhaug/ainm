from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients,
    seed_feature_dict,
    seed_feature_matrix,
    seed_feature_names,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.ffam_mode_config import FFAMModeConfig, resolve_ffam_mode_config
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    LOG_FLOOR_DENOM,
    _build_static_feature_stack,
    _derive_transcript_features_from_stats,
    _ensure_synthetic_dataset,
    _fit_linear_map,
    _regime_input_names,
    _regime_input_vector,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _select_training_cells,
    _static_feature_names,
    _stats_from_observations,
    _stats_from_seed_evidence,
)
from astar.student.predictor.query_residual_config import RegimeInputVariant
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.posterior.deepset_student import (
    SummaryVariant,
    _seed_summary_block_size,
    _summary_vector_from_observations,
)


_INTERACTION_PAIRS = [
    ("coast", "prior_logit_settlement"),
    ("coast", "prior_logit_port"),
    ("frontier_score", "prior_logit_settlement"),
    ("settlement_proximity", "prior_logit_ruin"),
    ("buildable", "prior_logit_empty"),
    ("forest_density", "prior_logit_ruin"),
    ("maritime_access", "prior_logit_port"),
    ("coast_distance", "prior_logit_settlement"),
    ("land_distance_to_settlement", "prior_logit_empty"),
    ("initial_settlement", "prior_logit_ruin"),
    ("initial_port", "prior_logit_port"),
    ("mountain_density", "prior_logit_settlement"),
]


def _mode_feature_names(*, include_interactions: bool = False) -> list[str]:
    names = _static_feature_names()
    names.extend([f"prior_logit_{class_name}" for class_name in CLASS_NAMES])
    if include_interactions:
        for left, right in _INTERACTION_PAIRS:
            names.append(f"ix_{left}_x_{right}")
    return names


def _summary_input_names(*, seed_count: int, variant: SummaryVariant) -> list[str]:
    block_size = _seed_summary_block_size(variant)
    return [f"summary_seed{seed_index}_{feature_index}" for seed_index in range(seed_count) for feature_index in range(block_size)]


def _posterior_input_names(
    *,
    seed_count: int,
    posterior_input_source: str,
    regime_input_variant: RegimeInputVariant,
    posterior_summary_variant: SummaryVariant,
) -> list[str]:
    if posterior_input_source == "summary_input":
        return _summary_input_names(seed_count=seed_count, variant=posterior_summary_variant)
    if posterior_input_source == "combined_input":
        return _summary_input_names(seed_count=seed_count, variant=posterior_summary_variant) + _regime_input_names(
            regime_input_variant,
        )
    return _regime_input_names(regime_input_variant)


def _posterior_input_vector_from_state(
    round_detail: RoundDetail,
    observations: tuple | list | None,
    derived,
    *,
    posterior_input_source: str,
    regime_input_variant: RegimeInputVariant,
    posterior_summary_variant: SummaryVariant,
) -> np.ndarray | None:
    if posterior_input_source == "summary_input":
        if observations is None:
            return None
        return _summary_vector_from_observations(
            tuple(observations),
            seed_count=round_detail.seeds_count,
            map_width=round_detail.map_width,
            map_height=round_detail.map_height,
            variant=posterior_summary_variant,
            initial_grids=tuple(
                np.asarray(initial_state.grid, dtype=np.int64)
                for initial_state in round_detail.initial_states
            ),
        )
    if posterior_input_source == "combined_input":
        if observations is None:
            return None
        summary_vector = _summary_vector_from_observations(
            tuple(observations),
            seed_count=round_detail.seeds_count,
            map_width=round_detail.map_width,
            map_height=round_detail.map_height,
            variant=posterior_summary_variant,
            initial_grids=tuple(
                np.asarray(initial_state.grid, dtype=np.int64)
                for initial_state in round_detail.initial_states
            ),
        )
        regime_vector = _regime_input_vector(
            derived,
            variant=regime_input_variant,
        )
        return np.concatenate([summary_vector, regime_vector], axis=0).astype(np.float64)
    return _regime_input_vector(
        derived,
        variant=regime_input_variant,
    )


def _compose_mode_design_tensor(
    static_stack: np.ndarray,
    prior: np.ndarray,
    *,
    probability_floor: float,
    include_interactions: bool = False,
) -> np.ndarray:
    prior_logits = _safe_log_probs(prior, probability_floor) / LOG_FLOOR_DENOM
    base = np.concatenate([static_stack, prior_logits], axis=-1).astype(np.float64)
    if not include_interactions:
        return base
    base_names = _static_feature_names() + [f"prior_logit_{cn}" for cn in CLASS_NAMES]
    name_to_idx = {name: idx for idx, name in enumerate(base_names)}
    interactions = []
    for left, right in _INTERACTION_PAIRS:
        if left in name_to_idx and right in name_to_idx:
            interactions.append(
                (base[..., name_to_idx[left]] * base[..., name_to_idx[right]])[..., None]
            )
    if interactions:
        return np.concatenate([base, *interactions], axis=-1).astype(np.float64)
    return base


def _solve_mode_operator(
    xtwx: np.ndarray,
    xtwy: np.ndarray,
    *,
    ridge_lambda: float,
) -> np.ndarray:
    feature_dim = xtwx.shape[0] - 1
    regularizer = np.eye(feature_dim + 1, dtype=np.float64)
    regularizer[0, 0] = 0.0
    regularizer *= ridge_lambda
    solved = np.linalg.solve(xtwx + regularizer + 1e-6 * np.eye(feature_dim + 1), xtwy)
    intercept = np.asarray(solved[0], dtype=np.float64)
    coefficients = np.asarray(solved[1:], dtype=np.float64)
    return np.concatenate([intercept, coefficients.reshape(-1)], axis=0).astype(np.float64)


def _fit_mode_operator_vector(
    round_entries: list[dict[str, object]],
    *,
    cells_per_seed: int,
    ridge_lambda: float,
    probability_floor: float,
    include_interactions: bool = False,
    operator_target: str = "logit_delta",
    entropy_weight_power: float = 1.0,
) -> np.ndarray:
    feature_dim = len(_mode_feature_names(include_interactions=include_interactions))
    xtwx = np.zeros((feature_dim + 1, feature_dim + 1), dtype=np.float64)
    xtwy = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)

    for entry in round_entries:
        round_detail = entry["round_detail"]
        features = entry["features"]
        prior_bundle = entry["prior_bundle"]
        analyses = entry["analyses"]
        for seed_index, analysis in analyses.items():
            ground_truth = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)
            design = _compose_mode_design_tensor(
                static_stack,
                prior,
                probability_floor=probability_floor,
                include_interactions=include_interactions,
            )
            flat_design = design.reshape(-1, feature_dim)
            if operator_target == "prob_delta":
                target_delta = (ground_truth - prior).reshape(-1, CLASS_COUNT)
            else:
                target_delta = (
                    _safe_log_probs(ground_truth, probability_floor) - _safe_log_probs(prior, probability_floor)
                ).reshape(-1, CLASS_COUNT)
            raw_entropy_weight = np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1) / np.log(6.0)
            row_weights = 0.05 + np.power(np.clip(raw_entropy_weight, 0.0, 1.0), entropy_weight_power)
            selected = _select_training_cells(
                ground_truth,
                round_detail,
                seed_index,
                cells_per_seed=cells_per_seed,
            )
            batch_x = flat_design[selected]
            batch_y = target_delta[selected]
            batch_w = row_weights[selected]
            batch_aug = np.concatenate(
                [np.ones((batch_x.shape[0], 1), dtype=np.float64), batch_x],
                axis=1,
            )
            xtwx += batch_aug.T @ (batch_w[:, None] * batch_aug)
            xtwy += batch_aug.T @ (batch_w[:, None] * batch_y)

    return _solve_mode_operator(
        xtwx,
        xtwy,
        ridge_lambda=ridge_lambda,
    )


def _split_mode_operator_vector(
    operator_vector: np.ndarray,
    *,
    feature_count: int,
) -> tuple[np.ndarray, np.ndarray]:
    intercept = np.asarray(operator_vector[:CLASS_COUNT], dtype=np.float64)
    coefficients = np.asarray(
        operator_vector[CLASS_COUNT:].reshape(feature_count, CLASS_COUNT),
        dtype=np.float64,
    )
    return intercept, coefficients


def _fit_posterior_metric_basis(
    standardized_inputs: np.ndarray,
    posterior_targets: np.ndarray,
    *,
    metric_dim: int,
    metric_method: str,
    cluster_ids: np.ndarray | None = None,
    cluster_count: int = 1,
) -> np.ndarray:
    if metric_method == "supervised":
        centered_targets = posterior_targets - np.mean(posterior_targets, axis=0, keepdims=True)
        metric_targets = centered_targets
        if cluster_ids is not None and cluster_count > 1:
            cluster_one_hot = np.zeros((cluster_ids.shape[0], cluster_count), dtype=np.float64)
            cluster_one_hot[np.arange(cluster_ids.shape[0]), cluster_ids] = 1.0
            cluster_one_hot -= np.mean(cluster_one_hot, axis=0, keepdims=True)
            metric_targets = np.concatenate([centered_targets, cluster_one_hot], axis=1)
        cross_covariance = standardized_inputs.T @ metric_targets
        left_basis, _, _ = np.linalg.svd(cross_covariance, full_matrices=False)
        effective_dim = max(1, min(metric_dim, left_basis.shape[1]))
        return np.asarray(left_basis[:, :effective_dim].T, dtype=np.float64)

    _, _, vt_matrix = np.linalg.svd(standardized_inputs, full_matrices=False)
    effective_dim = max(1, min(metric_dim, vt_matrix.shape[0]))
    return np.asarray(vt_matrix[:effective_dim], dtype=np.float64)


def _cluster_mode_vectors(
    mode_vectors: np.ndarray,
    *,
    cluster_count: int,
    max_iterations: int = 24,
) -> np.ndarray:
    sample_count = int(mode_vectors.shape[0])
    effective_cluster_count = max(1, min(cluster_count, sample_count))
    if effective_cluster_count <= 1 or sample_count <= 1:
        return np.zeros(sample_count, dtype=np.int64)

    offsets = mode_vectors - np.mean(mode_vectors, axis=0, keepdims=True)
    distance_from_mean = np.linalg.norm(offsets, axis=1)
    center_indexes = [int(np.argmax(distance_from_mean))]
    while len(center_indexes) < effective_cluster_count:
        centers = mode_vectors[np.asarray(center_indexes, dtype=np.int64)]
        squared_distances = np.sum(np.square(mode_vectors[:, None, :] - centers[None, :, :]), axis=2)
        nearest_distance = np.min(squared_distances, axis=1)
        for taken_index in center_indexes:
            nearest_distance[taken_index] = -1.0
        center_indexes.append(int(np.argmax(nearest_distance)))
    centers = np.asarray(mode_vectors[np.asarray(center_indexes, dtype=np.int64)], dtype=np.float64)
    labels = np.zeros(sample_count, dtype=np.int64)
    for _ in range(max_iterations):
        squared_distances = np.sum(np.square(mode_vectors[:, None, :] - centers[None, :, :]), axis=2)
        new_labels = np.asarray(np.argmin(squared_distances, axis=1), dtype=np.int64)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        new_centers = np.asarray(centers, dtype=np.float64)
        for cluster_index in range(effective_cluster_count):
            mask = labels == cluster_index
            if np.any(mask):
                new_centers[cluster_index] = np.mean(mode_vectors[mask], axis=0)
                continue
            refill_index = int(np.argmax(np.min(squared_distances, axis=1)))
            labels[refill_index] = cluster_index
            new_centers[cluster_index] = mode_vectors[refill_index]
        centers = new_centers
    return np.asarray(labels, dtype=np.int64)


def _fit_kernel_ridge_map(
    metric_bank: np.ndarray,
    targets: np.ndarray,
    *,
    bandwidth: float,
    ridge_lambda: float,
) -> np.ndarray:
    if metric_bank.shape[0] == 0:
        return np.zeros((0, targets.shape[1]), dtype=np.float64)
    bandwidth_sq = max(float(bandwidth) ** 2, 1e-6)
    pairwise_sq = np.sum(np.square(metric_bank[:, None, :] - metric_bank[None, :, :]), axis=2)
    kernel = np.exp(-0.5 * pairwise_sq / bandwidth_sq)
    system = kernel + (ridge_lambda + 1e-6) * np.eye(kernel.shape[0], dtype=np.float64)
    return np.asarray(np.linalg.solve(system, targets), dtype=np.float64)


def _quadratic_coord_features(coords: np.ndarray) -> np.ndarray:
    coords_2d = np.asarray(coords, dtype=np.float64)
    squeeze = False
    if coords_2d.ndim == 1:
        coords_2d = coords_2d[None, :]
        squeeze = True
    features: list[np.ndarray] = [coords_2d, np.square(coords_2d)]
    interaction_terms: list[np.ndarray] = []
    for left_index in range(coords_2d.shape[1]):
        for right_index in range(left_index + 1, coords_2d.shape[1]):
            interaction_terms.append(
                (coords_2d[:, left_index] * coords_2d[:, right_index])[:, None],
            )
    if interaction_terms:
        features.append(np.concatenate(interaction_terms, axis=1))
    stacked = np.concatenate(features, axis=1).astype(np.float64)
    if squeeze:
        return np.asarray(stacked[0], dtype=np.float64)
    return np.asarray(stacked, dtype=np.float64)


def _mlp_forward(
    inputs: np.ndarray,
    weight_in: np.ndarray,
    bias_in: np.ndarray,
    weight_out: np.ndarray,
    bias_out: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    hidden_pre = np.asarray(inputs @ weight_in + bias_in[None, :], dtype=np.float64)
    hidden = np.tanh(hidden_pre)
    output = np.asarray(hidden @ weight_out + bias_out[None, :], dtype=np.float64)
    return hidden, output


def _train_residual_mlp(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    hidden_dim: int,
    steps: int,
    learning_rate: float,
    weight_decay: float,
    val_mask: np.ndarray | None = None,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    input_dim = int(inputs.shape[1])
    output_dim = int(targets.shape[1])
    if inputs.shape[0] == 0 or hidden_dim <= 0 or steps <= 0:
        return (
            np.zeros((input_dim, 1), dtype=np.float64),
            np.zeros(1, dtype=np.float64),
            np.zeros((1, output_dim), dtype=np.float64),
            np.zeros(output_dim, dtype=np.float64),
        )

    resolved_val_mask = (
        np.asarray(val_mask, dtype=bool)
        if val_mask is not None and np.any(val_mask) and np.any(~np.asarray(val_mask, dtype=bool))
        else np.zeros(inputs.shape[0], dtype=bool)
    )
    train_mask = ~resolved_val_mask
    train_inputs = np.asarray(inputs[train_mask], dtype=np.float64)
    train_targets = np.asarray(targets[train_mask], dtype=np.float64)
    if train_inputs.shape[0] == 0:
        train_inputs = np.asarray(inputs, dtype=np.float64)
        train_targets = np.asarray(targets, dtype=np.float64)
        resolved_val_mask = np.zeros(inputs.shape[0], dtype=bool)
    val_inputs = np.asarray(inputs[resolved_val_mask], dtype=np.float64)
    val_targets = np.asarray(targets[resolved_val_mask], dtype=np.float64)

    rng = np.random.default_rng(seed)
    weight_in = rng.normal(
        loc=0.0,
        scale=1.0 / max(np.sqrt(float(max(input_dim, 1))), 1.0),
        size=(input_dim, hidden_dim),
    ).astype(np.float64)
    bias_in = np.zeros(hidden_dim, dtype=np.float64)
    weight_out = np.zeros((hidden_dim, output_dim), dtype=np.float64)
    bias_out = np.zeros(output_dim, dtype=np.float64)

    momentum: dict[str, np.ndarray] = {
        "weight_in": np.zeros_like(weight_in),
        "bias_in": np.zeros_like(bias_in),
        "weight_out": np.zeros_like(weight_out),
        "bias_out": np.zeros_like(bias_out),
    }
    velocity: dict[str, np.ndarray] = {
        "weight_in": np.zeros_like(weight_in),
        "bias_in": np.zeros_like(bias_in),
        "weight_out": np.zeros_like(weight_out),
        "bias_out": np.zeros_like(bias_out),
    }

    best_params = (
        np.asarray(weight_in, dtype=np.float64),
        np.asarray(bias_in, dtype=np.float64),
        np.asarray(weight_out, dtype=np.float64),
        np.asarray(bias_out, dtype=np.float64),
    )
    best_loss = np.inf
    best_step = 0
    beta1 = 0.9
    beta2 = 0.999
    epsilon = 1e-8
    patience = 60

    for step_index in range(1, steps + 1):
        hidden, predictions = _mlp_forward(
            train_inputs,
            weight_in,
            bias_in,
            weight_out,
            bias_out,
        )
        residual = predictions - train_targets
        grad_output = (2.0 / max(train_inputs.shape[0], 1)) * residual
        grad_weight_out = hidden.T @ grad_output + (2.0 * weight_decay * weight_out)
        grad_bias_out = np.sum(grad_output, axis=0)
        grad_hidden = grad_output @ weight_out.T
        grad_hidden_pre = grad_hidden * (1.0 - np.square(hidden))
        grad_weight_in = train_inputs.T @ grad_hidden_pre + (2.0 * weight_decay * weight_in)
        grad_bias_in = np.sum(grad_hidden_pre, axis=0)

        gradients = {
            "weight_in": grad_weight_in,
            "bias_in": grad_bias_in,
            "weight_out": grad_weight_out,
            "bias_out": grad_bias_out,
        }
        for key, gradient in gradients.items():
            momentum[key] = beta1 * momentum[key] + ((1.0 - beta1) * gradient)
            velocity[key] = beta2 * velocity[key] + ((1.0 - beta2) * np.square(gradient))
            bias_corrected_m = momentum[key] / (1.0 - beta1**step_index)
            bias_corrected_v = velocity[key] / (1.0 - beta2**step_index)
            update = learning_rate * bias_corrected_m / (np.sqrt(bias_corrected_v) + epsilon)
            if key == "weight_in":
                weight_in = np.asarray(weight_in - update, dtype=np.float64)
            elif key == "bias_in":
                bias_in = np.asarray(bias_in - update, dtype=np.float64)
            elif key == "weight_out":
                weight_out = np.asarray(weight_out - update, dtype=np.float64)
            else:
                bias_out = np.asarray(bias_out - update, dtype=np.float64)

        if step_index % 10 != 0 and step_index != steps:
            continue
        eval_inputs = val_inputs if val_inputs.shape[0] > 0 else train_inputs
        eval_targets = val_targets if val_targets.shape[0] > 0 else train_targets
        _, eval_predictions = _mlp_forward(
            eval_inputs,
            weight_in,
            bias_in,
            weight_out,
            bias_out,
        )
        eval_loss = float(
            np.mean(np.square(eval_predictions - eval_targets))
            + weight_decay * (np.sum(np.square(weight_in)) + np.sum(np.square(weight_out)))
        )
        if eval_loss + 1e-8 < best_loss:
            best_loss = eval_loss
            best_step = step_index
            best_params = (
                np.asarray(weight_in, dtype=np.float64),
                np.asarray(bias_in, dtype=np.float64),
                np.asarray(weight_out, dtype=np.float64),
                np.asarray(bias_out, dtype=np.float64),
            )
        elif step_index - best_step >= patience:
            break
    return best_params


_HAZARD_FEATURE_COUNT = len(seed_feature_names())


def _hazard_sigmoid(values: np.ndarray) -> np.ndarray:
    return np.asarray(
        1.0 / (1.0 + np.exp(-np.clip(values, -25.0, 25.0))),
        dtype=np.float64,
    )


def _split_hazard_coefficient_vector(
    coefficient_vector: np.ndarray,
) -> tuple[float, np.ndarray, float, np.ndarray, float, np.ndarray]:
    expected_dim = 3 + 3 * _HAZARD_FEATURE_COUNT
    if coefficient_vector.shape[0] != expected_dim:
        raise ValueError(
            f"expected hazard coefficient dim {expected_dim}, got {coefficient_vector.shape[0]}",
        )
    offset = 0
    build_intercept = float(coefficient_vector[offset])
    offset += 1
    build_coef = np.asarray(coefficient_vector[offset : offset + _HAZARD_FEATURE_COUNT], dtype=np.float64)
    offset += _HAZARD_FEATURE_COUNT
    port_intercept = float(coefficient_vector[offset])
    offset += 1
    port_coef = np.asarray(coefficient_vector[offset : offset + _HAZARD_FEATURE_COUNT], dtype=np.float64)
    offset += _HAZARD_FEATURE_COUNT
    ruin_intercept = float(coefficient_vector[offset])
    offset += 1
    ruin_coef = np.asarray(coefficient_vector[offset : offset + _HAZARD_FEATURE_COUNT], dtype=np.float64)
    return (
        build_intercept,
        build_coef,
        port_intercept,
        port_coef,
        ruin_intercept,
        ruin_coef,
    )


def _decode_hazard_tensor(initial_state, coefficient_vector: np.ndarray) -> np.ndarray:
    (
        build_intercept,
        build_coef,
        port_intercept,
        port_coef,
        ruin_intercept,
        ruin_coef,
    ) = _split_hazard_coefficient_vector(np.asarray(coefficient_vector, dtype=np.float64))
    _, feature_stack = seed_feature_matrix(initial_state)
    feature_dict = seed_feature_dict(initial_state)
    grid = np.asarray(initial_state.grid, dtype=np.int64)

    build_score = build_intercept + np.tensordot(build_coef, feature_stack, axes=(0, 0))
    port_score = port_intercept + np.tensordot(port_coef, feature_stack, axes=(0, 0))
    ruin_score = ruin_intercept + np.tensordot(ruin_coef, feature_stack, axes=(0, 0))

    buildable = feature_dict["buildable"] > 0.5
    coast = feature_dict["coast"] > 0.5
    ocean = feature_dict["initial_ocean"] > 0.5
    mountain = feature_dict["initial_mountain"] > 0.5

    build_prob = _hazard_sigmoid(build_score) * buildable.astype(np.float64)
    ruin_cond = _hazard_sigmoid(ruin_score)
    port_cond = _hazard_sigmoid(port_score) * coast.astype(np.float64)

    ruin_prob = build_prob * ruin_cond
    port_prob = build_prob * (1.0 - ruin_cond) * port_cond
    settlement_prob = build_prob * (1.0 - ruin_cond) * (1.0 - port_cond)
    forest_prior = np.where(grid == 4, 0.70, 0.05)
    forest_prob = np.where(
        buildable,
        np.clip((1.0 - build_prob) * forest_prior, 0.0, 1.0),
        0.0,
    )

    empty_prob = 1.0 - (settlement_prob + port_prob + ruin_prob + forest_prob)
    empty_prob = np.clip(empty_prob, 0.0, 1.0)

    probs = np.stack(
        [
            empty_prob,
            settlement_prob,
            port_prob,
            ruin_prob,
            forest_prob,
            mountain.astype(np.float64),
        ],
        axis=-1,
    ).astype(np.float64)

    soft_mask = ~(ocean | mountain)
    prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
    probs[soft_mask] = 0.98 * probs[soft_mask] + 0.02 * prior
    probs[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
    probs[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)

    sums = probs.sum(axis=-1, keepdims=True)
    valid = sums[:, :, 0] > 0.0
    probs[valid] = probs[valid] / sums[valid]
    if np.any(~valid):
        probs[~valid] = prior
    return np.asarray(probs, dtype=np.float64)


class FFAMModePredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    cells_per_seed: int = Field(ge=1)
    budget_prefixes: list[int]
    operator_ridge_lambda: float = Field(ge=0.0)
    posterior_ridge_lambda: float = Field(gt=0.0)
    projected_mode_dim: int = Field(ge=1)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    temperature: float = Field(gt=0.0)
    prior_blend: float = Field(ge=0.0, le=1.0)
    residual_class_scale: list[float]
    beta_min: float = Field(ge=0.0)
    beta_scale: float = Field(ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    delta_clip: float = Field(default=4.0, gt=0.0)
    include_interactions: bool = False
    operator_target: str = "logit_delta"
    entropy_weight_power: float = Field(default=1.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.0, ge=0.0)
    delta_smooth_sigma: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "motif_v1"
    posterior_input_source: str = "regime_input"
    posterior_summary_variant: SummaryVariant = "v3"
    posterior_method: str = "particle_mixture"
    posterior_residual_hidden_dim: int = Field(default=0, ge=0)
    posterior_residual_steps: int = Field(default=0, ge=0)
    posterior_residual_learning_rate: float = Field(default=0.0, ge=0.0)
    posterior_residual_weight_decay: float = Field(default=0.0, ge=0.0)
    posterior_residual_scale: float = Field(default=1.0, ge=0.0)
    decoder_method: str = "mode_projection"
    decoder_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    decoder_particle_ood_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    hazard_decoder_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    hazard_decoder_ood_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_method: str = "pca"
    cluster_count: int = Field(default=1, ge=1)
    mode_feature_names: list[str]
    posterior_input_names: list[str]
    mode_round_ids: list[str]
    arrays_path: str
    base_checkpoint_path: str


class FFAMModePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_mode_v1"
    base_predictor: HistoricalBucketPriorPredictor
    policy_name: str = "exploration_r3"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=512, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    operator_ridge_lambda: float = Field(default=8.0, ge=0.0)
    posterior_ridge_lambda: float = Field(default=8.0, gt=0.0)
    projected_mode_dim: int = Field(default=3, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.02, gt=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    residual_class_scale: np.ndarray = Field(
        default_factory=lambda: np.asarray([1.0, 0.8, 0.7, 0.7, 0.95, 1.0], dtype=np.float64),
    )
    beta_min: float = Field(default=2.0, ge=0.0)
    beta_scale: float = Field(default=8.0, ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    delta_clip: float = Field(default=4.0, gt=0.0)
    include_interactions: bool = False
    operator_target: str = "logit_delta"
    entropy_weight_power: float = Field(default=1.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.0, ge=0.0)
    delta_smooth_sigma: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "motif_v1"
    posterior_input_source: str = "regime_input"
    posterior_summary_variant: SummaryVariant = "v3"
    posterior_method: str = "particle_mixture"
    posterior_residual_hidden_dim: int = Field(default=0, ge=0)
    posterior_residual_steps: int = Field(default=0, ge=0)
    posterior_residual_learning_rate: float = Field(default=0.0, ge=0.0)
    posterior_residual_weight_decay: float = Field(default=0.0, ge=0.0)
    posterior_residual_scale: float = Field(default=1.0, ge=0.0)
    decoder_method: str = "mode_projection"
    decoder_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    decoder_particle_ood_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    hazard_decoder_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    hazard_decoder_ood_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_method: str = "pca"
    cluster_count: int = Field(default=1, ge=1)
    mode_feature_names: tuple[str, ...] = ()
    posterior_input_names: tuple[str, ...] = ()
    mode_round_ids: tuple[str, ...] = ()
    base_operator_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    round_operator_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    mode_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    mode_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_input_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_input_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    posterior_metric_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_metric_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_round_index_bank: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.int64))
    posterior_kernel_alpha: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_fallback_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_fallback_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_residual_weight_in: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_residual_bias_in: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_residual_weight_out: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_residual_bias_out: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    quadratic_decoder_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    quadratic_decoder_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    hazard_decoder_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    hazard_decoder_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    round_cluster_ids: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.int64))
    cluster_operator_mean_bank: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    cluster_basis_bank: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1, 1), dtype=np.float64))
    cluster_effective_dims: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.int64))
    posterior_cluster_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_cluster_id_bank: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.int64))

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMModePredictor:
        config = resolve_ffam_mode_config(
            model_name,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        return cls.fit_from_config(paths, config=config, round_ids=round_ids)

    @classmethod
    def fit_from_config(
        cls,
        paths: WorkspacePaths,
        *,
        config: FFAMModeConfig,
        round_ids: list[str] | None = None,
    ) -> FFAMModePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("ffam mode requires at least one analyzed round with replay data")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        round_entries: list[dict[str, object]] = []
        mode_feature_names = _mode_feature_names(include_interactions=config.include_interactions)

        for round_id in selected_round_ids:
            round_detail = read_round_record(paths, round_id).round
            features = compute_round_features(round_detail)
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
            round_entries.append(
                {
                    "round_id": round_id,
                    "round_detail": round_detail,
                    "features": features,
                    "prior_bundle": prior_bundle,
                    "analyses": analyses,
                },
            )

        if not round_entries:
            raise ValueError("ffam mode found no analyzed rounds to fit modes")

        seed_count = int(round_entries[0]["round_detail"].seeds_count)
        posterior_input_names = _posterior_input_names(
            seed_count=seed_count,
            posterior_input_source=config.posterior_input_source,
            regime_input_variant=config.regime_input_variant,
            posterior_summary_variant=config.posterior_summary_variant,
        )
        global_operator_vector = _fit_mode_operator_vector(
            round_entries,
            cells_per_seed=config.cells_per_seed,
            ridge_lambda=config.operator_ridge_lambda,
            probability_floor=config.probability_floor,
            include_interactions=config.include_interactions,
            operator_target=config.operator_target,
            entropy_weight_power=config.entropy_weight_power,
        )
        round_operator_vectors: list[np.ndarray] = []
        mode_round_ids: list[str] = []
        for entry in round_entries:
            round_operator = _fit_mode_operator_vector(
                [entry],
                cells_per_seed=config.cells_per_seed,
                ridge_lambda=config.operator_ridge_lambda,
                probability_floor=config.probability_floor,
                include_interactions=config.include_interactions,
                operator_target=config.operator_target,
                entropy_weight_power=config.entropy_weight_power,
            )
            round_operator_vectors.append(round_operator)
            mode_round_ids.append(str(entry["round_id"]))

        round_operator_bank = np.stack(round_operator_vectors, axis=0).astype(np.float64)
        residual_bank = round_operator_bank - global_operator_vector[None, :]
        residual_mean = np.mean(residual_bank, axis=0)
        base_operator_vector = np.asarray(global_operator_vector + residual_mean, dtype=np.float64)
        centered_bank = residual_bank - residual_mean[None, :]
        _, _, vt_matrix = np.linalg.svd(centered_bank, full_matrices=False)
        effective_dim = max(1, min(config.projected_mode_dim, vt_matrix.shape[0]))
        mode_basis = np.asarray(vt_matrix[:effective_dim], dtype=np.float64)
        mode_coord_bank = np.asarray(centered_bank @ mode_basis.T, dtype=np.float64)
        quadratic_decoder_intercept, quadratic_decoder_weights = _fit_linear_map(
            _quadratic_coord_features(mode_coord_bank),
            round_operator_bank,
            ridge_alpha=config.operator_ridge_lambda,
        )
        hazard_decoder_intercept = np.zeros(1, dtype=np.float64)
        hazard_decoder_weights = np.zeros((1, 1), dtype=np.float64)
        if config.hazard_decoder_blend > 0.0 or config.hazard_decoder_ood_scale > 0.0:
            hazard_coefficient_bank = np.stack(
                [
                    fit_round_semimechanistic_coefficients(
                        build_round_episode(paths, round_id),
                    ).combined_vector()
                    for round_id in mode_round_ids
                ],
                axis=0,
            ).astype(np.float64)
            hazard_decoder_intercept, hazard_decoder_weights = _fit_linear_map(
                mode_coord_bank,
                hazard_coefficient_bank,
                ridge_alpha=config.operator_ridge_lambda,
            )
        effective_cluster_count = max(1, min(config.cluster_count, mode_coord_bank.shape[0]))
        round_cluster_ids = _cluster_mode_vectors(
            mode_coord_bank,
            cluster_count=effective_cluster_count,
        )
        operator_dim = int(round_operator_bank.shape[1])
        cluster_operator_mean_bank = np.zeros((effective_cluster_count, operator_dim), dtype=np.float64)
        cluster_basis_bank = np.zeros(
            (effective_cluster_count, config.projected_mode_dim, operator_dim),
            dtype=np.float64,
        )
        cluster_effective_dims = np.zeros(effective_cluster_count, dtype=np.int64)
        round_cluster_coord_bank = np.zeros(
            (round_operator_bank.shape[0], config.projected_mode_dim),
            dtype=np.float64,
        )
        for cluster_index in range(effective_cluster_count):
            cluster_mask = round_cluster_ids == cluster_index
            cluster_bank = np.asarray(round_operator_bank[cluster_mask], dtype=np.float64)
            if cluster_bank.shape[0] == 0:
                continue
            cluster_mean = np.mean(cluster_bank, axis=0)
            cluster_operator_mean_bank[cluster_index] = cluster_mean
            if cluster_bank.shape[0] <= 1:
                continue
            cluster_centered = cluster_bank - cluster_mean[None, :]
            _, _, cluster_vt = np.linalg.svd(cluster_centered, full_matrices=False)
            cluster_dim = max(1, min(config.projected_mode_dim, cluster_vt.shape[0]))
            cluster_basis_bank[cluster_index, :cluster_dim] = cluster_vt[:cluster_dim]
            cluster_effective_dims[cluster_index] = cluster_dim
            round_cluster_coord_bank[cluster_mask, :cluster_dim] = (
                cluster_centered @ cluster_vt[:cluster_dim].T
            )

        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
            dataset_version=config.synthetic_dataset_version,
            round_ids=selected_round_ids,
        )
        index_table = pl.read_parquet(index_path).filter(pl.col("round_id").is_in(mode_round_ids))
        rows = index_table.to_dicts()
        if not rows:
            raise ValueError("ffam mode synthetic transcript dataset is empty for selected rounds")

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        coord_by_round = {
            round_id: mode_coord_bank[index]
            for index, round_id in enumerate(mode_round_ids)
        }
        round_index_by_id = {
            round_id: index
            for index, round_id in enumerate(mode_round_ids)
        }
        entry_by_round = {
            str(entry["round_id"]): entry
            for entry in round_entries
        }
        posterior_inputs: list[np.ndarray] = []
        posterior_fallback_inputs: list[np.ndarray] = []
        posterior_targets: list[np.ndarray] = []
        posterior_round_indexes: list[int] = []
        posterior_cluster_coords: list[np.ndarray] = []
        posterior_cluster_ids: list[int] = []
        for row in rows:
            round_id = str(row["round_id"])
            if round_id not in entry_by_round or round_id not in coord_by_round:
                continue
            entry = entry_by_round[round_id]
            artifact = load_synthetic_episode(Path(str(row["episode_path"])))
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in config.budget_prefixes})
            for budget in budget_values:
                observations = full_observations[:budget]
                derived = _derive_transcript_features_from_stats(
                    entry["round_detail"],  # type: ignore[arg-type]
                    entry["features"],  # type: ignore[arg-type]
                    entry["prior_bundle"],  # type: ignore[arg-type]
                    _stats_from_observations(entry["round_detail"], observations),  # type: ignore[arg-type]
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                posterior_input_vector = _posterior_input_vector_from_state(
                    entry["round_detail"],  # type: ignore[arg-type]
                    observations,
                    derived,
                    posterior_input_source=config.posterior_input_source,
                    regime_input_variant=config.regime_input_variant,
                    posterior_summary_variant=config.posterior_summary_variant,
                )
                if posterior_input_vector is None:
                    continue
                posterior_inputs.append(np.asarray(posterior_input_vector, dtype=np.float64))
                posterior_fallback_inputs.append(
                    _regime_input_vector(
                        derived,
                        variant=config.regime_input_variant,
                    ),
                )
                posterior_targets.append(np.asarray(coord_by_round[round_id], dtype=np.float64))
                round_index = int(round_index_by_id[round_id])
                posterior_round_indexes.append(round_index)
                posterior_cluster_coords.append(np.asarray(round_cluster_coord_bank[round_index], dtype=np.float64))
                posterior_cluster_ids.append(int(round_cluster_ids[round_index]))

        posterior_input_matrix = np.stack(posterior_inputs, axis=0).astype(np.float64)
        posterior_fallback_input_matrix = np.stack(posterior_fallback_inputs, axis=0).astype(np.float64)
        posterior_target_matrix = np.stack(posterior_targets, axis=0).astype(np.float64)
        posterior_cluster_coord_matrix = np.stack(posterior_cluster_coords, axis=0).astype(np.float64)
        posterior_cluster_id_array = np.asarray(posterior_cluster_ids, dtype=np.int64)
        posterior_intercept, posterior_weights = _fit_linear_map(
            posterior_input_matrix,
            posterior_target_matrix,
            ridge_alpha=config.posterior_ridge_lambda,
        )
        posterior_fallback_intercept, posterior_fallback_weights = _fit_linear_map(
            posterior_fallback_input_matrix,
            posterior_target_matrix,
            ridge_alpha=config.posterior_ridge_lambda,
        )
        posterior_input_mean = np.mean(posterior_input_matrix, axis=0)
        posterior_input_scale = np.std(posterior_input_matrix, axis=0)
        posterior_input_scale = np.where(posterior_input_scale > 1e-6, posterior_input_scale, 1.0)
        standardized_inputs = (posterior_input_matrix - posterior_input_mean[None, :]) / posterior_input_scale[
            None, :
        ]
        posterior_metric_basis = _fit_posterior_metric_basis(
            standardized_inputs,
            posterior_target_matrix,
            metric_dim=config.posterior_metric_dim,
            metric_method=config.posterior_metric_method,
            cluster_ids=posterior_cluster_id_array,
            cluster_count=effective_cluster_count,
        )
        posterior_metric_bank = np.asarray(standardized_inputs @ posterior_metric_basis.T, dtype=np.float64)
        posterior_kernel_alpha = _fit_kernel_ridge_map(
            posterior_metric_bank,
            posterior_target_matrix,
            bandwidth=config.posterior_bandwidth,
            ridge_lambda=config.posterior_ridge_lambda,
        )
        posterior_residual_weight_in = np.zeros((1, 1), dtype=np.float64)
        posterior_residual_bias_in = np.zeros(1, dtype=np.float64)
        posterior_residual_weight_out = np.zeros((1, posterior_target_matrix.shape[1]), dtype=np.float64)
        posterior_residual_bias_out = np.zeros(posterior_target_matrix.shape[1], dtype=np.float64)
        if config.posterior_method == "residual_mlp" and config.posterior_residual_hidden_dim > 0:
            linear_predictions = np.asarray(
                posterior_intercept[None, :] + (posterior_input_matrix @ posterior_weights),
                dtype=np.float64,
            )
            residual_targets = np.asarray(posterior_target_matrix - linear_predictions, dtype=np.float64)
            unique_round_indexes = np.unique(np.asarray(posterior_round_indexes, dtype=np.int64))
            val_mask = np.zeros(len(posterior_round_indexes), dtype=bool)
            if unique_round_indexes.shape[0] >= 4:
                val_round_count = max(1, unique_round_indexes.shape[0] // 4)
                val_rounds = set(int(item) for item in unique_round_indexes[-val_round_count:])
                val_mask = np.asarray(
                    [int(item) in val_rounds for item in posterior_round_indexes],
                    dtype=bool,
                )
            (
                posterior_residual_weight_in,
                posterior_residual_bias_in,
                posterior_residual_weight_out,
                posterior_residual_bias_out,
            ) = _train_residual_mlp(
                standardized_inputs,
                residual_targets,
                hidden_dim=config.posterior_residual_hidden_dim,
                steps=config.posterior_residual_steps,
                learning_rate=config.posterior_residual_learning_rate,
                weight_decay=config.posterior_residual_weight_decay,
                val_mask=val_mask,
                seed=config.posterior_residual_seed,
            )
            if config.posterior_residual_ensemble_seeds > 1:
                ensemble_weights_in = [posterior_residual_weight_in]
                ensemble_biases_in = [posterior_residual_bias_in]
                ensemble_weights_out = [posterior_residual_weight_out]
                ensemble_biases_out = [posterior_residual_bias_out]
                for ensemble_seed in range(1, config.posterior_residual_ensemble_seeds):
                    ew_in, eb_in, ew_out, eb_out = _train_residual_mlp(
                        standardized_inputs,
                        residual_targets,
                        hidden_dim=config.posterior_residual_hidden_dim,
                        steps=config.posterior_residual_steps,
                        learning_rate=config.posterior_residual_learning_rate,
                        weight_decay=config.posterior_residual_weight_decay,
                        val_mask=val_mask,
                        seed=config.posterior_residual_seed + ensemble_seed,
                    )
                    ensemble_weights_in.append(ew_in)
                    ensemble_biases_in.append(eb_in)
                    ensemble_weights_out.append(ew_out)
                    ensemble_biases_out.append(eb_out)
                posterior_residual_weight_in = np.mean(np.stack(ensemble_weights_in), axis=0)
                posterior_residual_bias_in = np.mean(np.stack(ensemble_biases_in), axis=0)
                posterior_residual_weight_out = np.mean(np.stack(ensemble_weights_out), axis=0)
                posterior_residual_bias_out = np.mean(np.stack(ensemble_biases_out), axis=0)

        return cls(
            name=config.model_name,
            base_predictor=base_predictor,
            policy_name=config.policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=config.samples_per_round,
            cells_per_seed=config.cells_per_seed,
            budget_prefixes=tuple(int(item) for item in config.budget_prefixes),
            operator_ridge_lambda=config.operator_ridge_lambda,
            posterior_ridge_lambda=config.posterior_ridge_lambda,
            projected_mode_dim=config.projected_mode_dim,
            probability_floor=config.probability_floor,
            temperature=config.temperature,
            prior_blend=config.prior_blend,
            residual_class_scale=np.asarray(config.residual_class_scale, dtype=np.float64),
            beta_min=config.beta_min,
            beta_scale=config.beta_scale,
            beta_repeat_discount=config.beta_repeat_discount,
            delta_clip=config.delta_clip,
            include_interactions=config.include_interactions,
            operator_target=config.operator_target,
            entropy_weight_power=config.entropy_weight_power,
            spatial_smooth_sigma=config.spatial_smooth_sigma,
            delta_smooth_sigma=config.delta_smooth_sigma,
            synthetic_dataset_version=config.synthetic_dataset_version,
            regime_input_variant=config.regime_input_variant,
            posterior_input_source=config.posterior_input_source,
            posterior_summary_variant=config.posterior_summary_variant,
            posterior_method=config.posterior_method,
            posterior_residual_hidden_dim=config.posterior_residual_hidden_dim,
            posterior_residual_steps=config.posterior_residual_steps,
            posterior_residual_learning_rate=config.posterior_residual_learning_rate,
            posterior_residual_weight_decay=config.posterior_residual_weight_decay,
            posterior_residual_scale=config.posterior_residual_scale,
            decoder_method=config.decoder_method,
            decoder_particle_blend=config.decoder_particle_blend,
            decoder_particle_ood_scale=config.decoder_particle_ood_scale,
            hazard_decoder_blend=config.hazard_decoder_blend,
            hazard_decoder_ood_scale=config.hazard_decoder_ood_scale,
            posterior_metric_dim=config.posterior_metric_dim,
            posterior_neighbor_count=config.posterior_neighbor_count,
            posterior_bandwidth=config.posterior_bandwidth,
            posterior_particle_blend=config.posterior_particle_blend,
            posterior_ood_prior_blend=config.posterior_ood_prior_blend,
            posterior_metric_method=config.posterior_metric_method,
            cluster_count=effective_cluster_count,
            mode_feature_names=tuple(mode_feature_names),
            posterior_input_names=tuple(posterior_input_names),
            mode_round_ids=tuple(mode_round_ids),
            base_operator_vector=base_operator_vector,
            round_operator_bank=round_operator_bank,
            mode_basis=mode_basis,
            mode_coord_bank=mode_coord_bank,
            posterior_intercept=np.asarray(posterior_intercept, dtype=np.float64),
            posterior_weights=np.asarray(posterior_weights, dtype=np.float64),
            posterior_input_mean=np.asarray(posterior_input_mean, dtype=np.float64),
            posterior_input_scale=np.asarray(posterior_input_scale, dtype=np.float64),
            posterior_metric_basis=np.asarray(posterior_metric_basis, dtype=np.float64),
            posterior_metric_bank=np.asarray(posterior_metric_bank, dtype=np.float64),
            posterior_coord_bank=np.asarray(posterior_target_matrix, dtype=np.float64),
            posterior_round_index_bank=np.asarray(posterior_round_indexes, dtype=np.int64),
            posterior_kernel_alpha=np.asarray(posterior_kernel_alpha, dtype=np.float64),
            posterior_fallback_intercept=np.asarray(posterior_fallback_intercept, dtype=np.float64),
            posterior_fallback_weights=np.asarray(posterior_fallback_weights, dtype=np.float64),
            posterior_residual_weight_in=np.asarray(posterior_residual_weight_in, dtype=np.float64),
            posterior_residual_bias_in=np.asarray(posterior_residual_bias_in, dtype=np.float64),
            posterior_residual_weight_out=np.asarray(posterior_residual_weight_out, dtype=np.float64),
            posterior_residual_bias_out=np.asarray(posterior_residual_bias_out, dtype=np.float64),
            quadratic_decoder_intercept=np.asarray(quadratic_decoder_intercept, dtype=np.float64),
            quadratic_decoder_weights=np.asarray(quadratic_decoder_weights, dtype=np.float64),
            hazard_decoder_intercept=np.asarray(hazard_decoder_intercept, dtype=np.float64),
            hazard_decoder_weights=np.asarray(hazard_decoder_weights, dtype=np.float64),
            round_cluster_ids=np.asarray(round_cluster_ids, dtype=np.int64),
            cluster_operator_mean_bank=np.asarray(cluster_operator_mean_bank, dtype=np.float64),
            cluster_basis_bank=np.asarray(cluster_basis_bank, dtype=np.float64),
            cluster_effective_dims=np.asarray(cluster_effective_dims, dtype=np.int64),
            posterior_cluster_coord_bank=np.asarray(posterior_cluster_coord_matrix, dtype=np.float64),
            posterior_cluster_id_bank=np.asarray(posterior_cluster_id_array, dtype=np.int64),
        )

    def checkpoint(
        self,
        *,
        arrays_path: Path,
        base_checkpoint_path: Path,
    ) -> FFAMModePredictorCheckpoint:
        return FFAMModePredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            cells_per_seed=self.cells_per_seed,
            budget_prefixes=list(self.budget_prefixes),
            operator_ridge_lambda=self.operator_ridge_lambda,
            posterior_ridge_lambda=self.posterior_ridge_lambda,
            projected_mode_dim=self.projected_mode_dim,
            probability_floor=self.probability_floor,
            temperature=self.temperature,
            prior_blend=self.prior_blend,
            residual_class_scale=np.asarray(self.residual_class_scale, dtype=np.float64).tolist(),
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            beta_repeat_discount=self.beta_repeat_discount,
            synthetic_dataset_version=self.synthetic_dataset_version,
            regime_input_variant=self.regime_input_variant,
            posterior_input_source=self.posterior_input_source,
            posterior_summary_variant=self.posterior_summary_variant,
            posterior_method=self.posterior_method,
            posterior_residual_hidden_dim=self.posterior_residual_hidden_dim,
            posterior_residual_steps=self.posterior_residual_steps,
            posterior_residual_learning_rate=self.posterior_residual_learning_rate,
            posterior_residual_weight_decay=self.posterior_residual_weight_decay,
            posterior_residual_scale=self.posterior_residual_scale,
            decoder_method=self.decoder_method,
            decoder_particle_blend=self.decoder_particle_blend,
            decoder_particle_ood_scale=self.decoder_particle_ood_scale,
            hazard_decoder_blend=self.hazard_decoder_blend,
            hazard_decoder_ood_scale=self.hazard_decoder_ood_scale,
            posterior_metric_dim=self.posterior_metric_dim,
            posterior_neighbor_count=self.posterior_neighbor_count,
            posterior_bandwidth=self.posterior_bandwidth,
            posterior_particle_blend=self.posterior_particle_blend,
            posterior_ood_prior_blend=self.posterior_ood_prior_blend,
            posterior_metric_method=self.posterior_metric_method,
            cluster_count=self.cluster_count,
            mode_feature_names=list(self.mode_feature_names),
            posterior_input_names=list(self.posterior_input_names),
            mode_round_ids=list(self.mode_round_ids),
            arrays_path=str(arrays_path),
            base_checkpoint_path=str(base_checkpoint_path),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        arrays_path = path.parent / "mode_basis.npz"
        np.savez_compressed(
            arrays_path,
            base_operator_vector=self.base_operator_vector,
            round_operator_bank=self.round_operator_bank,
            mode_basis=self.mode_basis,
            mode_coord_bank=self.mode_coord_bank,
            posterior_intercept=self.posterior_intercept,
            posterior_weights=self.posterior_weights,
            posterior_input_mean=self.posterior_input_mean,
            posterior_input_scale=self.posterior_input_scale,
            posterior_metric_basis=self.posterior_metric_basis,
            posterior_metric_bank=self.posterior_metric_bank,
            posterior_coord_bank=self.posterior_coord_bank,
            posterior_round_index_bank=self.posterior_round_index_bank,
            posterior_kernel_alpha=self.posterior_kernel_alpha,
            posterior_fallback_intercept=self.posterior_fallback_intercept,
            posterior_fallback_weights=self.posterior_fallback_weights,
            posterior_residual_weight_in=self.posterior_residual_weight_in,
            posterior_residual_bias_in=self.posterior_residual_bias_in,
            posterior_residual_weight_out=self.posterior_residual_weight_out,
            posterior_residual_bias_out=self.posterior_residual_bias_out,
            quadratic_decoder_intercept=self.quadratic_decoder_intercept,
            quadratic_decoder_weights=self.quadratic_decoder_weights,
            hazard_decoder_intercept=self.hazard_decoder_intercept,
            hazard_decoder_weights=self.hazard_decoder_weights,
            round_cluster_ids=self.round_cluster_ids,
            cluster_operator_mean_bank=self.cluster_operator_mean_bank,
            cluster_basis_bank=self.cluster_basis_bank,
            cluster_effective_dims=self.cluster_effective_dims,
            posterior_cluster_coord_bank=self.posterior_cluster_coord_bank,
            posterior_cluster_id_bank=self.posterior_cluster_id_bank,
        )
        base_checkpoint_path = self.base_predictor.save_checkpoint(path.parent / "base_prior.json")
        path.write_text(
            json.dumps(
                to_jsonable(
                    self.checkpoint(
                        arrays_path=arrays_path,
                        base_checkpoint_path=base_checkpoint_path,
                    ),
                ),
                indent=2,
            ),
            encoding="utf-8",
        )
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> FFAMModePredictor:
        checkpoint = FFAMModePredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.arrays_path)
        return cls(
            name=checkpoint.name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(
                Path(checkpoint.base_checkpoint_path),
            ),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            cells_per_seed=checkpoint.cells_per_seed,
            budget_prefixes=tuple(checkpoint.budget_prefixes),
            operator_ridge_lambda=checkpoint.operator_ridge_lambda,
            posterior_ridge_lambda=checkpoint.posterior_ridge_lambda,
            projected_mode_dim=checkpoint.projected_mode_dim,
            probability_floor=checkpoint.probability_floor,
            temperature=checkpoint.temperature,
            prior_blend=checkpoint.prior_blend,
            residual_class_scale=np.asarray(checkpoint.residual_class_scale, dtype=np.float64),
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            beta_repeat_discount=checkpoint.beta_repeat_discount,
            synthetic_dataset_version=checkpoint.synthetic_dataset_version,
            regime_input_variant=checkpoint.regime_input_variant,
            posterior_input_source=checkpoint.posterior_input_source,
            posterior_summary_variant=checkpoint.posterior_summary_variant,
            posterior_method=checkpoint.posterior_method,
            posterior_residual_hidden_dim=checkpoint.posterior_residual_hidden_dim,
            posterior_residual_steps=checkpoint.posterior_residual_steps,
            posterior_residual_learning_rate=checkpoint.posterior_residual_learning_rate,
            posterior_residual_weight_decay=checkpoint.posterior_residual_weight_decay,
            posterior_residual_scale=checkpoint.posterior_residual_scale,
            decoder_method=checkpoint.decoder_method,
            decoder_particle_blend=checkpoint.decoder_particle_blend,
            decoder_particle_ood_scale=checkpoint.decoder_particle_ood_scale,
            hazard_decoder_blend=checkpoint.hazard_decoder_blend,
            hazard_decoder_ood_scale=checkpoint.hazard_decoder_ood_scale,
            posterior_metric_dim=checkpoint.posterior_metric_dim,
            posterior_neighbor_count=checkpoint.posterior_neighbor_count,
            posterior_bandwidth=checkpoint.posterior_bandwidth,
            posterior_particle_blend=checkpoint.posterior_particle_blend,
            posterior_ood_prior_blend=checkpoint.posterior_ood_prior_blend,
            posterior_metric_method=checkpoint.posterior_metric_method,
            cluster_count=checkpoint.cluster_count,
            mode_feature_names=tuple(checkpoint.mode_feature_names),
            posterior_input_names=tuple(checkpoint.posterior_input_names),
            mode_round_ids=tuple(checkpoint.mode_round_ids),
            base_operator_vector=np.asarray(arrays["base_operator_vector"], dtype=np.float64),
            round_operator_bank=np.asarray(
                arrays["round_operator_bank"] if "round_operator_bank" in arrays else np.zeros((0, 1)),
                dtype=np.float64,
            ),
            mode_basis=np.asarray(arrays["mode_basis"], dtype=np.float64),
            mode_coord_bank=np.asarray(arrays["mode_coord_bank"], dtype=np.float64),
            posterior_intercept=np.asarray(arrays["posterior_intercept"], dtype=np.float64),
            posterior_weights=np.asarray(arrays["posterior_weights"], dtype=np.float64),
            posterior_input_mean=np.asarray(arrays["posterior_input_mean"], dtype=np.float64),
            posterior_input_scale=np.asarray(arrays["posterior_input_scale"], dtype=np.float64),
            posterior_metric_basis=np.asarray(arrays["posterior_metric_basis"], dtype=np.float64),
            posterior_metric_bank=np.asarray(arrays["posterior_metric_bank"], dtype=np.float64),
            posterior_coord_bank=np.asarray(arrays["posterior_coord_bank"], dtype=np.float64),
            posterior_round_index_bank=np.asarray(
                arrays["posterior_round_index_bank"] if "posterior_round_index_bank" in arrays else np.zeros(0),
                dtype=np.int64,
            ),
            posterior_kernel_alpha=np.asarray(
                arrays["posterior_kernel_alpha"] if "posterior_kernel_alpha" in arrays else np.zeros((0, 1)),
                dtype=np.float64,
            ),
            posterior_fallback_intercept=np.asarray(
                arrays["posterior_fallback_intercept"]
                if "posterior_fallback_intercept" in arrays
                else arrays["posterior_intercept"],
                dtype=np.float64,
            ),
            posterior_fallback_weights=np.asarray(
                arrays["posterior_fallback_weights"]
                if "posterior_fallback_weights" in arrays
                else arrays["posterior_weights"],
                dtype=np.float64,
            ),
            posterior_residual_weight_in=np.asarray(
                arrays["posterior_residual_weight_in"]
                if "posterior_residual_weight_in" in arrays
                else np.zeros((1, 1)),
                dtype=np.float64,
            ),
            posterior_residual_bias_in=np.asarray(
                arrays["posterior_residual_bias_in"] if "posterior_residual_bias_in" in arrays else np.zeros(1),
                dtype=np.float64,
            ),
            posterior_residual_weight_out=np.asarray(
                arrays["posterior_residual_weight_out"]
                if "posterior_residual_weight_out" in arrays
                else np.zeros((1, arrays["posterior_intercept"].shape[0]), dtype=np.float64),
                dtype=np.float64,
            ),
            posterior_residual_bias_out=np.asarray(
                arrays["posterior_residual_bias_out"]
                if "posterior_residual_bias_out" in arrays
                else np.zeros(arrays["posterior_intercept"].shape[0], dtype=np.float64),
                dtype=np.float64,
            ),
            quadratic_decoder_intercept=np.asarray(
                arrays["quadratic_decoder_intercept"]
                if "quadratic_decoder_intercept" in arrays
                else arrays["base_operator_vector"],
                dtype=np.float64,
            ),
            quadratic_decoder_weights=np.asarray(
                arrays["quadratic_decoder_weights"]
                if "quadratic_decoder_weights" in arrays
                else np.zeros((1, arrays["base_operator_vector"].shape[0]), dtype=np.float64),
                dtype=np.float64,
            ),
            hazard_decoder_intercept=np.asarray(
                arrays["hazard_decoder_intercept"] if "hazard_decoder_intercept" in arrays else np.zeros(1),
                dtype=np.float64,
            ),
            hazard_decoder_weights=np.asarray(
                arrays["hazard_decoder_weights"] if "hazard_decoder_weights" in arrays else np.zeros((1, 1)),
                dtype=np.float64,
            ),
            round_cluster_ids=np.asarray(
                arrays["round_cluster_ids"] if "round_cluster_ids" in arrays else np.zeros(0),
                dtype=np.int64,
            ),
            cluster_operator_mean_bank=np.asarray(
                arrays["cluster_operator_mean_bank"] if "cluster_operator_mean_bank" in arrays else np.zeros((1, 1)),
                dtype=np.float64,
            ),
            cluster_basis_bank=np.asarray(
                arrays["cluster_basis_bank"] if "cluster_basis_bank" in arrays else np.zeros((1, 1, 1)),
                dtype=np.float64,
            ),
            cluster_effective_dims=np.asarray(
                arrays["cluster_effective_dims"] if "cluster_effective_dims" in arrays else np.zeros(1),
                dtype=np.int64,
            ),
            posterior_cluster_coord_bank=np.asarray(
                arrays["posterior_cluster_coord_bank"]
                if "posterior_cluster_coord_bank" in arrays
                else np.zeros((0, 1)),
                dtype=np.float64,
            ),
            posterior_cluster_id_bank=np.asarray(
                arrays["posterior_cluster_id_bank"] if "posterior_cluster_id_bank" in arrays else np.zeros(0),
                dtype=np.int64,
            ),
        )

    def _posterior_metric_input(self, input_vector: np.ndarray) -> np.ndarray:
        standardized = (input_vector - self.posterior_input_mean) / np.maximum(self.posterior_input_scale, 1e-6)
        return np.asarray(standardized @ self.posterior_metric_basis.T, dtype=np.float64)

    def _kernel_weights(self, distances: np.ndarray) -> np.ndarray:
        weights = np.exp(-0.5 * np.square(distances / max(self.posterior_bandwidth, 1e-6)))
        weight_sum = float(np.sum(weights))
        if weight_sum <= 0.0 or not np.isfinite(weight_sum):
            return np.full(distances.shape[0], 1.0 / max(distances.shape[0], 1), dtype=np.float64)
        return np.asarray(weights / weight_sum, dtype=np.float64)

    def _distance_confidence(self, local_distances: np.ndarray) -> float:
        if local_distances.size == 0:
            return 0.0
        anchor = float(np.mean(local_distances[: max(1, min(3, local_distances.shape[0]))]))
        confidence = np.exp(-0.5 * np.square(anchor / max(self.posterior_bandwidth, 1e-6)))
        return float(np.clip(confidence, 0.0, 1.0))

    def _posterior_neighbors(
        self,
        input_vector: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
        if self.posterior_metric_bank.shape[0] == 0:
            return (
                np.zeros(0, dtype=np.int64),
                np.zeros(0, dtype=np.float64),
                np.zeros(0, dtype=np.float64),
                0.0,
            )
        metric_input = self._posterior_metric_input(input_vector)
        distances = np.linalg.norm(self.posterior_metric_bank - metric_input[None, :], axis=1)
        neighbor_count = min(int(self.posterior_neighbor_count), int(self.posterior_metric_bank.shape[0]))
        indexes = np.argsort(distances)[:neighbor_count]
        local_distances = np.asarray(distances[indexes], dtype=np.float64)
        weights = self._kernel_weights(local_distances)
        return (
            np.asarray(indexes, dtype=np.int64),
            local_distances,
            weights,
            self._distance_confidence(local_distances),
        )

    def _particle_coords(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        if self.posterior_metric_bank.shape[0] == 0 or self.posterior_coord_bank.shape[0] == 0:
            coords = np.asarray(self.posterior_intercept + (input_vector @ self.posterior_weights), dtype=np.float64)
            return coords, 1.0
        indexes, local_distances, weights, confidence = self._posterior_neighbors(input_vector)
        coords = np.sum(weights[:, None] * self.posterior_coord_bank[indexes], axis=0)
        return np.asarray(coords, dtype=np.float64), confidence

    def _local_linear_coords(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        if self.posterior_metric_bank.shape[0] == 0 or self.posterior_coord_bank.shape[0] == 0:
            coords = np.asarray(self.posterior_intercept + (input_vector @ self.posterior_weights), dtype=np.float64)
            return coords, 1.0
        metric_input = self._posterior_metric_input(input_vector)
        indexes, local_distances, weights, confidence = self._posterior_neighbors(input_vector)
        local_metric = np.asarray(self.posterior_metric_bank[indexes], dtype=np.float64)
        local_coords = np.asarray(self.posterior_coord_bank[indexes], dtype=np.float64)
        centered_metric = local_metric - metric_input[None, :]
        augmented = np.concatenate(
            [np.ones((centered_metric.shape[0], 1), dtype=np.float64), centered_metric],
            axis=1,
        )
        regularizer = np.eye(augmented.shape[1], dtype=np.float64)
        regularizer[0, 0] = 0.0
        solved = np.linalg.solve(
            augmented.T @ (weights[:, None] * augmented)
            + (self.posterior_ridge_lambda * regularizer)
            + 1e-6 * np.eye(augmented.shape[1], dtype=np.float64),
            augmented.T @ (weights[:, None] * local_coords),
        )
        coords = np.asarray(solved[0], dtype=np.float64)
        return coords, confidence

    def _kernel_ridge_coords(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        if self.posterior_metric_bank.shape[0] == 0 or self.posterior_kernel_alpha.shape[0] == 0:
            coords = np.asarray(self.posterior_intercept + (input_vector @ self.posterior_weights), dtype=np.float64)
            return coords, 1.0
        metric_input = self._posterior_metric_input(input_vector)
        squared_distances = np.sum(np.square(self.posterior_metric_bank - metric_input[None, :]), axis=1)
        bandwidth_sq = max(float(self.posterior_bandwidth) ** 2, 1e-6)
        kernel = np.exp(-0.5 * squared_distances / bandwidth_sq)
        coords = np.asarray(kernel @ self.posterior_kernel_alpha, dtype=np.float64)
        confidence = float(np.clip(np.max(kernel), 0.0, 1.0))
        return coords, confidence

    def _residual_mlp_coords(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        linear_coords = np.asarray(
            self.posterior_intercept + (input_vector @ self.posterior_weights),
            dtype=np.float64,
        )
        if self.posterior_metric_bank.shape[0] == 0:
            confidence = 1.0
        else:
            _, _, _, confidence = self._posterior_neighbors(input_vector)
        if (
            self.posterior_residual_hidden_dim <= 0
            or self.posterior_residual_weight_in.ndim != 2
            or self.posterior_residual_weight_out.ndim != 2
            or self.posterior_residual_weight_in.shape[0] != input_vector.shape[0]
            or self.posterior_residual_weight_out.shape[1] != linear_coords.shape[0]
            or self.posterior_residual_weight_in.shape[1] != self.posterior_residual_weight_out.shape[0]
        ):
            return linear_coords, confidence
        standardized_input = np.asarray(
            (input_vector - self.posterior_input_mean) / np.maximum(self.posterior_input_scale, 1e-6),
            dtype=np.float64,
        )
        _, residual = _mlp_forward(
            standardized_input[None, :],
            self.posterior_residual_weight_in,
            self.posterior_residual_bias_in,
            self.posterior_residual_weight_out,
            self.posterior_residual_bias_out,
        )
        gated_scale = float(self.posterior_residual_scale) * float(np.clip(confidence, 0.0, 1.0))
        coords = np.asarray(linear_coords + (gated_scale * residual[0]), dtype=np.float64)
        return coords, confidence

    def _fallback_mode_coords(
        self,
        fallback_input_vector: np.ndarray | None,
    ) -> tuple[np.ndarray, float]:
        if fallback_input_vector is None:
            return np.zeros(self.mode_basis.shape[0], dtype=np.float64), 0.0
        coords = np.asarray(
            self.posterior_fallback_intercept + (fallback_input_vector @ self.posterior_fallback_weights),
            dtype=np.float64,
        )
        return coords, 0.0

    def _predict_mode_coords(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        if input_vector is None:
            return self._fallback_mode_coords(fallback_input_vector)
        if self.posterior_method == "particle_mixture":
            return self._particle_coords(input_vector)
        if self.posterior_method == "local_linear":
            return self._local_linear_coords(input_vector)
        if self.posterior_method == "kernel_ridge":
            return self._kernel_ridge_coords(input_vector)
        if self.posterior_method == "residual_mlp":
            return self._residual_mlp_coords(input_vector)
        particle_coords, particle_confidence = self._particle_coords(input_vector)
        local_coords, local_confidence = self._local_linear_coords(input_vector)
        blend = float(np.clip(self.posterior_particle_blend, 0.0, 1.0))
        coords = (blend * particle_coords) + ((1.0 - blend) * local_coords)
        confidence = max(particle_confidence, local_confidence)
        return np.asarray(coords, dtype=np.float64), confidence

    def _mode_projection_operator_vector(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        mode_coords, posterior_confidence = self._predict_mode_coords(
            input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        operator_vector = np.asarray(self.base_operator_vector + (mode_coords @ self.mode_basis), dtype=np.float64)
        return operator_vector, posterior_confidence

    def _quadratic_mode_projection_operator_vector(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        mode_coords, posterior_confidence = self._predict_mode_coords(
            input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        coord_features = _quadratic_coord_features(mode_coords)
        operator_vector = np.asarray(
            self.quadratic_decoder_intercept + (coord_features @ self.quadratic_decoder_weights),
            dtype=np.float64,
        )
        return operator_vector, posterior_confidence

    def _particle_operator_vector(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        if self.round_operator_bank.shape[0] == 0 or self.posterior_round_index_bank.shape[0] == 0:
            return np.asarray(self.base_operator_vector, dtype=np.float64), 0.0
        indexes, _, weights, confidence = self._posterior_neighbors(input_vector)
        if indexes.size == 0:
            return np.asarray(self.base_operator_vector, dtype=np.float64), 0.0
        round_weights = np.zeros(self.round_operator_bank.shape[0], dtype=np.float64)
        for row_index, weight in zip(indexes, weights, strict=False):
            round_index = int(self.posterior_round_index_bank[int(row_index)])
            round_weights[round_index] += float(weight)
        weight_sum = float(np.sum(round_weights))
        if weight_sum <= 0.0 or not np.isfinite(weight_sum):
            round_weights = np.full(
                self.round_operator_bank.shape[0],
                1.0 / max(self.round_operator_bank.shape[0], 1),
                dtype=np.float64,
            )
        else:
            round_weights = round_weights / weight_sum
        operator_vector = np.asarray(round_weights @ self.round_operator_bank, dtype=np.float64)
        return operator_vector, confidence

    def _predict_operator_vector(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        if input_vector is None:
            return self._mode_projection_operator_vector(
                input_vector,
                fallback_input_vector=fallback_input_vector,
            )
        if self.decoder_method == "mode_projection":
            return self._mode_projection_operator_vector(
                input_vector,
                fallback_input_vector=fallback_input_vector,
            )
        if self.decoder_method == "quadratic_mode_projection":
            return self._quadratic_mode_projection_operator_vector(
                input_vector,
                fallback_input_vector=fallback_input_vector,
            )
        if self.decoder_method == "operator_particle_mixture":
            return self._particle_operator_vector(input_vector)
        if self.decoder_method == "cluster_mode_projection":
            return self._cluster_mode_projection_operator_vector(
                input_vector,
                fallback_input_vector=fallback_input_vector,
            )
        if self.decoder_method == "cluster_operator_hybrid":
            return self._cluster_particle_hybrid_operator_vector(
                input_vector,
                fallback_input_vector=fallback_input_vector,
            )
        mode_operator, mode_confidence = self._mode_projection_operator_vector(
            input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        particle_operator, particle_confidence = self._particle_operator_vector(input_vector)
        blend = float(np.clip(self.decoder_particle_blend, 0.0, 1.0))
        operator_vector = (blend * particle_operator) + ((1.0 - blend) * mode_operator)
        return np.asarray(operator_vector, dtype=np.float64), max(mode_confidence, particle_confidence)

    def _cluster_mode_projection_operator_vector(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        global_operator, global_confidence = self._mode_projection_operator_vector(
            input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        if (
            input_vector is None
            or self.posterior_metric_bank.shape[0] == 0
            or self.cluster_count <= 1
            or self.posterior_cluster_id_bank.shape[0] == 0
            or self.cluster_operator_mean_bank.shape[0] == 0
        ):
            return global_operator, global_confidence
        metric_input = self._posterior_metric_input(input_vector)
        indexes, _, weights, confidence = self._posterior_neighbors(input_vector)
        if indexes.size == 0:
            return global_operator, global_confidence
        neighbor_cluster_ids = np.asarray(self.posterior_cluster_id_bank[indexes], dtype=np.int64)
        cluster_weights = np.bincount(
            neighbor_cluster_ids,
            weights=weights,
            minlength=max(int(self.cluster_count), 1),
        ).astype(np.float64)
        total_weight = float(np.sum(cluster_weights))
        if total_weight <= 0.0 or not np.isfinite(total_weight):
            return global_operator, global_confidence
        cluster_weights /= total_weight

        cluster_operator = np.zeros_like(global_operator, dtype=np.float64)
        active_weight = 0.0
        for cluster_index, cluster_weight in enumerate(cluster_weights):
            if cluster_weight <= 0.0:
                continue
            cluster_mask = neighbor_cluster_ids == cluster_index
            local_indexes = indexes[cluster_mask]
            if local_indexes.size == 0:
                continue
            local_weights = np.asarray(weights[cluster_mask], dtype=np.float64)
            local_weight_sum = float(np.sum(local_weights))
            if local_weight_sum <= 0.0 or not np.isfinite(local_weight_sum):
                continue
            local_weights = local_weights / local_weight_sum
            cluster_mean = np.asarray(self.cluster_operator_mean_bank[cluster_index], dtype=np.float64)
            cluster_dim = int(self.cluster_effective_dims[min(cluster_index, self.cluster_effective_dims.shape[0] - 1)])
            if cluster_dim <= 0:
                local_operator = cluster_mean
            else:
                local_metric = np.asarray(self.posterior_metric_bank[local_indexes], dtype=np.float64)
                local_coords = np.asarray(
                    self.posterior_cluster_coord_bank[local_indexes, :cluster_dim],
                    dtype=np.float64,
                )
                if local_indexes.size >= 2:
                    centered_metric = local_metric - metric_input[None, :]
                    augmented = np.concatenate(
                        [np.ones((centered_metric.shape[0], 1), dtype=np.float64), centered_metric],
                        axis=1,
                    )
                    regularizer = np.eye(augmented.shape[1], dtype=np.float64)
                    regularizer[0, 0] = 0.0
                    solved = np.linalg.solve(
                        augmented.T @ (local_weights[:, None] * augmented)
                        + (self.posterior_ridge_lambda * regularizer)
                        + 1e-6 * np.eye(augmented.shape[1], dtype=np.float64),
                        augmented.T @ (local_weights[:, None] * local_coords),
                    )
                    cluster_coords = np.asarray(solved[0], dtype=np.float64)
                else:
                    cluster_coords = np.sum(local_weights[:, None] * local_coords, axis=0)
                local_operator = np.asarray(
                    cluster_mean + (cluster_coords @ self.cluster_basis_bank[cluster_index, :cluster_dim]),
                    dtype=np.float64,
                )
            cluster_operator += float(cluster_weight) * local_operator
            active_weight += float(cluster_weight)
        if active_weight <= 0.0:
            return global_operator, global_confidence
        cluster_operator /= active_weight
        blend = float(np.clip(confidence, 0.0, 1.0))
        operator_vector = (blend * cluster_operator) + ((1.0 - blend) * global_operator)
        return np.asarray(operator_vector, dtype=np.float64), max(global_confidence, confidence)

    def _cluster_particle_hybrid_operator_vector(
        self,
        input_vector: np.ndarray | None,
        *,
        fallback_input_vector: np.ndarray | None = None,
    ) -> tuple[np.ndarray, float]:
        cluster_operator, cluster_confidence = self._cluster_mode_projection_operator_vector(
            input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        if input_vector is None:
            return cluster_operator, cluster_confidence
        particle_operator, particle_confidence = self._particle_operator_vector(input_vector)
        base_blend = float(np.clip(self.decoder_particle_blend, 0.0, 1.0))
        ood_scale = float(np.clip(self.decoder_particle_ood_scale, 0.0, 1.0))
        blend = float(np.clip(base_blend + (ood_scale * (1.0 - cluster_confidence)), 0.0, 1.0))
        operator_vector = (blend * particle_operator) + ((1.0 - blend) * cluster_operator)
        return np.asarray(operator_vector, dtype=np.float64), max(cluster_confidence, particle_confidence)

    def _hazard_predictions_by_seed(
        self,
        round_detail: RoundDetail,
        mode_coords: np.ndarray,
    ) -> dict[int, np.ndarray]:
        if self.hazard_decoder_intercept.size <= 1 or self.hazard_decoder_weights.size <= 1:
            return {}
        coefficient_vector = np.asarray(
            self.hazard_decoder_intercept + (mode_coords @ self.hazard_decoder_weights),
            dtype=np.float64,
        )
        round_context = build_round_context_from_detail(round_detail)
        return {
            seed.seed_index: _decode_hazard_tensor(seed.initial_state, coefficient_vector)
            for seed in round_context.seeds
        }

    def _exact_cell_blend(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
        prior: np.ndarray,
    ) -> np.ndarray:
        count_total = np.sum(exact_counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prediction
        prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
        beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / np.log(6.0)))
        if self.beta_repeat_discount > 0.0:
            beta = beta / (1.0 + (self.beta_repeat_discount * np.maximum(count_total - 1.0, 0.0)))
        blended = np.where(
            count_total > 0.0,
            (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
            prediction,
        )
        return np.asarray(blended, dtype=np.float64)

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived,
        *,
        prior_bundle: PredictionBundle | None = None,
        observations: tuple | list | None = None,
    ) -> PredictionBundle:
        effective_prior_bundle = prior_bundle or self.base_predictor.build_prediction_bundle(round_detail, features)
        posterior_input_vector = _posterior_input_vector_from_state(
            round_detail,
            observations,
            derived,
            posterior_input_source=self.posterior_input_source,
            regime_input_variant=self.regime_input_variant,
            posterior_summary_variant=self.posterior_summary_variant,
        )
        fallback_input_vector = None
        if self.posterior_input_source != "regime_input":
            fallback_input_vector = _regime_input_vector(
                derived,
                variant=self.regime_input_variant,
            )
        operator_vector, posterior_confidence = self._predict_operator_vector(
            posterior_input_vector,
            fallback_input_vector=fallback_input_vector,
        )
        hazard_predictions_by_seed: dict[int, np.ndarray] = {}
        hazard_blend = 0.0
        if self.hazard_decoder_blend > 0.0 or self.hazard_decoder_ood_scale > 0.0:
            mode_coords, _ = self._predict_mode_coords(
                posterior_input_vector,
                fallback_input_vector=fallback_input_vector,
            )
            hazard_predictions_by_seed = self._hazard_predictions_by_seed(round_detail, mode_coords)
            hazard_blend = float(
                np.clip(
                    self.hazard_decoder_blend
                    + (self.hazard_decoder_ood_scale * (1.0 - posterior_confidence)),
                    0.0,
                    1.0,
                ),
            )
        intercept, coefficients = _split_mode_operator_vector(
            operator_vector,
            feature_count=len(self.mode_feature_names),
        )
        effective_prior_blend = min(
            1.0,
            self.prior_blend + (self.posterior_ood_prior_blend * (1.0 - posterior_confidence)),
        )
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            prior = np.asarray(effective_prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)
            effective_include_interactions = self.include_interactions or any(
                n.startswith("ix_") for n in self.mode_feature_names
            )
            design = _compose_mode_design_tensor(
                static_stack,
                prior,
                probability_floor=self.probability_floor,
                include_interactions=effective_include_interactions,
            )
            flat_design = design.reshape(-1, len(self.mode_feature_names))
            delta = (intercept[None, :] + flat_design @ coefficients).reshape(prior.shape)
            delta *= np.asarray(self.residual_class_scale, dtype=np.float64)[None, None, :]
            if self.delta_smooth_sigma > 0:
                kernel_radius = max(1, int(3 * self.delta_smooth_sigma))
                ax = np.arange(-kernel_radius, kernel_radius + 1, dtype=np.float64)
                kernel_1d = np.exp(-0.5 * (ax / self.delta_smooth_sigma) ** 2)
                kernel_1d /= np.sum(kernel_1d)
                for c in range(delta.shape[-1]):
                    channel = delta[..., c]
                    for row in range(channel.shape[0]):
                        channel[row] = np.convolve(channel[row], kernel_1d, mode='same')
                    for col in range(channel.shape[1]):
                        channel[:, col] = np.convolve(channel[:, col], kernel_1d, mode='same')
                    delta[..., c] = channel
            if self.operator_target == "prob_delta":
                prediction = np.clip(prior + delta, self.probability_floor, 1.0)
                prediction = prediction / np.sum(prediction, axis=-1, keepdims=True)
            else:
                logits = _safe_log_probs(prior, self.probability_floor) + np.clip(delta, -self.delta_clip, self.delta_clip)
                prediction = softmax_logits(logits)
            if hazard_blend > 0.0 and seed_index in hazard_predictions_by_seed:
                prediction = (
                    ((1.0 - hazard_blend) * prediction)
                    + (hazard_blend * np.asarray(hazard_predictions_by_seed[seed_index], dtype=np.float64))
                )
            prediction = self._exact_cell_blend(
                prediction,
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
            )
            if self.temperature != 1.0:
                prediction = softmax_logits(_safe_log_probs(prediction, self.probability_floor) / self.temperature)
            if effective_prior_blend > 0.0:
                prediction = ((1.0 - effective_prior_blend) * prediction) + (effective_prior_blend * prior)
            if self.spatial_smooth_sigma > 0:
                kernel_radius = max(1, int(3 * self.spatial_smooth_sigma))
                ax = np.arange(-kernel_radius, kernel_radius + 1, dtype=np.float64)
                kernel_1d = np.exp(-0.5 * (ax / self.spatial_smooth_sigma) ** 2)
                kernel_1d /= np.sum(kernel_1d)
                smoothed = prediction.copy()
                for c in range(prediction.shape[-1]):
                    channel = smoothed[..., c]
                    for row in range(channel.shape[0]):
                        channel[row] = np.convolve(channel[row], kernel_1d, mode='same')
                    for col in range(channel.shape[1]):
                        channel[:, col] = np.convolve(channel[:, col], kernel_1d, mode='same')
                    smoothed[..., c] = channel
                smoothed = np.clip(smoothed, self.probability_floor, 1.0)
                smoothed = smoothed / np.sum(smoothed, axis=-1, keepdims=True)
                prediction = smoothed
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)
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
        return self._predict_from_derived(
            round_detail,
            context.geometry_bundle,
            derived,
            prior_bundle=prior_bundle,
            observations=context.observations,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        if evidence is None or evidence.total_queries == 0:
            empty_stats = _stats_from_observations(round_detail, [])
            per_seed_stats = {
                seed_index: empty_stats[seed_index]
                for seed_index in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {
                seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
                for seed_index in range(round_detail.seeds_count)
            }
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            prior_bundle,
            per_seed_stats,
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(
            round_detail,
            features,
            derived,
            prior_bundle=prior_bundle,
            observations=None,
        )


__all__ = ["FFAMModePredictor", "FFAMModePredictorCheckpoint"]
