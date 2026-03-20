from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.core.types import FloatArray


class PredictionBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    model_name: str
    predictions_by_seed: dict[int, FloatArray]

    @property
    def seed_count(self) -> int:
        return len(self.predictions_by_seed)


class SeedPredictionSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    model_name: str
    height: int = Field(ge=1)
    width: int = Field(ge=1)
    classes: int = Field(ge=1)
