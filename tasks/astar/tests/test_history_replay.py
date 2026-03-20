from __future__ import annotations

from datetime import UTC, datetime

from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import (
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    SettlementObservation,
    StoredReplayRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import load_named_arrays, read_round_record, write_replay_record
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.summarize_replays import inspect_replays, summarize_round_replays
from tests.conftest import ROUND_ID


def _write_sample_replay(
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
    built_grid[seed_index][seed_index] = 1
    built_grid[seed_index][seed_index + 1] = 2
    ruined_grid[seed_index][seed_index] = 3
    ruined_grid[seed_index + 1][seed_index] = 4
    settlement = SettlementObservation(
        x=seed_index,
        y=seed_index,
        population=1.5,
        food=0.4,
        wealth=0.6,
        defense=0.7,
        has_port=(seed_index % 2 == 0),
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
                ReplayFrame(step=0, grid=base_grid, settlements=[settlement]),
                ReplayFrame(step=1, grid=built_grid, settlements=[settlement]),
                ReplayFrame(step=2, grid=ruined_grid, settlements=[settlement]),
            ],
        ),
    )
    write_replay_record(paths, record)


def test_inspect_replays_reports_local_replay_runs(sample_paths: RepoPaths) -> None:
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)
    _write_sample_replay(sample_paths, seed_index=1, capture_id="c1", sim_seed=101)

    result = inspect_replays(sample_paths, ROUND_ID)

    assert result.round_inspection is not None
    assert result.round_inspection.round_id == ROUND_ID
    assert result.round_inspection.replay_run_count == 2
    assert [item.replay_run_count for item in result.round_inspection.per_seed] == [1, 1]


def test_summarize_round_replays_writes_seed_npz_and_round_report(sample_paths: RepoPaths) -> None:
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c1", sim_seed=101)
    _write_sample_replay(sample_paths, seed_index=1, capture_id="c2", sim_seed=102)

    result = summarize_round_replays(sample_paths, ROUND_ID)

    assert result.replay_run_count == 3
    assert result.replay_seed_count == 2
    assert result.round_summary_path.exists()
    assert result.report_path.exists()
    assert all(path.exists() for path in result.summary_paths)

    payload = load_named_arrays(result.summary_paths[0])
    assert "mean_terminal_probs" in payload
    assert "build_hazard_by_step" in payload
    assert int(payload["replay_run_count"][0]) >= 1


def test_build_round_episode_and_materialize_episode_include_replays(
    sample_paths: RepoPaths,
) -> None:
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)

    episode = build_round_episode(sample_paths, ROUND_ID)
    assert episode.live_transcript is not None
    assert episode.replay_run_count == 1
    assert len(episode.seeds[0].replay_runs) == 1

    result = materialize_round_episode(sample_paths, ROUND_ID)
    assert result.replay_round_summary is not None
    assert result.replay_report_path is not None
    assert result.replay_report_path.exists()
    assert result.per_seed[0].replay_summary_path is not None
    assert result.per_seed[0].replay_summary_path.exists()
