"""hazard_posterior_v10: Nonlinear RFF teacher with enhanced v3 features.

Uses HazardTeacherV5 (RFF + v3 features) as the terminal decoder,
with the same ObservationSetParticleRefinedStudent posterior inference
and entropy-conditioned class weighting from v8.

Model name format: hazard_posterior_v10_k{K}_r{R}_l{ridge}_m{mean_weight}_q{obs_weight}_d{rff_dim}_s{rff_sigma}
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
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
from astar.teacher.dynamics.hazard_teacher_v5 import HazardTeacherV5

DEFAULT_V10_K = 5
DEFAULT_V10_RANK = 3
DEFAULT_V10_RIDGE_ALPHA = 32.0
DEFAULT_V10_MEAN_WEIGHT = 0.7
DEFAULT_V10_OBSERVATION_WEIGHT = 8.0
DEFAULT_V10_RFF_DIM = 512
DEFAULT_V10_RFF_SIGMA = 1.0
DEFAULT_V10_RFF_RIDGE = 1.0
DEFAULT_V10_LINEAR_BLEND = 0.3
DEFAULT_V10_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V10_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V10_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_V10_CLASS_WEIGHTING = "entropy_v1"
_V10_PREFIX = "hazard_posterior_v10_"


def hazard_posterior_v10_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v10":
        return (
            DEFAULT_V10_K,
            DEFAULT_V10_RANK,
            DEFAULT_V10_RIDGE_ALPHA,
            DEFAULT_V10_MEAN_WEIGHT,
            DEFAULT_V10_OBSERVATION_WEIGHT,
            DEFAULT_V10_RFF_DIM,
            DEFAULT_V10_RFF_SIGMA,
            DEFAULT_V10_RFF_RIDGE,
            DEFAULT_V10_LINEAR_BLEND,
        )
    if not normalized.startswith(_V10_PREFIX):
        return None

    k = DEFAULT_V10_K
    rank = DEFAULT_V10_RANK
    ridge = DEFAULT_V10_RIDGE_ALPHA
    mean_w = DEFAULT_V10_MEAN_WEIGHT
    obs_w = DEFAULT_V10_OBSERVATION_WEIGHT
    rff_dim = DEFAULT_V10_RFF_DIM
    rff_sigma = DEFAULT_V10_RFF_SIGMA
    rff_ridge = DEFAULT_V10_RFF_RIDGE
    linear_blend = DEFAULT_V10_LINEAR_BLEND

    for token in normalized.removeprefix(_V10_PREFIX).split("_"):
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
        elif token.startswith("d") and token[1:].isdigit():
            rff_dim = int(token[1:])
        elif token.startswith("s") and token[1:].isdigit():
            rff_sigma = int(token[1:]) / 10.0
        elif token.startswith("b") and token[1:].isdigit():
            linear_blend = int(token[1:]) / 100.0
        elif token.startswith("a") and token[1:].isdigit():
            rff_ridge = float(int(token[1:])) / 10.0
        else:
            return None

    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0 or rff_dim < 1:
        return None
    return (k, rank, ridge, mean_w, obs_w, rff_dim, rff_sigma, rff_ridge, linear_blend)


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
    weights = np.power(
        np.clip(normalized, 1e-9, None),
        DEFAULT_V10_CLASS_WEIGHT_POWER,
    )
    weights = weights / max(float(np.mean(weights)), 1e-9)
    return np.clip(
        weights,
        DEFAULT_V10_CLASS_WEIGHT_FLOOR,
        DEFAULT_V10_CLASS_WEIGHT_CEIL,
    ).astype(np.float64)


class HazardPosteriorV10Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v10"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V10_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V10_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V10_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V10_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V10_OBSERVATION_WEIGHT, gt=0.0)
    rff_dim: int = Field(default=DEFAULT_V10_RFF_DIM, ge=1)
    rff_sigma: float = Field(default=DEFAULT_V10_RFF_SIGMA, gt=0.0)
    rff_ridge: float = Field(default=DEFAULT_V10_RFF_RIDGE, gt=0.0)
    linear_blend: float = Field(default=DEFAULT_V10_LINEAR_BLEND, ge=0.0, le=1.0)
    observation_class_weighting: str = DEFAULT_V10_CLASS_WEIGHTING
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
        k_neighbors: int = DEFAULT_V10_K,
        latent_rank: int = DEFAULT_V10_RANK,
        ridge_alpha: float = DEFAULT_V10_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V10_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V10_OBSERVATION_WEIGHT,
        rff_dim: int = DEFAULT_V10_RFF_DIM,
        rff_sigma: float = DEFAULT_V10_RFF_SIGMA,
        rff_ridge: float = DEFAULT_V10_RFF_RIDGE,
        linear_blend: float = DEFAULT_V10_LINEAR_BLEND,
        model_name: str | None = None,
    ) -> HazardPosteriorV10Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("hazard_posterior_v10 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, rid) for rid in selected_round_ids
        ]
        replay_episodes = [ep for ep in replay_episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("hazard_posterior_v10 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v10"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
            f"__rff_dim={rff_dim}"
            f"__rff_sigma={rff_sigma:.1f}"
            f"__rff_ridge={rff_ridge:.1f}"
            f"__blend={int(round(linear_blend * 100.0))}"
        )
        teacher = HazardTeacherV5(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            latent_rank=latent_rank,
            rff_dim=rff_dim,
            rff_sigma=rff_sigma,
            rff_ridge_alpha=rff_ridge,
            use_linear_blend=(linear_blend > 0.0),
            linear_blend_weight=linear_blend,
        )
        # Use hazard_posterior_v10 cache family to avoid aliasing
        dataset = _ensure_synthetic_dataset(
            paths,
            cache_family="hazard_posterior_v10",
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
            rff_dim=rff_dim,
            rff_sigma=rff_sigma,
            rff_ridge=rff_ridge,
            linear_blend=linear_blend,
            observation_class_weighting=DEFAULT_V10_CLASS_WEIGHTING,
            observation_class_weights=tuple(float(v) for v in observation_class_weights.tolist()),
            training_round_ids=tuple(selected_round_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed = {
            seed.seed_index: self.student.predict_seed(context, seed.seed_index)
            for seed in context.round_context.seeds
        }
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


# Also provide a linear-only v3-features variant for ablation
class HazardPosteriorV10LinearPredictor(HazardPosteriorV10Predictor):
    """Same enhanced v3 features but linear decoder only (no RFF). For ablation."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v10_linear"

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_V10_K,
        latent_rank: int = DEFAULT_V10_RANK,
        ridge_alpha: float = DEFAULT_V10_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V10_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V10_OBSERVATION_WEIGHT,
        rff_dim: int = DEFAULT_V10_RFF_DIM,
        rff_sigma: float = DEFAULT_V10_RFF_SIGMA,
        rff_ridge: float = DEFAULT_V10_RFF_RIDGE,
        linear_blend: float = DEFAULT_V10_LINEAR_BLEND,
        model_name: str | None = None,
    ) -> HazardPosteriorV10LinearPredictor:
        from astar.history.episodes.build import build_round_episode
        from astar.teacher.dynamics.hazard_teacher_v5 import HazardTeacherV5Linear

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("v10_linear requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, rid) for rid in selected_round_ids
        ]
        replay_episodes = [ep for ep in replay_episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("v10_linear requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v10_linear"
        teacher = HazardTeacherV5Linear(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            latent_rank=latent_rank,
            rff_dim=1,  # irrelevant for linear
            rff_sigma=1.0,
            rff_ridge_alpha=1.0,
            use_linear_blend=False,
            linear_blend_weight=0.0,
        )
        dataset = _ensure_synthetic_dataset(
            paths,
            cache_family="hazard_posterior_v10_linear",
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
            rff_dim=1,
            rff_sigma=1.0,
            rff_ridge=1.0,
            linear_blend=0.0,
            observation_class_weights=tuple(float(v) for v in observation_class_weights.tolist()),
            training_round_ids=tuple(selected_round_ids),
        )


__all__ = [
    "DEFAULT_V10_K",
    "DEFAULT_V10_LINEAR_BLEND",
    "DEFAULT_V10_MEAN_WEIGHT",
    "DEFAULT_V10_OBSERVATION_WEIGHT",
    "DEFAULT_V10_RANK",
    "DEFAULT_V10_RFF_DIM",
    "DEFAULT_V10_RFF_RIDGE",
    "DEFAULT_V10_RFF_SIGMA",
    "DEFAULT_V10_RIDGE_ALPHA",
    "HazardPosteriorV10LinearPredictor",
    "HazardPosteriorV10Predictor",
    "hazard_posterior_v10_spec_for_model_name",
]
