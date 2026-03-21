import time
import numpy as np
from astar.features.geometry import _local_ratio

grid = np.random.randint(0, 10, size=(100, 100))
mask = grid == 4

t0 = time.time()
_local_ratio(mask)
t1 = time.time()
print(f"Time: {t1-t0:.4f}s")
