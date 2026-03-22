from __future__ import annotations

from datetime import UTC, datetime

import pytest

from astar.infra.api.dto import (
    InitialSettlement,
    InitialState,
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    SettlementObservation,
    StoredReplayRecord,
    StoredRoundRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_replay_record, write_round_record
from astar.workflows.raw_replay_status import summarize_raw_replay_status
from tests.conftest import ROUND_ID


def _write_replay(paths: RepoPaths, *, round_id: str, seed_index: int, sim_seed: int) -> None:
    round_record = read_round_record(paths, round_id)
    grid = [row[:] for row in round_record.round.initial_states[seed_index].grid]
    settlement = SettlementObservation(
        x=seed_index,
        y=seed_index,
        population=1.0,
        food=0.5,
        wealth=0.5,
        defense=0.5,
        has_port=False,
        alive=True,
        owner_id=seed_index,
    )
    record = StoredReplayRecord(
        capture_id=f"{round_id}-{seed_index}-{sim_seed}",
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=round_id, seed_index=seed_index),
        response=ReplayResponse(
            round_id=round_id,
            seed_index=seed_index,
            sim_seed=sim_seed,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[ReplayFrame(step=0, grid=grid, settlements=[settlement])],
        ),
    )
    write_replay_record(paths, record)


def _write_second_round(sample_paths: RepoPaths) -> str:
    source = read_round_record(sample_paths, ROUND_ID)
    second_round_id = "11111111-1111-1111-1111-111111111111"
    duplicate_grid = [[11, 4], [5, 3]]
    second_round = StoredRoundRecord(
        fetched_at=source.fetched_at,
        round=source.round.model_copy(
            update={
                "id": second_round_id,
                "round_number": 2,
                "map_width": 2,
                "map_height": 2,
                "seeds_count": 2,
                "initial_states": [
                    InitialState(
                        grid=duplicate_grid,
                        settlements=[
                            InitialSettlement(
                                x=0,
                                y=0,
                                has_port=False,
                                alive=True,
                            ),
                        ],
                    ),
                    InitialState(
                        grid=duplicate_grid,
                        settlements=[],
                    ),
                ],
            },
        ),
    )
    write_round_record(sample_paths, second_round)
    return second_round_id


def test_summarize_raw_replay_status_reports_counts_and_deduped_maps(
    sample_paths: RepoPaths,
) -> None:
    second_round_id = _write_second_round(sample_paths)
    first_round = read_round_record(sample_paths, ROUND_ID).round
    base_unique_map_count = len(
        {
            tuple(tuple(cell for cell in row) for row in state.grid)
            for state in first_round.initial_states
        },
    )
    _write_replay(sample_paths, round_id=ROUND_ID, seed_index=0, sim_seed=100)
    _write_replay(sample_paths, round_id=ROUND_ID, seed_index=0, sim_seed=101)
    _write_replay(sample_paths, round_id=ROUND_ID, seed_index=3, sim_seed=102)
    _write_replay(sample_paths, round_id=second_round_id, seed_index=1, sim_seed=200)

    result = summarize_raw_replay_status(sample_paths)

    assert result.round_count == 2
    assert result.replay_file_count == 4
    assert result.seed_map_count == 7
    assert result.unique_grid_map_count == base_unique_map_count + 1
    assert [item.map_size for item in result.size_breakdown] == ["8x8", "2x2"]
    assert [(item.round_number, item.round_id) for item in result.rounds] == [
        (1, ROUND_ID),
        (2, second_round_id),
    ]
    assert result.rounds[0].replay_count == 3
    assert result.rounds[0].per_seed_replay_counts == [2, 0, 0, 1, 0]
    assert result.rounds[1].replay_count == 1
    assert result.rounds[1].per_seed_replay_counts == [0, 1]


def test_summarize_raw_replay_status_can_filter_round_ids(sample_paths: RepoPaths) -> None:
    second_round_id = _write_second_round(sample_paths)
    _write_replay(sample_paths, round_id=second_round_id, seed_index=0, sim_seed=200)

    result = summarize_raw_replay_status(sample_paths, round_ids=[second_round_id])

    assert result.round_count == 1
    assert result.replay_file_count == 1
    assert result.seed_map_count == 2
    assert result.unique_grid_map_count == 1
    assert [item.round_id for item in result.rounds] == [second_round_id]


def test_summarize_raw_replay_status_raises_for_missing_round_id(sample_paths: RepoPaths) -> None:
    with pytest.raises(FileNotFoundError, match="missing raw round metadata"):
        summarize_raw_replay_status(
            sample_paths,
            round_ids=["missing-round-id"],
        )
