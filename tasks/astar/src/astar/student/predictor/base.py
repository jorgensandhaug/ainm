from __future__ import annotations

from typing import Any, Protocol

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.models import RoundEpisode
from astar.observe.evidence import RoundEvidenceBundle
from astar.teacher.decoder.base import TerminalDecoder


class LiveInferenceContext(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_episode: RoundEpisode
    geometry_bundle: RoundFeatureBundle
    evidence_bundle: RoundEvidenceBundle


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
        seed = context.round_episode.seeds[seed_index]
        return self.decoder.posterior_predictive(seed, posterior)
