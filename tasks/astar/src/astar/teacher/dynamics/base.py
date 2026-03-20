from __future__ import annotations

from typing import Protocol

import numpy as np

from astar.core.trajectory import ReplayRun
from astar.history.episodes.models import RoundEpisode, SeedEpisode
from astar.teacher.regime.base import RegimePosteriorState


class DynamicsTeacher(Protocol):
    name: str

    def fit(self, episodes: list[RoundEpisode]) -> DynamicsTeacher: ...
    def encode_round(self, episode: RoundEpisode) -> np.ndarray: ...
    def rollout(
        self,
        seed: SeedEpisode,
        regime: np.ndarray,
        n_rollouts: int,
        horizon: int = 50,
    ) -> list[ReplayRun]: ...
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
