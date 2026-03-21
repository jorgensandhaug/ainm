from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.world_state import InitialSettlementState, InitialWorldState
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.infra.api.dto import RoundDetail
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.posterior.transcript_artifacts import (
    round_detail_from_artifact,
    summary_vector_from_artifact,
    summary_vector_from_context,
    terminal_targets_from_artifact,
)
from astar.student.posterior.transcript_set import (
    MAX_QUERY_BUDGET,
    build_round_initial_feature_vector,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from astar.teacher.regime.base import RegimePosteriorState


def _softmax(values: np.ndarray) -> np.ndarray:
    array = np.asarray(values, dtype=np.float64)
    if array.size == 0:
        return np.zeros((0,), dtype=np.float64)
    shifted = array - float(np.max(array))
    exp_values = np.exp(shifted)
    return exp_values / float(np.sum(exp_values))


def _design_matrix(feature_matrix: np.ndarray) -> np.ndarray:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    if matrix.ndim != 2:
        raise ValueError(f"expected 2D feature matrix, got shape {matrix.shape!r}")
    return np.concatenate(
        [np.ones((matrix.shape[0], 1), dtype=np.float64), matrix],
        axis=1,
    )


def _fit_multitarget_ridge(
    feature_matrix: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> np.ndarray:
    design = _design_matrix(feature_matrix)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ np.asarray(targets, dtype=np.float64)
    try:
        return np.asarray(np.linalg.solve(lhs, rhs), dtype=np.float64)
    except np.linalg.LinAlgError:
        return np.asarray(np.linalg.pinv(lhs) @ rhs, dtype=np.float64)


def _predict_multitarget_ridge(
    feature_matrix: np.ndarray,
    weights: np.ndarray,
) -> np.ndarray:
    return np.asarray(_design_matrix(feature_matrix) @ np.asarray(weights, dtype=np.float64))


def _standardize_feature_matrix(
    feature_matrix: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    if matrix.ndim != 2:
        raise ValueError(f"expected 2D feature matrix, got shape {matrix.shape!r}")
    mean = np.mean(matrix, axis=0)
    scale = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-6, scale, 1.0).astype(np.float64)
    standardized = ((matrix - mean[None, :]) / scale[None, :]).astype(np.float64)
    return (
        np.asarray(mean, dtype=np.float64),
        np.asarray(scale, dtype=np.float64),
        standardized,
    )


def _row_covariance(rows: np.ndarray) -> np.ndarray:
    matrix = np.asarray(rows, dtype=np.float64)
    if matrix.ndim != 2:
        raise ValueError(f"expected 2D matrix, got shape {matrix.shape!r}")
    if matrix.shape[0] <= 1:
        return np.zeros((matrix.shape[1], matrix.shape[1]), dtype=np.float64)
    centered = matrix - np.mean(matrix, axis=0, keepdims=True)
    return np.asarray((centered.T @ centered) / float(matrix.shape[0] - 1), dtype=np.float64)


def _stabilize_covariance(covariance: np.ndarray, *, floor: float = 1e-6) -> np.ndarray:
    matrix = np.asarray(covariance, dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise ValueError(f"expected square covariance matrix, got shape {matrix.shape!r}")
    diagonal = np.diag(matrix)
    jitter = np.maximum(np.abs(diagonal) * 1e-6, floor)
    return np.asarray(matrix + np.diag(jitter), dtype=np.float64)


def _nearest_neighbor_bandwidth(feature_matrix: np.ndarray) -> float:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    sample_count = matrix.shape[0]
    if sample_count <= 1:
        return 1.0
    pairwise = np.linalg.norm(matrix[:, None, :] - matrix[None, :, :], axis=2)
    np.fill_diagonal(pairwise, np.inf)
    nearest = np.min(pairwise, axis=1)
    finite = nearest[np.isfinite(nearest) & (nearest > 1e-6)]
    if finite.size == 0:
        return 1.0
    return float(np.median(finite))


def _select_ridge_alpha(
    feature_matrix: np.ndarray,
    targets: np.ndarray,
    candidates: tuple[float, ...],
) -> float:
    if feature_matrix.shape[0] <= 2:
        return float(candidates[0])
    best_alpha = float(candidates[0])
    best_score = float("inf")
    sample_count = feature_matrix.shape[0]
    for candidate in candidates:
        total = 0.0
        for holdout_index in range(sample_count):
            mask = np.ones(sample_count, dtype=bool)
            mask[holdout_index] = False
            weights = _fit_multitarget_ridge(
                feature_matrix[mask],
                targets[mask],
                ridge_alpha=float(candidate),
            )
            prediction = _predict_multitarget_ridge(
                feature_matrix[holdout_index : holdout_index + 1],
                weights,
            )[0]
            total += float(np.mean((prediction - targets[holdout_index]) ** 2))
        score = total / float(sample_count)
        if score < best_score:
            best_score = score
            best_alpha = float(candidate)
    return best_alpha


def _leave_one_out_multitarget_predictions(
    feature_matrix: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> np.ndarray:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    target_matrix = np.asarray(targets, dtype=np.float64)
    sample_count = matrix.shape[0]
    if sample_count <= 1:
        return _predict_multitarget_ridge(
            matrix,
            _fit_multitarget_ridge(
                matrix,
                target_matrix,
                ridge_alpha=float(ridge_alpha),
            ),
        )
    predictions = np.zeros_like(target_matrix, dtype=np.float64)
    for holdout_index in range(sample_count):
        mask = np.ones(sample_count, dtype=bool)
        mask[holdout_index] = False
        weights = _fit_multitarget_ridge(
            matrix[mask],
            target_matrix[mask],
            ridge_alpha=float(ridge_alpha),
        )
        predictions[holdout_index] = _predict_multitarget_ridge(
            matrix[holdout_index : holdout_index + 1],
            weights,
        )[0]
    return np.asarray(predictions, dtype=np.float64)


def _evidence_strength(query_count: int) -> float:
    normalized = np.clip(float(query_count) / float(MAX_QUERY_BUDGET), 0.0, 1.0)
    return float(np.sqrt(normalized))


class _RoundDetailSeedAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    seed_index: int = Field(ge=0)
    initial_state: InitialWorldState


def _round_detail_seed(round_detail: RoundDetail, seed_index: int) -> _RoundDetailSeedAdapter:
    initial_state = round_detail.initial_states[seed_index]
    return _RoundDetailSeedAdapter(
        seed_index=seed_index,
        initial_state=InitialWorldState(
            grid=np.asarray(initial_state.grid, dtype=np.int64),
            settlements=tuple(
                InitialSettlementState(
                    x=item.x,
                    y=item.y,
                    has_port=item.has_port,
                    alive=item.alive,
                )
                for item in initial_state.settlements
            ),
        ),
    )


@dataclass(frozen=True, slots=True)
class _TerminalCalibrationEpisode:
    sample_index: int
    round_id: str
    standardized_summary: np.ndarray
    query_count: int
    round_detail: RoundDetail
    terminal_targets: dict[int, np.ndarray]


def _posterior_from_arrays(
    standardized_summary: np.ndarray,
    *,
    query_count: int,
    regression_weights: np.ndarray,
    regime_prior_mean: np.ndarray,
    regime_prior_cov: np.ndarray,
    regime_residual_cov: np.ndarray,
    prototype_summary_vectors: np.ndarray,
    prototype_regime_vectors: np.ndarray,
    prototype_round_ids: tuple[str, ...],
    prototype_count: int,
    prototype_bandwidth: float,
    proposal_mass: float,
    prior_mass_floor: float,
    exclude_prototype_index: int | None = None,
    exclude_round_id: str | None = None,
) -> RegimePosteriorState:
    summary_vector = np.asarray(standardized_summary, dtype=np.float64).reshape(1, -1)
    proposal_raw = _predict_multitarget_ridge(summary_vector, regression_weights)[0]
    strength = _evidence_strength(query_count)
    proposal_particle = (
        (1.0 - strength) * np.asarray(regime_prior_mean, dtype=np.float64)
        + strength * np.asarray(proposal_raw, dtype=np.float64)
    )

    prototype_summary_matrix = np.asarray(prototype_summary_vectors, dtype=np.float64)
    prototype_regime_matrix = np.asarray(prototype_regime_vectors, dtype=np.float64)
    candidate_indexes = np.arange(prototype_regime_matrix.shape[0], dtype=np.int64)
    if exclude_prototype_index is not None:
        candidate_indexes = candidate_indexes[candidate_indexes != int(exclude_prototype_index)]
    if exclude_round_id is not None and prototype_round_ids:
        candidate_indexes = candidate_indexes[
            np.asarray(
                [
                    str(prototype_round_ids[int(index)]) != str(exclude_round_id)
                    for index in candidate_indexes
                ],
                dtype=bool,
            )
        ]

    particles: list[np.ndarray] = [np.asarray(proposal_particle, dtype=np.float64)]
    weights: list[float] = [float(proposal_mass)]

    prior_mean = np.asarray(regime_prior_mean, dtype=np.float64)
    prior_mass = 0.0
    if not np.allclose(proposal_particle, prior_mean):
        prior_mass = float(np.clip(prior_mass_floor * (1.0 - strength), 0.0, 1.0 - proposal_mass))
        if prior_mass > 0.0:
            particles.append(prior_mean)
            weights.append(prior_mass)

    prototype_mass = max(0.0, 1.0 - float(np.sum(weights)))
    if prototype_mass > 0.0 and candidate_indexes.size > 0:
        effective_count = min(int(prototype_count), int(candidate_indexes.size))
        if query_count <= 0:
            centered_distance = np.linalg.norm(
                prototype_regime_matrix[candidate_indexes] - prior_mean[None, :],
                axis=1,
            )
            order = candidate_indexes[np.argsort(centered_distance)[:effective_count]]
            prototype_weights = np.ones((effective_count,), dtype=np.float64)
            prototype_weights = prototype_weights / float(effective_count)
        else:
            distances = np.linalg.norm(
                prototype_summary_matrix[candidate_indexes] - summary_vector,
                axis=1,
            )
            order = candidate_indexes[np.argsort(distances)[:effective_count]]
            selected_distances = np.linalg.norm(
                prototype_summary_matrix[order] - summary_vector,
                axis=1,
            )
            bandwidth = max(float(prototype_bandwidth), 1e-6)
            logits = -0.5 * max(strength, 0.25) * (selected_distances**2) / (bandwidth**2)
            prototype_weights = _softmax(logits)
        for index, weight in zip(order, prototype_weights, strict=True):
            particles.append(np.asarray(prototype_regime_matrix[int(index)], dtype=np.float64))
            weights.append(float(weight) * prototype_mass)

    normalized_weights = np.asarray(weights, dtype=np.float64)
    normalized_weights = normalized_weights / float(np.sum(normalized_weights))
    particle_matrix = np.stack(particles, axis=0)
    posterior_mean = np.tensordot(normalized_weights, particle_matrix, axes=(0, 0))
    centered_particles = particle_matrix - posterior_mean[None, :]
    particle_cov = np.einsum(
        "i,ij,ik->jk",
        normalized_weights,
        centered_particles,
        centered_particles,
    )
    posterior_cov = (
        (1.0 - strength) * np.asarray(regime_prior_cov, dtype=np.float64)
        + strength * np.asarray(regime_residual_cov, dtype=np.float64)
        + particle_cov
    )
    return RegimePosteriorState(
        mean=np.asarray(posterior_mean, dtype=np.float64),
        cov=_stabilize_covariance(posterior_cov),
        particles=tuple(np.asarray(item, dtype=np.float64) for item in particle_matrix),
        weights=normalized_weights,
    )


def _select_terminal_mixture(
    episodes: tuple[_TerminalCalibrationEpisode, ...],
    *,
    teacher: StateSpaceTeacher,
    regression_weights: np.ndarray,
    regime_prior_mean: np.ndarray,
    regime_prior_cov: np.ndarray,
    regime_residual_cov: np.ndarray,
    prototype_summary_vectors: np.ndarray,
    prototype_regime_vectors: np.ndarray,
    prototype_round_ids: tuple[str, ...],
    prototype_count: int,
    prototype_bandwidth: float,
    proposal_mass: float,
    prior_mass_floor: float,
    terminal_rollouts: int,
    proposal_mass_grid: tuple[float, ...],
    bandwidth_factor_grid: tuple[float, ...],
) -> tuple[float, float]:
    if not episodes:
        return proposal_mass, prototype_bandwidth
    best_proposal_mass = proposal_mass
    best_bandwidth = prototype_bandwidth
    best_score = float("inf")
    for bandwidth_factor in bandwidth_factor_grid:
        candidate_bandwidth = max(1e-6, float(prototype_bandwidth) * float(bandwidth_factor))
        for candidate_proposal_mass in proposal_mass_grid:
            total = 0.0
            count = 0
            for episode in episodes:
                posterior = _posterior_from_arrays(
                    episode.standardized_summary,
                    query_count=episode.query_count,
                    regression_weights=regression_weights,
                    regime_prior_mean=regime_prior_mean,
                    regime_prior_cov=regime_prior_cov,
                    regime_residual_cov=regime_residual_cov,
                    prototype_summary_vectors=prototype_summary_vectors,
                    prototype_regime_vectors=prototype_regime_vectors,
                    prototype_round_ids=prototype_round_ids,
                    prototype_count=prototype_count,
                    prototype_bandwidth=candidate_bandwidth,
                    proposal_mass=float(candidate_proposal_mass),
                    prior_mass_floor=prior_mass_floor,
                    exclude_prototype_index=episode.sample_index,
                    exclude_round_id=episode.round_id,
                )
                for seed_index, target in episode.terminal_targets.items():
                    prediction = teacher.posterior_predictive(
                        _round_detail_seed(episode.round_detail, int(seed_index)),
                        posterior,
                        n_rollouts=terminal_rollouts,
                    )
                    total += float(np.mean(np.abs(prediction - target)))
                    count += 1
            score = total / float(max(count, 1))
            if score < best_score:
                best_score = score
                best_proposal_mass = float(candidate_proposal_mass)
                best_bandwidth = candidate_bandwidth
    return best_proposal_mass, best_bandwidth


class StateSpaceStudentCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    teacher_checkpoint_path: str
    teacher_name: str
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    ridge_alpha: float = Field(gt=0.0)
    prototype_count: int = Field(ge=1)
    prototype_bandwidth: float = Field(gt=0.0)
    proposal_mass: float = Field(gt=0.0, lt=1.0)
    prior_mass_floor: float = Field(ge=0.0, lt=1.0)
    prior_ridge_alpha: float = Field(default=1.0, gt=0.0)
    decoder_rollouts: int = Field(ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_names: list[str] = Field(default_factory=list)
    prior_feature_names: list[str] = Field(default_factory=list)
    prototype_round_ids: list[str] = Field(default_factory=list)


class StateSpaceStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "state_space_student_v1"
    dataset_name: str = "synthetic_live_v1"
    summary_feature_names: tuple[str, ...] = ()
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros((0,), dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones((0,), dtype=np.float64))
    prior_feature_names: tuple[str, ...] = ()
    prior_feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros((0,), dtype=np.float64))
    prior_feature_scale: np.ndarray = Field(default_factory=lambda: np.ones((0,), dtype=np.float64))
    prior_regression_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((1, 1), dtype=np.float64),
    )
    regime_prior_mean: np.ndarray = Field(default_factory=lambda: np.zeros((1,), dtype=np.float64))
    regime_prior_cov: np.ndarray = Field(
        default_factory=lambda: np.eye(1, dtype=np.float64),
    )
    conditional_prior_cov: np.ndarray = Field(
        default_factory=lambda: np.eye(1, dtype=np.float64),
    )
    regime_residual_cov: np.ndarray = Field(
        default_factory=lambda: np.eye(1, dtype=np.float64),
    )
    regression_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((1, 1), dtype=np.float64),
    )
    prototype_summary_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    prototype_regime_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    ridge_alpha: float = Field(default=1.0, gt=0.0)
    prior_ridge_alpha: float = Field(default=1.0, gt=0.0)
    prototype_count: int = Field(default=6, ge=1)
    prototype_bandwidth: float = Field(default=1.0, gt=0.0)
    proposal_mass: float = Field(default=0.55, gt=0.0, lt=1.0)
    prior_mass_floor: float = Field(default=0.15, ge=0.0, lt=1.0)
    decoder_rollouts: int = Field(default=64, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    prototype_round_ids: tuple[str, ...] = ()
    teacher: StateSpaceTeacher

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: StateSpaceTeacher,
        *,
        ridge_alpha_grid: tuple[float, ...] = (0.1, 1.0, 5.0, 20.0),
        prototype_count: int = 6,
        prototype_bandwidth: float | None = None,
        proposal_mass: float = 0.55,
        prior_mass_floor: float = 0.15,
        decoder_rollouts: int = 64,
        terminal_calibration_rollouts: int = 2,
        max_terminal_calibration_samples: int = 2,
        proposal_mass_grid: tuple[float, ...] = (0.45, 0.65),
        bandwidth_factor_grid: tuple[float, ...] = (1.0, 2.0),
    ) -> StateSpaceStudent:
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        summary_feature_names: tuple[str, ...] | None = None
        prior_feature_names: tuple[str, ...] | None = None
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        episode_paths: list[Path] = []
        query_counts: list[int] = []
        prototype_round_ids: list[str] = []
        round_prior_vectors: dict[str, np.ndarray] = {}
        round_regime_vectors: dict[str, np.ndarray] = {}

        for round_id_value, path_value, query_count in zip(
            index_table["round_id"].to_list(),
            index_table["episode_path"].to_list(),
            index_table["query_count"].to_list(),
            strict=True,
        ):
            episode_path = Path(str(path_value))
            round_id = str(round_id_value)
            feature_names, summary_vector, regime_vector = summary_vector_from_artifact(
                episode_path
            )
            if summary_feature_names is None:
                summary_feature_names = feature_names
            elif feature_names != summary_feature_names:
                raise ValueError(
                    "state-space student feature names drifted across synthetic episodes"
                )
            summary_vectors.append(np.asarray(summary_vector, dtype=np.float64))
            regime_vectors.append(np.asarray(regime_vector, dtype=np.float64))
            episode_paths.append(episode_path)
            query_counts.append(int(query_count))
            prototype_round_ids.append(round_id)
            if round_id not in round_prior_vectors:
                round_detail = round_detail_from_artifact(episode_path)
                initial_feature_names, initial_feature_vector = build_round_initial_feature_vector(
                    round_detail
                )
                if prior_feature_names is None:
                    prior_feature_names = initial_feature_names
                elif initial_feature_names != prior_feature_names:
                    raise ValueError(
                        "state-space student prior feature names drifted across rounds"
                    )
                round_prior_vectors[round_id] = np.asarray(
                    initial_feature_vector,
                    dtype=np.float64,
                )
                round_regime_vectors[round_id] = np.asarray(regime_vector, dtype=np.float64)
            elif not np.allclose(round_regime_vectors[round_id], regime_vector):
                raise ValueError(
                    "state-space student regime targets drifted across episodes in one round"
                )

        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any transcript summaries")

        summary_matrix = np.stack(summary_vectors, axis=0)
        regime_matrix = np.stack(regime_vectors, axis=0)
        summary_mean, summary_scale, standardized_summary = _standardize_feature_matrix(
            summary_matrix
        )

        selected_ridge_alpha = _select_ridge_alpha(
            standardized_summary,
            regime_matrix,
            tuple(float(item) for item in ridge_alpha_grid),
        )
        regression_weights = _fit_multitarget_ridge(
            standardized_summary,
            regime_matrix,
            ridge_alpha=selected_ridge_alpha,
        )
        regime_predictions = _predict_multitarget_ridge(standardized_summary, regression_weights)
        regime_residuals = regime_matrix - regime_predictions

        regime_prior_mean = np.mean(regime_matrix, axis=0)
        regime_prior_cov = _stabilize_covariance(_row_covariance(regime_matrix))
        regime_residual_cov = _stabilize_covariance(_row_covariance(regime_residuals))
        sorted_round_ids = tuple(sorted(round_prior_vectors))
        prior_matrix = np.stack(
            [round_prior_vectors[round_id] for round_id in sorted_round_ids],
            axis=0,
        )
        prior_target_matrix = np.stack(
            [round_regime_vectors[round_id] for round_id in sorted_round_ids],
            axis=0,
        )
        prior_feature_mean, prior_feature_scale, standardized_prior_matrix = (
            _standardize_feature_matrix(prior_matrix)
        )
        selected_prior_ridge_alpha = _select_ridge_alpha(
            standardized_prior_matrix,
            prior_target_matrix,
            tuple(float(item) for item in ridge_alpha_grid),
        )
        prior_regression_weights = _fit_multitarget_ridge(
            standardized_prior_matrix,
            prior_target_matrix,
            ridge_alpha=selected_prior_ridge_alpha,
        )
        if prior_target_matrix.shape[0] <= 1:
            conditional_prior_cov = np.asarray(regime_prior_cov, dtype=np.float64)
        else:
            prior_loo_predictions = _leave_one_out_multitarget_predictions(
                standardized_prior_matrix,
                prior_target_matrix,
                ridge_alpha=selected_prior_ridge_alpha,
            )
            conditional_prior_cov = _stabilize_covariance(
                _row_covariance(prior_target_matrix - prior_loo_predictions)
            )
        resolved_bandwidth = float(
            prototype_bandwidth
            if prototype_bandwidth is not None
            else _nearest_neighbor_bandwidth(standardized_summary)
        )

        selected_proposal_mass = float(proposal_mass)
        calibration_count = min(max_terminal_calibration_samples, len(episode_paths))
        if calibration_count > 0:
            calibration_indexes = sorted(
                {
                    round(value)
                    for value in np.linspace(
                        0,
                        len(episode_paths) - 1,
                        num=calibration_count,
                    )
                }
            )
            calibration_episodes = tuple(
                _TerminalCalibrationEpisode(
                    sample_index=index,
                    round_id=str(index_table["round_id"][index]),
                    standardized_summary=np.asarray(standardized_summary[index], dtype=np.float64),
                    query_count=int(query_counts[index]),
                    round_detail=round_detail_from_artifact(episode_paths[index]),
                    terminal_targets={
                        seed_index: target
                        for seed_index, target in sorted(
                            terminal_targets_from_artifact(episode_paths[index]).items()
                        )[:1]
                    },
                )
                for index in calibration_indexes
            )
            if calibration_episodes:
                selected_proposal_mass, resolved_bandwidth = _select_terminal_mixture(
                    calibration_episodes,
                    teacher=teacher,
                    regression_weights=regression_weights,
                    regime_prior_mean=regime_prior_mean,
                    regime_prior_cov=regime_prior_cov,
                    regime_residual_cov=regime_residual_cov,
                    prototype_summary_vectors=standardized_summary,
                    prototype_regime_vectors=regime_matrix,
                    prototype_round_ids=tuple(prototype_round_ids),
                    prototype_count=prototype_count,
                    prototype_bandwidth=resolved_bandwidth,
                    proposal_mass=selected_proposal_mass,
                    prior_mass_floor=prior_mass_floor,
                    terminal_rollouts=terminal_calibration_rollouts,
                    proposal_mass_grid=tuple(float(item) for item in proposal_mass_grid),
                    bandwidth_factor_grid=tuple(float(item) for item in bandwidth_factor_grid),
                )

        return cls(
            dataset_name=dataset.dataset_name,
            summary_feature_names=summary_feature_names or (),
            summary_mean=np.asarray(summary_mean, dtype=np.float64),
            summary_scale=np.asarray(summary_scale, dtype=np.float64),
            prior_feature_names=prior_feature_names or (),
            prior_feature_mean=np.asarray(prior_feature_mean, dtype=np.float64),
            prior_feature_scale=np.asarray(prior_feature_scale, dtype=np.float64),
            prior_regression_weights=np.asarray(prior_regression_weights, dtype=np.float64),
            regime_prior_mean=np.asarray(regime_prior_mean, dtype=np.float64),
            regime_prior_cov=np.asarray(regime_prior_cov, dtype=np.float64),
            conditional_prior_cov=np.asarray(conditional_prior_cov, dtype=np.float64),
            regime_residual_cov=np.asarray(regime_residual_cov, dtype=np.float64),
            regression_weights=np.asarray(regression_weights, dtype=np.float64),
            prototype_summary_vectors=np.asarray(standardized_summary, dtype=np.float64),
            prototype_regime_vectors=np.asarray(regime_matrix, dtype=np.float64),
            ridge_alpha=float(selected_ridge_alpha),
            prior_ridge_alpha=float(selected_prior_ridge_alpha),
            prototype_count=prototype_count,
            prototype_bandwidth=float(resolved_bandwidth),
            proposal_mass=float(selected_proposal_mass),
            prior_mass_floor=float(prior_mass_floor),
            decoder_rollouts=int(decoder_rollouts),
            prototype_round_ids=tuple(prototype_round_ids),
            teacher=teacher,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        teacher_checkpoint_path: Path,
    ) -> StateSpaceStudentCheckpoint:
        return StateSpaceStudentCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            teacher_name=self.teacher.name,
            sample_count=int(self.prototype_regime_vectors.shape[0]),
            summary_dim=int(self.summary_mean.shape[0]),
            regime_dim=int(self.regime_prior_mean.shape[0]),
            ridge_alpha=float(self.ridge_alpha),
            prototype_count=int(self.prototype_count),
            prototype_bandwidth=float(self.prototype_bandwidth),
            proposal_mass=float(self.proposal_mass),
            prior_mass_floor=float(self.prior_mass_floor),
            prior_ridge_alpha=float(self.prior_ridge_alpha),
            decoder_rollouts=int(self.decoder_rollouts),
            probability_floor=self.probability_floor,
            summary_feature_names=list(self.summary_feature_names),
            prior_feature_names=list(self.prior_feature_names),
            prototype_round_ids=list(self.prototype_round_ids),
        )

    def save_checkpoint(self, checkpoint_dir: Path, teacher_checkpoint_path: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "state_space_student.npz"
        json_path = checkpoint_dir / "state_space_student.json"
        np.savez_compressed(
            npz_path,
            summary_mean=self.summary_mean,
            summary_scale=self.summary_scale,
            prior_feature_mean=self.prior_feature_mean,
            prior_feature_scale=self.prior_feature_scale,
            prior_regression_weights=self.prior_regression_weights,
            regime_prior_mean=self.regime_prior_mean,
            regime_prior_cov=self.regime_prior_cov,
            conditional_prior_cov=self.conditional_prior_cov,
            regime_residual_cov=self.regime_residual_cov,
            regression_weights=self.regression_weights,
            prototype_summary_vectors=self.prototype_summary_vectors,
            prototype_regime_vectors=self.prototype_regime_vectors,
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(Path(npz_path.name), teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(
        cls,
        path: Path,
        *,
        teacher: StateSpaceTeacher | None = None,
    ) -> StateSpaceStudent:
        checkpoint = StateSpaceStudentCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8")
        )
        resolved_teacher = teacher
        if resolved_teacher is None:
            teacher_path = Path(checkpoint.teacher_checkpoint_path)
            if not teacher_path.is_absolute():
                teacher_path = (path.parent / teacher_path).resolve()
            resolved_teacher = StateSpaceTeacher.load_checkpoint(teacher_path)
        if resolved_teacher.name != checkpoint.teacher_name:
            raise ValueError(
                "state-space student teacher mismatch: "
                f"checkpoint expects {checkpoint.teacher_name}, got {resolved_teacher.name}"
            )

        npz_path = Path(checkpoint.checkpoint_npz_path)
        if not npz_path.is_absolute():
            npz_path = (path.parent / npz_path).resolve()
        arrays = np.load(npz_path)
        array_names = set(arrays.files)
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            summary_feature_names=tuple(checkpoint.summary_feature_names),
            summary_mean=np.asarray(arrays["summary_mean"], dtype=np.float64),
            summary_scale=np.asarray(arrays["summary_scale"], dtype=np.float64),
            prior_feature_names=tuple(checkpoint.prior_feature_names),
            prior_feature_mean=np.asarray(
                arrays["prior_feature_mean"],
                dtype=np.float64,
            )
            if "prior_feature_mean" in array_names
            else np.zeros((0,), dtype=np.float64),
            prior_feature_scale=np.asarray(
                arrays["prior_feature_scale"],
                dtype=np.float64,
            )
            if "prior_feature_scale" in array_names
            else np.ones((0,), dtype=np.float64),
            prior_regression_weights=np.asarray(
                arrays["prior_regression_weights"],
                dtype=np.float64,
            )
            if "prior_regression_weights" in array_names
            else np.zeros((1, checkpoint.regime_dim), dtype=np.float64),
            regime_prior_mean=np.asarray(arrays["regime_prior_mean"], dtype=np.float64),
            regime_prior_cov=np.asarray(arrays["regime_prior_cov"], dtype=np.float64),
            conditional_prior_cov=np.asarray(
                arrays["conditional_prior_cov"],
                dtype=np.float64,
            )
            if "conditional_prior_cov" in array_names
            else np.asarray(arrays["regime_prior_cov"], dtype=np.float64),
            regime_residual_cov=np.asarray(arrays["regime_residual_cov"], dtype=np.float64),
            regression_weights=np.asarray(arrays["regression_weights"], dtype=np.float64),
            prototype_summary_vectors=np.asarray(
                arrays["prototype_summary_vectors"],
                dtype=np.float64,
            ),
            prototype_regime_vectors=np.asarray(
                arrays["prototype_regime_vectors"],
                dtype=np.float64,
            ),
            ridge_alpha=checkpoint.ridge_alpha,
            prior_ridge_alpha=checkpoint.prior_ridge_alpha,
            prototype_count=checkpoint.prototype_count,
            prototype_bandwidth=checkpoint.prototype_bandwidth,
            proposal_mass=checkpoint.proposal_mass,
            prior_mass_floor=checkpoint.prior_mass_floor,
            decoder_rollouts=checkpoint.decoder_rollouts,
            probability_floor=checkpoint.probability_floor,
            prototype_round_ids=tuple(checkpoint.prototype_round_ids),
            teacher=resolved_teacher,
        )

    def _regime_prior_from_context(
        self,
        context: LiveInferenceContext,
    ) -> tuple[np.ndarray, np.ndarray]:
        if not self.prior_feature_names or self.prior_feature_mean.shape[0] == 0:
            return (
                np.asarray(self.regime_prior_mean, dtype=np.float64),
                np.asarray(self.regime_prior_cov, dtype=np.float64),
            )
        feature_names, feature_vector = build_round_initial_feature_vector(
            context.round_context.to_round_detail(),
            geometry_bundle=context.geometry_bundle,
        )
        if feature_names != self.prior_feature_names:
            raise ValueError("state-space student prior feature names mismatch")
        standardized_features = (
            np.asarray(feature_vector, dtype=np.float64) - self.prior_feature_mean
        ) / self.prior_feature_scale
        prior_mean = _predict_multitarget_ridge(
            standardized_features.reshape(1, -1),
            self.prior_regression_weights,
        )[0]
        prior_cov = (
            self.conditional_prior_cov
            if self.conditional_prior_cov.shape == self.regime_prior_cov.shape
            else self.regime_prior_cov
        )
        return np.asarray(prior_mean, dtype=np.float64), np.asarray(prior_cov, dtype=np.float64)

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        summary_vector = summary_vector_from_context(context)
        if summary_vector.shape[0] != self.summary_mean.shape[0]:
            raise ValueError(
                "state-space student summary vector shape mismatch: "
                f"expected {self.summary_mean.shape[0]}, got {summary_vector.shape[0]}"
            )
        standardized_summary = (
            (np.asarray(summary_vector, dtype=np.float64) - self.summary_mean) / self.summary_scale
        )
        prior_mean, prior_cov = self._regime_prior_from_context(context)
        return _posterior_from_arrays(
            standardized_summary,
            query_count=len(context.observations),
            regression_weights=self.regression_weights,
            regime_prior_mean=prior_mean,
            regime_prior_cov=prior_cov,
            regime_residual_cov=self.regime_residual_cov,
            prototype_summary_vectors=self.prototype_summary_vectors,
            prototype_regime_vectors=self.prototype_regime_vectors,
            prototype_round_ids=self.prototype_round_ids,
            prototype_count=self.prototype_count,
            prototype_bandwidth=self.prototype_bandwidth,
            proposal_mass=self.proposal_mass,
            prior_mass_floor=self.prior_mass_floor,
            exclude_round_id=context.round_context.round_id,
        )

    def _predict_seed_from_posterior(
        self,
        context: LiveInferenceContext,
        *,
        seed_index: int,
        posterior: RegimePosteriorState,
    ) -> np.ndarray:
        return self.decode_seed_from_posterior(
            context,
            seed_index=seed_index,
            posterior=posterior,
            apply_floor=True,
        )

    def decode_seed_from_posterior(
        self,
        context: LiveInferenceContext,
        *,
        seed_index: int,
        posterior: RegimePosteriorState,
        apply_floor: bool = True,
    ) -> np.ndarray:
        prediction = self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
            n_rollouts=self.decoder_rollouts,
        )
        raw_prediction = np.asarray(prediction, dtype=np.float64)
        if not apply_floor:
            return raw_prediction
        initial_grid = np.asarray(
            context.round_context.seeds[seed_index].initial_state.grid,
            dtype=np.int64,
        )
        return np.asarray(
            apply_probability_floor(
                raw_prediction,
                self.probability_floor,
                initial_grid=initial_grid,
            ),
            dtype=np.float64,
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self._predict_seed_from_posterior(
            context,
            seed_index=seed_index,
            posterior=posterior,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        posterior = self.infer_regime(context)
        predictions_by_seed = {
            seed.seed_index: self._predict_seed_from_posterior(
                context,
                seed_index=seed.seed_index,
                posterior=posterior,
            )
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["StateSpaceStudent", "StateSpaceStudentCheckpoint"]
