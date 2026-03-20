from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.history.replay.inspect import ReplayInspection, inspect_replay_source
from astar.history.replay.normalize import normalize_replay_record
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_replay_records
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent


class IngestedReplaySeed(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    replay_paths: list[Path]


class IngestReplaysResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    inspection: ReplayInspection
    rounds_considered: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    per_seed: list[IngestedReplaySeed]


def load_seed_replay_runs(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> list[ReplayRun]:
    return [
        normalize_replay_record(file_record)
        for file_record in read_replay_records(paths, round_id, seed_index)
    ]


def ingest_replays(
    paths: WorkspacePaths,
    round_id: str | None = None,
) -> IngestReplaysResult:
    inspection = inspect_replay_source(paths, round_id=round_id)
    per_seed: list[IngestedReplaySeed] = []
    catalog = CatalogDB(paths.catalog_path)
    seen: set[tuple[str, int]] = set()

    for handle in inspection.handles:
        key = (handle.round_id, handle.seed_index)
        if key in seen:
            continue
        seen.add(key)
        file_records = read_replay_records(paths, handle.round_id, handle.seed_index)
        runs = [normalize_replay_record(file_record) for file_record in file_records]
        if not runs:
            continue
        per_seed.append(
            IngestedReplaySeed(
                round_id=handle.round_id,
                seed_index=handle.seed_index,
                replay_run_count=len(runs),
                replay_paths=[Path(run.source_path) for run in runs],
            ),
        )
        catalog.log_event(
            CatalogEvent(
                event_kind="replay_runs_ingested",
                round_id=handle.round_id,
                seed_index=handle.seed_index,
                status="ok",
                artifact_path=paths.raw_replay_dir(handle.round_id, handle.seed_index),
                payload_json={
                    "replay_run_count": len(runs),
                    "source_paths": [run.source_path for run in runs],
                },
            ),
        )

    round_ids = {item.round_id for item in per_seed}
    return IngestReplaysResult(
        inspection=inspection,
        rounds_considered=len(round_ids),
        replay_run_count=sum(item.replay_run_count for item in per_seed),
        per_seed=sorted(per_seed, key=lambda item: (item.round_id, item.seed_index)),
    )
