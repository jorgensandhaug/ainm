from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import (
    RoundSemimechanisticCoefficients,
    fit_round_semimechanistic_coefficients,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable


class RoundRegimeManifold(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    feature_names: list[str]
    round_ids: tuple[str, ...]
    round_numbers: tuple[int, ...]
    sample_counts: tuple[int, ...]
    regime_matrix: np.ndarray
    coefficient_matrix: np.ndarray
    mean_vector: np.ndarray
    singular_values: np.ndarray
    explained_variance_ratio: np.ndarray
    basis: np.ndarray
    coordinates: np.ndarray
    candidate_ranks: tuple[int, ...] = ()
    rank_scores: tuple[float, ...] = ()
    rank_selection: str = "fixed_max_rank"
    effective_rank: int = Field(ge=1)


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
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _factorize_matrices(
    *,
    coefficient_matrix: np.ndarray,
    regime_matrix: np.ndarray,
    feature_names: list[str],
    round_ids: tuple[str, ...],
    round_numbers: tuple[int, ...],
    sample_counts: tuple[int, ...],
    effective_rank: int,
    candidate_ranks: tuple[int, ...] = (),
    rank_scores: tuple[float, ...] = (),
    rank_selection: str = "fixed_max_rank",
) -> RoundRegimeManifold:
    mean_vector = np.mean(coefficient_matrix, axis=0)
    centered = coefficient_matrix - mean_vector[None, :]
    _, singular_values, vt_matrix = np.linalg.svd(centered, full_matrices=False)
    clipped_rank = max(1, min(effective_rank, vt_matrix.shape[0]))
    basis = vt_matrix[:clipped_rank]
    coordinates = centered @ basis.T
    variance = singular_values**2
    variance_sum = float(np.sum(variance))
    if variance_sum > 0.0:
        explained_variance_ratio = variance[:clipped_rank] / variance_sum
    else:
        explained_variance_ratio = np.zeros(clipped_rank, dtype=np.float64)
    return RoundRegimeManifold(
        feature_names=feature_names,
        round_ids=round_ids,
        round_numbers=round_numbers,
        sample_counts=sample_counts,
        regime_matrix=np.asarray(regime_matrix, dtype=np.float64),
        coefficient_matrix=np.asarray(coefficient_matrix, dtype=np.float64),
        mean_vector=np.asarray(mean_vector, dtype=np.float64),
        singular_values=np.asarray(singular_values, dtype=np.float64),
        explained_variance_ratio=np.asarray(explained_variance_ratio, dtype=np.float64),
        basis=np.asarray(basis, dtype=np.float64),
        coordinates=np.asarray(coordinates, dtype=np.float64),
        candidate_ranks=tuple(int(item) for item in candidate_ranks),
        rank_scores=tuple(float(item) for item in rank_scores),
        rank_selection=rank_selection,
        effective_rank=clipped_rank,
    )


def _loo_rank_scores(
    coefficient_matrix: np.ndarray,
    regime_matrix: np.ndarray,
    *,
    candidate_ranks: tuple[int, ...],
    ridge_alpha: float,
) -> tuple[float, ...]:
    round_count = int(coefficient_matrix.shape[0])
    if round_count <= 1:
        return tuple(0.0 for _ in candidate_ranks)

    scores: list[float] = []
    for rank in candidate_ranks:
        fold_errors: list[float] = []
        for held_out_index in range(round_count):
            train_mask = np.ones(round_count, dtype=bool)
            train_mask[held_out_index] = False
            train_coefficients = coefficient_matrix[train_mask]
            train_regimes = regime_matrix[train_mask]
            train_manifold = _factorize_matrices(
                coefficient_matrix=train_coefficients,
                regime_matrix=train_regimes,
                feature_names=[],
                round_ids=tuple(),
                round_numbers=tuple(),
                sample_counts=tuple(),
                effective_rank=rank,
            )
            coord_intercept, coord_weights = fit_regime_coordinate_map(
                train_manifold,
                train_regimes,
                ridge_alpha=ridge_alpha,
            )
            held_out_regime = regime_matrix[held_out_index]
            predicted_coordinates = np.asarray(
                coord_intercept + (held_out_regime @ coord_weights),
                dtype=np.float64,
            )
            reconstructed = reconstruct_coefficients(train_manifold, predicted_coordinates)
            fold_errors.append(
                float(
                    np.mean(
                        (reconstructed - coefficient_matrix[held_out_index]) ** 2,
                    ),
                ),
            )
        scores.append(float(np.mean(fold_errors)))
    return tuple(scores)


def factorize_round_coefficients(
    coefficient_rows: list[RoundSemimechanisticCoefficients],
    *,
    max_rank: int = 3,
    rank_selection: str = "loo_reconstruction_mse",
    ridge_alpha: float = 1e-2,
) -> RoundRegimeManifold:
    if not coefficient_rows:
        raise ValueError("no round coefficients available for factorization")
    coefficient_matrix = np.stack(
        [row.combined_vector() for row in coefficient_rows],
        axis=0,
    ).astype(np.float64)
    regime_matrix = np.stack(
        [row.regime_vector for row in coefficient_rows],
        axis=0,
    ).astype(np.float64)
    feature_names = coefficient_rows[0].feature_names
    round_ids = tuple(row.round_id for row in coefficient_rows)
    round_numbers = tuple(row.round_number for row in coefficient_rows)
    sample_counts = tuple(row.sample_count for row in coefficient_rows)
    candidate_ranks = tuple(range(1, max(1, min(max_rank, coefficient_matrix.shape[0])) + 1))

    if rank_selection == "fixed_max_rank":
        effective_rank = candidate_ranks[-1]
        rank_scores = tuple()
    elif rank_selection == "loo_reconstruction_mse":
        rank_scores = _loo_rank_scores(
            coefficient_matrix,
            regime_matrix,
            candidate_ranks=candidate_ranks,
            ridge_alpha=ridge_alpha,
        )
        effective_rank = candidate_ranks[int(np.argmin(np.asarray(rank_scores, dtype=np.float64)))]
    else:
        raise ValueError(f"unsupported rank selection mode: {rank_selection}")

    return _factorize_matrices(
        coefficient_matrix=coefficient_matrix,
        regime_matrix=regime_matrix,
        feature_names=feature_names,
        round_ids=round_ids,
        round_numbers=round_numbers,
        sample_counts=sample_counts,
        effective_rank=effective_rank,
        candidate_ranks=candidate_ranks,
        rank_scores=rank_scores,
        rank_selection=rank_selection,
    )


def project_coefficients(
    manifold: RoundRegimeManifold,
    coefficient_vector: np.ndarray,
) -> np.ndarray:
    centered = np.asarray(coefficient_vector, dtype=np.float64) - manifold.mean_vector
    return np.asarray(centered @ manifold.basis.T, dtype=np.float64)


def reconstruct_coefficients(
    manifold: RoundRegimeManifold,
    coordinates: np.ndarray,
) -> np.ndarray:
    coordinates_array = np.asarray(coordinates, dtype=np.float64)
    return np.asarray(
        manifold.mean_vector + coordinates_array @ manifold.basis,
        dtype=np.float64,
    )


def fit_regime_coordinate_map(
    manifold: RoundRegimeManifold,
    regime_matrix: np.ndarray,
    *,
    ridge_alpha: float = 1e-2,
) -> tuple[np.ndarray, np.ndarray]:
    regimes = np.asarray(regime_matrix, dtype=np.float64)
    if regimes.ndim != 2:
        raise ValueError(f"expected 2D regime matrix, got shape {regimes.shape!r}")
    if regimes.shape[0] != manifold.coordinates.shape[0]:
        raise ValueError(
            "regime rows must match manifold coordinates rows: "
            f"{regimes.shape[0]} vs {manifold.coordinates.shape[0]}",
        )
    return _fit_linear_map(
        regimes,
        np.asarray(manifold.coordinates, dtype=np.float64),
        ridge_alpha=ridge_alpha,
    )


def factorize_round_regime_manifold(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 3,
    rank_selection: str = "loo_reconstruction_mse",
    ridge_alpha: float = 1e-2,
    summary_name: str = "round_regime_manifold_v1",
) -> tuple[RoundRegimeManifold, Path, Path]:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    coefficient_rows: list[RoundSemimechanisticCoefficients] = []
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        if episode.replay_run_count == 0:
            continue
        coefficient_rows.append(fit_round_semimechanistic_coefficients(episode))
    manifold = factorize_round_coefficients(
        coefficient_rows,
        max_rank=max_rank,
        rank_selection=rank_selection,
        ridge_alpha=ridge_alpha,
    )

    artifact_dir = paths.artifacts_dir / "replays" / "manifold"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    summary_path = artifact_dir / f"{summary_name}.json"
    basis_path = artifact_dir / f"{summary_name}.npz"
    summary_path.write_text(json.dumps(to_jsonable(manifold), indent=2), encoding="utf-8")
    np.savez_compressed(
        basis_path,
        regime_matrix=manifold.regime_matrix,
        coefficient_matrix=manifold.coefficient_matrix,
        mean_vector=manifold.mean_vector,
        singular_values=manifold.singular_values,
        explained_variance_ratio=manifold.explained_variance_ratio,
        basis=manifold.basis,
        coordinates=manifold.coordinates,
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="round_manifold_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=to_jsonable(manifold),
            spec_name=summary_name,
        ),
    )
    return manifold, summary_path, basis_path


__all__ = [
    "RoundRegimeManifold",
    "factorize_round_coefficients",
    "factorize_round_regime_manifold",
    "fit_regime_coordinate_map",
    "project_coefficients",
    "reconstruct_coefficients",
]
