"""hazard_posterior_v11: Observation-frequency blending on top of v8 teacher.

Key innovation: Uses each viewport observation as a DIRECT sample from the
year-50 terrain distribution. For cells observed multiple times, the empirical
frequency across observations is blended with the model prediction, weighted
by observation count.

This is orthogonal to the regime-inference observation reweighting already in
v8. The v8 reweighting uses observations to refine the *regime posterior*
(indirect), while v11's blending uses observations as *direct evidence* for
each cell's terminal class probability.

Model name format: hazard_posterior_v11_k{K}_r{R}_l{ridge}_m{mean_weight}_q{obs_weight}_t{temperature}
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

DEFAULT_V11_K = 5
DEFAULT_V11_RANK = 3
DEFAULT_V11_RIDGE_ALPHA = 32.0
DEFAULT_V11_MEAN_WEIGHT = 0.7
DEFAULT_V11_OBSERVATION_WEIGHT = 8.0
DEFAULT_V11_OBS_BLEND_TEMPERATURE = 3.0
DEFAULT_V11_OBS_BLEND_FLOOR = 0.005
DEFAULT_V11_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V11_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V11_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_V11_CLASS_WEIGHTING = "entropy_v1"
_V11_PREFIX = "hazard_posterior_v11_"


def hazard_posterior_v11_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v11":
        return (
            DEFAULT_V11_K,
            DEFAULT_V11_RANK,
            DEFAULT_V11_RIDGE_ALPHA,
            DEFAULT_V11_MEAN_WEIGHT,
            DEFAULT_V11_OBSERVATION_WEIGHT,
            DEFAULT_V11_OBS_BLEND_TEMPERATURE,
        )
    if not normalized.startswith(_V11_PREFIX):
        return None

    k = DEFAULT_V11_K
    rank = DEFAULT_V11_RANK
    ridge = DEFAULT_V11_RIDGE_ALPHA
    mean_w = DEFAULT_V11_MEAN_WEIGHT
    obs_w = DEFAULT_V11_OBSERVATION_WEIGHT
    temperature = DEFAULT_V11_OBS_BLEND_TEMPERATURE

    for token in normalized.removeprefix(_V11_PREFIX).split("_"):
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
        elif token.startswith("t") and token[1:].isdigit():
            temperature = int(token[1:]) / 10.0
        else:
            return None

    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0 or temperature <= 0:
        return None
    return (k, rank, ridge, mean_w, obs_w, temperature)


def _entropy_conditioned_class_weights(
    replay_episodes: Sequence[RoundEpisode],
) -> np.ndarray:
    class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    entropy_weighted_class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    for episode in replay_episodes:
        for seed in episode.seeds:
            terminal_truth = seed.terminal_truth
            if terminal_truth is None:
                continue
            probabilities = np.asarray(terminal_truth.probs, dtype=np.float64)
            class_mass += np.sum(probabilities, axis=(0, 1))
            entropy_weighted_class_mass += np.sum(
                entropy_map(probabilities)[..., None] * probabilities,
                axis=(0, 1),
            )
    if float(np.sum(class_mass)) <= 0.0:
        return np.ones(CLASS_COUNT, dtype=np.float64)
    conditional_entropy = entropy_weighted_class_mass / np.clip(class_mass, 1e-9, None)
    normalized = conditional_entropy / max(float(np.mean(conditional_entropy)), 1e-9)
    weights = np.power(np.clip(normalized, 1e-9, None), DEFAULT_V11_CLASS_WEIGHT_POWER)
    weights = weights / max(float(np.mean(weights)), 1e-9)
    return np.clip(weights, DEFAULT_V11_CLASS_WEIGHT_FLOOR, DEFAULT_V11_CLASS_WEIGHT_CEIL).astype(np.float64)


def _refine_tensor_with_observations(
    predicted_tensor: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    *,
    temperature: float = 3.0,
    class_floor: float = 0.005,
) -> np.ndarray:
    """Blend model prediction with direct empirical observation frequencies.

    For each cell, the blend weight is:
        w = obs_count / (obs_count + temperature)

    With temperature=3:
    - 1 observation: w=0.25 (25% empirical, 75% model)
    - 3 observations: w=0.50 (50/50)
    - 10 observations: w=0.77 (77% empirical)

    This is a Bayesian update with the model as the prior and observations
    as independent draws from the true distribution.
    """
    h, w, n_classes = predicted_tensor.shape
    observation_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, n_classes), dtype=np.float64)

    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        # Accumulate counts for the viewport region
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        for gy in range(vp.y, vy_end):
            for gx in range(vp.x, vx_end):
                local_y = gy - vp.y
                local_x = gx - vp.x
                observation_count[gy, gx] += 1.0
                observed_class = int(collapsed[local_y, local_x])
                if 0 <= observed_class < n_classes:
                    class_count[gy, gx, observed_class] += 1.0

    # Empirical frequencies from observations
    total_obs = observation_count[..., None]  # (h, w, 1)
    empirical_freq = class_count / np.maximum(total_obs, 1.0)

    # Apply class floor to empirical estimates to avoid zero probabilities
    observed_mask = observation_count > 0
    if np.any(observed_mask):
        n_floored = n_classes
        empirical_freq[observed_mask] = np.clip(
            empirical_freq[observed_mask],
            class_floor / n_floored,
            1.0,
        )
        # Re-normalize empirical estimates
        empirical_sums = np.sum(empirical_freq, axis=-1, keepdims=True)
        empirical_freq = empirical_freq / np.maximum(empirical_sums, 1e-8)

    # Blend weight: how much to trust observations vs model
    blend_weight = total_obs / (total_obs + temperature)  # (h, w, 1)

    refined = blend_weight * empirical_freq + (1.0 - blend_weight) * predicted_tensor

    # Normalize
    sums = np.sum(refined, axis=-1, keepdims=True)
    return np.asarray(refined / np.maximum(sums, 1e-8), dtype=np.float64)


def _refine_tensor_with_observations_vectorized(
    predicted_tensor: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    *,
    temperature: float = 3.0,
    class_floor: float = 0.005,
) -> np.ndarray:
    """Vectorized version of observation blending (faster for many observations)."""
    h, w, n_classes = predicted_tensor.shape
    observation_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, n_classes), dtype=np.float64)

    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        local_h = vy_end - vp.y
        local_w = vx_end - vp.x
        observation_count[vp.y:vy_end, vp.x:vx_end] += 1.0
        # Use bincount per cell for class counts
        region = collapsed[:local_h, :local_w]
        for c in range(n_classes):
            class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)

    total_obs = observation_count[..., None]
    empirical_freq = class_count / np.maximum(total_obs, 1.0)

    observed_mask = observation_count > 0
    if np.any(observed_mask):
        empirical_freq[observed_mask] = np.clip(
            empirical_freq[observed_mask],
            class_floor / n_classes,
            1.0,
        )
        empirical_sums = np.sum(empirical_freq, axis=-1, keepdims=True)
        empirical_freq = empirical_freq / np.maximum(empirical_sums, 1e-8)

    blend_weight = total_obs / (total_obs + temperature)
    refined = blend_weight * empirical_freq + (1.0 - blend_weight) * predicted_tensor
    sums = np.sum(refined, axis=-1, keepdims=True)
    return np.asarray(refined / np.maximum(sums, 1e-8), dtype=np.float64)


class HazardPosteriorV11Predictor(BaseRoundPredictor):
    """v8 teacher + observation-frequency blending post-processing."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v11"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V11_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V11_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V11_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V11_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V11_OBSERVATION_WEIGHT, gt=0.0)
    obs_blend_temperature: float = Field(default=DEFAULT_V11_OBS_BLEND_TEMPERATURE, gt=0.0)
    observation_class_weighting: str = DEFAULT_V11_CLASS_WEIGHTING
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
        k_neighbors: int = DEFAULT_V11_K,
        latent_rank: int = DEFAULT_V11_RANK,
        ridge_alpha: float = DEFAULT_V11_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V11_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V11_OBSERVATION_WEIGHT,
        obs_blend_temperature: float = DEFAULT_V11_OBS_BLEND_TEMPERATURE,
        model_name: str | None = None,
    ) -> HazardPosteriorV11Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("hazard_posterior_v11 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, rid) for rid in selected_round_ids
        ]
        replay_episodes = [ep for ep in replay_episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("hazard_posterior_v11 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v11"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
            f"__t={int(round(obs_blend_temperature * 10.0))}"
        )
        # Same teacher as v8 (HazardTeacherV2 with v2 features)
        teacher = HazardTeacherV2(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            latent_rank=latent_rank,
        )
        # Reuse v7 cache family (same teacher architecture)
        dataset = _ensure_synthetic_dataset(
            paths,
            cache_family="hazard_posterior_v7",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_round_ids,
            latent_rank=teacher.latent_rank,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        observation_class_weights = _entropy_conditioned_class_weights(replay_episodes)
        student = ObservationSetParticleRefinedStudent.fit_from_dataset(
            dataset,
            teacher,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_weights=observation_class_weights,
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
            obs_blend_temperature=obs_blend_temperature,
            observation_class_weighting=DEFAULT_V11_CLASS_WEIGHTING,
            observation_class_weights=tuple(float(v) for v in observation_class_weights.tolist()),
            training_round_ids=tuple(selected_round_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            # Get base v8-style prediction
            base_pred = self.student.predict_seed(context, seed.seed_index)
            # Refine with observation frequencies
            refined = _refine_tensor_with_observations_vectorized(
                base_pred,
                context.observations,
                seed.seed_index,
                temperature=self.obs_blend_temperature,
            )
            predictions_by_seed[seed.seed_index] = refined
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=(
                evidence
                if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())
            ),
        )
        return self.build_prediction_bundle_from_context(context)


__all__ = [
    "DEFAULT_V11_K",
    "DEFAULT_V11_MEAN_WEIGHT",
    "DEFAULT_V11_OBS_BLEND_TEMPERATURE",
    "DEFAULT_V11_OBSERVATION_WEIGHT",
    "DEFAULT_V11_RANK",
    "DEFAULT_V11_RIDGE_ALPHA",
    "HazardPosteriorV11Predictor",
    "hazard_posterior_v11_spec_for_model_name",
]
