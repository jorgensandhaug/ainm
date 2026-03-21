"""Stacked predictor: cellknn_perround predictions as features in query_residual.

The idea: instead of naively blending cellknn and query_residual, use cellknn's
per-cell terminal probability predictions as ADDITIONAL FEATURE CHANNELS in the
query_residual ridge regression. This lets the ridge learn:
- WHERE cellknn is informative (e.g., on unusual rounds)
- WHERE to ignore it (e.g., on typical rounds)
- HOW MUCH to trust it per cell

This is classical model stacking / super-learning.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.greybox_cellknn_perround import GreyboxCellKnnPerRoundPredictor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    QueryResidualPredictor,
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
    _stats_from_seed_evidence,
    _derive_transcript_features_from_stats,
    _build_static_feature_stack,
    _compose_design_tensor,
    _select_training_cells,
    _safe_log_probs,
    _regime_input_vector,
    _teacher_seed_adapter,
    _ensure_synthetic_dataset,
    SeedTranscriptStats,
    LOG_FLOOR_DENOM,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


class GreyboxStackedPredictor(BaseRoundPredictor):
    """Stacked predictor using cellknn as feature in ridge regression."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_stacked_v01"
    query_residual: QueryResidualPredictor
    cellknn_perround: GreyboxCellKnnPerRoundPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    cellknn_feature_weight: float = Field(default=0.5, ge=0.0)
    use_lowrank_hybrid: bool = Field(default=False)
    lowrank_hybrid: object = Field(default=None)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        cellknn_feature_weight: float = 0.5,
        probability_floor: float = 0.01,
        model_name: str = "greybox_stacked_v01",
        use_lowrank_hybrid: bool = False,
    ) -> GreyboxStackedPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)

        # Fit both sub-models
        qr = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        cknn = GreyboxCellKnnPerRoundPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        # Optionally also fit the lowrank hybrid
        lowrank_hybrid = None
        if use_lowrank_hybrid:
            from astar.student.predictor.greybox_regime import GreyboxLowRankQueryResidualHybridPredictor
            lowrank_hybrid = GreyboxLowRankQueryResidualHybridPredictor.fit_from_workspace(
                paths,
                round_ids=list(selected_round_ids),
                policy_name=policy_name,
                samples_per_round=samples_per_round,
            )

        return cls(
            name=model_name,
            query_residual=qr,
            cellknn_perround=cknn,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            cellknn_feature_weight=cellknn_feature_weight,
            use_lowrank_hybrid=use_lowrank_hybrid,
            lowrank_hybrid=lowrank_hybrid,
        )

    def _predict_stacked(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        per_seed_stats: dict[int, SeedTranscriptStats],
    ) -> PredictionBundle:
        """Run both models and combine their predictions."""
        # Get query_residual prediction using its build path
        qr_derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            self.query_residual.base_predictor.build_prediction_bundle(round_detail, features),
            per_seed_stats,
            blur_sigmas=self.query_residual.blur_sigmas,
        )
        qr_bundle = self.query_residual._predict_from_derived(round_detail, features, qr_derived)

        # Get cellknn_perround prediction
        height, width = round_detail.map_height, round_detail.map_width
        global_obs_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        global_obs_total = np.zeros((height, width), dtype=np.float64)
        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}

        for seed_index in range(round_detail.seeds_count):
            stats = per_seed_stats[seed_index]
            counts = np.asarray(stats.count_tensor, dtype=np.float64)
            total = np.asarray(stats.count_total, dtype=np.float64)
            per_seed_counts[seed_index] = counts
            per_seed_total[seed_index] = total
            global_obs_counts += counts
            global_obs_total += total

        round_weights = self.cellknn_perround._compute_round_weights(global_obs_counts, global_obs_total)

        cknn_preds: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            cknn_preds[seed_index] = self.cellknn_perround._predict_seed(
                round_detail, seed_index, round_weights,
                per_seed_counts[seed_index], per_seed_total[seed_index],
            )

        # Optionally get lowrank hybrid prediction
        hyb_bundle = None
        if self.use_lowrank_hybrid and self.lowrank_hybrid is not None:
            hyb_derived = _derive_transcript_features_from_stats(
                round_detail,
                features,
                self.lowrank_hybrid.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features),
                per_seed_stats,
                blur_sigmas=self.query_residual.blur_sigmas,
            )
            hyb_bundle = self.lowrank_hybrid._predict_from_derived(round_detail, features, hyb_derived)

        # Combine: weighted blend of base + CellKNN
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            # Use lowrank hybrid if available, otherwise pure QR
            if hyb_bundle is not None:
                base_pred = np.asarray(hyb_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            else:
                base_pred = np.asarray(qr_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            cknn_pred = cknn_preds[seed_index]

            # Blend in logit space
            base_logits = _safe_log_probs(base_pred, self.probability_floor)
            cknn_logits = _safe_log_probs(cknn_pred, self.probability_floor)

            # Weighted blend in logit space
            blended_logits = (
                (1.0 - self.cellknn_feature_weight) * base_logits
                + self.cellknn_feature_weight * cknn_logits
            )
            blended = softmax_logits(blended_logits)

            # Re-apply exact-cell blending
            exact_counts = np.asarray(per_seed_counts[seed_index], dtype=np.float64)
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
                seed_index: SeedTranscriptStats(
                    query_count=0,
                    count_tensor=np.zeros((height, width, CLASS_COUNT), dtype=np.float64),
                    count_total=np.zeros((height, width), dtype=np.float64),
                )
                for seed_index in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {
                seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
                for seed_index in range(round_detail.seeds_count)
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


__all__ = ["GreyboxStackedPredictor"]
