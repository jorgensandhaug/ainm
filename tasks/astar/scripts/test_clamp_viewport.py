from astar.core.grid import MapShape, TileSpec, tile_viewports
viewports = tile_viewports(MapShape(width=40, height=40), TileSpec(width=15, height=15))
for v in viewports:
    print(v)
