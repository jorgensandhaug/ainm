from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport


class QueryPlanItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    viewport: Viewport
    repeats: int = Field(default=1, ge=1)
    tag: str | None = None
    diagnostic_score: float | None = None


class QueryPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    policy_name: str
    items: list[QueryPlanItem]


def write_query_plan(path: Path, plan: QueryPlan) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            plan.model_dump(mode="json", exclude_none=True),
            indent=2,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return path


def read_query_plan(path: Path) -> QueryPlan:
    return QueryPlan.model_validate_json(path.read_text(encoding="utf-8"))


def read_any_query_plan(path: Path) -> QueryPlan:
    try:
        return read_query_plan(path)
    except Exception:
        from astar.legacy.query_plan import read_any_query_plan as read_legacy_query_plan

        return read_legacy_query_plan(path)
