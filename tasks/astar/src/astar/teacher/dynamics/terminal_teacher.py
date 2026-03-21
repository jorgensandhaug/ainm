from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.map_summary import round_map_summary_names, round_map_summary_vector
from astar.history.summaries.round_coefficients import (
    round_regime_summary_vector,
    seed_feature_dict,
    seed_feature_names,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


GBX_TERMINAL_REGIME_TEACHER_MODEL = "gbx_terminal_regime_teacher_v1"
GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL = "gbx_terminal_regime_teacher_mapprior_v1"
GBX_TERMINAL_RESIDUAL_TEACHER_MODEL = "gbx_terminal_regime_residual_teacher_v1"
GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL = "gbx_terminal_regime_residual_teacher_mapprior_v1"


def gbx_terminal_scoped_checkpoint_path(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str],
    model_name: str = GBX_TERMINAL_REGIME_TEACHER_MODEL,
) -> Path:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    checkpoint_dir = paths.model_dir(
        f"{model_name}__rounds=n={len(normalized)}__sha1={digest}",
    )
    return checkpoint_dir / "checkpoint.json"


def gbx_terminal_round_coefficients_path(
    paths: WorkspacePaths,
    *,
    round_id: str,
    model_name: str = GBX_TERMINAL_REGIME_TEACHER_MODEL,
) -> Path:
    return paths.model_dir(f"{model_name}__round_coefficients") / f"{round_id}.json"


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate([np.ones((inputs.shape[0], 1), dtype=np.float64), inputs], axis=1)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    solution = np.linalg.pinv(design.T @ design + ridge_alpha * penalty) @ (design.T @ targets)
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _factorize_coefficients(
    coefficient_matrix: np.ndarray,
    regime_matrix: np.ndarray,
    *,
    max_rank: int,
    rank_selection: str,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray, tuple[int, ...], tuple[float, ...], int]:
    mean_vector = np.mean(coefficient_matrix, axis=0)
    centered = coefficient_matrix - mean_vector[None, :]
    _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
    candidate_ranks = tuple(range(1, max(1, min(max_rank, vt_matrix.shape[0])) + 1))
    if rank_selection == "direct_coefficients":
        return mean_vector, np.zeros((0, 0), dtype=np.float64), tuple(), tuple(), int(regime_matrix.shape[1])

    def reconstruct(train_coefficients: np.ndarray, train_regimes: np.ndarray, held_out_regime: np.ndarray, *, rank: int) -> np.ndarray:
        local_mean = np.mean(train_coefficients, axis=0)
        local_centered = train_coefficients - local_mean[None, :]
        _, _, local_vt = np.linalg.svd(local_centered, full_matrices=False)
        basis = local_vt[:rank]
        coordinates = local_centered @ basis.T
        intercept, weights = _fit_linear_map(train_regimes, coordinates, ridge_alpha=ridge_alpha)
        predicted_coords = np.asarray(intercept + held_out_regime @ weights, dtype=np.float64)
        return np.asarray(local_mean + predicted_coords @ basis, dtype=np.float64)

    if rank_selection == "loo_reconstruction_mse" and coefficient_matrix.shape[0] > 1:
        scores: list[float] = []
        for rank in candidate_ranks:
            fold_errors: list[float] = []
            for held_out_index in range(coefficient_matrix.shape[0]):
                train_mask = np.ones(coefficient_matrix.shape[0], dtype=bool)
                train_mask[held_out_index] = False
                reconstructed = reconstruct(
                    coefficient_matrix[train_mask],
                    regime_matrix[train_mask],
                    regime_matrix[held_out_index],
                    rank=rank,
                )
                fold_errors.append(
                    float(np.mean((reconstructed - coefficient_matrix[held_out_index]) ** 2)),
                )
            scores.append(float(np.mean(fold_errors)))
        selected_rank = candidate_ranks[int(np.argmin(np.asarray(scores, dtype=np.float64)))]
        basis = vt_matrix[:selected_rank]
        return mean_vector, np.asarray(basis, dtype=np.float64), candidate_ranks, tuple(scores), int(selected_rank)

    selected_rank = candidate_ranks[-1]
    basis = vt_matrix[:selected_rank]
    return mean_vector, np.asarray(basis, dtype=np.float64), candidate_ranks, tuple(), int(selected_rank)


def terminal_feature_names(regime_dim: int) -> list[str]:
    static_names = seed_feature_names()
    regime_names = [f"round_regime_{index}" for index in range(regime_dim)]
    interaction_names = [
        f"{name}__x__round_regime_{index}"
        for name in static_names
        for index in range(regime_dim)
    ]
    return static_names + regime_names + interaction_names


def build_terminal_feature_stack(
    seed: SeedLike,
    regime: np.ndarray,
) -> tuple[list[str], np.ndarray]:
    static_features = seed_feature_dict(seed.initial_state)
    static_names = seed_feature_names()
    static_stack = np.stack([static_features[name] for name in static_names], axis=0).astype(np.float64)
    regime_vector = np.asarray(regime, dtype=np.float64)
    regime_stack = np.repeat(regime_vector[:, None, None], static_stack.shape[1], axis=1)
    regime_stack = np.repeat(regime_stack, static_stack.shape[2], axis=2)
    interaction_stack = (
        static_stack[:, None, :, :] * regime_vector[None, :, None, None]
    ).reshape(len(static_names) * regime_vector.shape[0], static_stack.shape[1], static_stack.shape[2])
    return terminal_feature_names(regime_vector.shape[0]), np.concatenate(
        [static_stack, regime_stack, interaction_stack],
        axis=0,
    )


class RoundTerminalCoefficients(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    feature_names: list[str]
    regime_vector: np.ndarray
    intercept: np.ndarray
    coefficients: np.ndarray
    sample_count: int = Field(ge=0)

    def combined_vector(self) -> np.ndarray:
        return np.concatenate([self.intercept.reshape(-1), self.coefficients.reshape(-1)], axis=0)


class RoundTerminalCoefficientsCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    feature_names: list[str]
    regime_vector: list[float]
    intercept: list[float]
    coefficients: list[list[float]]
    sample_count: int = Field(ge=0)


def save_round_terminal_coefficients(path: Path, row: RoundTerminalCoefficients) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = RoundTerminalCoefficientsCheckpoint(
        round_id=row.round_id,
        round_number=row.round_number,
        feature_names=list(row.feature_names),
        regime_vector=np.asarray(row.regime_vector, dtype=np.float64).tolist(),
        intercept=np.asarray(row.intercept, dtype=np.float64).tolist(),
        coefficients=np.asarray(row.coefficients, dtype=np.float64).tolist(),
        sample_count=row.sample_count,
    )
    path.write_text(json.dumps(to_jsonable(payload), indent=2), encoding="utf-8")
    return path


def load_round_terminal_coefficients(path: Path) -> RoundTerminalCoefficients:
    checkpoint = RoundTerminalCoefficientsCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
    return RoundTerminalCoefficients(
        round_id=checkpoint.round_id,
        round_number=checkpoint.round_number,
        feature_names=list(checkpoint.feature_names),
        regime_vector=np.asarray(checkpoint.regime_vector, dtype=np.float64),
        intercept=np.asarray(checkpoint.intercept, dtype=np.float64),
        coefficients=np.asarray(checkpoint.coefficients, dtype=np.float64),
        sample_count=checkpoint.sample_count,
    )


class GreyBoxTerminalTeacherCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    feature_names: list[str]
    round_ids: list[str]
    round_numbers: list[int]
    regime_intercept: list[float]
    regime_weights: list[list[float]]
    coefficient_mean: list[float] = Field(default_factory=list)
    coefficient_basis: list[list[float]] = Field(default_factory=list)
    candidate_ranks: list[int] = Field(default_factory=list)
    rank_scores: list[float] = Field(default_factory=list)
    rank_selection: str = "loo_reconstruction_mse"
    selected_rank: int = Field(default=1, ge=1)
    map_feature_names: list[str] = Field(default_factory=list)
    map_intercept: list[float] = Field(default_factory=list)
    map_weights: list[list[float]] = Field(default_factory=list)
    map_neighbor_count: int = Field(default=3, ge=1)
    map_distance_floor: float = Field(default=1e-3, gt=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    use_base_residual: bool = False


class GreyBoxTerminalTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_TERMINAL_REGIME_TEACHER_MODEL
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 12), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    coefficient_mean: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    coefficient_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    candidate_ranks: tuple[int, ...] = ()
    rank_scores: tuple[float, ...] = ()
    rank_selection: str = "loo_reconstruction_mse"
    selected_rank: int = Field(default=1, ge=1)
    map_feature_names: tuple[str, ...] = ()
    map_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(12, dtype=np.float64))
    map_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 12), dtype=np.float64))
    map_neighbor_count: int = Field(default=3, ge=1)
    map_distance_floor: float = Field(default=1e-3, gt=0.0)
    probability_floor: float = Field(default=1e-4, gt=0.0, lt=1.0)
    use_base_residual: bool = False

    def _fit_round_coefficients(
        self,
        episode: RoundEpisode,
        *,
        ridge_alpha: float,
        base_predictions_by_seed: dict[int, np.ndarray] | None = None,
    ) -> RoundTerminalCoefficients:
        regime_vector = round_regime_summary_vector(episode)
        feature_names: list[str] | None = None
        xtx: np.ndarray | None = None
        xty: np.ndarray | None = None
        sample_count = 0
        for seed in episode.seeds:
            if seed.terminal_truth is None:
                continue
            if self.use_base_residual and (base_predictions_by_seed is None or seed.seed_index not in base_predictions_by_seed):
                raise ValueError(
                    f"base prediction missing for round {episode.metadata.round_id} seed {seed.seed_index}",
                )
            names, feature_stack = build_terminal_feature_stack(seed, regime_vector)
            if feature_names is None:
                feature_names = names
                xtx = np.zeros((len(feature_names) + 1, len(feature_names) + 1), dtype=np.float64)
                xty = np.zeros((len(feature_names) + 1, CLASS_COUNT), dtype=np.float64)
            feature_block = feature_stack.reshape(feature_stack.shape[0], -1).T
            target_block = np.log(np.clip(seed.terminal_truth.probs.reshape(-1, CLASS_COUNT), self.probability_floor, 1.0))
            if self.use_base_residual:
                base_prediction = np.asarray(base_predictions_by_seed[seed.seed_index], dtype=np.float64)
                base_block = np.log(np.clip(base_prediction.reshape(-1, CLASS_COUNT), self.probability_floor, 1.0))
                target_block = target_block - base_block
            design = np.concatenate([np.ones((feature_block.shape[0], 1), dtype=np.float64), feature_block], axis=1)
            xtx = xtx + (design.T @ design)
            xty = xty + (design.T @ target_block)
            sample_count += int(feature_block.shape[0])
        if feature_names is None or xtx is None or xty is None:
            raise ValueError(f"round {episode.metadata.round_id} has no terminal truth")
        penalty = np.eye(xtx.shape[0], dtype=np.float64)
        penalty[0, 0] = 0.0
        solution = np.linalg.pinv(xtx + ridge_alpha * penalty) @ xty
        return RoundTerminalCoefficients(
            round_id=episode.metadata.round_id,
            round_number=int(episode.metadata.round_number or -1),
            feature_names=feature_names,
            regime_vector=regime_vector,
            intercept=np.asarray(solution[0], dtype=np.float64),
            coefficients=np.asarray(solution[1:], dtype=np.float64),
            sample_count=sample_count,
        )

    def fit(
        self,
        episodes: list[RoundEpisode],
        *,
        max_rank: int = 5,
        rank_selection: str = "loo_reconstruction_mse",
        ridge_alpha: float = 1.0,
        coefficient_rows: Sequence[RoundTerminalCoefficients] | None = None,
    ) -> GreyBoxTerminalTeacher:
        replay_episodes = [
            episode
            for episode in episodes
            if any(seed.terminal_truth is not None for seed in episode.seeds)
        ]
        if not replay_episodes:
            raise ValueError("no terminal-truth episodes available for gbx terminal teacher")
        if coefficient_rows is None:
            coefficient_rows = [
                self._fit_round_coefficients(episode, ridge_alpha=ridge_alpha)
                for episode in replay_episodes
            ]
        coefficient_rows = list(coefficient_rows)
        regime_bank = np.stack([row.regime_vector for row in coefficient_rows], axis=0)
        map_bank = np.stack([round_map_summary_vector(tuple(episode.seeds)) for episode in replay_episodes], axis=0)
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
        if rank_selection == "direct_coefficients":
            regime_intercept, regime_weights = _fit_linear_map(
                regime_bank,
                coefficient_bank,
                ridge_alpha=ridge_alpha,
            )
            coefficient_mean = np.zeros(0, dtype=np.float64)
            coefficient_basis = np.zeros((0, 0), dtype=np.float64)
            candidate_ranks: tuple[int, ...] = ()
            rank_scores: tuple[float, ...] = ()
            selected_rank = int(regime_bank.shape[1])
        else:
            coefficient_mean, coefficient_basis, candidate_ranks, rank_scores, selected_rank = _factorize_coefficients(
                coefficient_bank,
                regime_bank,
                max_rank=min(max_rank, len(coefficient_rows)),
                rank_selection=rank_selection,
                ridge_alpha=ridge_alpha,
            )
            centered = coefficient_bank - coefficient_mean[None, :]
            coordinates = centered @ coefficient_basis.T
            regime_intercept, regime_weights = _fit_linear_map(
                regime_bank,
                coordinates,
                ridge_alpha=ridge_alpha,
            )
        map_intercept, map_weights = _fit_linear_map(
            map_bank,
            regime_bank,
            ridge_alpha=ridge_alpha,
        )
        return self.model_copy(
            update={
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "regime_bank": regime_bank,
                "coefficient_bank": coefficient_bank,
                "regime_intercept": regime_intercept,
                "regime_weights": regime_weights,
                "coefficient_mean": coefficient_mean,
                "coefficient_basis": coefficient_basis,
                "candidate_ranks": tuple(candidate_ranks),
                "rank_scores": tuple(rank_scores),
                "rank_selection": rank_selection,
                "selected_rank": selected_rank,
                "map_feature_names": tuple(round_map_summary_names()),
                "map_intercept": map_intercept,
                "map_weights": map_weights,
                "use_base_residual": self.use_base_residual,
            },
        )

    def checkpoint(self) -> GreyBoxTerminalTeacherCheckpoint:
        return GreyBoxTerminalTeacherCheckpoint(
            name=self.name,
            feature_names=self.feature_names,
            round_ids=list(self.round_ids),
            round_numbers=list(self.round_numbers),
            regime_intercept=self.regime_intercept.tolist(),
            regime_weights=self.regime_weights.tolist(),
            coefficient_mean=self.coefficient_mean.tolist(),
            coefficient_basis=self.coefficient_basis.tolist(),
            candidate_ranks=list(self.candidate_ranks),
            rank_scores=list(self.rank_scores),
            rank_selection=self.rank_selection,
            selected_rank=self.selected_rank,
            map_feature_names=list(self.map_feature_names),
            map_intercept=self.map_intercept.tolist(),
            map_weights=self.map_weights.tolist(),
            map_neighbor_count=self.map_neighbor_count,
            map_distance_floor=self.map_distance_floor,
            probability_floor=self.probability_floor,
            use_base_residual=self.use_base_residual,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> GreyBoxTerminalTeacher:
        checkpoint = GreyBoxTerminalTeacherCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        return cls(
            name=checkpoint.name,
            feature_names=list(checkpoint.feature_names),
            round_ids=tuple(checkpoint.round_ids),
            round_numbers=tuple(checkpoint.round_numbers),
            regime_intercept=np.asarray(checkpoint.regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(checkpoint.regime_weights, dtype=np.float64),
            coefficient_mean=np.asarray(checkpoint.coefficient_mean, dtype=np.float64),
            coefficient_basis=np.asarray(checkpoint.coefficient_basis, dtype=np.float64),
            candidate_ranks=tuple(checkpoint.candidate_ranks),
            rank_scores=tuple(checkpoint.rank_scores),
            rank_selection=checkpoint.rank_selection,
            selected_rank=checkpoint.selected_rank,
            map_feature_names=tuple(checkpoint.map_feature_names),
            map_intercept=np.asarray(checkpoint.map_intercept, dtype=np.float64),
            map_weights=np.asarray(checkpoint.map_weights, dtype=np.float64),
            map_neighbor_count=checkpoint.map_neighbor_count,
            map_distance_floor=checkpoint.map_distance_floor,
            probability_floor=checkpoint.probability_floor,
            use_base_residual=checkpoint.use_base_residual,
        )

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        return round_regime_summary_vector(episode)

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        regime_array = np.asarray(regime, dtype=np.float64)
        latent = np.asarray(self.regime_intercept + regime_array @ self.regime_weights, dtype=np.float64)
        if self.coefficient_basis.size > 0 and self.coefficient_mean.size > 0:
            return np.asarray(self.coefficient_mean + latent @ self.coefficient_basis, dtype=np.float64)
        return latent

    def _split_coefficients(self, coefficient_vector: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        feature_dim = len(self.feature_names)
        expected = CLASS_COUNT + (feature_dim * CLASS_COUNT)
        if coefficient_vector.shape[0] != expected:
            raise ValueError(f"expected coefficient dim {expected}, got {coefficient_vector.shape[0]}")
        intercept = np.asarray(coefficient_vector[:CLASS_COUNT], dtype=np.float64)
        coefficients = np.asarray(coefficient_vector[CLASS_COUNT:].reshape(feature_dim, CLASS_COUNT), dtype=np.float64)
        return intercept, coefficients

    def map_regime_prior(self, seeds: Sequence[SeedLike]) -> np.ndarray:
        if self.map_weights.size == 0:
            if self.regime_bank.size == 0:
                return np.zeros(12, dtype=np.float64)
            return np.asarray(np.mean(self.regime_bank, axis=0), dtype=np.float64)
        map_vector = round_map_summary_vector(seeds)
        regime = np.asarray(self.map_intercept + (map_vector @ self.map_weights), dtype=np.float64)
        return np.clip(regime, -0.25, 1.25)

    def map_posterior(self, seeds: Sequence[SeedLike]) -> RegimePosteriorState:
        prior_regime = self.map_regime_prior(seeds)
        if self.regime_bank.size == 0:
            return RegimePosteriorState(mean=prior_regime)
        distances = np.linalg.norm(self.regime_bank - prior_regime[None, :], axis=1)
        order = np.argsort(distances)[: min(self.map_neighbor_count, len(distances))]
        selected_particles = tuple(np.asarray(self.regime_bank[index], dtype=np.float64) for index in order)
        weights = 1.0 / np.clip(distances[order], self.map_distance_floor, None)
        weights = weights / np.sum(weights)
        mean = np.tensordot(weights, np.stack(selected_particles, axis=0), axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=selected_particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
        base_prediction: np.ndarray | None = None,
    ) -> np.ndarray:
        del n_rollouts
        coefficient_vector = self._coefficients_from_regime(np.asarray(regime, dtype=np.float64))
        intercept, coefficients = self._split_coefficients(coefficient_vector)
        _, feature_stack = build_terminal_feature_stack(seed, regime)
        logits = intercept[None, None, :] + np.tensordot(feature_stack, coefficients, axes=(0, 0))
        if self.use_base_residual:
            if base_prediction is None:
                raise ValueError("base_prediction is required when use_base_residual=True")
            logits = logits + np.log(np.clip(np.asarray(base_prediction, dtype=np.float64), self.probability_floor, 1.0))
        probs = softmax_logits(logits)
        feature_dict = seed_feature_dict(seed.initial_state)
        ocean_mask = feature_dict["initial_ocean"] > 0.5
        mountain_mask = feature_dict["initial_mountain"] > 0.5
        probs[ocean_mask] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        probs[mountain_mask] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        return apply_probability_floor(probs, self.probability_floor)

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
        base_prediction: np.ndarray | None = None,
    ) -> np.ndarray:
        if posterior.particles is not None and posterior.weights is not None:
            components = [
                self.terminal_tensor(seed, particle, n_rollouts=n_rollouts, base_prediction=base_prediction)
                for particle in posterior.particles
            ]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean, n_rollouts=n_rollouts, base_prediction=base_prediction)

    def prior_prediction_bundle(self, round_context: object) -> PredictionBundle:
        raise NotImplementedError


__all__ = [
    "GBX_TERMINAL_REGIME_TEACHER_MODEL",
    "GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL",
    "GBX_TERMINAL_RESIDUAL_TEACHER_MODEL",
    "GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL",
    "GreyBoxTerminalTeacher",
    "GreyBoxTerminalTeacherCheckpoint",
    "RoundTerminalCoefficients",
    "RoundTerminalCoefficientsCheckpoint",
    "build_terminal_feature_stack",
    "gbx_terminal_round_coefficients_path",
    "gbx_terminal_scoped_checkpoint_path",
    "load_round_terminal_coefficients",
    "save_round_terminal_coefficients",
    "terminal_feature_names",
]
