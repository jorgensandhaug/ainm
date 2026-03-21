"""Stacked predictor: QR + expansion-conditioned in logit space.

Same architecture as greybox_stacked_v01 but uses the expansion-conditioned
predictor instead of plain cellknn_perround. The expansion-conditioned model
gets f1dac=75.92 and c5cdf=79.89, far exceeding any other non-parametric model.
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


class GreyboxStackedExpansionPredictor(BaseRoundPredictor):
    """Stacked QR + expansion-conditioned predictor."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_stacked_expansion_v01"
    query_residual: QueryResidualPredictor
    expansion_pred: GreyboxExpansionConditionedPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    expansion_weight: float = Field(default=0.20, ge=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        expansion_weight: float = 0.20,
        probability_floor: float = 0.01,
        model_name: str = "greybox_stacked_expansion_v01",
    ) -> GreyboxStackedExpansionPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)

        qr = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        exp_pred = GreyboxExpansionConditionedPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        return cls(
            name=model_name,
            query_residual=qr,
            expansion_pred=exp_pred,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            expansion_weight=expansion_weight,
        )

    def _predict_stacked(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        per_seed_stats: dict[int, SeedTranscriptStats],
    ) -> PredictionBundle:
        # QR prediction
        qr_derived = _derive_transcript_features_from_stats(
            round_detail, features,
            self.query_residual.base_predictor.build_prediction_bundle(round_detail, features),
            per_seed_stats,
            blur_sigmas=self.query_residual.blur_sigmas,
        )
        qr_bundle = self.query_residual._predict_from_derived(round_detail, features, qr_derived)

        # Expansion-conditioned prediction
        exp_bundle = self.expansion_pred._predict_with_stats(round_detail, features, per_seed_stats)

        # Blend in logit space
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            qr_pred = np.asarray(qr_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            exp_pred_arr = np.asarray(exp_bundle.predictions_by_seed[seed_index], dtype=np.float64)

            base_logits = _safe_log_probs(qr_pred, self.probability_floor)
            exp_logits = _safe_log_probs(exp_pred_arr, self.probability_floor)

            blended_logits = (
                (1.0 - self.expansion_weight) * base_logits
                + self.expansion_weight * exp_logits
            )
            blended = softmax_logits(blended_logits)

            # Re-apply exact-cell blending
            stats = per_seed_stats[seed_index]
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

            predictions_by_seed[seed_index] = apply_probability_floor(blended, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        height, width = round_detail.map_height, round_detail.map_width
        if evidence is None or evidence.total_queries == 0:
            per_seed_stats = {
                si: SeedTranscriptStats(
                    query_count=0,
                    count_tensor=np.zeros((height, width, CLASS_COUNT), dtype=np.float64),
                    count_total=np.zeros((height, width), dtype=np.float64),
                )
                for si in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {
                si: _stats_from_seed_evidence(evidence.per_seed[si])
                for si in range(round_detail.seeds_count)
            }
        return self._predict_stacked(round_detail, features, per_seed_stats)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        features = context.geometry_bundle
        per_seed_stats = _stats_from_observations(round_detail, context.observations)
        return self._predict_stacked(round_detail, features, per_seed_stats)


__all__ = ["GreyboxStackedExpansionPredictor"]
