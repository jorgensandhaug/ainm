from __future__ import annotations

from collections import deque

import numpy as np


def four_neighbors(y: int, x: int, height: int, width: int) -> list[tuple[int, int]]:
    neighbors: list[tuple[int, int]] = []
    if y > 0:
        neighbors.append((y - 1, x))
    if y + 1 < height:
        neighbors.append((y + 1, x))
    if x > 0:
        neighbors.append((y, x - 1))
    if x + 1 < width:
        neighbors.append((y, x + 1))
    return neighbors


def multi_source_distance(
    traversable: np.ndarray,
    sources: list[tuple[int, int]],
) -> np.ndarray:
    height, width = traversable.shape
    distances = np.full((height, width), -1, dtype=np.int64)
    queue: deque[tuple[int, int]] = deque()

    for y, x in sources:
        if not (0 <= y < height and 0 <= x < width):
            continue
        if not bool(traversable[y, x]):
            continue
        if distances[y, x] >= 0:
            continue
        distances[y, x] = 0
        queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        next_distance = int(distances[y, x]) + 1
        for neighbor_y, neighbor_x in four_neighbors(y, x, height, width):
            if not bool(traversable[neighbor_y, neighbor_x]):
                continue
            if distances[neighbor_y, neighbor_x] >= 0:
                continue
            distances[neighbor_y, neighbor_x] = next_distance
            queue.append((neighbor_y, neighbor_x))

    return distances


def normalize_distances(distances: np.ndarray) -> np.ndarray:
    finite_mask = distances >= 0
    if not bool(np.any(finite_mask)):
        return np.ones(distances.shape, dtype=np.float64)
    max_distance = int(distances[finite_mask].max())
    if max_distance == 0:
        normalized = np.zeros(distances.shape, dtype=np.float64)
        normalized[~finite_mask] = 1.0
        return normalized
    normalized = np.ones(distances.shape, dtype=np.float64)
    normalized[finite_mask] = distances[finite_mask].astype(np.float64) / float(max_distance)
    return normalized

