from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from astar.observe.query_plan import QueryPlan, read_query_plan
from astar.policies.tiling import read_query_plan as read_legacy_query_plan


def read_any_query_plan(path: Path) -> QueryPlan:
    try:
        return read_query_plan(path)
    except ValidationError:
        legacy_plan = read_legacy_query_plan(path)
        return QueryPlan.model_validate(legacy_plan.model_dump(mode="json"))


__all__ = ["read_any_query_plan"]
