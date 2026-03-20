from __future__ import annotations

from astar.domain.geometry import MapShape, TileSpec, coverage_counts, tile_viewports


def test_tiling_covers_full_map() -> None:
    map_shape = MapShape(width=40, height=40)
    viewports = tile_viewports(map_shape, TileSpec(width=15, height=15))
    coverage = coverage_counts(map_shape, viewports)
    assert len(viewports) == 9
    assert int(coverage.min()) >= 1
    assert int(coverage.max()) >= 1

