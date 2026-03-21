from __future__ import annotations

from datetime import UTC, datetime

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.replay.ingest import load_seed_replay_runs
from astar.history.summaries.measurements import (
    build_replay_measurement_bundle,
    build_round_measurement_summary,
    load_replay_measurement_bundle,
)
from astar.infra.api.dto import (
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    SettlementObservation,
    StoredReplayRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_replay_record
from astar.workflows.summarize_replays import summarize_round_replays
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_build_replay_measurement_bundle_captures_site_settlement_pair_and_shock_tables(
    sample_paths: RepoPaths,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_features = compute_round_features(round_record.round)
    base_grid = [row[:] for row in round_record.round.initial_states[0].grid]
    next_grid = [row[:] for row in base_grid]
    next_grid[0][0] = 2
    next_grid[1][1] = 1
    base_grid[1][2] = 3
    next_grid[1][2] = 4

    frame0_settlements = [
        SettlementObservation(
            x=0,
            y=0,
            population=10.0,
            food=4.0,
            wealth=2.0,
            defense=3.0,
            has_port=False,
            alive=True,
            owner_id=1,
        ),
        SettlementObservation(
            x=1,
            y=1,
            population=7.0,
            food=3.0,
            wealth=1.5,
            defense=2.5,
            has_port=True,
            alive=True,
            owner_id=2,
        ),
    ]
    frame1_settlements = [
        SettlementObservation(
            x=0,
            y=0,
            population=11.0,
            food=5.0,
            wealth=2.5,
            defense=3.5,
            has_port=True,
            alive=True,
            owner_id=1,
        ),
        SettlementObservation(
            x=1,
            y=1,
            population=6.0,
            food=1.0,
            wealth=1.0,
            defense=1.5,
            has_port=True,
            alive=True,
            owner_id=3,
        ),
    ]
    record = StoredReplayRecord(
        capture_id="measurement-test",
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=0),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=0,
            sim_seed=123,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(step=0, grid=base_grid, settlements=frame0_settlements),
                ReplayFrame(step=1, grid=next_grid, settlements=frame1_settlements),
            ],
        ),
    )
    write_replay_record(sample_paths, record)

    runs = load_seed_replay_runs(sample_paths, ROUND_ID, 0)
    initial_grid = np.asarray(round_record.round.initial_states[0].grid, dtype=np.int64)
    bundle = build_replay_measurement_bundle(
        initial_grid,
        round_features.per_seed[0],
        runs,
    )
    round_summary = build_round_measurement_summary(
        ROUND_ID,
        round_record.round.round_number,
        [bundle],
    )

    assert bundle.summary.frame_transition_count == 1
    assert bundle.summary.site_transition_count == (
        round_record.round.map_width * round_record.round.map_height
    )
    assert int(bundle.site_transition_counts_by_step.sum()) == bundle.summary.site_transition_count
    assert bundle.summary.site_opportunity_count > 0
    assert bundle.summary.settlement_measurement_count == 2
    assert bundle.summary.live_settlement_transition_count == 2
    assert bundle.summary.ruin_transition_count == 1
    assert bundle.summary.pairwise_candidate_count == 2
    assert bundle.summary.owner_year_count == 2
    assert bundle.summary.year_shock_count == 1
    assert bundle.summary.macro_trajectory_count == 1
    assert "birth" in bundle.site_opportunities.columns
    assert "site_ruin_created" in bundle.site_opportunities.columns
    assert "transition_kind" in bundle.settlement_measurements.columns
    assert "transition_kind" in bundle.live_settlement_transitions.columns
    assert "rebuild_settlement" in bundle.ruin_transitions.columns
    assert "coast_distance_steps" in bundle.settlement_measurements.columns
    assert "land_distance_to_settlement_steps" in bundle.settlement_measurements.columns
    assert "sea_distance_to_port_steps" in bundle.settlement_measurements.columns
    assert "settlement_basin_gap_steps" in bundle.settlement_measurements.columns
    assert "land_distance" in bundle.pairwise_candidates.columns
    assert "settlement_delta" in bundle.owner_years.columns
    assert "collapse_rate" in bundle.year_shocks.columns
    assert "collapse_to_ruin_count" in bundle.year_shocks.columns
    assert "site_ruin_created_count" in bundle.year_shocks.columns
    assert "site_ruin_created_rate" in bundle.year_shocks.columns
    assert "live_delta" in bundle.macro_trajectories.columns
    assert bundle.settlement_measurements.get_column("coast_distance_steps").min() >= -1
    assert bundle.settlement_measurements.get_column("sea_distance_to_port_steps").min() >= -1
    assert int(bundle.settlement_measurements.get_column("port_gain").sum()) == 1
    assert int(bundle.settlement_measurements.get_column("owner_flip").sum()) == 1
    assert int(bundle.site_opportunities.get_column("site_ruin_created").sum()) == 0
    assert int(bundle.ruin_transitions.get_column("reclaim_forest").sum()) == 1
    assert bundle.year_shocks.get_column("owner_flip_count").to_list() == [1]
    assert bundle.year_shocks.get_column("collapse_to_ruin_count").to_list() == [0]
    assert bundle.year_shocks.get_column("site_ruin_created_count").to_list() == [0]
    assert round_summary.site_opportunity_count == bundle.summary.site_opportunity_count
    assert round_summary.live_settlement_transition_count == 2
    assert round_summary.ruin_transition_count == 1
    assert round_summary.pairwise_candidate_count == 2
    assert round_summary.owner_year_count == 2
    assert round_summary.year_shock_count == 1
    assert round_summary.macro_trajectory_count == 1


def test_load_replay_measurement_bundle_roundtrips_saved_artifacts(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _ = summarize_round_replays(sample_paths, ROUND_ID)

    bundle = load_replay_measurement_bundle(sample_paths, ROUND_ID, 0)

    assert bundle is not None
    assert bundle.summary.replay_run_count >= 1
    assert bundle.site_transition_counts_by_step.ndim == 5
    assert bundle.summary.site_transition_count == int(bundle.site_transition_counts_by_step.sum())
    assert "transition_kind" in bundle.settlement_measurements.columns


def test_build_replay_measurement_bundle_counts_site_ruin_creation(
    sample_paths: RepoPaths,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_features = compute_round_features(round_record.round)
    base_grid = [row[:] for row in round_record.round.initial_states[0].grid]
    next_grid = [row[:] for row in base_grid]
    buildable = round_features.per_seed[0].feature("buildable") > 0.5
    candidate_positions = [
        (int(y), int(x))
        for y, x in zip(*np.nonzero(buildable), strict=True)
        if (y, x) not in {(1, 1), (0, 0)}
    ]
    (y0, x0), (y1, x1) = candidate_positions[:2]
    base_grid[y0][x0] = 11
    base_grid[y1][x1] = 4
    next_grid[y0][x0] = 3
    next_grid[y1][x1] = 3

    frame0_settlements = [
        SettlementObservation(
            x=1,
            y=1,
            population=10.0,
            food=4.0,
            wealth=2.0,
            defense=3.0,
            has_port=False,
            alive=True,
            owner_id=1,
        ),
    ]
    frame1_settlements = [
        SettlementObservation(
            x=1,
            y=1,
            population=9.0,
            food=3.0,
            wealth=2.0,
            defense=3.0,
            has_port=False,
            alive=True,
            owner_id=1,
        ),
    ]
    record = StoredReplayRecord(
        capture_id="measurement-site-ruin-test",
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=ROUND_ID, seed_index=0),
        response=ReplayResponse(
            round_id=ROUND_ID,
            seed_index=0,
            sim_seed=456,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(step=0, grid=base_grid, settlements=frame0_settlements),
                ReplayFrame(step=1, grid=next_grid, settlements=frame1_settlements),
            ],
        ),
    )
    write_replay_record(sample_paths, record)

    runs = [
        run
        for run in load_seed_replay_runs(sample_paths, ROUND_ID, 0)
        if run.replay_run_id == "measurement-site-ruin-test"
    ]
    initial_grid = np.asarray(round_record.round.initial_states[0].grid, dtype=np.int64)
    bundle = build_replay_measurement_bundle(
        initial_grid,
        round_features.per_seed[0],
        runs,
    )

    assert int(bundle.site_opportunities.get_column("site_ruin_created").sum()) == 2
    assert bundle.year_shocks.get_column("site_ruin_created_count").to_list() == [2]
    assert bundle.year_shocks.get_column("collapse_to_ruin_count").to_list() == [0]
