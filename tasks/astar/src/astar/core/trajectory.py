from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from astar.core.grid import Viewport
from astar.core.types import FloatArray, IntArray
from astar.core.world_state import LiveSettlementObs, WorldFrame


def _validate_tensor_shape(tensor: FloatArray) -> FloatArray:
    if tensor.ndim != 3:
        msg = f"expected 3D tensor, got {tensor.ndim}D"
        raise ValueError(msg)
    if tensor.shape[-1] != 6:
        msg = f"expected class dimension 6, got shape {tensor.shape!r}"
        raise ValueError(msg)
    return tensor


class ReplayRun(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    replay_run_id: str
    round_id: str
    seed_index: int = Field(ge=0)
    stochastic_key: str | None = None
    frames: tuple[WorldFrame, ...]
    source_digest: str
    source_path: str

    @field_validator("frames")
    @classmethod
    def validate_frames(cls, value: tuple[WorldFrame, ...]) -> tuple[WorldFrame, ...]:
        if not value:
            raise ValueError("replay run must contain at least one frame")
        expected_steps = tuple(range(len(value)))
        actual_steps = tuple(frame.t for frame in value)
        if actual_steps != expected_steps:
            msg = f"expected frame steps {expected_steps!r}, got {actual_steps!r}"
            raise ValueError(msg)
        return value


class TerminalTruth(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    probs: FloatArray
    score_against_submission: float | None = None

    @field_validator("probs")
    @classmethod
    def validate_probs(cls, value: FloatArray) -> FloatArray:
        return _validate_tensor_shape(value)


class LiveQueryObs(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    viewport: Viewport
    grid: IntArray
    settlements: tuple[LiveSettlementObs, ...] = ()
    query_index: int = Field(ge=0)

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, value: IntArray) -> IntArray:
        if value.ndim != 2:
            msg = f"expected 2D patch grid, got {value.ndim}D"
            raise ValueError(msg)
        return value
