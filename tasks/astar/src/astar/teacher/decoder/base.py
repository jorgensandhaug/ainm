from __future__ import annotations

from typing import Protocol

import numpy as np

from astar.history.episodes.models import SeedEpisode
from astar.teacher.regime.base import RegimePosteriorState


class TerminalDecoder(Protocol):
    name: str

    def terminal_tensor(
        self,
        seed: SeedEpisode,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray: ...

    def posterior_predictive(
        self,
        seed: SeedEpisode,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray: ...
