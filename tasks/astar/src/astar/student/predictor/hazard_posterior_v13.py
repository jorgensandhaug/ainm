"""hazard_posterior_v13: v8 + proper probability floor at 0.01.

The scoring formula is:
    score = 100 * exp(-3 * weighted_kl)

KL divergence: KL(P||Q) = Σ P_c * log(P_c / Q_c)

When Q_c is near zero but P_c > 0, the KL term explodes:
    P_c * log(P_c / 0.0004) >> P_c * log(P_c / 0.01)

The current v8 teacher uses:
    probs = 0.98 * model + 0.02 * [0.84, 0.05, 0.02, 0.02, 0.05, 0.02]
    → minimum floor ≈ 0.0004 for rare classes

The docs explicitly recommend a floor of 0.01.

v13 applies a proper 0.01 floor after prediction and renormalizes.
This is the single simplest change that could have the largest impact
on the worst rounds, where the model makes confident wrong predictions.

Configurable floor via model name: hazard_posterior_v13_k{K}_r{R}_l{L}_m{M}_q{Q}_f{floor*1000}
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
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_V13_K = 5
DEFAULT_V13_RANK = 3
DEFAULT_V13_RIDGE_ALPHA = 32.0
DEFAULT_V13_MEAN_WEIGHT = 0.7
DEFAULT_V13_OBSERVATION_WEIGHT = 8.0
DEFAULT_V13_PROBABILITY_FLOOR = 0.01
DEFAULT_V13_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V13_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V13_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_V13_CLASS_WEIGHTING = "entropy_v1"
_V13_PREFIX = "hazard_posterior_v13_"


def hazard_posterior_v13_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v13":
        return (
            DEFAULT_V13_K,
            DEFAULT_V13_RANK,
            DEFAULT_V13_RIDGE_ALPHA,
            DEFAULT_V13_MEAN_WEIGHT,
            DEFAULT_V13_OBSERVATION_WEIGHT,
            DEFAULT_V13_PROBABILITY_FLOOR,
        )
    if not normalized.startswith(_V13_PREFIX):
        return None

    k = DEFAULT_V13_K
    rank = DEFAULT_V13_RANK
    ridge = DEFAULT_V13_RIDGE_ALPHA
    mean_w = DEFAULT_V13_MEAN_WEIGHT
    obs_w = DEFAULT_V13_OBSERVATION_WEIGHT
    floor = DEFAULT_V13_PROBABILITY_FLOOR

    for token in normalized.removeprefix(_V13_PREFIX).split("_"):
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
        else:
            return None

    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0 or floor < 0:
        return None
    return (k, rank, ridge, mean_w, obs_w, floor)


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
    weights = np.power(np.clip(normalized, 1e-9, None), DEFAULT_V13_CLASS_WEIGHT_POWER)
    weights = weights / max(float(np.mean(weights)), 1e-9)
    return np.clip(weights, DEFAULT_V13_CLASS_WEIGHT_FLOOR, DEFAULT_V13_CLASS_WEIGHT_CEIL).astype(np.float64)


def _apply_probability_floor(
    prediction: np.ndarray,
    floor: float,
    *,
    max_confidence_skip: float = 0.95,
) -> np.ndarray:
    """Apply a minimum probability floor to UNCERTAIN cells only.

    Only floors cells where max predicted probability < max_confidence_skip.
    Cells that are near-deterministic (ocean, mountain, deep forest) are left
    untouched to avoid diluting correct confident predictions.

    This is critical for KL-based scoring: assigning near-zero probability
    to a class with non-trivial true probability causes enormous KL penalty.
    """
    if floor <= 0:
        return prediction
    result = prediction.copy()
    max_prob = np.max(prediction, axis=-1)
    uncertain_mask = max_prob < max_confidence_skip
    if np.any(uncertain_mask):
        result[uncertain_mask] = np.maximum(result[uncertain_mask], floor)
        sums = np.sum(result[uncertain_mask], axis=-1, keepdims=True)
        result[uncertain_mask] = result[uncertain_mask] / np.maximum(sums, 1e-8)
    return np.asarray(result, dtype=np.float64)


class HazardPosteriorV13Predictor(BaseRoundPredictor):
    """v8 teacher + observation reweighting + proper probability floor."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v13"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V13_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V13_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V13_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V13_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V13_OBSERVATION_WEIGHT, gt=0.0)
    probability_floor: float = Field(default=DEFAULT_V13_PROBABILITY_FLOOR, ge=0.0)
    observation_class_weighting: str = DEFAULT_V13_CLASS_WEIGHTING
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
        k_neighbors: int = DEFAULT_V13_K,
        latent_rank: int = DEFAULT_V13_RANK,
        ridge_alpha: float = DEFAULT_V13_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V13_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V13_OBSERVATION_WEIGHT,
        probability_floor: float = DEFAULT_V13_PROBABILITY_FLOOR,
        model_name: str | None = None,
    ) -> HazardPosteriorV13Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("v13 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, rid) for rid in selected_round_ids
        ]
        replay_episodes = [ep for ep in replay_episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("v13 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v13"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
            f"__floor={int(round(probability_floor * 1000.0))}"
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
            observation_class_weighting=DEFAULT_V13_CLASS_WEIGHTING,
            observation_class_weights=tuple(float(v) for v in observation_class_weights.tolist()),
            training_round_ids=tuple(selected_round_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            base_pred = self.student.predict_seed(context, seed.seed_index)
            # Apply the probability floor — this is the key v13 innovation
            floored = _apply_probability_floor(base_pred, self.probability_floor)
            predictions_by_seed[seed.seed_index] = floored
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
    "DEFAULT_V13_K",
    "DEFAULT_V13_MEAN_WEIGHT",
    "DEFAULT_V13_OBSERVATION_WEIGHT",
    "DEFAULT_V13_PROBABILITY_FLOOR",
    "DEFAULT_V13_RANK",
    "DEFAULT_V13_RIDGE_ALPHA",
    "HazardPosteriorV13Predictor",
    "hazard_posterior_v13_spec_for_model_name",
]
