from __future__ import annotations

import math

import numpy as np

from astar.core.score import score_prediction


def test_identical_prediction_scores_perfect() -> None:
    truth = np.full((2, 2, 6), 1.0 / 6.0, dtype=np.float64)
    breakdown = score_prediction(truth, truth)
    assert breakdown.weighted_kl == 0.0
    assert breakdown.score == 100.0


def test_zero_probability_assignment_collapses_score() -> None:
    truth = np.array([[[0.5, 0.5, 0.0, 0.0, 0.0, 0.0]]], dtype=np.float64)
    prediction = np.array([[[1.0, 0.0, 0.0, 0.0, 0.0, 0.0]]], dtype=np.float64)
    breakdown = score_prediction(truth, prediction)
    assert math.isinf(breakdown.weighted_kl)
    assert breakdown.score == 0.0
