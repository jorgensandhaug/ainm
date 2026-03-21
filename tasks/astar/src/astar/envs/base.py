from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.score import ScoreBreakdown
from astar.core.trajectory import LiveQueryObs, ReplayRun
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.envs.types import GroundTruthBundle, OnlineEpisodeSample, RoundContext, ViewportQuery


class TranscriptBeliefState(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    online_episode: OnlineEpisodeSample

    @property
    def round_context(self) -> RoundContext:
        return self.online_episode.round_context

    @property
    def observations(self) -> tuple[LiveQueryObs, ...]:
        return self.online_episode.observations


class ActiveOracle(Protocol):
    name: str

    def get_round_context(self, round_id: str) -> RoundContext: ...
    def sample_view(
        self,
        round_id: str,
        query: ViewportQuery,
        *,
        rng_seed: int | None = None,
        query_index: int | None = None,
    ) -> LiveQueryObs: ...


class PrivilegedOracle(ActiveOracle, Protocol):
    def sample_trajectory(
        self,
        round_id: str,
        seed_index: int,
        *,
        rng_seed: int | None = None,
    ) -> ReplayRun: ...
    def get_ground_truth(self, round_id: str) -> GroundTruthBundle: ...


class OnlinePredictor(Protocol):
    name: str

    def init_belief(self, ctx: RoundContext) -> TranscriptBeliefState: ...
    def update(
        self,
        belief: TranscriptBeliefState,
        obs: LiveQueryObs,
    ) -> TranscriptBeliefState: ...
    def predict(self, belief: TranscriptBeliefState) -> PredictionBundle: ...


class InteractiveQueryPolicy(Protocol):
    name: str

    def select(
        self,
        belief: TranscriptBeliefState,
        budget_left: int,
    ) -> ViewportQuery | None: ...


class CompetitionEvaluator:
    name = "official_entropy_weighted_kl"

    def score_prediction(
        self,
        pred: PredictionBundle,
        truth: GroundTruthBundle,
    ) -> dict[int, ScoreBreakdown]:
        from astar.core.score import score_prediction

        results: dict[int, ScoreBreakdown] = {}
        for seed_index, truth_tensor in truth.truths_by_seed.items():
            prediction = pred.predictions_by_seed[seed_index]
            spec = SubmissionSpec(
                height=truth_tensor.shape[0],
                width=truth_tensor.shape[1],
                classes=truth_tensor.shape[2],
            )
            validate_prediction_tensor(prediction, spec)
            results[seed_index] = score_prediction(truth_tensor, prediction)
        return results


__all__ = [
    "ActiveOracle",
    "CompetitionEvaluator",
    "InteractiveQueryPolicy",
    "OnlinePredictor",
    "PrivilegedOracle",
    "TranscriptBeliefState",
]
