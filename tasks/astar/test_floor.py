from __future__ import annotations
import numpy as np

def _predict_seed_mock():
    # simulate the output of terminal_tensor with n_rollouts=2
    # cell 0: 2/2 class 0, 0/2 class 1
    counts = np.array([[2.0, 0.0, 0.0, 0.0, 0.0, 0.0]])
    return counts / 2.0

pred = _predict_seed_mock()
print(f"Zeros: {np.sum(pred == 0.0)}")
