"""Three-way stacked predictor: QR + expansion-conditioned + cellknn_perround.

Combines three complementary prediction approaches in logit space:
1. query_residual: parametric ridge regression with rich features
2. expansion-conditioned: cell kNN weighted by expansion rate similarity
3. cellknn_perround: cell kNN weighted by round posterior

Each model captures different aspects:
- QR: best at smooth interpolation and feature-based generalization
- Expansion: best at extreme regimes (hostile/explosive growth)
- CellKNN: best at matching specific cell-level patterns
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
from astar.student.predictor.greybox_cellknn_perround import GreyboxCellKnnPerRoundPredictor
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


class GreyboxTriStackPredictor(BaseRoundPredictor):
    """Three-way stacked predictor combining QR, expansion, and cellknn."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_tristack_v01"
    query_residual: QueryResidualPredictor
    expansion_pred: GreyboxExpansionConditionedPredictor
    cellknn_pred: GreyboxCellKnnPerRoundPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    expansion_weight: float = Field(default=0.25, ge=0.0)
    cellknn_weight: float = Field(default=0.10, ge=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        expansion_weight: float = 0.25,
        cellknn_weight: float = 0.10,
        probability_floor: float = 0.01,
        model_name: str = "greybox_tristack_v01",
    ) -> GreyboxTriStackPredictor:
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
        cknn_pred = GreyboxCellKnnPerRoundPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        return cls(
            name=model_name,
            query_residual=qr,
            expansion_pred=exp_pred,
            cellknn_pred=cknn_pred,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            expansion_weight=expansion_weight,
            cellknn_weight=cellknn_weight,
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

        # CellKNN prediction
        from astar.student.predictor.greybox_cellknn import _cell_features
        height, width = round_detail.map_height, round_detail.map_width
        global_obs_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        global_obs_total = np.zeros((height, width), dtype=np.float64)
        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}
        for si in range(round_detail.seeds_count):
            stats = per_seed_stats[si]
            counts = np.asarray(stats.count_tensor, dtype=np.float64)
            total = np.asarray(stats.count_total, dtype=np.float64)
            per_seed_counts[si] = counts
            per_seed_total[si] = total
            global_obs_counts += counts
            global_obs_total += total

        first_feats = _cell_features(
            round_detail.initial_states[0].grid,
            list(round_detail.initial_states[0].settlements),
            None,
        )
        round_weights = self.cellknn_pred._compute_round_weights(
            global_obs_counts, global_obs_total, test_features=first_feats,
        )

        # Three-way blend in logit space
        qr_w = 1.0 - self.expansion_weight - self.cellknn_weight
        predictions_by_seed: dict[int, np.ndarray] = {}
        for si in range(round_detail.seeds_count):
            qr_pred = np.asarray(qr_bundle.predictions_by_seed[si], dtype=np.float64)
            exp_pred_arr = np.asarray(exp_bundle.predictions_by_seed[si], dtype=np.float64)

            seed_feats = _cell_features(
                round_detail.initial_states[si].grid,
                list(round_detail.initial_states[si].settlements),
                None,
            )
            cknn_pred = self.cellknn_pred._predict_seed(
                round_detail, si, round_weights,
                per_seed_counts[si], per_seed_total[si],
                precomputed_features=seed_feats,
            )

            qr_logits = _safe_log_probs(qr_pred, self.probability_floor)
            exp_logits = _safe_log_probs(exp_pred_arr, self.probability_floor)
            cknn_logits = _safe_log_probs(cknn_pred, self.probability_floor)

            blended_logits = (
                qr_w * qr_logits
                + self.expansion_weight * exp_logits
                + self.cellknn_weight * cknn_logits
            )
            blended = softmax_logits(blended_logits)

            # Exact-cell blending
            exact_counts = np.asarray(per_seed_counts[si], dtype=np.float64)
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


__all__ = ["GreyboxTriStackPredictor"]
