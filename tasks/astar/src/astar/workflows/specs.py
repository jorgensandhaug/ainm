from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from astar.models.base import BaseRoundPredictor
from astar.observe.policies.base import BaseQueryPolicy


class LiveRunSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    description: str
    policy: BaseQueryPolicy
    predictor: BaseRoundPredictor
    submit_predictions: bool = True
