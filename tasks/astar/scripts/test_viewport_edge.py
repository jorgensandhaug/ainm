import numpy as np
from astar.core.grid import Viewport
from astar.features.motifs import score_viewport_motif
from astar.infra.api.dto import InitialSettlement

grid = np.full((40, 40), 10, dtype=np.int64) # All ocean
viewport = Viewport(x=30, y=0, w=15, h=15) # Bleeds off the edge (30+15 = 45 > 40)

score = score_viewport_motif(grid, [], viewport)
print("Ocean ratio:", score.ocean_ratio)
print("Expected ocean ratio:", 1.0)
