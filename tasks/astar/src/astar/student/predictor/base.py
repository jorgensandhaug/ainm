from __future__ import annotations

from typing import Any, Protocol

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.trajectory import LiveQueryObs
from astar.envs.types import OnlineEpisodeSample, RoundContext
from astar.features.geometry import RoundFeatureBundle
from astar.observe.evidence import RoundEvidenceBundle
from astar.teacher.decoder.base import TerminalDecoder


class LiveInferenceContext(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    online_episode: OnlineEpisodeSample
    geometry_bundle: RoundFeatureBundle
    evidence_bundle: RoundEvidenceBundle

    @property
    def round_context(self) -> RoundContext:
        return self.online_episode.round_context

    @property
    def observations(self) -> tuple[LiveQueryObs, ...]:
        return self.online_episode.observations


class PosteriorPredictor(Protocol):
    name: str

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray: ...


class DecoderPosteriorPredictor:
    def __init__(self, student: Any, decoder: TerminalDecoder) -> None:
        self.student = student
        self.decoder = decoder
        self.name = f"{getattr(student, 'name', 'student')}+{getattr(decoder, 'name', 'decoder')}"

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.student.infer_regime(context)
        seed = context.round_context.seeds[seed_index]
        return self.decoder.posterior_predictive(seed, posterior)
