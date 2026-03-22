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


class HazardTeacherV2(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v2"
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    mean_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    latent_rank: int = Field(default=1, ge=1)

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        latent_rank: int = 3,
        ridge_alpha: float = 1e-2,
    ) -> HazardTeacherV2:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for hazard teacher v2")

        coefficient_rows = [
            fit_round_semimechanistic_coefficients_v2(episode, ridge_alpha=ridge_alpha)
            for episode in replay_episodes
        ]
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
        summary_bank = np.stack([row.summary_vector for row in coefficient_rows], axis=0)
        mean_vector = np.mean(coefficient_bank, axis=0)
        centered = coefficient_bank - mean_vector[None, :]
        _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
        effective_rank = max(1, min(latent_rank, vt_matrix.shape[0]))
        basis = np.asarray(vt_matrix[:effective_rank], dtype=np.float64)
        coordinates = np.asarray(centered @ basis.T, dtype=np.float64)

        return self.model_copy(
            update={
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "summary_bank": summary_bank,
                "coefficient_bank": coefficient_bank,
                "mean_vector": mean_vector,
                "basis": basis,
                "coordinates": coordinates,
                "latent_rank": effective_rank,
            },
        )

    def regime_vectors_by_round(self) -> dict[str, np.ndarray]:
        return {
            round_id: np.asarray(coordinate, dtype=np.float64)
            for round_id, coordinate in zip(self.round_ids, self.coordinates, strict=True)
        }

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        try:
            round_index = self.round_ids.index(episode.metadata.round_id)
        except ValueError:
            coefficient_row = fit_round_semimechanistic_coefficients_v2(episode)
            centered = coefficient_row.combined_vector() - self.mean_vector
            return np.asarray(centered @ self.basis.T, dtype=np.float64)
        return np.asarray(self.coordinates[round_index], dtype=np.float64)

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        regime_array = np.asarray(regime, dtype=np.float64)
        if regime_array.ndim != 1:
            raise ValueError(f"expected 1D regime vector, got shape {regime_array.shape!r}")
        if regime_array.shape[0] != self.latent_rank:
            raise ValueError(f"expected regime dim {self.latent_rank}, got {regime_array.shape[0]}")
        return np.asarray(self.mean_vector + regime_array @ self.basis, dtype=np.float64)

    def _split_coefficients(self, coefficient_vector: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        class_count = 4
        feature_dim = len(self.feature_names)
        intercepts = np.asarray(coefficient_vector[:class_count], dtype=np.float64)
        coefficients = np.asarray(
            coefficient_vector[class_count:].reshape(class_count, feature_dim),
            dtype=np.float64,
        )
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

    def _find_original_coefficient_index(self, regime: np.ndarray) -> int | None:
        """Check if regime matches a known training round's coordinates exactly."""
        if self.coordinates.shape[0] == 0:
            return None
        regime_array = np.asarray(regime, dtype=np.float64)
        distances = np.sqrt(np.sum((self.coordinates - regime_array[None, :]) ** 2, axis=1))
        min_idx = int(np.argmin(distances))
        if distances[min_idx] < 1e-10:
            return min_idx
        return None

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        # Use original coefficients for known training rounds (avoids SVD reconstruction loss)
        orig_idx = self._find_original_coefficient_index(regime)
        if orig_idx is not None and self.coefficient_bank.shape[0] > orig_idx:
            coefficient_vector = np.asarray(self.coefficient_bank[orig_idx], dtype=np.float64)
        else:
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


__all__ = ["HazardTeacherV2"]
