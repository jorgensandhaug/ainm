from __future__ import annotations

from typing import cast

import numpy as np

from astar.core.tensors import floor_and_normalize
from astar.core.types import FloatArray


def softmax_logits(logits: np.ndarray) -> FloatArray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return cast(FloatArray, exp / np.sum(exp, axis=-1, keepdims=True))


def apply_probability_floor(
    probabilities: np.ndarray,
    floor: float,
    *,
    initial_grid: np.ndarray | None = None,
) -> FloatArray:
    floored = floor_and_normalize(probabilities, floor)
    if initial_grid is not None:
        ocean = initial_grid == 10
        mountain = initial_grid == 5
        floored[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        floored[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)
    return floored
