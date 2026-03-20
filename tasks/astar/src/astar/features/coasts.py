from __future__ import annotations

import numpy as np

from astar.core.terrain import land_mask, sea_mask
from astar.features.reachability import multi_source_distance, normalize_distances


def coast_mask(grid: np.ndarray) -> np.ndarray:
    land = land_mask(grid)
    sea = sea_mask(grid)
    coast = np.zeros(grid.shape, dtype=bool)

    coast[1:, :] |= land[1:, :] & sea[:-1, :]
    coast[:-1, :] |= land[:-1, :] & sea[1:, :]
    coast[:, 1:] |= land[:, 1:] & sea[:, :-1]
    coast[:, :-1] |= land[:, :-1] & sea[:, 1:]
    return coast


def normalized_coast_distance(grid: np.ndarray) -> np.ndarray:
    coast = coast_mask(grid)
    land = land_mask(grid)
    coast_sources = [tuple(index) for index in np.argwhere(coast)]
    distances = multi_source_distance(land, coast_sources)
    return normalize_distances(distances)

