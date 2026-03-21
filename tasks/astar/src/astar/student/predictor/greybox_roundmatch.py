"""Round-matching predictor using full terminal probability maps.

Approach:
1. For each training round/seed, store the full ground truth terminal probs (40x40x6)
2. During inference, use query observations to compute Bayesian posterior weights
   over training rounds using per-cell multinomial likelihoods
3. For each test seed, find the most similar training seeds (same round weighting,
   adjusted for map similarity) and use their terminal probs directly
4. Apply spatial smoothing + exact-cell blending of observations

Key difference from hazard teacher: uses the FULL resolution terminal probability
maps instead of compressing to 51 logistic regression coefficients.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, buildable_mask, sea_mask, mountain_mask
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
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor


def _map_fingerprint(initial_state: object) -> np.ndarray:
    """Compute a compact fingerprint of a map's initial state for similarity matching."""
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    settlements = initial_state.settlements

    height, width = grid.shape
    buildable = buildable_mask(grid)
    ocean = sea_mask(grid)
    mountain = mountain_mask(grid)
    forest = (grid == 4)

    n_buildable = float(np.sum(buildable))
    n_ocean = float(np.sum(ocean))
    n_mountain = float(np.sum(mountain))
    n_forest = float(np.sum(forest))
    n_settlements = float(len(settlements))
    n_ports = float(sum(1 for s in settlements if getattr(s, 'has_port', False)))

    total = float(height * width)

    # Settlement positions (normalized)
    sx = np.mean([s.x / width for s in settlements]) if settlements else 0.5
    sy = np.mean([s.y / height for s in settlements]) if settlements else 0.5
    s_spread = np.std([s.x / width for s in settlements]) if len(list(settlements)) > 1 else 0.0

    return np.array([
        n_buildable / total,
        n_ocean / total,
        n_mountain / total,
        n_forest / total,
        n_settlements / total,
        n_ports / max(n_settlements, 1.0),
        sx, sy, s_spread,
    ], dtype=np.float64)


class GreyboxRoundMatchPredictor(BaseRoundPredictor):
    """Predictor that matches rounds and transfers full terminal probability maps."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_roundmatch_v01"
    base_predictor: HistoricalBucketPriorPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    round_weight_scale: float = Field(default=3.0, ge=0.0)
    map_similarity_weight: float = Field(default=1.0, ge=0.0)
    observation_beta_min: float = Field(default=2.0, ge=0.0)
    observation_beta_scale: float = Field(default=8.0, ge=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    spatial_sigma: float = Field(default=2.5, ge=0.0)
    # Bank of training data
    bank_round_ids: tuple[str, ...] = ()
    bank_seed_indexes: tuple[int, ...] = ()
    bank_terminal_probs: tuple[np.ndarray, ...] = ()  # (H, W, 6) per entry
    bank_map_fingerprints: tuple[np.ndarray, ...] = ()
    bank_initial_grids: tuple[np.ndarray, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        round_weight_scale: float = 3.0,
        map_similarity_weight: float = 1.0,
        observation_beta_min: float = 2.0,
        observation_beta_scale: float = 8.0,
        prior_blend: float = 0.15,
        spatial_sigma: float = 2.5,
        probability_floor: float = 0.01,
        model_name: str = "greybox_roundmatch_v01",
    ) -> GreyboxRoundMatchPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
        )

        bank_round_ids: list[str] = []
        bank_seed_indexes: list[int] = []
        bank_terminal_probs: list[np.ndarray] = []
        bank_map_fingerprints: list[np.ndarray] = []
        bank_initial_grids: list[np.ndarray] = []

        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)
            analyses = read_analysis_records(paths, round_id)
            for seed in episode.seeds:
                if seed.seed_index not in analyses:
                    continue
                gt = np.asarray(analyses[seed.seed_index].analysis.ground_truth, dtype=np.float64)
                fp = _map_fingerprint(seed.initial_state)
                grid = np.asarray(seed.initial_state.grid, dtype=np.int64)

                bank_round_ids.append(round_id)
                bank_seed_indexes.append(seed.seed_index)
                bank_terminal_probs.append(gt)
                bank_map_fingerprints.append(fp)
                bank_initial_grids.append(grid)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            round_weight_scale=round_weight_scale,
            map_similarity_weight=map_similarity_weight,
            observation_beta_min=observation_beta_min,
            observation_beta_scale=observation_beta_scale,
            prior_blend=prior_blend,
            spatial_sigma=spatial_sigma,
            bank_round_ids=tuple(bank_round_ids),
            bank_seed_indexes=tuple(bank_seed_indexes),
            bank_terminal_probs=tuple(bank_terminal_probs),
            bank_map_fingerprints=tuple(bank_map_fingerprints),
            bank_initial_grids=tuple(bank_initial_grids),
        )

    def _compute_round_weights(
        self,
        observed_counts: np.ndarray,
        observed_total: np.ndarray,
    ) -> np.ndarray:
        """Bayesian posterior over training rounds from observed cells."""
        unique_rounds = sorted(set(self.bank_round_ids))
        n_rounds = len(unique_rounds)
        round_to_idx = {r: i for i, r in enumerate(unique_rounds)}

        observed_mask = observed_total > 0
        if not np.any(observed_mask):
            return np.ones(n_rounds, dtype=np.float64) / n_rounds

        round_log_likes = np.zeros(n_rounds, dtype=np.float64)
        round_seed_counts = np.zeros(n_rounds, dtype=np.float64)

        obs_cells = observed_counts[observed_mask]  # (N_obs, 6)

        for bank_idx in range(len(self.bank_round_ids)):
            round_idx = round_to_idx[self.bank_round_ids[bank_idx]]
            train_probs = np.maximum(self.bank_terminal_probs[bank_idx][observed_mask], 1e-8)
            ll = np.sum(obs_cells * np.log(train_probs))
            round_log_likes[round_idx] += ll
            round_seed_counts[round_idx] += 1.0

        safe_counts = np.maximum(round_seed_counts, 1.0)
        round_log_likes /= safe_counts
        round_log_likes *= self.round_weight_scale
        round_log_likes -= np.max(round_log_likes)
        weights = np.exp(round_log_likes)
        weights /= np.sum(weights)
        return weights

    def _predict_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        round_weights: np.ndarray,
        observed_counts: np.ndarray | None = None,
        observed_total: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict terminal probs for one seed using round-weighted transfer.

        For each training seed, weight = round_weight * map_similarity.
        Then weighted-average the terminal probs.
        """
        initial_state = round_detail.initial_states[seed_index]
        test_fp = _map_fingerprint(initial_state)
        height, width = round_detail.map_height, round_detail.map_width
        unique_rounds = sorted(set(self.bank_round_ids))
        round_to_idx = {r: i for i, r in enumerate(unique_rounds)}

        # Compute per-bank-entry weights: round_weight * map_similarity
        n_bank = len(self.bank_round_ids)
        bank_weights = np.zeros(n_bank, dtype=np.float64)

        for bank_idx in range(n_bank):
            round_idx = round_to_idx[self.bank_round_ids[bank_idx]]
            rw = round_weights[round_idx]

            # Map similarity (negative Euclidean distance of fingerprints)
            train_fp = self.bank_map_fingerprints[bank_idx]
            dist = np.sqrt(np.sum((test_fp - train_fp) ** 2))
            map_sim = np.exp(-self.map_similarity_weight * dist)

            bank_weights[bank_idx] = rw * map_sim

        # Normalize
        total_w = np.sum(bank_weights)
        if total_w > 0:
            bank_weights /= total_w
        else:
            bank_weights[:] = 1.0 / n_bank

        # Weighted average of terminal probs
        prediction = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        for bank_idx in range(n_bank):
            if bank_weights[bank_idx] < 1e-8:
                continue
            tp = self.bank_terminal_probs[bank_idx]
            # Handle size mismatch (different map sizes)
            if tp.shape[0] == height and tp.shape[1] == width:
                prediction += bank_weights[bank_idx] * tp

        # Apply observations
        if observed_counts is not None and observed_total is not None:
            observed_mask = observed_total > 0
            if np.any(observed_mask):
                # Spatial smoothing of observation residual
                observed_freq = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
                safe_total = np.maximum(observed_total, 1.0)
                observed_freq[observed_mask] = observed_counts[observed_mask] / safe_total[observed_mask, None]

                residual = observed_freq - prediction
                residual[~observed_mask] = 0.0

                if self.spatial_sigma > 0:
                    from astar.student.predictor.greybox_cellknn import _spatial_smooth
                    smoothed_residual = _spatial_smooth(
                        residual, observed_mask.astype(np.float64), self.spatial_sigma,
                    )
                    smoothed_coverage = _spatial_smooth(
                        observed_mask.astype(np.float64),
                        observed_mask.astype(np.float64),
                        self.spatial_sigma,
                    )
                    correction_weight = np.clip(smoothed_coverage, 0, 1)[..., None]
                    prediction = prediction + correction_weight * smoothed_residual

                # Exact-cell blending
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

        round_weights = self._compute_round_weights(global_obs_counts, global_obs_total)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            rm_pred = self._predict_seed(
                round_detail, seed_index, round_weights,
                per_seed_counts[seed_index], per_seed_total[seed_index],
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * rm_pred + self.prior_blend * prior
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
            rm_pred = self._predict_seed(
                round_detail, seed_index, round_weights,
                per_seed_counts[seed_index], per_seed_total[seed_index],
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * rm_pred + self.prior_blend * prior
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["GreyboxRoundMatchPredictor"]
