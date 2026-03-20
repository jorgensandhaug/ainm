from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from astar.core.trajectory import LiveQueryObs
from astar.envs.historical import HistoricalReplayOracle
from astar.envs.types import GroundTruthBundle, RoundContext, ViewportQuery
from astar.infra.artifacts.paths import WorkspacePaths


class SyntheticActiveOracle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    paths: WorkspacePaths
    name: str = "synthetic_active_oracle"

    def get_round_context(self, round_id: str) -> RoundContext:
        return HistoricalReplayOracle(paths=self.paths).get_round_context(round_id)

    def sample_view(
        self,
        round_id: str,
        query: ViewportQuery,
        *,
        rng_seed: int | None = None,
    ) -> LiveQueryObs:
        return HistoricalReplayOracle(paths=self.paths).sample_view(
            round_id,
            query,
            rng_seed=rng_seed,
        )

    def get_ground_truth(self, round_id: str) -> GroundTruthBundle:
        return HistoricalReplayOracle(paths=self.paths).get_ground_truth(round_id)


__all__ = ["SyntheticActiveOracle"]
