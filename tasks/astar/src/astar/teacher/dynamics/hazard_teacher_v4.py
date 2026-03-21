from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients_v2 import (
    fit_round_semimechanistic_coefficients_v2,
    round_regime_summary_vector_v2,
    seed_feature_dict_v2,
    seed_feature_matrix_v2,
)
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp = np.exp(np.clip(shifted, -25.0, 25.0))
    return np.asarray(exp / np.sum(exp, axis=-1, keepdims=True), dtype=np.float64)


class HazardTeacherV4(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v4"
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    block_means: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    block_bases: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1, 1), dtype=np.float64))
    block_coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0, 1), dtype=np.float64))
    block_reconstruction_rmse: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    total_reconstruction_rmse: float = 0.0
    block_rank: int = Field(default=1, ge=1)
    latent_dimension: int = Field(default=1, ge=1)
    coefficient_ridge_alpha: float = Field(default=1e-2, gt=0.0)

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        block_rank: int = 2,
        ridge_alpha: float = 1e-2,
    ) -> HazardTeacherV4:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for hazard teacher v4")

        coefficient_rows = [
            fit_round_semimechanistic_coefficients_v2(episode, ridge_alpha=ridge_alpha)
            for episode in replay_episodes
        ]
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
        summary_bank = np.stack([row.summary_vector for row in coefficient_rows], axis=0)

        class_count = len(coefficient_rows[0].dynamic_class_indexes)
        feature_dim = len(coefficient_rows[0].feature_names)
        block_width = 1 + feature_dim
        coefficient_tensor = coefficient_bank.reshape(coefficient_bank.shape[0], class_count, block_width)
        block_means = np.mean(coefficient_tensor, axis=0)

        basis_rows: list[np.ndarray] = []
        coordinate_rows: list[np.ndarray] = []
        block_rmses: list[float] = []
        for class_index in range(class_count):
            block_matrix = coefficient_tensor[:, class_index, :]
            centered_block = block_matrix - block_means[class_index][None, :]
            _, _, vt_block = np.linalg.svd(centered_block, full_matrices=False)
            effective_rank = max(1, min(block_rank, vt_block.shape[0]))
            basis = np.asarray(vt_block[:effective_rank], dtype=np.float64)
            coordinates = np.asarray(centered_block @ basis.T, dtype=np.float64)
            reconstruction = block_means[class_index][None, :] + coordinates @ basis
            basis_rows.append(basis)
            coordinate_rows.append(coordinates)
            block_rmses.append(float(np.sqrt(np.mean((block_matrix - reconstruction) ** 2))))

        block_bases = np.stack(basis_rows, axis=0)
        block_coordinates = np.stack(coordinate_rows, axis=1)
        flattened_coordinates = block_coordinates.reshape(block_coordinates.shape[0], -1)
        reconstruction = np.zeros_like(coefficient_tensor)
        for class_index in range(class_count):
            reconstruction[:, class_index, :] = (
                block_means[class_index][None, :]
                + block_coordinates[:, class_index, :] @ block_bases[class_index]
            )
        total_reconstruction_rmse = float(
            np.sqrt(np.mean((coefficient_tensor - reconstruction) ** 2)),
        )

        return self.model_copy(
            update={
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "summary_bank": summary_bank,
                "coefficient_bank": coefficient_bank,
                "block_means": block_means.astype(np.float64),
                "block_bases": block_bases.astype(np.float64),
                "block_coordinates": block_coordinates.astype(np.float64),
                "block_reconstruction_rmse": np.asarray(block_rmses, dtype=np.float64),
                "total_reconstruction_rmse": total_reconstruction_rmse,
                "block_rank": int(block_bases.shape[1]),
                "latent_dimension": int(flattened_coordinates.shape[1]),
                "coefficient_ridge_alpha": float(ridge_alpha),
            },
        )

    def regime_vectors_by_round(self) -> dict[str, np.ndarray]:
        flattened = self.block_coordinates.reshape(self.block_coordinates.shape[0], -1)
        return {
            round_id: np.asarray(vector, dtype=np.float64)
            for round_id, vector in zip(self.round_ids, flattened, strict=True)
        }

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        try:
            round_index = self.round_ids.index(episode.metadata.round_id)
        except ValueError:
            coefficient_row = fit_round_semimechanistic_coefficients_v2(
                episode,
                ridge_alpha=self.coefficient_ridge_alpha,
            )
            class_count = self.block_means.shape[0]
            block_width = self.block_means.shape[1]
            coefficient_tensor = coefficient_row.combined_vector().reshape(class_count, block_width)
            coordinates: list[np.ndarray] = []
            for class_index in range(class_count):
                centered_block = coefficient_tensor[class_index] - self.block_means[class_index]
                coordinates.append(centered_block @ self.block_bases[class_index].T)
            return np.concatenate(coordinates, axis=0).astype(np.float64)
        return np.asarray(self.block_coordinates[round_index].reshape(-1), dtype=np.float64)

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        regime_array = np.asarray(regime, dtype=np.float64)
        if regime_array.ndim != 1:
            raise ValueError(f"expected 1D regime vector, got shape {regime_array.shape!r}")
        if regime_array.shape[0] != self.latent_dimension:
            raise ValueError(f"expected regime dim {self.latent_dimension}, got {regime_array.shape[0]}")

        class_count = self.block_means.shape[0]
        block_coords = regime_array.reshape(class_count, self.block_rank)
        reconstructed = np.zeros_like(self.block_means)
        for class_index in range(class_count):
            reconstructed[class_index] = (
                self.block_means[class_index]
                + block_coords[class_index] @ self.block_bases[class_index]
            )
        return np.asarray(reconstructed.reshape(-1), dtype=np.float64)

    def _split_coefficients(self, coefficient_vector: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        coefficient_tensor = coefficient_vector.reshape(self.block_means.shape[0], self.block_means.shape[1])
        intercepts = np.asarray(coefficient_tensor[:, 0], dtype=np.float64)
        coefficients = np.asarray(coefficient_tensor[:, 1:], dtype=np.float64)
        return intercepts, coefficients

    def _decode_terminal_tensor(self, seed: SeedLike, coefficient_vector: np.ndarray) -> np.ndarray:
        intercepts, coefficients = self._split_coefficients(coefficient_vector)
        _, feature_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)

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
        coefficient_vector = self._coefficients_from_regime(np.asarray(regime, dtype=np.float64))
        return self._decode_terminal_tensor(seed, coefficient_vector)

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        if posterior.particles is not None and posterior.weights is not None:
            components = [self.terminal_tensor(seed, particle) for particle in posterior.particles]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean)

    def round_summary(self, episode: RoundEpisode) -> np.ndarray:
        return round_regime_summary_vector_v2(episode)


__all__ = ["HazardTeacherV4"]
