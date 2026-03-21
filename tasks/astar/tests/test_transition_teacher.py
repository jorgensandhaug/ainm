from __future__ import annotations

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.history.replay.events import (
    extract_cell_transition_rows,
    extract_graph_snapshot_rows,
    extract_settlement_event_rows,
)
from astar.teacher.dynamics.transition_teacher import GreyBoxTransitionTeacher
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_replay_event_extractors_capture_expected_transition_types(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=1)
    episode = build_round_episode(sample_paths, ROUND_ID)

    cell_rows = extract_cell_transition_rows(episode)
    settlement_rows = extract_settlement_event_rows(episode)
    graph_rows = extract_graph_snapshot_rows(episode)

    assert any(row["is_birth"] == 1 for row in cell_rows)
    assert any(row["is_collapse_to_ruin"] == 1 for row in cell_rows)
    assert any(row["transition_name"] == "collapse_to_ruin" for row in cell_rows)
    assert settlement_rows
    assert graph_rows == []


def test_gbx_transition_teacher_terminal_tensor_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(name="gbx_transition_teacher_test").fit([episode])

    seed = episode.seeds[0]
    regime = teacher.encode_round(episode)
    terminal = teacher.terminal_tensor(seed, regime)

    assert terminal.shape[-1] == 6
    assert np.all(np.isfinite(terminal))
    assert np.all(terminal >= 0.0)
    assert np.allclose(np.sum(terminal, axis=-1), 1.0, atol=1e-6)
