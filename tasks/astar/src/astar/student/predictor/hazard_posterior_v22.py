"""hazard_posterior_v22: MLP student posterior (Agent7's +1.67 pt innovation).

Replaces the linear ridge regression from transcript summaries to regime
coordinates with a small MLP (sklearn MLPRegressor). The MLP can capture
nonlinear patterns in observation features that help distinguish between
round types.

Combined with v15's original coefficients + v20's LightGBM in the ensemble.
Uses samples_per_round=4 to give the MLP enough training data.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients_v2 import round_regime_summary_vector_v2
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import (
    ObservationSetParticleRefinedStudent,
    _load_v2_training_pairs,
    _summary_vector_from_observations,
    _posterior_reweighted_by_observations,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.hazard_posterior_v15 import OriginalCoefficientTeacher
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2
from astar.teacher.regime.base import RegimePosteriorState

DEFAULT_V22_K = 5
DEFAULT_V22_RANK = 5
DEFAULT_V22_RIDGE_ALPHA = 1.0
DEFAULT_V22_MEAN_WEIGHT = 0.2
DEFAULT_V22_OBSERVATION_WEIGHT = 1.0
DEFAULT_V22_OBS_BLEND_TEMPERATURE = 20.0
_V22_PREFIX = "hazard_posterior_v22_"


def hazard_posterior_v22_spec_for_model_name(model_name):
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v22":
        return (DEFAULT_V22_K, DEFAULT_V22_RANK, DEFAULT_V22_RIDGE_ALPHA,
                DEFAULT_V22_MEAN_WEIGHT, DEFAULT_V22_OBSERVATION_WEIGHT)
    if not normalized.startswith(_V22_PREFIX):
        return None
    k, rank, ridge, mean_w, obs_w = (DEFAULT_V22_K, DEFAULT_V22_RANK,
        DEFAULT_V22_RIDGE_ALPHA, DEFAULT_V22_MEAN_WEIGHT, DEFAULT_V22_OBSERVATION_WEIGHT)
    for token in normalized.removeprefix(_V22_PREFIX).split("_"):
        if not token: continue
        if token.startswith("k") and token[1:].isdigit(): k = int(token[1:])
        elif token.startswith("r") and token[1:].isdigit(): rank = int(token[1:])
        elif token.startswith("l") and token[1:].isdigit(): ridge = float(int(token[1:]))
        elif token.startswith("m") and token[1:].isdigit(): mean_w = int(token[1:]) / 100.0
        elif token.startswith("q") and token[1:].isdigit(): obs_w = float(int(token[1:]))
        else: return None
    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0:
        return None
    return (k, rank, ridge, mean_w, obs_w)


def _entropy_conditioned_class_weights(replay_episodes):
    class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    ewcm = np.zeros(CLASS_COUNT, dtype=np.float64)
    for ep in replay_episodes:
        for seed in ep.seeds:
            tt = seed.terminal_truth
            if tt is None: continue
            probs = np.asarray(tt.probs, dtype=np.float64)
            class_mass += np.sum(probs, axis=(0, 1))
            ewcm += np.sum(entropy_map(probs)[..., None] * probs, axis=(0, 1))
    if float(np.sum(class_mass)) <= 0:
        return np.ones(CLASS_COUNT, dtype=np.float64)
    ce = ewcm / np.clip(class_mass, 1e-9, None)
    norm = ce / max(float(np.mean(ce)), 1e-9)
    w = np.power(np.clip(norm, 1e-9, None), 0.5)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, 0.6, 1.8).astype(np.float64)


def _obs_blend(prediction, observations, seed_index, temperature=20.0):
    h, w, nc = prediction.shape
    obs_count = np.zeros((h, w)); class_count = np.zeros((h, w, nc))
    for obs in observations:
        if obs.seed_index != seed_index: continue
        vp = obs.viewport
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        vy_end = min(vp.y + vp.h, h); vx_end = min(vp.x + vp.w, w)
        obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0
        region = collapsed[:vy_end - vp.y, :vx_end - vp.x]
        for c in range(nc):
            class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)
    total = obs_count[..., None]
    emp = class_count / np.maximum(total, 1.0)
    observed = obs_count > 0
    if np.any(observed):
        emp[observed] = np.clip(emp[observed], 0.005 / nc, 1.0)
        emp = emp / np.maximum(np.sum(emp, axis=-1, keepdims=True), 1e-8)
    bw = total / (total + temperature)
    refined = bw * emp + (1.0 - bw) * prediction
    return np.asarray(refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8), dtype=np.float64)


class MLPRefinedStudent(ObservationSetParticleRefinedStudent):
    """Student with MLP posterior instead of ridge regression."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "mlp_refined_student"
    mlp_model: object = None  # sklearn MLPRegressor

    @classmethod
    def fit_from_dataset(cls, dataset, teacher, *, k_neighbors=5, ridge_alpha=1.0,
        predicted_particle_weight=0.2, observation_weight=1.0,
        observation_class_floor=0.01, observation_class_weights=None,
    ):
        from sklearn.neural_network import MLPRegressor

        # Load training data
        summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]

        regime_mean = np.mean(regime_matrix, axis=0)
        centered_regime = regime_matrix - regime_mean[None, :]

        # Fit MLP (nonlinear regression from summary to regime)
        n_samples = normalized_summary.shape[0]
        hidden_size = min(32, max(8, n_samples // 2))

        mlp = MLPRegressor(
            hidden_layer_sizes=(hidden_size,),
            activation='relu',
            solver='adam',
            alpha=0.1,  # L2 regularization
            max_iter=2000,
            early_stopping=True if n_samples > 10 else False,
            validation_fraction=0.2 if n_samples > 10 else 0.1,
            random_state=42,
            learning_rate='adaptive',
            learning_rate_init=0.01,
        )
        mlp.fit(normalized_summary, centered_regime)

        # Also fit the linear projection as fallback
        gram = normalized_summary.T @ normalized_summary
        rhs = normalized_summary.T @ centered_regime
        projection = np.linalg.solve(
            gram + ridge_alpha * np.eye(gram.shape[0]), rhs,
        )
        regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
        regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
        regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)

        resolved_class_weights = (
            np.asarray(observation_class_weights, dtype=np.float64)
            if observation_class_weights is not None
            else np.ones(CLASS_COUNT, dtype=np.float64)
        )
        resolved_class_weights = np.clip(resolved_class_weights, 1e-6, None)

        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean.astype(np.float64),
            summary_scale=summary_scale.astype(np.float64),
            regime_mean=regime_mean.astype(np.float64),
            regime_projection=np.asarray(projection, dtype=np.float64),
            regime_clip=np.asarray(regime_clip, dtype=np.float64),
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_floor=observation_class_floor,
            observation_class_weights=resolved_class_weights,
            teacher=teacher,
            mlp_model=mlp,
        )

    def _predict_regime_mean(self, normalized_query):
        """Override: use MLP prediction instead of linear projection."""
        if self.mlp_model is not None:
            try:
                mlp_pred = self.mlp_model.predict(normalized_query.reshape(1, -1))[0]
                predicted = self.regime_mean + mlp_pred
            except Exception:
                # Fallback to linear
                predicted = self.regime_mean + normalized_query @ self.regime_projection
        else:
            predicted = self.regime_mean + normalized_query @ self.regime_projection

        clip = 1.5 * self.regime_clip
        return np.clip(predicted.astype(np.float64), self.regime_mean - clip, self.regime_mean + clip)


class HazardPosteriorV22Predictor(BaseRoundPredictor):
    """v15 teacher + MLP student posterior + obs blending."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v22"
    student: MLPRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=4, ge=1)  # More samples for MLP
    k_neighbors: int = Field(default=DEFAULT_V22_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V22_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V22_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V22_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V22_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(cls, paths, *, round_ids, policy_name="coverage",
        samples_per_round=4, k_neighbors=DEFAULT_V22_K, latent_rank=DEFAULT_V22_RANK,
        ridge_alpha=DEFAULT_V22_RIDGE_ALPHA, predicted_particle_weight=DEFAULT_V22_MEAN_WEIGHT,
        observation_weight=DEFAULT_V22_OBSERVATION_WEIGHT, model_name=None,
    ):
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v22 requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v22"
        base_teacher = HazardTeacherV2(name=f"{resolved_name}__base").fit(
            replay_eps, latent_rank=latent_rank)
        teacher = OriginalCoefficientTeacher(
            name=f"{resolved_name}__teacher",
            feature_names=base_teacher.feature_names,
            round_ids=base_teacher.round_ids,
            round_numbers=base_teacher.round_numbers,
            summary_bank=base_teacher.summary_bank,
            coefficient_bank=base_teacher.coefficient_bank,
            mean_vector=base_teacher.mean_vector,
            basis=base_teacher.basis,
            coordinates=base_teacher.coordinates,
            latent_rank=base_teacher.latent_rank,
            prior_blend_weight=0.02,
            floor=0.0003,
        )
        dataset = _ensure_synthetic_dataset(
            paths, cache_family="hazard_posterior_v7",
            policy_name=policy_name, samples_per_round=samples_per_round,
            round_ids=selected_ids, latent_rank=teacher.latent_rank,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        obs_class_w = _entropy_conditioned_class_weights(replay_eps)
        student = MLPRefinedStudent.fit_from_dataset(
            dataset, teacher, k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_weights=obs_class_w,
        )
        return cls(
            name=resolved_name, student=student,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors, latent_rank=teacher.latent_rank,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_weights=tuple(float(v) for v in obs_class_w.tolist()),
            training_round_ids=tuple(selected_ids),
        )

    def build_prediction_bundle_from_context(self, context):
        predictions = {}
        for seed in context.round_context.seeds:
            pred = self.student.predict_seed(context, seed.seed_index)
            pred = _obs_blend(pred, context.observations, seed.seed_index)
            predictions[seed.seed_index] = pred
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name, predictions_by_seed=predictions,
        )

    def build_prediction_bundle(self, round_detail, features, evidence=None):
        rc = build_round_context_from_detail(round_detail)
        ctx = LiveInferenceContext(
            online_episode=round_context_to_online_episode(rc),
            geometry_bundle=features,
            evidence_bundle=(evidence if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())),
        )
        return self.build_prediction_bundle_from_context(ctx)


__all__ = ["HazardPosteriorV22Predictor", "MLPRefinedStudent", "hazard_posterior_v22_spec_for_model_name"]
