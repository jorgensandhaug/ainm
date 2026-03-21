"""hazard_posterior_v17: Replay-backed empirical cell kNN predictor.

Fundamentally different from the coefficient-based linear model. Instead of
fitting a parametric model P(class|features) = softmax(features @ coefficients),
this predictor:

1. For each training round, stores per-cell empirical terminal probabilities
   computed from ~58 replay runs
2. At test time, identifies matching training rounds via regime posterior
3. For each test cell, finds K most similar cells across matched training
   rounds using feature-space distance
4. Produces prediction as weighted average of those cells' empirical probabilities

This approach:
- Is non-parametric: captures nonlinear patterns automatically
- Uses replay data directly: no information loss from model fitting
- Handles regime variation: weights cells by both feature similarity and round similarity

Combined with:
- v8's entropy-conditioned class-weighted observation reweighting
- v15's original-coefficient teacher for regime identification
- v11's observation-frequency blending (t=20)
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
from astar.history.summaries.round_coefficients_v2 import seed_feature_dict_v2, seed_feature_matrix_v2
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetParticleRefinedStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.hazard_posterior_v2 import _ensure_synthetic_dataset
from astar.student.predictor.hazard_posterior_v15 import OriginalCoefficientTeacher
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_V17_K = 5
DEFAULT_V17_RANK = 5
DEFAULT_V17_RIDGE_ALPHA = 32.0
DEFAULT_V17_MEAN_WEIGHT = 0.7
DEFAULT_V17_OBSERVATION_WEIGHT = 2.0
DEFAULT_V17_OBS_BLEND_TEMPERATURE = 20.0
DEFAULT_V17_CELL_KNN_K = 30
DEFAULT_V17_LINEAR_BLEND = 0.4  # blend between kNN prediction and linear model
DEFAULT_V17_CLASS_WEIGHT_POWER = 0.5
DEFAULT_V17_CLASS_WEIGHT_FLOOR = 0.6
DEFAULT_V17_CLASS_WEIGHT_CEIL = 1.8
_V17_PREFIX = "hazard_posterior_v17_"


def hazard_posterior_v17_spec_for_model_name(
    model_name: str,
) -> tuple[int, int, float, float, float, int, float] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v17":
        return (DEFAULT_V17_K, DEFAULT_V17_RANK, DEFAULT_V17_RIDGE_ALPHA,
                DEFAULT_V17_MEAN_WEIGHT, DEFAULT_V17_OBSERVATION_WEIGHT,
                DEFAULT_V17_CELL_KNN_K, DEFAULT_V17_LINEAR_BLEND)
    if not normalized.startswith(_V17_PREFIX):
        return None
    k, rank, ridge, mean_w, obs_w = (DEFAULT_V17_K, DEFAULT_V17_RANK,
        DEFAULT_V17_RIDGE_ALPHA, DEFAULT_V17_MEAN_WEIGHT, DEFAULT_V17_OBSERVATION_WEIGHT)
    cell_k = DEFAULT_V17_CELL_KNN_K
    lin_blend = DEFAULT_V17_LINEAR_BLEND
    for token in normalized.removeprefix(_V17_PREFIX).split("_"):
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
        elif token.startswith("c") and token[1:].isdigit():
            cell_k = int(token[1:])
        elif token.startswith("b") and token[1:].isdigit():
            lin_blend = int(token[1:]) / 100.0
        else:
            return None
    if k < 1 or rank < 1 or ridge <= 0 or not (0 <= mean_w <= 1) or obs_w <= 0 or cell_k < 1:
        return None
    return (k, rank, ridge, mean_w, obs_w, cell_k, lin_blend)


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
    w = np.power(np.clip(norm, 1e-9, None), DEFAULT_V17_CLASS_WEIGHT_POWER)
    w = w / max(float(np.mean(w)), 1e-9)
    return np.clip(w, DEFAULT_V17_CLASS_WEIGHT_FLOOR, DEFAULT_V17_CLASS_WEIGHT_CEIL).astype(np.float64)


class CellFeatureBank(BaseModel):
    """Stores per-cell features and empirical terminal probabilities across training rounds."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    # Features matrix: (N_total_cells, D_features)
    features: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    # Empirical terminal probabilities: (N_total_cells, 6)
    empirical_probs: np.ndarray = Field(default_factory=lambda: np.zeros((0, 6), dtype=np.float64))
    # Round index for each cell: (N_total_cells,)
    round_indices: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.int64))
    # Feature normalization
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    # Round IDs
    round_ids: tuple[str, ...] = ()

    @classmethod
    def build(cls, replay_episodes: list[RoundEpisode]) -> CellFeatureBank:
        """Build cell feature bank from replay episodes."""
        all_features = []
        all_probs = []
        all_round_idx = []
        round_ids = []

        for round_idx, ep in enumerate(replay_episodes):
            round_ids.append(ep.metadata.round_id)
            for seed in ep.seeds:
                empirical = seed_empirical_terminal_probs(seed)
                if empirical is None:
                    continue
                _, feature_stack = seed_feature_matrix_v2(seed.initial_state)
                feature_dict = seed_feature_dict_v2(seed.initial_state)
                # Only include buildable land cells
                fit_mask = (feature_dict["land"] > 0.5) & ~(feature_dict["initial_mountain"] > 0.5)
                if not np.any(fit_mask):
                    continue
                cell_features = feature_stack[:, fit_mask].T  # (n_cells, n_features)
                cell_probs = np.asarray(empirical[fit_mask], dtype=np.float64)  # (n_cells, 5)
                # Pad to 6 classes
                cell_probs_6 = np.zeros((cell_probs.shape[0], 6), dtype=np.float64)
                cell_probs_6[:, :cell_probs.shape[1]] = cell_probs

                all_features.append(cell_features)
                all_probs.append(cell_probs_6)
                all_round_idx.append(np.full(cell_features.shape[0], round_idx, dtype=np.int64))

        if not all_features:
            raise ValueError("No training data for cell feature bank")

        features = np.concatenate(all_features, axis=0)
        probs = np.concatenate(all_probs, axis=0)
        round_indices = np.concatenate(all_round_idx, axis=0)

        feature_mean = np.mean(features, axis=0)
        feature_scale = np.std(features, axis=0)
        feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)

        return cls(
            features=features,
            empirical_probs=probs,
            round_indices=round_indices,
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            round_ids=tuple(round_ids),
        )

    def predict_cell(
        self,
        cell_features: np.ndarray,
        round_weights: np.ndarray,
        k: int = 30,
    ) -> np.ndarray:
        """Predict terminal probability for a single cell using kNN.

        Args:
            cell_features: (D,) feature vector for the query cell
            round_weights: (N_rounds,) weights for each training round
            k: number of nearest neighbors
        Returns:
            (6,) probability vector
        """
        # Normalize
        norm_query = (cell_features - self.feature_mean) / self.feature_scale
        norm_bank = (self.features - self.feature_mean[None, :]) / self.feature_scale[None, :]

        # Compute distances
        diffs = norm_bank - norm_query[None, :]
        distances = np.sum(diffs * diffs, axis=1)

        # Apply round weights as multiplicative penalty on distance
        # Higher round weight = lower effective distance
        round_w = np.asarray(round_weights, dtype=np.float64)
        round_w = round_w / np.sum(round_w)
        cell_round_weights = round_w[self.round_indices]
        # Effective distance = feature_distance / round_weight
        effective_dist = distances / np.maximum(cell_round_weights, 1e-8)

        # Find K nearest neighbors
        if k >= len(effective_dist):
            top_k_idx = np.arange(len(effective_dist))
        else:
            top_k_idx = np.argpartition(effective_dist, k)[:k]

        top_k_dist = effective_dist[top_k_idx]
        top_k_probs = self.empirical_probs[top_k_idx]

        # Kernel weighting: exp(-dist / bandwidth)
        bandwidth = np.median(top_k_dist) + 1e-6
        weights = np.exp(-top_k_dist / bandwidth)
        weights = weights / np.sum(weights)

        prediction = np.sum(weights[:, None] * top_k_probs, axis=0)
        return np.asarray(prediction, dtype=np.float64)

    def predict_batch(
        self,
        cell_features_batch: np.ndarray,
        round_weights: np.ndarray,
        k: int = 30,
    ) -> np.ndarray:
        """Predict for a batch of cells. Returns (N, 6) array."""
        results = []
        for i in range(cell_features_batch.shape[0]):
            results.append(self.predict_cell(cell_features_batch[i], round_weights, k))
        return np.stack(results, axis=0)


def _apply_obs_blending(prediction, observations, seed_index, temperature):
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


class HazardPosteriorV17Predictor(BaseRoundPredictor):
    """kNN cell predictor + linear coefficient model blend + observation blending."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_posterior_v17"
    student: ObservationSetParticleRefinedStudent
    cell_bank: CellFeatureBank
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_V17_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_V17_RANK, ge=1)
    ridge_alpha: float = Field(default=DEFAULT_V17_RIDGE_ALPHA, gt=0.0)
    predicted_particle_weight: float = Field(default=DEFAULT_V17_MEAN_WEIGHT, ge=0.0, le=1.0)
    observation_weight: float = Field(default=DEFAULT_V17_OBSERVATION_WEIGHT, gt=0.0)
    cell_knn_k: int = Field(default=DEFAULT_V17_CELL_KNN_K, ge=1)
    linear_blend: float = Field(default=DEFAULT_V17_LINEAR_BLEND, ge=0.0, le=1.0)
    obs_blend_temperature: float = Field(default=DEFAULT_V17_OBS_BLEND_TEMPERATURE, gt=0.0)
    observation_class_weights: tuple[float, ...] = ()
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls, paths: WorkspacePaths, *, round_ids: Sequence[str],
        policy_name: str = "coverage", samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_V17_K, latent_rank: int = DEFAULT_V17_RANK,
        ridge_alpha: float = DEFAULT_V17_RIDGE_ALPHA,
        predicted_particle_weight: float = DEFAULT_V17_MEAN_WEIGHT,
        observation_weight: float = DEFAULT_V17_OBSERVATION_WEIGHT,
        cell_knn_k: int = DEFAULT_V17_CELL_KNN_K,
        linear_blend: float = DEFAULT_V17_LINEAR_BLEND,
        model_name: str | None = None,
    ) -> HazardPosteriorV17Predictor:
        from astar.history.episodes.build import build_round_episode
        selected_ids = sorted(set(round_ids))
        replay_eps = [build_round_episode(paths, rid) for rid in selected_ids]
        replay_eps = [ep for ep in replay_eps if ep.replay_run_count > 0]
        if not replay_eps:
            raise ValueError("v17 requires replay-backed training rounds")

        resolved_name = model_name or "hazard_posterior_v17"

        # Build cell feature bank from training rounds
        cell_bank = CellFeatureBank.build(replay_eps)

        # Build teacher for regime identification (same as v15)
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
            name=resolved_name, student=student, cell_bank=cell_bank,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors, latent_rank=teacher.latent_rank,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            cell_knn_k=cell_knn_k, linear_blend=linear_blend,
            observation_class_weights=tuple(float(v) for v in obs_class_w.tolist()),
            training_round_ids=tuple(selected_ids),
        )

    def _predict_seed_knn(
        self,
        context: LiveInferenceContext,
        seed_index: int,
        round_weights: np.ndarray,
    ) -> np.ndarray:
        """Produce kNN-based prediction for one seed."""
        seed = context.round_context.seeds[seed_index]
        _, feature_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)
        h, w = feature_stack.shape[1:]

        # Get masks
        land = feature_dict["land"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5
        ocean = feature_dict["initial_ocean"] > 0.5
        buildable = land & ~mountain

        # Initialize with deterministic predictions
        probs = np.zeros((h, w, 6), dtype=np.float64)
        probs[ocean, 0] = 1.0
        probs[mountain, 5] = 1.0

        # For buildable cells, use kNN
        if np.any(buildable):
            cell_features = feature_stack[:, buildable].T  # (n_buildable, D)
            knn_probs = self.cell_bank.predict_batch(
                cell_features, round_weights, k=self.cell_knn_k,
            )
            # Ensure valid probabilities
            knn_probs = np.clip(knn_probs, 1e-6, 1.0)
            knn_probs = knn_probs / np.sum(knn_probs, axis=-1, keepdims=True)
            probs[buildable] = knn_probs

        # Apply prior blend for safety
        soft_mask = buildable
        prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
        probs[soft_mask] = 0.98 * probs[soft_mask] + 0.02 * prior

        sums = np.sum(probs, axis=-1, keepdims=True)
        return np.asarray(probs / np.maximum(sums, 1e-8), dtype=np.float64)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        # Get posterior for regime identification
        posterior = self.student.infer_regime(context)

        # Compute round weights from posterior
        if posterior.particles is not None and posterior.weights is not None:
            # Map particles to closest training rounds
            round_weights = np.zeros(len(self.cell_bank.round_ids), dtype=np.float64)
            teacher = self.student.teacher
            for particle, weight in zip(posterior.particles, posterior.weights):
                best_dist = float("inf")
                best_idx = 0
                for idx, coord in enumerate(teacher.coordinates):
                    dist = float(np.sum((particle - coord) ** 2))
                    if dist < best_dist:
                        best_dist = dist
                        best_idx = idx
                round_weights[best_idx] += float(weight)
            round_weights = round_weights / max(float(np.sum(round_weights)), 1e-8)
        else:
            round_weights = np.ones(len(self.cell_bank.round_ids), dtype=np.float64)
            round_weights /= float(len(self.cell_bank.round_ids))

        predictions: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            # Get v15-style linear prediction
            linear_pred = self.student.predict_seed(context, seed.seed_index)

            # Get kNN-based prediction
            knn_pred = self._predict_seed_knn(context, seed.seed_index, round_weights)

            # Blend: alpha * linear + (1-alpha) * kNN
            alpha = self.linear_blend
            blended = alpha * linear_pred + (1.0 - alpha) * knn_pred

            # Normalize
            sums = np.sum(blended, axis=-1, keepdims=True)
            blended = blended / np.maximum(sums, 1e-8)

            # Apply observation blending
            blended = _apply_obs_blending(
                blended, context.observations, seed.seed_index,
                self.obs_blend_temperature,
            )

            predictions[seed.seed_index] = blended

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


__all__ = ["HazardPosteriorV17Predictor", "hazard_posterior_v17_spec_for_model_name"]
