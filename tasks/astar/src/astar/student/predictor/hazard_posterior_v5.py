from __future__ import annotations

from collections.abc import Sequence

from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetRefinedStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v3 import HazardTeacherV3

DEFAULT_HAZARD_POSTERIOR_V5_K = 5
DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES = 3
DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK = 2
DEFAULT_HAZARD_POSTERIOR_V5_RIDGE_ALPHA = 16.0
DEFAULT_HAZARD_POSTERIOR_V5_MEAN_WEIGHT = 0.5
_HAZARD_V5_PREFIX = "hazard_posterior_v5_"


def hazard_posterior_v5_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, int, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v5":
        return (
            DEFAULT_HAZARD_POSTERIOR_V5_K,
            DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES,
            DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK,
            DEFAULT_HAZARD_POSTERIOR_V5_RIDGE_ALPHA,
            DEFAULT_HAZARD_POSTERIOR_V5_MEAN_WEIGHT,
        )
    if not normalized.startswith(_HAZARD_V5_PREFIX):
        return None

    k_neighbors = DEFAULT_HAZARD_POSTERIOR_V5_K
    mixture_count = DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES
    residual_rank = DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK
    ridge_alpha = DEFAULT_HAZARD_POSTERIOR_V5_RIDGE_ALPHA
    mean_weight = DEFAULT_HAZARD_POSTERIOR_V5_MEAN_WEIGHT
    for token in normalized.removeprefix(_HAZARD_V5_PREFIX).split("_"):
        if not token:
            continue
        if token.startswith("k") and token[1:].isdigit():
            k_neighbors = int(token[1:])
            continue
        if token.startswith("c") and token[1:].isdigit():
            mixture_count = int(token[1:])
            continue
        if token.startswith("r") and token[1:].isdigit():
            residual_rank = int(token[1:])
            continue
        if token.startswith("l") and token[1:].isdigit():
            ridge_alpha = float(int(token[1:]))
            continue
        if token.startswith("m") and token[1:].isdigit():
            mean_weight = int(token[1:]) / 100.0
            continue
        return None

    if (
        k_neighbors < 1
        or mixture_count < 1
        or residual_rank < 0
        or ridge_alpha <= 0.0
        or not (0.0 <= mean_weight <= 1.0)
    ):
        return None
    return (k_neighbors, mixture_count, residual_rank, ridge_alpha, mean_weight)


class HazardPosteriorV5Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v5"
    student: ObservationSetRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V5_K, ge=1)
    mixture_count: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES, ge=1)
    residual_rank: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK, ge=0)
    ridge_alpha: float = Field(default=DEFAULT_HAZARD_POSTERIOR_V5_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(
        default=DEFAULT_HAZARD_POSTERIOR_V5_MEAN_WEIGHT,
        ge=0.0,
        le=1.0,
    )
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_HAZARD_POSTERIOR_V5_K,
        mixture_count: int = DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES,
        residual_rank: int = DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK,
        ridge_alpha: float = DEFAULT_HAZARD_POSTERIOR_V5_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_HAZARD_POSTERIOR_V5_MEAN_WEIGHT,
        model_name: str | None = None,
    ) -> HazardPosteriorV5Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("hazard_posterior_v5 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, round_id)
            for round_id in selected_round_ids
        ]
        replay_episodes = [episode for episode in replay_episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("hazard_posterior_v5 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v5"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__c={mixture_count}"
            f"__r={residual_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
        )
        teacher = HazardTeacherV3(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            mixture_count=mixture_count,
            residual_rank=residual_rank,
        )
        dataset = _ensure_synthetic_dataset(
            paths,
            cache_family="hazard_posterior_v5",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_round_ids,
            latent_rank=teacher.latent_dimension,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        student = ObservationSetRefinedStudent.fit_from_dataset(
            dataset,
            teacher,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
        )
        return cls(
            name=resolved_name,
            student=student,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            mixture_count=teacher.mixture_count,
            residual_rank=teacher.residual_rank,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
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
    "DEFAULT_HAZARD_POSTERIOR_V5_K",
    "DEFAULT_HAZARD_POSTERIOR_V5_MIXTURES",
    "DEFAULT_HAZARD_POSTERIOR_V5_RESIDUAL_RANK",
    "HazardPosteriorV5Predictor",
    "hazard_posterior_v5_spec_for_model_name",
]
