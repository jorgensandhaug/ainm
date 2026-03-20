from __future__ import annotations

from typing import Protocol

import numpy as np

from astar.core.world_state import InitialWorldState
from astar.teacher.regime.base import RegimePosteriorState


class SeedLike(Protocol):
    seed_index: int
    initial_state: InitialWorldState


class TerminalDecoder(Protocol):
    name: str

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray: ...

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray: ...
