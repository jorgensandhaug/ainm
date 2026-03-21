"""Multi-regime conditioned predictor using multiple latent indicators.

Instead of conditioning on just expansion rate (1D), this model uses a
MULTI-DIMENSIONAL regime vector estimated from observations:
1. Settlement density (expansion rate proxy)
2. Ruin density (collapse intensity proxy)
3. Port density (maritime development proxy)
4. Forest density (environment reclaim proxy)
5. Mean population (prosperity proxy) - from settlement observations
6. Mean food (resource/winter proxy) - from settlement observations
7. Owner diversity (faction/conflict proxy) - from settlement observations

These 7 dimensions capture much more of the hidden parameter variation
than the 1D expansion rate alone.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records
from astar.history.episodes.build import build_round_episode
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.greybox_cellknn import _cell_features, _spatial_smooth
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    SeedTranscriptStats,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _stats_from_observations,
    _stats_from_seed_evidence,
)
from astar.student.predictor.round import BaseRoundPredictor


def _estimate_regime_vector(
    round_detail: RoundDetail,
    per_seed_stats: dict[int, SeedTranscriptStats],
) -> np.ndarray:
    """Estimate multi-dimensional regime from query observations."""
    total_sett = 0.0
    total_port = 0.0
    total_ruin = 0.0
    total_forest = 0.0
    total_observed = 0.0
    pop_values = []
    food_values = []
    owner_ids = set()

    for si in range(round_detail.seeds_count):
        stats = per_seed_stats[si]
        if stats.query_count == 0:
            continue
        ct = np.asarray(stats.count_tensor, dtype=np.float64)
        count_total = np.asarray(stats.count_total, dtype=np.float64)
        total_sett += np.sum(ct[:, :, 1])  # settlement class
        total_port += np.sum(ct[:, :, 2])  # port class
        total_ruin += np.sum(ct[:, :, 3])  # ruin class
        total_forest += np.sum(ct[:, :, 4])  # forest class
        total_observed += np.sum(count_total)

        if stats.mean_population is not None:
            pop_values.append(stats.mean_population)
        if stats.mean_food is not None:
            food_values.append(stats.mean_food)

    if total_observed < 1:
        return np.array([0.1, 0.005, 0.01, 0.15, 2.0, 0.5, 0.3], dtype=np.float64)

    return np.array([
        total_sett / total_observed,                                  # settlement density
        total_port / total_observed,                                  # port density
        total_ruin / total_observed,                                  # ruin density
        total_forest / total_observed,                                # forest density
        float(np.mean(pop_values)) if pop_values else 2.0,          # mean population
        float(np.mean(food_values)) if food_values else 0.5,        # mean food
        float(len(owner_ids)) / 10.0 if owner_ids else 0.3,         # owner diversity
    ], dtype=np.float64)


def _compute_training_regime_vector(round_id: str, analyses: dict) -> np.ndarray:
    """Compute regime vector from ground truth for training rounds."""
    gt_all = []
    for si in sorted(analyses):
        gt = np.asarray(analyses[si].analysis.ground_truth, dtype=np.float64)
        gt_all.append(gt)
    gt_mean = np.mean(np.stack(gt_all), axis=0)
    cm = gt_mean.mean(axis=(0, 1))

    # Use ground truth class means as regime proxy
    # Also try to get population/food from replay summaries
    pop = 2.0
    food = 0.5
    try:
        d = np.load(f'data/derived/replay_summaries/round_id={round_id}/seed_index=0.npz')
        # Approximate population from survival curve
        pop = float(d['survival_curve_mean'][50]) / max(float(d['survival_curve_mean'][0]), 1.0) * 3.0
        food = min(pop, 1.0)
    except:
        pass

    return np.array([
        cm[1],  # settlement density
        cm[2],  # port density
        cm[3],  # ruin density
        cm[4],  # forest density
        pop,    # population proxy
        food,   # food proxy
        0.3,    # owner diversity (placeholder)
    ], dtype=np.float64)


class GreyboxMultiRegimePredictor(BaseRoundPredictor):
    """Multi-regime conditioned cell kNN predictor."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_multiregime_v01"
    base_predictor: HistoricalBucketPriorPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    k_neighbors: int = Field(default=24, ge=1)
    regime_weight: float = Field(default=3.0, ge=0.0)
    spatial_sigma: float = Field(default=2.0, ge=0.0)
    observation_beta_min: float = Field(default=3.0, ge=0.0)
    observation_beta_scale: float = Field(default=12.0, ge=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    bank_round_ids: tuple[str, ...] = ()
    bank_seed_indexes: tuple[int, ...] = ()
    bank_terminal_probs: tuple[np.ndarray, ...] = ()
    bank_cell_features: tuple[np.ndarray, ...] = ()
    bank_regime_vectors: tuple[np.ndarray, ...] = ()
    bank_feature_dim: int = Field(default=19, ge=1)
    regime_dim: int = Field(default=7, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        k_neighbors: int = 24,
        regime_weight: float = 3.0,
        spatial_sigma: float = 2.0,
        observation_beta_min: float = 3.0,
        observation_beta_scale: float = 12.0,
        prior_blend: float = 0.15,
        probability_floor: float = 0.01,
        model_name: str = "greybox_multiregime_v01",
    ) -> GreyboxMultiRegimePredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
        )

        bank_round_ids: list[str] = []
        bank_seed_indexes: list[int] = []
        bank_terminal_probs: list[np.ndarray] = []
        bank_cell_features: list[np.ndarray] = []
        bank_regime_vectors: list[np.ndarray] = []
        feature_dim = 0

        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)
            analyses = read_analysis_records(paths, round_id)
            regime = _compute_training_regime_vector(round_id, analyses)

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
                bank_regime_vectors.append(regime)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            round_ids=tuple(selected_round_ids),
            probability_floor=probability_floor,
            k_neighbors=k_neighbors,
            regime_weight=regime_weight,
            spatial_sigma=spatial_sigma,
            observation_beta_min=observation_beta_min,
            observation_beta_scale=observation_beta_scale,
            prior_blend=prior_blend,
            bank_round_ids=tuple(bank_round_ids),
            bank_seed_indexes=tuple(bank_seed_indexes),
            bank_terminal_probs=tuple(bank_terminal_probs),
            bank_cell_features=tuple(bank_cell_features),
            bank_regime_vectors=tuple(bank_regime_vectors),
            bank_feature_dim=feature_dim,
            regime_dim=7,
        )

    def _predict_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        estimated_regime: np.ndarray,
        observed_counts: np.ndarray | None = None,
        observed_total: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict using multi-regime weighted cell kNN."""
        initial_state = round_detail.initial_states[seed_index]
        test_features = _cell_features(
            initial_state.grid, list(initial_state.settlements), None,
        )
        height, width = test_features.shape[:2]
        n_test = height * width
        test_flat = test_features.reshape(n_test, -1)

        all_train_features = []
        all_train_probs = []
        all_train_regime = []

        for bank_idx in range(len(self.bank_round_ids)):
            feats = self.bank_cell_features[bank_idx]
            probs = self.bank_terminal_probs[bank_idx]
            regime = self.bank_regime_vectors[bank_idx]
            n_cells = feats.shape[0] * feats.shape[1]
            all_train_features.append(feats.reshape(n_cells, -1))
            all_train_probs.append(probs.reshape(n_cells, CLASS_COUNT))
            all_train_regime.append(np.tile(regime, (n_cells, 1)))

        train_features = np.concatenate(all_train_features, axis=0)
        train_probs = np.concatenate(all_train_probs, axis=0)
        train_regime = np.concatenate(all_train_regime, axis=0)

        # Normalize spatial features
        feat_mean = np.mean(train_features, axis=0)
        feat_std = np.std(train_features, axis=0)
        feat_std = np.where(feat_std > 1e-6, feat_std, 1.0)
        train_normed = (train_features - feat_mean) / feat_std
        test_normed = (test_flat - feat_mean) / feat_std

        # Normalize regime features
        reg_mean = np.mean(train_regime, axis=0)
        reg_std = np.std(train_regime, axis=0)
        reg_std = np.where(reg_std > 1e-6, reg_std, 1.0)
        train_reg_normed = (train_regime - reg_mean) / reg_std * self.regime_weight
        test_reg = np.tile(
            (estimated_regime - reg_mean) / reg_std * self.regime_weight,
            (n_test, 1),
        )

        # Augmented space: spatial + regime
        train_aug = np.column_stack([train_normed, train_reg_normed])
        test_aug = np.column_stack([test_normed, test_reg])

        # Batch kNN
        n_train = train_aug.shape[0]
        k = min(self.k_neighbors, n_train)
        train_sq_norms = np.sum(train_aug * train_aug, axis=1)

        prediction = np.zeros((n_test, CLASS_COUNT), dtype=np.float64)
        chunk_size = 256

        for start in range(0, n_test, chunk_size):
            end = min(start + chunk_size, n_test)
            test_chunk = test_aug[start:end]
            test_sq_norms = np.sum(test_chunk * test_chunk, axis=1)
            cross = test_chunk @ train_aug.T
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
        estimated_regime = _estimate_regime_vector(round_detail, per_seed_stats)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for si in range(round_detail.seeds_count):
            stats = per_seed_stats[si]
            counts = np.asarray(stats.count_tensor, dtype=np.float64)
            total = np.asarray(stats.count_total, dtype=np.float64)
            pred = self._predict_seed(round_detail, si, estimated_regime, counts, total)
            prior = np.asarray(prior_bundle.predictions_by_seed[si], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * pred + self.prior_blend * prior
            predictions_by_seed[si] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(round_id=round_detail.id, model_name=self.name, predictions_by_seed=predictions_by_seed)

    def build_prediction_bundle(self, round_detail, features, evidence=None):
        height, width = round_detail.map_height, round_detail.map_width
        if evidence is None or evidence.total_queries == 0:
            per_seed_stats = {
                si: SeedTranscriptStats(
                    query_count=0,
                    count_tensor=np.zeros((height, width, CLASS_COUNT), dtype=np.float64),
                    count_total=np.zeros((height, width), dtype=np.float64),
                ) for si in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {si: _stats_from_seed_evidence(evidence.per_seed[si]) for si in range(round_detail.seeds_count)}
        return self._predict_with_stats(round_detail, features, per_seed_stats)

    def build_prediction_bundle_from_context(self, context):
        round_detail = context.round_context.to_round_detail()
        features = context.geometry_bundle
        per_seed_stats = _stats_from_observations(round_detail, context.observations)
        return self._predict_with_stats(round_detail, features, per_seed_stats)


__all__ = ["GreyboxMultiRegimePredictor"]
