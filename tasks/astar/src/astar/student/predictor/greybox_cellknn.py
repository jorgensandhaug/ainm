"""Cell-level kNN predictor using full replay terminal probability maps.

Fundamentally different from the hazard teacher approach:
- Uses per-cell terminal probs from replays directly (40x40x6 per seed)
- Matches cells via feature-space similarity, not via compressed coefficients
- Round identification via cell-level likelihood weighting
- Spatial propagation from observed to unobserved cells
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    SeedTranscriptStats,
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
    _stats_from_seed_evidence,
)
from astar.student.predictor.round import BaseRoundPredictor


def _cell_features(
    initial_grid: np.ndarray,
    settlements: list,
    seed_features: object,
) -> np.ndarray:
    """Build per-cell feature vector for kNN matching.

    Returns (H, W, F) feature tensor.
    """
    from astar.core.terrain import buildable_mask, mountain_mask, sea_mask
    from astar.features.coasts import coast_mask as compute_coast_mask
    from astar.features.influence import normalized_land_distance_to_settlements
    from astar.infra.api.dto import InitialSettlement

    grid = np.asarray(initial_grid, dtype=np.int64)
    height, width = grid.shape

    buildable = buildable_mask(grid).astype(np.float64)
    ocean = sea_mask(grid).astype(np.float64)
    mountain = mountain_mask(grid).astype(np.float64)
    forest = (grid == 4).astype(np.float64)
    coast = compute_coast_mask(grid).astype(np.float64)
    land = 1.0 - ocean

    settlement_locs = [
        InitialSettlement(x=s.x, y=s.y, has_port=getattr(s, "has_port", False), alive=getattr(s, "alive", True))
        for s in settlements
    ]
    land_dist = normalized_land_distance_to_settlements(grid, settlement_locs)

    # Local neighborhood features
    def _local_ratio(mask: np.ndarray, radius: int = 1) -> np.ndarray:
        h, w = mask.shape
        out = np.zeros((h, w), dtype=np.float64)
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                sy = slice(max(0, -dy), min(h, h - dy))
                sx = slice(max(0, -dx), min(w, w - dx))
                ty = slice(max(0, dy), min(h, h + dy))
                tx = slice(max(0, dx), min(w, w + dx))
                out[ty, tx] += mask[sy, sx]
        count = (2 * radius + 1) ** 2
        return out / count

    settlement_map = np.zeros((height, width), dtype=np.float64)
    port_map = np.zeros((height, width), dtype=np.float64)
    for s in settlements:
        settlement_map[s.y, s.x] = 1.0
        if getattr(s, "has_port", False):
            port_map[s.y, s.x] = 1.0

    forest_density = _local_ratio(forest.astype(bool))
    mountain_density = _local_ratio(mountain.astype(bool))
    settlement_density = _local_ratio(settlement_map.astype(bool))

    features = np.stack([
        buildable,
        ocean,
        mountain,
        forest,
        coast,
        land,
        land_dist,
        settlement_map,
        port_map,
        forest_density,
        mountain_density,
        settlement_density,
        1.0 - land_dist,  # settlement proximity
    ], axis=-1)

    return features


def _gaussian_kernel(size: int, sigma: float) -> np.ndarray:
    """2D Gaussian kernel for spatial smoothing."""
    coords = np.arange(size) - size // 2
    g = np.exp(-(coords ** 2) / (2 * sigma ** 2))
    kernel = np.outer(g, g)
    return kernel / kernel.sum()


def _spatial_smooth(values: np.ndarray, mask: np.ndarray, sigma: float) -> np.ndarray:
    """Smooth values at masked positions using Gaussian kernel, propagate to unmasked."""
    if sigma <= 0:
        return values
    kernel_size = max(3, int(6 * sigma + 1))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = _gaussian_kernel(kernel_size, sigma)
    pad = kernel_size // 2

    height, width = values.shape[:2]
    n_classes = values.shape[2] if values.ndim == 3 else 1

    if values.ndim == 2:
        values = values[..., None]

    result = np.zeros_like(values)
    weight_sum = np.zeros((height, width, 1), dtype=np.float64)

    padded_values = np.pad(values * mask[..., None], ((pad, pad), (pad, pad), (0, 0)), mode="constant")
    padded_mask = np.pad(mask, ((pad, pad), (pad, pad)), mode="constant")

    for dy in range(kernel_size):
        for dx in range(kernel_size):
            w = kernel[dy, dx]
            result += w * padded_values[dy:dy + height, dx:dx + width]
            weight_sum += w * padded_mask[dy:dy + height, dx:dx + width][..., None]

    safe_weight = np.maximum(weight_sum, 1e-10)
    smoothed = result / safe_weight

    if n_classes == 1:
        return smoothed[..., 0]
    return smoothed


class CellKnnTrainingBank(BaseModel):
    """Stores per-cell features and terminal probs from all training seeds."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_ids: tuple[str, ...] = ()
    # Per round/seed terminal probability maps: {(round_id, seed_index): (H, W, 6)}
    terminal_probs: dict[tuple[str, int], np.ndarray] = Field(default_factory=dict)
    # Per round/seed cell features: {(round_id, seed_index): (H, W, F)}
    cell_features: dict[tuple[str, int], np.ndarray] = Field(default_factory=dict)
    # Per round/seed initial grids
    initial_grids: dict[tuple[str, int], np.ndarray] = Field(default_factory=dict)


class GreyboxCellKnnPredictor(BaseRoundPredictor):
    """Cell-level kNN predictor using full replay terminal probability maps."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_cellknn_v01"
    base_predictor: HistoricalBucketPriorPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    k_neighbors: int = Field(default=32, ge=1)
    round_weight_scale: float = Field(default=5.0, ge=0.0)
    spatial_sigma: float = Field(default=2.0, ge=0.0)
    observation_beta_min: float = Field(default=3.0, ge=0.0)
    observation_beta_scale: float = Field(default=12.0, ge=0.0)
    prior_blend: float = Field(default=0.20, ge=0.0, le=1.0)
    # Training data bank
    bank_round_ids: tuple[str, ...] = ()
    bank_seed_indexes: tuple[int, ...] = ()
    bank_terminal_probs: tuple[np.ndarray, ...] = ()  # list of (H, W, 6)
    bank_cell_features: tuple[np.ndarray, ...] = ()  # list of (H, W, F)
    bank_feature_dim: int = Field(default=13, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        k_neighbors: int = 32,
        round_weight_scale: float = 5.0,
        spatial_sigma: float = 2.0,
        observation_beta_min: float = 3.0,
        observation_beta_scale: float = 12.0,
        prior_blend: float = 0.20,
        probability_floor: float = 0.01,
        model_name: str = "greybox_cellknn_v01",
    ) -> GreyboxCellKnnPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        bank_round_ids: list[str] = []
        bank_seed_indexes: list[int] = []
        bank_terminal_probs: list[np.ndarray] = []
        bank_cell_features: list[np.ndarray] = []
        feature_dim = 0

        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)
            analyses = read_analysis_records(paths, round_id)

            for seed in episode.seeds:
                seed_index = seed.seed_index
                if seed_index not in analyses:
                    continue

                # Get ground truth terminal probs from analysis
                gt = np.asarray(analyses[seed_index].analysis.ground_truth, dtype=np.float64)

                # Build cell features
                initial_state = seed.initial_state
                cell_feats = _cell_features(
                    initial_state.grid,
                    list(initial_state.settlements),
                    None,
                )
                feature_dim = cell_feats.shape[-1]

                bank_round_ids.append(round_id)
                bank_seed_indexes.append(seed_index)
                bank_terminal_probs.append(gt)
                bank_cell_features.append(cell_feats)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            k_neighbors=k_neighbors,
            round_weight_scale=round_weight_scale,
            spatial_sigma=spatial_sigma,
            observation_beta_min=observation_beta_min,
            observation_beta_scale=observation_beta_scale,
            prior_blend=prior_blend,
            bank_round_ids=tuple(bank_round_ids),
            bank_seed_indexes=tuple(bank_seed_indexes),
            bank_terminal_probs=tuple(bank_terminal_probs),
            bank_cell_features=tuple(bank_cell_features),
            bank_feature_dim=feature_dim,
        )

    def _compute_round_weights(
        self,
        observed_counts: np.ndarray,
        observed_total: np.ndarray,
    ) -> np.ndarray:
        """Compute posterior weights over training rounds from observed cells.

        Vectorized: compute multinomial log-likelihood of observed cell outcomes
        under each training round's terminal probability distribution.
        """
        observed_mask = observed_total > 0
        if not np.any(observed_mask):
            n_rounds = len(set(self.bank_round_ids))
            return np.ones(n_rounds, dtype=np.float64) / n_rounds

        unique_rounds = sorted(set(self.bank_round_ids))
        n_rounds = len(unique_rounds)
        round_to_idx = {r: i for i, r in enumerate(unique_rounds)}
        round_log_likes = np.zeros(n_rounds, dtype=np.float64)
        round_seed_counts = np.zeros(n_rounds, dtype=np.float64)

        # Flatten observed cells for vectorized likelihood
        obs_cells = observed_counts[observed_mask]  # (N_obs, 6)

        for bank_idx in range(len(self.bank_round_ids)):
            round_idx = round_to_idx[self.bank_round_ids[bank_idx]]
            training_probs = self.bank_terminal_probs[bank_idx]
            train_at_obs = np.maximum(training_probs[observed_mask], 1e-8)  # (N_obs, 6)

            # Multinomial log-likelihood: sum(counts * log(probs)) for observed cells
            ll = np.sum(obs_cells * np.log(train_at_obs))
            round_log_likes[round_idx] += ll
            round_seed_counts[round_idx] += 1.0

        # Average across seeds per round
        safe_counts = np.maximum(round_seed_counts, 1.0)
        round_log_likes /= safe_counts

        # Scale and softmax
        round_log_likes *= self.round_weight_scale
        round_log_likes -= np.max(round_log_likes)
        weights = np.exp(round_log_likes)
        weights /= np.sum(weights)
        return weights

    def _predict_seed_cellknn(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        round_weights: np.ndarray,
        observed_counts: np.ndarray | None = None,
        observed_total: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict terminal probs for one seed using cell-level kNN.

        Uses batched numpy operations for fast kNN search.
        """
        initial_state = round_detail.initial_states[seed_index]
        test_features = _cell_features(
            initial_state.grid,
            list(initial_state.settlements),
            None,
        )
        height, width = test_features.shape[:2]
        unique_rounds = sorted(set(self.bank_round_ids))
        round_to_idx = {r: i for i, r in enumerate(unique_rounds)}

        # Build flat feature bank for kNN search
        all_train_features = []
        all_train_probs = []
        all_train_round_idxs = []

        for bank_idx in range(len(self.bank_round_ids)):
            round_idx = round_to_idx[self.bank_round_ids[bank_idx]]
            feats = self.bank_cell_features[bank_idx]
            probs = self.bank_terminal_probs[bank_idx]
            n_cells = feats.shape[0] * feats.shape[1]
            all_train_features.append(feats.reshape(n_cells, -1))
            all_train_probs.append(probs.reshape(n_cells, CLASS_COUNT))
            all_train_round_idxs.append(np.full(n_cells, round_idx, dtype=np.int64))

        train_features = np.concatenate(all_train_features, axis=0)
        train_probs = np.concatenate(all_train_probs, axis=0)
        train_round_idxs = np.concatenate(all_train_round_idxs, axis=0)

        # Normalize features
        feat_mean = np.mean(train_features, axis=0)
        feat_std = np.std(train_features, axis=0)
        feat_std = np.where(feat_std > 1e-6, feat_std, 1.0)
        train_normed = (train_features - feat_mean) / feat_std
        test_normed = (test_features.reshape(-1, self.bank_feature_dim) - feat_mean) / feat_std

        n_test = test_normed.shape[0]
        n_train = train_normed.shape[0]
        k = min(self.k_neighbors, n_train)

        # Batch kNN: process in chunks to limit memory
        chunk_size = 256
        all_indices = np.zeros((n_test, k), dtype=np.int64)
        all_distances = np.zeros((n_test, k), dtype=np.float64)

        # Precompute train squared norms
        train_sq_norms = np.sum(train_normed * train_normed, axis=1)

        for start in range(0, n_test, chunk_size):
            end = min(start + chunk_size, n_test)
            test_chunk = test_normed[start:end]  # (chunk, F)

            # Squared distances: ||a-b||^2 = ||a||^2 + ||b||^2 - 2*a.b
            test_sq_norms = np.sum(test_chunk * test_chunk, axis=1)  # (chunk,)
            cross = test_chunk @ train_normed.T  # (chunk, n_train)
            sq_dists = test_sq_norms[:, None] + train_sq_norms[None, :] - 2.0 * cross
            sq_dists = np.maximum(sq_dists, 0.0)

            # Partial sort for k nearest
            for i in range(end - start):
                nearest = np.argpartition(sq_dists[i], k)[:k]
                all_indices[start + i] = nearest
                all_distances[start + i] = np.sqrt(sq_dists[i, nearest])

        # Distance-based weights (1/d, with floor)
        dist_weights = 1.0 / np.maximum(all_distances, 1e-4)

        # Round-based weights for each neighbor
        nearest_round_idxs = train_round_idxs[all_indices]  # (N_test, k)
        round_w = round_weights[nearest_round_idxs]  # (N_test, k)

        # Combined weights
        combined_weights = dist_weights * round_w
        weight_sums = np.sum(combined_weights, axis=1, keepdims=True)
        combined_weights /= np.maximum(weight_sums, 1e-10)

        # Weighted average of terminal probs: (N_test, k) x (N_test, k, 6) -> (N_test, 6)
        neighbor_probs = train_probs[all_indices]  # (N_test, k, 6)
        prediction = np.sum(combined_weights[..., None] * neighbor_probs, axis=1)

        prediction = prediction.reshape(height, width, CLASS_COUNT)

        # Apply spatial smoothing of observations
        if observed_counts is not None and observed_total is not None:
            observed_mask = observed_total > 0
            if np.any(observed_mask):
                # Compute observed empirical frequencies
                observed_freq = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
                safe_total = np.maximum(observed_total, 1.0)
                observed_freq[observed_mask] = observed_counts[observed_mask] / safe_total[observed_mask, None]

                # Observation residual (observed - predicted)
                residual = observed_freq - prediction
                residual[~observed_mask] = 0.0

                # Spatially smooth the residual
                if self.spatial_sigma > 0:
                    smoothed_residual = _spatial_smooth(residual, observed_mask.astype(np.float64), self.spatial_sigma)
                    smoothed_coverage = _spatial_smooth(
                        observed_mask.astype(np.float64),
                        observed_mask.astype(np.float64),
                        self.spatial_sigma,
                    )
                    # Apply smoothed residual, weighted by coverage
                    correction_weight = np.clip(smoothed_coverage, 0, 1)[..., None]
                    prediction = prediction + correction_weight * smoothed_residual

                # Exact-cell blending for directly observed cells
                prior_entropy = np.asarray(entropy_map(prediction), dtype=np.float64)
                beta = self.observation_beta_min + self.observation_beta_scale * (
                    1.0 - prior_entropy / math.log(6.0)
                )
                beta = beta[..., None]
                count_total = observed_total[..., None]
                prediction = np.where(
                    count_total > 0,
                    (beta * prediction + observed_counts) / np.maximum(beta + count_total, 1e-6),
                    prediction,
                )

        # Clip and normalize
        prediction = np.clip(prediction, 0, 1)
        sums = prediction.sum(axis=-1, keepdims=True)
        prediction = np.where(sums > 0, prediction / np.maximum(sums, 1e-10), 1.0 / CLASS_COUNT)

        return prediction

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)

        # Collect observation counts across all seeds for round identification
        height, width = round_detail.map_height, round_detail.map_width
        global_obs_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        global_obs_total = np.zeros((height, width), dtype=np.float64)

        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}

        for seed_index in range(round_detail.seeds_count):
            if evidence is not None and evidence.total_queries > 0:
                seed_ev = evidence.per_seed[seed_index]
                counts = np.asarray(seed_ev.observed_class_count_tensor, dtype=np.float64)
                total = np.sum(counts, axis=-1)
            else:
                counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
                total = np.zeros((height, width), dtype=np.float64)
            per_seed_counts[seed_index] = counts
            per_seed_total[seed_index] = total
            global_obs_counts += counts
            global_obs_total += total

        # Compute round weights from ALL observed cells across seeds
        round_weights = self._compute_round_weights(global_obs_counts, global_obs_total)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            cellknn_pred = self._predict_seed_cellknn(
                round_detail,
                seed_index,
                round_weights,
                per_seed_counts[seed_index],
                per_seed_total[seed_index],
            )

            # Blend with historical bucket prior
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * cellknn_pred + self.prior_blend * prior

            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        features = context.geometry_bundle
        per_seed_stats = _stats_from_observations(round_detail, context.observations)

        # Build evidence bundle from stats
        height, width = round_detail.map_height, round_detail.map_width
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)

        global_obs_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        global_obs_total = np.zeros((height, width), dtype=np.float64)
        per_seed_counts: dict[int, np.ndarray] = {}
        per_seed_total: dict[int, np.ndarray] = {}

        for seed_index in range(round_detail.seeds_count):
            stats = per_seed_stats[seed_index]
            counts = np.asarray(stats.count_tensor, dtype=np.float64)
            total = np.asarray(stats.count_total, dtype=np.float64)
            per_seed_counts[seed_index] = counts
            per_seed_total[seed_index] = total
            global_obs_counts += counts
            global_obs_total += total

        round_weights = self._compute_round_weights(global_obs_counts, global_obs_total)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            cellknn_pred = self._predict_seed_cellknn(
                round_detail,
                seed_index,
                round_weights,
                per_seed_counts[seed_index],
                per_seed_total[seed_index],
            )

            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * cellknn_pred + self.prior_blend * prior
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["GreyboxCellKnnPredictor"]
