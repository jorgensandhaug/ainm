import numpy as np
from astar.core.score import cellwise_kl_divergence

p = np.array([1.0, 0.0, 0.0])
q = np.array([0.0, 1.0, 0.0])

print("KL (1.0 vs 0.0):", cellwise_kl_divergence(p, q))
