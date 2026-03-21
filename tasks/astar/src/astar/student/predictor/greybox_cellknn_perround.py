"""Per-Round Cell kNN predictor.

Key improvement over greybox_cellknn_v01: instead of pooling all training cells
into one big kNN bank (which dilutes signal from similar rounds), this predictor:
1. Builds a SEPARATE kNN predictor for each training round
2. Gets a per-round prediction from each round's cells only
3. Weights the per-round predictions by Bayesian round posterior from observations

This avoids the cross-round dilution that made cellknn_v01 score 57 on f1dac
with 7 training rounds vs 76.59 with only 2 training rounds.
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
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.greybox_cellknn import _cell_features, _spatial_smooth
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    _round_ids_with_analyses_and_replays,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor


class GreyboxCellKnnPerRoundPredictor(BaseRoundPredictor):
    """Per-round cell kNN predictor with Bayesian round weighting."""
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_cellknn_perround_v01"
    base_predictor: HistoricalBucketPriorPredictor
    round_ids: tuple[str, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    k_neighbors: int = Field(default=24, ge=1)
    round_weight_scale: float = Field(default=5.0, ge=0.0)
    spatial_sigma: float = Field(default=2.0, ge=0.0)
    observation_beta_min: float = Field(default=3.0, ge=0.0)
    observation_beta_scale: float = Field(default=12.0, ge=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    # Per-round banks
    bank_round_ids: tuple[str, ...] = ()
    bank_seed_indexes: tuple[int, ...] = ()
    bank_terminal_probs: tuple[np.ndarray, ...] = ()  # (H, W, 6) per entry
    bank_cell_features: tuple[np.ndarray, ...] = ()  # (H, W, F) per entry
    bank_feature_dim: int = Field(default=19, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        k_neighbors: int = 24,
        round_weight_scale: float = 5.0,
        spatial_sigma: float = 2.0,
        observation_beta_min: float = 3.0,
        observation_beta_scale: float = 12.0,
        prior_blend: float = 0.15,
        probability_floor: float = 0.01,
        model_name: str = "greybox_cellknn_perround_v01",
    ) -> GreyboxCellKnnPerRoundPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths, round_ids=list(selected_round_ids),
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
                if seed.seed_index not in analyses:
                    continue
                gt = np.asarray(analyses[seed.seed_index].analysis.ground_truth, dtype=np.float64)
                feats = _cell_features(seed.initial_state.grid, list(seed.initial_state.settlements), None)
                feature_dim = feats.shape[-1]
                bank_round_ids.append(round_id)
                bank_seed_indexes.append(seed.seed_index)
                bank_terminal_probs.append(gt)
                bank_cell_features.append(feats)

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

    def _knn_predict_from_round(
        self,
        test_features: np.ndarray,
        round_id: str,
    ) -> np.ndarray:
        """Build per-cell kNN prediction using ONLY cells from one training round."""
        height, width = test_features.shape[:2]
        n_test = height * width
        test_flat = test_features.reshape(n_test, -1)

        # Collect cells from this round only
        round_features = []
        round_probs = []
        for bank_idx in range(len(self.bank_round_ids)):
            if self.bank_round_ids[bank_idx] != round_id:
                continue
            feats = self.bank_cell_features[bank_idx]
            probs = self.bank_terminal_probs[bank_idx]
            n_cells = feats.shape[0] * feats.shape[1]
            round_features.append(feats.reshape(n_cells, -1))
            round_probs.append(probs.reshape(n_cells, CLASS_COUNT))

        if not round_features:
            return np.ones((height, width, CLASS_COUNT), dtype=np.float64) / CLASS_COUNT

        train_features = np.concatenate(round_features, axis=0)
        train_probs = np.concatenate(round_probs, axis=0)
        n_train = train_features.shape[0]

        # Normalize features
        feat_mean = np.mean(train_features, axis=0)
        feat_std = np.std(train_features, axis=0)
        feat_std = np.where(feat_std > 1e-6, feat_std, 1.0)
        train_normed = (train_features - feat_mean) / feat_std
        test_normed = (test_flat - feat_mean) / feat_std

        k = min(self.k_neighbors, n_train)

        # Batch kNN using matrix distance
        train_sq_norms = np.sum(train_normed * train_normed, axis=1)
        prediction = np.zeros((n_test, CLASS_COUNT), dtype=np.float64)

        chunk_size = 256
        for start in range(0, n_test, chunk_size):
            end = min(start + chunk_size, n_test)
            test_chunk = test_normed[start:end]
            test_sq_norms = np.sum(test_chunk * test_chunk, axis=1)
            cross = test_chunk @ train_normed.T
            sq_dists = test_sq_norms[:, None] + train_sq_norms[None, :] - 2.0 * cross
            sq_dists = np.maximum(sq_dists, 0.0)

            for i in range(end - start):
                nearest = np.argpartition(sq_dists[i], k)[:k]
                dists = np.sqrt(sq_dists[i, nearest])
                weights = 1.0 / np.maximum(dists, 1e-4)
                weights /= np.sum(weights)
                prediction[start + i] = np.dot(weights, train_probs[nearest])

        return prediction.reshape(height, width, CLASS_COUNT)

    def _compute_round_weights(
        self,
        observed_counts: np.ndarray,
        observed_total: np.ndarray,
        test_features: np.ndarray | None = None,
    ) -> dict[str, float]:
        """Compute round posterior by comparing each round's kNN PREDICTION
        against observations, not raw terminal probs at same positions.

        This is correct because maps differ between rounds — comparing terminal
        probs at same (y,x) positions is meaningless.
        """
        unique_rounds = sorted(set(self.bank_round_ids))
        observed_mask = observed_total > 0

        if not np.any(observed_mask) or test_features is None:
            n = len(unique_rounds)
            return {r: 1.0 / n for r in unique_rounds}

        obs_cells = observed_counts[observed_mask]  # (N_obs, 6)
        round_log_likes: dict[str, float] = {}

        for round_id in unique_rounds:
            # Build kNN prediction from this round and evaluate at observed cells
            round_pred = self._knn_predict_from_round(test_features, round_id)
            pred_at_obs = np.maximum(round_pred[observed_mask], 1e-8)
            # Multinomial log-likelihood of observed counts under round's prediction
            ll = float(np.sum(obs_cells * np.log(pred_at_obs)))
            round_log_likes[round_id] = ll

        # Scale and softmax
        ll_arr = np.array([round_log_likes[r] for r in unique_rounds])
        ll_arr *= self.round_weight_scale
        ll_arr -= np.max(ll_arr)
        weights = np.exp(ll_arr)
        weights /= np.sum(weights)

        return {r: float(w) for r, w in zip(unique_rounds, weights)}

    def _predict_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        round_weights: dict[str, float],
        observed_counts: np.ndarray | None = None,
        observed_total: np.ndarray | None = None,
        precomputed_features: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict by averaging per-round kNN predictions weighted by round posterior."""
        if precomputed_features is not None:
            test_features = precomputed_features
        else:
            initial_state = round_detail.initial_states[seed_index]
            test_features = _cell_features(
                initial_state.grid,
                list(initial_state.settlements),
                None,
            )
        height, width = test_features.shape[:2]
        unique_rounds = sorted(set(self.bank_round_ids))

        # Get per-round kNN predictions
        prediction = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        for round_id in unique_rounds:
            w = round_weights.get(round_id, 0.0)
            if w < 1e-8:
                continue
            round_pred = self._knn_predict_from_round(test_features, round_id)
            prediction += w * round_pred

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

        # Use first seed's features for round weight computation
        first_initial_state = round_detail.initial_states[0]
        first_features = _cell_features(
            first_initial_state.grid,
            list(first_initial_state.settlements),
            None,
        )
        round_weights = self._compute_round_weights(
            global_obs_counts, global_obs_total, test_features=first_features,
        )

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            initial_state = round_detail.initial_states[seed_index]
            seed_feats = _cell_features(
                initial_state.grid,
                list(initial_state.settlements),
                None,
            )
            knn_pred = self._predict_seed(
                round_detail, seed_index, round_weights,
                per_seed_counts[seed_index], per_seed_total[seed_index],
                precomputed_features=seed_feats,
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * knn_pred + self.prior_blend * prior
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

        # Use first seed for round weight computation
        first_initial_state = round_detail.initial_states[0]
        first_features = _cell_features(
            first_initial_state.grid,
            list(first_initial_state.settlements),
            None,
        )
        round_weights = self._compute_round_weights(
            global_obs_counts, global_obs_total, test_features=first_features,
        )

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            initial_state = round_detail.initial_states[seed_index]
            seed_feats = _cell_features(
                initial_state.grid,
                list(initial_state.settlements),
                None,
            )
            knn_pred = self._predict_seed(
                round_detail, seed_index, round_weights,
                per_seed_counts[seed_index], per_seed_total[seed_index],
                precomputed_features=seed_feats,
            )
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = (1.0 - self.prior_blend) * knn_pred + self.prior_blend * prior
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["GreyboxCellKnnPerRoundPredictor"]
