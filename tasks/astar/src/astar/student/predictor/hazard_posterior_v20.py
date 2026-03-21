"""hazard_posterior_v20: LightGBM terminal decoder.

Agent3 gained +5 points from switching ridge regression to gradient-boosted
trees (CatBoost). This model replaces the linear coefficient decoder with
LightGBM, which can capture nonlinear feature interactions automatically.

Key differences from v15 (linear):
- Uses LightGBM instead of ridge regression for per-round coefficient fitting
- Trains separate LightGBM models per dynamic class per round
- Uses the same v2 spatial features as v15
- Adds bucket prior logits as features (inspired by Agent7)
- Combines with v15's original-coefficient approach (per-round models)
- Includes observation blending and entropy-conditioned class weighting

The critical advantage: LightGBM handles nonlinearities, feature interactions,
and regularization much better than ridge regression with limited training data.
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
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState

_DYNAMIC_CLASS_INDEXES = (1, 2, 3, 4)
DEFAULT_V20_K = 5
DEFAULT_V20_RANK = 5
DEFAULT_V20_RIDGE_ALPHA = 1.0
DEFAULT_V20_MEAN_WEIGHT = 0.2
DEFAULT_V20_OBSERVATION_WEIGHT = 1.0
DEFAULT_V20_OBS_BLEND_TEMPERATURE = 20.0
DEFAULT_V20_N_ESTIMATORS = 100
DEFAULT_V20_MAX_DEPTH = 4
DEFAULT_V20_LEARNING_RATE = 0.1
DEFAULT_V20_MIN_CHILD_SAMPLES = 20
_V20_PREFIX = "hazard_posterior_v20_"


def _softmax(logits):
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp = np.exp(np.clip(shifted, -25.0, 25.0))
    return exp / np.sum(exp, axis=-1, keepdims=True)


def hazard_posterior_v20_spec_for_model_name(model_name):
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v20":
        return (DEFAULT_V20_K, DEFAULT_V20_RANK, DEFAULT_V20_RIDGE_ALPHA,
                DEFAULT_V20_MEAN_WEIGHT, DEFAULT_V20_OBSERVATION_WEIGHT)
    if not normalized.startswith(_V20_PREFIX):
        return None
    k, rank, ridge, mean_w, obs_w = (DEFAULT_V20_K, DEFAULT_V20_RANK,
        DEFAULT_V20_RIDGE_ALPHA, DEFAULT_V20_MEAN_WEIGHT, DEFAULT_V20_OBSERVATION_WEIGHT)
    for token in normalized.removeprefix(_V20_PREFIX).split("_"):
        if not token: continue
        if token.startswith("k") and token[1:].isdigit(): k = int(token[1:])
        elif token.startswith("r") and token[1:].isdigit(): rank = int(token[1:])
        elif token.startswith("l") and token[1:].isdigit(): ridge = float(int(token[1:]))
        elif token.startswith("m") and token[1:].isdigit(): mean_w = int(token[1:]) / 100.0
        elif token.startswith("q") and token[1:].isdigit(): obs_w = float(int(token[1:]))
        else: return None
    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0:
        return None
    return (k, rank, ridge, mean_w, obs_w)


class LightGBMTeacher(BaseModel):
    """Terminal decoder using LightGBM per-round models."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "lightgbm_teacher"
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    # Per-round LightGBM models: dict[round_id -> dict[class_idx -> model]]
    round_models: dict[str, dict[int, object]] = Field(default_factory=dict)
    # For regime manifold (still use linear coefficients for SVD)
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    mean_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1))
    basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1)))
    coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1)))
    latent_rank: int = Field(default=1, ge=1)
    feature_names: list[str] = Field(default_factory=list)
    # Bucket prior per seed
    bucket_priors: dict[int, np.ndarray] = Field(default_factory=dict)

    def fit(self, episodes, *, latent_rank=5, ridge_alpha=0.01,
            n_estimators=100, max_depth=4, learning_rate=0.1, min_child_samples=20):
        import lightgbm as lgb

        replay_eps = [ep for ep in episodes if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("no replay-backed episodes")

        # Compute bucket priors
        seed_priors: dict[int, list] = {}
        for ep in replay_eps:
            for seed in ep.seeds:
                if seed.terminal_truth is not None:
                    seed_priors.setdefault(seed.seed_index, []).append(
                        np.asarray(seed.terminal_truth.probs, dtype=np.float64))
        bucket_priors = {si: np.mean(np.stack(ts), axis=0) for si, ts in seed_priors.items() if ts}

        # Fit per-round LightGBM models
        round_models = {}
        coef_rows = []
        summary_rows = []
        round_ids = []
        round_numbers = []

        # Also fit linear coefficients for the regime manifold
        from astar.history.summaries.round_coefficients_v2 import fit_round_semimechanistic_coefficients_v2

        for ep in replay_eps:
            rid = ep.metadata.round_id
            round_ids.append(rid)
            round_numbers.append(int(ep.metadata.round_number or -1))
            summary_rows.append(round_regime_summary_vector_v2(ep))

            # Linear coefficients for manifold
            try:
                coef_row = fit_round_semimechanistic_coefficients_v2(ep, ridge_alpha=ridge_alpha)
                coef_rows.append(coef_row.combined_vector())
            except Exception:
                coef_rows.append(np.zeros(1))

            # Collect training data for this round
            all_features = []
            all_targets = []
            all_weights = []

            for seed in ep.seeds:
                empirical = seed_empirical_terminal_probs(seed)
                if empirical is None: continue
                bp = bucket_priors.get(seed.seed_index)
                if bp is None: continue

                _, spatial_stack = seed_feature_matrix_v2(seed.initial_state)
                feature_dict = seed_feature_dict_v2(seed.initial_state)
                fit_mask = (feature_dict["land"] > 0.5) & ~(feature_dict["initial_mountain"] > 0.5)
                if not np.any(fit_mask): continue

                spatial_feats = spatial_stack[:, fit_mask].T
                # Add prior logits as features
                prior_clipped = _clip_probabilities(bp[fit_mask])
                prior_logits = np.log(prior_clipped + 1e-6)
                combined = np.concatenate([spatial_feats, prior_logits], axis=1)

                all_features.append(combined)
                all_targets.append(np.asarray(empirical[fit_mask], dtype=np.float64))
                clipped = _clip_probabilities(np.asarray(empirical[fit_mask], dtype=np.float64))
                entropy_w = -np.sum(clipped * np.log(clipped), axis=1)
                all_weights.append(np.clip(entropy_w, 1e-3, None))

            if not all_features:
                round_models[rid] = {}
                continue

            X = np.concatenate(all_features)
            Y = np.concatenate(all_targets)
            W = np.concatenate(all_weights)

            # Train one LightGBM model per dynamic class
            models = {}
            for ci in _DYNAMIC_CLASS_INDEXES:
                model = lgb.LGBMRegressor(
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    learning_rate=learning_rate,
                    min_child_samples=min_child_samples,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    reg_alpha=0.1,
                    reg_lambda=1.0,
                    verbose=-1,
                    n_jobs=1,
                )
                # Target: log-odds of this class vs class 0
                base_log = np.log(_clip_probabilities(Y[:, 0]))
                target = np.log(_clip_probabilities(Y[:, ci])) - base_log
                model.fit(X, target, sample_weight=W)
                models[ci] = model
            round_models[rid] = models

        # Build manifold from linear coefficients
        coef_bank = np.stack(coef_rows)
        summary_bank = np.stack(summary_rows)
        mean_vec = np.mean(coef_bank, axis=0)
        centered = coef_bank - mean_vec[None, :]
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
        eff_rank = max(1, min(latent_rank, vt.shape[0]))
        basis_mat = vt[:eff_rank].astype(np.float64)
        coords = (centered @ basis_mat.T).astype(np.float64)

        feature_names = list(seed_feature_dict_v2(replay_eps[0].seeds[0].initial_state).keys())
        feature_names += [f"prior_logit_{i}" for i in range(6)]

        return self.model_copy(update={
            "round_ids": tuple(round_ids),
            "round_numbers": tuple(round_numbers),
            "round_models": round_models,
            "coefficient_bank": coef_bank,
            "summary_bank": summary_bank,
            "mean_vector": mean_vec,
            "basis": basis_mat,
            "coordinates": coords,
            "latent_rank": eff_rank,
            "feature_names": feature_names,
            "bucket_priors": {int(k): v for k, v in bucket_priors.items()},
        })

    def regime_vectors_by_round(self):
        return {rid: np.asarray(c, dtype=np.float64)
                for rid, c in zip(self.round_ids, self.coordinates, strict=True)}

    def round_summary(self, episode):
        return round_regime_summary_vector_v2(episode)

    def terminal_tensor(self, seed, regime, n_rollouts=256):
        del n_rollouts
        regime_array = np.asarray(regime, dtype=np.float64)

        # Find best matching round
        best_idx = None
        best_dist = float("inf")
        for idx, coord in enumerate(self.coordinates):
            dist = float(np.sum((regime_array - coord) ** 2))
            if dist < best_dist:
                best_dist = dist
                best_idx = idx

        if best_idx is None:
            # Fallback to uniform
            h, w = 40, 40
            return np.full((h, w, 6), 1.0/6, dtype=np.float64)

        rid = self.round_ids[best_idx]
        models = self.round_models.get(rid, {})

        _, spatial_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)
        h, w = spatial_stack.shape[1:]

        # Get bucket prior
        bp = self.bucket_priors.get(seed.seed_index,
              np.full((h, w, 6), 1.0/6, dtype=np.float64))

        # Build features for all cells
        flat_spatial = spatial_stack.reshape(spatial_stack.shape[0], -1).T  # (H*W, n_spatial)
        prior_clipped = _clip_probabilities(bp.reshape(-1, 6))
        prior_logits = np.log(prior_clipped + 1e-6)
        X_all = np.concatenate([flat_spatial, prior_logits], axis=1)

        # Predict log-ratios using LightGBM
        base_logit = np.zeros(h * w, dtype=np.float64)
        dynamic_logits = []
        for ci in _DYNAMIC_CLASS_INDEXES:
            if ci in models:
                pred = models[ci].predict(X_all)
                dynamic_logits.append(pred)
            else:
                dynamic_logits.append(np.zeros(h * w, dtype=np.float64))

        logits = np.stack([base_logit] + dynamic_logits, axis=1)  # (H*W, 5)
        probs_5 = _softmax(logits)  # (H*W, 5)
        probs_5 = probs_5.reshape(h, w, 5)

        probs = np.zeros((h, w, 6), dtype=np.float64)
        probs[:, :, 0] = probs_5[:, :, 0]
        probs[:, :, 1] = probs_5[:, :, 1]
        probs[:, :, 2] = probs_5[:, :, 2]
        probs[:, :, 3] = probs_5[:, :, 3]
        probs[:, :, 4] = probs_5[:, :, 4]

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


class HazardPosteriorV20Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v20"
    student: ObservationSetParticleRefinedStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V20_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V20_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V20_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V20_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V20_OBSERVATION_WEIGHT, gt=0.0)
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(cls, paths, *, round_ids, policy_name="coverage",
        samples_per_round=1, k_neighbors=DEFAULT_V20_K, latent_rank=DEFAULT_V20_RANK,
        ridge_alpha=DEFAULT_V20_RIDGE_ALPHA, predicted_particle_weight=DEFAULT_V20_MEAN_WEIGHT,
        observation_weight=DEFAULT_V20_OBSERVATION_WEIGHT, model_name=None,
    ):
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v20 requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v20"
        teacher = LightGBMTeacher(name=f"{resolved_name}__teacher").fit(
            replay_eps, latent_rank=latent_rank,
        )
        dataset = _ensure_synthetic_dataset(
            paths, cache_family="hazard_posterior_v20",
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
            pred = _obs_blend(pred, context.observations, seed.seed_index, DEFAULT_V20_OBS_BLEND_TEMPERATURE)
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


__all__ = ["HazardPosteriorV20Predictor", "LightGBMTeacher", "hazard_posterior_v20_spec_for_model_name"]
