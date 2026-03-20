from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from astar.core.types import IntArray


def _validate_grid_shape(grid: IntArray) -> IntArray:
    if grid.ndim != 2:
        msg = f"expected 2D grid, got {grid.ndim}D"
        raise ValueError(msg)
    if grid.shape[0] <= 0 or grid.shape[1] <= 0:
        msg = f"grid must be non-empty, got shape {grid.shape!r}"
        raise ValueError(msg)
    return grid


class InitialSettlementState(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    has_port: bool
    alive: bool = True


class InitialWorldState(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    grid: IntArray
    settlements: tuple[InitialSettlementState, ...] = ()

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: IntArray) -> IntArray:
        return _validate_grid_shape(value)


class SettlementFullState(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    settlement_id: str | None = None
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    population: float | None = None
    food: float | None = None
    wealth: float | None = None
    defense: float | None = None
    tech_level: float | None = None
    has_port: bool
    longship_count: float | None = None
    owner_id: int | None = None
    alive: bool


class WorldFrame(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    t: int = Field(ge=0)
    grid: IntArray
    settlements: tuple[SettlementFullState, ...] = ()

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: IntArray) -> IntArray:
        return _validate_grid_shape(value)


class LiveSettlementObs(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    population: float | None = None
    food: float | None = None
    wealth: float | None = None
    defense: float | None = None
    has_port: bool
    alive: bool
    owner_id: int | None = None
