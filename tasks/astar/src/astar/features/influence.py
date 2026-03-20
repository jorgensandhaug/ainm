from __future__ import annotations

import numpy as np

from astar.core.terrain import buildable_mask, sea_mask
from astar.features.coasts import coast_mask
from astar.features.reachability import multi_source_distance, normalize_distances
from astar.infra.api.dto import InitialSettlement


def settlement_sources(settlements: list[InitialSettlement]) -> list[tuple[int, int]]:
    return [(item.y, item.x) for item in settlements]


def normalized_land_distance_to_settlements(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    buildable = buildable_mask(grid)
    distances = multi_source_distance(buildable, settlement_sources(settlements))
    return normalize_distances(distances)


def normalized_sea_distance_to_initial_ports(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    coastal_or_sea = sea_mask(grid) | coast_mask(grid)
    sources = [(item.y, item.x) for item in settlements if item.has_port]
    distances = multi_source_distance(coastal_or_sea, sources)
    return normalize_distances(distances)


def settlement_basin_gap(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    buildable = buildable_mask(grid)
    if len(settlements) < 2:
        return np.ones(grid.shape, dtype=np.float64)

    distance_stack = np.stack(
        [
            multi_source_distance(buildable, [(settlement.y, settlement.x)])
            for settlement in settlements
        ],
        axis=0,
    )
    reachable = distance_stack >= 0
    large_value = np.iinfo(np.int64).max // 4
    safe = np.where(reachable, distance_stack, large_value)
    nearest = np.min(safe, axis=0)
    second_nearest = np.partition(safe, kth=1, axis=0)[1]
    gap = second_nearest - nearest
    gap = np.where(second_nearest >= large_value, large_value, gap)
    return normalize_distances(gap)
