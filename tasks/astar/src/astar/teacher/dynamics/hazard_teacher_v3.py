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


def _deterministic_kmeans(points: np.ndarray, k: int, *, max_iter: int = 64) -> tuple[np.ndarray, np.ndarray]:
    point_matrix = np.asarray(points, dtype=np.float64)
    if point_matrix.ndim != 2 or point_matrix.shape[0] == 0:
        raise ValueError("k-means requires a non-empty 2D point matrix")

    sample_count = point_matrix.shape[0]
    effective_k = max(1, min(int(k), sample_count))
    if effective_k == 1:
        return np.mean(point_matrix, axis=0, keepdims=True), np.zeros(sample_count, dtype=np.int64)

    chosen = [0]
    chosen_set = {0}
    min_distance = np.sum((point_matrix - point_matrix[0]) ** 2, axis=1)
    while len(chosen) < effective_k:
        ranking = np.argsort(min_distance)
        next_index = 0
        for candidate in ranking[::-1]:
            if int(candidate) not in chosen_set:
                next_index = int(candidate)
                break
        chosen.append(next_index)
        chosen_set.add(next_index)
        min_distance = np.minimum(
            min_distance,
            np.sum((point_matrix - point_matrix[next_index]) ** 2, axis=1),
        )

    centers = np.asarray(point_matrix[chosen], dtype=np.float64)
    assignment = np.zeros(sample_count, dtype=np.int64)
    for _ in range(max_iter):
        distance_matrix = np.sum((point_matrix[:, None, :] - centers[None, :, :]) ** 2, axis=2)
        new_assignment = np.argmin(distance_matrix, axis=1).astype(np.int64)
        new_centers = centers.copy()
        for center_index in range(effective_k):
            mask = new_assignment == center_index
            if np.any(mask):
                new_centers[center_index] = np.mean(point_matrix[mask], axis=0)
        if np.array_equal(new_assignment, assignment) and np.allclose(new_centers, centers):
            assignment = new_assignment
            centers = new_centers
            break
        assignment = new_assignment
        centers = new_centers
    return centers, assignment


def _assignment_temperature(points: np.ndarray, centers: np.ndarray) -> float:
    if centers.shape[0] <= 1:
        return 1.0
    distance_matrix = np.sum((points[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    nearest = np.min(distance_matrix, axis=1)
    positive_nearest = nearest[nearest > 1e-8]
    within_scale = float(np.median(positive_nearest)) if positive_nearest.size > 0 else 0.0
    center_distances = np.sum((centers[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    positive_centers = center_distances[center_distances > 1e-8]
    between_scale = float(np.median(positive_centers)) if positive_centers.size > 0 else 0.0
    return max(within_scale, 0.1 * between_scale, 1e-4)


def _soft_assign(points: np.ndarray, centers: np.ndarray, *, temperature: float) -> np.ndarray:
    if centers.shape[0] == 1:
        return np.ones((points.shape[0], 1), dtype=np.float64)
    distance_matrix = np.sum((points[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    return _softmax(-distance_matrix / max(temperature, 1e-6))


def _fit_prototype_matrix(
    weight_matrix: np.ndarray,
    coefficient_matrix: np.ndarray,
    *,
    ridge_alpha: float = 1e-3,
) -> np.ndarray:
    lhs = weight_matrix.T @ weight_matrix + ridge_alpha * np.eye(weight_matrix.shape[1], dtype=np.float64)
    rhs = weight_matrix.T @ coefficient_matrix
    return np.asarray(np.linalg.pinv(lhs) @ rhs, dtype=np.float64)


class HazardTeacherV3(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v3"
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    mixture_count: int = Field(default=1, ge=1)
    residual_rank: int = Field(default=0, ge=0)
    latent_dimension: int = Field(default=1, ge=1)
    assignment_rank: int = Field(default=1, ge=1)
    coefficient_ridge_alpha: float = Field(default=1e-2, gt=0.0)
    prototype_temperature: float = Field(default=1.0, gt=0.0)
    assignment_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    assignment_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    assignment_coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    prototype_centers: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    prototype_coefficients: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    prototype_weights: np.ndarray = Field(default_factory=lambda: np.ones((0, 1), dtype=np.float64))
    residual_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    residual_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    residual_coordinates: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    prototype_rmse: float = 0.0
    reconstruction_rmse: float = 0.0

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        mixture_count: int = 3,
        residual_rank: int = 2,
        ridge_alpha: float = 1e-2,
        assignment_rank: int | None = None,
    ) -> HazardTeacherV3:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for hazard teacher v3")

        coefficient_rows = [
            fit_round_semimechanistic_coefficients_v2(episode, ridge_alpha=ridge_alpha)
            for episode in replay_episodes
        ]
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
        summary_bank = np.stack([row.summary_vector for row in coefficient_rows], axis=0)
        assignment_mean = np.mean(coefficient_bank, axis=0)
        centered = coefficient_bank - assignment_mean[None, :]
        _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
        requested_assignment_rank = assignment_rank or max(1, mixture_count - 1, residual_rank + 1)
        effective_assignment_rank = max(1, min(requested_assignment_rank, vt_matrix.shape[0]))
        assignment_basis = np.asarray(vt_matrix[:effective_assignment_rank], dtype=np.float64)
        assignment_coordinates = np.asarray(centered @ assignment_basis.T, dtype=np.float64)

        prototype_centers, _ = _deterministic_kmeans(assignment_coordinates, mixture_count)
        prototype_temperature = _assignment_temperature(assignment_coordinates, prototype_centers)
        prototype_weights = _soft_assign(
            assignment_coordinates,
            prototype_centers,
            temperature=prototype_temperature,
        )
        prototype_coefficients = _fit_prototype_matrix(prototype_weights, coefficient_bank)
        prototype_reconstruction = prototype_weights @ prototype_coefficients
        residual_matrix = coefficient_bank - prototype_reconstruction
        prototype_rmse = float(np.sqrt(np.mean((coefficient_bank - prototype_reconstruction) ** 2)))

        residual_mean = np.mean(residual_matrix, axis=0)
        centered_residual = residual_matrix - residual_mean[None, :]
        effective_residual_rank = 0
        residual_basis = np.zeros((0, coefficient_bank.shape[1]), dtype=np.float64)
        residual_coordinates = np.zeros((coefficient_bank.shape[0], 0), dtype=np.float64)
        if residual_rank > 0 and centered_residual.shape[0] > 1:
            _, _, residual_vt = np.linalg.svd(centered_residual, full_matrices=False)
            effective_residual_rank = min(residual_rank, residual_vt.shape[0])
            residual_basis = np.asarray(residual_vt[:effective_residual_rank], dtype=np.float64)
            residual_coordinates = np.asarray(centered_residual @ residual_basis.T, dtype=np.float64)

        reconstruction = prototype_reconstruction + residual_mean[None, :]
        if effective_residual_rank > 0:
            reconstruction = reconstruction + residual_coordinates @ residual_basis
        reconstruction_rmse = float(np.sqrt(np.mean((coefficient_bank - reconstruction) ** 2)))
        regime_bank = np.concatenate([prototype_weights, residual_coordinates], axis=1).astype(np.float64)

        return self.model_copy(
            update={
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "summary_bank": summary_bank,
                "coefficient_bank": coefficient_bank,
                "regime_bank": regime_bank,
                "mixture_count": int(prototype_centers.shape[0]),
                "residual_rank": int(effective_residual_rank),
                "latent_dimension": int(regime_bank.shape[1]),
                "assignment_rank": int(effective_assignment_rank),
                "coefficient_ridge_alpha": float(ridge_alpha),
                "prototype_temperature": float(prototype_temperature),
                "assignment_mean": assignment_mean.astype(np.float64),
                "assignment_basis": assignment_basis,
                "assignment_coordinates": assignment_coordinates,
                "prototype_centers": prototype_centers.astype(np.float64),
                "prototype_coefficients": prototype_coefficients.astype(np.float64),
                "prototype_weights": prototype_weights.astype(np.float64),
                "residual_mean": residual_mean.astype(np.float64),
                "residual_basis": residual_basis.astype(np.float64),
                "residual_coordinates": residual_coordinates.astype(np.float64),
                "prototype_rmse": prototype_rmse,
                "reconstruction_rmse": reconstruction_rmse,
            },
        )

    def regime_vectors_by_round(self) -> dict[str, np.ndarray]:
        return {
            round_id: np.asarray(regime_vector, dtype=np.float64)
            for round_id, regime_vector in zip(self.round_ids, self.regime_bank, strict=True)
        }

    def _assignment_coordinates_for_coefficients(self, coefficient_vector: np.ndarray) -> np.ndarray:
        centered = np.asarray(coefficient_vector, dtype=np.float64) - self.assignment_mean
        return np.asarray(centered @ self.assignment_basis.T, dtype=np.float64)

    def _prototype_weights_for_coefficients(self, coefficient_vector: np.ndarray) -> np.ndarray:
        coordinates = self._assignment_coordinates_for_coefficients(coefficient_vector)
        return _soft_assign(
            coordinates[None, :],
            self.prototype_centers,
            temperature=self.prototype_temperature,
        )[0]

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        try:
            round_index = self.round_ids.index(episode.metadata.round_id)
        except ValueError:
            coefficient_row = fit_round_semimechanistic_coefficients_v2(
                episode,
                ridge_alpha=self.coefficient_ridge_alpha,
            )
            coefficient_vector = coefficient_row.combined_vector()
            prototype_weights = self._prototype_weights_for_coefficients(coefficient_vector)
            prototype_vector = np.tensordot(
                prototype_weights,
                self.prototype_coefficients,
                axes=(0, 0),
            )
            residual_coordinates = np.zeros(self.residual_rank, dtype=np.float64)
            if self.residual_rank > 0:
                centered_residual = coefficient_vector - prototype_vector - self.residual_mean
                residual_coordinates = np.asarray(
                    centered_residual @ self.residual_basis.T,
                    dtype=np.float64,
                )
            return np.concatenate([prototype_weights, residual_coordinates], axis=0).astype(np.float64)
        return np.asarray(self.regime_bank[round_index], dtype=np.float64)

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        regime_array = np.asarray(regime, dtype=np.float64)
        if regime_array.ndim != 1:
            raise ValueError(f"expected 1D regime vector, got shape {regime_array.shape!r}")
        if regime_array.shape[0] != self.latent_dimension:
            raise ValueError(
                f"expected regime dim {self.latent_dimension}, got {regime_array.shape[0]}",
            )

        raw_weights = np.clip(regime_array[: self.mixture_count], 1e-6, None)
        total_weight = float(np.sum(raw_weights))
        if not np.isfinite(total_weight) or total_weight <= 0.0:
            prototype_weights = np.full(self.mixture_count, 1.0 / float(self.mixture_count), dtype=np.float64)
        else:
            prototype_weights = raw_weights / total_weight
        coefficient_vector = np.asarray(
            prototype_weights @ self.prototype_coefficients + self.residual_mean,
            dtype=np.float64,
        )
        if self.residual_rank > 0:
            residual_coordinates = regime_array[self.mixture_count :]
            coefficient_vector = np.asarray(
                coefficient_vector + residual_coordinates @ self.residual_basis,
                dtype=np.float64,
            )
        return coefficient_vector

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
        return np.asarray(probs / np.clip(sums, 1e-8, None), dtype=np.float64)

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


__all__ = ["HazardTeacherV3"]
