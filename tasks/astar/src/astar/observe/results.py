from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport


class RecordedSimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    query_id: str
    viewport: Viewport
    observed_height: int = Field(ge=1)
    observed_width: int = Field(ge=1)
    settlements_logged: int = Field(ge=0)
    queries_used: int = Field(ge=0)
    queries_max: int = Field(ge=0)
    path: Path


class QueryPlanRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    policy_name: str
    total_planned_queries: int = Field(ge=0)
    executed_queries: int = Field(ge=0)
    reused_queries: int = Field(ge=0)
    query_dir: Path
    saved_paths: list[Path]
