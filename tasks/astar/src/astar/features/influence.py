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
    return normalize_distances(land_distance_to_settlements_steps(grid, settlements))


def land_distance_to_settlements_steps(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    buildable = buildable_mask(grid)
    return multi_source_distance(buildable, settlement_sources(settlements))


def normalized_sea_distance_to_initial_ports(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    return normalize_distances(sea_distance_to_initial_ports_steps(grid, settlements))


def sea_distance_to_initial_ports_steps(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    coastal_or_sea = sea_mask(grid) | coast_mask(grid)
    coast = coast_mask(grid)
    sources = [(item.y, item.x) for item in settlements if item.has_port]
    if not sources:
        sources = [(item.y, item.x) for item in settlements if bool(coast[item.y, item.x])]
    return multi_source_distance(coastal_or_sea, sources)


def settlement_basin_gap(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    return normalize_distances(settlement_basin_gap_steps(grid, settlements))


def settlement_basin_gap_steps(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> np.ndarray:
    buildable = buildable_mask(grid)
    if len(settlements) < 2:
        return np.full(grid.shape, -1, dtype=np.int64)

    distance_stack = np.stack(
        [
            multi_source_distance(buildable, [(settlement.y, settlement.x)])
            for settlement in settlements
        ],
        axis=0,
    )
    reachable = distance_stack >= 0
    reachable_count = np.sum(reachable, axis=0)
    safe = np.where(reachable, distance_stack, np.inf)
    nearest = np.min(safe, axis=0)
    second_nearest = np.partition(safe, kth=1, axis=0)[1]

    gap = np.full(grid.shape, -1, dtype=np.int64)
    finite_gap_mask = reachable_count >= 2
    gap[finite_gap_mask] = np.asarray(
        second_nearest[finite_gap_mask] - nearest[finite_gap_mask],
        dtype=np.int64,
    )
    return gap
