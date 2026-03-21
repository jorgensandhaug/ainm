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

DEFAULT_HAZARD_POSTERIOR_V8_K = 5
DEFAULT_HAZARD_POSTERIOR_V8_RANK = 3
DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA = 32.0
DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT = 0.7
DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT = 8.0
DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_POWER = 0.5
DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_CEIL = 1.8
DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHTING = "entropy_v1"
_HAZARD_V8_PREFIX = "hazard_posterior_v8_"


def hazard_posterior_v8_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v8":
        return (
            DEFAULT_HAZARD_POSTERIOR_V8_K,
            DEFAULT_HAZARD_POSTERIOR_V8_RANK,
            DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA,
            DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT,
            DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT,
        )
    if not normalized.startswith(_HAZARD_V8_PREFIX):
        return None

    k_neighbors = DEFAULT_HAZARD_POSTERIOR_V8_K
    latent_rank = DEFAULT_HAZARD_POSTERIOR_V8_RANK
    ridge_alpha = DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA
    mean_weight = DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT
    observation_weight = DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT
    for token in normalized.removeprefix(_HAZARD_V8_PREFIX).split("_"):
        if not token:
            continue
        if token.startswith("k") and token[1:].isdigit():
            k_neighbors = int(token[1:])
            continue
        if token.startswith("r") and token[1:].isdigit():
            latent_rank = int(token[1:])
            continue
        if token.startswith("l") and token[1:].isdigit():
            ridge_alpha = float(int(token[1:]))
            continue
        if token.startswith("m") and token[1:].isdigit():
            mean_weight = int(token[1:]) / 100.0
            continue
        if token.startswith("q") and token[1:].isdigit():
            observation_weight = float(int(token[1:]))
            continue
        return None

    if (
        k_neighbors < 1
        or latent_rank < 1
        or ridge_alpha <= 0.0
        or not (0.0 <= mean_weight <= 1.0)
        or observation_weight <= 0.0
    ):
        return None
    return (k_neighbors, latent_rank, ridge_alpha, mean_weight, observation_weight)


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
        DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_POWER,
    )
    weights = weights / max(float(np.mean(weights)), 1e-9)
    return np.clip(
        weights,
        DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_FLOOR,
        DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHT_CEIL,
    ).astype(np.float64)


class HazardPosteriorV8Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v8"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V8_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V8_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(
        default=DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT,
        ge=0.0,
        le=1.0,
    )
    observation_weight: float = Field(default=DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weighting: str = DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHTING
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
        k_neighbors: int = DEFAULT_HAZARD_POSTERIOR_V8_K,
        latent_rank: int = DEFAULT_HAZARD_POSTERIOR_V8_RANK,
        ridge_alpha: float = DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT,
        model_name: str | None = None,
    ) -> HazardPosteriorV8Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("hazard_posterior_v8 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, round_id)
            for round_id in selected_round_ids
        ]
        replay_episodes = [episode for episode in replay_episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("hazard_posterior_v8 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v8"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
            f"__classw={DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHTING}"
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
            observation_class_weights=tuple(float(value) for value in observation_class_weights.tolist()),
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


__all__ = [
    "DEFAULT_HAZARD_POSTERIOR_V8_CLASS_WEIGHTING",
    "DEFAULT_HAZARD_POSTERIOR_V8_K",
    "DEFAULT_HAZARD_POSTERIOR_V8_MEAN_WEIGHT",
    "DEFAULT_HAZARD_POSTERIOR_V8_OBSERVATION_WEIGHT",
    "DEFAULT_HAZARD_POSTERIOR_V8_RANK",
    "DEFAULT_HAZARD_POSTERIOR_V8_RIDGE_ALPHA",
    "HazardPosteriorV8Predictor",
    "hazard_posterior_v8_spec_for_model_name",
]
