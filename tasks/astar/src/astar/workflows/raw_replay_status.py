from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from hashlib import sha256

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record


class RawReplaySizeBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    map_size: str
    round_count: int = Field(ge=0)
    seed_map_count: int = Field(ge=0)


class RawReplayRoundStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    replay_count: int = Field(ge=0)
    per_seed_replay_counts: list[int]

    @property
    def map_size(self) -> str:
        return f"{self.map_width}x{self.map_height}"


class RawReplayStatusResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    captured_at: datetime
    raw_round_dir: str
    raw_replay_root: str
    round_count: int = Field(ge=0)
    replay_file_count: int = Field(ge=0)
    seed_map_count: int = Field(ge=0)
    unique_grid_map_count: int = Field(ge=0)
    size_breakdown: list[RawReplaySizeBreakdown]
    rounds: list[RawReplayRoundStatus]


def _grid_hash(grid: list[list[int]]) -> str:
    payload = json.dumps(grid, separators=(",", ":"), ensure_ascii=True)
    return sha256(payload.encode("utf-8")).hexdigest()


def _resolve_round_ids(paths: WorkspacePaths, round_ids: list[str] | None) -> list[str]:
    if round_ids is None:
        return [path.stem for path in sorted(paths.raw_dir.joinpath("rounds").glob("*.json"))]
    unique_round_ids = list(dict.fromkeys(round_ids))
    missing_round_ids = [
        round_id for round_id in unique_round_ids if not paths.raw_round_path(round_id).exists()
    ]
    if missing_round_ids:
        missing_text = ", ".join(missing_round_ids)
        raise FileNotFoundError(f"missing raw round metadata for: {missing_text}")
    return unique_round_ids


def _size_sort_key(item: RawReplaySizeBreakdown) -> tuple[int, int, int, int, str]:
    width_text, height_text = item.map_size.split("x", 1)
    width = int(width_text)
    height = int(height_text)
    area = width * height
    return (-item.round_count, -item.seed_map_count, -area, -width, item.map_size)


def summarize_raw_replay_status(
    paths: WorkspacePaths,
    round_ids: list[str] | None = None,
) -> RawReplayStatusResult:
    selected_round_ids = _resolve_round_ids(paths, round_ids)
    size_round_counts: dict[str, int] = defaultdict(int)
    size_seed_map_counts: dict[str, int] = defaultdict(int)
    unique_grid_hashes: set[str] = set()
    rows: list[RawReplayRoundStatus] = []
    replay_file_count = 0
    seed_map_count = 0

    for round_id in selected_round_ids:
        record = read_round_record(paths, round_id)
        detail = record.round
        per_seed_replay_counts: list[int] = []
        for seed_index, state in enumerate(detail.initial_states):
            unique_grid_hashes.add(_grid_hash(state.grid))
            replay_dir = paths.raw_replay_dir(round_id, seed_index)
            replay_count = sum(1 for _ in replay_dir.glob("*.json")) if replay_dir.exists() else 0
            per_seed_replay_counts.append(replay_count)
        round_replay_count = sum(per_seed_replay_counts)
        replay_file_count += round_replay_count
        seed_map_count += len(detail.initial_states)
        map_size = f"{detail.map_width}x{detail.map_height}"
        size_round_counts[map_size] += 1
        size_seed_map_counts[map_size] += len(detail.initial_states)
        rows.append(
            RawReplayRoundStatus(
                round_id=detail.id,
                round_number=detail.round_number,
                map_width=detail.map_width,
                map_height=detail.map_height,
                replay_count=round_replay_count,
                per_seed_replay_counts=per_seed_replay_counts,
            ),
        )

    rows.sort(key=lambda item: (item.round_number, item.round_id))
    size_breakdown = [
        RawReplaySizeBreakdown(
            map_size=map_size,
            round_count=size_round_counts[map_size],
            seed_map_count=size_seed_map_counts[map_size],
        )
        for map_size in size_round_counts
    ]
    size_breakdown.sort(key=_size_sort_key)

    return RawReplayStatusResult(
        captured_at=datetime.now(UTC),
        raw_round_dir=str(paths.raw_dir / "rounds"),
        raw_replay_root=str(paths.raw_dir / "replays"),
        round_count=len(rows),
        replay_file_count=replay_file_count,
        seed_map_count=seed_map_count,
        unique_grid_map_count=len(unique_grid_hashes),
        size_breakdown=size_breakdown,
        rounds=rows,
    )


__all__ = [
    "RawReplayRoundStatus",
    "RawReplaySizeBreakdown",
    "RawReplayStatusResult",
    "summarize_raw_replay_status",
]
