from __future__ import annotations

import numpy as np

from astar.domain.terrain import collapse_internal_grid, map_internal_code


def test_internal_codes_collapse_to_scored_classes() -> None:
    grid = np.array([[10, 11, 0, 1, 2, 3, 4, 5]], dtype=np.int64)
    collapsed = collapse_internal_grid(grid)
    assert collapsed.tolist() == [[0, 0, 0, 1, 2, 3, 4, 5]]
    assert map_internal_code(10) == 0
    assert map_internal_code(5) == 5

