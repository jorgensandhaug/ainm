"""hazard_posterior_v12: Posterior-uncertainty-adaptive calibration on top of v8.

Key innovation: When the model's posterior particles disagree strongly (the
regime is hard to identify), use more conservative predictions:
- Higher temperature (softer probabilities)
- Wider class floors
- More blending toward the training-data average

This specifically targets the worst rounds (score ~58) where regime
identification fails, without degrading the best rounds (score ~92).

Also includes the v11 observation-frequency blending with a configurable
temperature (default high enough to be conservative).

Model name format: hazard_posterior_v12_k{K}_r{R}_l{ridge}_m{mean_weight}_q{obs_weight}
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

DEFAULT_V12_K = 5
DEFAULT_V12_RANK = 3
DEFAULT_V12_RIDGE_ALPHA = 32.0
DEFAULT_V12_MEAN_WEIGHT = 0.7
DEFAULT_V12_OBSERVATION_WEIGHT = 8.0
DEFAULT_V12_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V12_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V12_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_V12_CLASS_WEIGHTING = "entropy_v1"
# Adaptive calibration parameters
DEFAULT_V12_UNCERTAIN_TEMPERATURE = 1.5
DEFAULT_V12_UNCERTAIN_FLOOR = 0.04
DEFAULT_V12_CONFIDENT_FLOOR = 0.01
DEFAULT_V12_UNCERTAINTY_THRESHOLD = 0.7  # weight entropy / max_entropy
DEFAULT_V12_OBS_BLEND_TEMPERATURE = 20.0
_V12_PREFIX = "hazard_posterior_v12_"


def hazard_posterior_v12_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v12":
        return (
            DEFAULT_V12_K,
            DEFAULT_V12_RANK,
            DEFAULT_V12_RIDGE_ALPHA,
            DEFAULT_V12_MEAN_WEIGHT,
            DEFAULT_V12_OBSERVATION_WEIGHT,
        )
    if not normalized.startswith(_V12_PREFIX):
        return None

    k = DEFAULT_V12_K
    rank = DEFAULT_V12_RANK
    ridge = DEFAULT_V12_RIDGE_ALPHA
    mean_w = DEFAULT_V12_MEAN_WEIGHT
    obs_w = DEFAULT_V12_OBSERVATION_WEIGHT

    for token in normalized.removeprefix(_V12_PREFIX).split("_"):
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
        else:
            return None

    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0:
        return None
    return (k, rank, ridge, mean_w, obs_w)


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
    weights = np.power(np.clip(normalized, 1e-9, None), DEFAULT_V12_CLASS_WEIGHT_POWER)
    weights = weights / max(float(np.mean(weights)), 1e-9)
    return np.clip(weights, DEFAULT_V12_CLASS_WEIGHT_FLOOR, DEFAULT_V12_CLASS_WEIGHT_CEIL).astype(np.float64)


def _compute_posterior_uncertainty(posterior: RegimePosteriorState) -> float:
    """Compute normalized uncertainty from posterior particle weights.

    Returns value in [0, 1]:
    - 0.0 = all weight on one particle (confident)
    - 1.0 = uniform weights (maximally uncertain)
    """
    if posterior.weights is None or posterior.particles is None:
        return 1.0
    weights = np.asarray(posterior.weights, dtype=np.float64)
    total = float(np.sum(weights))
    if total <= 0 or not np.all(np.isfinite(weights)):
        return 1.0
    normalized = weights / total
    n_particles = len(normalized)
    if n_particles <= 1:
        return 0.0
    # Entropy of weight distribution
    entropy = -float(np.sum(normalized * np.log(np.clip(normalized, 1e-12, 1.0))))
    max_entropy = float(np.log(n_particles))
    return float(np.clip(entropy / max(max_entropy, 1e-12), 0.0, 1.0))


def _adaptive_calibrate(
    prediction: np.ndarray,
    uncertainty: float,
    *,
    uncertain_temperature: float = DEFAULT_V12_UNCERTAIN_TEMPERATURE,
    uncertain_floor: float = DEFAULT_V12_UNCERTAIN_FLOOR,
    confident_floor: float = DEFAULT_V12_CONFIDENT_FLOOR,
    uncertainty_threshold: float = DEFAULT_V12_UNCERTAINTY_THRESHOLD,
) -> np.ndarray:
    """Apply uncertainty-adaptive calibration to the prediction tensor.

    When uncertainty is high:
    - Apply temperature > 1 (soften probabilities)
    - Use wider class floors
    - Blend toward flat-ish prior

    When uncertainty is low:
    - Minimal calibration (narrow floors only)
    """
    h, w, n_classes = prediction.shape

    # Compute how "uncertain" we are on a 0-1 scale
    u = float(np.clip(uncertainty / max(uncertainty_threshold, 1e-6), 0.0, 1.0))

    # Interpolate calibration parameters based on uncertainty
    temperature = 1.0 + u * (uncertain_temperature - 1.0)
    class_floor = confident_floor + u * (uncertain_floor - confident_floor)

    calibrated = prediction.copy()

    if temperature > 1.0 + 1e-6:
        # Apply temperature scaling to logits
        safe_pred = np.clip(calibrated, 1e-8, 1.0)
        logits = np.log(safe_pred)
        logits = logits / temperature
        # Softmax
        shifted = logits - np.max(logits, axis=-1, keepdims=True)
        exp_logits = np.exp(np.clip(shifted, -25.0, 25.0))
        calibrated = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)

    if class_floor > 1e-6:
        # Apply class floor
        calibrated = np.maximum(calibrated, class_floor / n_classes)
        sums = np.sum(calibrated, axis=-1, keepdims=True)
        calibrated = calibrated / np.maximum(sums, 1e-8)

    return calibrated.astype(np.float64)


def _refine_with_observations(
    prediction: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    *,
    temperature: float = DEFAULT_V12_OBS_BLEND_TEMPERATURE,
) -> np.ndarray:
    """Conservative observation blending (from v11, with high default temperature)."""
    h, w, n_classes = prediction.shape
    obs_count = np.zeros((h, w), dtype=np.float64)
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
        obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0
        region = collapsed[:local_h, :local_w]
        for c in range(n_classes):
            class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)

    total_obs = obs_count[..., None]
    empirical = class_count / np.maximum(total_obs, 1.0)

    observed_mask = obs_count > 0
    if np.any(observed_mask):
        floor = 0.005 / n_classes
        empirical[observed_mask] = np.clip(empirical[observed_mask], floor, 1.0)
        empirical = empirical / np.maximum(np.sum(empirical, axis=-1, keepdims=True), 1e-8)

    blend_w = total_obs / (total_obs + temperature)
    refined = blend_w * empirical + (1.0 - blend_w) * prediction
    return np.asarray(refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8), dtype=np.float64)


class HazardPosteriorV12Predictor(BaseRoundPredictor):
    """v8 teacher + adaptive calibration + observation blending."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v12"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V12_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V12_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V12_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V12_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V12_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weighting: str = DEFAULT_V12_CLASS_WEIGHTING
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()
    # Training-data average tensor per seed (for fallback on uncertain rounds)
    training_average_tensors: dict[int, np.ndarray] = Field(default_factory=dict)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_V12_K,
        latent_rank: int = DEFAULT_V12_RANK,
        ridge_alpha: float = DEFAULT_V12_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V12_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V12_OBSERVATION_WEIGHT,
        model_name: str | None = None,
    ) -> HazardPosteriorV12Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("v12 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, rid) for rid in selected_round_ids
        ]
        replay_episodes = [ep for ep in replay_episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("v12 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v12"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
        )
        teacher = HazardTeacherV2(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            latent_rank=latent_rank,
        )
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

        # Compute training-data average terminal tensors per seed for fallback
        training_avg: dict[int, list[np.ndarray]] = {}
        for ep in replay_episodes:
            for seed in ep.seeds:
                if seed.terminal_truth is not None:
                    training_avg.setdefault(seed.seed_index, []).append(
                        np.asarray(seed.terminal_truth.probs, dtype=np.float64)
                    )
        training_average_tensors = {
            seed_idx: np.mean(np.stack(tensors, axis=0), axis=0)
            for seed_idx, tensors in training_avg.items()
            if tensors
        }

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
            observation_class_weighting=DEFAULT_V12_CLASS_WEIGHTING,
            observation_class_weights=tuple(float(v) for v in observation_class_weights.tolist()),
            training_round_ids=tuple(selected_round_ids),
            training_average_tensors=training_average_tensors,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        # Get posterior from the student (to measure uncertainty)
        posterior = self.student.infer_regime(context)
        uncertainty = _compute_posterior_uncertainty(posterior)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            # Get base prediction
            base_pred = self.student.predict_seed(context, seed.seed_index)

            # Apply adaptive calibration based on posterior uncertainty
            calibrated = _adaptive_calibrate(
                base_pred,
                uncertainty,
            )

            # Apply conservative observation blending
            refined = _refine_with_observations(
                calibrated,
                context.observations,
                seed.seed_index,
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
    "DEFAULT_V12_K",
    "DEFAULT_V12_MEAN_WEIGHT",
    "DEFAULT_V12_OBSERVATION_WEIGHT",
    "DEFAULT_V12_RANK",
    "DEFAULT_V12_RIDGE_ALPHA",
    "HazardPosteriorV12Predictor",
    "hazard_posterior_v12_spec_for_model_name",
]
