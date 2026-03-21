import numpy as np
from astar.student.distill.losses import masked_kl_divergence

target = np.array([0.9, 0.1, 0.0])
pred = np.array([0.0, 1.0, 0.0])
print("Loss:", masked_kl_divergence(target, pred))

target2 = np.array([1.0, 0.0, 0.0])
pred2 = np.array([1.0, 0.0, 0.0])
print("Loss:", masked_kl_divergence(target2, pred2))
