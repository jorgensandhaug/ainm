from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from astar.history.summaries.event_summary import build_round_event_summary
from astar.history.summaries.events import load_replay_event_tables
from astar.history.summaries.factorization import (
    RoundSummaryFactorization,
    factorize_summary_matrix,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.summarize_replays import summarize_round_replays


def _replay_seed_indexes(
    paths: WorkspacePaths,
    round_id: str,
    *,
    seed_count: int,
) -> list[int]:
    replay_seed_indexes: list[int] = []
    for seed_index in range(seed_count):
        replay_dir = paths.raw_replay_dir(round_id, seed_index)
        if (
            paths.replay_cell_event_path(round_id, seed_index).exists()
            and paths.replay_settlement_event_path(round_id, seed_index).exists()
        ):
            replay_seed_indexes.append(seed_index)
            continue
        if replay_dir.exists() and any(replay_dir.glob("*.json")):
            replay_seed_indexes.append(seed_index)
    return replay_seed_indexes


def factorize_round_event_summary_subspace(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 3,
    summary_name: str = "round_event_summary_subspace_v1",
) -> tuple[RoundSummaryFactorization, Path, Path]:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )

    summary_names: list[str] | None = None
    row_round_ids: list[str] = []
    row_round_numbers: list[int] = []
    row_sample_counts: list[int] = []
    row_vectors: list[list[float]] = []

    for round_id in selected_round_ids:
        round_record = read_round_record(paths, round_id)
        replay_seed_indexes = _replay_seed_indexes(
            paths,
            round_id,
            seed_count=round_record.round.seeds_count,
        )
        bundles = [
            bundle
            for seed_index in replay_seed_indexes
            if (bundle := load_replay_event_tables(paths, round_id, seed_index)) is not None
        ]
        if len(bundles) != len(replay_seed_indexes) and replay_seed_indexes:
            summarize_round_replays(paths, round_id)
            bundles = [
                bundle
                for seed_index in replay_seed_indexes
                if (bundle := load_replay_event_tables(paths, round_id, seed_index)) is not None
            ]
        if not bundles:
            continue
        round_summary = build_round_event_summary(
            round_id=round_id,
            round_number=round_record.round.round_number,
            bundles=bundles,
        )
        if summary_names is None:
            summary_names = list(round_summary.summary_names)
        row_round_ids.append(round_summary.round_id)
        row_round_numbers.append(round_summary.round_number)
        row_sample_counts.append(
            sum(
                seed_summary.frame_transition_count
                for seed_summary in round_summary.seed_summaries
            ),
        )
        row_vectors.append(round_summary.summary_mean.tolist())

    if not row_vectors or summary_names is None:
        raise ValueError("no replay-backed round event summaries available for factorization")

    factorization = factorize_summary_matrix(
        summary_kind="event_summary",
        summary_names=summary_names,
        round_ids=row_round_ids,
        round_numbers=row_round_numbers,
        sample_counts=row_sample_counts,
        summary_matrix=row_vectors,
        max_rank=max_rank,
    )

    artifact_dir = paths.artifacts_dir / "replays" / "manifold"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    summary_path = artifact_dir / f"{summary_name}.json"
    basis_path = artifact_dir / f"{summary_name}.npz"
    summary_path.write_text(json.dumps(to_jsonable(factorization), indent=2), encoding="utf-8")

    np.savez_compressed(
        basis_path,
        summary_matrix=factorization.summary_matrix,
        mean_vector=factorization.mean_vector,
        singular_values=factorization.singular_values,
        explained_variance_ratio=factorization.explained_variance_ratio,
        basis=factorization.basis,
        coordinates=factorization.coordinates,
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="round_manifold_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=to_jsonable(factorization),
            spec_name=summary_name,
        ),
    )
    return factorization, summary_path, basis_path


__all__ = ["factorize_round_event_summary_subspace"]
