"""Stacked QR + multi-regime predictor in logit space."""

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
from astar.student.predictor.greybox_multiregime import GreyboxMultiRegimePredictor
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


class GreyboxStackedMultiRegimePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_stacked_multiregime_v01"
    query_residual: QueryResidualPredictor
    multiregime: GreyboxMultiRegimePredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    multiregime_weight: float = Field(default=0.35, ge=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        multiregime_weight: float = 0.35,
        probability_floor: float = 0.01,
        model_name: str = "greybox_stacked_multiregime_v01",
    ) -> GreyboxStackedMultiRegimePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        qr = QueryResidualPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
            policy_name=policy_name, samples_per_round=samples_per_round,
        )
        mr = GreyboxMultiRegimePredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
        )
        return cls(
            name=model_name, query_residual=qr, multiregime=mr,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor, multiregime_weight=multiregime_weight,
        )

    def _predict_stacked(self, round_detail, features, per_seed_stats):
        qr_derived = _derive_transcript_features_from_stats(
            round_detail, features,
            self.query_residual.base_predictor.build_prediction_bundle(round_detail, features),
            per_seed_stats, blur_sigmas=self.query_residual.blur_sigmas,
        )
        qr_bundle = self.query_residual._predict_from_derived(round_detail, features, qr_derived)
        mr_bundle = self.multiregime._predict_with_stats(round_detail, features, per_seed_stats)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for si in range(round_detail.seeds_count):
            qr_pred = np.asarray(qr_bundle.predictions_by_seed[si], dtype=np.float64)
            mr_pred = np.asarray(mr_bundle.predictions_by_seed[si], dtype=np.float64)
            base_logits = _safe_log_probs(qr_pred, self.probability_floor)
            mr_logits = _safe_log_probs(mr_pred, self.probability_floor)
            blended = softmax_logits(
                (1.0 - self.multiregime_weight) * base_logits + self.multiregime_weight * mr_logits
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


__all__ = ["GreyboxStackedMultiRegimePredictor"]
