from __future__ import annotations

import numpy as np

from astar.core.terrain import buildable_mask, land_mask, sea_mask
from astar.features.reachability import multi_source_distance, normalize_distances


def coast_mask(grid: np.ndarray) -> np.ndarray:
    land = land_mask(grid)
    sea = sea_mask(grid)
    coast = np.zeros(grid.shape, dtype=bool)

    coast[1:, :] |= land[1:, :] & sea[:-1, :]
    coast[:-1, :] |= land[:-1, :] & sea[1:, :]
    coast[:, 1:] |= land[:, 1:] & sea[:, :-1]
    coast[:, :-1] |= land[:, :-1] & sea[:, 1:]
    coast[1:, 1:] |= land[1:, 1:] & sea[:-1, :-1]
    coast[1:, :-1] |= land[1:, :-1] & sea[:-1, 1:]
    coast[:-1, 1:] |= land[:-1, 1:] & sea[1:, :-1]
    coast[:-1, :-1] |= land[:-1, :-1] & sea[1:, 1:]
    return coast


def normalized_coast_distance(grid: np.ndarray) -> np.ndarray:
    distances = coast_distance_steps(grid)
    return normalize_distances(distances)


def coast_distance_steps(grid: np.ndarray) -> np.ndarray:
    coast = coast_mask(grid)
    buildable = buildable_mask(grid)
    coast_sources = [tuple(index) for index in np.argwhere(coast & buildable)]
    return multi_source_distance(buildable, coast_sources)
