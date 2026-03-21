from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.envs.base import (
    ActiveOracle,
    InteractiveQueryPolicy,
    OnlinePredictor,
    TranscriptBeliefState,
)
from astar.envs.types import RoundContext
from astar.workflows.results import TournamentQueryTrace


class OnlineEpisodeRun(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_context: RoundContext
    belief: TranscriptBeliefState
    prediction_bundle: PredictionBundle
    query_trace: list[TournamentQueryTrace]

    @property
    def executed_queries(self) -> int:
        return len(self.query_trace)


def run_online_episode(
    oracle: ActiveOracle,
    *,
    round_id: str,
    predictor: OnlinePredictor,
    policy: InteractiveQueryPolicy,
    budget: int = 50,
    episode_seed: int = 0,
) -> OnlineEpisodeRun:
    round_context = oracle.get_round_context(round_id)
    belief = predictor.init_belief(round_context)
    query_trace: list[TournamentQueryTrace] = []
    for query_index in range(budget):
        query = policy.select(belief, budget - query_index)
        if query is None:
            break
        observation = oracle.sample_view(
            round_id,
            query,
            rng_seed=episode_seed + query_index,
            query_index=query_index,
        )
        belief = predictor.update(belief, observation)
        query_trace.append(
            TournamentQueryTrace(
                query_index=query_index,
                seed_index=query.seed_index,
                viewport=query.viewport,
                settlement_count=len(observation.settlements),
                rationale=query.rationale,
            ),
        )
    prediction_bundle = predictor.predict(belief)
    return OnlineEpisodeRun(
        round_context=round_context,
        belief=belief,
        prediction_bundle=prediction_bundle,
        query_trace=query_trace,
    )


__all__ = ["OnlineEpisodeRun", "run_online_episode"]
