import numpy as np
from astar.features.motifs import _terrain_entropy
from astar.core.grid import Viewport

# Test 1: Uniform window
window = np.zeros((10, 10), dtype=np.int64)
print("Uniform entropy:", _terrain_entropy(window))

# Test 2: Mixed window
window2 = np.zeros((10, 10), dtype=np.int64)
window2[:5, :] = 1
print("Mixed entropy:", _terrain_entropy(window2))

