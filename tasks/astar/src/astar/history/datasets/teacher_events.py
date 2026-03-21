from __future__ import annotations

import json

import polars as pl

from astar.history.datasets.base import DatasetRef
from astar.history.episodes.build import build_round_episode
from astar.history.replay.events import (
    extract_cell_transition_rows,
    extract_graph_snapshot_rows,
    extract_settlement_event_rows,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable


def _empty_cell_table() -> pl.DataFrame:
    return pl.DataFrame(
        schema={
            "round_id": pl.Utf8,
            "round_number": pl.Int64,
            "seed_index": pl.Int64,
            "replay_run_id": pl.Utf8,
            "step": pl.Int64,
            "x": pl.Int64,
            "y": pl.Int64,
            "current_class": pl.Int64,
            "next_class": pl.Int64,
            "transition_name": pl.Utf8,
            "is_birth": pl.Int64,
            "is_port_gain": pl.Int64,
            "is_collapse_to_ruin": pl.Int64,
            "is_ruin_rebuild": pl.Int64,
            "is_ruin_to_forest": pl.Int64,
            "is_ruin_to_open": pl.Int64,
        },
    )


def _empty_settlement_table() -> pl.DataFrame:
    return pl.DataFrame(
        schema={
            "round_id": pl.Utf8,
            "round_number": pl.Int64,
            "seed_index": pl.Int64,
            "replay_run_id": pl.Utf8,
            "step": pl.Int64,
            "x": pl.Int64,
            "y": pl.Int64,
            "current_class": pl.Int64,
            "next_class": pl.Int64,
            "current_alive": pl.Int64,
            "next_alive": pl.Int64,
            "is_birth": pl.Int64,
            "is_death": pl.Int64,
            "is_port_gain": pl.Int64,
            "is_owner_switch": pl.Int64,
            "delta_population": pl.Float64,
            "delta_food": pl.Float64,
            "delta_wealth": pl.Float64,
            "delta_defense": pl.Float64,
        },
    )


def _empty_graph_table() -> pl.DataFrame:
    return pl.DataFrame(
        schema={
            "round_id": pl.Utf8,
            "round_number": pl.Int64,
            "seed_index": pl.Int64,
            "replay_run_id": pl.Utf8,
            "step": pl.Int64,
            "src_x": pl.Int64,
            "src_y": pl.Int64,
            "dst_x": pl.Int64,
            "dst_y": pl.Int64,
            "manhattan_distance": pl.Int64,
            "euclidean_distance": pl.Float64,
            "same_owner": pl.Int64,
            "both_ports": pl.Int64,
        },
    )


def build_teacher_event_dataset(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "teacher_events_v1",
) -> DatasetRef:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    cell_path = dataset_dir / "cell_transitions.parquet"
    settlement_path = dataset_dir / "settlement_events.parquet"
    graph_path = dataset_dir / "graph_snapshots.parquet"
    summary_path = dataset_dir / "summary.json"

    cell_rows: list[dict[str, object]] = []
    settlement_rows: list[dict[str, object]] = []
    graph_rows: list[dict[str, object]] = []
    replay_run_count = 0
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        replay_run_count += episode.replay_run_count
        cell_rows.extend(extract_cell_transition_rows(episode))
        settlement_rows.extend(extract_settlement_event_rows(episode))
        graph_rows.extend(extract_graph_snapshot_rows(episode))

    cell_table = pl.DataFrame(cell_rows) if cell_rows else _empty_cell_table()
    settlement_table = pl.DataFrame(settlement_rows) if settlement_rows else _empty_settlement_table()
    graph_table = pl.DataFrame(graph_rows) if graph_rows else _empty_graph_table()
    cell_table.write_parquet(cell_path)
    settlement_table.write_parquet(settlement_path)
    graph_table.write_parquet(graph_path)

    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "teacher_events",
        "round_count": len(selected_round_ids),
        "replay_run_count": replay_run_count,
        "cell_transition_rows": cell_table.height,
        "settlement_event_rows": settlement_table.height,
        "graph_snapshot_rows": graph_table.height,
        "cell_transition_path": str(cell_path),
        "settlement_event_path": str(settlement_path),
        "graph_snapshot_path": str(graph_path),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="dataset_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=summary,
            spec_name=dataset_name,
        ),
    )
    return DatasetRef(
        dataset_name=dataset_name,
        dataset_kind="teacher_events",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=cell_path,
        row_count=cell_table.height,
        round_count=len(selected_round_ids),
    )


__all__ = ["build_teacher_event_dataset"]
