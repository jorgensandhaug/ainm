from __future__ import annotations

from collections.abc import Sequence
import os
from pathlib import Path
import time

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import OnlinePredictor, TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.gbx_map_prior import (
    GBX_PRIOR_MAPONLY_BUCKET_MODEL,
    GreyBoxMapOnlyBucketPredictor,
)
from astar.student.predictor.gbx_transcript_regime import (
    GreyBoxTranscriptRegimeManifoldPredictor,
    GreyBoxTranscriptRegimeRoundBankPredictor,
    GreyBoxTranscriptRegimeRidgePredictor,
    GreyBoxTranscriptRegimeKNNPredictor,
    gbx_transcript_regime_scoped_checkpoint_path,
    is_gbx_transcript_regime_manifold_model_name,
    is_gbx_transcript_regime_model_name,
    is_gbx_transcript_regime_ridge_model_name,
    is_gbx_transcript_regime_roundbank_model_name,
    resolve_gbx_transcript_regime_policy_names,
    resolve_gbx_transcript_regime_training_spec,
)
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    is_query_residual_model_name,
    query_residual_scoped_checkpoint_path,
    resolve_query_residual_serving_overrides,
    resolve_query_residual_training_spec,
)
from astar.student.predictor.round import BaseRoundPredictor

_COVTRAIN_QUERY_RESIDUAL_MODELS = {
    "query_residual_v11_covtrain",
    "query_residual_v11_covtrain_p0_b624",
    "query_residual_v11_covtrain_p0_b624_t100",
}

_GBX_TRANSCRIPT_REGIME_BLEND_SPECS: dict[str, tuple[str, str, float, str]] = {
    "gbx_maponly_transcriptregime_mapknn_blend05": (
        "gbx_maponly_transcriptregime_mapknn_blend05_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.05,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend05_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend05_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.05,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend10": (
        "gbx_maponly_transcriptregime_mapknn_blend10_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend10_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend10_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend15": (
        "gbx_maponly_transcriptregime_mapknn_blend15_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.15,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend15_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend15_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.15,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend20": (
        "gbx_maponly_transcriptregime_mapknn_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend20_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend30": (
        "gbx_maponly_transcriptregime_mapknn_blend30_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.30,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend30_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend30_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.30,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend40": (
        "gbx_maponly_transcriptregime_mapknn_blend40_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.40,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend40_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend40_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.40,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend50": (
        "gbx_maponly_transcriptregime_mapknn_blend50_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.50,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend50_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend50_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.50,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend60": (
        "gbx_maponly_transcriptregime_mapknn_blend60_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.60,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_blend60_v1": (
        "gbx_maponly_transcriptregime_mapknn_blend60_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.60,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapknn_confblend20": (
        "gbx_maponly_transcriptregime_mapknn_confblend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "confidence",
    ),
    "gbx_maponly_transcriptregime_mapknn_confblend20_v1": (
        "gbx_maponly_transcriptregime_mapknn_confblend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "confidence",
    ),
    "gbx_maponly_transcriptregime_mapknn_confentropy20": (
        "gbx_maponly_transcriptregime_mapknn_confentropy20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "confidence_entropy",
    ),
    "gbx_maponly_transcriptregime_mapknn_confentropy20_v1": (
        "gbx_maponly_transcriptregime_mapknn_confentropy20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn",
        0.20,
        "confidence_entropy",
    ),
    "gbx_maponly_transcriptregime_mapllr_blend20": (
        "gbx_maponly_transcriptregime_mapllr_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapllr",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapllr_blend20_v1": (
        "gbx_maponly_transcriptregime_mapllr_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapllr",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapprior_blend20": (
        "gbx_maponly_transcriptregime_mapprior_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapprior",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptregime_mapprior_blend20_v1": (
        "gbx_maponly_transcriptregime_mapprior_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapprior",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptdelta_mapknn_blend10": (
        "gbx_maponly_transcriptdelta_mapknn_blend10_v1",
        "gbx_transcript_regime_knn_terminal_mapknn_delta",
        0.10,
        "uniform",
    ),
    "gbx_maponly_transcriptdelta_mapknn_blend10_v1": (
        "gbx_maponly_transcriptdelta_mapknn_blend10_v1",
        "gbx_transcript_regime_knn_terminal_mapknn_delta",
        0.10,
        "uniform",
    ),
    "gbx_maponly_transcriptdelta_mapknn_blend20": (
        "gbx_maponly_transcriptdelta_mapknn_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn_delta",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptdelta_mapknn_blend20_v1": (
        "gbx_maponly_transcriptdelta_mapknn_blend20_v1",
        "gbx_transcript_regime_knn_terminal_mapknn_delta",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptmanifold_mapknn_blend20": (
        "gbx_maponly_transcriptmanifold_mapknn_blend20_v1",
        "gbx_transcript_manifold_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptmanifold_mapknn_blend20_v1": (
        "gbx_maponly_transcriptmanifold_mapknn_blend20_v1",
        "gbx_transcript_manifold_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptmanifolddelta_mapknn_blend20": (
        "gbx_maponly_transcriptmanifolddelta_mapknn_blend20_v1",
        "gbx_transcript_manifold_terminal_mapknn_delta",
        0.20,
        "uniform",
    ),
    "gbx_maponly_transcriptmanifolddelta_mapknn_blend20_v1": (
        "gbx_maponly_transcriptmanifolddelta_mapknn_blend20_v1",
        "gbx_transcript_manifold_terminal_mapknn_delta",
        0.20,
        "uniform",
    ),
    "gbx_maponly_roundbank_mapknn_blend10": (
        "gbx_maponly_roundbank_mapknn_blend10_v1",
        "gbx_roundbank_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_roundbank_mapknn_blend10_v1": (
        "gbx_maponly_roundbank_mapknn_blend10_v1",
        "gbx_roundbank_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_roundbank_mapknn_blend20": (
        "gbx_maponly_roundbank_mapknn_blend20_v1",
        "gbx_roundbank_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_roundbank_mapknn_blend20_v1": (
        "gbx_maponly_roundbank_mapknn_blend20_v1",
        "gbx_roundbank_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_ridge_mapknn_blend10": (
        "gbx_maponly_ridge_mapknn_blend10_v1",
        "gbx_ridge_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_ridge_mapknn_blend10_v1": (
        "gbx_maponly_ridge_mapknn_blend10_v1",
        "gbx_ridge_terminal_mapknn",
        0.10,
        "uniform",
    ),
    "gbx_maponly_ridge_mapknn_blend20": (
        "gbx_maponly_ridge_mapknn_blend20_v1",
        "gbx_ridge_terminal_mapknn",
        0.20,
        "uniform",
    ),
    "gbx_maponly_ridge_mapknn_blend20_v1": (
        "gbx_maponly_ridge_mapknn_blend20_v1",
        "gbx_ridge_terminal_mapknn",
        0.20,
        "uniform",
    ),
}

_GBX_TRANSCRIPT_ENSEMBLE_BLEND_SPECS: dict[str, tuple[str, tuple[str, ...], tuple[float, ...]]] = {
    "gbx_maponly_transcriptdual_mapknn_blend20": (
        "gbx_maponly_transcriptdual_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_regime_knn_terminal_mapknn_delta",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptdual_mapknn_blend20_v1": (
        "gbx_maponly_transcriptdual_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_regime_knn_terminal_mapknn_delta",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptregime_manifold_mapknn_blend20": (
        "gbx_maponly_transcriptregime_manifold_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptregime_manifold_mapknn_blend20_v1": (
        "gbx_maponly_transcriptregime_manifold_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptregime_manifolddelta_mapknn_blend20": (
        "gbx_maponly_transcriptregime_manifolddelta_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn_delta",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptregime_manifolddelta_mapknn_blend20_v1": (
        "gbx_maponly_transcriptregime_manifolddelta_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn_delta",
        ),
        (0.10, 0.10),
    ),
    "gbx_maponly_transcriptregime_manifoldtriple_mapknn_blend20": (
        "gbx_maponly_transcriptregime_manifoldtriple_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn_delta",
        ),
        (0.10, 0.05, 0.05),
    ),
    "gbx_maponly_transcriptregime_manifoldtriple_mapknn_blend20_v1": (
        "gbx_maponly_transcriptregime_manifoldtriple_mapknn_blend20_v1",
        (
            "gbx_transcript_regime_knn_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn",
            "gbx_transcript_manifold_terminal_mapknn_delta",
        ),
        (0.10, 0.05, 0.05),
    ),
}


def is_gbx_transcript_regime_blend_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in _GBX_TRANSCRIPT_REGIME_BLEND_SPECS


def is_gbx_transcript_ensemble_blend_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in _GBX_TRANSCRIPT_ENSEMBLE_BLEND_SPECS


def resolve_gbx_transcript_regime_blend_spec(model_name: str) -> tuple[str, str, float, str]:
    normalized = model_name.strip().lower()
    if normalized not in _GBX_TRANSCRIPT_REGIME_BLEND_SPECS:
        raise ValueError(f"unsupported gbx transcript blend model: {model_name}")
    return _GBX_TRANSCRIPT_REGIME_BLEND_SPECS[normalized]


def resolve_gbx_transcript_ensemble_blend_spec(
    model_name: str,
) -> tuple[str, tuple[str, ...], tuple[float, ...]]:
    normalized = model_name.strip().lower()
    if normalized not in _GBX_TRANSCRIPT_ENSEMBLE_BLEND_SPECS:
        raise ValueError(f"unsupported gbx transcript ensemble blend model: {model_name}")
    return _GBX_TRANSCRIPT_ENSEMBLE_BLEND_SPECS[normalized]


def _load_or_fit_locked_checkpoint(
    checkpoint_path: Path,
    *,
    loader,
    builder,
    timeout_seconds: float = 1800.0,
):
    if checkpoint_path.exists():
        return loader(checkpoint_path)
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = checkpoint_path.with_suffix(f"{checkpoint_path.suffix}.lock")
    started_at = time.monotonic()
    while True:
        if checkpoint_path.exists():
            return loader(checkpoint_path)
        try:
            lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(lock_fd, f"{os.getpid()}\n".encode("utf-8"))
            os.close(lock_fd)
            break
        except FileExistsError:
            if checkpoint_path.exists():
                return loader(checkpoint_path)
            if time.monotonic() - started_at > timeout_seconds:
                raise TimeoutError(f"timed out waiting for checkpoint lock: {lock_path}")
            time.sleep(1.0)
    try:
        if checkpoint_path.exists():
            return loader(checkpoint_path)
        predictor = builder()
        predictor.save_checkpoint(checkpoint_path)
        return predictor
    finally:
        try:
            os.unlink(lock_path)
        except FileNotFoundError:
            pass


class GreyBoxTranscriptRegimeBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    transcript_weight: float
    gate_mode: str = "uniform"
    probability_floor: float = 1e-4
    map_prior_predictor: GreyBoxMapOnlyBucketPredictor
    transcript_predictor: GreyBoxTranscriptRegimeKNNPredictor | GreyBoxTranscriptRegimeManifoldPredictor | GreyBoxTranscriptRegimeRoundBankPredictor | GreyBoxTranscriptRegimeRidgePredictor

    def _transcript_predictions_with_confidence(self, context) -> tuple[dict[int, np.ndarray], dict[int, np.ndarray]]:
        posterior = self.transcript_predictor.infer_regime(context)
        confidence_by_seed: dict[int, np.ndarray] = {}
        predictions_by_seed: dict[int, np.ndarray] = {}
        normalized_weights = None
        if posterior.weights is not None:
            normalized_weights = np.asarray(posterior.weights, dtype=np.float64)
            normalized_weights = normalized_weights / np.sum(normalized_weights)
        for seed in context.round_context.seeds:
            if posterior.particles is not None and normalized_weights is not None:
                particle_predictions = np.stack(
                    [
                        self.transcript_predictor.terminal_teacher.terminal_tensor(seed, particle)
                        for particle in posterior.particles
                    ],
                    axis=0,
                )
                transcript_prediction = np.tensordot(normalized_weights, particle_predictions, axes=(0, 0))
                weighted_tvd = np.tensordot(
                    normalized_weights,
                    0.5 * np.sum(np.abs(particle_predictions - transcript_prediction[None, ...]), axis=-1),
                    axes=(0, 0),
                )
                confidence_by_seed[seed.seed_index] = 1.0 - np.clip(weighted_tvd, 0.0, 1.0)
            else:
                transcript_prediction = self.transcript_predictor.terminal_teacher.posterior_predictive(seed, posterior)
                confidence_by_seed[seed.seed_index] = np.ones(transcript_prediction.shape[:2], dtype=np.float64)
            predictions_by_seed[seed.seed_index] = np.asarray(transcript_prediction, dtype=np.float64)
        return predictions_by_seed, confidence_by_seed

    def _blend_weight_map(
        self,
        base_prediction: np.ndarray,
        transcript_confidence: np.ndarray,
    ) -> float | np.ndarray:
        if self.gate_mode == "uniform":
            return self.transcript_weight
        confidence = np.asarray(transcript_confidence, dtype=np.float64)[:, :, None]
        if self.gate_mode == "confidence":
            return self.transcript_weight * confidence
        if self.gate_mode == "confidence_entropy":
            entropy_weight = (
                entropy_map(np.asarray(base_prediction, dtype=np.float64)) / np.log(base_prediction.shape[-1])
            )[:, :, None]
            return self.transcript_weight * confidence * entropy_weight
        raise ValueError(f"unsupported transcript blend gate_mode: {self.gate_mode}")

    def _blend_predictions(
        self,
        base_prediction: np.ndarray,
        transcript_prediction: np.ndarray,
        transcript_confidence: np.ndarray,
    ) -> np.ndarray:
        blend_weight = self._blend_weight_map(base_prediction, transcript_confidence)
        blended = ((1.0 - blend_weight) * base_prediction) + (blend_weight * transcript_prediction)
        return apply_probability_floor(blended, self.probability_floor)

    def build_prediction_bundle_from_context(self, context) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        base_bundle = self.map_prior_predictor.build_prediction_bundle(round_detail, None)
        transcript_predictions_by_seed, confidence_by_seed = self._transcript_predictions_with_confidence(context)
        predictions_by_seed = {
            seed_index: self._blend_predictions(
                np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64),
                transcript_predictions_by_seed[seed_index],
                confidence_by_seed[seed_index],
            )
            for seed_index in sorted(base_bundle.predictions_by_seed)
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        del features, evidence
        base_bundle = self.map_prior_predictor.build_prediction_bundle(round_detail, None)
        context = round_context_to_live_inference_context(build_round_context_from_detail(round_detail), ())
        transcript_predictions_by_seed, confidence_by_seed = self._transcript_predictions_with_confidence(context)
        predictions_by_seed = {
            seed_index: self._blend_predictions(
                np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64),
                transcript_predictions_by_seed[seed_index],
                confidence_by_seed[seed_index],
            )
            for seed_index in sorted(base_bundle.predictions_by_seed)
        }
        return PredictionBundle(
            round_id=round_detail.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


class GreyBoxTranscriptEnsembleBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    probability_floor: float = 1e-4
    map_prior_predictor: GreyBoxMapOnlyBucketPredictor
    transcript_predictors: tuple[
        GreyBoxTranscriptRegimeKNNPredictor | GreyBoxTranscriptRegimeManifoldPredictor | GreyBoxTranscriptRegimeRoundBankPredictor | GreyBoxTranscriptRegimeRidgePredictor,
        ...,
    ]
    transcript_weights: tuple[float, ...]

    def build_prediction_bundle_from_context(self, context) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        base_bundle = self.map_prior_predictor.build_prediction_bundle(round_detail, None)
        transcript_bundles = [
            predictor.build_prediction_bundle_from_context(context)
            for predictor in self.transcript_predictors
        ]
        base_weight = 1.0 - float(np.sum(np.asarray(self.transcript_weights, dtype=np.float64)))
        predictions_by_seed = {
            seed_index: apply_probability_floor(
                (base_weight * np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64))
                + sum(
                    float(weight) * np.asarray(bundle.predictions_by_seed[seed_index], dtype=np.float64)
                    for weight, bundle in zip(self.transcript_weights, transcript_bundles, strict=True)
                ),
                self.probability_floor,
            )
            for seed_index in sorted(base_bundle.predictions_by_seed)
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence=None,
    ) -> PredictionBundle:
        del features, evidence
        context = round_context_to_live_inference_context(build_round_context_from_detail(round_detail), ())
        return self.build_prediction_bundle_from_context(context)


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


def build_online_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int = 1,
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
        if historical_round_ids is not None:
            historical_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
                workspace_paths,
                round_ids=list(historical_round_ids),
            )
        else:
            checkpoint_path = workspace_paths.model_dir("historical_bucket_prior_v1") / "checkpoint.json"
            if checkpoint_path.exists():
                historical_predictor = HistoricalBucketPriorPredictor.load_checkpoint(checkpoint_path)
            else:
                historical_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
                    workspace_paths,
                )
                historical_predictor.save_checkpoint(checkpoint_path)
        return RoundPredictorAdapter(
            predictor=historical_predictor,
            name=historical_predictor.name,
        )
    if normalized in {"gbx_prior_maponly_bucket", GBX_PRIOR_MAPONLY_BUCKET_MODEL}:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        gbx_prior = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        return RoundPredictorAdapter(
            predictor=gbx_prior,
            name=gbx_prior.name,
        )
    if is_gbx_transcript_ensemble_blend_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_name, transcript_model_names, transcript_weights = resolve_gbx_transcript_ensemble_blend_spec(normalized)
        gbx_prior = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        transcript_adapters = [
            build_online_predictor(
                transcript_model_name,
                paths=workspace_paths,
                historical_round_ids=historical_round_ids,
                policy_name=policy_name,
                samples_per_round=samples_per_round,
            )
            for transcript_model_name in transcript_model_names
        ]
        predictor = GreyBoxTranscriptEnsembleBlendPredictor(
            name=resolved_name,
            map_prior_predictor=gbx_prior,
            transcript_predictors=tuple(adapter.predictor for adapter in transcript_adapters),
            transcript_weights=tuple(float(weight) for weight in transcript_weights),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_gbx_transcript_regime_blend_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_name, transcript_model_name, transcript_weight, gate_mode = (
            resolve_gbx_transcript_regime_blend_spec(normalized)
        )
        gbx_prior = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        transcript_adapter = build_online_predictor(
            transcript_model_name,
            paths=workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        predictor = GreyBoxTranscriptRegimeBlendPredictor(
            name=resolved_name,
            transcript_weight=transcript_weight,
            gate_mode=gate_mode,
            map_prior_predictor=gbx_prior,
            transcript_predictor=transcript_adapter.predictor,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "latent_regime":
        latent_predictor = LatentRegimePredictor()
        return RoundPredictorAdapter(
            predictor=latent_predictor,
            name=latent_predictor.name,
        )
    if is_gbx_transcript_regime_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        _, resolved_policy_name = resolve_gbx_transcript_regime_policy_names(policy_name or "coverage")
        checkpoint_model_name, _, _, _, resolved_samples_per_round = (
            resolve_gbx_transcript_regime_training_spec(
                normalized,
                samples_per_round=samples_per_round,
            )
        )
        if historical_round_ids is not None:
            checkpoint_path = gbx_transcript_regime_scoped_checkpoint_path(
                workspace_paths,
                model_name=checkpoint_model_name,
                round_ids=list(historical_round_ids),
                policy_name=resolved_policy_name,
                samples_per_round=resolved_samples_per_round,
            )
            predictor_loader = GreyBoxTranscriptRegimeKNNPredictor.load_checkpoint
            predictor_builder = lambda: GreyBoxTranscriptRegimeKNNPredictor.fit_from_workspace(
                workspace_paths,
                round_ids=list(historical_round_ids),
                policy_name=resolved_policy_name,
                samples_per_round=resolved_samples_per_round,
                model_name=checkpoint_model_name,
            )
            if is_gbx_transcript_regime_roundbank_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeRoundBankPredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeRoundBankPredictor.fit_from_workspace(
                    workspace_paths,
                    round_ids=list(historical_round_ids),
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            if is_gbx_transcript_regime_ridge_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeRidgePredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeRidgePredictor.fit_from_workspace(
                    workspace_paths,
                    round_ids=list(historical_round_ids),
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            if is_gbx_transcript_regime_manifold_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeManifoldPredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeManifoldPredictor.fit_from_workspace(
                    workspace_paths,
                    round_ids=list(historical_round_ids),
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            predictor = _load_or_fit_locked_checkpoint(
                checkpoint_path,
                loader=predictor_loader,
                builder=predictor_builder,
            )
        else:
            checkpoint_dir = workspace_paths.model_dir(
                f"{checkpoint_model_name}__policy={resolved_policy_name}__samples={resolved_samples_per_round}",
            )
            checkpoint_path = checkpoint_dir / "checkpoint.json"
            predictor_loader = GreyBoxTranscriptRegimeKNNPredictor.load_checkpoint
            predictor_builder = lambda: GreyBoxTranscriptRegimeKNNPredictor.fit_from_workspace(
                workspace_paths,
                policy_name=resolved_policy_name,
                samples_per_round=resolved_samples_per_round,
                model_name=checkpoint_model_name,
            )
            if is_gbx_transcript_regime_roundbank_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeRoundBankPredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeRoundBankPredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            if is_gbx_transcript_regime_ridge_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeRidgePredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeRidgePredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            if is_gbx_transcript_regime_manifold_model_name(normalized):
                predictor_loader = GreyBoxTranscriptRegimeManifoldPredictor.load_checkpoint
                predictor_builder = lambda: GreyBoxTranscriptRegimeManifoldPredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=resolved_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                )
            predictor = _load_or_fit_locked_checkpoint(
                checkpoint_path,
                loader=predictor_loader,
                builder=predictor_builder,
            )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_query_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        training_policy_name = (
            "coverage"
            if normalized in _COVTRAIN_QUERY_RESIDUAL_MODELS
            else resolved_policy_name
        )
        checkpoint_model_name, resolved_samples_per_round, cell_selection_strategy, include_exact_local_residual = (
            resolve_query_residual_training_spec(
                normalized,
                samples_per_round=samples_per_round,
            )
        )
        if historical_round_ids is not None:
            checkpoint_path = query_residual_scoped_checkpoint_path(
                workspace_paths,
                model_name=checkpoint_model_name,
                round_ids=list(historical_round_ids),
                policy_name=training_policy_name,
                samples_per_round=resolved_samples_per_round,
            )
            if checkpoint_path.exists():
                predictor = QueryResidualPredictor.load_checkpoint(checkpoint_path)
            else:
                predictor = QueryResidualPredictor.fit_from_workspace(
                    workspace_paths,
                    round_ids=list(historical_round_ids),
                    policy_name=training_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                    cell_selection_strategy=cell_selection_strategy,
                    include_exact_local_residual=include_exact_local_residual,
                )
                predictor.save_checkpoint(checkpoint_path)
        else:
            checkpoint_dir = workspace_paths.model_dir(
                f"{checkpoint_model_name}__policy={training_policy_name}__samples={resolved_samples_per_round}",
            )
            checkpoint_path = checkpoint_dir / "checkpoint.json"
            if checkpoint_path.exists():
                predictor = QueryResidualPredictor.load_checkpoint(checkpoint_path)
            else:
                predictor = QueryResidualPredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=training_policy_name,
                    samples_per_round=resolved_samples_per_round,
                    model_name=checkpoint_model_name,
                    cell_selection_strategy=cell_selection_strategy,
                    include_exact_local_residual=include_exact_local_residual,
                )
                predictor.save_checkpoint(checkpoint_path)
        serving_overrides = resolve_query_residual_serving_overrides(normalized)
        if normalized in _COVTRAIN_QUERY_RESIDUAL_MODELS or serving_overrides:
            predictor = predictor.model_copy(update={"name": normalized, **serving_overrides})
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    msg = f"unsupported online predictor: {model_name}"
    raise ValueError(msg)


__all__ = [
    "OnlinePredictor",
    "RoundPredictorAdapter",
    "build_online_predictor",
]
