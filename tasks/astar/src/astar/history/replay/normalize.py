from __future__ import annotations

import hashlib

import numpy as np

from astar.core.trajectory import ReplayRun
from astar.core.world_state import SettlementFullState, WorldFrame
from astar.infra.api.dto import StoredReplayRecord
from astar.infra.artifacts.store import ReplayFileRecord


def replay_record_digest(record: StoredReplayRecord) -> str:
    payload = record.model_dump_json()
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def normalize_replay_record(file_record: ReplayFileRecord) -> ReplayRun:
    record = file_record.record
    frames = tuple(
        WorldFrame(
            t=frame.step,
            grid=np.asarray(frame.grid, dtype=np.int64),
            settlements=tuple(
                SettlementFullState(
                    x=settlement.x,
                    y=settlement.y,
                    population=settlement.population,
                    food=settlement.food,
                    wealth=settlement.wealth,
                    defense=settlement.defense,
                    has_port=settlement.has_port,
                    alive=settlement.alive,
                    owner_id=settlement.owner_id,
                )
                for settlement in frame.settlements
            ),
        )
        for frame in record.response.frames
    )
    return ReplayRun(
        replay_run_id=record.capture_id,
        round_id=record.request.round_id,
        seed_index=record.request.seed_index,
        stochastic_key=str(record.response.sim_seed),
        frames=frames,
        source_digest=replay_record_digest(record),
        source_path=str(file_record.path),
    )
