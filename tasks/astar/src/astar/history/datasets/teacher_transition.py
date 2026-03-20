from __future__ import annotations

import json

import polars as pl

from astar.history.datasets.base import DatasetRef
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable


def build_teacher_transition_dataset(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "teacher_transition_v1",
) -> DatasetRef:
    selected_round_ids = round_ids or sorted(
        path.stem
        for path in paths.raw_dir.joinpath("rounds").glob("*.json")
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "transitions.parquet"
    summary_path = dataset_dir / "summary.json"

    rows: list[dict[str, int | str | float]] = []
    replay_run_count = 0
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        for seed in episode.seeds:
            for run in seed.replay_runs:
                replay_run_count += 1
                for step in range(len(run.frames) - 1):
                    current = run.frames[step]
                    nxt = run.frames[step + 1]
                    current_built = (
                        (current.grid == 1) | (current.grid == 2) | (current.grid == 3)
                    ).sum()
                    next_built = (
                        (nxt.grid == 1) | (nxt.grid == 2) | (nxt.grid == 3)
                    ).sum()
                    rows.append(
                        {
                            "round_id": round_id,
                            "round_number": int(episode.metadata.round_number or -1),
                            "seed_index": seed.seed_index,
                            "replay_run_id": run.replay_run_id,
                            "step": step,
                            "alive_count": sum(1 for item in current.settlements if item.alive),
                            "port_count": sum(1 for item in current.settlements if item.has_port),
                            "ruin_cell_count": int((current.grid == 3).sum()),
                            "built_cell_count": int(current_built),
                            "next_alive_count": sum(1 for item in nxt.settlements if item.alive),
                            "next_port_count": sum(1 for item in nxt.settlements if item.has_port),
                            "next_ruin_cell_count": int((nxt.grid == 3).sum()),
                            "next_built_cell_count": int(next_built),
                        },
                    )

    table = pl.DataFrame(rows)
    table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "teacher_transition",
        "row_count": table.height,
        "round_count": len(selected_round_ids),
        "replay_run_count": replay_run_count,
        "index_path": str(index_path),
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
        dataset_kind="teacher_transition",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=table.height,
        round_count=len(selected_round_ids),
    )
