from __future__ import annotations

import math
from typing import cast

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.tensors import as_float_tensor
from astar.core.types import FloatArray
from astar.core.validation import SubmissionSpec, validate_prediction_tensor


class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    weighted_kl: float
    score: float
    entropy_sum: float
    nonzero_entropy_cells: int


def entropy_map(probabilities: object) -> FloatArray:
    array = as_float_tensor(probabilities)
    safe = np.where(array > 0.0, array, 1.0)
    entropy = -np.sum(np.where(array > 0.0, array * np.log(safe), 0.0), axis=-1)
    return cast(FloatArray, entropy)


def cellwise_kl_divergence(ground_truth: object, prediction: object) -> FloatArray:
    p = as_float_tensor(ground_truth)
    q = as_float_tensor(prediction)

    if p.shape != q.shape:
        msg = f"shape mismatch: ground_truth {p.shape}, prediction {q.shape}"
        raise ValueError(msg)

    positive = p > 0.0
    safe_p = np.where(positive, p, 1.0)
    safe_q = np.where(q > 0.0, q, 1.0)
    cellwise = np.sum(
        np.where(positive, p * (np.log(safe_p) - np.log(safe_q)), 0.0),
        axis=-1,
    )
    infinite_cells = np.any(positive & (q <= 0.0), axis=-1)
    return cast(FloatArray, np.where(infinite_cells, np.inf, cellwise))


def score_prediction(ground_truth: object, prediction: object) -> ScoreBreakdown:
    ground_truth_array = as_float_tensor(ground_truth)
    height, width, classes = ground_truth_array.shape
    spec = SubmissionSpec(height=height, width=width, classes=classes)
    validate_prediction_tensor(ground_truth_array, spec)
    validate_prediction_tensor(prediction, spec)

    weights = entropy_map(ground_truth_array)
    cellwise_kl = cellwise_kl_divergence(ground_truth_array, prediction)
    entropy_sum = float(np.sum(weights))

    if entropy_sum == 0.0:
        weighted_kl = 0.0
    else:
        weighted_kl = float(np.sum(weights * cellwise_kl) / entropy_sum)

    if math.isinf(weighted_kl):
        score = 0.0
    else:
        score = max(0.0, min(100.0, 100.0 * math.exp(-3.0 * weighted_kl)))

    return ScoreBreakdown(
        weighted_kl=weighted_kl,
        score=score,
        entropy_sum=entropy_sum,
        nonzero_entropy_cells=int(np.count_nonzero(weights > 0.0)),
    )

__all__ = [
    "ScoreBreakdown",
    "cellwise_kl_divergence",
    "entropy_map",
    "score_prediction",
]
