from __future__ import annotations

from typing import cast

import numpy as np

INTERNAL_TO_SCORED = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    10: 0,
    11: 0,
}
CLASS_COUNT = 6
CLASS_NAMES = ("empty", "settlement", "port", "ruin", "forest", "mountain")
CLASS_COLORS = ("#d9e2ec", "#c2410c", "#0284c7", "#6b7280", "#166534", "#475569")

BUILDABLE_INTERNAL_CODES = frozenset({0, 1, 2, 3, 4, 11})
LAND_INTERNAL_CODES = frozenset({0, 1, 2, 3, 4, 5, 11})
SEA_INTERNAL_CODES = frozenset({10})

_LOOKUP = np.full(12, -1, dtype=np.int8)
for internal_code, scored_class in INTERNAL_TO_SCORED.items():
    _LOOKUP[internal_code] = scored_class


def is_buildable_code(code: int) -> bool:
    return code in BUILDABLE_INTERNAL_CODES


def is_land_code(code: int) -> bool:
    return code in LAND_INTERNAL_CODES


def is_sea_code(code: int) -> bool:
    return code in SEA_INTERNAL_CODES


def is_mountain_code(code: int) -> bool:
    return code == 5


def buildable_mask(grid: np.ndarray) -> np.ndarray:
    return np.asarray(np.isin(grid, tuple(BUILDABLE_INTERNAL_CODES)), dtype=np.bool_)


def land_mask(grid: np.ndarray) -> np.ndarray:
    return np.asarray(np.isin(grid, tuple(LAND_INTERNAL_CODES)), dtype=np.bool_)


def sea_mask(grid: np.ndarray) -> np.ndarray:
    return np.asarray(np.isin(grid, tuple(SEA_INTERNAL_CODES)), dtype=np.bool_)


def mountain_mask(grid: np.ndarray) -> np.ndarray:
    return np.asarray(grid == 5, dtype=np.bool_)


def collapse_internal_grid(grid: np.ndarray) -> np.ndarray:
    if grid.ndim != 2:
        msg = f"expected 2D grid, got shape {grid.shape!r}"
        raise ValueError(msg)
    if np.any(grid < 0) or np.any(grid >= len(_LOOKUP)):
        invalid_codes = np.unique(grid[(grid < 0) | (grid >= len(_LOOKUP))]).tolist()
        msg = f"unsupported terrain codes: {invalid_codes}"
        raise ValueError(msg)

    collapsed = _LOOKUP[grid]
    if np.any(collapsed < 0):
        invalid_codes = np.unique(grid[collapsed < 0]).tolist()
        msg = f"unsupported terrain codes: {invalid_codes}"
        raise ValueError(msg)
    return cast(np.ndarray, collapsed)


def map_internal_code(code: int) -> int:
    if code not in INTERNAL_TO_SCORED:
        msg = f"unsupported terrain code: {code}"
        raise ValueError(msg)
    return INTERNAL_TO_SCORED[code]


__all__ = [
    "BUILDABLE_INTERNAL_CODES",
    "CLASS_COLORS",
    "CLASS_COUNT",
    "CLASS_NAMES",
    "INTERNAL_TO_SCORED",
    "LAND_INTERNAL_CODES",
    "SEA_INTERNAL_CODES",
    "buildable_mask",
    "collapse_internal_grid",
    "is_buildable_code",
    "is_land_code",
    "is_mountain_code",
    "is_sea_code",
    "land_mask",
    "map_internal_code",
    "mountain_mask",
    "sea_mask",
]
