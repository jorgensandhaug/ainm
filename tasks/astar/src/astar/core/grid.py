from __future__ import annotations

from math import ceil

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.types import IntArray


class Viewport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)

    @property
    def x_stop(self) -> int:
        return self.x + self.w

    @property
    def y_stop(self) -> int:
        return self.y + self.h


class MapShape(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    width: int = Field(ge=1)
    height: int = Field(ge=1)


class TileSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    width: int = Field(ge=1)
    height: int = Field(ge=1)


class CoverageSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    min_count: int
    max_count: int
    total_windows: int


def clamp_viewport(viewport: Viewport, map_shape: MapShape) -> Viewport:
    x = min(viewport.x, max(0, map_shape.width - viewport.w))
    y = min(viewport.y, max(0, map_shape.height - viewport.h))
    return Viewport(
        x=x,
        y=y,
        w=min(viewport.w, map_shape.width),
        h=min(viewport.h, map_shape.height),
    )


def tile_viewports(map_shape: MapShape, tile: TileSpec) -> list[Viewport]:
    x_steps = ceil(map_shape.width / tile.width)
    y_steps = ceil(map_shape.height / tile.height)
    viewports: list[Viewport] = []

    for y_index in range(y_steps):
        for x_index in range(x_steps):
            viewport = Viewport(
                x=x_index * tile.width,
                y=y_index * tile.height,
                w=tile.width,
                h=tile.height,
            )
            viewports.append(clamp_viewport(viewport, map_shape))

    return viewports


def coverage_counts(map_shape: MapShape, viewports: list[Viewport]) -> IntArray:
    counts = np.zeros((map_shape.height, map_shape.width), dtype=np.int64)
    for viewport in viewports:
        counts[viewport.y : viewport.y_stop, viewport.x : viewport.x_stop] += 1
    return counts


def summarize_coverage(map_shape: MapShape, viewports: list[Viewport]) -> CoverageSummary:
    counts = coverage_counts(map_shape, viewports)
    return CoverageSummary(
        min_count=int(counts.min()),
        max_count=int(counts.max()),
        total_windows=len(viewports),
    )
