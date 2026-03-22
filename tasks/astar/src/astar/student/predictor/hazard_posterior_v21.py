"""hazard_posterior_v21: Ensemble of v15 (linear) + v20 (LightGBM).

v15 excels on well-represented rounds (91.27 on best round).
v20 excels on hard/outlier rounds (66.49 vs 64.71 on hardest round).

The ensemble blends their predictions to get the best of both:
- Geometric mean in probability space (equivalent to log-linear mixing)
- Configurable blend weight alpha: final = v15^alpha * v20^(1-alpha)
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
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v15 import HazardPosteriorV15Predictor
from astar.student.predictor.hazard_posterior_v20 import HazardPosteriorV20Predictor
from astar.student.predictor.round import BaseRoundPredictor

DEFAULT_V21_ALPHA = 0.5  # 0.5 = equal weight, >0.5 = more v15
_V21_PREFIX = "hazard_posterior_v21_"


def hazard_posterior_v21_spec_for_model_name(model_name):
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v21":
        return (DEFAULT_V21_ALPHA,)
    if not normalized.startswith(_V21_PREFIX):
        return None
    alpha = DEFAULT_V21_ALPHA
    for token in normalized.removeprefix(_V21_PREFIX).split("_"):
        if not token: continue
        if token.startswith("a") and token[1:].isdigit():
            alpha = int(token[1:]) / 100.0
        else: return None
    if not (0 <= alpha <= 1): return None
    return (alpha,)


def _obs_blend(prediction, observations, seed_index, temperature=20.0):
    h, w, nc = prediction.shape
    obs_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, nc), dtype=np.float64)
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


class HazardPosteriorV21Predictor(BaseRoundPredictor):
    """Ensemble of v15 (linear, original coeff) + v20 (LightGBM)."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v21"
    v15_predictor: HazardPosteriorV15Predictor
    v20_predictor: HazardPosteriorV20Predictor
    alpha: float = Field(default=DEFAULT_V21_ALPHA, ge=0.0, le=1.0)
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(cls, paths, *, round_ids, policy_name="coverage",
        samples_per_round=1, alpha=DEFAULT_V21_ALPHA, model_name=None,
    ):
        selected_ids = sorted(set(round_ids))
        resolved_name = model_name or f"hazard_posterior_v21__alpha={int(alpha*100)}"

        v15 = HazardPosteriorV15Predictor.fit_from_workspace(
            paths, round_ids=selected_ids, policy_name=policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=5, latent_rank=5, ridge_alpha=1.0,
            predicted_particle_weight=0.2, observation_weight=1.0,
            model_name=f"{resolved_name}__v15",
        )
        v20 = HazardPosteriorV20Predictor.fit_from_workspace(
            paths, round_ids=selected_ids, policy_name=policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=5, latent_rank=5, ridge_alpha=1.0,
            predicted_particle_weight=0.2, observation_weight=1.0,
            model_name=f"{resolved_name}__v20",
        )
        return cls(
            name=resolved_name, v15_predictor=v15, v20_predictor=v20,
            alpha=alpha, training_round_ids=tuple(selected_ids),
        )

    def build_prediction_bundle_from_context(self, context):
        bundle_v15 = self.v15_predictor.build_prediction_bundle_from_context(context)
        bundle_v20 = self.v20_predictor.build_prediction_bundle_from_context(context)

        predictions = {}
        for seed in context.round_context.seeds:
            si = seed.seed_index
            p15 = np.clip(bundle_v15.predictions_by_seed[si], 1e-8, 1.0)
            p20 = np.clip(bundle_v20.predictions_by_seed[si], 1e-8, 1.0)

            # Geometric mean blend: p = p15^alpha * p20^(1-alpha)
            log_blend = self.alpha * np.log(p15) + (1.0 - self.alpha) * np.log(p20)
            blended = np.exp(log_blend)
            sums = np.sum(blended, axis=-1, keepdims=True)
            blended = blended / np.maximum(sums, 1e-8)

            # Observation blending
            blended = _obs_blend(blended, context.observations, si)
            predictions[si] = blended

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


__all__ = ["HazardPosteriorV21Predictor", "hazard_posterior_v21_spec_for_model_name"]
