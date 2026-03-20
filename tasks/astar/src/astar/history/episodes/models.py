from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import LiveQueryObs, ReplayRun, TerminalTruth
from astar.core.types import FloatArray
from astar.core.world_state import InitialWorldState


class LiveTranscript(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    observations: tuple[LiveQueryObs, ...] = ()


class SeedEpisode(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    seed_index: int = Field(ge=0)
    initial_state: InitialWorldState
    terminal_truth: TerminalTruth | None = None
    submitted_prediction: FloatArray | None = None
    replay_runs: tuple[ReplayRun, ...] = ()


class RoundMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int | None = None
    status: str
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    seeds_count: int = Field(ge=1)


class RoundEpisode(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    metadata: RoundMetadata
    seeds: tuple[SeedEpisode, ...]
    live_transcript: LiveTranscript | None = None

    @property
    def replay_run_count(self) -> int:
        return sum(len(seed.replay_runs) for seed in self.seeds)
