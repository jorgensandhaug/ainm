from __future__ import annotations

from typing import Any, cast

import numpy as np
import xarray as xr
from pydantic import BaseModel, ConfigDict, Field

from astar.core.types import FloatArray


class TensorSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    height: int = Field(ge=1)
    width: int = Field(ge=1)
    classes: int = Field(default=6, ge=1)


def as_float_tensor(value: Any) -> FloatArray:
    return np.asarray(value, dtype=np.float64)


def floor_and_normalize(probabilities: FloatArray, floor: float) -> FloatArray:
    clipped = np.maximum(probabilities, floor)
    sums = clipped.sum(axis=-1, keepdims=True)
    return cast(FloatArray, clipped / sums)


def to_xarray(probabilities: FloatArray) -> xr.DataArray:
    if probabilities.ndim != 3:
        msg = f"expected 3D tensor, got shape {probabilities.shape!r}"
        raise ValueError(msg)
    height, width, classes = probabilities.shape
    return xr.DataArray(
        probabilities,
        dims=("y", "x", "class"),
        coords={
            "y": np.arange(height, dtype=np.int32),
            "x": np.arange(width, dtype=np.int32),
            "class": np.arange(classes, dtype=np.int32),
        },
    )
