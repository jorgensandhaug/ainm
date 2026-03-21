from __future__ import annotations

from collections.abc import Sequence
import hashlib
import math

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import OnlinePredictor, TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.smh import (
    SemimechCoefficientBankPredictor,
    SemimechKnnPredictor,
)
from astar.student.predictor.smh_glmm import (
    SemhGlmmBankPredictor,
    SemhGlmmLatentPredictor,
    SemhGlmmPredictor,
)
from astar.student.predictor.direct_terminal import DirectTerminalPredictor
from astar.student.predictor.smh_student import SemhResidualStudentPredictor

SMH_GLMM_Z0_H0_COVBASE_CALNONE_V001 = "smh_glmm_z0_h0_covbase_calnone_v001"
SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001 = "smh_glmmbank_zhist_h0_covbase_calnone_v001"
SMH_GLMMBANK_ZHIST_H0_COVBASE_CALOBS_V001 = "smh_glmmbank_zhist_h0_covbase_calobs_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001 = "smh_glmmlatent_z2_h0_covbase_calnone_v001"
SMH_GLMMLATENT_Z2_H1_COVBASE_CALNONE_V001 = "smh_glmmlatent_z2_h1_covbase_calnone_v001"
SMH_GLMMLATENT_Z4_H0_COVBASE_CALNONE_V001 = "smh_glmmlatent_z4_h0_covbase_calnone_v001"
SMH_GLMMLATENT_Z6_H0_COVBASE_CALNONE_V001 = "smh_glmmlatent_z6_h0_covbase_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVPRIOR_CALNONE_V001 = "smh_glmmlatent_z2_h0_covprior_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001 = "smh_glmmlatent_z2_h0_covnbr_calnone_v001"
SMH_GLMMLATENT_Z4_H0_COVNBR_CALNONE_V001 = "smh_glmmlatent_z4_h0_covnbr_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVNBR3_CALNONE_V001 = "smh_glmmlatent_z2_h0_covnbr3_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_CALOBS_V001 = "smh_glmmlatent_z2_h0_covbase_calobs_v001"
SMH_GLMMLATENT_Z2_H0_COVNBR_CALOBS_V001 = "smh_glmmlatent_z2_h0_covnbr_calobs_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_R01_V001 = "smh_glmmlatent_z2_h0_covbase_r01_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_R10_V001 = "smh_glmmlatent_z2_h0_covbase_r10_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_E50_V001 = "smh_glmmlatent_z2_h0_covbase_e50_v001"
SMH_GLMMLATENT_Z3_H0_COVBASE_CALNONE_V001 = "smh_glmmlatent_z3_h0_covbase_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_HBBLEND20_V001 = "smh_glmmlatent_z2_h0_covbase_hbblend20_v001"
SMH_GLMMLATENT_Z2_H0_COVPOLY_CALNONE_V001 = "smh_glmmlatent_z2_h0_covpoly_calnone_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_TMIX_V001 = "smh_glmmlatent_z2_h0_covbase_tmix_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V001 = "smh_glmmlatent_z2_h0_covbase_barren_v001"
SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V002 = "smh_glmmlatent_z2_h0_covbase_barren_v002"
SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V003 = "smh_glmmlatent_z2_h0_covbase_barren_v003"
SMH_GLMM_QR_ENSEMBLE_V001 = "smh_glmm_qr_ensemble_v001"
SMH_GLMM_QR_ENSEMBLE_V002 = "smh_glmm_qr_ensemble_v002"
SMH_GLMM_QR_ENSEMBLE_V003 = "smh_glmm_qr_ensemble_v003"
SMH_GLMM_QR_ENSEMBLE_V004 = "smh_glmm_qr_ensemble_v004"
SMH_GLMM_QR_ENSEMBLE_V005 = "smh_glmm_qr_ensemble_v005"
DIRECT_TERMINAL_Z2_V001 = "direct_terminal_z2_v001"
DIRECT_TERMINAL_Z2_V002 = "direct_terminal_z2_v002"
DIRECT_TERMINAL_Z2_V003 = "direct_terminal_z2_v003"
GLMM_DT_ENSEMBLE_V001 = "glmm_dt_ensemble_v001"
GLMM_DT_ENSEMBLE_V002 = "glmm_dt_ensemble_v002"
GLMM_DT_ENSEMBLE_V003 = "glmm_dt_ensemble_v003"
GLMM_DT_ENSEMBLE_V004 = "glmm_dt_ensemble_v004"
GLMM_DT_ENSEMBLE_V005 = "glmm_dt_ensemble_v005"
GLMM_DT_ENSEMBLE_V006 = "glmm_dt_ensemble_v006"
GLMM_DT_ENSEMBLE_V007 = "glmm_dt_ensemble_v007"
SMH_RESID_LOCALGATE_V001 = "smh_resid_z12_h0_covbase_locgate_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001 = "smh_coeffbank_z0_h0_covlike_calbase_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001 = "smh_coeffbank_z0_h0_covlike_calbase_resid_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_EXACTOBS_V001 = (
    "smh_coeffbank_z0_h0_covlike_calbase_resid_exactobs_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001 = (
    "smh_coeffbank_z0_h0_covlike_calbase_residshrink_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_EXACTOBS_V001 = (
    "smh_coeffbank_z0_h0_covlike_calbase_residshrink_exactobs_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTFOCUS_V001 = "smh_coeffbank_z0_h0_covlike_builtfocus_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTSHARP_V001 = "smh_coeffbank_z0_h0_covlike_builtsharp_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND25_V001 = "smh_coeffbank_z0_h0_covlike_hbblend25_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND40_V001 = "smh_coeffbank_z0_h0_covlike_hbblend40_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_V001 = "smh_coeffbank_z0_h0_covlike_hbblend50_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_V001 = "smh_coeffbank_z0_h0_covlike_hbblend60_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBADAPT25_V001 = "smh_coeffbank_z0_h0_covlike_hbadapt25_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_V001 = "smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_V001 = "smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_RESID_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_resid_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_RESID_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_resid_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND025_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend025_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND020_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend020_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND030_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend030_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND035_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend035_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND040_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend040_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend045_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend050_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_EXACTOBS_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend045_exactobs_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_EXACTOBS_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend050_exactobs_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_ADAPT025_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_adapt025_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATE_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgate_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEWIDE_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgatewide_v001"
)
SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEXWIDE_V001 = (
    "smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgatexwide_v001"
)
SMH_COEFFBANK_Z0_H0_COVMARKPOSTW06_V001 = "smh_coeffbank_z0_h0_covmarkpostw06_v001"
SMH_COEFFBANK_Z0_H0_COVMARKPOSTW12_V001 = "smh_coeffbank_z0_h0_covmarkpostw12_v001"
SMH_COEFFBANK_Z0_H0_COVMARKPOSTW24_V001 = "smh_coeffbank_z0_h0_covmarkpostw24_v001"
SMH_KNN5_Z12_H0_COVSUM_CALBASE_V001 = "smh_knn5_z12_h0_covsum_calbase_v001"
SMH_KNN5_Z12_H0_COVAUG_CALBASE_V001 = "smh_knn5_z12_h0_covaug_calbase_v001"
SMH_KNN5_Z12_H0_COVAUG_CALBANK_V001 = "smh_knn5_z12_h0_covaug_calbank_v001"
SMH_KNN5_Z3_H0_COVAUG_CALBASE_V001 = "smh_knn5_z3_h0_covaug_calbase_v001"
SMH_KNN5_Z3_H0_COVAUG_CALBLEND35_V001 = "smh_knn5_z3_h0_covaug_calblend35_v001"
QUERY_RESIDUAL_V8 = "query_residual_v8"
QUERY_RESIDUAL_V9 = "query_residual_v9"
QUERY_RESIDUAL_V10 = "query_residual_v10"
QUERY_RESIDUAL_V9_LOCALGATE_V001 = "query_residual_v9_locgate_v001"
QUERY_RESIDUAL_V9_V10_ADAPTIVE025_V001 = "query_residual_v9_v10_adaptive025_v001"
QUERY_RESIDUAL_V9_V10_BUILTFREQGATE_V001 = "query_residual_v9_v10_builtfreqgate_v001"
QUERY_RESIDUAL_V9_V10_BUILTFREQGATEWIDE_V001 = "query_residual_v9_v10_builtfreqgatewide_v001"
QUERY_RESIDUAL_V9_V10_BUILTFREQGATEXWIDE_V001 = "query_residual_v9_v10_builtfreqgatexwide_v001"
QUERY_RESIDUAL_V9_V10_BLEND025_V001 = "query_residual_v9_v10_blend025_v001"


class RoundPredictorAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    predictor: BaseRoundPredictor
    name: str = "round_predictor_adapter"

    def init_belief(self, ctx: RoundContext) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=OnlineEpisodeSample(
                round_context=ctx,
                transcript=OnlineTranscript(),
            ),
        )

    def update(
        self,
        belief: TranscriptBeliefState,
        obs: LiveQueryObs,
    ) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, obs)},
                    ),
                },
            ),
        )

    def predict(self, belief: TranscriptBeliefState) -> PredictionBundle:
        inference_context = round_context_to_live_inference_context(
            belief.round_context,
            belief.observations,
        )
        build_from_context = getattr(self.predictor, "build_prediction_bundle_from_context", None)
        if callable(build_from_context):
            return build_from_context(inference_context)
        round_detail = belief.round_context.to_round_detail()
        return self.predictor.build_prediction_bundle(
            round_detail,
            inference_context.geometry_bundle,
            inference_context.evidence_bundle,
        )


def _blend_prediction_arrays(
    left_predictions: np.ndarray,
    right_predictions: np.ndarray,
    right_weight: float | np.ndarray,
) -> np.ndarray:
    right_weight_array = np.asarray(right_weight, dtype=np.float64)
    if right_weight_array.ndim == 0:
        return ((1.0 - right_weight_array) * left_predictions) + (right_weight_array * right_predictions)
    return (
        (1.0 - right_weight_array)[..., None] * left_predictions
        + right_weight_array[..., None] * right_predictions
    )


def _bundle_from_context(
    predictor: BaseRoundPredictor,
    context,
) -> PredictionBundle:
    build_from_context = getattr(predictor, "build_prediction_bundle_from_context", None)
    if callable(build_from_context):
        return build_from_context(context)
    round_detail = context.round_context.to_round_detail()
    return predictor.build_prediction_bundle(
        round_detail,
        context.geometry_bundle,
        context.evidence_bundle,
    )


class FixedPredictionBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    left_predictor: BaseRoundPredictor
    right_predictor: BaseRoundPredictor
    right_weight: float
    name: str = "fixed_prediction_blend_v1"

    def _blend_seed_predictions(
        self,
        left_predictions: np.ndarray,
        right_predictions: np.ndarray,
    ) -> np.ndarray:
        return _blend_prediction_arrays(left_predictions, right_predictions, self.right_weight)

    def _blend_bundles(
        self,
        left_bundle: PredictionBundle,
        right_bundle: PredictionBundle,
    ) -> PredictionBundle:
        predictions_by_seed = {
            seed_index: self._blend_seed_predictions(
                np.asarray(left_bundle.predictions_by_seed[seed_index], dtype=np.float64),
                np.asarray(right_bundle.predictions_by_seed[seed_index], dtype=np.float64),
            )
            for seed_index in left_bundle.predictions_by_seed
        }
        return PredictionBundle(
            round_id=left_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        left_bundle = _bundle_from_context(self.left_predictor, context)
        right_bundle = _bundle_from_context(self.right_predictor, context)
        return self._blend_bundles(left_bundle, right_bundle)

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        left_bundle = self.left_predictor.build_prediction_bundle(round_detail, features, evidence)
        right_bundle = self.right_predictor.build_prediction_bundle(round_detail, features, evidence)
        return self._blend_bundles(left_bundle, right_bundle)


class AdaptiveEntropyDisagreementBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    left_predictor: BaseRoundPredictor
    right_predictor: BaseRoundPredictor
    target_right_weight: float
    min_right_weight: float
    max_right_weight: float
    weight_exponent: float
    name: str = "adaptive_entropy_disagreement_blend_v1"

    def _adaptive_right_weight(
        self,
        left_predictions: np.ndarray,
        right_predictions: np.ndarray,
        *,
        target_right_weight: float | None = None,
    ) -> np.ndarray:
        resolved_target_right_weight = (
            self.target_right_weight if target_right_weight is None else float(target_right_weight)
        )
        mean_predictions = 0.5 * (left_predictions + right_predictions)
        entropy = -np.sum(mean_predictions * np.log(np.maximum(mean_predictions, 1e-12)), axis=-1) / np.log(
            mean_predictions.shape[-1],
        )
        disagreement = 0.5 * np.sum(np.abs(right_predictions - left_predictions), axis=-1)
        raw_weight = entropy * disagreement
        raw_mean = float(np.mean(raw_weight))
        if raw_mean <= 1e-12:
            return np.full(raw_weight.shape, resolved_target_right_weight, dtype=np.float64)
        scaled_weight = raw_weight / raw_mean
        if self.weight_exponent != 1.0:
            scaled_weight = np.power(np.maximum(scaled_weight, 0.0), self.weight_exponent)
        right_weight = resolved_target_right_weight * scaled_weight
        return np.clip(right_weight, self.min_right_weight, self.max_right_weight)

    def _blend_bundles(
        self,
        left_bundle: PredictionBundle,
        right_bundle: PredictionBundle,
        *,
        target_right_weight: float | None = None,
    ) -> PredictionBundle:
        predictions_by_seed = {}
        for seed_index in left_bundle.predictions_by_seed:
            left_predictions = np.asarray(left_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            right_predictions = np.asarray(right_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            right_weight = self._adaptive_right_weight(
                left_predictions,
                right_predictions,
                target_right_weight=target_right_weight,
            )
            predictions_by_seed[seed_index] = _blend_prediction_arrays(
                left_predictions,
                right_predictions,
                right_weight,
            )
        return PredictionBundle(
            round_id=left_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        left_bundle = _bundle_from_context(self.left_predictor, context)
        right_bundle = _bundle_from_context(self.right_predictor, context)
        return self._blend_bundles(left_bundle, right_bundle)

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        left_bundle = self.left_predictor.build_prediction_bundle(round_detail, features, evidence)
        right_bundle = self.right_predictor.build_prediction_bundle(round_detail, features, evidence)
        return self._blend_bundles(left_bundle, right_bundle)


class BuiltFrequencyAdaptiveBlendPredictor(AdaptiveEntropyDisagreementBlendPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    built_frequency_intercept: float
    built_frequency_slope: float
    min_round_target_right_weight: float
    max_round_target_right_weight: float
    name: str = "built_frequency_adaptive_blend_v1"

    def _round_target_right_weight_from_evidence(
        self,
        evidence_bundle,
    ) -> float:
        built_frequencies: list[float] = []
        for seed_evidence in evidence_bundle.per_seed.values():
            observed_class_frequencies = np.asarray(
                seed_evidence.observed_class_frequencies,
                dtype=np.float64,
            )
            built_frequencies.append(float(np.sum(observed_class_frequencies[1:4])))
        if not built_frequencies:
            return self.target_right_weight
        round_built_frequency = float(np.mean(built_frequencies))
        round_target_right_weight = (
            self.built_frequency_intercept
            + (self.built_frequency_slope * round_built_frequency)
        )
        return float(
            np.clip(
                round_target_right_weight,
                self.min_round_target_right_weight,
                self.max_round_target_right_weight,
            ),
        )

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        left_bundle = _bundle_from_context(self.left_predictor, context)
        right_bundle = _bundle_from_context(self.right_predictor, context)
        return self._blend_bundles(
            left_bundle,
            right_bundle,
            target_right_weight=self._round_target_right_weight_from_evidence(context.evidence_bundle),
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        left_bundle = self.left_predictor.build_prediction_bundle(round_detail, features, evidence)
        right_bundle = self.right_predictor.build_prediction_bundle(round_detail, features, evidence)
        return self._blend_bundles(
            left_bundle,
            right_bundle,
            target_right_weight=(
                self.target_right_weight
                if evidence is None
                else self._round_target_right_weight_from_evidence(evidence)
            ),
        )


class BarrenRoundCorrectionPredictor(BaseRoundPredictor):
    """Detect barren rounds from observations and scale down settlement/ruin predictions."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    base_predictor: BaseRoundPredictor
    name: str = "barren_correction_v1"
    barren_threshold: float = 0.03
    barren_settlement_scale: float = 0.3
    barren_ruin_scale: float = 0.2
    barren_forest_boost: float = 1.15
    probability_floor: float = 0.005

    def _detect_build_rate(self, observations: tuple) -> float:
        total_cells = 0
        built_cells = 0
        for obs in observations:
            grid = np.asarray(obs.grid, dtype=np.int64)
            from astar.core.terrain import collapse_internal_grid as _collapse
            collapsed = _collapse(grid)
            total_cells += collapsed.size
            built_cells += int(np.sum((collapsed == 1) | (collapsed == 2) | (collapsed == 3)))
        return float(built_cells) / max(total_cells, 1)

    def _apply_barren_correction(self, prediction: np.ndarray, build_rate: float) -> np.ndarray:
        if build_rate >= self.barren_threshold:
            return prediction
        corrected = prediction.copy()
        corrected[:, :, 1] *= self.barren_settlement_scale
        corrected[:, :, 2] *= self.barren_settlement_scale
        corrected[:, :, 3] *= self.barren_ruin_scale
        if self.barren_forest_boost != 1.0:
            corrected[:, :, 4] *= self.barren_forest_boost
        corrected[:, :, 0] = np.maximum(
            1.0 - corrected[:, :, 1] - corrected[:, :, 2] - corrected[:, :, 3]
            - corrected[:, :, 4] - corrected[:, :, 5],
            0.01,
        )
        corrected = np.clip(corrected, 1e-8, None)
        corrected /= corrected.sum(axis=-1, keepdims=True)
        floored = np.maximum(corrected, self.probability_floor)
        return floored / floored.sum(axis=-1, keepdims=True)

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        bundle = _bundle_from_context(self.base_predictor, context)
        build_rate = self._detect_build_rate(context.observations)
        return PredictionBundle(
            round_id=bundle.round_id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: self._apply_barren_correction(
                    np.asarray(pred, dtype=np.float64), build_rate
                )
                for seed_index, pred in bundle.predictions_by_seed.items()
            },
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        return self.base_predictor.build_prediction_bundle(round_detail, features, evidence)


class RegimeAdaptiveEnsemblePredictor(BaseRoundPredictor):
    """Blend two models adaptively based on observed regime."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    glmm_predictor: BaseRoundPredictor
    qr_predictor: BaseRoundPredictor
    name: str = "smh_glmm_qr_ensemble_v001"
    barren_threshold: float = 0.03
    barren_qr_weight: float = 0.7  # weight on QR when barren
    normal_qr_weight: float = 0.2  # weight on QR normally
    probability_floor: float = 0.005

    def _detect_build_rate(self, observations: tuple) -> float:
        total_cells = 0
        built_cells = 0
        for obs in observations:
            grid = np.asarray(obs.grid, dtype=np.int64)
            from astar.core.terrain import collapse_internal_grid as _collapse
            collapsed = _collapse(grid)
            total_cells += collapsed.size
            built_cells += int(np.sum((collapsed == 1) | (collapsed == 2) | (collapsed == 3)))
        return float(built_cells) / max(total_cells, 1)

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        glmm_bundle = _bundle_from_context(self.glmm_predictor, context)
        qr_bundle = _bundle_from_context(self.qr_predictor, context)
        build_rate = self._detect_build_rate(context.observations)
        qr_weight = self.barren_qr_weight if build_rate < self.barren_threshold else self.normal_qr_weight
        glmm_weight = 1.0 - qr_weight
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in glmm_bundle.predictions_by_seed:
            glmm_pred = np.asarray(glmm_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            qr_pred = np.asarray(qr_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            blended = glmm_weight * glmm_pred + qr_weight * qr_pred
            floored = np.maximum(blended, self.probability_floor)
            predictions_by_seed[seed_index] = floored / floored.sum(axis=-1, keepdims=True)
        return PredictionBundle(
            round_id=glmm_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        return self.glmm_predictor.build_prediction_bundle(round_detail, features, evidence)


class ExactObservationBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    base_predictor: BaseRoundPredictor
    beta_min: float
    beta_scale: float
    probability_floor: float
    name: str = "exact_observation_blend_v1"

    def _exact_cell_blend(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
    ) -> np.ndarray:
        count_total = np.sum(exact_counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prediction
        prior_entropy = -np.sum(
            prediction * np.log(np.maximum(prediction, 1e-12)),
            axis=-1,
            keepdims=True,
        )
        beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / math.log(prediction.shape[-1])))
        blended = np.where(
            count_total > 0.0,
            (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
            prediction,
        )
        floored = np.maximum(blended, self.probability_floor)
        return floored / np.sum(floored, axis=-1, keepdims=True)

    def _blend_bundle_with_evidence(
        self,
        bundle: PredictionBundle,
        evidence_bundle,
    ) -> PredictionBundle:
        predictions_by_seed = {}
        for seed_index, prediction in bundle.predictions_by_seed.items():
            exact_counts = np.asarray(
                evidence_bundle.per_seed[seed_index].observed_class_count_tensor,
                dtype=np.float64,
            )
            predictions_by_seed[seed_index] = self._exact_cell_blend(
                np.asarray(prediction, dtype=np.float64),
                exact_counts,
            )
        return PredictionBundle(
            round_id=bundle.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context,
    ) -> PredictionBundle:
        bundle = _bundle_from_context(self.base_predictor, context)
        return self._blend_bundle_with_evidence(bundle, context.evidence_bundle)

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        bundle = self.base_predictor.build_prediction_bundle(round_detail, features, evidence)
        if evidence is None:
            return bundle
        return self._blend_bundle_with_evidence(bundle, evidence)


def _query_residual_checkpoint_dir_name(
    checkpoint_stem: str,
    *,
    policy_name: str,
    samples_per_round: int | None,
    historical_round_ids: Sequence[str] | None,
) -> str:
    samples_suffix = ""
    if samples_per_round is not None:
        samples_suffix = f"__samples={samples_per_round}"
    rounds_suffix = ""
    if historical_round_ids is not None:
        normalized_round_ids = sorted(set(historical_round_ids))
        digest = hashlib.sha1(",".join(normalized_round_ids).encode("utf-8")).hexdigest()[:10]
        rounds_suffix = f"__rounds=n={len(normalized_round_ids)}__sha1={digest}"
    return f"{checkpoint_stem}__policy={policy_name}{samples_suffix}{rounds_suffix}"


def _smh_checkpoint_dir_name(
    checkpoint_stem: str,
    *,
    historical_round_ids: Sequence[str] | None,
) -> str:
    rounds_suffix = ""
    if historical_round_ids is not None:
        normalized_round_ids = sorted(set(historical_round_ids))
        digest = hashlib.sha1(",".join(normalized_round_ids).encode("utf-8")).hexdigest()[:10]
        rounds_suffix = f"__rounds=n={len(normalized_round_ids)}__sha1={digest}"
    return f"{checkpoint_stem}{rounds_suffix}"


def _load_or_fit_query_residual_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> QueryResidualPredictor:
    resolved_policy_name = (policy_name or "coverage").strip().lower()
    fit_kwargs = {} if fit_kwargs is None else dict(fit_kwargs)
    if samples_per_round is not None:
        fit_kwargs.setdefault("samples_per_round", samples_per_round)
    checkpoint_dir = workspace_paths.model_dir(
        _query_residual_checkpoint_dir_name(
            checkpoint_stem,
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "checkpoint.json"
    if checkpoint_path.exists():
        return QueryResidualPredictor.load_checkpoint(checkpoint_path)
    predictor = QueryResidualPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        policy_name=resolved_policy_name,
        model_name=model_name,
        **fit_kwargs,
    )
    predictor.save_checkpoint(checkpoint_path)
    return predictor


def _load_or_fit_historical_bucket_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
) -> HistoricalBucketPriorPredictor:
    if historical_round_ids is None:
        checkpoint_path = workspace_paths.model_dir(checkpoint_stem) / "checkpoint.json"
    else:
        checkpoint_path = (
            workspace_paths.model_dir(
                _smh_checkpoint_dir_name(
                    checkpoint_stem,
                    historical_round_ids=historical_round_ids,
                ),
            )
            / "checkpoint.json"
        )
    if checkpoint_path.exists():
        return HistoricalBucketPriorPredictor.load_checkpoint(checkpoint_path)
    predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
    )
    predictor.save_checkpoint(checkpoint_path)
    return predictor


def _build_historical_bucket_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_historical_bucket_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_query_residual_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_query_residual_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        fit_kwargs=fit_kwargs,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _query_residual_v9_localgate_fit_kwargs() -> dict[str, object]:
    return {
        "include_exact_local_residual": True,
        "min_delta_scale": 0.0,
        "teacher_locality_blend": True,
    }


def _query_residual_v10_fit_kwargs() -> dict[str, object]:
    return {
        "cell_selection_strategy": "top_heavy_stratified_entropy",
        "include_exact_local_residual": True,
    }


def _smh_calbase_resid_fit_kwargs() -> dict[str, object]:
    return {
        "cells_per_seed": 384,
        "include_exact_local_residual": True,
        "prior_blend": 0.20,
        "signal_scale": 0.10,
        "teacher_blend": 0.08,
        "teacher_locality_blend": True,
        "min_delta_scale": 0.0,
    }


def _smh_calbase_residshrink_fit_kwargs() -> dict[str, object]:
    return {
        "cells_per_seed": 384,
        "include_exact_local_residual": True,
        "prior_blend": 0.30,
        "signal_scale": 0.08,
        "teacher_blend": 0.06,
        "teacher_locality_blend": True,
        "min_delta_scale": 0.0,
    }


def _smh_hbblend_exactobs_resid_fit_kwargs() -> dict[str, object]:
    return {
        "cells_per_seed": 384,
        "include_exact_local_residual": True,
        "prior_blend": 0.40,
        "signal_scale": 0.10,
        "teacher_blend": 0.06,
        "teacher_locality_blend": True,
        "min_delta_scale": 0.0,
    }


def _load_query_residual_v9_v10_blend_components(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
) -> tuple[QueryResidualPredictor, QueryResidualPredictor]:
    left_predictor = _load_or_fit_query_residual_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        checkpoint_stem=QUERY_RESIDUAL_V9_LOCALGATE_V001,
        model_name=QUERY_RESIDUAL_V9_LOCALGATE_V001,
        fit_kwargs=_query_residual_v9_localgate_fit_kwargs(),
    )
    right_predictor = _load_or_fit_query_residual_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        checkpoint_stem=QUERY_RESIDUAL_V10,
        model_name=QUERY_RESIDUAL_V10,
        fit_kwargs=_query_residual_v10_fit_kwargs(),
    )
    return left_predictor, right_predictor


def _build_query_residual_v9_v10_blend_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_query_residual_v9_v10_blend_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = FixedPredictionBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        right_weight=right_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_query_residual_v9_v10_adaptive025_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    target_right_weight: float,
    weight_exponent: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_query_residual_v9_v10_blend_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = AdaptiveEntropyDisagreementBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        target_right_weight=target_right_weight,
        min_right_weight=0.05,
        max_right_weight=0.45,
        weight_exponent=weight_exponent,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_query_residual_v9_v10_builtfreqgate_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    min_right_weight: float,
    max_right_weight: float,
    built_frequency_intercept: float,
    built_frequency_slope: float,
    min_round_target_right_weight: float,
    max_round_target_right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_query_residual_v9_v10_blend_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = BuiltFrequencyAdaptiveBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        target_right_weight=0.25,
        min_right_weight=min_right_weight,
        max_right_weight=max_right_weight,
        weight_exponent=1.0,
        built_frequency_intercept=built_frequency_intercept,
        built_frequency_slope=built_frequency_slope,
        min_round_target_right_weight=min_round_target_right_weight,
        max_round_target_right_weight=max_round_target_right_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    summary_variant: str,
    latent_kind: str,
    latent_rank: int | None = None,
    k_neighbors: int = 5,
    distance_power: float = 1.0,
    terminal_blend_weight: float = 0.0,
) -> SemimechKnnPredictor:
    resolved_policy_name = (policy_name or "coverage").strip().lower()
    resolved_samples_per_round = 1 if samples_per_round is None else samples_per_round
    checkpoint_dir = workspace_paths.model_dir(
        _query_residual_checkpoint_dir_name(
            checkpoint_stem,
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "smh_knn_predictor.json"
    if checkpoint_path.exists():
        return SemimechKnnPredictor.load_checkpoint(checkpoint_path)
    dataset_name = (
        _query_residual_checkpoint_dir_name(
            "smh_synthetic_live",
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            historical_round_ids=historical_round_ids,
        )
    )
    predictor = SemimechKnnPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
        model_name=model_name,
        dataset_name=dataset_name,
        summary_variant=summary_variant,
        latent_kind=latent_kind,
        latent_rank=latent_rank,
        k_neighbors=k_neighbors,
        distance_power=distance_power,
        terminal_blend_weight=terminal_blend_weight,
    )
    predictor.save_checkpoint(checkpoint_dir)
    return predictor


def _build_smh_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    summary_variant: str,
    latent_kind: str,
    latent_rank: int | None = None,
    k_neighbors: int = 5,
    distance_power: float = 1.0,
    terminal_blend_weight: float = 0.0,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        summary_variant=summary_variant,
        latent_kind=latent_kind,
        latent_rank=latent_rank,
        k_neighbors=k_neighbors,
        distance_power=distance_power,
        terminal_blend_weight=terminal_blend_weight,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_glmm_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> SemhGlmmPredictor:
    checkpoint_dir = workspace_paths.model_dir(
        _smh_checkpoint_dir_name(
            checkpoint_stem,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "smh_glmm_predictor.json"
    if checkpoint_path.exists():
        return SemhGlmmPredictor.load_checkpoint(checkpoint_path)
    predictor = SemhGlmmPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
        dataset_name=_smh_checkpoint_dir_name(
            f"{checkpoint_stem}__cell_transition",
            historical_round_ids=historical_round_ids,
        ),
        **({} if fit_kwargs is None else fit_kwargs),
    )
    predictor.save_checkpoint(checkpoint_dir)
    return predictor


def _build_smh_glmm_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_glmm_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        fit_kwargs=fit_kwargs,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_glmm_bank_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> SemhGlmmBankPredictor:
    checkpoint_dir = workspace_paths.model_dir(
        _smh_checkpoint_dir_name(
            checkpoint_stem,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "smh_glmm_bank_predictor.json"
    if checkpoint_path.exists():
        return SemhGlmmBankPredictor.load_checkpoint(checkpoint_path)
    predictor = SemhGlmmBankPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
        dataset_name=_smh_checkpoint_dir_name(
            f"{checkpoint_stem}__cell_transition",
            historical_round_ids=historical_round_ids,
        ),
        **({} if fit_kwargs is None else fit_kwargs),
    )
    predictor.save_checkpoint(checkpoint_dir)
    return predictor


def _build_smh_glmm_bank_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_glmm_bank_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        fit_kwargs=fit_kwargs,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_glmm_latent_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> SemhGlmmLatentPredictor:
    checkpoint_dir = workspace_paths.model_dir(
        _smh_checkpoint_dir_name(
            checkpoint_stem,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "smh_glmm_latent_predictor.json"
    if checkpoint_path.exists():
        return SemhGlmmLatentPredictor.load_checkpoint(checkpoint_path)
    predictor = SemhGlmmLatentPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
        dataset_name=_smh_checkpoint_dir_name(
            f"{checkpoint_stem}__cell_transition",
            historical_round_ids=historical_round_ids,
        ),
        **({} if fit_kwargs is None else fit_kwargs),
    )
    predictor.save_checkpoint(checkpoint_dir)
    return predictor


def _build_direct_terminal_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    checkpoint_dir = workspace_paths.model_dir(checkpoint_stem)
    if historical_round_ids is not None:
        round_hash = hashlib.sha1(
            ",".join(sorted(historical_round_ids)).encode()
        ).hexdigest()[:10]
        checkpoint_dir = workspace_paths.model_dir(
            f"{checkpoint_stem}__rounds=n={len(historical_round_ids)}__sha1={round_hash}"
        )
    json_path = checkpoint_dir / "direct_terminal_predictor.json"
    if json_path.exists():
        predictor = DirectTerminalPredictor.load_checkpoint(json_path)
    else:
        predictor = DirectTerminalPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=list(historical_round_ids) if historical_round_ids else None,
            model_name=model_name,
            **(fit_kwargs or {}),
        )
        predictor.save_checkpoint(checkpoint_dir)
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_smh_glmm_latent_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_glmm_latent_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        fit_kwargs=fit_kwargs,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_coeffbank_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    class_weights: Sequence[float] | None = None,
    posterior_temperature: float = 1.0,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
    summary_variant: str | None = None,
    summary_weight: float = 0.0,
) -> SemimechCoefficientBankPredictor:
    resolved_policy_name = (policy_name or "coverage").strip().lower()
    resolved_samples_per_round = 1 if samples_per_round is None else samples_per_round
    if summary_variant is not None and summary_weight > 0.0:
        checkpoint_dir_name = _query_residual_checkpoint_dir_name(
            checkpoint_stem,
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            historical_round_ids=historical_round_ids,
        )
        dataset_name = _query_residual_checkpoint_dir_name(
            f"{checkpoint_stem}__synthetic_live",
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            historical_round_ids=historical_round_ids,
        )
    else:
        checkpoint_dir_name = _smh_checkpoint_dir_name(
            checkpoint_stem,
            historical_round_ids=historical_round_ids,
        )
        dataset_name = None
    checkpoint_dir = workspace_paths.model_dir(checkpoint_dir_name)
    checkpoint_path = checkpoint_dir / "smh_coeffbank_predictor.json"
    if checkpoint_path.exists():
        return SemimechCoefficientBankPredictor.load_checkpoint(checkpoint_path)
    predictor = SemimechCoefficientBankPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
        class_weights=None if class_weights is None else list(class_weights),
        posterior_temperature=posterior_temperature,
        summary_variant=summary_variant,
        summary_weight=summary_weight,
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
        dataset_name=dataset_name,
    )
    predictor.save_checkpoint(checkpoint_dir)
    return predictor


def _build_smh_coeffbank_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    class_weights: Sequence[float] | None = None,
    posterior_temperature: float = 1.0,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
    summary_variant: str | None = None,
    summary_weight: float = 0.0,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_coeffbank_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        class_weights=class_weights,
        posterior_temperature=posterior_temperature,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        summary_variant=summary_variant,
        summary_weight=summary_weight,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_smh_coeffbank_historical_bucket_components(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
) -> tuple[HistoricalBucketPriorPredictor, SemimechCoefficientBankPredictor]:
    left_predictor = _load_or_fit_historical_bucket_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem="historical_bucket_prior_v1",
        model_name="historical_bucket_prior_v1",
    )
    right_predictor = _load_or_fit_smh_coeffbank_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
        model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
    )
    return left_predictor, right_predictor


def _build_smh_glmm_latent_hb_blend_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    blend_name: str,
    bucket_weight: float,
    glmm_fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    bucket_predictor = _load_or_fit_historical_bucket_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem="historical_bucket_prior_v1",
        model_name="historical_bucket_prior_v1",
    )
    glmm_adapter = _build_smh_glmm_latent_adapter(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
        model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
        fit_kwargs=glmm_fit_kwargs or {"latent_dim": 2},
    )
    predictor = FixedPredictionBlendPredictor(
        left_predictor=glmm_adapter.predictor,
        right_predictor=bucket_predictor,
        right_weight=bucket_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_smh_coeffbank_hb_blend_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    blend_name: str,
    right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_smh_coeffbank_historical_bucket_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
    )
    predictor = FixedPredictionBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        right_weight=right_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_smh_coeffbank_hb_adaptive_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    blend_name: str,
    target_right_weight: float,
    min_right_weight: float,
    max_right_weight: float,
    weight_exponent: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_smh_coeffbank_historical_bucket_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
    )
    predictor = AdaptiveEntropyDisagreementBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        target_right_weight=target_right_weight,
        min_right_weight=min_right_weight,
        max_right_weight=max_right_weight,
        weight_exponent=weight_exponent,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_exact_observation_adapter(
    base_predictor: BaseRoundPredictor,
    *,
    name: str,
    beta_min: float = 8.0,
    beta_scale: float = 24.0,
    probability_floor: float = 0.01,
) -> RoundPredictorAdapter:
    predictor = ExactObservationBlendPredictor(
        base_predictor=base_predictor,
        beta_min=beta_min,
        beta_scale=beta_scale,
        probability_floor=probability_floor,
        name=name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_or_fit_smh_residual_student_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    base_model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> SemhResidualStudentPredictor:
    resolved_policy_name = (policy_name or "coverage").strip().lower()
    resolved_samples_per_round = 1 if samples_per_round is None else samples_per_round
    fit_kwargs = {} if fit_kwargs is None else dict(fit_kwargs)
    checkpoint_dir = workspace_paths.model_dir(
        _query_residual_checkpoint_dir_name(
            checkpoint_stem,
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "checkpoint.json"
    base_predictor = build_online_predictor(
        base_model_name,
        paths=workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
    ).predictor
    if checkpoint_path.exists():
        return SemhResidualStudentPredictor.load_checkpoint(
            checkpoint_path,
            base_predictor=base_predictor,
        )
    predictor = SemhResidualStudentPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        base_predictor=base_predictor,
        base_model_name=base_model_name,
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
        model_name=model_name,
        **fit_kwargs,
    )
    predictor.save_checkpoint(checkpoint_path)
    return predictor


def _build_smh_residual_student_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    base_model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_residual_student_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        base_model_name=base_model_name,
        fit_kwargs=fit_kwargs,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _load_smh_hbexact_calresid_components(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
) -> tuple[BaseRoundPredictor, BaseRoundPredictor]:
    left_predictor = build_online_predictor(
        SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_V001,
        paths=workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor
    right_predictor = build_online_predictor(
        SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001,
        paths=workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor
    return left_predictor, right_predictor


def _build_smh_hbexact_calresid_blend_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_smh_hbexact_calresid_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = FixedPredictionBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        right_weight=right_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_smh_hbexact_calresid_adaptive_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    target_right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_smh_hbexact_calresid_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = AdaptiveEntropyDisagreementBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        target_right_weight=target_right_weight,
        min_right_weight=0.05,
        max_right_weight=0.45,
        weight_exponent=1.0,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def _build_smh_hbexact_calresid_builtfreqgate_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    blend_name: str,
    min_right_weight: float,
    max_right_weight: float,
    built_frequency_intercept: float,
    built_frequency_slope: float,
    min_round_target_right_weight: float,
    max_round_target_right_weight: float,
) -> RoundPredictorAdapter:
    left_predictor, right_predictor = _load_smh_hbexact_calresid_components(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    predictor = BuiltFrequencyAdaptiveBlendPredictor(
        left_predictor=left_predictor,
        right_predictor=right_predictor,
        target_right_weight=0.45,
        min_right_weight=min_right_weight,
        max_right_weight=max_right_weight,
        weight_exponent=1.0,
        built_frequency_intercept=built_frequency_intercept,
        built_frequency_slope=built_frequency_slope,
        min_round_target_right_weight=min_round_target_right_weight,
        max_round_target_right_weight=max_round_target_right_weight,
        name=blend_name,
    )
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
    )


def build_online_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> RoundPredictorAdapter:
    normalized = model_name.strip().lower()
    if normalized == "geometry_prior":
        geometry_predictor = GeometryPriorPredictor()
        return RoundPredictorAdapter(
            predictor=geometry_predictor,
            name=geometry_predictor.name,
        )
    if normalized == "historical_bucket_prior":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_historical_bucket_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem="historical_bucket_prior_v1",
            model_name="historical_bucket_prior_v1",
        )
    if normalized == "latent_regime":
        latent_predictor = LatentRegimePredictor()
        return RoundPredictorAdapter(
            predictor=latent_predictor,
            name=latent_predictor.name,
        )
    if normalized == "query_residual":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem="query_residual_v7",
            model_name="query_residual_v7",
        )
    if normalized == QUERY_RESIDUAL_V8:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V8,
            model_name=QUERY_RESIDUAL_V8,
            fit_kwargs={
                "cell_selection_strategy": "stratified_entropy",
                "include_exact_local_residual": True,
            },
        )
    if normalized == QUERY_RESIDUAL_V9:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V9,
            model_name=QUERY_RESIDUAL_V9,
            fit_kwargs={
                "include_exact_local_residual": True,
            },
        )
    if normalized == QUERY_RESIDUAL_V10:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V10,
            model_name=QUERY_RESIDUAL_V10,
            fit_kwargs=_query_residual_v10_fit_kwargs(),
        )
    if normalized == QUERY_RESIDUAL_V9_LOCALGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V9_LOCALGATE_V001,
            model_name=QUERY_RESIDUAL_V9_LOCALGATE_V001,
            fit_kwargs=_query_residual_v9_localgate_fit_kwargs(),
        )
    if normalized == QUERY_RESIDUAL_V9_V10_BLEND025_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_v9_v10_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=QUERY_RESIDUAL_V9_V10_BLEND025_V001,
            right_weight=0.25,
        )
    if normalized == QUERY_RESIDUAL_V9_V10_ADAPTIVE025_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_v9_v10_adaptive025_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=QUERY_RESIDUAL_V9_V10_ADAPTIVE025_V001,
            target_right_weight=0.25,
            weight_exponent=1.0,
        )
    if normalized == QUERY_RESIDUAL_V9_V10_BUILTFREQGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_v9_v10_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=QUERY_RESIDUAL_V9_V10_BUILTFREQGATE_V001,
            min_right_weight=0.05,
            max_right_weight=0.45,
            built_frequency_intercept=0.35,
            built_frequency_slope=-0.8,
            min_round_target_right_weight=0.15,
            max_round_target_right_weight=0.35,
        )
    if normalized == QUERY_RESIDUAL_V9_V10_BUILTFREQGATEWIDE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_v9_v10_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=QUERY_RESIDUAL_V9_V10_BUILTFREQGATEWIDE_V001,
            min_right_weight=0.05,
            max_right_weight=0.45,
            built_frequency_intercept=0.38,
            built_frequency_slope=-1.0,
            min_round_target_right_weight=0.10,
            max_round_target_right_weight=0.40,
        )
    if normalized == QUERY_RESIDUAL_V9_V10_BUILTFREQGATEXWIDE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_v9_v10_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=QUERY_RESIDUAL_V9_V10_BUILTFREQGATEXWIDE_V001,
            min_right_weight=0.05,
            max_right_weight=0.45,
            built_frequency_intercept=0.40,
            built_frequency_slope=-1.2,
            min_round_target_right_weight=0.05,
            max_round_target_right_weight=0.45,
        )
    if normalized == SMH_RESID_LOCALGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_RESID_LOCALGATE_V001,
            model_name=SMH_RESID_LOCALGATE_V001,
            fit_kwargs={
                "min_delta_scale": 0.0,
                "teacher_locality_blend": True,
            },
        )
    if normalized == SMH_GLMM_Z0_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMM_Z0_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMM_Z0_H0_COVBASE_CALNONE_V001,
        )
    if normalized == SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_bank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001,
        )
    if normalized == SMH_GLMMBANK_ZHIST_H0_COVBASE_CALOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_bank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMBANK_ZHIST_H0_COVBASE_CALNONE_V001,
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_GLMMBANK_ZHIST_H0_COVBASE_CALOBS_V001,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
    if normalized == SMH_GLMMLATENT_Z2_H1_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H1_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H1_COVBASE_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 2,
                "memory_feature_names": ("occupied_recent", "ruin_recent", "port_recent"),
                "memory_decay": 0.85,
            },
        )
    if normalized == SMH_GLMMLATENT_Z4_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z4_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z4_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 4},
        )
    if normalized == SMH_GLMMLATENT_Z6_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z6_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z6_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 6},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVPRIOR_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVPRIOR_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVPRIOR_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 2,
                "feature_prior": True,
                "feature_prior_ridge_lambda": 8.0,
            },
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 2,
                "nbr_feature_names": (
                    "nbr_empty_frac",
                    "nbr_settlement_frac",
                    "nbr_port_frac",
                    "nbr_ruin_frac",
                    "nbr_occupied_frac",
                    "nbr_forest_frac",
                ),
            },
        )
    if normalized == SMH_GLMMLATENT_Z4_H0_COVNBR_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z4_H0_COVNBR_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z4_H0_COVNBR_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 4,
                "nbr_feature_names": (
                    "nbr_empty_frac",
                    "nbr_settlement_frac",
                    "nbr_port_frac",
                    "nbr_ruin_frac",
                    "nbr_occupied_frac",
                    "nbr_forest_frac",
                ),
            },
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVNBR3_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVNBR3_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVNBR3_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 2,
                "nbr_feature_names": (
                    "nbr_settlement_frac",
                    "nbr_occupied_frac",
                    "nbr_ruin_frac",
                ),
            },
        )
    if normalized in (GLMM_DT_ENSEMBLE_V001, GLMM_DT_ENSEMBLE_V002, GLMM_DT_ENSEMBLE_V003, GLMM_DT_ENSEMBLE_V004, GLMM_DT_ENSEMBLE_V005, GLMM_DT_ENSEMBLE_V006, GLMM_DT_ENSEMBLE_V007):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        glmm_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        dt_adapter = _build_direct_terminal_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=DIRECT_TERMINAL_Z2_V002,
            model_name=DIRECT_TERMINAL_Z2_V002,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.001, "max_epochs": 200},
        )
        # Different fixed blend ratios: GLMM-heavy to DT-heavy
        dt_weight_map = {
            GLMM_DT_ENSEMBLE_V001: 0.15,  # 85% GLMM, 15% DT
            GLMM_DT_ENSEMBLE_V002: 0.25,  # 75% GLMM, 25% DT
            GLMM_DT_ENSEMBLE_V003: 0.35,  # 65% GLMM, 35% DT
            GLMM_DT_ENSEMBLE_V004: 0.10,  # 90% GLMM, 10% DT
            GLMM_DT_ENSEMBLE_V005: 0.40,  # 60% GLMM, 40% DT
            GLMM_DT_ENSEMBLE_V006: 0.45,  # 55% GLMM, 45% DT
            GLMM_DT_ENSEMBLE_V007: 0.50,  # 50% GLMM, 50% DT
        }
        dt_weight = dt_weight_map[normalized]
        return RoundPredictorAdapter(
            predictor=FixedPredictionBlendPredictor(
                left_predictor=glmm_adapter.predictor,
                right_predictor=dt_adapter.predictor,
                right_weight=dt_weight,
                name=normalized,
            ),
            name=normalized,
        )
    if normalized == DIRECT_TERMINAL_Z2_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_direct_terminal_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=DIRECT_TERMINAL_Z2_V001,
            model_name=DIRECT_TERMINAL_Z2_V001,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.01, "max_epochs": 100},
        )
    if normalized == DIRECT_TERMINAL_Z2_V002:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_direct_terminal_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=DIRECT_TERMINAL_Z2_V002,
            model_name=DIRECT_TERMINAL_Z2_V002,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.001, "max_epochs": 200},
        )
    if normalized == DIRECT_TERMINAL_Z2_V003:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_direct_terminal_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=DIRECT_TERMINAL_Z2_V003,
            model_name=DIRECT_TERMINAL_Z2_V003,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.1, "max_epochs": 100},
        )
    if normalized in (SMH_GLMM_QR_ENSEMBLE_V001, SMH_GLMM_QR_ENSEMBLE_V002, SMH_GLMM_QR_ENSEMBLE_V003, SMH_GLMM_QR_ENSEMBLE_V004, SMH_GLMM_QR_ENSEMBLE_V005):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        glmm_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        qr_predictor = _load_or_fit_query_residual_predictor(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem="query_residual_v7",
            model_name="query_residual",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        params = {
            SMH_GLMM_QR_ENSEMBLE_V001: {"barren_threshold": 0.03, "barren_qr_weight": 0.7, "normal_qr_weight": 0.2},
            SMH_GLMM_QR_ENSEMBLE_V002: {"barren_threshold": 0.03, "barren_qr_weight": 0.5, "normal_qr_weight": 0.15},
            SMH_GLMM_QR_ENSEMBLE_V003: {"barren_threshold": 0.05, "barren_qr_weight": 0.6, "normal_qr_weight": 0.1},
            SMH_GLMM_QR_ENSEMBLE_V004: {"barren_threshold": 0.03, "barren_qr_weight": 0.7, "normal_qr_weight": 0.0},
            SMH_GLMM_QR_ENSEMBLE_V005: {"barren_threshold": 0.03, "barren_qr_weight": 0.5, "normal_qr_weight": 0.0},
        }[normalized]
        return RoundPredictorAdapter(
            predictor=RegimeAdaptiveEnsemblePredictor(
                glmm_predictor=glmm_adapter.predictor,
                qr_predictor=qr_predictor,
                name=normalized,
                **params,
            ),
            name=normalized,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        return RoundPredictorAdapter(
            predictor=BarrenRoundCorrectionPredictor(
                base_predictor=base_adapter.predictor,
                name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V001,
                barren_threshold=0.03,
                barren_settlement_scale=0.3,
                barren_ruin_scale=0.2,
                barren_forest_boost=1.15,
            ),
            name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V001,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V002:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        return RoundPredictorAdapter(
            predictor=BarrenRoundCorrectionPredictor(
                base_predictor=base_adapter.predictor,
                name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V002,
                barren_threshold=0.04,
                barren_settlement_scale=0.25,
                barren_ruin_scale=0.15,
                barren_forest_boost=1.2,
            ),
            name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V002,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V003:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        return RoundPredictorAdapter(
            predictor=BarrenRoundCorrectionPredictor(
                base_predictor=base_adapter.predictor,
                name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V003,
                barren_threshold=0.05,
                barren_settlement_scale=0.4,
                barren_ruin_scale=0.3,
                barren_forest_boost=1.1,
            ),
            name=SMH_GLMMLATENT_Z2_H0_COVBASE_BARREN_V003,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_TMIX_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_TMIX_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_TMIX_V001,
            fit_kwargs={"latent_dim": 2, "use_tensor_mixing": True},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVPOLY_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVPOLY_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVPOLY_CALNONE_V001,
            fit_kwargs={"latent_dim": 2, "include_poly_features": True},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_HBBLEND20_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_GLMMLATENT_Z2_H0_COVBASE_HBBLEND20_V001,
            bucket_weight=0.20,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_CALOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 2},
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_GLMMLATENT_Z2_H0_COVBASE_CALOBS_V001,
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_R01_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_R01_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_R01_V001,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.01},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_R10_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_R10_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_R10_V001,
            fit_kwargs={"latent_dim": 2, "ridge_lambda": 0.1},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVBASE_E50_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVBASE_E50_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVBASE_E50_V001,
            fit_kwargs={"latent_dim": 2, "max_epochs": 50},
        )
    if normalized == SMH_GLMMLATENT_Z3_H0_COVBASE_CALNONE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z3_H0_COVBASE_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z3_H0_COVBASE_CALNONE_V001,
            fit_kwargs={"latent_dim": 3},
        )
    if normalized == SMH_GLMMLATENT_Z2_H0_COVNBR_CALOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_glmm_latent_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001,
            model_name=SMH_GLMMLATENT_Z2_H0_COVNBR_CALNONE_V001,
            fit_kwargs={
                "latent_dim": 2,
                "nbr_feature_names": (
                    "nbr_empty_frac",
                    "nbr_settlement_frac",
                    "nbr_port_frac",
                    "nbr_ruin_frac",
                    "nbr_occupied_frac",
                    "nbr_forest_frac",
                ),
            },
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_GLMMLATENT_Z2_H0_COVNBR_CALOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVMARKPOSTW06_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW06_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW06_V001,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            summary_variant="covmark",
            summary_weight=6.0,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVMARKPOSTW12_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW12_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW12_V001,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            summary_variant="covmark",
            summary_weight=12.0,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVMARKPOSTW24_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW24_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVMARKPOSTW24_V001,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            summary_variant="covmark",
            summary_weight=24.0,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            fit_kwargs=_smh_calbase_resid_fit_kwargs(),
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            fit_kwargs=_smh_calbase_resid_fit_kwargs(),
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESID_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            fit_kwargs=_smh_calbase_residshrink_fit_kwargs(),
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            fit_kwargs=_smh_calbase_residshrink_fit_kwargs(),
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_RESIDSHRINK_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND025_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND025_V001,
            right_weight=0.25,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND020_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND020_V001,
            right_weight=0.20,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND030_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND030_V001,
            right_weight=0.30,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND035_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND035_V001,
            right_weight=0.35,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND040_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND040_V001,
            right_weight=0.40,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_V001,
            right_weight=0.45,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_V001,
            right_weight=0.50,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_V001,
            right_weight=0.45,
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND045_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_hbexact_calresid_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_V001,
            right_weight=0.50,
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BLEND050_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_ADAPT025_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_adaptive_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_ADAPT025_V001,
            target_right_weight=0.25,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATE_V001,
            min_right_weight=0.20,
            max_right_weight=0.65,
            built_frequency_intercept=0.75,
            built_frequency_slope=-1.20,
            min_round_target_right_weight=0.25,
            max_round_target_right_weight=0.65,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEWIDE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEWIDE_V001,
            min_right_weight=0.15,
            max_right_weight=0.70,
            built_frequency_intercept=0.82,
            built_frequency_slope=-1.40,
            min_round_target_right_weight=0.20,
            max_round_target_right_weight=0.70,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEXWIDE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_hbexact_calresid_builtfreqgate_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBEXACT_CALRESID_BUILTFREQGATEXWIDE_V001,
            min_right_weight=0.10,
            max_right_weight=0.75,
            built_frequency_intercept=0.90,
            built_frequency_slope=-1.60,
            min_round_target_right_weight=0.15,
            max_round_target_right_weight=0.75,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTFOCUS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTFOCUS_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTFOCUS_V001,
            class_weights=[0.25, 1.0, 1.2, 1.2, 0.35, 0.05],
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTSHARP_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTSHARP_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTSHARP_V001,
            class_weights=[0.20, 1.0, 1.25, 1.25, 0.30, 0.05],
            posterior_temperature=0.75,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND25_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND25_V001,
            right_weight=0.25,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND40_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND40_V001,
            right_weight=0.40,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_V001,
            right_weight=0.50,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_V001,
            right_weight=0.60,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBADAPT25_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_hb_adaptive_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBADAPT25_V001,
            target_right_weight=0.25,
            min_right_weight=0.05,
            max_right_weight=0.55,
            weight_exponent=1.0,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_V001,
            right_weight=0.50,
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_RESID_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_RESID_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_RESID_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_EXACTOBS_V001,
            fit_kwargs=_smh_hbblend_exactobs_resid_fit_kwargs(),
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        base_adapter = _build_smh_coeffbank_hb_blend_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            blend_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_V001,
            right_weight=0.60,
        )
        return _build_exact_observation_adapter(
            base_adapter.predictor,
            name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_V001,
        )
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_RESID_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_residual_student_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_RESID_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_RESID_V001,
            base_model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_EXACTOBS_V001,
            fit_kwargs=_smh_hbblend_exactobs_resid_fit_kwargs(),
        )
    if normalized == SMH_KNN5_Z12_H0_COVSUM_CALBASE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_KNN5_Z12_H0_COVSUM_CALBASE_V001,
            model_name=SMH_KNN5_Z12_H0_COVSUM_CALBASE_V001,
            summary_variant="covsum",
            latent_kind="regime",
        )
    if normalized == SMH_KNN5_Z12_H0_COVAUG_CALBASE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_KNN5_Z12_H0_COVAUG_CALBASE_V001,
            model_name=SMH_KNN5_Z12_H0_COVAUG_CALBASE_V001,
            summary_variant="covaug",
            latent_kind="regime",
        )
    if normalized == SMH_KNN5_Z12_H0_COVAUG_CALBANK_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_KNN5_Z12_H0_COVAUG_CALBANK_V001,
            model_name=SMH_KNN5_Z12_H0_COVAUG_CALBANK_V001,
            summary_variant="covaug",
            latent_kind="regime",
            terminal_blend_weight=1.0,
        )
    if normalized == SMH_KNN5_Z3_H0_COVAUG_CALBASE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_KNN5_Z3_H0_COVAUG_CALBASE_V001,
            model_name=SMH_KNN5_Z3_H0_COVAUG_CALBASE_V001,
            summary_variant="covaug",
            latent_kind="manifold",
            latent_rank=3,
        )
    if normalized == SMH_KNN5_Z3_H0_COVAUG_CALBLEND35_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_KNN5_Z3_H0_COVAUG_CALBLEND35_V001,
            model_name=SMH_KNN5_Z3_H0_COVAUG_CALBLEND35_V001,
            summary_variant="covaug",
            latent_kind="manifold",
            latent_rank=3,
            terminal_blend_weight=0.35,
        )
    msg = f"unsupported online predictor: {model_name}"
    raise ValueError(msg)


__all__ = [
    "OnlinePredictor",
    "RoundPredictorAdapter",
    "build_online_predictor",
]
