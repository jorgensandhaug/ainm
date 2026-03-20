from __future__ import annotations

from itertools import combinations
from pathlib import Path

import numpy as np
import yaml
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field

from astar.api.schemas import InitialSettlement, RoundDetail
from astar.domain.geometry import MapShape, TileSpec, Viewport, tile_viewports
from astar.policies.tiling import QueryPlan, QueryPlanItem

GridIntArray = NDArray[np.int64]


class ExplorationPolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = "exploration_v1"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    diagnostic_repeat_count_per_seed: int = Field(default=1, ge=1)
    settlement_weight: float = 8.0
    settlement_pair_weight: float = 6.0
    port_weight: float = 4.0
    coastal_settlement_weight: float = 3.0
    coastline_weight: float = 2.5
    terrain_entropy_weight: float = 2.0
    edge_density_weight: float = 2.0
    forest_weight: float = 0.75
    mountain_weight: float = 0.75
    ocean_penalty_weight: float = 3.0


class ExplorationWindowDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    viewport: Viewport
    settlement_count: int
    port_count: int
    coastal_settlement_count: int
    settlement_pair_score: float
    coastline_ratio: float
    terrain_entropy: float
    edge_density: float
    forest_ratio: float
    mountain_ratio: float
    ocean_ratio: float
    diagnostic_score: float


def load_exploration_policy_config(path: Path) -> ExplorationPolicyConfig:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    return ExplorationPolicyConfig.model_validate(payload)


def _window(grid: GridIntArray, viewport: Viewport) -> GridIntArray:
    return grid[viewport.y : viewport.y_stop, viewport.x : viewport.x_stop]


def _settlements_in_viewport(
    settlements: list[InitialSettlement],
    viewport: Viewport,
) -> list[InitialSettlement]:
    return [
        settlement
        for settlement in settlements
        if viewport.x <= settlement.x < viewport.x_stop
        and viewport.y <= settlement.y < viewport.y_stop
    ]


def _coast_mask(grid: GridIntArray) -> NDArray[np.bool_]:
    ocean = grid == 10
    land = ~ocean
    coast = np.zeros_like(ocean, dtype=bool)

    coast[1:, :] |= land[1:, :] & ocean[:-1, :]
    coast[:-1, :] |= land[:-1, :] & ocean[1:, :]
    coast[:, 1:] |= land[:, 1:] & ocean[:, :-1]
    coast[:, :-1] |= land[:, :-1] & ocean[:, 1:]
    return coast


def _terrain_entropy(window: GridIntArray) -> float:
    _, counts = np.unique(window, return_counts=True)
    probabilities = counts.astype(np.float64) / counts.sum()
    return float(-np.sum(probabilities * np.log(probabilities)))


def _edge_density(window: GridIntArray) -> float:
    horizontal_total = max(window.shape[1] - 1, 0) * window.shape[0]
    vertical_total = max(window.shape[0] - 1, 0) * window.shape[1]
    total_edges = horizontal_total + vertical_total
    if total_edges == 0:
        return 0.0

    horizontal_changes = int(np.count_nonzero(window[:, 1:] != window[:, :-1]))
    vertical_changes = int(np.count_nonzero(window[1:, :] != window[:-1, :]))
    return float((horizontal_changes + vertical_changes) / total_edges)


def _settlement_pair_score(settlements: list[InitialSettlement]) -> float:
    score = 0.0
    for left, right in combinations(settlements, 2):
        distance = abs(left.x - right.x) + abs(left.y - right.y)
        score += 1.0 / (1.0 + distance)
    return score


def _coastal_settlement_count(
    coast_mask: NDArray[np.bool_],
    settlements: list[InitialSettlement],
    radius: int = 2,
) -> int:
    count = 0
    max_y, max_x = coast_mask.shape
    for settlement in settlements:
        y0 = max(settlement.y - radius, 0)
        y1 = min(settlement.y + radius + 1, max_y)
        x0 = max(settlement.x - radius, 0)
        x1 = min(settlement.x + radius + 1, max_x)
        if bool(coast_mask[y0:y1, x0:x1].any()):
            count += 1
    return count


def score_viewport(
    grid: GridIntArray,
    settlements: list[InitialSettlement],
    viewport: Viewport,
    config: ExplorationPolicyConfig,
) -> ExplorationWindowDiagnostics:
    window = _window(grid, viewport)
    window_settlements = _settlements_in_viewport(settlements, viewport)
    coast_mask = _coast_mask(grid)

    area = float(viewport.w * viewport.h)
    port_count = sum(1 for settlement in window_settlements if settlement.has_port)
    coastal_settlement_count = _coastal_settlement_count(coast_mask, window_settlements)
    forest_ratio = float(np.count_nonzero(window == 4) / area)
    mountain_ratio = float(np.count_nonzero(window == 5) / area)
    ocean_ratio = float(np.count_nonzero(window == 10) / area)
    coastline_ratio = float(
        np.count_nonzero(_window(coast_mask.astype(np.int8), viewport)) / area,
    )
    settlement_pair_score = _settlement_pair_score(window_settlements)
    terrain_entropy = _terrain_entropy(window)
    edge_density = _edge_density(window)

    diagnostic_score = (
        config.settlement_weight * len(window_settlements)
        + config.settlement_pair_weight * settlement_pair_score
        + config.port_weight * port_count
        + config.coastal_settlement_weight * coastal_settlement_count
        + config.coastline_weight * coastline_ratio
        + config.terrain_entropy_weight * terrain_entropy
        + config.edge_density_weight * edge_density
        + config.forest_weight * forest_ratio
        + config.mountain_weight * mountain_ratio
        - config.ocean_penalty_weight * ocean_ratio
    )

    return ExplorationWindowDiagnostics(
        viewport=viewport,
        settlement_count=len(window_settlements),
        port_count=port_count,
        coastal_settlement_count=coastal_settlement_count,
        settlement_pair_score=settlement_pair_score,
        coastline_ratio=coastline_ratio,
        terrain_entropy=terrain_entropy,
        edge_density=edge_density,
        forest_ratio=forest_ratio,
        mountain_ratio=mountain_ratio,
        ocean_ratio=ocean_ratio,
        diagnostic_score=diagnostic_score,
    )


def build_exploration_plan(
    round_detail: RoundDetail,
    config: ExplorationPolicyConfig,
) -> QueryPlan:
    viewports = tile_viewports(
        MapShape(width=round_detail.map_width, height=round_detail.map_height),
        TileSpec(width=config.viewport_w, height=config.viewport_h),
    )

    coverage_items = [
        QueryPlanItem(
            round_id=round_detail.id,
            seed_index=seed_index,
            viewport=viewport,
            repeats=1,
            tag="coverage",
        )
        for viewport in viewports
        for seed_index in range(round_detail.seeds_count)
    ]

    diagnostic_items: list[QueryPlanItem] = []
    for seed_index, initial_state in enumerate(round_detail.initial_states):
        grid = np.asarray(initial_state.grid, dtype=np.int64)
        diagnostics = [
            score_viewport(grid, initial_state.settlements, viewport, config)
            for viewport in viewports
        ]
        best = sorted(
            diagnostics,
            key=lambda item: (-item.diagnostic_score, item.viewport.y, item.viewport.x),
        )[0]
        diagnostic_items.append(
            QueryPlanItem(
                round_id=round_detail.id,
                seed_index=seed_index,
                viewport=best.viewport,
                repeats=config.diagnostic_repeat_count_per_seed,
                tag="diagnostic_repeat",
                diagnostic_score=best.diagnostic_score,
            ),
        )

    return QueryPlan(
        round_id=round_detail.id,
        policy_name=config.name,
        items=coverage_items + diagnostic_items,
    )
