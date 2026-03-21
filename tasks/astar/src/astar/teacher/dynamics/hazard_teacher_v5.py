"""HazardTeacherV5: Nonlinear terminal decoder with Random Fourier Features.

Key improvements over V2:
- Enhanced v3 feature bank (55 features vs 27)
- Nonlinear decoder using Random Fourier Features (RFF)
- Joint training across ALL cells from ALL training rounds
- Regime coordinates as input features → model learns nonlinear interactions
- Per-class adaptive temperature scaling for better calibration
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients import seed_empirical_terminal_probs
from astar.history.summaries.round_coefficients_v2 import (
    _clip_probabilities,
    round_regime_summary_vector_v2,
)
from astar.history.summaries.round_coefficients_v3 import (
    fit_round_semimechanistic_coefficients_v3,
    seed_feature_dict_v3,
    seed_feature_matrix_v3,
)
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp = np.exp(np.clip(shifted, -25.0, 25.0))
    return np.asarray(exp / np.sum(exp, axis=-1, keepdims=True), dtype=np.float64)


class HazardTeacherV5(BaseModel):
    """Nonlinear terminal decoder using enhanced features + Random Fourier Features.

    The model works in two stages:
    1. Linear regime manifold (same as v2): per-round coefficients → SVD → regime space
    2. Nonlinear RFF decoder: (spatial_features, regime_coords) → terminal probabilities

    The RFF decoder approximates a radial basis function kernel, enabling the model
    to capture nonlinear interactions between geography and round dynamics that the
    linear teacher misses.
    """

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v5"
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    mean_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    latent_rank: int = Field(default=1, ge=1)

    # RFF components
    rff_dim: int = Field(default=512, ge=1)
    rff_random_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((1, 1), dtype=np.float64)
    )
    rff_random_bias: np.ndarray = Field(
        default_factory=lambda: np.zeros(1, dtype=np.float64)
    )
    rff_ridge_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((1, 1), dtype=np.float64)
    )
    input_mean: np.ndarray = Field(
        default_factory=lambda: np.zeros(1, dtype=np.float64)
    )
    input_scale: np.ndarray = Field(
        default_factory=lambda: np.ones(1, dtype=np.float64)
    )
    # Per-class learned temperatures
    class_temperatures: np.ndarray = Field(
        default_factory=lambda: np.ones(5, dtype=np.float64)
    )
    # Linear fallback (v2-style) for blending
    use_linear_blend: bool = Field(default=True)
    linear_blend_weight: float = Field(default=0.3, ge=0.0, le=1.0)

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        latent_rank: int = 3,
        ridge_alpha: float = 1e-2,
        rff_dim: int = 512,
        rff_sigma: float = 1.0,
        rff_ridge_alpha: float = 1.0,
        use_linear_blend: bool = True,
        linear_blend_weight: float = 0.3,
    ) -> HazardTeacherV5:
        replay_episodes = [ep for ep in episodes if ep.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes for hazard teacher v5")

        # Phase 1: Fit per-round v3 coefficients (for regime manifold)
        coefficient_rows = [
            fit_round_semimechanistic_coefficients_v3(ep, ridge_alpha=ridge_alpha)
            for ep in replay_episodes
        ]
        coefficient_bank = np.stack([r.combined_vector() for r in coefficient_rows], axis=0)
        summary_bank = np.stack([r.summary_vector for r in coefficient_rows], axis=0)
        mean_vec = np.mean(coefficient_bank, axis=0)
        centered = coefficient_bank - mean_vec[None, :]
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
        eff_rank = max(1, min(latent_rank, vt.shape[0]))
        basis_mat = np.asarray(vt[:eff_rank], dtype=np.float64)
        coords = np.asarray(centered @ basis_mat.T, dtype=np.float64)

        # Phase 2: Collect all cell-level training data
        all_features: list[np.ndarray] = []
        all_targets: list[np.ndarray] = []
        all_weights: list[np.ndarray] = []

        for round_idx, ep in enumerate(replay_episodes):
            regime_vec = coords[round_idx]
            for seed in ep.seeds:
                empirical = seed_empirical_terminal_probs(seed)
                if empirical is None:
                    continue
                _, feature_stack = seed_feature_matrix_v3(seed.initial_state)
                feature_dict = seed_feature_dict_v3(seed.initial_state)
                fit_mask = (feature_dict["land"] > 0.5) & ~(feature_dict["initial_mountain"] > 0.5)
                if not np.any(fit_mask):
                    continue

                cell_features = feature_stack[:, fit_mask].T  # (n_cells, n_features)
                n_cells = cell_features.shape[0]

                # Concatenate regime coordinates as extra features
                regime_broadcast = np.tile(regime_vec[None, :], (n_cells, 1))
                combined = np.concatenate([cell_features, regime_broadcast], axis=1)

                all_features.append(combined)
                all_targets.append(np.asarray(empirical[fit_mask], dtype=np.float64))

                # Entropy-based sample weights
                clipped = _clip_probabilities(np.asarray(empirical[fit_mask], dtype=np.float64))
                entropy_w = -np.sum(clipped * np.log(clipped), axis=1)
                all_weights.append(np.clip(entropy_w, 1e-3, None))

        if not all_features:
            raise ValueError("no training data collected for v5 teacher")

        X_all = np.concatenate(all_features, axis=0)  # (N, D_spatial + D_regime)
        Y_all = np.concatenate(all_targets, axis=0)   # (N, 5)
        W_all = np.concatenate(all_weights, axis=0)    # (N,)

        # Normalize inputs
        in_mean = np.mean(X_all, axis=0)
        in_scale = np.std(X_all, axis=0)
        in_scale = np.where(in_scale > 1e-6, in_scale, 1.0)
        X_norm = (X_all - in_mean[None, :]) / in_scale[None, :]

        # Phase 3: Generate Random Fourier Features
        input_dim = X_norm.shape[1]
        rng = np.random.RandomState(42)
        W_rff = rng.randn(input_dim, rff_dim).astype(np.float64) / rff_sigma
        b_rff = rng.uniform(0, 2 * np.pi, size=rff_dim).astype(np.float64)

        Z = np.sqrt(2.0 / rff_dim) * np.cos(X_norm @ W_rff + b_rff[None, :])

        # Phase 4: Fit ridge regression from RFF features to log-ratio targets
        base_log = np.log(_clip_probabilities(Y_all[:, 0]))
        n_dynamic_classes = len(_DYNAMIC_CLASS_INDEXES)
        rff_weights_list = []

        for ci, class_idx in enumerate((1, 2, 3, 4)):
            log_ratio = np.log(_clip_probabilities(Y_all[:, class_idx])) - base_log
            sqrt_w = np.sqrt(W_all)
            Z_w = Z * sqrt_w[:, None]
            y_w = log_ratio * sqrt_w
            gram = Z_w.T @ Z_w + rff_ridge_alpha * np.eye(rff_dim, dtype=np.float64)
            rhs_vec = Z_w.T @ y_w
            weights = np.linalg.solve(gram, rhs_vec)
            rff_weights_list.append(weights)

        rff_ridge_w = np.stack(rff_weights_list, axis=1)  # (rff_dim, 4)

        # Phase 5: Learn per-class temperatures from training residuals
        # Compute predicted log-ratios on training data
        predicted_logratios = Z @ rff_ridge_w  # (N, 4)
        base_logit = np.zeros((X_all.shape[0], 1), dtype=np.float64)
        all_logits = np.concatenate([base_logit, predicted_logratios], axis=1)
        predicted_probs = _softmax(all_logits)

        # Optimize temperature per class to minimize weighted cross-entropy
        # Simple grid search over temperatures [0.5, 0.6, ..., 2.0]
        temp_grid = np.arange(0.5, 2.05, 0.1)
        best_temps = np.ones(5, dtype=np.float64)
        for class_idx in range(5):
            best_loss = float("inf")
            for temp in temp_grid:
                # Scale logits for this class
                scaled = all_logits.copy()
                scaled[:, class_idx] = scaled[:, class_idx] / temp
                scaled_probs = _softmax(scaled)
                # Weighted cross-entropy for this class
                target_p = Y_all[:, class_idx]
                pred_p = np.clip(scaled_probs[:, class_idx], 1e-6, 1.0)
                loss = -float(np.sum(W_all * target_p * np.log(pred_p)))
                if loss < best_loss:
                    best_loss = loss
                    best_temps[class_idx] = temp

        return self.model_copy(
            update={
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(r.round_id for r in coefficient_rows),
                "round_numbers": tuple(r.round_number for r in coefficient_rows),
                "summary_bank": summary_bank,
                "coefficient_bank": coefficient_bank,
                "mean_vector": mean_vec,
                "basis": basis_mat,
                "coordinates": coords,
                "latent_rank": eff_rank,
                "rff_dim": rff_dim,
                "rff_random_weights": W_rff,
                "rff_random_bias": b_rff,
                "rff_ridge_weights": rff_ridge_w,
                "input_mean": in_mean,
                "input_scale": in_scale,
                "class_temperatures": best_temps,
                "use_linear_blend": use_linear_blend,
                "linear_blend_weight": linear_blend_weight,
            },
        )

    def regime_vectors_by_round(self) -> dict[str, np.ndarray]:
        return {
            rid: np.asarray(coord, dtype=np.float64)
            for rid, coord in zip(self.round_ids, self.coordinates, strict=True)
        }

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        try:
            idx = self.round_ids.index(episode.metadata.round_id)
        except ValueError:
            row = fit_round_semimechanistic_coefficients_v3(episode)
            centered = row.combined_vector() - self.mean_vector
            return np.asarray(centered @ self.basis.T, dtype=np.float64)
        return np.asarray(self.coordinates[idx], dtype=np.float64)

    def _rff_transform(self, X_norm: np.ndarray) -> np.ndarray:
        """Apply Random Fourier Feature transformation."""
        return np.sqrt(2.0 / self.rff_dim) * np.cos(
            X_norm @ self.rff_random_weights + self.rff_random_bias[None, :]
        )

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        """For backward compatibility with v2-style linear decoding."""
        regime_array = np.asarray(regime, dtype=np.float64)
        if regime_array.ndim != 1 or regime_array.shape[0] != self.latent_rank:
            raise ValueError(f"expected regime dim {self.latent_rank}, got shape {regime_array.shape}")
        return np.asarray(self.mean_vector + regime_array @ self.basis, dtype=np.float64)

    def _linear_decode(self, seed: SeedLike, coefficient_vector: np.ndarray) -> np.ndarray:
        """V2-style linear terminal tensor decoding."""
        from astar.history.summaries.round_coefficients_v3 import seed_feature_dict_v3, seed_feature_matrix_v3

        n_features = len(self.feature_names)
        class_count = 4
        intercepts = coefficient_vector[:class_count]
        coefficients = coefficient_vector[class_count:].reshape(class_count, n_features)

        _, feature_stack = seed_feature_matrix_v3(seed.initial_state)
        feature_dict = seed_feature_dict_v3(seed.initial_state)

        dynamic_logits = (
            intercepts[:, None, None] + np.tensordot(coefficients, feature_stack, axes=(1, 0))
        )
        base_logit = np.zeros(feature_stack.shape[1:], dtype=np.float64)
        logits = np.concatenate([base_logit[None, :, :], dynamic_logits], axis=0)
        probs_5 = np.moveaxis(_softmax(np.moveaxis(logits, 0, -1)), -1, 0)

        height, width = feature_stack.shape[1:]
        probs = np.zeros((height, width, 6), dtype=np.float64)
        probs[:, :, 0] = probs_5[0]
        probs[:, :, 1] = probs_5[1]
        probs[:, :, 2] = probs_5[2]
        probs[:, :, 3] = probs_5[3]
        probs[:, :, 4] = probs_5[4]
        return probs

    def _decode_terminal_tensor_rff(
        self,
        seed: SeedLike,
        regime: np.ndarray,
    ) -> np.ndarray:
        """Nonlinear RFF-based terminal tensor decoding."""
        _, feature_stack = seed_feature_matrix_v3(seed.initial_state)
        feature_dict = seed_feature_dict_v3(seed.initial_state)
        height, width = feature_stack.shape[1:]

        # Flatten spatial features: (n_features, H, W) -> (H*W, n_features)
        flat_features = feature_stack.reshape(feature_stack.shape[0], -1).T

        # Append regime coordinates
        regime_vec = np.asarray(regime, dtype=np.float64)
        regime_broadcast = np.tile(regime_vec[None, :], (flat_features.shape[0], 1))
        X = np.concatenate([flat_features, regime_broadcast], axis=1)

        # Normalize
        X_norm = (X - self.input_mean[None, :]) / self.input_scale[None, :]

        # RFF transform + predict log-ratios
        Z = self._rff_transform(X_norm)
        log_ratios = Z @ self.rff_ridge_weights  # (H*W, 4)

        # Build full logits with temperature scaling
        base_logit = np.zeros((flat_features.shape[0], 1), dtype=np.float64)
        logits = np.concatenate([base_logit, log_ratios], axis=1)

        # Apply per-class temperatures
        logits = logits / self.class_temperatures[None, :]

        # Softmax
        probs_5 = _softmax(logits)  # (H*W, 5)
        probs_5 = probs_5.reshape(height, width, 5)

        # Map to 6-class prediction
        probs = np.zeros((height, width, 6), dtype=np.float64)
        probs[:, :, 0] = probs_5[:, :, 0]
        probs[:, :, 1] = probs_5[:, :, 1]
        probs[:, :, 2] = probs_5[:, :, 2]
        probs[:, :, 3] = probs_5[:, :, 3]
        probs[:, :, 4] = probs_5[:, :, 4]

        # Hard constraints
        ocean = feature_dict["initial_ocean"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5
        soft_mask = ~(ocean | mountain)
        prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
        probs[soft_mask] = 0.98 * probs[soft_mask] + 0.02 * prior
        probs[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        probs[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        sums = np.sum(probs, axis=-1, keepdims=True)
        probs = np.asarray(probs / np.clip(sums, 1e-8, None), dtype=np.float64)

        return probs

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        regime_vec = np.asarray(regime, dtype=np.float64)
        rff_pred = self._decode_terminal_tensor_rff(seed, regime_vec)

        if self.use_linear_blend:
            coeff_vec = self._coefficients_from_regime(regime_vec)
            linear_pred = self._linear_decode(seed, coeff_vec)
            # Get masks for consistent blending
            feature_dict = seed_feature_dict_v3(seed.initial_state)
            ocean = feature_dict["initial_ocean"] > 0.5
            mountain = feature_dict["initial_mountain"] > 0.5
            soft_mask = ~(ocean | mountain)
            # Build blended 6-class prediction
            h, w = rff_pred.shape[:2]
            blended = np.zeros((h, w, 6), dtype=np.float64)
            alpha = self.linear_blend_weight
            blended[soft_mask] = alpha * linear_pred[soft_mask] + (1 - alpha) * rff_pred[soft_mask]
            blended[ocean] = rff_pred[ocean]
            blended[mountain] = rff_pred[mountain]
            sums = np.sum(blended, axis=-1, keepdims=True)
            return np.asarray(blended / np.clip(sums, 1e-8, None), dtype=np.float64)

        return rff_pred

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        if posterior.particles is not None and posterior.weights is not None:
            components = [self.terminal_tensor(seed, p) for p in posterior.particles]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean)

    def round_summary(self, episode: RoundEpisode) -> np.ndarray:
        return round_regime_summary_vector_v2(episode)


# Also support a simpler v3-features-only linear teacher (no RFF) for ablation
class HazardTeacherV5Linear(HazardTeacherV5):
    """Same enhanced v3 features but with pure linear decoding (no RFF).
    Useful for ablation: does the feature improvement alone help?
    """

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)
    name: str = "hazard_teacher_v5_linear"

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        regime_vec = np.asarray(regime, dtype=np.float64)
        coeff_vec = self._coefficients_from_regime(regime_vec)
        pred = self._linear_decode(seed, coeff_vec)
        # Apply hard constraints
        feature_dict = seed_feature_dict_v3(seed.initial_state)
        ocean = feature_dict["initial_ocean"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5
        soft_mask = ~(ocean | mountain)
        prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
        pred[soft_mask] = 0.98 * pred[soft_mask] + 0.02 * prior
        pred[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        pred[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        sums = np.sum(pred, axis=-1, keepdims=True)
        return np.asarray(pred / np.clip(sums, 1e-8, None), dtype=np.float64)


_DYNAMIC_CLASS_INDEXES = (1, 2, 3, 4)

__all__ = ["HazardTeacherV5", "HazardTeacherV5Linear"]
