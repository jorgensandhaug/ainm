from __future__ import annotations

import json
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
from astar.workflows.replay_eda import analyze_replay_corpus
from tests.conftest import ROUND_ID


def _write_birth_collapse_replay(
    paths: RepoPaths,
    *,
    seed_index: int,
    capture_id: str,
    sim_seed: int,
) -> None:
    round_record = read_round_record(paths, ROUND_ID)
    base_grid = [row[:] for row in round_record.round.initial_states[seed_index].grid]
    built_grid = [row[:] for row in base_grid]
    ruined_grid = [row[:] for row in built_grid]
    built_grid[1][1] = 1
    ruined_grid[1][1] = 3
    settlement = SettlementObservation(
        x=1,
        y=1,
        population=3.0,
        food=8.0,
        wealth=4.0,
        defense=2.0,
        has_port=False,
        alive=True,
        owner_id=seed_index,
    )
    record = StoredReplayRecord(
        capture_id=capture_id,
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=seed_index),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=seed_index,
            sim_seed=sim_seed,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(step=0, grid=base_grid, settlements=[]),
                ReplayFrame(step=1, grid=built_grid, settlements=[settlement]),
                ReplayFrame(step=2, grid=ruined_grid, settlements=[]),
            ],
        ),
    )
    write_replay_record(paths, record)


def _write_short_replay(
    paths: RepoPaths,
    *,
    seed_index: int,
    capture_id: str,
    sim_seed: int,
) -> None:
    round_record = read_round_record(paths, ROUND_ID)
    record = StoredReplayRecord(
        capture_id=capture_id,
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=seed_index),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=seed_index,
            sim_seed=sim_seed,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(
                    step=0,
                    grid=round_record.round.initial_states[seed_index].grid,
                    settlements=[],
                ),
            ],
        ),
    )
    write_replay_record(paths, record)


def test_analyze_replay_corpus_writes_report_and_summary(sample_paths: RepoPaths) -> None:
    _write_birth_collapse_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)
    _write_birth_collapse_replay(sample_paths, seed_index=1, capture_id="c1", sim_seed=101)
    _write_short_replay(sample_paths, seed_index=0, capture_id="short", sim_seed=102)

    result = analyze_replay_corpus(sample_paths)

    assert result.round_count == 1
    assert result.replay_run_count == 2
    assert result.skipped_short_replay_count == 1
    assert result.changed_cell_year_count > 0
    assert result.mountain_break_count == 0
    assert result.summary_path.exists()
    assert result.report_path.exists()

    summary_payload = json.loads(result.summary_path.read_text(encoding="utf-8"))
    assert summary_payload["replay_run_count"] == 2
    assert summary_payload["skipped_short_replay_count"] == 1

    transition_pairs = {(item.from_code, item.to_code) for item in result.top_transitions}
    assert (11, 1) in transition_pairs
    assert (1, 3) in transition_pairs

    report_text = result.report_path.read_text(encoding="utf-8")
    assert "# Replay EDA" in report_text
    assert "buildable_ever_changed" in report_text
