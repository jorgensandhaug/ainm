from __future__ import annotations

from datetime import UTC, datetime

from astar.infra.api.dto import (
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    SettlementObservation,
    StoredReplayRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_replay_record
from tests.conftest import ROUND_ID


def _write_sample_replay(
    paths: RepoPaths,
    *,
    round_id: str = ROUND_ID,
    seed_index: int,
    capture_id: str,
    sim_seed: int,
) -> None:
    round_record = read_round_record(paths, round_id)
    base_grid = [row[:] for row in round_record.round.initial_states[seed_index].grid]
    built_grid = [row[:] for row in base_grid]
    ruined_grid = [row[:] for row in built_grid]
    y = min(seed_index, len(base_grid) - 1)
    x = min(seed_index, len(base_grid[0]) - 1)
    y_next = min(y + 1, len(base_grid) - 1)
    x_next = min(x + 1, len(base_grid[0]) - 1)
    built_grid[y][x] = 1
    built_grid[y][x_next] = 2
    ruined_grid[y][x] = 3
    ruined_grid[y_next][x] = 4
    settlement = SettlementObservation(
        x=x,
        y=y,
        population=1.5 + seed_index,
        food=0.4,
        wealth=0.6,
        defense=0.7,
        has_port=(seed_index % 2 == 0),
        alive=True,
        owner_id=seed_index,
    )
    write_replay_record(
        paths,
        StoredReplayRecord(
            capture_id=capture_id,
            requested_at=datetime.now(UTC),
            git_sha="test",
            request=ReplayRequest(round_id=round_id, seed_index=seed_index),
            response=ReplayResponse(
                round_id=round_id,
                seed_index=seed_index,
                sim_seed=sim_seed,
                width=round_record.round.map_width,
                height=round_record.round.map_height,
                frames=[
                    ReplayFrame(step=0, grid=base_grid, settlements=[settlement]),
                    ReplayFrame(step=1, grid=built_grid, settlements=[settlement]),
                    ReplayFrame(step=2, grid=ruined_grid, settlements=[settlement]),
                ],
            ),
        ),
    )


def _write_replays_for_all_seeds(
    paths: RepoPaths,
    run_count: int = 1,
    *,
    round_id: str = ROUND_ID,
) -> None:
    round_record = read_round_record(paths, round_id)
    for seed_index in range(round_record.round.seeds_count):
        for run_index in range(run_count):
            _write_sample_replay(
                paths,
                round_id=round_id,
                seed_index=seed_index,
                capture_id=f"seed{seed_index}_run{run_index}",
                sim_seed=1000 + seed_index * 10 + run_index,
            )


__all__ = ["_write_replays_for_all_seeds", "_write_sample_replay"]
