"""hazard_posterior_v15: Original-coefficient particles + v11 obs blend.

Key innovation: When computing terminal tensors for training-round particles,
use the ORIGINAL per-round coefficients instead of the SVD-reconstructed ones.
The rank-3 SVD reconstruction loses ~13% of coefficient variance. By preserving
the original coefficients for known particles, we get more accurate predictions
for the rounds we've actually seen.

Combined with v11's observation blending (temperature=20) which has been
independently validated at +0.96 over v8.

Model name: hazard_posterior_v15_k{K}_r{R}_l{L}_m{M}_q{Q}
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients_v2 import seed_feature_dict_v2, seed_feature_matrix_v2
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetParticleRefinedStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_V15_K = 5
DEFAULT_V15_RANK = 3
DEFAULT_V15_RIDGE_ALPHA = 32.0
DEFAULT_V15_MEAN_WEIGHT = 0.7
DEFAULT_V15_OBSERVATION_WEIGHT = 8.0
DEFAULT_V15_OBS_BLEND_TEMPERATURE = 20.0
DEFAULT_V15_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V15_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V15_CLASS_WEIGHT_CEIL = 1.8
_V15_PREFIX = "hazard_posterior_v15_"


def hazard_posterior_v15_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v15":
        return (
            DEFAULT_V15_K,
            DEFAULT_V15_RANK,
            DEFAULT_V15_RIDGE_ALPHA,
            DEFAULT_V15_MEAN_WEIGHT,
            DEFAULT_V15_OBSERVATION_WEIGHT,
        )
    if not normalized.startswith(_V15_PREFIX):
        return None

    k = DEFAULT_V15_K
    rank = DEFAULT_V15_RANK
    ridge = DEFAULT_V15_RIDGE_ALPHA
    mean_w = DEFAULT_V15_MEAN_WEIGHT
    obs_w = DEFAULT_V15_OBSERVATION_WEIGHT

    for token in normalized.removeprefix(_V15_PREFIX).split("_"):
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
    for ep in replay_episodes:
        for seed in ep.seeds:
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
    w = np.power(np.clip(norm, 1e-9, None), DEFAULT_V15_CLASS_WEIGHT_POWER)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, DEFAULT_V15_CLASS_WEIGHT_FLOOR, DEFAULT_V15_CLASS_WEIGHT_CEIL).astype(np.float64)


def _apply_obs_blending(
    prediction: np.ndarray,
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    seed_index: int,
    temperature: float,
) -> np.ndarray:
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
    observed = obs_count > 0
    if np.any(observed):
        floor = 0.005 / nc
        empirical[observed] = np.clip(empirical[observed], floor, 1.0)
        empirical = empirical / np.maximum(np.sum(empirical, axis=-1, keepdims=True), 1e-8)
    blend_w = total_obs / (total_obs + temperature)
    refined = blend_w * empirical + (1.0 - blend_w) * prediction
    return np.asarray(refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8), dtype=np.float64)


class OriginalCoefficientTeacher(HazardTeacherV2):
    """HazardTeacherV2 variant that uses original coefficients for known rounds.

    Also supports configurable prior blend (default: use parent's 0.98/0.02).
    Set prior_blend=0.0 to disable prior blending entirely (Agent7 insight).
    """

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "original_coefficient_teacher"
    prior_blend_weight: float = Field(default=0.02)
    floor: float = Field(default=0.0003)

    def _decode_terminal_tensor_custom(self, seed: object, coefficient_vector: np.ndarray) -> np.ndarray:
        """Decode with configurable prior blend and floor."""
        from astar.history.summaries.round_coefficients_v2 import seed_feature_dict_v2, seed_feature_matrix_v2

        intercepts, coefficients = self._split_coefficients(coefficient_vector)
        _, feature_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)

        dynamic_logits = (
            intercepts[:, None, None] + np.tensordot(coefficients, feature_stack, axes=(1, 0))
        )
        base_logit = np.zeros(feature_stack.shape[1:], dtype=np.float64)
        logits = np.concatenate([base_logit[None, :, :], dynamic_logits], axis=0)

        def _softmax_local(x):
            shifted = x - np.max(x, axis=-1, keepdims=True)
            exp = np.exp(np.clip(shifted, -25.0, 25.0))
            return exp / np.sum(exp, axis=-1, keepdims=True)

        probs_5 = np.moveaxis(_softmax_local(np.moveaxis(logits, 0, -1)), -1, 0)

        height, width = feature_stack.shape[1:]
        probs = np.zeros((height, width, 6), dtype=np.float64)
        probs[:, :, 0] = probs_5[0]
        probs[:, :, 1] = probs_5[1]
        probs[:, :, 2] = probs_5[2]
        probs[:, :, 3] = probs_5[3]
        probs[:, :, 4] = probs_5[4]

        ocean = feature_dict["initial_ocean"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5
        soft_mask = ~(ocean | mountain)

        # Configurable prior blend (Agent7: 0.0 is best)
        if self.prior_blend_weight > 1e-6:
            prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
            alpha = 1.0 - self.prior_blend_weight
            probs[soft_mask] = alpha * probs[soft_mask] + self.prior_blend_weight * prior

        # Apply floor (Agent7: 0.0003 is optimal)
        if self.floor > 0:
            probs[soft_mask] = np.maximum(probs[soft_mask], self.floor)

        probs[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        probs[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        sums = np.sum(probs, axis=-1, keepdims=True)
        return np.asarray(probs / np.clip(sums, 1e-8, None), dtype=np.float64)

    def terminal_tensor(
        self,
        seed: object,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        regime_array = np.asarray(regime, dtype=np.float64)

        # Check if this regime exactly matches a known training round
        best_match_idx = None
        best_distance = float("inf")
        for idx, coord in enumerate(self.coordinates):
            dist = float(np.sum((regime_array - coord) ** 2))
            if dist < best_distance:
                best_distance = dist
                best_match_idx = idx

        # If regime is very close to a known round, use ORIGINAL coefficients
        if best_match_idx is not None and best_distance < 1e-8:
            coefficient_vector = np.asarray(
                self.coefficient_bank[best_match_idx], dtype=np.float64
            )
        else:
            # Use SVD-reconstructed coefficients for novel regime points
            coefficient_vector = self._coefficients_from_regime(regime_array)

        return self._decode_terminal_tensor_custom(seed, coefficient_vector)


class HazardPosteriorV15Predictor(BaseRoundPredictor):
    """Original-coefficient particles + v11 obs blend."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v15"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V15_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V15_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V15_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V15_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V15_OBSERVATION_WEIGHT, gt=0.0)
    obs_blend_temperature: float = Field(default=DEFAULT_V15_OBS_BLEND_TEMPERATURE, gt=0.0)
    observation_class_weighting: str = "entropy_v1"
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
        k_neighbors: int = DEFAULT_V15_K,
        latent_rank: int = DEFAULT_V15_RANK,
        ridge_alpha: float = DEFAULT_V15_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V15_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V15_OBSERVATION_WEIGHT,
        model_name: str | None = None,
    ) -> HazardPosteriorV15Predictor:
        from astar.history.episodes.build import build_round_episode

        selected_ids = sorted(set(round_ids))
        if not selected_ids:
            raise ValueError("v15 requires replay-backed training rounds")
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v15 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v15"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__ridge={int(round(ridge_alpha))}"
            f"__mix={int(round(predicted_particle_weight * 100.0))}"
            f"__obs={int(round(observation_weight))}"
        )

        # Fit the base teacher to get coefficients and manifold
        base_teacher = HazardTeacherV2(name=f"{resolved_name}__base").fit(
            replay_eps, latent_rank=latent_rank,
        )

        # Create the original-coefficient teacher with configurable calibration
        # Agent7 insight: prior_blend=0.0 and floor=0.0003 are optimal
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
            prior_blend_weight=0.02,  # Keep default: Agent7's 0.0 doesn't transfer to our model
            floor=0.0003,  # Low floor from Agent7 is fine (similar to old implicit floor)
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
            observation_class_weighting="entropy_v1",
            observation_class_weights=tuple(float(v) for v in obs_class_w.tolist()),
            training_round_ids=tuple(selected_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            pred = self.student.predict_seed(context, seed.seed_index)
            pred = _apply_obs_blending(
                pred, context.observations, seed.seed_index,
                self.obs_blend_temperature,
            )
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
    "HazardPosteriorV15Predictor",
    "OriginalCoefficientTeacher",
    "hazard_posterior_v15_spec_for_model_name",
]
