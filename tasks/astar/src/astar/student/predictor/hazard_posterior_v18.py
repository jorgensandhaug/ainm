"""hazard_posterior_v18: Pure observation-likelihood matching (no student).

Radically different approach: completely bypasses the student posterior
inference (ridge regression, kNN particles). Instead:

1. For each training round, uses original coefficients to compute
   the terminal tensor for the test seed
2. For each observation, computes the log-likelihood under each
   training round's terminal tensor
3. Weights training rounds by their total observation log-likelihood
4. Produces prediction as weighted average of training-round tensors

This eliminates ALL student complexity (ridge regression, kNN,
transcript summaries) and relies purely on the teacher + observations.

The hypothesis: the student's regime prediction adds noise when the
observations themselves are sufficient to discriminate between rounds.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients_v2 import seed_feature_dict_v2
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_V18_RANK = 5
DEFAULT_V18_LIKELIHOOD_TEMPERATURE = 1.0
DEFAULT_V18_OBS_BLEND_TEMPERATURE = 20.0
_V18_PREFIX = "hazard_posterior_v18_"


def hazard_posterior_v18_spec_for_model_name(model_name: str) -> tuple[int, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v18":
        return (DEFAULT_V18_RANK, DEFAULT_V18_LIKELIHOOD_TEMPERATURE)
    if not normalized.startswith(_V18_PREFIX):
        return None
    rank = DEFAULT_V18_RANK
    temp = DEFAULT_V18_LIKELIHOOD_TEMPERATURE
    for token in normalized.removeprefix(_V18_PREFIX).split("_"):
        if not token:
            continue
        if token.startswith("r") and token[1:].isdigit():
            rank = int(token[1:])
        elif token.startswith("t") and token[1:].isdigit():
            temp = int(token[1:]) / 10.0
        else:
            return None
    if rank < 1 or temp <= 0:
        return None
    return (rank, temp)


def _compute_round_log_likelihood(
    terminal_tensor: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    class_floor: float = 0.001,
) -> float:
    """Compute total log-likelihood of observations under a terminal tensor."""
    total_ll = 0.0
    count = 0
    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        h, w = terminal_tensor.shape[:2]
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        patch = terminal_tensor[vp.y:vy_end, vp.x:vx_end, :]
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        region = collapsed[:vy_end - vp.y, :vx_end - vp.x]

        probs = np.take_along_axis(
            patch,
            region[..., None],
            axis=-1,
        ).reshape(-1)
        safe_probs = np.clip(probs, class_floor, 1.0)
        total_ll += float(np.sum(np.log(safe_probs)))
        count += region.size
    return total_ll


def _obs_blend(prediction, observations, seed_index, temperature):
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


class HazardPosteriorV18Predictor(BaseRoundPredictor):
    """Pure likelihood-matching predictor: no student, no regime manifold."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v18"
    teacher: HazardTeacherV2
    policy_name: str = "coverage"
    latent_rank: int = Field(default=DEFAULT_V18_RANK, ge=1)
    likelihood_temperature: float = Field(default=DEFAULT_V18_LIKELIHOOD_TEMPERATURE, gt=0.0)
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls, paths: WorkspacePaths, *, round_ids: Sequence[str],
        policy_name: str = "coverage", latent_rank: int = DEFAULT_V18_RANK,
        likelihood_temperature: float = DEFAULT_V18_LIKELIHOOD_TEMPERATURE,
        model_name: str | None = None, **_kwargs,
    ) -> HazardPosteriorV18Predictor:
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v18 requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v18"
        # We don't actually need SVD for prediction, but the teacher
        # fit produces coefficients we need for decoding
        teacher = HazardTeacherV2(name=f"{resolved_name}__teacher").fit(
            replay_eps, latent_rank=latent_rank)

        return cls(
            name=resolved_name, teacher=teacher,
            policy_name=policy_name.strip().lower(),
            latent_rank=teacher.latent_rank,
            likelihood_temperature=likelihood_temperature,
            training_round_ids=tuple(selected_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        teacher = self.teacher
        n_rounds = len(teacher.round_ids)

        predictions: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_idx = seed.seed_index

            # Compute terminal tensor for each training round using ORIGINAL coefficients
            round_tensors = []
            for round_idx in range(n_rounds):
                coef_vec = np.asarray(teacher.coefficient_bank[round_idx], dtype=np.float64)
                tensor = teacher._decode_terminal_tensor(seed, coef_vec)
                round_tensors.append(tensor)

            # Compute observation log-likelihood under each round's tensor
            log_likelihoods = np.zeros(n_rounds, dtype=np.float64)
            for round_idx, tensor in enumerate(round_tensors):
                log_likelihoods[round_idx] = _compute_round_log_likelihood(
                    tensor, context.observations, seed_idx,
                )

            # Softmax over rounds to get weights
            centered = log_likelihoods - float(np.mean(log_likelihoods))
            scaled = centered / max(self.likelihood_temperature, 1e-6)
            shifted = scaled - float(np.max(scaled))
            weights = np.exp(np.clip(shifted, -60.0, 0.0))
            total_w = float(np.sum(weights))
            if total_w <= 0 or not np.all(np.isfinite(weights)):
                weights = np.ones(n_rounds, dtype=np.float64) / n_rounds
            else:
                weights = weights / total_w

            # Weighted average of round tensors
            stacked = np.stack(round_tensors, axis=0)
            prediction = np.tensordot(weights, stacked, axes=(0, 0))

            # Observation blending
            prediction = _obs_blend(
                prediction, context.observations, seed_idx,
                DEFAULT_V18_OBS_BLEND_TEMPERATURE,
            )

            predictions[seed_idx] = prediction

        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions,
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


__all__ = ["HazardPosteriorV18Predictor", "hazard_posterior_v18_spec_for_model_name"]
