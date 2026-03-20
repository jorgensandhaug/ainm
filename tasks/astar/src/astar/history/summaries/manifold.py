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
    effective_rank: int = Field(ge=1)


def factorize_round_coefficients(
    coefficient_rows: list[RoundSemimechanisticCoefficients],
    *,
    max_rank: int = 3,
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
    mean_vector = np.mean(coefficient_matrix, axis=0)
    centered = coefficient_matrix - mean_vector[None, :]
    _, singular_values, vt_matrix = np.linalg.svd(centered, full_matrices=False)
    effective_rank = max(1, min(max_rank, vt_matrix.shape[0]))
    basis = vt_matrix[:effective_rank]
    coordinates = centered @ basis.T
    variance = singular_values**2
    variance_sum = float(np.sum(variance))
    if variance_sum > 0.0:
        explained_variance_ratio = variance[:effective_rank] / variance_sum
    else:
        explained_variance_ratio = np.zeros(effective_rank, dtype=np.float64)
    return RoundRegimeManifold(
        feature_names=coefficient_rows[0].feature_names,
        round_ids=tuple(row.round_id for row in coefficient_rows),
        round_numbers=tuple(row.round_number for row in coefficient_rows),
        sample_counts=tuple(row.sample_count for row in coefficient_rows),
        regime_matrix=regime_matrix,
        coefficient_matrix=coefficient_matrix,
        mean_vector=mean_vector,
        singular_values=singular_values,
        explained_variance_ratio=np.asarray(explained_variance_ratio, dtype=np.float64),
        basis=np.asarray(basis, dtype=np.float64),
        coordinates=np.asarray(coordinates, dtype=np.float64),
        effective_rank=effective_rank,
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


def factorize_round_regime_manifold(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 3,
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
    manifold = factorize_round_coefficients(coefficient_rows, max_rank=max_rank)

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
    "project_coefficients",
    "reconstruct_coefficients",
]
