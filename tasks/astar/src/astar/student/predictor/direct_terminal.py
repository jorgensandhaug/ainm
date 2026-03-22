"""Direct terminal cell predictor.

Instead of a 50-step rollout, directly predicts P(class at year 50)
from cell features + round regime. Trained on actual replay ground
truth terminal tensors.

Key advantages over GLMM rollout:
- No rollout error propagation
- Can use richer features without training-rollout mismatch
- Directly optimizes the terminal prediction objective
- Can use ALL replay data pooled (much more training data per parameter)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
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
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor

_EMPTY_VECTOR = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
_MOUNTAIN_VECTOR = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp_logits = np.exp(np.clip(shifted, -50.0, 50.0))
    return exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)


def _apply_probability_floor(prediction: np.ndarray, floor: float) -> np.ndarray:
    if floor <= 0.0:
        return prediction
    floored = np.maximum(prediction, floor)
    return floored / np.sum(floored, axis=-1, keepdims=True)


def _compute_initial_neighborhood_features(grid: np.ndarray) -> np.ndarray:
    """Compute neighborhood composition from INITIAL grid (no mismatch issue).

    Returns: shape (height, width, 6) - fraction of 1-ring neighbors in each class.
    """
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    height, width = collapsed.shape
    onehot = np.eye(CLASS_COUNT, dtype=np.float64)[collapsed]
    padded = np.pad(onehot, ((1, 1), (1, 1), (0, 0)), mode="constant")
    pad_ones = np.pad(np.ones((height, width), dtype=np.float64), ((1, 1), (1, 1)), mode="constant")
    result = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    nbr_count = np.zeros((height, width), dtype=np.float64)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if dy == 0 and dx == 0:
                continue
            result += padded[1 + dy : height + 1 + dy, 1 + dx : width + 1 + dx]
            nbr_count += pad_ones[1 + dy : height + 1 + dy, 1 + dx : width + 1 + dx]
    result /= np.maximum(nbr_count[..., None], 1.0)
    return result


def _compute_2ring_neighborhood_features(grid: np.ndarray) -> np.ndarray:
    """Compute 2-ring neighborhood composition from initial grid.

    Returns: shape (height, width, 6).
    """
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    height, width = collapsed.shape
    onehot = np.eye(CLASS_COUNT, dtype=np.float64)[collapsed]
    padded = np.pad(onehot, ((2, 2), (2, 2), (0, 0)), mode="constant")
    pad_ones = np.pad(np.ones((height, width), dtype=np.float64), ((2, 2), (2, 2)), mode="constant")
    result = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    nbr_count = np.zeros((height, width), dtype=np.float64)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dy == 0 and dx == 0:
                continue
            result += padded[2 + dy : height + 2 + dy, 2 + dx : width + 2 + dx]
            nbr_count += pad_ones[2 + dy : height + 2 + dy, 2 + dx : width + 2 + dx]
    result /= np.maximum(nbr_count[..., None], 1.0)
    return result


def _build_enriched_feature_stack(initial_state) -> np.ndarray:
    """Build enriched per-cell features from initial state.

    Returns: shape (height, width, n_features) float64.
    """
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    feature_dict = seed_feature_dict(initial_state)
    names = seed_feature_names()
    static_stack = np.stack(
        [np.asarray(feature_dict[name], dtype=np.float64) for name in names],
        axis=-1,
    )

    # 1-ring neighborhood composition from INITIAL grid
    nbr1 = _compute_initial_neighborhood_features(grid)
    # Key 1-ring features: settlement, port, ruin, occupied, forest fractions
    nbr1_features = np.stack([
        nbr1[..., 0],  # empty neighbor fraction
        nbr1[..., 1] + nbr1[..., 2],  # occupied neighbor fraction (settlement+port)
        nbr1[..., 4],  # forest neighbor fraction
    ], axis=-1)

    # 2-ring neighborhood composition
    nbr2 = _compute_2ring_neighborhood_features(grid)
    nbr2_features = np.stack([
        nbr2[..., 0],  # empty in 2-ring
        nbr2[..., 1] + nbr2[..., 2],  # occupied in 2-ring
        nbr2[..., 4],  # forest in 2-ring
    ], axis=-1)

    # Key interaction features (from INITIAL state only - no mismatch)
    coast = np.asarray(feature_dict["coast"], dtype=np.float64)
    buildable = np.asarray(feature_dict["buildable"], dtype=np.float64)
    prox = np.asarray(feature_dict["settlement_proximity"], dtype=np.float64)
    interactions = np.stack([
        coast * prox,  # coast × settlement proximity → port potential
        buildable * prox,  # buildable × proximity → expansion potential
        coast * (nbr1[..., 1] + nbr1[..., 2]),  # coast × occupied neighbors
    ], axis=-1)

    return np.concatenate([static_stack, nbr1_features, nbr2_features, interactions], axis=-1)


def _enriched_feature_names() -> list[str]:
    base = seed_feature_names()
    return base + [
        "nbr1_empty", "nbr1_occupied", "nbr1_forest",
        "nbr2_empty", "nbr2_occupied", "nbr2_forest",
        "coast_x_proximity", "buildable_x_proximity", "coast_x_nbr_occupied",
    ]


def _build_training_data(
    paths: WorkspacePaths,
    *,
    round_ids: list[str],
) -> tuple[list[str], np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Build cell-level training data for direct terminal prediction.

    Returns:
        round_id_list: ordered list of round IDs
        X: shape (N, n_features) - cell features
        Y: shape (N, 6) - terminal class probabilities
        R: shape (N,) int - round index
        masks: shape (N,) bool - which cells are trainable (not ocean/mountain)
    """
    all_features: list[np.ndarray] = []
    all_targets: list[np.ndarray] = []
    all_rounds: list[np.ndarray] = []

    for round_idx, round_id in enumerate(round_ids):
        episode = build_round_episode(paths, round_id)
        for seed in episode.seeds:
            terminal_probs = seed_empirical_terminal_probs(seed)
            if terminal_probs is None:
                continue

            feature_stack = _build_enriched_feature_stack(seed.initial_state)
            grid = np.asarray(seed.initial_state.grid, dtype=np.int64)

            # Mask out ocean and mountain cells (they're deterministic)
            ocean_mask = grid == 10
            mountain_mask = grid == 5
            trainable = ~(ocean_mask | mountain_mask)

            height, width = grid.shape
            flat_features = feature_stack.reshape(-1, feature_stack.shape[-1])
            flat_targets = terminal_probs.reshape(-1, CLASS_COUNT)
            flat_mask = trainable.reshape(-1)

            all_features.append(flat_features[flat_mask])
            all_targets.append(flat_targets[flat_mask])
            all_rounds.append(np.full(int(flat_mask.sum()), round_idx, dtype=np.int32))

    X = np.concatenate(all_features, axis=0).astype(np.float64)
    Y = np.concatenate(all_targets, axis=0).astype(np.float64)
    R = np.concatenate(all_rounds, axis=0).astype(np.int32)
    return round_ids, X, Y, R


def _fit_direct_terminal_model(
    X: np.ndarray,
    Y: np.ndarray,
    R: np.ndarray,
    *,
    n_rounds: int,
    ridge_lambda: float = 0.01,
    learning_rate: float = 0.05,
    max_epochs: int = 100,
    latent_dim: int = 2,
    entropy_weighted: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit a direct terminal predictor with round mixed effects.

    Model: logit(P(class j | x, round r)) = theta · x + u_r_j

    Where u_r_j is a low-rank round effect.

    Returns:
        theta: shape (n_features + 1, 6) - shared weights
        round_biases: shape (n_rounds, 6) - per-round bias terms
        round_latents: shape (n_rounds, latent_dim) - latent codes for regime inference
    """
    n_samples, n_features = X.shape

    # Compute entropy weights (matching scoring metric)
    if entropy_weighted:
        safe_Y = np.clip(Y, 1e-10, 1.0)
        cell_entropy = -np.sum(Y * np.log(safe_Y), axis=-1)
        sample_weights = cell_entropy / np.maximum(np.mean(cell_entropy), 1e-8)
    else:
        sample_weights = np.ones(n_samples, dtype=np.float64)

    # Add intercept
    X_aug = np.concatenate([np.ones((n_samples, 1), dtype=np.float64), X], axis=1)
    n_params = n_features + 1

    # Initialize from marginal
    marginal = np.mean(Y, axis=0)
    marginal = np.clip(marginal, 1e-6, 1.0 - 1e-6)

    theta = np.zeros((n_params, CLASS_COUNT), dtype=np.float64)
    theta[0] = np.log(marginal / marginal[0])  # log-odds relative to class 0

    round_biases = np.zeros((n_rounds, CLASS_COUNT), dtype=np.float64)

    # Adam optimizer
    m_theta = np.zeros_like(theta)
    v_theta = np.zeros_like(theta)
    m_bias = np.zeros_like(round_biases)
    v_bias = np.zeros_like(round_biases)

    best_loss = float("inf")
    stall = 0

    for epoch in range(max_epochs):
        # Forward pass
        logits = X_aug @ theta + round_biases[R]
        probs = _softmax(logits)

        # Weighted cross-entropy loss
        log_probs = np.log(np.clip(probs, 1e-12, 1.0))
        loss = -float(np.sum(sample_weights[:, None] * Y * log_probs)) / float(np.sum(sample_weights))

        # Ridge penalty
        loss += 0.5 * ridge_lambda * float(np.sum(np.square(theta[1:])))
        loss += 0.5 * ridge_lambda * 2.0 * float(np.sum(np.square(round_biases)))

        # Gradient (weighted)
        weighted_error = sample_weights[:, None] * (probs - Y)  # (N, 6)
        w_sum = float(np.sum(sample_weights))
        grad_theta = (X_aug.T @ weighted_error) / w_sum + ridge_lambda * np.vstack([
            np.zeros((1, CLASS_COUNT), dtype=np.float64),
            theta[1:],
        ])

        grad_bias = np.zeros_like(round_biases)
        for r in range(n_rounds):
            mask = R == r
            if np.any(mask):
                r_w = sample_weights[mask]
                r_err = weighted_error[mask]
                grad_bias[r] = np.sum(r_err, axis=0) / np.maximum(np.sum(r_w), 1e-8) + ridge_lambda * 2.0 * round_biases[r]

        # Adam update
        beta1, beta2 = 0.9, 0.999
        t = epoch + 1
        m_theta = beta1 * m_theta + (1 - beta1) * grad_theta
        v_theta = beta2 * v_theta + (1 - beta2) * np.square(grad_theta)
        m_hat_t = m_theta / (1 - beta1**t)
        v_hat_t = v_theta / (1 - beta2**t)
        theta -= learning_rate * m_hat_t / (np.sqrt(v_hat_t) + 1e-8)

        m_bias = beta1 * m_bias + (1 - beta1) * grad_bias
        v_bias = beta2 * v_bias + (1 - beta2) * np.square(grad_bias)
        m_hat_b = m_bias / (1 - beta1**t)
        v_hat_b = v_bias / (1 - beta2**t)
        round_biases -= learning_rate * m_hat_b / (np.sqrt(v_hat_b) + 1e-8)

        if loss + 1e-6 < best_loss:
            best_loss = loss
            stall = 0
        else:
            stall += 1
        if epoch >= 20 and stall >= 10:
            break

    # Extract round latents via SVD on round biases
    centered = round_biases - np.mean(round_biases, axis=0, keepdims=True)
    if latent_dim > 0 and n_rounds > 1:
        _, _, Vt = np.linalg.svd(centered, full_matrices=False)
        dim = min(latent_dim, Vt.shape[0], max(n_rounds - 1, 0))
        if dim > 0:
            basis = Vt[:dim]
            round_latents = centered @ basis.T
        else:
            round_latents = np.zeros((n_rounds, 0), dtype=np.float64)
    else:
        round_latents = np.zeros((n_rounds, 0), dtype=np.float64)

    return theta, round_biases, round_latents


class DirectTerminalPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    checkpoint_npz_path: str
    round_ids: list[str]
    feature_names: list[str]
    ridge_lambda: float
    prediction_floor: float


class DirectTerminalPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "direct_terminal_z2_v001"
    round_ids: tuple[str, ...]
    feature_names: tuple[str, ...]
    theta: np.ndarray  # (n_features+1, 6)
    round_biases: np.ndarray  # (n_rounds, 6)
    round_latents: np.ndarray  # (n_rounds, latent_dim)
    prediction_floor: float = Field(default=5e-4, ge=0.0, lt=1.0)
    ridge_lambda: float = Field(default=0.01, ge=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str = "direct_terminal_z2_v001",
        ridge_lambda: float = 0.01,
        learning_rate: float = 0.05,
        max_epochs: int = 100,
        latent_dim: int = 2,
        prediction_floor: float = 5e-4,
        entropy_weighted: bool = False,
    ) -> DirectTerminalPredictor:
        selected_round_ids = round_ids or sorted(
            path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json")
        )

        round_id_list, X, Y, R = _build_training_data(
            paths, round_ids=selected_round_ids,
        )
        n_rounds = len(round_id_list)

        theta, round_biases, round_latents = _fit_direct_terminal_model(
            X, Y, R,
            n_rounds=n_rounds,
            ridge_lambda=ridge_lambda,
            learning_rate=learning_rate,
            max_epochs=max_epochs,
            latent_dim=latent_dim,
            entropy_weighted=entropy_weighted,
        )

        return cls(
            name=model_name,
            round_ids=tuple(round_id_list),
            feature_names=tuple(_enriched_feature_names()),
            theta=theta.astype(np.float64),
            round_biases=round_biases.astype(np.float64),
            round_latents=round_latents.astype(np.float64),
            prediction_floor=prediction_floor,
            ridge_lambda=ridge_lambda,
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "direct_terminal_predictor.npz"
        json_path = checkpoint_dir / "direct_terminal_predictor.json"
        np.savez_compressed(
            npz_path,
            theta=self.theta,
            round_biases=self.round_biases,
            round_latents=self.round_latents,
        )
        json_path.write_text(
            json.dumps(to_jsonable(DirectTerminalPredictorCheckpoint(
                name=self.name,
                checkpoint_npz_path=str(npz_path),
                round_ids=list(self.round_ids),
                feature_names=list(self.feature_names),
                ridge_lambda=self.ridge_lambda,
                prediction_floor=self.prediction_floor,
            )), indent=2),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> DirectTerminalPredictor:
        checkpoint = DirectTerminalPredictorCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8")
        )
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        return cls(
            name=checkpoint.name,
            round_ids=tuple(checkpoint.round_ids),
            feature_names=tuple(checkpoint.feature_names),
            theta=np.asarray(arrays["theta"], dtype=np.float64),
            round_biases=np.asarray(arrays["round_biases"], dtype=np.float64),
            round_latents=np.asarray(arrays["round_latents"], dtype=np.float64),
            prediction_floor=checkpoint.prediction_floor,
            ridge_lambda=checkpoint.ridge_lambda,
        )

    def _predict_seed(self, initial_state, round_bias: np.ndarray) -> np.ndarray:
        """Predict terminal tensor for one seed."""
        grid = np.asarray(initial_state.grid, dtype=np.int64)
        feature_stack = _build_enriched_feature_stack(initial_state)
        height, width = grid.shape

        flat_features = feature_stack.reshape(-1, feature_stack.shape[-1])
        X_aug = np.concatenate([
            np.ones((flat_features.shape[0], 1), dtype=np.float64),
            flat_features,
        ], axis=1)

        logits = X_aug @ self.theta + round_bias[None, :]
        probs = _softmax(logits).reshape(height, width, CLASS_COUNT)

        # Hard constraints
        ocean_mask = grid == 10
        mountain_mask = grid == 5
        if np.any(ocean_mask):
            probs[ocean_mask] = _EMPTY_VECTOR
        if np.any(mountain_mask):
            probs[mountain_mask] = _MOUNTAIN_VECTOR

        return _apply_probability_floor(probs, self.prediction_floor)

    def _candidate_seed_tensors(self, round_detail: RoundDetail) -> np.ndarray:
        """Compute predicted tensors for each candidate round bias."""
        return np.stack([
            np.stack([
                self._predict_seed(initial_state, bias)
                for initial_state in round_detail.initial_states
            ], axis=0)
            for bias in self.round_biases
        ], axis=0)

    def _observation_log_likelihood(
        self,
        candidate_seed_tensors: np.ndarray,
        observation,
    ) -> np.ndarray:
        collapsed = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
        viewport = observation.viewport
        patch = candidate_seed_tensors[
            :,
            observation.seed_index,
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
            :,
        ]
        flat_patch = patch.reshape(patch.shape[0], -1, CLASS_COUNT)
        flat_classes = collapsed.reshape(-1)
        chosen = np.take_along_axis(
            flat_patch,
            flat_classes[None, :, None],
            axis=-1,
        )[:, :, 0]
        return np.sum(np.log(np.clip(chosen, self.prediction_floor, 1.0)), axis=1)

    def _posterior_weights(
        self,
        candidate_seed_tensors: np.ndarray,
        observations: tuple,
    ) -> np.ndarray:
        n_candidates = candidate_seed_tensors.shape[0]
        if n_candidates <= 1:
            return np.ones((n_candidates,), dtype=np.float64)
        log_weights = np.zeros(n_candidates, dtype=np.float64)
        for obs in observations:
            log_weights += self._observation_log_likelihood(candidate_seed_tensors, obs)
        max_lw = float(np.max(log_weights))
        weights = np.exp(log_weights - max_lw)
        return weights / np.sum(weights)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        candidate_tensors = self._candidate_seed_tensors(round_detail)
        posterior_weights = self._posterior_weights(candidate_tensors, context.observations)

        # Posterior-weighted average of candidate tensors
        mixed = np.tensordot(posterior_weights, candidate_tensors, axes=(0, 0))
        normalized = _apply_probability_floor(mixed, self.prediction_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: normalized[seed_index]
                for seed_index in range(normalized.shape[0])
            },
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        # Prior: uniform over candidate biases
        candidate_tensors = self._candidate_seed_tensors(round_detail)
        n = candidate_tensors.shape[0]
        weights = np.full(n, 1.0 / n, dtype=np.float64)
        mixed = np.tensordot(weights, candidate_tensors, axes=(0, 0))
        normalized = _apply_probability_floor(mixed, self.prediction_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: normalized[seed_index]
                for seed_index in range(normalized.shape[0])
            },
        )


__all__ = ["DirectTerminalPredictor", "DirectTerminalPredictorCheckpoint"]
