from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

import numpy as np

from astar.domain.tensors import FloatTensor


def save_prediction_tensor(path: Path, prediction: FloatTensor) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, prediction=prediction)
    return path


def load_prediction_tensor(path: Path) -> FloatTensor:
    with np.load(path) as payload:
        return np.asarray(payload["prediction"], dtype=np.float64)


def save_analysis_tensor(path: Path, prediction: FloatTensor, ground_truth: FloatTensor) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, prediction=prediction, ground_truth=ground_truth)
    return path


def save_named_arrays(path: Path, arrays: Mapping[str, np.ndarray]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(file=path, **dict(arrays))  # type: ignore[arg-type]
    return path


def load_named_arrays(path: Path) -> dict[str, np.ndarray]:
    with np.load(path) as payload:
        return {name: np.asarray(payload[name]) for name in payload.files}
