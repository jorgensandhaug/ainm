from __future__ import annotations

from typing import Protocol

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.history.episodes.models import RoundEpisode
from astar.infra.artifacts.paths import WorkspacePaths


class RegimePosteriorState(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    mean: np.ndarray
    cov: np.ndarray | None = None
    particles: tuple[np.ndarray, ...] | None = None
    weights: np.ndarray | None = None


class RegimeEncoder(Protocol):
    name: str

    def encode_round(self, episode: RoundEpisode) -> np.ndarray: ...
    def encode_round_from_workspace(self, paths: WorkspacePaths, round_id: str) -> np.ndarray: ...
