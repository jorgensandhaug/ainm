from __future__ import annotations

import json

import polars as pl

from astar.history.datasets.base import DatasetRef
from astar.history.learning import load_round_learning_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.materialize_episode import materialize_round_episode


def build_teacher_terminal_dataset(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "teacher_terminal_v1",
) -> DatasetRef:
    selected_round_ids = round_ids or sorted(
        path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json")
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "terminal_targets.parquet"
    summary_path = dataset_dir / "summary.json"

    rows: list[dict[str, str | int]] = []
    for round_id in selected_round_ids:
        materialize_round_episode(paths, round_id)
        episode = load_round_learning_episode(paths, round_id)
        for seed_index, seed in sorted(episode.per_seed.items()):
            target_source = None
            target_path = None
            if seed.ground_truth is not None:
                target_source = "analysis_ground_truth"
                target_path = paths.analysis_tensor_path(round_id, seed_index)
            elif seed.replay_mean_terminal_probs is not None:
                target_source = "replay_mean_terminal_probs"
                target_path = paths.replay_summary_path(round_id, seed_index)
            if target_source is None or target_path is None:
                continue
            rows.append(
                {
                    "round_id": round_id,
                    "round_number": episode.round_number,
                    "seed_index": seed_index,
                    "target_source": target_source,
                    "target_path": str(target_path),
                    "feature_path": str(paths.feature_tensor_path(round_id, seed_index)),
                    "evidence_path": str(paths.evidence_tensor_path(round_id, seed_index)),
                    "replay_summary_path": str(paths.replay_summary_path(round_id, seed_index)),
                    "query_count": seed.query_count,
                    "replay_run_count": seed.replay_run_count,
                },
            )

    table = pl.DataFrame(rows)
    table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "teacher_terminal",
        "row_count": table.height,
        "round_count": len({row["round_id"] for row in rows}),
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
        dataset_kind="teacher_terminal",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=table.height,
        round_count=len({row["round_id"] for row in rows}),
    )
