from __future__ import annotations

import json
from datetime import UTC, datetime

import polars as pl

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
from astar.workflows.visualize_replay_events import visualize_replay_events
from astar.workflows.visualize_replay_mismatches import visualize_replay_mismatches
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


def _write_mismatch_replay(
    paths: RepoPaths,
    *,
    seed_index: int,
    capture_id: str,
    sim_seed: int,
) -> None:
    round_record = read_round_record(paths, ROUND_ID)
    base_grid = [row[:] for row in round_record.round.initial_states[seed_index].grid]
    mismatch_grid = [row[:] for row in base_grid]
    base_grid[0][0] = 11
    mismatch_grid[0][0] = 3
    base_grid[0][1] = 3
    mismatch_grid[0][1] = 1
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
                ReplayFrame(step=1, grid=mismatch_grid, settlements=[]),
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
    assert all(path.exists() for path in result.cell_event_paths)
    assert all(path.exists() for path in result.settlement_event_paths)
    assert all(path.exists() for path in result.site_transition_paths)
    assert all(path.exists() for path in result.site_opportunity_paths)
    assert all(path.exists() for path in result.settlement_measurement_paths)
    assert all(path.exists() for path in result.live_settlement_transition_paths)
    assert all(path.exists() for path in result.ruin_transition_paths)
    assert all(path.exists() for path in result.pairwise_candidate_paths)
    assert all(path.exists() for path in result.owner_year_paths)
    assert all(path.exists() for path in result.year_shock_paths)
    assert all(path.exists() for path in result.macro_trajectory_paths)

    payload = load_named_arrays(result.summary_paths[0])
    assert "mean_terminal_probs" in payload
    assert "build_hazard_by_step" in payload
    assert "event_summary_names" in payload
    assert "event_summary_vector" in payload
    assert "site_transition_count" in payload
    assert "site_opportunity_count" in payload
    assert "settlement_measurement_count" in payload
    assert "live_settlement_transition_count" in payload
    assert "owner_year_count" in payload
    assert int(payload["replay_run_count"][0]) >= 1

    cell_events = pl.read_parquet(result.cell_event_paths[0])
    settlement_events = pl.read_parquet(result.settlement_event_paths[0])
    site_transition_payload = load_named_arrays(result.site_transition_paths[0])
    site_opportunities = pl.read_parquet(result.site_opportunity_paths[0])
    settlement_measurements = pl.read_parquet(result.settlement_measurement_paths[0])
    live_settlement_transitions = pl.read_parquet(result.live_settlement_transition_paths[0])
    ruin_transitions = pl.read_parquet(result.ruin_transition_paths[0])
    pairwise_candidates = pl.read_parquet(result.pairwise_candidate_paths[0])
    owner_years = pl.read_parquet(result.owner_year_paths[0])
    year_shocks = pl.read_parquet(result.year_shock_paths[0])
    macro_trajectories = pl.read_parquet(result.macro_trajectory_paths[0])
    assert "event_kind" in cell_events.columns
    assert "transition_kind" in settlement_events.columns
    assert "rebuild" in settlement_events.columns
    assert "matched_collapse_to_ruin" in cell_events.columns
    assert "matched_settlement_rebuild" in cell_events.columns
    assert "site_transition_counts_by_step" in site_transition_payload
    assert "birth" in site_opportunities.columns
    assert "transition_kind" in settlement_measurements.columns
    assert "transition_kind" in live_settlement_transitions.columns
    assert "rebuild_settlement" in ruin_transitions.columns
    assert "land_distance" in pairwise_candidates.columns
    assert "settlement_delta" in owner_years.columns
    assert "collapse_rate" in year_shocks.columns
    assert "live_delta" in macro_trajectories.columns
    assert cell_events.filter(
        pl.col("built_created") & pl.col("ruin_created")
    ).height == 0

    round_summary = json.loads(result.round_summary_path.read_text(encoding="utf-8"))
    assert "hazard_summary" in round_summary
    assert "event_summary" in round_summary
    assert "measurement_summary" in round_summary
    assert result.event_summary.round_id == ROUND_ID
    assert result.measurement_summary.frame_transition_count >= 1


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
    assert result.per_seed[0].replay_cell_events_path is not None
    assert result.per_seed[0].replay_cell_events_path.exists()
    assert result.per_seed[0].replay_settlement_events_path is not None
    assert result.per_seed[0].replay_settlement_events_path.exists()
    assert result.per_seed[0].replay_site_transition_path is not None
    assert result.per_seed[0].replay_site_transition_path.exists()
    assert result.per_seed[0].replay_site_opportunities_path is not None
    assert result.per_seed[0].replay_site_opportunities_path.exists()
    assert result.per_seed[0].replay_settlement_measurements_path is not None
    assert result.per_seed[0].replay_settlement_measurements_path.exists()
    assert result.per_seed[0].replay_live_settlement_transitions_path is not None
    assert result.per_seed[0].replay_live_settlement_transitions_path.exists()
    assert result.per_seed[0].replay_ruin_transitions_path is not None
    assert result.per_seed[0].replay_ruin_transitions_path.exists()
    assert result.per_seed[0].replay_pairwise_candidates_path is not None
    assert result.per_seed[0].replay_pairwise_candidates_path.exists()
    assert result.per_seed[0].replay_owner_years_path is not None
    assert result.per_seed[0].replay_owner_years_path.exists()
    assert result.per_seed[0].replay_year_shocks_path is not None
    assert result.per_seed[0].replay_year_shocks_path.exists()
    assert result.per_seed[0].replay_macro_trajectories_path is not None
    assert result.per_seed[0].replay_macro_trajectories_path.exists()
    assert result.replay_measurement_summary is not None


def test_visualize_replay_events_writes_report_and_figures(sample_paths: RepoPaths) -> None:
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)

    result = visualize_replay_events(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_steps=2,
    )

    assert result.report_path.exists()
    assert result.manifest_path.exists()
    assert result.figure_paths
    assert all(path.exists() for path in result.figure_paths.values())
    assert "transition_step_0" in result.figure_paths

    result_second = visualize_replay_events(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_steps=1,
    )
    assert result_second.report_path.exists()
    planted = result_second.report_path.parent / "transition_step_999.png"
    planted.write_bytes(b"stale")

    result_third = visualize_replay_events(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_steps=1,
    )
    assert result_third.report_path.exists()
    assert not planted.exists()


def test_visualize_replay_events_handles_zero_transition_runs(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    base_grid = [row[:] for row in round_record.round.initial_states[0].grid]
    settlement = SettlementObservation(
        x=0,
        y=0,
        population=1.5,
        food=0.4,
        wealth=0.6,
        defense=0.7,
        has_port=True,
        alive=True,
        owner_id=0,
    )
    record = StoredReplayRecord(
        capture_id="single-frame",
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=0),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=0,
            sim_seed=123,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[ReplayFrame(step=0, grid=base_grid, settlements=[settlement])],
        ),
    )
    write_replay_record(sample_paths, record)

    result = visualize_replay_events(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_steps=2,
    )

    assert result.report_path.exists()
    assert set(result.figure_paths) == {"change_timeline"}
    assert "_no frame transitions available_" in result.report_path.read_text(encoding="utf-8")


def test_visualize_replay_mismatches_writes_report_and_figures(sample_paths: RepoPaths) -> None:
    _write_mismatch_replay(sample_paths, seed_index=0, capture_id="m0", sim_seed=200)

    result = visualize_replay_mismatches(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_examples_per_kind=2,
    )

    assert result.report_path.exists()
    assert result.manifest_path.exists()
    assert "mismatch_timeline" in result.figure_paths
    assert len(result.figure_paths) == 3
    report_text = result.report_path.read_text(encoding="utf-8")
    assert "ruin_without_collapse" in report_text
    assert "rebuild_without_settlement" in report_text
    assert "mismatch_rows.parquet" in report_text


def test_visualize_replay_mismatches_handles_no_mismatches(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    base_grid = [row[:] for row in round_record.round.initial_states[0].grid]
    settlement = SettlementObservation(
        x=0,
        y=0,
        population=1.5,
        food=0.4,
        wealth=0.6,
        defense=0.7,
        has_port=True,
        alive=True,
        owner_id=0,
    )
    record = StoredReplayRecord(
        capture_id="static",
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=0),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=0,
            sim_seed=100,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(step=0, grid=base_grid, settlements=[settlement]),
                ReplayFrame(step=1, grid=base_grid, settlements=[settlement]),
            ],
        ),
    )
    write_replay_record(sample_paths, record)

    result = visualize_replay_mismatches(
        sample_paths,
        ROUND_ID,
        0,
        replay_run_index=0,
        max_examples_per_kind=2,
    )

    assert result.report_path.exists()
    assert set(result.figure_paths) == {"mismatch_timeline"}
    report_text = result.report_path.read_text(encoding="utf-8")
    assert "total_mismatch_count: `0`" in report_text
    assert "## Example Audits" in report_text
