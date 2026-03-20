from __future__ import annotations

from typing import Protocol

import numpy as np

from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.regime.base import RegimePosteriorState


class PosteriorStudent(Protocol):
    name: str

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState: ...
    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray: ...
