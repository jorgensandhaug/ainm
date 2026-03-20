from __future__ import annotations

import numpy as np
import pytest

from astar.core.validation import (
    SubmissionSpec,
    SubmissionValidationError,
    validate_prediction_tensor,
)


def test_valid_prediction_passes() -> None:
    prediction = np.full((3, 4, 6), 1.0 / 6.0, dtype=np.float64)
    report = validate_prediction_tensor(prediction, SubmissionSpec(height=3, width=4))
    assert report.max_sum_deviation == 0.0


def test_negative_probability_fails() -> None:
    prediction = np.full((1, 1, 6), 1.0 / 6.0, dtype=np.float64)
    prediction[0, 0, 0] = -0.1
    with pytest.raises(SubmissionValidationError):
        validate_prediction_tensor(prediction, SubmissionSpec(height=1, width=1))


def test_bad_sum_fails() -> None:
    prediction = np.zeros((1, 1, 6), dtype=np.float64)
    with pytest.raises(SubmissionValidationError):
        validate_prediction_tensor(prediction, SubmissionSpec(height=1, width=1))
