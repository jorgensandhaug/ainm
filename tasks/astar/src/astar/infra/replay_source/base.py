from __future__ import annotations

from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.store import ReplayFileRecord


class ReplayRunHandle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    source_path: Path


class ReplaySourceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    root_dir: Path
    round_ids: list[str]
    run_count: int = Field(ge=0)
    per_round_counts: dict[str, int]


class ReplaySource(Protocol):
    def inspect(self) -> ReplaySourceSummary: ...
    def discover_runs(self, round_id: str | None = None) -> list[ReplayRunHandle]: ...
    def load_run(self, handle: ReplayRunHandle) -> ReplayFileRecord: ...
