"""hazard_posterior_v16: v15 without observation blending (pure original coefficients).

v15 achieved 82.88 with observation blending. v16 tests whether removing
the observation blending produces an even better result, since the
original-coefficient predictions are more accurate and the observation
blending adds noise from single stochastic observations.

Also supports higher SVD ranks via model name.

Model name: hazard_posterior_v16_k{K}_r{R}_l{L}_m{M}_q{Q}
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
from astar.student.predictor.hazard_posterior_v15 import OriginalCoefficientTeacher
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_V16_K = 5
DEFAULT_V16_RANK = 3
DEFAULT_V16_RIDGE_ALPHA = 32.0
DEFAULT_V16_MEAN_WEIGHT = 0.7
DEFAULT_V16_OBSERVATION_WEIGHT = 8.0
DEFAULT_V16_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V16_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V16_CLASS_WEIGHT_CEIL = 1.8
_V16_PREFIX = "hazard_posterior_v16_"


def hazard_posterior_v16_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v16":
        return (DEFAULT_V16_K, DEFAULT_V16_RANK, DEFAULT_V16_RIDGE_ALPHA,
                DEFAULT_V16_MEAN_WEIGHT, DEFAULT_V16_OBSERVATION_WEIGHT)
    if not normalized.startswith(_V16_PREFIX):
        return None
    k, rank, ridge, mean_w, obs_w = (DEFAULT_V16_K, DEFAULT_V16_RANK,
        DEFAULT_V16_RIDGE_ALPHA, DEFAULT_V16_MEAN_WEIGHT, DEFAULT_V16_OBSERVATION_WEIGHT)
    for token in normalized.removeprefix(_V16_PREFIX).split("_"):
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


def _entropy_conditioned_class_weights(replay_episodes: Sequence[RoundEpisode]) -> np.ndarray:
    class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    ewcm = np.zeros(CLASS_COUNT, dtype=np.float64)
    for ep in replay_episodes:
        for seed in ep.seeds:
            tt = seed.terminal_truth
            if tt is None:
                continue
            probs = np.asarray(tt.probs, dtype=np.float64)
            class_mass += np.sum(probs, axis=(0, 1))
            ewcm += np.sum(entropy_map(probs)[..., None] * probs, axis=(0, 1))
    if float(np.sum(class_mass)) <= 0.0:
        return np.ones(CLASS_COUNT, dtype=np.float64)
    ce = ewcm / np.clip(class_mass, 1e-9, None)
    norm = ce / max(float(np.mean(ce)), 1e-9)
    w = np.power(np.clip(norm, 1e-9, None), DEFAULT_V16_CLASS_WEIGHT_POWER)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, DEFAULT_V16_CLASS_WEIGHT_FLOOR, DEFAULT_V16_CLASS_WEIGHT_CEIL).astype(np.float64)


class HazardPosteriorV16Predictor(BaseRoundPredictor):
    """Original-coefficient particles, NO observation blending."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v16"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V16_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V16_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V16_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V16_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V16_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls, paths: WorkspacePaths, *, round_ids: Sequence[str],
        policy_name: str = "coverage", samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_V16_K, latent_rank: int = DEFAULT_V16_RANK,
        ridge_alpha: float = DEFAULT_V16_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V16_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V16_OBSERVATION_WEIGHT,
        model_name: str | None = None,
    ) -> HazardPosteriorV16Predictor:
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        if not selected_ids:
            raise ValueError("v16 requires replay-backed training rounds")
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v16 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v16"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
        )
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
        )
        dataset = _ensure_synthetic_dataset(
            paths, cache_family="hazard_posterior_v7",
            policy_name=policy_name, samples_per_round=samples_per_round,
            round_ids=selected_ids, latent_rank=teacher.latent_rank,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        obs_class_w = _entropy_conditioned_class_weights(replay_eps)
        student = ObservationSetParticleRefinedStudent.fit_from_dataset(
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

    def build_prediction_bundle_from_context(self, context: LiveInferenceContext) -> PredictionBundle:
        predictions = {
            seed.seed_index: self.student.predict_seed(context, seed.seed_index)
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name, predictions_by_seed=predictions,
        )

    def build_prediction_bundle(self, round_detail: RoundDetail,
        features: RoundFeatureBundle, evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        rc = build_round_context_from_detail(round_detail)
        ctx = LiveInferenceContext(
            online_episode=round_context_to_online_episode(rc),
            geometry_bundle=features,
            evidence_bundle=(evidence if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())),
        )
        return self.build_prediction_bundle_from_context(ctx)


__all__ = ["HazardPosteriorV16Predictor", "hazard_posterior_v16_spec_for_model_name"]
