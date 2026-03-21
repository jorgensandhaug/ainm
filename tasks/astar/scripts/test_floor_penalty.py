import numpy as np
from astar.core.tensors import floor_and_normalize

probs = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
floored = floor_and_normalize(probs, 0.01)
print(f"Floored: {floored}")
penalty = -np.log(floored[0])
print(f"Entropy penalty: {penalty:.4f}")
