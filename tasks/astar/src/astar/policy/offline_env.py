from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.core.score import ScoreBreakdown, score_prediction
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs
from astar.history.episodes.models import RoundEpisode, SeedEpisode


def _seed_target_tensor(seed: SeedEpisode) -> np.ndarray:
    if seed.terminal_truth is not None:
        return seed.terminal_truth.probs
    if not seed.replay_runs:
        raise ValueError(f"seed {seed.seed_index} has no terminal target")
    height, width = seed.replay_runs[0].frames[-1].grid.shape
    counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    for run in seed.replay_runs:
        collapsed = collapse_internal_grid(run.frames[-1].grid)
        for class_index in range(CLASS_COUNT):
            counts[:, :, class_index] += collapsed == class_index
    return counts / float(len(seed.replay_runs))


class OfflinePolicyEnv(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_episode: RoundEpisode
    sample_index: int = Field(default=0, ge=0)

    def sample_query(self, seed_index: int, viewport: Viewport, query_index: int) -> LiveQueryObs:
        seed = self.round_episode.seeds[seed_index]
        if not seed.replay_runs:
            raise ValueError(f"seed {seed_index} has no replay runs")
        run = seed.replay_runs[(self.sample_index + query_index) % len(seed.replay_runs)]
        final_frame = run.frames[-1]
        grid = np.asarray(
            final_frame.grid[
                viewport.y : viewport.y + viewport.h,
                viewport.x : viewport.x + viewport.w,
            ],
            dtype=np.int64,
        )
        settlements = tuple(
            LiveSettlementObs(
                x=item.x,
                y=item.y,
                population=item.population,
                food=item.food,
                wealth=item.wealth,
                defense=item.defense,
                has_port=item.has_port,
                alive=item.alive,
                owner_id=item.owner_id,
            )
            for item in final_frame.settlements
            if viewport.x <= item.x < viewport.x + viewport.w
            and viewport.y <= item.y < viewport.y + viewport.h
        )
        return LiveQueryObs(
            round_id=self.round_episode.metadata.round_id,
            seed_index=seed_index,
            viewport=viewport,
            grid=grid,
            settlements=settlements,
            query_index=query_index,
        )

    def score_predictions(
        self,
        predictions_by_seed: dict[int, np.ndarray],
    ) -> dict[int, ScoreBreakdown]:
        return {
            seed.seed_index: score_prediction(
                _seed_target_tensor(seed),
                predictions_by_seed[seed.seed_index],
            )
            for seed in self.round_episode.seeds
            if seed.seed_index in predictions_by_seed
        }
