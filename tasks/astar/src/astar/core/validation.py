from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.tensors import as_float_tensor


class SubmissionSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    height: int = Field(ge=1)
    width: int = Field(ge=1)
    classes: int = Field(default=6, ge=1)
    tolerance: float = Field(default=1e-2, gt=0.0)


class SubmissionValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    height: int
    width: int
    classes: int
    min_probability: float
    max_probability: float
    max_sum_deviation: float


class SubmissionValidationError(ValueError):
    pass


def validate_prediction_tensor(
    prediction: object,
    spec: SubmissionSpec,
) -> SubmissionValidationReport:
    array = as_float_tensor(prediction)
    expected_shape = (spec.height, spec.width, spec.classes)

    if array.shape != expected_shape:
        msg = f"expected tensor shape {expected_shape}, got {array.shape}"
        raise SubmissionValidationError(msg)
    if not np.isfinite(array).all():
        raise SubmissionValidationError("prediction contains non-finite values")
    if np.any(array < 0.0):
        raise SubmissionValidationError("prediction contains negative probabilities")

    sums = array.sum(axis=-1)
    max_sum_deviation = float(np.max(np.abs(sums - 1.0)))
    if max_sum_deviation < 1e-12:
        max_sum_deviation = 0.0
    if max_sum_deviation > spec.tolerance:
        msg = (
            "probabilities must sum to 1.0 within "
            f"{spec.tolerance}, got deviation {max_sum_deviation}"
        )
        raise SubmissionValidationError(msg)

    return SubmissionValidationReport(
        height=spec.height,
        width=spec.width,
        classes=spec.classes,
        min_probability=float(array.min()),
        max_probability=float(array.max()),
        max_sum_deviation=max_sum_deviation,
    )
