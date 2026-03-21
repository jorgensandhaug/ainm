from __future__ import annotations

import math

import numpy as np

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.envs import GroundTruthBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    TranscriptDerivedFeatures,
    _compose_design_tensor,
    _safe_log_probs,
)


def ground_truth_by_round(
    paths: WorkspacePaths,
    round_ids: list[str],
) -> dict[str, GroundTruthBundle]:
    bundles: dict[str, GroundTruthBundle] = {}
    for round_id in round_ids:
        analyses = read_analysis_records(paths, round_id)
        if not analyses:
            raise ValueError(f"round {round_id} has no saved analyses")
        bundles[round_id] = GroundTruthBundle(
            round_id=round_id,
            truths_by_seed={
                seed_index: np.asarray(record.analysis.ground_truth, dtype=np.float64)
                for seed_index, record in sorted(analyses.items())
            },
        )
    return bundles


def delta_rmse_metrics(
    predictor: QueryResidualPredictor,
    round_detail: RoundDetail,
    static_stacks: dict[int, np.ndarray],
    prior_bundle: PredictionBundle,
    truth_bundle: GroundTruthBundle,
    derived: TranscriptDerivedFeatures,
    inferred_regime: np.ndarray,
) -> tuple[float, float]:
    raw_squared_sum = 0.0
    served_squared_sum = 0.0
    weighted_dim_count = 0.0
    residual_class_scale = np.asarray(predictor.residual_class_scale, dtype=np.float64)[None, None, :]
    delta_scale = predictor._transcript_delta_scale(derived)

    for seed_index, ground_truth in truth_bundle.truths_by_seed.items():
        prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        teacher_prior = predictor._teacher_prior_for_seed(round_detail, seed_index, inferred_regime)
        design = _compose_design_tensor(
            static_stacks[seed_index],
            prior,
            teacher_prior,
            derived,
            inferred_regime,
            seed_index=seed_index,
            probability_floor=predictor.probability_floor,
            selected_feature_names=predictor.feature_names,
        )
        flat_design = design.reshape(-1, predictor.coefficients.shape[0])
        raw_delta = (
            predictor.intercept[None, :]
            + flat_design @ np.asarray(predictor.coefficients, dtype=np.float64)
        ).reshape(prior.shape)
        served_delta = np.clip(raw_delta * delta_scale * residual_class_scale, -4.0, 4.0)
        target_delta = _safe_log_probs(ground_truth, predictor.probability_floor) - _safe_log_probs(
            prior,
            predictor.probability_floor,
        )
        weights = 0.05 + (np.asarray(entropy_map(ground_truth), dtype=np.float64) / math.log(6.0))
        raw_squared_sum += float(np.sum(weights * np.sum((raw_delta - target_delta) ** 2, axis=-1)))
        served_squared_sum += float(np.sum(weights * np.sum((served_delta - target_delta) ** 2, axis=-1)))
        weighted_dim_count += float(np.sum(weights)) * float(ground_truth.shape[-1])

    denom = max(weighted_dim_count, 1e-9)
    return (
        float(math.sqrt(raw_squared_sum / denom)),
        float(math.sqrt(served_squared_sum / denom)),
    )


__all__ = ["delta_rmse_metrics", "ground_truth_by_round"]
