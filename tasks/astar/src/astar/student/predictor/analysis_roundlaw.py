from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import compute_round_features
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.summary_bank_decoder import _spatial_basis, _weighted_standardize


def _law_design_tensor(
    spatial_basis: np.ndarray,
    prior_prediction: np.ndarray,
) -> np.ndarray:
    prior_logits = np.log(np.maximum(np.asarray(prior_prediction, dtype=np.float64), 1.0e-6))
    return np.concatenate([spatial_basis, prior_logits], axis=-1)


def _fit_weighted_ridge_normalized(
    normalized_features: np.ndarray,
    targets: np.ndarray,
    weights: np.ndarray,
    *,
    ridge_lambda: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate([np.ones((normalized_features.shape[0], 1), dtype=np.float64), normalized_features], axis=1)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ (design * weights[:, None]) + ridge_lambda * penalty
    rhs = design.T @ (targets * weights[:, None])
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _flatten_law_vector(intercept: np.ndarray, decoder_weights: np.ndarray) -> np.ndarray:
    return np.concatenate([intercept.reshape(-1), decoder_weights.reshape(-1)], axis=0)


def fit_analysis_roundlaw_matrix(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str],
    fit_round_ids: Sequence[str] | None = None,
    probability_floor: float = 0.01,
    ridge_lambda: float = 12.0,
) -> tuple[list[str], np.ndarray]:
    selected_round_ids = [round_id for round_id in round_ids if read_analysis_records(paths, round_id)]
    if not selected_round_ids:
        raise ValueError("analysis roundlaw matrix requires at least one analyzed round")
    reference_round_ids = [
        round_id
        for round_id in (fit_round_ids if fit_round_ids is not None else selected_round_ids)
        if read_analysis_records(paths, round_id)
    ]
    if not reference_round_ids:
        raise ValueError("analysis roundlaw matrix requires at least one analyzed fit round")

    base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
        paths,
        round_ids=list(reference_round_ids),
        model_name="analysis_roundlaw_matrix__historical_bucket",
        probability_floor=probability_floor,
    )

    round_designs: dict[str, np.ndarray] = {}
    round_targets: dict[str, np.ndarray] = {}
    round_weights: dict[str, np.ndarray] = {}
    required_round_ids = list(dict.fromkeys([*reference_round_ids, *selected_round_ids]))

    for round_id in required_round_ids:
        round_detail = read_round_record(paths, round_id).round
        analyses = read_analysis_records(paths, round_id)
        if not analyses:
            continue
        features = compute_round_features(round_detail)
        prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
        design_rows: list[np.ndarray] = []
        target_rows: list[np.ndarray] = []
        weight_rows: list[np.ndarray] = []
        for seed_index, analysis_record in sorted(analyses.items()):
            _, spatial_basis = _spatial_basis(round_detail, features, seed_index)
            design_tensor = _law_design_tensor(
                spatial_basis,
                prior_bundle.predictions_by_seed[seed_index],
            )
            ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            prior_logits = np.log(
                np.maximum(np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64), 1.0e-6),
            )
            target_delta = np.log(np.maximum(ground_truth, 1.0e-6)) - prior_logits
            cell_weights = entropy_map(ground_truth).reshape(-1) + 0.05
            design_rows.append(design_tensor.reshape(-1, design_tensor.shape[-1]))
            target_rows.append(target_delta.reshape(-1, CLASS_COUNT))
            weight_rows.append(cell_weights.astype(np.float64))
        if not design_rows:
            continue
        round_designs[round_id] = np.concatenate(design_rows, axis=0)
        round_targets[round_id] = np.concatenate(target_rows, axis=0)
        round_weights[round_id] = np.concatenate(weight_rows, axis=0)
    if not all(round_id in round_designs for round_id in reference_round_ids):
        raise ValueError("analysis roundlaw matrix missing design rows for fit rounds")

    feature_means, feature_scales = _weighted_standardize(
        np.concatenate([round_designs[round_id] for round_id in reference_round_ids], axis=0),
        np.concatenate([round_weights[round_id] for round_id in reference_round_ids], axis=0),
    )
    law_round_ids = [round_id for round_id in selected_round_ids if round_id in round_designs]
    law_vectors: list[np.ndarray] = []
    for round_id in law_round_ids:
        normalized_design = (round_designs[round_id] - feature_means[None, :]) / feature_scales[None, :]
        intercept, decoder_weights = _fit_weighted_ridge_normalized(
            normalized_design,
            round_targets[round_id],
            round_weights[round_id],
            ridge_lambda=ridge_lambda,
        )
        law_vectors.append(_flatten_law_vector(intercept, decoder_weights))
    return law_round_ids, np.stack(law_vectors, axis=0)


def fit_law_residual_axis_model(
    law_matrix: np.ndarray,
    exogenous_matrix: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if law_matrix.shape[0] != exogenous_matrix.shape[0]:
        raise ValueError("law residual model requires aligned rows")
    design = np.concatenate(
        [
            np.ones((exogenous_matrix.shape[0], 1), dtype=np.float64),
            np.asarray(exogenous_matrix, dtype=np.float64),
        ],
        axis=1,
    )
    regression = np.linalg.pinv(design) @ np.asarray(law_matrix, dtype=np.float64)
    residuals = np.asarray(law_matrix, dtype=np.float64) - design @ regression
    residual_mean = np.mean(residuals, axis=0, keepdims=True)
    centered = residuals - residual_mean
    if centered.shape[0] < 2 or float(np.linalg.norm(centered)) <= 1.0e-9:
        return (
            np.asarray(regression, dtype=np.float64),
            np.asarray(residual_mean.reshape(-1), dtype=np.float64),
            np.zeros(law_matrix.shape[1], dtype=np.float64),
        )
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    return (
        np.asarray(regression, dtype=np.float64),
        np.asarray(residual_mean.reshape(-1), dtype=np.float64),
        np.asarray(vt[0], dtype=np.float64),
    )


def project_law_residual_axis(
    law_matrix: np.ndarray,
    exogenous_matrix: np.ndarray,
    *,
    regression: np.ndarray,
    residual_mean: np.ndarray,
    axis: np.ndarray,
) -> np.ndarray:
    if law_matrix.shape[0] != exogenous_matrix.shape[0]:
        raise ValueError("law residual projection requires aligned rows")
    design = np.concatenate(
        [
            np.ones((exogenous_matrix.shape[0], 1), dtype=np.float64),
            np.asarray(exogenous_matrix, dtype=np.float64),
        ],
        axis=1,
    )
    residuals = np.asarray(law_matrix, dtype=np.float64) - design @ np.asarray(regression, dtype=np.float64)
    centered = residuals - np.asarray(residual_mean, dtype=np.float64)[None, :]
    axis_vector = np.asarray(axis, dtype=np.float64)
    if float(np.linalg.norm(axis_vector)) <= 1.0e-9:
        return np.zeros(centered.shape[0], dtype=np.float64)
    return np.asarray(centered @ axis_vector, dtype=np.float64)


def law_residual_axis(
    law_matrix: np.ndarray,
    exogenous_matrix: np.ndarray,
) -> np.ndarray:
    regression, residual_mean, axis = fit_law_residual_axis_model(law_matrix, exogenous_matrix)
    return project_law_residual_axis(
        law_matrix,
        exogenous_matrix,
        regression=regression,
        residual_mean=residual_mean,
        axis=axis,
    )


__all__ = [
    "fit_analysis_roundlaw_matrix",
    "fit_law_residual_axis_model",
    "law_residual_axis",
    "project_law_residual_axis",
]
