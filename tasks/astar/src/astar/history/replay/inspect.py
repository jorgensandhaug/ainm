from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.replay_source.base import ReplayRunHandle, ReplaySourceSummary
from astar.infra.replay_source.folder import FolderReplaySource


class ReplayInspection(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    source_summary: ReplaySourceSummary
    handles: list[ReplayRunHandle]


def inspect_replay_source(
    paths: WorkspacePaths,
    round_id: str | None = None,
) -> ReplayInspection:
    source = FolderReplaySource(root_dir=paths.raw_dir / "replays")
    handles = source.discover_runs(round_id=round_id)
    if round_id is None:
        source_summary = source.inspect()
    else:
        source_summary = ReplaySourceSummary(
            root_dir=source.root_dir,
            round_ids=([round_id] if handles else []),
            run_count=len(handles),
            per_round_counts={round_id: len(handles)} if handles else {},
        )
    return ReplayInspection(source_summary=source_summary, handles=handles)


class ReplaySeedInspection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)


class ReplayRoundInspection(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    replay_root: Path
    replay_run_count: int = Field(ge=0)
    per_seed: list[ReplaySeedInspection]


def inspect_round_replays(paths: WorkspacePaths, round_id: str) -> ReplayRoundInspection:
    inspection = inspect_replay_source(paths, round_id=round_id)
    per_seed_counts: dict[int, int] = {}
    for handle in inspection.handles:
        per_seed_counts[handle.seed_index] = per_seed_counts.get(handle.seed_index, 0) + 1
    return ReplayRoundInspection(
        round_id=round_id,
        replay_root=paths.raw_replay_dir(round_id, 0).parents[1],
        replay_run_count=len(inspection.handles),
        per_seed=[
            ReplaySeedInspection(seed_index=seed_index, replay_run_count=count)
            for seed_index, count in sorted(per_seed_counts.items())
        ],
    )
