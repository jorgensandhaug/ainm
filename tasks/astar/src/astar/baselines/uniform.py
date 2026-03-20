from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def build_uniform_prediction(height: int, width: int, classes: int = 6) -> NDArray[np.float64]:
    return np.full((height, width, classes), 1.0 / classes, dtype=np.float64)

