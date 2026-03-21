from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import InitialSettlementState, InitialWorldState, LiveSettlementObs
from astar.envs.types import RoundContext, SeedContext, ViewportQuery
from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import SimulationRequest, StoredQueryRecord
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record, write_query_record
from astar.observe.executor import current_git_sha
from astar.workflows.sync_round import sync_round


class LiveApiOracle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    paths: WorkspacePaths
    client: AstarApiClient
    name: str = "live_api_oracle"

    def get_round_context(self, round_id: str) -> RoundContext:
        sync_round(self.paths, self.client, round_id)
        round_record = read_round_record(self.paths, round_id)
        return RoundContext(
            round_id=round_record.round.id,
            round_number=round_record.round.round_number,
            status=round_record.round.status,
            map_width=round_record.round.map_width,
            map_height=round_record.round.map_height,
            seeds=tuple(
                SeedContext(
                    seed_index=seed_index,
                    initial_state=InitialWorldState(
                        grid=np.asarray(seed.grid, dtype=np.int64),
                        settlements=tuple(
                            InitialSettlementState(
                                x=item.x,
                                y=item.y,
                                has_port=item.has_port,
                                alive=item.alive,
                            )
                            for item in seed.settlements
                        ),
                    ),
                )
                for seed_index, seed in enumerate(round_record.round.initial_states)
            ),
        )

    def sample_view(
        self,
        round_id: str,
        query: ViewportQuery,
        *,
        rng_seed: int | None = None,
        query_index: int | None = None,
    ) -> LiveQueryObs:
        del rng_seed
        response = self.client.simulate(
            SimulationRequest(
                round_id=round_id,
                seed_index=query.seed_index,
                viewport_x=query.viewport.x,
                viewport_y=query.viewport.y,
                viewport_w=query.viewport.w,
                viewport_h=query.viewport.h,
            ),
        )
        query_id = uuid4().hex
        record = StoredQueryRecord(
            query_id=query_id,
            requested_at=datetime.now(UTC),
            git_sha=current_git_sha(),
            config_hash="live_api_oracle",
            request=SimulationRequest(
                round_id=round_id,
                seed_index=query.seed_index,
                viewport_x=query.viewport.x,
                viewport_y=query.viewport.y,
                viewport_w=query.viewport.w,
                viewport_h=query.viewport.h,
            ),
            response=response,
        )
        write_query_record(self.paths, round_id, record)
        return LiveQueryObs(
            round_id=round_id,
            seed_index=query.seed_index,
            viewport=response.viewport,
            grid=np.asarray(response.grid, dtype=np.int64),
            settlements=tuple(
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
                for item in response.settlements
            ),
            query_index=0 if query_index is None else int(query_index),
        )


__all__ = ["LiveApiOracle"]
