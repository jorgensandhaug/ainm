from __future__ import annotations

from itertools import combinations

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.infra.api.dto import InitialSettlement, RoundDetail

GridIntArray = NDArray[np.int64]


class ViewportMotifScorer(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

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


class ViewportMotifScore(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seed_index: int = Field(ge=0)
    viewport: Viewport
    diagnostic_score: float
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


def score_viewport_motif(
    grid: GridIntArray,
    settlements: list[InitialSettlement],
    viewport: Viewport,
    scorer: ViewportMotifScorer | None = None,
    seed_index: int = 0,
) -> ViewportMotifScore:
    resolved_scorer = scorer or ViewportMotifScorer()
    window = _window(grid, viewport)
    window_settlements = _settlements_in_viewport(settlements, viewport)
    coast_mask = _coast_mask(grid)

    window_h, window_w = window.shape
    area = float(max(1, window_w * window_h))
    
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
        resolved_scorer.settlement_weight * len(window_settlements)
        + resolved_scorer.settlement_pair_weight * settlement_pair_score
        + resolved_scorer.port_weight * port_count
        + resolved_scorer.coastal_settlement_weight * coastal_settlement_count
        + resolved_scorer.coastline_weight * coastline_ratio
        + resolved_scorer.terrain_entropy_weight * terrain_entropy
        + resolved_scorer.edge_density_weight * edge_density
        + resolved_scorer.forest_weight * forest_ratio
        + resolved_scorer.mountain_weight * mountain_ratio
        - resolved_scorer.ocean_penalty_weight * ocean_ratio
    )
    return ViewportMotifScore(
        seed_index=seed_index,
        viewport=viewport,
        diagnostic_score=diagnostic_score,
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
    )


def rank_seed_viewports(
    round_detail: RoundDetail,
    seed_index: int,
    viewports: list[Viewport],
    scorer: ViewportMotifScorer | None = None,
) -> list[ViewportMotifScore]:
    initial_state = round_detail.initial_states[seed_index]
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    diagnostics = [
        score_viewport_motif(
            grid,
            initial_state.settlements,
            viewport,
            scorer=scorer,
            seed_index=seed_index,
        )
        for viewport in viewports
    ]
    return sorted(
        diagnostics,
        key=lambda item: (-item.diagnostic_score, item.viewport.y, item.viewport.x),
    )
