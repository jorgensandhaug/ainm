"""hazard_posterior_v14: Combined best improvements on top of v8.

Combines:
- v8 entropy-conditioned class-weighted observation reweighting
- v11 conservative observation-frequency blending (temperature=20)
- v13 proper probability floor (0.01)
- v12 adaptive calibration based on posterior uncertainty

Each component has been independently validated:
- v11 t=20: +0.96 over v8 on hard-3 (79.44 vs 78.48)
- v13 f=10: pending validation but theoretically critical for worst rounds
- v12: pending validation

Model name: hazard_posterior_v14_k{K}_r{R}_l{L}_m{M}_q{Q}_f{floor}_t{temp}
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
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetParticleRefinedStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2
from astar.teacher.regime.base import RegimePosteriorState

# Defaults: v8 base + best v11/v13 parameters
DEFAULT_V14_K = 5
DEFAULT_V14_RANK = 3
DEFAULT_V14_RIDGE_ALPHA = 32.0
DEFAULT_V14_MEAN_WEIGHT = 0.7
DEFAULT_V14_OBSERVATION_WEIGHT = 8.0
DEFAULT_V14_PROBABILITY_FLOOR = 0.01
DEFAULT_V14_OBS_BLEND_TEMPERATURE = 20.0
DEFAULT_V14_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V14_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V14_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_V14_CLASS_WEIGHTING = "entropy_v1"
# Adaptive calibration params
DEFAULT_V14_UNCERTAIN_TEMPERATURE = 1.3
DEFAULT_V14_UNCERTAIN_FLOOR_MULTIPLIER = 2.0
DEFAULT_V14_UNCERTAINTY_THRESHOLD = 0.7
_V14_PREFIX = "hazard_posterior_v14_"


def hazard_posterior_v14_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v14":
        return (
            DEFAULT_V14_K,
            DEFAULT_V14_RANK,
            DEFAULT_V14_RIDGE_ALPHA,
            DEFAULT_V14_MEAN_WEIGHT,
            DEFAULT_V14_OBSERVATION_WEIGHT,
            DEFAULT_V14_PROBABILITY_FLOOR,
            DEFAULT_V14_OBS_BLEND_TEMPERATURE,
        )
    if not normalized.startswith(_V14_PREFIX):
        return None

    k = DEFAULT_V14_K
    rank = DEFAULT_V14_RANK
    ridge = DEFAULT_V14_RIDGE_ALPHA
    mean_w = DEFAULT_V14_MEAN_WEIGHT
    obs_w = DEFAULT_V14_OBSERVATION_WEIGHT
    floor = DEFAULT_V14_PROBABILITY_FLOOR
    obs_temp = DEFAULT_V14_OBS_BLEND_TEMPERATURE

    for token in normalized.removeprefix(_V14_PREFIX).split("_"):
        if not token:
            continue
        if token.startswith("k") and token[1:].isdigit():
            k = int(token[1:])
        elif token.startswith("r") and token[1:].isdigit():
            rank = int(token[1:])
        elif token.startswith("l") and token[1:].isdigit():
            ridge = float(int(token[1:]))
        elif token.startswith("m") and token[1:].isdigit():
            mean_w = int(token[1:]) / 100.0
        elif token.startswith("q") and token[1:].isdigit():
            obs_w = float(int(token[1:]))
        elif token.startswith("f") and token[1:].isdigit():
            floor = int(token[1:]) / 1000.0
        elif token.startswith("t") and token[1:].isdigit():
            obs_temp = int(token[1:]) / 10.0
        else:
            return None

    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0 or floor < 0 or obs_temp <= 0:
        return None
    return (k, rank, ridge, mean_w, obs_w, floor, obs_temp)


def _entropy_conditioned_class_weights(
    replay_episodes: Sequence[RoundEpisode],
) -> np.ndarray:
    class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    entropy_weighted_class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    for episode in replay_episodes:
        for seed in episode.seeds:
            tt = seed.terminal_truth
            if tt is None:
                continue
            probs = np.asarray(tt.probs, dtype=np.float64)
            class_mass += np.sum(probs, axis=(0, 1))
            entropy_weighted_class_mass += np.sum(
                entropy_map(probs)[..., None] * probs, axis=(0, 1),
            )
    if float(np.sum(class_mass)) <= 0.0:
        return np.ones(CLASS_COUNT, dtype=np.float64)
    ce = entropy_weighted_class_mass / np.clip(class_mass, 1e-9, None)
    norm = ce / max(float(np.mean(ce)), 1e-9)
    w = np.power(np.clip(norm, 1e-9, None), DEFAULT_V14_CLASS_WEIGHT_POWER)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, DEFAULT_V14_CLASS_WEIGHT_FLOOR, DEFAULT_V14_CLASS_WEIGHT_CEIL).astype(np.float64)


def _posterior_uncertainty(posterior: RegimePosteriorState) -> float:
    if posterior.weights is None or posterior.particles is None:
        return 1.0
    w = np.asarray(posterior.weights, dtype=np.float64)
    total = float(np.sum(w))
    if total <= 0 or not np.all(np.isfinite(w)):
        return 1.0
    norm_w = w / total
    n = len(norm_w)
    if n <= 1:
        return 0.0
    ent = -float(np.sum(norm_w * np.log(np.clip(norm_w, 1e-12, 1.0))))
    return float(np.clip(ent / max(float(np.log(n)), 1e-12), 0.0, 1.0))


def _apply_adaptive_calibration(
    prediction: np.ndarray,
    uncertainty: float,
    base_floor: float,
) -> np.ndarray:
    """Apply uncertainty-adaptive temperature + floor."""
    u = float(np.clip(uncertainty / DEFAULT_V14_UNCERTAINTY_THRESHOLD, 0.0, 1.0))
    temperature = 1.0 + u * (DEFAULT_V14_UNCERTAIN_TEMPERATURE - 1.0)
    floor = base_floor * (1.0 + u * (DEFAULT_V14_UNCERTAIN_FLOOR_MULTIPLIER - 1.0))

    result = prediction.copy()
    if temperature > 1.0 + 1e-6:
        safe = np.clip(result, 1e-8, 1.0)
        logits = np.log(safe) / temperature
        shifted = logits - np.max(logits, axis=-1, keepdims=True)
        exp_l = np.exp(np.clip(shifted, -25.0, 25.0))
        result = exp_l / np.sum(exp_l, axis=-1, keepdims=True)

    if floor > 1e-6:
        # Only floor uncertain cells (max prob < 0.95) to avoid diluting
        # correct confident predictions on ocean/mountain/settled cells
        max_prob = np.max(result, axis=-1)
        uncertain = max_prob < 0.95
        if np.any(uncertain):
            result[uncertain] = np.maximum(result[uncertain], floor)
            sums = np.sum(result[uncertain], axis=-1, keepdims=True)
            result[uncertain] = result[uncertain] / np.maximum(sums, 1e-8)

    return result.astype(np.float64)


def _apply_obs_blending(
    prediction: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    temperature: float,
) -> np.ndarray:
    """Conservative observation-frequency blending."""
    h, w, nc = prediction.shape
    obs_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, nc), dtype=np.float64)

    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        local_h = vy_end - vp.y
        local_w = vx_end - vp.x
        obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0
        region = collapsed[:local_h, :local_w]
        for c in range(nc):
            class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)

    total_obs = obs_count[..., None]
    empirical = class_count / np.maximum(total_obs, 1.0)

    observed_mask = obs_count > 0
    if np.any(observed_mask):
        floor = 0.005 / nc
        empirical[observed_mask] = np.clip(empirical[observed_mask], floor, 1.0)
        empirical = empirical / np.maximum(np.sum(empirical, axis=-1, keepdims=True), 1e-8)

    blend_w = total_obs / (total_obs + temperature)
    refined = blend_w * empirical + (1.0 - blend_w) * prediction
    return np.asarray(refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8), dtype=np.float64)


class HazardPosteriorV14Predictor(BaseRoundPredictor):
    """Combined v8 + v11 obs blend + v13 floor + v12 adaptive calibration."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v14"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V14_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V14_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V14_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V14_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V14_OBSERVATION_WEIGHT, gt=0.0)
    probability_floor: float = Field(default=DEFAULT_V14_PROBABILITY_FLOOR, ge=0.0)
    obs_blend_temperature: float = Field(default=DEFAULT_V14_OBS_BLEND_TEMPERATURE, gt=0.0)
    observation_class_weighting: str = DEFAULT_V14_CLASS_WEIGHTING
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_V14_K,
        latent_rank: int = DEFAULT_V14_RANK,
        ridge_alpha: float = DEFAULT_V14_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V14_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V14_OBSERVATION_WEIGHT,
        probability_floor: float = DEFAULT_V14_PROBABILITY_FLOOR,
        obs_blend_temperature: float = DEFAULT_V14_OBS_BLEND_TEMPERATURE,
        model_name: str | None = None,
    ) -> HazardPosteriorV14Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_ids = sorted(set(round_ids))
        if not selected_ids:
            raise ValueError("v14 requires replay-backed training rounds")
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v14 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v14"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
            f"__floor={int(round(probability_floor * 1000.0))}"
            f"__t={int(round(obs_blend_temperature * 10.0))}"
        )
        teacher = HazardTeacherV2(name=f"{resolved_name}__teacher").fit(
            replay_eps, latent_rank=latent_rank,
        )
        dataset = _ensure_synthetic_dataset(
            paths,
            cache_family="hazard_posterior_v7",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_ids,
            latent_rank=teacher.latent_rank,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        obs_class_w = _entropy_conditioned_class_weights(replay_eps)
        student = ObservationSetParticleRefinedStudent.fit_from_dataset(
            dataset, teacher,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_weights=obs_class_w,
        )
        return cls(
            name=resolved_name,
            student=student,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=teacher.latent_rank,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            probability_floor=probability_floor,
            obs_blend_temperature=obs_blend_temperature,
            observation_class_weighting=DEFAULT_V14_CLASS_WEIGHTING,
            observation_class_weights=tuple(float(v) for v in obs_class_w.tolist()),
            training_round_ids=tuple(selected_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        # Get posterior uncertainty
        posterior = self.student.infer_regime(context)
        uncertainty = _posterior_uncertainty(posterior)

        predictions: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            # 1. Base v8 prediction
            pred = self.student.predict_seed(context, seed.seed_index)

            # 2. Adaptive calibration (temperature + floor based on uncertainty)
            pred = _apply_adaptive_calibration(pred, uncertainty, self.probability_floor)

            # 3. Conservative observation blending
            pred = _apply_obs_blending(
                pred, context.observations, seed.seed_index,
                self.obs_blend_temperature,
            )

            # 4. Final probability floor enforcement (uncertain cells only)
            if self.probability_floor > 0:
                max_prob = np.max(pred, axis=-1)
                uncertain = max_prob < 0.95
                if np.any(uncertain):
                    pred[uncertain] = np.maximum(pred[uncertain], self.probability_floor)
                    sums = np.sum(pred[uncertain], axis=-1, keepdims=True)
                    pred[uncertain] = pred[uncertain] / np.maximum(sums, 1e-8)

            predictions[seed.seed_index] = pred

        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        rc = build_round_context_from_detail(round_detail)
        ctx = LiveInferenceContext(
            online_episode=round_context_to_online_episode(rc),
            geometry_bundle=features,
            evidence_bundle=(
                evidence if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())
            ),
        )
        return self.build_prediction_bundle_from_context(ctx)


__all__ = [
    "DEFAULT_V14_K",
    "DEFAULT_V14_MEAN_WEIGHT",
    "DEFAULT_V14_OBS_BLEND_TEMPERATURE",
    "DEFAULT_V14_OBSERVATION_WEIGHT",
    "DEFAULT_V14_PROBABILITY_FLOOR",
    "DEFAULT_V14_RANK",
    "DEFAULT_V14_RIDGE_ALPHA",
    "HazardPosteriorV14Predictor",
    "hazard_posterior_v14_spec_for_model_name",
]
