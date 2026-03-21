"""Expansion-rate conditioned predictor.

KEY INSIGHT: The single most important latent variable across rounds is the
settlement expansion rate, which ranges from -0.9x (everything dies, f1dac)
to 6.7x (explosive growth, ae7800).

This predictor:
1. Estimates the expansion rate from online query observations
   (by comparing observed settlement density to initial settlement density)
2. Weights training rounds by how close their expansion rate is to the estimated rate
3. Uses cellknn-style cell matching within each weighted round
4. This explicitly targets the PRIMARY axis of cross-round variation

The expansion rate captures:
- f1dac (-0.9x): hostile regime, everything collapses
- c5cdf (-0.1x): stagnant, barely any growth
- 8e8399 (1.9x): conservative growth
- 36e581, fd3c92 (3.0-3.1x): moderate growth
- 71451d, 76909e (4.8-5.0x): fast growth
- ae7800 (6.7x): explosive expansion
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
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.greybox_cellknn import _cell_features, _spatial_smooth
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _stats_from_observations,
    SeedTranscriptStats,
)
from astar.student.predictor.round import BaseRoundPredictor


def _estimate_expansion_rate(
    round_detail: RoundDetail,
    per_seed_stats: dict[int, SeedTranscriptStats],
) -> float:
    """Estimate the round's settlement expansion rate from query observations.

    Uses the ratio of observed settlement+port cells to initial settlements.
    This is the key regime indicator.
    """
    total_observed_settlement_cells = 0.0
    total_observed_cells = 0.0
    total_initial_settlements = 0.0

    for seed_index in range(round_detail.seeds_count):
        stats = per_seed_stats[seed_index]
        if stats.query_count == 0:
            continue

        # Count observed settlement + port cells
        count_tensor = np.asarray(stats.count_tensor, dtype=np.float64)
        count_total = np.asarray(stats.count_total, dtype=np.float64)

        # Settlement (class 1) + Port (class 2) observed
        observed_built = np.sum(count_tensor[:, :, 1] + count_tensor[:, :, 2])
        observed_total = np.sum(count_total)
        if observed_total > 0:
            total_observed_settlement_cells += observed_built
            total_observed_cells += observed_total

        # Initial settlements for this seed
        total_initial_settlements += len(round_detail.initial_states[seed_index].settlements)

    if total_observed_cells < 1 or total_initial_settlements < 1:
        return 3.0  # Default moderate expansion

    # Estimated settlement density at year 50
    observed_settlement_fraction = total_observed_settlement_cells / total_observed_cells

    # Map area per seed (approximate)
    map_cells = round_detail.map_height * round_detail.map_width
    seeds_count = round_detail.seeds_count

    # Estimated total settlements at year 50
    estimated_year50_settlements = observed_settlement_fraction * map_cells * seeds_count

    # Expansion rate
    expansion_rate = estimated_year50_settlements / max(total_initial_settlements, 1.0)

    return float(np.clip(expansion_rate, -1.0, 10.0))


class GreyboxExpansionConditionedPredictor(BaseRoundPredictor):
    """Predictor conditioned on estimated expansion rate."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_expansion_conditioned_v01"
    base_predictor: HistoricalBucketPriorPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    k_neighbors: int = Field(default=24, ge=1)
    expansion_weight: float = Field(default=2.0, ge=0.0)
    spatial_sigma: float = Field(default=2.0, ge=0.0)
    observation_beta_min: float = Field(default=3.0, ge=0.0)
    observation_beta_scale: float = Field(default=12.0, ge=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    # Per-round data
    bank_round_ids: tuple[str, ...] = ()
    bank_seed_indexes: tuple[int, ...] = ()
    bank_terminal_probs: tuple[np.ndarray, ...] = ()
    bank_cell_features: tuple[np.ndarray, ...] = ()
    bank_expansion_rates: tuple[float, ...] = ()
    bank_feature_dim: int = Field(default=13, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        k_neighbors: int = 24,
        expansion_weight: float = 2.0,
        spatial_sigma: float = 2.0,
        observation_beta_min: float = 3.0,
        observation_beta_scale: float = 12.0,
        prior_blend: float = 0.15,
        probability_floor: float = 0.01,
        model_name: str = "greybox_expansion_conditioned_v01",
    ) -> GreyboxExpansionConditionedPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
        )

        bank_round_ids: list[str] = []
        bank_seed_indexes: list[int] = []
        bank_terminal_probs: list[np.ndarray] = []
        bank_cell_features: list[np.ndarray] = []
        bank_expansion_rates: list[float] = []
        feature_dim = 0

        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)
            analyses = read_analysis_records(paths, round_id)

            # Compute expansion rate from replay summaries
            expansion_rates = []
            for seed in episode.seeds:
                try:
                    summary = np.load(
                        f'data/derived/replay_summaries/round_id={round_id}/seed_index={seed.seed_index}.npz'
                    )
                    init_sett = float(summary['survival_curve_mean'][0])
                    final_sett = float(summary['survival_curve_mean'][50])
                    if init_sett > 0:
                        expansion_rates.append(final_sett / init_sett)
                except (FileNotFoundError, KeyError):
                    pass

            round_expansion = float(np.mean(expansion_rates)) if expansion_rates else 3.0

            for seed in episode.seeds:
                if seed.seed_index not in analyses:
                    continue
                gt = np.asarray(analyses[seed.seed_index].analysis.ground_truth, dtype=np.float64)
                feats = _cell_features(seed.initial_state.grid, list(seed.initial_state.settlements), None)
                feature_dim = feats.shape[-1]

                bank_round_ids.append(round_id)
                bank_seed_indexes.append(seed.seed_index)
                bank_terminal_probs.append(gt)
                bank_cell_features.append(feats)
                bank_expansion_rates.append(round_expansion)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            k_neighbors=k_neighbors,
            expansion_weight=expansion_weight,
            spatial_sigma=spatial_sigma,
            observation_beta_min=observation_beta_min,
            observation_beta_scale=observation_beta_scale,
            prior_blend=prior_blend,
            bank_round_ids=tuple(bank_round_ids),
            bank_seed_indexes=tuple(bank_seed_indexes),
            bank_terminal_probs=tuple(bank_terminal_probs),
            bank_cell_features=tuple(bank_cell_features),
            bank_expansion_rates=tuple(bank_expansion_rates),
            bank_feature_dim=feature_dim,
        )

    def _predict_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        estimated_expansion: float,
        observed_counts: np.ndarray | None = None,
        observed_total: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict using expansion-weighted cell kNN."""
        initial_state = round_detail.initial_states[seed_index]
        test_features = _cell_features(
            initial_state.grid, list(initial_state.settlements), None,
        )
        height, width = test_features.shape[:2]
        n_test = height * width
        test_flat = test_features.reshape(n_test, -1)

        # Build training bank with expansion rate as extra dimension
        all_train_features = []
        all_train_probs = []
        all_train_expansion = []

        for bank_idx in range(len(self.bank_round_ids)):
            feats = self.bank_cell_features[bank_idx]
            probs = self.bank_terminal_probs[bank_idx]
            exp_rate = self.bank_expansion_rates[bank_idx]
            n_cells = feats.shape[0] * feats.shape[1]
            all_train_features.append(feats.reshape(n_cells, -1))
            all_train_probs.append(probs.reshape(n_cells, CLASS_COUNT))
            all_train_expansion.append(np.full(n_cells, exp_rate, dtype=np.float64))

        train_features = np.concatenate(all_train_features, axis=0)
        train_probs = np.concatenate(all_train_probs, axis=0)
        train_expansion = np.concatenate(all_train_expansion, axis=0)

        # Normalize spatial features
        feat_mean = np.mean(train_features, axis=0)
        feat_std = np.std(train_features, axis=0)
        feat_std = np.where(feat_std > 1e-6, feat_std, 1.0)
        train_normed = (train_features - feat_mean) / feat_std
        test_normed = (test_flat - feat_mean) / feat_std

        # Add expansion rate as extra weighted dimension
        exp_mean = np.mean(train_expansion)
        exp_std = max(np.std(train_expansion), 0.1)
        train_exp_normed = (train_expansion - exp_mean) / exp_std * self.expansion_weight
        test_exp_normed = np.full(n_test, (estimated_expansion - exp_mean) / exp_std * self.expansion_weight)

        # Augmented feature space: spatial + expansion rate
        train_augmented = np.column_stack([train_normed, train_exp_normed])
        test_augmented = np.column_stack([test_normed, test_exp_normed])

        # Batch kNN
        n_train = train_augmented.shape[0]
        k = min(self.k_neighbors, n_train)
        train_sq_norms = np.sum(train_augmented * train_augmented, axis=1)

        prediction = np.zeros((n_test, CLASS_COUNT), dtype=np.float64)
        chunk_size = 256

        for start in range(0, n_test, chunk_size):
            end = min(start + chunk_size, n_test)
            test_chunk = test_augmented[start:end]
            test_sq_norms = np.sum(test_chunk * test_chunk, axis=1)
            cross = test_chunk @ train_augmented.T
            sq_dists = test_sq_norms[:, None] + train_sq_norms[None, :] - 2.0 * cross
            sq_dists = np.maximum(sq_dists, 0.0)

            for i in range(end - start):
                nearest = np.argpartition(sq_dists[i], k)[:k]
                dists = np.sqrt(sq_dists[i, nearest])
                weights = 1.0 / np.maximum(dists, 1e-4)
                weights /= np.sum(weights)
                prediction[start + i] = np.dot(weights, train_probs[nearest])

        prediction = prediction.reshape(height, width, CLASS_COUNT)

        # Apply observations
        if observed_counts is not None and observed_total is not None:
            observed_mask = observed_total > 0
            if np.any(observed_mask):
                observed_freq = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
                safe_total = np.maximum(observed_total, 1.0)
                observed_freq[observed_mask] = observed_counts[observed_mask] / safe_total[observed_mask, None]

                residual = observed_freq - prediction
                residual[~observed_mask] = 0.0

                if self.spatial_sigma > 0:
                    smoothed_residual = _spatial_smooth(residual, observed_mask.astype(np.float64), self.spatial_sigma)
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

        # Normalize
        prediction = np.clip(prediction, 0, 1)
        sums = prediction.sum(axis=-1, keepdims=True)
        prediction = np.where(sums > 0, prediction / np.maximum(sums, 1e-10), 1.0 / CLASS_COUNT)
        return prediction

    def _predict_with_stats(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        per_seed_stats: dict[int, SeedTranscriptStats],
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)

        # Estimate expansion rate from observations
        estimated_expansion = _estimate_expansion_rate(round_detail, per_seed_stats)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            stats = per_seed_stats[seed_index]
            counts = np.asarray(stats.count_tensor, dtype=np.float64)
            total = np.asarray(stats.count_total, dtype=np.float64)

            pred = self._predict_seed(
                round_detail, seed_index, estimated_expansion, counts, total,
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * pred + self.prior_blend * prior
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        height, width = round_detail.map_height, round_detail.map_width
        if evidence is None or evidence.total_queries == 0:
            per_seed_stats = {
                si: SeedTranscriptStats(
                    query_count=0,
                    count_tensor=np.zeros((height, width, CLASS_COUNT), dtype=np.float64),
                    count_total=np.zeros((height, width), dtype=np.float64),
                )
                for si in range(round_detail.seeds_count)
            }
        else:
            from astar.student.predictor.query_residual import _stats_from_seed_evidence
            per_seed_stats = {
                si: _stats_from_seed_evidence(evidence.per_seed[si])
                for si in range(round_detail.seeds_count)
            }
        return self._predict_with_stats(round_detail, features, per_seed_stats)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        features = context.geometry_bundle
        per_seed_stats = _stats_from_observations(round_detail, context.observations)
        return self._predict_with_stats(round_detail, features, per_seed_stats)


__all__ = ["GreyboxExpansionConditionedPredictor"]
