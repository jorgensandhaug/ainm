from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from astar.api.schemas import RoundDetail
from astar.domain.geometry import MapShape, TileSpec, Viewport, tile_viewports


class QueryPlanItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    viewport: Viewport
    repeats: int = Field(default=1, ge=1)
    tag: str | None = None
    diagnostic_score: float | None = None


class QueryPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    policy_name: str
    items: list[QueryPlanItem]


class CoveragePolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = "coverage"
    viewport_w: int = Field(ge=1)
    viewport_h: int = Field(ge=1)
    repeats: int = Field(default=1, ge=1)


def load_coverage_policy_config(path: Path) -> CoveragePolicyConfig:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    return CoveragePolicyConfig.model_validate(payload)


def build_coverage_plan(round_detail: RoundDetail, config: CoveragePolicyConfig) -> QueryPlan:
    viewports = tile_viewports(
        MapShape(width=round_detail.map_width, height=round_detail.map_height),
        TileSpec(width=config.viewport_w, height=config.viewport_h),
    )
    items = [
        QueryPlanItem(
            round_id=round_detail.id,
            seed_index=seed_index,
            viewport=viewport,
            repeats=config.repeats,
        )
        for seed_index in range(round_detail.seeds_count)
        for viewport in viewports
    ]
    return QueryPlan(round_id=round_detail.id, policy_name=config.name, items=items)


def write_query_plan(path: Path, plan: QueryPlan) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(
            plan.model_dump(mode="json", exclude_none=True),
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return path


def read_query_plan(path: Path) -> QueryPlan:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    return QueryPlan.model_validate(payload)
