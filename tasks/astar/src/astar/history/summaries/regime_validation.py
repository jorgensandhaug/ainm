from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.behavioral_fingerprint import (
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
)
from astar.history.summaries.behavioral_fingerprint_core import (
    behavioral_fingerprint_core_column_scale,
    select_behavioral_fingerprint_core,
)
from astar.history.summaries.behavioral_fingerprint_manifold import (
    load_or_build_round_behavioral_fingerprint_measurement_bundles,
)
from astar.history.summaries.factorization import (
    factorize_summary_matrix,
    project_summary_vector,
    reconstruct_summary_vector,
)
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients,
    seed_empirical_terminal_probs,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


class RegimeHeldoutRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    reconstruction_mae: float = Field(ge=0.0)
    reconstruction_rmse: float = Field(ge=0.0)
    reconstruction_baseline_mae: float = Field(ge=0.0)
    reconstruction_baseline_rmse: float = Field(ge=0.0)
    reconstruction_cosine_similarity: float | None = None
    coefficient_l2: float = Field(ge=0.0)
    baseline_coefficient_l2: float = Field(ge=0.0)
    terminal_l1: float = Field(ge=0.0)
    baseline_terminal_l1: float = Field(ge=0.0)
    regime_norm: float = Field(ge=0.0)


class RegimeRankValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    rank: int = Field(ge=1)
    round_count: int = Field(ge=1)
    summary_dim: int = Field(ge=1)
    explained_variance_ratio: tuple[float, ...]
    cumulative_explained_variance: float | None = None
    mean_reconstruction_mae: float | None = None
    mean_reconstruction_rmse: float | None = None
    mean_reconstruction_baseline_mae: float | None = None
    mean_reconstruction_baseline_rmse: float | None = None
    mean_reconstruction_mae_improvement: float | None = None
    mean_reconstruction_rmse_improvement: float | None = None
    mean_reconstruction_cosine_similarity: float | None = None
    mean_coefficient_l2: float | None = None
    mean_baseline_coefficient_l2: float | None = None
    mean_coefficient_l2_improvement: float | None = None
    mean_terminal_l1: float | None = None
    mean_baseline_terminal_l1: float | None = None
    mean_terminal_l1_improvement: float | None = None
    heldout_round_results: tuple[RegimeHeldoutRoundResult, ...]


class BehavioralFingerprintCoreRoundEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    summary_names: tuple[str, ...]
    summary_vector: np.ndarray
    summary_std: np.ndarray
    coefficient_vector: np.ndarray


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate(
        [np.ones((inputs.shape[0], 1), dtype=np.float64), inputs],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ targets
    try:
        solution = np.linalg.solve(lhs, rhs)
    except np.linalg.LinAlgError:
        solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _cosine_similarity(lhs: np.ndarray, rhs: np.ndarray) -> float | None:
    lhs_norm = float(np.linalg.norm(lhs))
    rhs_norm = float(np.linalg.norm(rhs))
    if lhs_norm <= 0.0 or rhs_norm <= 0.0:
        return None
    return float(np.dot(lhs, rhs) / (lhs_norm * rhs_norm))


def _metric_mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.mean(np.asarray(values, dtype=np.float64)))


def estimate_behavioral_fingerprint_core_rounds(
    paths: WorkspacePaths,
    *,
    episodes: list[RoundEpisode],
    bootstrap_samples: int = 4,
    rng_seed: int = 0,
) -> tuple[tuple[str, ...], tuple[BehavioralFingerprintCoreRoundEstimate, ...]]:
    probe_library = build_behavioral_fingerprint_probe_library([], [], [], [], [])
    estimates: list[BehavioralFingerprintCoreRoundEstimate] = []
    summary_names: tuple[str, ...] | None = None
    for episode in episodes:
        if episode.replay_run_count <= 0:
            continue
        round_number, bundles = load_or_build_round_behavioral_fingerprint_measurement_bundles(
            paths,
            episode.metadata.round_id,
        )
        if not bundles:
            continue
        estimate = estimate_round_behavioral_fingerprint(
            round_id=episode.metadata.round_id,
            round_number=round_number,
            bundles=bundles,
            probe_library=probe_library,
            bootstrap_samples=bootstrap_samples,
            rng_seed=rng_seed,
        )
        selection = select_behavioral_fingerprint_core(
            estimate.summary_names,
            estimate.summary_vector,
            estimate.summary_std,
        )
        if summary_names is None:
            summary_names = tuple(selection.summary_names)
        elif tuple(selection.summary_names) != summary_names:
            raise ValueError("behavioral fingerprint core names drifted across rounds")
        coefficient_row = fit_round_semimechanistic_coefficients(episode)
        estimates.append(
            BehavioralFingerprintCoreRoundEstimate(
                round_id=episode.metadata.round_id,
                round_number=int(episode.metadata.round_number or -1),
                sample_count=int(estimate.sample_count),
                summary_names=tuple(selection.summary_names),
                summary_vector=np.asarray(selection.summary_vector, dtype=np.float64),
                summary_std=np.asarray(
                    selection.summary_std
                    if selection.summary_std is not None
                    else np.zeros_like(selection.summary_vector, dtype=np.float64),
                    dtype=np.float64,
                ),
                coefficient_vector=coefficient_row.combined_vector(),
            )
        )
    if summary_names is None or not estimates:
        raise ValueError("no replay-backed behavioral fingerprint core estimates available")
    return summary_names, tuple(estimates)


def evaluate_regime_rank(
    summary_names: tuple[str, ...],
    round_estimates: tuple[BehavioralFingerprintCoreRoundEstimate, ...],
    round_episodes: dict[str, RoundEpisode],
    *,
    rank: int,
    ridge_alpha: float = 1e-2,
) -> RegimeRankValidationReport:
    if len(round_estimates) <= 1:
        raise ValueError("regime validation requires at least two replay-backed rounds")

    summary_matrix = np.stack([item.summary_vector for item in round_estimates], axis=0)
    summary_std_matrix = np.stack([item.summary_std for item in round_estimates], axis=0)
    coefficient_matrix = np.stack([item.coefficient_vector for item in round_estimates], axis=0)
    feature_names = list(
        fit_round_semimechanistic_coefficients(
            round_episodes[round_estimates[0].round_id]
        ).feature_names
    )
    full_scale = behavioral_fingerprint_core_column_scale(summary_matrix, summary_std_matrix)
    full_factorization = factorize_summary_matrix(
        summary_kind="behavioral_fingerprint_core",
        summary_names=list(summary_names),
        round_ids=[item.round_id for item in round_estimates],
        round_numbers=[item.round_number for item in round_estimates],
        sample_counts=[item.sample_count for item in round_estimates],
        summary_matrix=summary_matrix,
        max_rank=rank,
        column_scale=full_scale,
    )
    decoder = HazardTeacher(
        name="regime_validation_decoder",
        summary_backend="behavioral_fingerprint_core",
        feature_names=feature_names,
    )

    round_results: list[RegimeHeldoutRoundResult] = []
    for heldout_index, heldout in enumerate(round_estimates):
        keep_mask = np.ones(len(round_estimates), dtype=bool)
        keep_mask[heldout_index] = False
        train_summary_matrix = summary_matrix[keep_mask]
        train_std_matrix = summary_std_matrix[keep_mask]
        train_coefficient_matrix = coefficient_matrix[keep_mask]
        train_scale = behavioral_fingerprint_core_column_scale(
            train_summary_matrix,
            train_std_matrix,
        )
        train_factorization = factorize_summary_matrix(
            summary_kind="behavioral_fingerprint_core",
            summary_names=list(summary_names),
            round_ids=[
                round_estimates[index].round_id
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            round_numbers=[
                round_estimates[index].round_number
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            sample_counts=[
                round_estimates[index].sample_count
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            summary_matrix=train_summary_matrix,
            max_rank=rank,
            column_scale=train_scale,
        )
        heldout_coords = project_summary_vector(train_factorization, heldout.summary_vector)
        reconstructed = reconstruct_summary_vector(train_factorization, heldout_coords)
        baseline_summary = np.asarray(train_factorization.mean_vector, dtype=np.float64)
        reconstruction_error = heldout.summary_vector - reconstructed
        baseline_reconstruction_error = heldout.summary_vector - baseline_summary

        intercept, weights = _fit_linear_map(
            train_factorization.coordinates,
            train_coefficient_matrix,
            ridge_alpha=ridge_alpha,
        )
        predicted_coefficients = np.asarray(
            intercept + heldout_coords @ weights,
            dtype=np.float64,
        )
        baseline_coefficients = np.asarray(
            np.mean(train_coefficient_matrix, axis=0),
            dtype=np.float64,
        )

        heldout_episode = round_episodes[heldout.round_id]
        terminal_l1_values: list[float] = []
        baseline_terminal_l1_values: list[float] = []
        for seed in heldout_episode.seeds:
            actual_terminal = seed_empirical_terminal_probs(seed)
            if actual_terminal is None:
                continue
            predicted_terminal = decoder._decode_terminal_tensor(seed, predicted_coefficients)
            baseline_terminal = decoder._decode_terminal_tensor(seed, baseline_coefficients)
            terminal_l1_values.append(
                float(np.mean(np.abs(predicted_terminal - actual_terminal))),
            )
            baseline_terminal_l1_values.append(
                float(np.mean(np.abs(baseline_terminal - actual_terminal))),
            )
        if not terminal_l1_values:
            raise ValueError(f"round {heldout.round_id} produced no terminal targets")

        round_results.append(
            RegimeHeldoutRoundResult(
                round_id=heldout.round_id,
                round_number=heldout.round_number,
                sample_count=heldout.sample_count,
                reconstruction_mae=float(np.mean(np.abs(reconstruction_error))),
                reconstruction_rmse=float(np.sqrt(np.mean(reconstruction_error**2))),
                reconstruction_baseline_mae=float(
                    np.mean(np.abs(baseline_reconstruction_error))
                ),
                reconstruction_baseline_rmse=float(
                    np.sqrt(np.mean(baseline_reconstruction_error**2))
                ),
                reconstruction_cosine_similarity=_cosine_similarity(
                    heldout.summary_vector,
                    reconstructed,
                ),
                coefficient_l2=float(
                    np.linalg.norm(predicted_coefficients - heldout.coefficient_vector),
                ),
                baseline_coefficient_l2=float(
                    np.linalg.norm(baseline_coefficients - heldout.coefficient_vector),
                ),
                terminal_l1=float(np.mean(np.asarray(terminal_l1_values, dtype=np.float64))),
                baseline_terminal_l1=float(
                    np.mean(np.asarray(baseline_terminal_l1_values, dtype=np.float64))
                ),
                regime_norm=float(np.linalg.norm(heldout_coords)),
            )
        )

    mean_reconstruction_mae = _metric_mean(
        [item.reconstruction_mae for item in round_results]
    )
    mean_reconstruction_rmse = _metric_mean(
        [item.reconstruction_rmse for item in round_results]
    )
    mean_reconstruction_baseline_mae = _metric_mean(
        [item.reconstruction_baseline_mae for item in round_results]
    )
    mean_reconstruction_baseline_rmse = _metric_mean(
        [item.reconstruction_baseline_rmse for item in round_results]
    )
    mean_coefficient_l2 = _metric_mean([item.coefficient_l2 for item in round_results])
    mean_baseline_coefficient_l2 = _metric_mean(
        [item.baseline_coefficient_l2 for item in round_results]
    )
    mean_terminal_l1 = _metric_mean([item.terminal_l1 for item in round_results])
    mean_baseline_terminal_l1 = _metric_mean(
        [item.baseline_terminal_l1 for item in round_results]
    )
    cosine_values = [
        item.reconstruction_cosine_similarity
        for item in round_results
        if item.reconstruction_cosine_similarity is not None
    ]

    return RegimeRankValidationReport(
        rank=rank,
        round_count=len(round_estimates),
        summary_dim=len(summary_names),
        explained_variance_ratio=tuple(
            float(value) for value in full_factorization.explained_variance_ratio
        ),
        cumulative_explained_variance=float(
            np.sum(full_factorization.explained_variance_ratio)
        )
        if full_factorization.explained_variance_ratio.size > 0
        else None,
        mean_reconstruction_mae=mean_reconstruction_mae,
        mean_reconstruction_rmse=mean_reconstruction_rmse,
        mean_reconstruction_baseline_mae=mean_reconstruction_baseline_mae,
        mean_reconstruction_baseline_rmse=mean_reconstruction_baseline_rmse,
        mean_reconstruction_mae_improvement=(
            None
            if mean_reconstruction_mae is None or mean_reconstruction_baseline_mae is None
            else float(mean_reconstruction_baseline_mae - mean_reconstruction_mae)
        ),
        mean_reconstruction_rmse_improvement=(
            None
            if mean_reconstruction_rmse is None or mean_reconstruction_baseline_rmse is None
            else float(mean_reconstruction_baseline_rmse - mean_reconstruction_rmse)
        ),
        mean_reconstruction_cosine_similarity=_metric_mean(
            [float(value) for value in cosine_values]
        ),
        mean_coefficient_l2=mean_coefficient_l2,
        mean_baseline_coefficient_l2=mean_baseline_coefficient_l2,
        mean_coefficient_l2_improvement=(
            None
            if mean_coefficient_l2 is None or mean_baseline_coefficient_l2 is None
            else float(mean_baseline_coefficient_l2 - mean_coefficient_l2)
        ),
        mean_terminal_l1=mean_terminal_l1,
        mean_baseline_terminal_l1=mean_baseline_terminal_l1,
        mean_terminal_l1_improvement=(
            None
            if mean_terminal_l1 is None or mean_baseline_terminal_l1 is None
            else float(mean_baseline_terminal_l1 - mean_terminal_l1)
        ),
        heldout_round_results=tuple(round_results),
    )


__all__ = [
    "BehavioralFingerprintCoreRoundEstimate",
    "RegimeHeldoutRoundResult",
    "RegimeRankValidationReport",
    "estimate_behavioral_fingerprint_core_rounds",
    "evaluate_regime_rank",
]
