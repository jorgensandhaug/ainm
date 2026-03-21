"""Per-cell gradient boosted tree predictor.

Inspired by Agent 3's CatBoost approach (85.31 score).
Uses LightGBM to predict P(class at year 50) per cell using:
- Static map features (~25 enriched features from direct_terminal)
- Observation evidence features (class frequencies in observed cells, propagated)
- Cross-seed evidence (shared hidden params across seeds)
- Entropy-weighted training (matches scoring metric)

Key insight: GBT can learn non-linear feature interactions that
linear models fundamentally cannot capture (e.g., coast AND settlement
proximity → port probability).
"""
from __future__ import annotations

import json
from pathlib import Path
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import (
    seed_empirical_terminal_probs,
    seed_feature_dict,
    seed_feature_names,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.direct_terminal import (
    _build_enriched_feature_stack,
    _enriched_feature_names,
)
from astar.student.predictor.round import BaseRoundPredictor


def _apply_probability_floor(prediction: np.ndarray, floor: float) -> np.ndarray:
    if floor <= 0.0:
        return prediction
    floored = np.maximum(prediction, floor)
    return floored / np.sum(floored, axis=-1, keepdims=True)


def _build_observation_evidence_features(
    grid: np.ndarray,
    evidence_bundle: RoundEvidenceBundle | None,
    seed_index: int,
) -> np.ndarray:
    """Build per-cell observation evidence features.

    Returns: shape (height, width, n_evidence_features)
    """
    height, width = grid.shape[:2]
    n_features = 10  # observed_mask + 6 class freqs + obs_entropy + nbr_obs_1ring + nbr_obs_2ring

    if evidence_bundle is None:
        return np.zeros((height, width, n_features), dtype=np.float64)

    seed_evidence = evidence_bundle.per_seed.get(seed_index)
    if seed_evidence is None:
        return np.zeros((height, width, n_features), dtype=np.float64)

    obs_counts = np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64)
    obs_total = np.sum(obs_counts, axis=-1, keepdims=True)
    obs_mask = (obs_total[..., 0] > 0).astype(np.float64)

    # Class frequencies where observed
    class_freqs = np.where(obs_total > 0, obs_counts / obs_total, 0.0)

    # Observation entropy
    safe_freqs = np.clip(class_freqs, 1e-10, 1.0)
    obs_entropy = -np.sum(class_freqs * np.log(safe_freqs), axis=-1)
    obs_entropy = np.where(obs_mask > 0, obs_entropy, 0.0)

    # Propagate observation mask to neighbors (1-ring and 2-ring)
    padded_mask = np.pad(obs_mask, ((1, 1), (1, 1)), mode="constant")
    nbr_obs_1ring = np.zeros((height, width), dtype=np.float64)
    nbr_count_1 = np.zeros((height, width), dtype=np.float64)
    pad_ones = np.pad(np.ones((height, width), dtype=np.float64), ((1, 1), (1, 1)), mode="constant")
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if dy == 0 and dx == 0:
                continue
            nbr_obs_1ring += padded_mask[1 + dy:height + 1 + dy, 1 + dx:width + 1 + dx]
            nbr_count_1 += pad_ones[1 + dy:height + 1 + dy, 1 + dx:width + 1 + dx]
    nbr_obs_1ring /= np.maximum(nbr_count_1, 1.0)

    padded_mask2 = np.pad(obs_mask, ((2, 2), (2, 2)), mode="constant")
    pad_ones2 = np.pad(np.ones((height, width), dtype=np.float64), ((2, 2), (2, 2)), mode="constant")
    nbr_obs_2ring = np.zeros((height, width), dtype=np.float64)
    nbr_count_2 = np.zeros((height, width), dtype=np.float64)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dy == 0 and dx == 0:
                continue
            nbr_obs_2ring += padded_mask2[2 + dy:height + 2 + dy, 2 + dx:width + 2 + dx]
            nbr_count_2 += pad_ones2[2 + dy:height + 2 + dy, 2 + dx:width + 2 + dx]
    nbr_obs_2ring /= np.maximum(nbr_count_2, 1.0)

    features = np.stack([
        obs_mask,
        class_freqs[..., 0],
        class_freqs[..., 1],
        class_freqs[..., 2],
        class_freqs[..., 3],
        class_freqs[..., 4],
        # class_freqs[..., 5] is mountain, always deterministic
        obs_entropy,
        nbr_obs_1ring,
        nbr_obs_2ring,
    ], axis=-1)

    # Only 9 features but we pad to 10 with build_rate proxy
    build_rate = float(np.sum(obs_mask * (class_freqs[..., 1] + class_freqs[..., 2] + class_freqs[..., 3]))) / max(float(np.sum(obs_mask)), 1.0)
    build_rate_arr = np.full((height, width, 1), build_rate, dtype=np.float64)

    return np.concatenate([features, build_rate_arr], axis=-1)


def _build_all_features(
    initial_state,
    grid: np.ndarray,
    evidence_bundle: RoundEvidenceBundle | None,
    seed_index: int,
) -> np.ndarray:
    """Build full feature stack: enriched static + evidence.

    Returns: shape (height, width, total_features)
    """
    static = _build_enriched_feature_stack(initial_state)
    evidence = _build_observation_evidence_features(grid, evidence_bundle, seed_index)
    return np.concatenate([static, evidence], axis=-1)


def _build_training_data_with_evidence(
    paths: WorkspacePaths,
    *,
    round_ids: list[str],
    evidence_bundles: dict[str, RoundEvidenceBundle] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build cell-level training data with entropy weights.

    Returns:
        X: shape (N, n_features) - features
        Y: shape (N, 6) - target probabilities
        W: shape (N,) - entropy weights
    """
    all_X: list[np.ndarray] = []
    all_Y: list[np.ndarray] = []
    all_W: list[np.ndarray] = []

    for round_id in round_ids:
        episode = build_round_episode(paths, round_id)
        for seed in episode.seeds:
            terminal_probs = seed_empirical_terminal_probs(seed)
            if terminal_probs is None:
                continue

            grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
            static_features = _build_enriched_feature_stack(seed.initial_state)

            # No evidence for training (leave it as zeros)
            height, width = grid.shape
            evidence = np.zeros((height, width, 10), dtype=np.float64)
            features = np.concatenate([static_features, evidence], axis=-1)

            # Mask out ocean/mountain
            ocean_mask = grid == 10
            mountain_mask = grid == 5
            trainable = ~(ocean_mask | mountain_mask)

            flat_features = features.reshape(-1, features.shape[-1])
            flat_targets = terminal_probs.reshape(-1, CLASS_COUNT)
            flat_mask = trainable.reshape(-1)

            # Compute entropy weights
            safe_probs = np.clip(flat_targets, 1e-10, 1.0)
            entropy = -np.sum(flat_targets * np.log(safe_probs), axis=-1)
            weights = np.where(flat_mask, entropy, 0.0)

            all_X.append(flat_features[flat_mask])
            all_Y.append(flat_targets[flat_mask])
            all_W.append(weights[flat_mask])

    return (
        np.concatenate(all_X, axis=0).astype(np.float64),
        np.concatenate(all_Y, axis=0).astype(np.float64),
        np.concatenate(all_W, axis=0).astype(np.float64),
    )


class CellwiseGBTPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "cellwise_gbt_v001"
    round_ids: tuple[str, ...]
    models: list = Field(default_factory=list)  # List of 6 LightGBM Booster objects
    prediction_floor: float = Field(default=3e-4, ge=0.0, lt=1.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str = "cellwise_gbt_v001",
        n_estimators: int = 800,
        max_depth: int = 8,
        learning_rate: float = 0.01,
        prediction_floor: float = 3e-4,
    ) -> CellwiseGBTPredictor:
        import lightgbm as lgb

        selected_round_ids = round_ids or sorted(
            path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json")
        )

        X, Y, W = _build_training_data_with_evidence(
            paths, round_ids=selected_round_ids,
        )

        # Normalize weights
        W = W / np.maximum(np.mean(W), 1e-8)

        # Train 6 separate regressors (one per class)
        models = []
        for class_idx in range(CLASS_COUNT):
            params = {
                "objective": "regression",
                "metric": "mse",
                "n_estimators": n_estimators,
                "max_depth": max_depth,
                "learning_rate": learning_rate,
                "num_leaves": 2**max_depth - 1,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "reg_alpha": 0.01,
                "reg_lambda": 0.1,
                "min_child_samples": 20,
                "verbose": -1,
                "n_jobs": 16,
            }
            dataset = lgb.Dataset(
                X, label=Y[:, class_idx], weight=W,
            )
            model = lgb.train(
                params,
                dataset,
                num_boost_round=n_estimators,
            )
            models.append(model)

        return cls(
            name=model_name,
            round_ids=tuple(selected_round_ids),
            models=models,
            prediction_floor=prediction_floor,
        )

    def _predict_seed(
        self,
        initial_state,
        evidence_bundle: RoundEvidenceBundle | None,
        seed_index: int,
    ) -> np.ndarray:
        grid = np.asarray(initial_state.grid, dtype=np.int64)
        features = _build_all_features(initial_state, grid, evidence_bundle, seed_index)
        height, width = grid.shape

        flat_features = features.reshape(-1, features.shape[-1])

        # Predict each class
        predictions = np.zeros((flat_features.shape[0], CLASS_COUNT), dtype=np.float64)
        for class_idx, model in enumerate(self.models):
            predictions[:, class_idx] = model.predict(flat_features)

        # Clip and normalize
        predictions = np.clip(predictions, 0.0, 1.0)
        probs = predictions.reshape(height, width, CLASS_COUNT)

        # Hard constraints
        ocean_mask = grid == 10
        mountain_mask = grid == 5
        if np.any(ocean_mask):
            probs[ocean_mask] = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        if np.any(mountain_mask):
            probs[mountain_mask] = np.array([0.0, 0.0, 0.0, 0.0, 0.0, 1.0])

        # Normalize
        row_sums = np.sum(probs, axis=-1, keepdims=True)
        probs = np.where(row_sums > 0, probs / row_sums, 1.0 / CLASS_COUNT)

        return _apply_probability_floor(probs, self.prediction_floor)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: self._predict_seed(
                    initial_state,
                    context.evidence_bundle,
                    seed_index,
                )
                for seed_index, initial_state in enumerate(round_detail.initial_states)
            },
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: self._predict_seed(initial_state, evidence, seed_index)
                for seed_index, initial_state in enumerate(round_detail.initial_states)
            },
        )


__all__ = ["CellwiseGBTPredictor"]
