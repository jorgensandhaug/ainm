from __future__ import annotations

import numpy as np
import polars as pl

from astar.core.trajectory import ReplayRun
from astar.core.world_state import SettlementFullState, WorldFrame
from astar.history.summaries.event_summary import summarize_replay_event_bundle
from astar.history.summaries.events import extract_replay_event_tables


def test_extract_replay_event_tables_captures_transition_labels() -> None:
    frame0 = WorldFrame(
        t=0,
        grid=np.asarray(
            [
                [1, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ],
            dtype=np.int64,
        ),
        settlements=(
            SettlementFullState(
                x=0,
                y=0,
                population=10.0,
                food=4.0,
                wealth=2.0,
                defense=3.0,
                has_port=False,
                owner_id=1,
                alive=True,
            ),
        ),
    )
    frame1 = WorldFrame(
        t=1,
        grid=np.asarray(
            [
                [2, 0, 0],
                [0, 1, 0],
                [0, 0, 0],
            ],
            dtype=np.int64,
        ),
        settlements=(
            SettlementFullState(
                x=0,
                y=0,
                population=12.0,
                food=5.0,
                wealth=2.5,
                defense=3.5,
                has_port=True,
                owner_id=1,
                alive=True,
            ),
            SettlementFullState(
                x=1,
                y=1,
                population=5.0,
                food=2.0,
                wealth=1.0,
                defense=1.0,
                has_port=False,
                owner_id=2,
                alive=True,
            ),
        ),
    )
    frame2 = WorldFrame(
        t=2,
        grid=np.asarray(
            [
                [3, 0, 0],
                [0, 1, 0],
                [0, 0, 0],
            ],
            dtype=np.int64,
        ),
        settlements=(
            SettlementFullState(
                x=1,
                y=1,
                population=6.0,
                food=1.0,
                wealth=0.5,
                defense=0.5,
                has_port=False,
                owner_id=3,
                alive=True,
            ),
        ),
    )
    run = ReplayRun(
        replay_run_id="run-1",
        round_id="round-1",
        seed_index=0,
        source_digest="digest",
        source_path="/tmp/run-1.json",
        frames=(frame0, frame1, frame2),
    )

    bundle = extract_replay_event_tables([run])

    assert bundle.cell_event_count == 3
    assert bundle.settlement_transition_count == 4
    assert int(bundle.cell_events.get_column("built_created").sum()) == 1
    assert int(bundle.cell_events.get_column("port_created").sum()) == 1
    assert int(bundle.cell_events.get_column("ruin_created").sum()) == 1
    assert int(bundle.settlement_transitions.get_column("birth").sum()) == 1
    assert int(bundle.settlement_transitions.get_column("collapse").sum()) == 1
    assert int(bundle.settlement_transitions.get_column("port_gain").sum()) == 1
    assert int(bundle.settlement_transitions.get_column("owner_flip").sum()) == 1
    assert bundle.frame_transition_count == 2

    summary = summarize_replay_event_bundle(bundle)
    assert summary.frame_transition_count == 2
    assert summary.build_event_count == 1
    assert summary.port_created_event_count == 1
    assert summary.birth_event_count == 1
    assert summary.collapse_event_count == 1
    assert summary.owner_flip_event_count == 1
    assert summary.settlement_rebuild_event_count == 0
    assert summary.summary_names[8] == "settlement_rebuilds_per_frame"
    assert summary.summary_names[-2:] == (
        "matched_ruin_created_events_per_frame",
        "site_ruin_created_events_per_frame",
    )
    assert summary.summary_vector.shape == (len(summary.summary_names),)
    assert summary.summary_vector[15] == 1.0
    assert summary.summary_vector[16] == 1.5
    assert summary.matched_ruin_event_count == 1
    assert summary.site_ruin_event_count == 0
    assert bundle.cell_events.filter(
        pl.col("built_created") & pl.col("ruin_created")
    ).height == 0
    assert bundle.cell_events.filter(
        pl.col("ruin_created") & (~pl.col("matched_collapse_to_ruin"))
    ).height == 0


def test_extract_replay_event_tables_distinguishes_birth_from_rebuild() -> None:
    frame0 = WorldFrame(
        t=0,
        grid=np.asarray([[3]], dtype=np.int64),
        settlements=(),
    )
    frame1 = WorldFrame(
        t=1,
        grid=np.asarray([[1]], dtype=np.int64),
        settlements=(
            SettlementFullState(
                x=0,
                y=0,
                population=4.0,
                food=1.0,
                wealth=0.5,
                defense=0.5,
                has_port=False,
                owner_id=7,
                alive=True,
            ),
        ),
    )
    run = ReplayRun(
        replay_run_id="run-rebuild",
        round_id="round-1",
        seed_index=0,
        source_digest="digest",
        source_path="/tmp/run-rebuild.json",
        frames=(frame0, frame1),
    )

    bundle = extract_replay_event_tables([run])

    assert int(bundle.settlement_transitions.get_column("birth").sum()) == 0
    assert int(bundle.settlement_transitions.get_column("rebuild").sum()) == 1
    assert bundle.settlement_transitions.get_column("transition_kind").to_list() == ["rebuild"]
    assert bundle.cell_events.get_column("matched_settlement_rebuild").to_list() == [True]


def test_extract_replay_event_tables_marks_site_ruin_without_collapse() -> None:
    frame0 = WorldFrame(
        t=0,
        grid=np.asarray([[11, 1], [4, 0]], dtype=np.int64),
        settlements=(
            SettlementFullState(
                x=1,
                y=0,
                population=8.0,
                food=3.0,
                wealth=2.0,
                defense=2.0,
                has_port=False,
                owner_id=1,
                alive=True,
            ),
        ),
    )
    frame1 = WorldFrame(
        t=1,
        grid=np.asarray([[3, 1], [3, 0]], dtype=np.int64),
        settlements=(
            SettlementFullState(
                x=1,
                y=0,
                population=9.0,
                food=2.0,
                wealth=2.0,
                defense=2.0,
                has_port=False,
                owner_id=1,
                alive=True,
            ),
        ),
    )
    run = ReplayRun(
        replay_run_id="run-site-ruin",
        round_id="round-1",
        seed_index=0,
        source_digest="digest",
        source_path="/tmp/run-site-ruin.json",
        frames=(frame0, frame1),
    )

    bundle = extract_replay_event_tables([run])
    summary = summarize_replay_event_bundle(bundle)

    assert bundle.cell_events.filter(
        pl.col("ruin_created") & (~pl.col("matched_collapse_to_ruin"))
    ).height == 2
    assert summary.matched_ruin_event_count == 0
    assert summary.site_ruin_event_count == 2
