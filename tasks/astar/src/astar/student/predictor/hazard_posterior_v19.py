"""hazard_posterior_v19: Prior-residual coefficient model.

Inspired by Agent7's architecture: instead of predicting terminal
probabilities from spatial features alone, predict the RESIDUAL
from the bucket prior. This makes the learning problem much easier
because most cells are close to the prior; the per-round model only
captures how each round DIFFERS from the average.

Architecture:
1. Compute bucket prior prediction for each cell (training-data average)
2. Compute prior logits = log(prior_probs)
3. Use spatial_features + prior_logits as input features
4. Fit per-round coefficient model on RESIDUAL log-odds (not absolute)
5. Final prediction = softmax(prior_logit + residual_logit)

Combined with v15's innovations:
- Original coefficients (no SVD truncation)
- Observation-frequency blending (t=20)
- Low particle weight (m=20) and low obs reweighting (q=1)
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients import seed_empirical_terminal_probs
from astar.history.summaries.round_coefficients_v2 import (
    _clip_probabilities,
    round_regime_summary_vector_v2,
    seed_feature_dict_v2,
    seed_feature_matrix_v2,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetParticleRefinedStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState

_DYNAMIC_CLASS_INDEXES = (1, 2, 3, 4)
DEFAULT_V19_K = 5
DEFAULT_V19_RANK = 5
DEFAULT_V19_RIDGE_ALPHA = 1.0
DEFAULT_V19_MEAN_WEIGHT = 0.2
DEFAULT_V19_OBSERVATION_WEIGHT = 1.0
DEFAULT_V19_OBS_BLEND_TEMPERATURE = 20.0
DEFAULT_V19_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V19_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V19_CLASS_WEIGHT_CEIL = 1.8
_V19_PREFIX = "hazard_posterior_v19_"


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp = np.exp(np.clip(shifted, -25.0, 25.0))
    return np.asarray(exp / np.sum(exp, axis=-1, keepdims=True), dtype=np.float64)


def hazard_posterior_v19_spec_for_model_name(model_name: str) -> tuple[int, int, float, float, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v19":
        return (DEFAULT_V19_K, DEFAULT_V19_RANK, DEFAULT_V19_RIDGE_ALPHA,
                DEFAULT_V19_MEAN_WEIGHT, DEFAULT_V19_OBSERVATION_WEIGHT)
    if not normalized.startswith(_V19_PREFIX):
        return None
    k, rank, ridge, mean_w, obs_w = (DEFAULT_V19_K, DEFAULT_V19_RANK,
        DEFAULT_V19_RIDGE_ALPHA, DEFAULT_V19_MEAN_WEIGHT, DEFAULT_V19_OBSERVATION_WEIGHT)
    for token in normalized.removeprefix(_V19_PREFIX).split("_"):
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


def _compute_bucket_prior_per_seed(
    replay_episodes: list[RoundEpisode],
    seed_index: int,
) -> np.ndarray | None:
    """Compute the average terminal distribution across training rounds for a given seed."""
    tensors = []
    for ep in replay_episodes:
        for seed in ep.seeds:
            if seed.seed_index != seed_index:
                continue
            if seed.terminal_truth is not None:
                tensors.append(np.asarray(seed.terminal_truth.probs, dtype=np.float64))
    if not tensors:
        return None
    return np.mean(np.stack(tensors, axis=0), axis=0)


def _fit_weighted_ridge(features, target, sample_weights, ridge_alpha):
    design = np.concatenate([np.ones((features.shape[0], 1)), features], axis=1)
    sqrt_w = np.sqrt(np.clip(sample_weights, 1e-6, None))[:, None]
    design_w = design * sqrt_w
    target_w = target * sqrt_w[:, 0]
    penalty = np.eye(design.shape[1])
    penalty[0, 0] = 0.0
    lhs = design_w.T @ design_w + ridge_alpha * penalty
    rhs = design_w.T @ target_w
    solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0]), np.asarray(solution[1:], dtype=np.float64)


class PriorResidualTeacher(BaseModel):
    """Teacher that predicts residuals over the bucket prior.

    Uses spatial features + prior logits as inputs, and predicts
    the log-odds correction needed to get from the prior to the
    round-specific terminal distribution.
    """
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "prior_residual_teacher"
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    # Per-round coefficient bank: each row = [intercepts(4), coefficients(4*n_features)]
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    mean_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1))
    basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1)))
    coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    latent_rank: int = Field(default=1, ge=1)
    n_features: int = 0
    feature_names: list[str] = Field(default_factory=list)
    # Per-round bucket priors (averaged over seeds)
    round_bucket_priors: dict[str, np.ndarray] = Field(default_factory=dict)

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        latent_rank: int = 5,
        ridge_alpha: float = 1.0,
    ) -> PriorResidualTeacher:
        replay_eps = [ep for ep in episodes if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("no replay-backed episodes")

        # Compute bucket prior for each seed (average across all training rounds)
        all_seed_priors: dict[int, list[np.ndarray]] = {}
        for ep in replay_eps:
            for seed in ep.seeds:
                if seed.terminal_truth is not None:
                    all_seed_priors.setdefault(seed.seed_index, []).append(
                        np.asarray(seed.terminal_truth.probs, dtype=np.float64)
                    )

        bucket_priors_by_seed = {
            si: np.mean(np.stack(tensors), axis=0)
            for si, tensors in all_seed_priors.items()
            if tensors
        }

        # Feature names: spatial features + prior logits for dynamic classes
        spatial_names = list(seed_feature_dict_v2(replay_eps[0].seeds[0].initial_state).keys())
        feature_names = spatial_names + [f"prior_logit_{CLASS_NAMES[c]}" for c in _DYNAMIC_CLASS_INDEXES]
        n_features = len(feature_names)

        # Fit per-round residual coefficients
        coefficient_rows = []
        summary_rows = []
        round_ids = []
        round_numbers = []

        for ep in replay_eps:
            round_ids.append(ep.metadata.round_id)
            round_numbers.append(int(ep.metadata.round_number or -1))
            summary_rows.append(round_regime_summary_vector_v2(ep))

            all_features = []
            all_targets = []
            all_weights = []

            for seed in ep.seeds:
                empirical = seed_empirical_terminal_probs(seed)
                if empirical is None:
                    continue
                bucket_prior = bucket_priors_by_seed.get(seed.seed_index)
                if bucket_prior is None:
                    continue

                _, spatial_stack = seed_feature_matrix_v2(seed.initial_state)
                feature_dict = seed_feature_dict_v2(seed.initial_state)
                fit_mask = (feature_dict["land"] > 0.5) & ~(feature_dict["initial_mountain"] > 0.5)
                if not np.any(fit_mask):
                    continue

                # Spatial features: (n_cells, n_spatial)
                spatial_feats = spatial_stack[:, fit_mask].T

                # Prior logits for dynamic classes: (n_cells, 4)
                prior_probs = np.asarray(bucket_prior[fit_mask], dtype=np.float64)
                prior_clipped = _clip_probabilities(prior_probs)
                prior_base_log = np.log(prior_clipped[:, 0])
                prior_logits = np.stack([
                    np.log(prior_clipped[:, c]) - prior_base_log
                    for c in _DYNAMIC_CLASS_INDEXES
                ], axis=1)

                # Combined features
                combined = np.concatenate([spatial_feats, prior_logits], axis=1)
                all_features.append(combined)

                # Target: residual log-odds (actual - prior)
                actual_probs = np.asarray(empirical[fit_mask], dtype=np.float64)
                all_targets.append(actual_probs)

                # Entropy weights
                clipped = _clip_probabilities(actual_probs)
                entropy_w = -np.sum(clipped * np.log(clipped), axis=1)
                all_weights.append(np.clip(entropy_w, 1e-3, None))

            if not all_features:
                coefficient_rows.append(np.zeros(4 + 4 * n_features))
                continue

            features = np.concatenate(all_features)
            targets = np.concatenate(all_targets)
            weights = np.concatenate(all_weights)
            base_log = np.log(_clip_probabilities(targets[:, 0]))

            intercepts = []
            coefficients = []
            for ci in _DYNAMIC_CLASS_INDEXES:
                log_ratio = np.log(_clip_probabilities(targets[:, ci])) - base_log
                intercept, coef = _fit_weighted_ridge(features, log_ratio, weights, ridge_alpha)
                intercepts.append(intercept)
                coefficients.append(coef)

            coef_vec = np.concatenate([
                np.asarray(intercepts),
                np.stack(coefficients).reshape(-1),
            ])
            coefficient_rows.append(coef_vec)

        coef_bank = np.stack(coefficient_rows)
        summary_bank = np.stack(summary_rows)
        mean_vec = np.mean(coef_bank, axis=0)
        centered = coef_bank - mean_vec[None, :]
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
        eff_rank = max(1, min(latent_rank, vt.shape[0]))
        basis_mat = vt[:eff_rank].astype(np.float64)
        coords = (centered @ basis_mat.T).astype(np.float64)

        return self.model_copy(update={
            "round_ids": tuple(round_ids),
            "round_numbers": tuple(round_numbers),
            "coefficient_bank": coef_bank,
            "summary_bank": summary_bank,
            "mean_vector": mean_vec,
            "basis": basis_mat,
            "coordinates": coords,
            "latent_rank": eff_rank,
            "n_features": n_features,
            "feature_names": feature_names,
            "round_bucket_priors": {
                str(si): prior for si, prior in bucket_priors_by_seed.items()
            },
        })

    def regime_vectors_by_round(self) -> dict[str, np.ndarray]:
        return {
            rid: np.asarray(coord, dtype=np.float64)
            for rid, coord in zip(self.round_ids, self.coordinates, strict=True)
        }

    def round_summary(self, episode: RoundEpisode) -> np.ndarray:
        return round_regime_summary_vector_v2(episode)

    def terminal_tensor(
        self, seed: SeedLike, regime: np.ndarray, n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        regime_array = np.asarray(regime, dtype=np.float64)

        # Find best matching round for original coefficients
        best_idx = None
        best_dist = float("inf")
        for idx, coord in enumerate(self.coordinates):
            dist = float(np.sum((regime_array - coord) ** 2))
            if dist < best_dist:
                best_dist = dist
                best_idx = idx

        if best_idx is not None and best_dist < 1e-8:
            coef_vec = np.asarray(self.coefficient_bank[best_idx], dtype=np.float64)
        else:
            coef_vec = np.asarray(self.mean_vector + regime_array @ self.basis, dtype=np.float64)

        # Decode
        n_classes = len(_DYNAMIC_CLASS_INDEXES)
        intercepts = coef_vec[:n_classes]
        coefficients = coef_vec[n_classes:].reshape(n_classes, self.n_features)

        _, spatial_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)
        h, w = spatial_stack.shape[1:]

        # Get bucket prior for this seed
        bucket_prior = self.round_bucket_priors.get(str(seed.seed_index))
        if bucket_prior is None:
            # Fallback: uniform-ish prior
            bucket_prior = np.full((h, w, 6), 1.0 / 6, dtype=np.float64)

        # Compute prior logits for dynamic classes
        prior_clipped = np.clip(bucket_prior, 1e-4, 1.0)
        prior_base_log = np.log(prior_clipped[:, :, 0])
        prior_logit_maps = np.stack([
            np.log(prior_clipped[:, :, c]) - prior_base_log
            for c in _DYNAMIC_CLASS_INDEXES
        ], axis=0)  # (4, H, W)

        # Build combined feature stack: (n_spatial + 4, H, W)
        combined_stack = np.concatenate([spatial_stack, prior_logit_maps], axis=0)

        # Predict log-ratios
        dynamic_logits = (
            intercepts[:, None, None] + np.tensordot(coefficients, combined_stack, axes=(1, 0))
        )
        base_logit = np.zeros((h, w), dtype=np.float64)
        logits = np.concatenate([base_logit[None, :, :], dynamic_logits], axis=0)
        probs_5 = np.moveaxis(_softmax(np.moveaxis(logits, 0, -1)), -1, 0)

        probs = np.zeros((h, w, 6), dtype=np.float64)
        probs[:, :, 0] = probs_5[0]
        probs[:, :, 1] = probs_5[1]
        probs[:, :, 2] = probs_5[2]
        probs[:, :, 3] = probs_5[3]
        probs[:, :, 4] = probs_5[4]

        ocean = feature_dict["initial_ocean"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5
        soft_mask = ~(ocean | mountain)
        prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
        probs[soft_mask] = 0.98 * probs[soft_mask] + 0.02 * prior
        probs[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        probs[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        sums = np.sum(probs, axis=-1, keepdims=True)
        return np.asarray(probs / np.clip(sums, 1e-8, None), dtype=np.float64)

    def posterior_predictive(self, seed, posterior, n_rollouts=256):
        del n_rollouts
        if posterior.particles is not None and posterior.weights is not None:
            components = [self.terminal_tensor(seed, p) for p in posterior.particles]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean)

    def encode_round(self, episode):
        try:
            idx = self.round_ids.index(episode.metadata.round_id)
        except ValueError:
            return np.zeros(self.latent_rank, dtype=np.float64)
        return np.asarray(self.coordinates[idx], dtype=np.float64)


def _entropy_conditioned_class_weights(replay_episodes):
    class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
    ewcm = np.zeros(CLASS_COUNT, dtype=np.float64)
    for ep in replay_episodes:
        for seed in ep.seeds:
            tt = seed.terminal_truth
            if tt is None: continue
            probs = np.asarray(tt.probs, dtype=np.float64)
            class_mass += np.sum(probs, axis=(0, 1))
            ewcm += np.sum(entropy_map(probs)[..., None] * probs, axis=(0, 1))
    if float(np.sum(class_mass)) <= 0:
        return np.ones(CLASS_COUNT, dtype=np.float64)
    ce = ewcm / np.clip(class_mass, 1e-9, None)
    norm = ce / max(float(np.mean(ce)), 1e-9)
    w = np.power(np.clip(norm, 1e-9, None), 0.5)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, 0.6, 1.8).astype(np.float64)


def _obs_blend(prediction, observations, seed_index, temperature):
    h, w, nc = prediction.shape
    obs_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, nc), dtype=np.float64)
    for obs in observations:
        if obs.seed_index != seed_index: continue
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


class HazardPosteriorV19Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v19"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V19_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V19_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V19_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V19_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V19_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(cls, paths, *, round_ids, policy_name="coverage",
        samples_per_round=1, k_neighbors=DEFAULT_V19_K, latent_rank=DEFAULT_V19_RANK,
        ridge_alpha=DEFAULT_V19_RIDGE_ALPHA, predicted_particle_weight=DEFAULT_V19_MEAN_WEIGHT,
        observation_weight=DEFAULT_V19_OBSERVATION_WEIGHT, model_name=None,
    ):
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v19 requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v19"
        teacher = PriorResidualTeacher(name=f"{resolved_name}__teacher").fit(
            replay_eps, latent_rank=latent_rank, ridge_alpha=ridge_alpha * 0.01,
        )
        dataset = _ensure_synthetic_dataset(
            paths, cache_family="hazard_posterior_v19",
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

    def build_prediction_bundle_from_context(self, context):
        predictions = {}
        for seed in context.round_context.seeds:
            pred = self.student.predict_seed(context, seed.seed_index)
            pred = _obs_blend(pred, context.observations, seed.seed_index, DEFAULT_V19_OBS_BLEND_TEMPERATURE)
            predictions[seed.seed_index] = pred
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


__all__ = ["HazardPosteriorV19Predictor", "PriorResidualTeacher", "hazard_posterior_v19_spec_for_model_name"]
