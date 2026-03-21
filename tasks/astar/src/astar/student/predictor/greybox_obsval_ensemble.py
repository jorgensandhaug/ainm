"""Observation-Validated Ensemble predictor.

Combines two or more predictors by weighting them based on how well their
predictions match actual query observations. If model A's predictions are
closer to observed cell outcomes than model B's, model A gets higher weight.

Key insight from experiments:
- cellknn excels on rounds with unusual dynamics (f1dac: +19.6 points over best)
- existing hybrid excels on rounds with typical dynamics (36e581: +22.7 over cellknn)
- An observation-validated ensemble can pick the right model per round automatically

The validation uses per-cell KL divergence between model predictions and observed
empirical frequencies at cells where we have observations.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.greybox_cellknn import GreyboxCellKnnPredictor
from astar.student.predictor.greybox_regime import GreyboxLowRankQueryResidualHybridPredictor
from astar.student.predictor.query_residual import (
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor


def _observation_match_score(
    prediction: np.ndarray,
    observed_counts: np.ndarray,
    observed_total: np.ndarray,
) -> float:
    """Compute how well a prediction matches observations.

    Returns negative KL from observed frequency to prediction at observed cells.
    Higher = better match.
    """
    observed_mask = observed_total > 0
    if not np.any(observed_mask):
        return 0.0

    # Compute observed empirical frequency
    safe_total = np.maximum(observed_total, 1.0)
    observed_freq = observed_counts[observed_mask] / safe_total[observed_mask, None]

    # Prediction at observed cells
    pred_at_obs = np.maximum(prediction[observed_mask], 1e-8)

    # Multinomial log-likelihood: sum(freq * log(pred))
    # Higher is better
    ll = np.sum(observed_freq * np.log(pred_at_obs))

    return float(ll)


def _per_cell_observation_weight(
    prediction: np.ndarray,
    observed_counts: np.ndarray,
    observed_total: np.ndarray,
    spatial_sigma: float = 3.0,
) -> np.ndarray:
    """Compute per-cell weight for one model based on local observation match.

    Returns (H, W) weight map where higher = model matches observations better locally.
    """
    height, width = prediction.shape[:2]
    observed_mask = observed_total > 0

    if not np.any(observed_mask):
        return np.ones((height, width), dtype=np.float64)

    # Per-cell log-likelihood
    safe_total = np.maximum(observed_total, 1.0)
    observed_freq = np.zeros_like(prediction, dtype=np.float64)
    observed_freq[observed_mask] = observed_counts[observed_mask] / safe_total[observed_mask, None]

    pred_safe = np.maximum(prediction, 1e-8)
    cell_ll = np.sum(
        np.where(observed_freq > 0, observed_freq * np.log(pred_safe), 0.0),
        axis=-1,
    )
    cell_ll[~observed_mask] = 0.0

    # Spatially smooth the cell-level scores
    if spatial_sigma > 0:
        from astar.student.predictor.greybox_cellknn import _spatial_smooth
        smoothed_ll = _spatial_smooth(
            cell_ll, observed_mask.astype(np.float64), spatial_sigma,
        )
        return smoothed_ll

    return cell_ll


class GreyboxObsValEnsemblePredictor(BaseRoundPredictor):
    """Observation-validated ensemble of cellknn + hybrid_lowrank_queryres."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_obsval_ensemble_v01"
    cellknn: GreyboxCellKnnPredictor
    hybrid: GreyboxLowRankQueryResidualHybridPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    # Validation-based weighting
    weight_temperature: float = Field(default=0.5, gt=0.0)
    min_cellknn_weight: float = Field(default=0.05, ge=0.0, le=1.0)
    max_cellknn_weight: float = Field(default=0.50, ge=0.0, le=1.0)
    spatial_weight_sigma: float = Field(default=3.0, ge=0.0)
    # Per-cell vs global weighting mode
    use_percell_weights: bool = Field(default=True)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        weight_temperature: float = 0.5,
        min_cellknn_weight: float = 0.05,
        max_cellknn_weight: float = 0.50,
        spatial_weight_sigma: float = 3.0,
        use_percell_weights: bool = True,
        probability_floor: float = 0.01,
        model_name: str = "greybox_obsval_ensemble_v01",
    ) -> GreyboxObsValEnsemblePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)

        cellknn = GreyboxCellKnnPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        hybrid = GreyboxLowRankQueryResidualHybridPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        return cls(
            name=model_name,
            cellknn=cellknn,
            hybrid=hybrid,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            weight_temperature=weight_temperature,
            min_cellknn_weight=min_cellknn_weight,
            max_cellknn_weight=max_cellknn_weight,
            spatial_weight_sigma=spatial_weight_sigma,
            use_percell_weights=use_percell_weights,
        )

    def _blend_predictions(
        self,
        cellknn_preds: dict[int, np.ndarray],
        hybrid_preds: dict[int, np.ndarray],
        per_seed_counts: dict[int, np.ndarray],
        per_seed_total: dict[int, np.ndarray],
    ) -> dict[int, np.ndarray]:
        """Blend predictions with observation-validated weights."""
        results: dict[int, np.ndarray] = {}

        if self.use_percell_weights:
            # Per-cell weighting: different cells can trust different models
            for seed_index in cellknn_preds:
                cknn_pred = np.asarray(cellknn_preds[seed_index], dtype=np.float64)
                hyb_pred = np.asarray(hybrid_preds[seed_index], dtype=np.float64)
                counts = per_seed_counts[seed_index]
                total = per_seed_total[seed_index]

                # Per-cell observation match for each model
                cknn_score = _per_cell_observation_weight(
                    cknn_pred, counts, total, self.spatial_weight_sigma,
                )
                hyb_score = _per_cell_observation_weight(
                    hyb_pred, counts, total, self.spatial_weight_sigma,
                )

                # Softmax to get per-cell cellknn weight
                score_diff = (cknn_score - hyb_score) * self.weight_temperature
                cknn_weight = 1.0 / (1.0 + np.exp(-score_diff))  # sigmoid
                cknn_weight = np.clip(
                    cknn_weight,
                    self.min_cellknn_weight,
                    self.max_cellknn_weight,
                )[..., None]  # add class dim

                blended = cknn_weight * cknn_pred + (1.0 - cknn_weight) * hyb_pred
                results[seed_index] = apply_probability_floor(blended, self.probability_floor)
        else:
            # Global weighting: one weight per seed
            for seed_index in cellknn_preds:
                cknn_pred = np.asarray(cellknn_preds[seed_index], dtype=np.float64)
                hyb_pred = np.asarray(hybrid_preds[seed_index], dtype=np.float64)
                counts = per_seed_counts[seed_index]
                total = per_seed_total[seed_index]

                cknn_match = _observation_match_score(cknn_pred, counts, total)
                hyb_match = _observation_match_score(hyb_pred, counts, total)

                score_diff = (cknn_match - hyb_match) * self.weight_temperature
                cknn_weight = 1.0 / (1.0 + math.exp(-score_diff))
                cknn_weight = max(self.min_cellknn_weight, min(self.max_cellknn_weight, cknn_weight))

                blended = cknn_weight * cknn_pred + (1.0 - cknn_weight) * hyb_pred
                results[seed_index] = apply_probability_floor(blended, self.probability_floor)

        return results

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        # Get predictions from both models
        cknn_bundle = self.cellknn.build_prediction_bundle(round_detail, features, evidence)
        hyb_bundle = self.hybrid.build_prediction_bundle(round_detail, features, evidence)

        height, width = round_detail.map_height, round_detail.map_width
        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}

        for seed_index in range(round_detail.seeds_count):
            if evidence is not None and evidence.total_queries > 0:
                seed_ev = evidence.per_seed[seed_index]
                counts = np.asarray(seed_ev.observed_class_count_tensor, dtype=np.float64)
                total = np.sum(counts, axis=-1)
            else:
                counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
                total = np.zeros((height, width), dtype=np.float64)
            per_seed_counts[seed_index] = counts
            per_seed_total[seed_index] = total

        blended_preds = self._blend_predictions(
            cknn_bundle.predictions_by_seed,
            hyb_bundle.predictions_by_seed,
            per_seed_counts,
            per_seed_total,
        )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=blended_preds,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        features = context.geometry_bundle

        # Get predictions from both models
        cknn_bundle = self.cellknn.build_prediction_bundle_from_context(context)
        hyb_bundle = self.hybrid.build_prediction_bundle_from_context(context)

        per_seed_stats = _stats_from_observations(round_detail, context.observations)
        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}

        for seed_index in range(round_detail.seeds_count):
            stats = per_seed_stats[seed_index]
            per_seed_counts[seed_index] = np.asarray(stats.count_tensor, dtype=np.float64)
            per_seed_total[seed_index] = np.asarray(stats.count_total, dtype=np.float64)

        blended_preds = self._blend_predictions(
            cknn_bundle.predictions_by_seed,
            hyb_bundle.predictions_by_seed,
            per_seed_counts,
            per_seed_total,
        )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=blended_preds,
        )


__all__ = ["GreyboxObsValEnsemblePredictor"]
