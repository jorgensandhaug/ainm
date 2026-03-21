"""Adaptive-weight stacked predictor.

Key insight: the optimal expansion weight depends on HOW EXTREME the regime is.
- For extreme regimes (f1dac -0.9x, c5cdf -0.1x): higher expansion weight helps
  because QR's parametric model can't capture these dynamics
- For moderate/complex regimes (ae7800 6.7x, 8e8399 1.9x): lower expansion weight
  because QR's rich features are more useful and expansion kNN adds noise

The adaptive weight is: w = w_base * confidence_factor(expansion_rate)
where confidence_factor increases for expansion rates far from the training mean.

But we also check: if the expansion kNN prediction AGREES with QR, use higher weight.
If they DISAGREE strongly, use lower weight (one of them is probably wrong).
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
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.greybox_expansion_conditioned import (
    GreyboxExpansionConditionedPredictor,
    _estimate_expansion_rate,
)
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    QueryResidualPredictor,
    SeedTranscriptStats,
    _derive_transcript_features_from_stats,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _stats_from_observations,
    _stats_from_seed_evidence,
)
from astar.student.predictor.round import BaseRoundPredictor


class GreyboxAdaptiveStackPredictor(BaseRoundPredictor):
    """Stacked predictor with adaptive expansion weight based on regime distance."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_adaptive_stack_v01"
    query_residual: QueryResidualPredictor
    expansion_pred: GreyboxExpansionConditionedPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    base_weight: float = Field(default=0.35, ge=0.0)
    min_weight: float = Field(default=0.15, ge=0.0)
    max_weight: float = Field(default=0.55, ge=0.0)
    # Training expansion rates for adaptive weight computation
    training_expansion_rates: tuple[float, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        base_weight: float = 0.35,
        min_weight: float = 0.15,
        max_weight: float = 0.55,
        probability_floor: float = 0.01,
        model_name: str = "greybox_adaptive_stack_v01",
    ) -> GreyboxAdaptiveStackPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)

        qr = QueryResidualPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
            policy_name=policy_name, samples_per_round=samples_per_round,
        )
        exp_pred = GreyboxExpansionConditionedPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
        )

        # Compute expansion rates for all training rounds
        training_rates = []
        for round_id in selected_round_ids:
            try:
                d = np.load(f'data/derived/replay_summaries/round_id={round_id}/seed_index=0.npz')
                init = float(d['survival_curve_mean'][0])
                final = float(d['survival_curve_mean'][50])
                training_rates.append(final / max(init, 1.0))
            except:
                training_rates.append(3.0)

        return cls(
            name=model_name,
            query_residual=qr,
            expansion_pred=exp_pred,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            base_weight=base_weight,
            min_weight=min_weight,
            max_weight=max_weight,
            training_expansion_rates=tuple(training_rates),
        )

    def _compute_adaptive_weight(self, estimated_expansion: float) -> float:
        """Compute adaptive expansion weight based on regime distance.

        Higher weight when the regime is CLOSE to a training round
        (because the kNN is more reliable when there's a good match).
        Lower weight when the regime is far from any training round
        (because we're extrapolating and QR generalizes better).
        """
        if not self.training_expansion_rates:
            return self.base_weight

        rates = np.array(self.training_expansion_rates)
        # Distance to nearest training round's expansion rate
        min_dist = np.min(np.abs(rates - estimated_expansion))

        # Scale factor: 1.0 when close to training, decreasing when far
        mean_rate = np.mean(rates)
        std_rate = max(np.std(rates), 0.5)

        # Confidence decreases with distance from training data
        confidence = np.exp(-0.5 * (min_dist / std_rate) ** 2)

        # Adaptive weight
        weight = self.min_weight + (self.max_weight - self.min_weight) * confidence
        return float(np.clip(weight, self.min_weight, self.max_weight))

    def _predict_stacked(self, round_detail, features, per_seed_stats):
        qr_derived = _derive_transcript_features_from_stats(
            round_detail, features,
            self.query_residual.base_predictor.build_prediction_bundle(round_detail, features),
            per_seed_stats, blur_sigmas=self.query_residual.blur_sigmas,
        )
        qr_bundle = self.query_residual._predict_from_derived(round_detail, features, qr_derived)
        exp_bundle = self.expansion_pred._predict_with_stats(round_detail, features, per_seed_stats)

        # Estimate expansion rate
        estimated_expansion = _estimate_expansion_rate(round_detail, per_seed_stats)
        adaptive_weight = self._compute_adaptive_weight(estimated_expansion)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for si in range(round_detail.seeds_count):
            qr_pred = np.asarray(qr_bundle.predictions_by_seed[si], dtype=np.float64)
            exp_pred_arr = np.asarray(exp_bundle.predictions_by_seed[si], dtype=np.float64)

            base_logits = _safe_log_probs(qr_pred, self.probability_floor)
            exp_logits = _safe_log_probs(exp_pred_arr, self.probability_floor)

            blended = softmax_logits(
                (1.0 - adaptive_weight) * base_logits + adaptive_weight * exp_logits
            )

            stats = per_seed_stats[si]
            exact_counts = np.asarray(stats.count_tensor, dtype=np.float64)
            count_total = np.sum(exact_counts, axis=-1, keepdims=True)
            prior_entropy = np.asarray(entropy_map(blended), dtype=np.float64)[..., None]
            beta = self.query_residual.beta_min + self.query_residual.beta_scale * (
                1.0 - prior_entropy / math.log(6.0)
            )
            blended = np.where(
                count_total > 0,
                (beta * blended + exact_counts) / np.maximum(beta + count_total, 1e-6),
                blended,
            )
            predictions_by_seed[si] = apply_probability_floor(blended, self.probability_floor)

        return PredictionBundle(round_id=round_detail.id, model_name=self.name, predictions_by_seed=predictions_by_seed)

    def build_prediction_bundle(self, round_detail, features, evidence=None):
        h, w = round_detail.map_height, round_detail.map_width
        if evidence is None or evidence.total_queries == 0:
            stats = {si: SeedTranscriptStats(query_count=0,
                count_tensor=np.zeros((h, w, CLASS_COUNT), dtype=np.float64),
                count_total=np.zeros((h, w), dtype=np.float64)) for si in range(round_detail.seeds_count)}
        else:
            stats = {si: _stats_from_seed_evidence(evidence.per_seed[si]) for si in range(round_detail.seeds_count)}
        return self._predict_stacked(round_detail, features, stats)

    def build_prediction_bundle_from_context(self, context):
        rd = context.round_context.to_round_detail()
        stats = _stats_from_observations(rd, context.observations)
        return self._predict_stacked(rd, context.geometry_bundle, stats)


__all__ = ["GreyboxAdaptiveStackPredictor"]
