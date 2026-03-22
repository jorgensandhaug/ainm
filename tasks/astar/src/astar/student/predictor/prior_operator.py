"""Prior-Operator Predictor.

Inspired by Agent 7's operator manifold approach (87.36 score).

Key insight: instead of predicting terminal probabilities from scratch,
learn a per-round LINEAR OPERATOR that corrects the historical bucket
prior's predictions. The operator maps:

  (prior_logits, cell_features) → corrected_logits

This lets the model learn WHEN and HOW to override the prior on a
per-cell basis, which is more efficient than learning everything
from scratch.

Architecture:
1. Fit the bucket prior for each training fold (already have this)
2. For each training round, fit a correction operator:
   input = concat(prior_logits, cell_features)  → output = target_logits - prior_logits
3. Compress per-round operators via SVD into a low-rank manifold
4. At test time: infer round from observations, decode operator, apply correction
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import (
    seed_empirical_terminal_probs,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.direct_terminal import (
    _build_enriched_feature_stack,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor

_EMPTY_VECTOR = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
_MOUNTAIN_VECTOR = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)


def _safe_logit(probs: np.ndarray) -> np.ndarray:
    """Convert probabilities to logits (log-odds relative to class 0)."""
    clipped = np.clip(probs, 1e-8, 1.0 - 1e-8)
    # Use log-ratios relative to class 0
    return np.log(clipped / np.maximum(clipped[..., 0:1], 1e-8))


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp_logits = np.exp(np.clip(shifted, -50.0, 50.0))
    return exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)


def _apply_probability_floor(prediction: np.ndarray, floor: float) -> np.ndarray:
    if floor <= 0.0:
        return prediction
    floored = np.maximum(prediction, floor)
    return floored / np.sum(floored, axis=-1, keepdims=True)


def _fit_round_operator(
    X: np.ndarray,
    Y_delta: np.ndarray,
    W: np.ndarray,
    *,
    ridge_lambda: float,
) -> np.ndarray:
    """Fit a linear operator: X → Y_delta (weighted by W).

    Returns: theta shape (n_features+1, 6)
    """
    n, d = X.shape
    X_aug = np.concatenate([np.ones((n, 1), dtype=np.float64), X], axis=1)
    W_diag = W / np.maximum(np.mean(W), 1e-8)

    # Weighted ridge regression for each output class
    theta = np.zeros((d + 1, CLASS_COUNT), dtype=np.float64)
    WX = X_aug * W_diag[:, None]
    XtWX = WX.T @ X_aug
    penalty = ridge_lambda * np.eye(d + 1, dtype=np.float64)
    penalty[0, 0] = 0.0  # don't penalize intercept
    A = XtWX + penalty

    for j in range(CLASS_COUNT):
        XtWy = WX.T @ Y_delta[:, j]
        theta[:, j] = np.linalg.solve(A, XtWy)

    return theta


class PriorOperatorPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "prior_operator_z2_v001"
    round_ids: tuple[str, ...]
    mean_operator: np.ndarray  # (n_features+1, 6)
    round_operators: np.ndarray  # (n_rounds, n_features+1, 6)
    latent_basis: np.ndarray  # (latent_dim, flat_dim)
    round_latents: np.ndarray  # (n_rounds, latent_dim)
    bucket_prior_predictor: HistoricalBucketPriorPredictor
    prediction_floor: float = Field(default=3e-4, ge=0.0, lt=1.0)
    ridge_lambda: float = Field(default=0.1, ge=0.0)
    latent_dim: int = Field(default=2, ge=0)
    candidate_tensor_cache: dict[str, np.ndarray] = Field(default_factory=dict, exclude=True)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        bucket_prior: HistoricalBucketPriorPredictor,
        model_name: str = "prior_operator_z2_v001",
        ridge_lambda: float = 0.1,
        latent_dim: int = 2,
        prediction_floor: float = 3e-4,
    ) -> PriorOperatorPredictor:
        selected_round_ids = round_ids or sorted(
            path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json")
        )

        # For each training round, fit a correction operator
        round_operators: list[np.ndarray] = []
        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)

            all_X: list[np.ndarray] = []
            all_delta: list[np.ndarray] = []
            all_W: list[np.ndarray] = []

            for seed in episode.seeds:
                terminal_probs = seed_empirical_terminal_probs(seed)
                if terminal_probs is None:
                    continue

                grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
                static_features = _build_enriched_feature_stack(seed.initial_state)

                # Get bucket prior prediction for this seed
                prior_pred = bucket_prior._seed_prediction(seed.initial_state)
                prior_logits = _safe_logit(prior_pred)

                # Target logits
                target_logits = _safe_logit(terminal_probs)

                # Delta = target - prior (what the operator should predict)
                delta = target_logits - prior_logits

                # Concatenate prior logits with static features as input
                height, width = grid.shape
                full_features = np.concatenate([
                    prior_logits,
                    static_features,
                ], axis=-1)

                # Mask out ocean/mountain
                ocean_mask = grid == 10
                mountain_mask = grid == 5
                trainable = ~(ocean_mask | mountain_mask)

                flat_features = full_features.reshape(-1, full_features.shape[-1])
                flat_delta = delta.reshape(-1, CLASS_COUNT)
                flat_mask = trainable.reshape(-1)

                # Entropy weights
                safe_tp = np.clip(terminal_probs, 1e-10, 1.0)
                entropy = -np.sum(terminal_probs * np.log(safe_tp), axis=-1)
                flat_entropy = entropy.reshape(-1)

                all_X.append(flat_features[flat_mask])
                all_delta.append(flat_delta[flat_mask])
                all_W.append(flat_entropy[flat_mask])

            if not all_X:
                round_operators.append(np.zeros((1, CLASS_COUNT), dtype=np.float64))
                continue

            X = np.concatenate(all_X, axis=0)
            Y = np.concatenate(all_delta, axis=0)
            W = np.concatenate(all_W, axis=0)

            theta = _fit_round_operator(X, Y, W, ridge_lambda=ridge_lambda)
            round_operators.append(theta)

        round_operators_arr = np.stack(round_operators, axis=0)

        # Compress via SVD
        mean_op = np.mean(round_operators_arr, axis=0)
        flat_ops = round_operators_arr.reshape(len(selected_round_ids), -1)
        flat_mean = mean_op.reshape(1, -1)
        centered = flat_ops - flat_mean

        if latent_dim > 0 and len(selected_round_ids) > 1:
            _, _, Vt = np.linalg.svd(centered, full_matrices=False)
            dim = min(latent_dim, Vt.shape[0], max(len(selected_round_ids) - 1, 0))
            if dim > 0:
                basis = Vt[:dim]
                round_latents = centered @ basis.T
            else:
                basis = np.zeros((0, flat_ops.shape[1]), dtype=np.float64)
                round_latents = np.zeros((len(selected_round_ids), 0), dtype=np.float64)
        else:
            basis = np.zeros((0, flat_ops.shape[1]), dtype=np.float64)
            round_latents = np.zeros((len(selected_round_ids), 0), dtype=np.float64)

        return cls(
            name=model_name,
            round_ids=tuple(selected_round_ids),
            mean_operator=mean_op.astype(np.float64),
            round_operators=round_operators_arr.astype(np.float64),
            latent_basis=basis.astype(np.float64),
            round_latents=round_latents.astype(np.float64),
            bucket_prior_predictor=bucket_prior,
            prediction_floor=prediction_floor,
            ridge_lambda=ridge_lambda,
            latent_dim=latent_dim,
        )

    def _predict_seed_with_operator(
        self,
        initial_state,
        operator: np.ndarray,
    ) -> np.ndarray:
        grid = np.asarray(initial_state.grid, dtype=np.int64)
        static_features = _build_enriched_feature_stack(initial_state)
        prior_pred = self.bucket_prior_predictor._seed_prediction(initial_state)
        prior_logits = _safe_logit(prior_pred)

        height, width = grid.shape
        full_features = np.concatenate([prior_logits, static_features], axis=-1)
        flat_features = full_features.reshape(-1, full_features.shape[-1])

        # Apply operator: delta = [1, features] @ operator
        X_aug = np.concatenate([
            np.ones((flat_features.shape[0], 1), dtype=np.float64),
            flat_features,
        ], axis=1)
        delta_logits = X_aug @ operator
        corrected_logits = _safe_logit(prior_pred).reshape(-1, CLASS_COUNT) + delta_logits
        corrected_probs = _softmax(corrected_logits).reshape(height, width, CLASS_COUNT)

        # Hard constraints
        ocean_mask = grid == 10
        mountain_mask = grid == 5
        if np.any(ocean_mask):
            corrected_probs[ocean_mask] = _EMPTY_VECTOR
        if np.any(mountain_mask):
            corrected_probs[mountain_mask] = _MOUNTAIN_VECTOR

        return _apply_probability_floor(corrected_probs, self.prediction_floor)

    def _candidate_seed_tensors(self, round_detail: RoundDetail) -> np.ndarray:
        cached = self.candidate_tensor_cache.get(round_detail.id)
        if cached is not None:
            return cached
        tensors = np.stack([
            np.stack([
                self._predict_seed_with_operator(initial_state, op)
                for initial_state in round_detail.initial_states
            ], axis=0)
            for op in self.round_operators
        ], axis=0)
        self.candidate_tensor_cache[round_detail.id] = tensors
        return tensors

    def _observation_log_likelihood(
        self,
        candidate_seed_tensors: np.ndarray,
        observation,
    ) -> np.ndarray:
        collapsed = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
        viewport = observation.viewport
        patch = candidate_seed_tensors[
            :, observation.seed_index,
            viewport.y:viewport.y + viewport.h,
            viewport.x:viewport.x + viewport.w, :,
        ]
        flat_patch = patch.reshape(patch.shape[0], -1, CLASS_COUNT)
        flat_classes = collapsed.reshape(-1)
        chosen = np.take_along_axis(
            flat_patch, flat_classes[None, :, None], axis=-1,
        )[:, :, 0]
        return np.sum(np.log(np.clip(chosen, self.prediction_floor, 1.0)), axis=1)

    def _posterior_weights(
        self,
        candidate_seed_tensors: np.ndarray,
        observations: tuple,
    ) -> np.ndarray:
        n = candidate_seed_tensors.shape[0]
        if n <= 1:
            return np.ones((n,), dtype=np.float64)
        log_w = np.zeros(n, dtype=np.float64)
        for obs in observations:
            log_w += self._observation_log_likelihood(candidate_seed_tensors, obs)
        max_lw = float(np.max(log_w))
        w = np.exp(log_w - max_lw)
        return w / np.sum(w)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        candidate_tensors = self._candidate_seed_tensors(round_detail)
        posterior = self._posterior_weights(candidate_tensors, context.observations)

        # Posterior-weighted operator
        posterior_op_flat = posterior @ self.round_operators.reshape(len(self.round_ids), -1)
        posterior_op = posterior_op_flat.reshape(self.mean_operator.shape)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_idx: self._predict_seed_with_operator(state, posterior_op)
                for seed_idx, state in enumerate(round_detail.initial_states)
            },
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        # Prior: use mean operator
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_idx: self._predict_seed_with_operator(state, self.mean_operator)
                for seed_idx, state in enumerate(round_detail.initial_states)
            },
        )


__all__ = ["PriorOperatorPredictor"]
