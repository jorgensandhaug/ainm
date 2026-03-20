from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.core.types import FloatArray
from astar.core.world_state import InitialSettlementState, InitialWorldState
from astar.infra.api.dto import InitialSettlement, InitialState, RoundDetail


class SeedContext(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    seed_index: int = Field(ge=0)
    initial_state: InitialWorldState


class RoundContext(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    status: str
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    seeds: tuple[SeedContext, ...]

    def to_round_detail(self) -> RoundDetail:
        return RoundDetail(
            id=self.round_id,
            round_number=int(self.round_number or -1),
            status=self.status,
            map_width=self.map_width,
            map_height=self.map_height,
            seeds_count=len(self.seeds),
            initial_states=[
                InitialState(
                    grid=seed.initial_state.grid.tolist(),
                    settlements=[
                        InitialSettlement(
                            x=item.x,
                            y=item.y,
                            has_port=item.has_port,
                            alive=item.alive,
                        )
                        for item in seed.initial_state.settlements
                    ],
                )
                for seed in self.seeds
            ],
        )


class ViewportQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seed_index: int = Field(ge=0)
    viewport: Viewport
    rationale: str | None = None


class GroundTruthBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    truths_by_seed: dict[int, FloatArray]


class OnlineTranscript(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    observations: tuple[LiveQueryObs, ...] = ()


class OnlineEpisodeSample(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_context: RoundContext
    transcript: OnlineTranscript = Field(default_factory=OnlineTranscript)

    @property
    def observations(self) -> tuple[LiveQueryObs, ...]:
        return self.transcript.observations


def build_round_context_from_detail(round_detail: RoundDetail) -> RoundContext:
    return RoundContext(
        round_id=round_detail.id,
        round_number=round_detail.round_number,
        status=round_detail.status,
        map_width=round_detail.map_width,
        map_height=round_detail.map_height,
        seeds=tuple(
            SeedContext(
                seed_index=seed_index,
                initial_state=InitialWorldState(
                    grid=np.asarray(seed_state.grid, dtype=np.int64),
                    settlements=tuple(
                        InitialSettlementState(
                            x=item.x,
                            y=item.y,
                            has_port=item.has_port,
                            alive=item.alive,
                        )
                        for item in seed_state.settlements
                    ),
                ),
            )
            for seed_index, seed_state in enumerate(round_detail.initial_states)
        ),
    )


__all__ = [
    "GroundTruthBundle",
    "OnlineEpisodeSample",
    "OnlineTranscript",
    "PredictionBundle",
    "RoundContext",
    "SeedContext",
    "ViewportQuery",
    "build_round_context_from_detail",
]
