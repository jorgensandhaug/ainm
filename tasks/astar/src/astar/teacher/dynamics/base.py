from __future__ import annotations

from typing import Protocol

import numpy as np

from astar.core.trajectory import ReplayRun
from astar.history.episodes.models import RoundEpisode
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


class DynamicsTeacher(Protocol):
    name: str

    def fit(self, episodes: list[RoundEpisode]) -> DynamicsTeacher: ...
    def encode_round(self, episode: RoundEpisode) -> np.ndarray: ...
    def rollout(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int,
        horizon: int = 50,
    ) -> list[ReplayRun]: ...
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
