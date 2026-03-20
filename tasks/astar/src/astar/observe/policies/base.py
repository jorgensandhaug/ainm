from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, ConfigDict

from astar.infra.api.dto import RoundDetail
from astar.observe.query_plan import QueryPlan


class BaseQueryPolicy(BaseModel, ABC):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str

    @abstractmethod
    def build_plan(self, round_detail: RoundDetail) -> QueryPlan:
        raise NotImplementedError
