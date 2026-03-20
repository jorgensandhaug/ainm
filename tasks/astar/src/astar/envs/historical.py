from __future__ import annotations

from functools import lru_cache

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.grid import MapShape, clamp_viewport
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs, ReplayRun
from astar.core.world_state import LiveSettlementObs
from astar.envs.types import (
    GroundTruthBundle,
    RoundContext,
    SeedContext,
    ViewportQuery,
)
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.infra.artifacts.paths import WorkspacePaths


@lru_cache(maxsize=64)
def _cached_round_episode(root: str, round_id: str) -> RoundEpisode:
    return build_round_episode(WorkspacePaths.from_root(root), round_id)


def _sample_terminal_view(
    run: ReplayRun,
    *,
    round_id: str,
    query: ViewportQuery,
    query_index: int,
) -> LiveQueryObs:
    final_frame = run.frames[-1]
    viewport = clamp_viewport(
        query.viewport,
        MapShape(width=final_frame.grid.shape[1], height=final_frame.grid.shape[0]),
    )
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
        round_id=round_id,
        seed_index=query.seed_index,
        viewport=viewport,
        grid=grid,
        settlements=settlements,
        query_index=query_index,
    )


class HistoricalReplayOracle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    paths: WorkspacePaths
    name: str = "historical_replay_oracle"

    def _episode(self, round_id: str) -> RoundEpisode:
        return _cached_round_episode(str(self.paths.root), round_id)

    def get_round_context(self, round_id: str) -> RoundContext:
        episode = self._episode(round_id)
        return RoundContext(
            round_id=episode.metadata.round_id,
            round_number=episode.metadata.round_number,
            status=episode.metadata.status,
            map_width=episode.metadata.map_width,
            map_height=episode.metadata.map_height,
            seeds=tuple(
                SeedContext(seed_index=seed.seed_index, initial_state=seed.initial_state)
                for seed in episode.seeds
            ),
        )

    def sample_trajectory(
        self,
        round_id: str,
        seed_index: int,
        *,
        rng_seed: int | None = None,
    ) -> ReplayRun:
        episode = self._episode(round_id)
        seed = episode.seeds[seed_index]
        if not seed.replay_runs:
            raise ValueError(f"round {round_id} seed {seed_index} has no replay runs")
        index = 0 if rng_seed is None else int(rng_seed) % len(seed.replay_runs)
        return seed.replay_runs[index]

    def sample_view(
        self,
        round_id: str,
        query: ViewportQuery,
        *,
        rng_seed: int | None = None,
    ) -> LiveQueryObs:
        run = self.sample_trajectory(round_id, query.seed_index, rng_seed=rng_seed)
        query_index = 0 if rng_seed is None else int(rng_seed)
        return _sample_terminal_view(run, round_id=round_id, query=query, query_index=query_index)

    def get_ground_truth(self, round_id: str) -> GroundTruthBundle:
        episode = self._episode(round_id)
        truths_by_seed: dict[int, np.ndarray] = {}
        for seed in episode.seeds:
            if seed.terminal_truth is not None:
                truths_by_seed[seed.seed_index] = seed.terminal_truth.probs
                continue
            if not seed.replay_runs:
                continue
            height, width = seed.replay_runs[0].frames[-1].grid.shape
            counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
            for run in seed.replay_runs:
                collapsed = collapse_internal_grid(run.frames[-1].grid)
                for class_index in range(CLASS_COUNT):
                    counts[:, :, class_index] += collapsed == class_index
            truths_by_seed[seed.seed_index] = counts / float(len(seed.replay_runs))
        return GroundTruthBundle(round_id=round_id, truths_by_seed=truths_by_seed)


__all__ = ["HistoricalReplayOracle"]
