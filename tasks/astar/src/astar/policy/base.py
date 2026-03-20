from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.student.predictor.base import LiveInferenceContext


class PlannedQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seed_index: int = Field(ge=0)
    viewport: Viewport
    rationale: str | None = None


class QueryPolicy(Protocol):
    name: str

    def initial_plan(self, context: LiveInferenceContext) -> list[PlannedQuery]: ...
    def next_query(self, context: LiveInferenceContext) -> PlannedQuery | None: ...
