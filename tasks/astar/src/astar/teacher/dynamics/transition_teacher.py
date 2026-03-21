from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import ReplayRun
from astar.history.episodes.models import RoundEpisode
from astar.history.replay.events import (
    build_transition_feature_stack,
    dynamic_graph_feature_stack,
    global_class_ratio_feature_stack,
    local_class_ratio_stack,
    phase_feature_stack,
)
from astar.history.summaries.map_summary import round_map_summary_names, round_map_summary_vector
from astar.history.summaries.round_coefficients import round_regime_summary_vector, seed_feature_dict, seed_feature_names
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


GBX_TRANSITION_TEACHER_MODEL = "gbx_transition_teacher_v1"
GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL = "gbx_transition_teacher_mapprior_v1"
GBX_TRANSITION_TEACHER_PHASE_MODEL = "gbx_transition_teacher_phase_v1"
GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL = "gbx_transition_teacher_phase_mapprior_v1"
GBX_TRANSITION_TEACHER_GRAPH_MODEL = "gbx_transition_teacher_graph_v1"
GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL = "gbx_transition_teacher_graph_mapprior_v1"
GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL = "gbx_transition_teacher_graph_phase_v1"
GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL = "gbx_transition_teacher_graph_phase_mapprior_v1"
GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL = "gbx_transition_teacher_graph_phase_global_v1"
GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL = "gbx_transition_teacher_graph_phase_global_mapprior_v1"


def gbx_transition_scoped_checkpoint_path(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str],
    model_name: str = GBX_TRANSITION_TEACHER_MODEL,
) -> Path:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    checkpoint_dir = paths.model_dir(
        f"{model_name}__rounds=n={len(normalized)}__sha1={digest}",
    )
    return checkpoint_dir / "checkpoint.json"


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


def _initial_one_hot(grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    result = np.zeros((*collapsed.shape, CLASS_COUNT), dtype=np.float64)
    for class_index in range(CLASS_COUNT):
        result[:, :, class_index] = (collapsed == class_index).astype(np.float64)
    return result


class RoundTransitionCoefficients(BaseModel):
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


class RoundTransitionCoefficientsCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    feature_names: list[str]
    regime_vector: list[float]
    intercept: list[float]
    coefficients: list[list[float]]
    sample_count: int = Field(ge=0)


def gbx_transition_round_coefficients_path(
    paths: WorkspacePaths,
    *,
    round_id: str,
    model_name: str = GBX_TRANSITION_TEACHER_MODEL,
) -> Path:
    return paths.model_dir(f"{model_name}__round_coefficients") / f"{round_id}.json"


def save_round_transition_coefficients(
    path: Path,
    row: RoundTransitionCoefficients,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = RoundTransitionCoefficientsCheckpoint(
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


def load_round_transition_coefficients(path: Path) -> RoundTransitionCoefficients:
    checkpoint = RoundTransitionCoefficientsCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
    return RoundTransitionCoefficients(
        round_id=checkpoint.round_id,
        round_number=checkpoint.round_number,
        feature_names=list(checkpoint.feature_names),
        regime_vector=np.asarray(checkpoint.regime_vector, dtype=np.float64),
        intercept=np.asarray(checkpoint.intercept, dtype=np.float64),
        coefficients=np.asarray(checkpoint.coefficients, dtype=np.float64),
        sample_count=checkpoint.sample_count,
    )


class GreyBoxTransitionTeacherCheckpoint(BaseModel):
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
    include_graph_features: bool = False
    include_phase_features: bool = False
    include_global_features: bool = False
    probability_floor: float = Field(gt=0.0, lt=1.0)
    horizon: int = Field(ge=1)


class GreyBoxTransitionTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_TRANSITION_TEACHER_MODEL
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
    include_graph_features: bool = False
    include_phase_features: bool = False
    include_global_features: bool = False
    probability_floor: float = Field(default=1e-3, gt=0.0, lt=1.0)
    horizon: int = Field(default=50, ge=1)
    replay_bank_round_ids: tuple[str, ...] = ()
    replay_bank_seed_indexes: tuple[int, ...] = ()
    replay_runs_bank: tuple[tuple[ReplayRun, ...], ...] = ()

    def _fit_round_coefficients(
        self,
        episode: RoundEpisode,
        *,
        ridge_alpha: float,
    ) -> RoundTransitionCoefficients:
        feature_names: list[str] | None = None
        xtx: np.ndarray | None = None
        xty: np.ndarray | None = None
        sample_count = 0
        for seed in episode.seeds:
            for run in seed.replay_runs:
                for step in range(len(run.frames) - 1):
                    current_frame = run.frames[step]
                    next_frame = run.frames[step + 1]
                    current_grid = collapse_internal_grid(np.asarray(current_frame.grid, dtype=np.int64))
                    next_grid = collapse_internal_grid(np.asarray(next_frame.grid, dtype=np.int64))
                    names, feature_stack = build_transition_feature_stack(
                        seed.initial_state,
                        current_grid,
                        include_graph_features=self.include_graph_features,
                        include_phase_features=self.include_phase_features,
                        include_global_features=self.include_global_features,
                        step=step,
                        horizon=max(len(run.frames) - 1, 1),
                    )
                    if feature_names is None:
                        feature_names = names
                        xtx = np.zeros((len(feature_names) + 1, len(feature_names) + 1), dtype=np.float64)
                        xty = np.zeros((len(feature_names) + 1, CLASS_COUNT), dtype=np.float64)
                    feature_block = feature_stack.reshape(feature_stack.shape[0], -1).T
                    target_block = np.eye(CLASS_COUNT, dtype=np.float64)[next_grid.reshape(-1)]
                    design = np.concatenate(
                        [np.ones((feature_block.shape[0], 1), dtype=np.float64), feature_block],
                        axis=1,
                    )
                    xtx = xtx + (design.T @ design)
                    xty = xty + (design.T @ target_block)
                    sample_count += int(feature_block.shape[0])
        if feature_names is None or xtx is None or xty is None:
            raise ValueError(f"round {episode.metadata.round_id} has no replay-backed transitions")
        penalty = np.eye(xtx.shape[0], dtype=np.float64)
        penalty[0, 0] = 0.0
        solution = np.linalg.pinv(xtx + ridge_alpha * penalty) @ xty
        return RoundTransitionCoefficients(
            round_id=episode.metadata.round_id,
            round_number=int(episode.metadata.round_number or -1),
            feature_names=feature_names,
            regime_vector=round_regime_summary_vector(episode),
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
        coefficient_rows: Sequence[RoundTransitionCoefficients] | None = None,
    ) -> GreyBoxTransitionTeacher:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for gbx transition teacher")
        if coefficient_rows is None:
            coefficient_rows = [
                self._fit_round_coefficients(episode, ridge_alpha=ridge_alpha)
                for episode in replay_episodes
            ]
        coefficient_rows = list(coefficient_rows)
        if len(coefficient_rows) != len(replay_episodes):
            raise ValueError(
                f"expected {len(replay_episodes)} coefficient rows, got {len(coefficient_rows)}",
            )
        regime_bank = np.stack([row.regime_vector for row in coefficient_rows], axis=0)
        map_bank = np.stack(
            [round_map_summary_vector(tuple(episode.seeds)) for episode in replay_episodes],
            axis=0,
        )
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

        replay_bank_round_ids: list[str] = []
        replay_bank_seed_indexes: list[int] = []
        replay_runs_bank: list[tuple[ReplayRun, ...]] = []
        for episode in replay_episodes:
            for seed in episode.seeds:
                if not seed.replay_runs:
                    continue
                replay_bank_round_ids.append(episode.metadata.round_id)
                replay_bank_seed_indexes.append(seed.seed_index)
                replay_runs_bank.append(seed.replay_runs)

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
                "include_graph_features": self.include_graph_features,
                "include_phase_features": self.include_phase_features,
                "include_global_features": self.include_global_features,
                "replay_bank_round_ids": tuple(replay_bank_round_ids),
                "replay_bank_seed_indexes": tuple(replay_bank_seed_indexes),
                "replay_runs_bank": tuple(replay_runs_bank),
            },
        )

    def checkpoint(self) -> GreyBoxTransitionTeacherCheckpoint:
        return GreyBoxTransitionTeacherCheckpoint(
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
            include_graph_features=self.include_graph_features,
            include_phase_features=self.include_phase_features,
            include_global_features=self.include_global_features,
            probability_floor=self.probability_floor,
            horizon=self.horizon,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> GreyBoxTransitionTeacher:
        checkpoint = GreyBoxTransitionTeacherCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
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
            include_graph_features=checkpoint.include_graph_features,
            include_phase_features=checkpoint.include_phase_features,
            include_global_features=checkpoint.include_global_features,
            probability_floor=checkpoint.probability_floor,
            horizon=checkpoint.horizon,
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
        coefficients = np.asarray(
            coefficient_vector[CLASS_COUNT:].reshape(feature_dim, CLASS_COUNT),
            dtype=np.float64,
        )
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

    def _transition_tensor(
        self,
        static_stack: np.ndarray,
        current_probs: np.ndarray,
        intercept: np.ndarray,
        coefficients: np.ndarray,
        *,
        step: int,
        horizon: int,
    ) -> np.ndarray:
        current_class_grid = np.argmax(current_probs, axis=-1)
        _, local_ratio_stack = local_class_ratio_stack(current_class_grid)
        graph_stack = np.zeros((0, *current_class_grid.shape), dtype=np.float64)
        phase_stack = np.zeros((0, *current_class_grid.shape), dtype=np.float64)
        global_stack = np.zeros((0, *current_class_grid.shape), dtype=np.float64)
        if self.include_graph_features:
            _, graph_stack = dynamic_graph_feature_stack(current_class_grid)
        if self.include_phase_features:
            _, phase_stack = phase_feature_stack(
                step=step,
                horizon=horizon,
                shape=current_class_grid.shape,
            )
        if self.include_global_features:
            _, global_stack = global_class_ratio_feature_stack(current_class_grid)
        static_feature_count = len(seed_feature_names())
        offset = 0
        static_coef = coefficients[offset : offset + static_feature_count]
        offset += static_feature_count
        current_class_coef = coefficients[offset : offset + CLASS_COUNT]
        offset += CLASS_COUNT
        local_ratio_coef = coefficients[offset : offset + CLASS_COUNT]
        offset += CLASS_COUNT
        graph_coef = coefficients[offset : offset + graph_stack.shape[0]]
        offset += graph_stack.shape[0]
        phase_coef = coefficients[offset : offset + phase_stack.shape[0]]
        offset += phase_stack.shape[0]
        global_coef = coefficients[offset : offset + global_stack.shape[0]]
        offset += global_stack.shape[0]
        if offset != coefficients.shape[0]:
            raise ValueError(
                f"feature coefficient mismatch: consumed {offset}, have {coefficients.shape[0]}",
            )
        base_scores = (
            intercept[None, None, :]
            + np.tensordot(static_stack, static_coef, axes=(0, 0))
            + np.tensordot(local_ratio_stack, local_ratio_coef, axes=(0, 0))
        )
        if graph_coef.size > 0:
            base_scores = base_scores + np.tensordot(graph_stack, graph_coef, axes=(0, 0))
        if phase_coef.size > 0:
            base_scores = base_scores + np.tensordot(phase_stack, phase_coef, axes=(0, 0))
        if global_coef.size > 0:
            base_scores = base_scores + np.tensordot(global_stack, global_coef, axes=(0, 0))
        height, width, _ = current_probs.shape
        transition = np.zeros((CLASS_COUNT, height, width, CLASS_COUNT), dtype=np.float64)
        for current_class in range(CLASS_COUNT):
            transition[current_class] = softmax_logits(
                base_scores + current_class_coef[current_class][None, None, :],
            )
        return transition

    def _nearest_seed_bank_indexes(self, regime: np.ndarray, seed_index: int) -> list[int]:
        if self.regime_bank.size == 0:
            return []
        distances = np.linalg.norm(self.regime_bank - regime[None, :], axis=1)
        ordered = np.argsort(distances)
        selected: list[int] = []
        for round_index in ordered:
            round_id = self.round_ids[int(round_index)]
            round_seed_indexes = [
                index
                for index, (bank_round_id, bank_seed_index) in enumerate(
                    zip(self.replay_bank_round_ids, self.replay_bank_seed_indexes, strict=True),
                )
                if bank_round_id == round_id and bank_seed_index == seed_index
            ]
            if round_seed_indexes:
                selected.extend(round_seed_indexes)
                break
        if selected:
            return selected
        return [
            index
            for index, bank_seed_index in enumerate(self.replay_bank_seed_indexes)
            if bank_seed_index == seed_index
        ]

    def rollout(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int,
        horizon: int = 50,
    ) -> list[ReplayRun]:
        del horizon
        seed_replay_runs = tuple(getattr(seed, "replay_runs", ()))
        if seed_replay_runs:
            source_runs = list(seed_replay_runs)
        else:
            source_runs = [
                run
                for index in self._nearest_seed_bank_indexes(np.asarray(regime), seed.seed_index)
                for run in self.replay_runs_bank[index]
            ]
        if not source_runs:
            return []
        return [source_runs[index % len(source_runs)] for index in range(n_rollouts)]

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        coefficient_vector = self._coefficients_from_regime(np.asarray(regime, dtype=np.float64))
        intercept, coefficients = self._split_coefficients(coefficient_vector)
        current_probs = _initial_one_hot(np.asarray(seed.initial_state.grid, dtype=np.int64))
        static_features = seed_feature_dict(seed.initial_state)
        static_names = seed_feature_names()
        static_stack = np.stack([static_features[name] for name in static_names], axis=0).astype(np.float64)
        ocean_mask = static_features["initial_ocean"] > 0.5
        mountain_mask = static_features["initial_mountain"] > 0.5
        for step in range(self.horizon):
            transition = self._transition_tensor(
                static_stack,
                current_probs,
                intercept,
                coefficients,
                step=step,
                horizon=self.horizon,
            )
            next_probs = np.sum(current_probs[:, :, :, None] * np.transpose(transition, (1, 2, 0, 3)), axis=2)
            next_probs[ocean_mask] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
            next_probs[mountain_mask] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
            current_probs = apply_probability_floor(next_probs, self.probability_floor)
        return current_probs

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        if posterior.particles is not None and posterior.weights is not None:
            components = [
                self.terminal_tensor(seed, particle, n_rollouts=n_rollouts)
                for particle in posterior.particles
            ]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean, n_rollouts=n_rollouts)

    def prior_prediction_bundle(self, round_context: object) -> PredictionBundle:
        raise NotImplementedError


__all__ = [
    "GBX_TRANSITION_TEACHER_MODEL",
    "GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL",
    "GBX_TRANSITION_TEACHER_PHASE_MODEL",
    "GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL",
    "GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL",
    "GreyBoxTransitionTeacher",
    "GreyBoxTransitionTeacherCheckpoint",
    "RoundTransitionCoefficients",
    "RoundTransitionCoefficientsCheckpoint",
    "gbx_transition_round_coefficients_path",
    "gbx_transition_scoped_checkpoint_path",
    "load_round_transition_coefficients",
    "save_round_transition_coefficients",
]
