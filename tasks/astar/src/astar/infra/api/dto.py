from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from astar.core.grid import Viewport

GridInt = list[list[int]]
GridFloat = list[list[float]]
TensorFloat = list[list[list[float]]]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _validate_rectangular_grid(grid: GridInt | GridFloat) -> None:
    if not grid:
        raise ValueError("grid must not be empty")
    width = len(grid[0])
    if width == 0:
        raise ValueError("grid rows must not be empty")
    if any(len(row) != width for row in grid):
        raise ValueError("grid must be rectangular")


class RoundSummary(StrictModel):
    id: str
    round_number: int
    event_date: str
    status: str
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    prediction_window_minutes: int = Field(ge=1)
    started_at: datetime
    closes_at: datetime
    round_weight: float = Field(ge=0.0)
    created_at: datetime


class InitialSettlement(StrictModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    has_port: bool
    alive: bool = True


class InitialState(StrictModel):
    grid: GridInt
    settlements: list[InitialSettlement] = Field(default_factory=list)

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: GridInt) -> GridInt:
        _validate_rectangular_grid(value)
        return value


class RoundDetail(StrictModel):
    id: str
    round_number: int
    status: str
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    seeds_count: int = Field(ge=1)
    event_date: str | None = None
    prediction_window_minutes: int | None = Field(default=None, ge=1)
    started_at: datetime | None = None
    closes_at: datetime | None = None
    round_weight: float | None = Field(default=None, ge=0.0)
    initial_states: list[InitialState]

    @model_validator(mode="after")
    def validate_seeds(self) -> RoundDetail:
        if len(self.initial_states) != self.seeds_count:
            msg = f"expected {self.seeds_count} initial states, got {len(self.initial_states)}"
            raise ValueError(msg)
        return self


class BudgetStatus(StrictModel):
    round_id: str | None = None
    queries_used: int = Field(ge=0)
    queries_max: int = Field(ge=0)
    active: bool


class SimulationRequest(StrictModel):
    round_id: str
    seed_index: int = Field(ge=0)
    viewport_x: int = Field(ge=0)
    viewport_y: int = Field(ge=0)
    viewport_w: int = Field(ge=1)
    viewport_h: int = Field(ge=1)


class SettlementObservation(StrictModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    population: float = Field(ge=0.0)
    food: float
    wealth: float
    defense: float
    has_port: bool
    alive: bool
    owner_id: int | None = None


class SimulationResponse(StrictModel):
    grid: GridInt
    settlements: list[SettlementObservation] = Field(default_factory=list)
    viewport: Viewport
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    queries_used: int = Field(ge=0)
    queries_max: int = Field(ge=0)

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: GridInt) -> GridInt:
        _validate_rectangular_grid(value)
        return value


class ReplayRequest(StrictModel):
    round_id: str
    seed_index: int = Field(ge=0)


class ReplayFrame(StrictModel):
    step: int = Field(ge=0)
    grid: GridInt
    settlements: list[SettlementObservation] = Field(default_factory=list)

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: GridInt) -> GridInt:
        _validate_rectangular_grid(value)
        return value


class ReplayResponse(StrictModel):
    round_id: str
    seed_index: int = Field(ge=0)
    sim_seed: int
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    frames: list[ReplayFrame] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_frames(self) -> ReplayResponse:
        expected_steps = list(range(len(self.frames)))
        actual_steps = [frame.step for frame in self.frames]
        if actual_steps != expected_steps:
            msg = f"expected replay steps {expected_steps!r}, got {actual_steps!r}"
            raise ValueError(msg)

        for frame in self.frames:
            if len(frame.grid) != self.height:
                msg = (
                    f"expected replay frame height {self.height}, "
                    f"got {len(frame.grid)} for step {frame.step}"
                )
                raise ValueError(msg)
            if len(frame.grid[0]) != self.width:
                msg = (
                    f"expected replay frame width {self.width}, "
                    f"got {len(frame.grid[0])} for step {frame.step}"
                )
                raise ValueError(msg)
        return self


class SubmissionRequest(StrictModel):
    round_id: str
    seed_index: int = Field(ge=0)
    prediction: TensorFloat


class SubmissionResponse(StrictModel):
    status: str
    round_id: str
    seed_index: int = Field(ge=0)


class PredictionSummary(StrictModel):
    seed_index: int = Field(ge=0)
    argmax_grid: GridInt
    confidence_grid: GridFloat
    score: float | None = None
    submitted_at: datetime | None = None


class AnalysisResponse(StrictModel):
    prediction: TensorFloat | None = None
    ground_truth: TensorFloat
    score: float | None = None
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    initial_grid: GridInt | None = None


class StoredRoundRecord(StrictModel):
    fetched_at: datetime
    round: RoundDetail


class StoredQueryRecord(StrictModel):
    query_id: str
    requested_at: datetime
    git_sha: str
    config_hash: str
    request: SimulationRequest
    response: SimulationResponse


class StoredSubmissionRecord(StrictModel):
    created_at: datetime
    model_name: str
    request: SubmissionRequest


class StoredAnalysisRecord(StrictModel):
    fetched_at: datetime
    round_id: str
    seed_index: int = Field(ge=0)
    analysis: AnalysisResponse


class StoredReplayRecord(StrictModel):
    capture_id: str
    requested_at: datetime
    git_sha: str
    request: ReplayRequest
    response: ReplayResponse


__all__ = [
    "AnalysisResponse",
    "BudgetStatus",
    "InitialSettlement",
    "InitialState",
    "PredictionSummary",
    "ReplayFrame",
    "ReplayRequest",
    "ReplayResponse",
    "RoundDetail",
    "RoundSummary",
    "SettlementObservation",
    "SimulationRequest",
    "SimulationResponse",
    "StoredAnalysisRecord",
    "StoredQueryRecord",
    "StoredReplayRecord",
    "StoredRoundRecord",
    "StoredSubmissionRecord",
    "SubmissionRequest",
    "SubmissionResponse",
]
