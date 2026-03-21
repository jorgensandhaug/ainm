import numpy as np
from astar.features.motifs import _terrain_entropy
from astar.core.grid import Viewport

# Create a totally uniform window (e.g. all ocean or all plains)
window = np.zeros((10, 10), dtype=np.int64)

# In _terrain_entropy, probabilities will be [1.0]
# np.log([1.0]) is [0.0]
# 1.0 * 0.0 is 0.0
# Let's test it:
print("Entropy of uniform window:", _terrain_entropy(window))

