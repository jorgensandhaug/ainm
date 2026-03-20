from __future__ import annotations

import numpy as np


def masked_kl_divergence(target: np.ndarray, prediction: np.ndarray, eps: float = 1e-8) -> float:
    safe_prediction = np.clip(prediction, eps, 1.0)
    safe_target = np.clip(target, eps, 1.0)
    return float(np.sum(safe_target * (np.log(safe_target) - np.log(safe_prediction))))
