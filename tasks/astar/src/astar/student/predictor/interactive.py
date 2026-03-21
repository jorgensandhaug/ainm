from __future__ import annotations

from collections.abc import Sequence
import hashlib

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

SMH_RESID_LOCALGATE_V001 = "smh_resid_z12_h0_covbase_locgate_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001 = "smh_coeffbank_z0_h0_covlike_calbase_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTFOCUS_V001 = "smh_coeffbank_z0_h0_covlike_builtfocus_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_BUILTSHARP_V001 = "smh_coeffbank_z0_h0_covlike_builtsharp_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND25_V001 = "smh_coeffbank_z0_h0_covlike_hbblend25_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND40_V001 = "smh_coeffbank_z0_h0_covlike_hbblend40_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND50_V001 = "smh_coeffbank_z0_h0_covlike_hbblend50_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBBLEND60_V001 = "smh_coeffbank_z0_h0_covlike_hbblend60_v001"
SMH_COEFFBANK_Z0_H0_COVLIKE_HBADAPT25_V001 = "smh_coeffbank_z0_h0_covlike_hbadapt25_v001"
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


def _load_or_fit_smh_coeffbank_predictor(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    checkpoint_stem: str,
    model_name: str,
    class_weights: Sequence[float] | None = None,
    posterior_temperature: float = 1.0,
) -> SemimechCoefficientBankPredictor:
    checkpoint_dir = workspace_paths.model_dir(
        _smh_checkpoint_dir_name(
            checkpoint_stem,
            historical_round_ids=historical_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "smh_coeffbank_predictor.json"
    if checkpoint_path.exists():
        return SemimechCoefficientBankPredictor.load_checkpoint(checkpoint_path)
    predictor = SemimechCoefficientBankPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        model_name=model_name,
        class_weights=None if class_weights is None else list(class_weights),
        posterior_temperature=posterior_temperature,
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
) -> RoundPredictorAdapter:
    predictor = _load_or_fit_smh_coeffbank_predictor(
        workspace_paths,
        historical_round_ids=historical_round_ids,
        checkpoint_stem=checkpoint_stem,
        model_name=model_name,
        class_weights=class_weights,
        posterior_temperature=posterior_temperature,
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
    if normalized == SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_smh_coeffbank_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            checkpoint_stem=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
            model_name=SMH_COEFFBANK_Z0_H0_COVLIKE_CALBASE_V001,
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
