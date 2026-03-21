from __future__ import annotations

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.teacher.dynamics.terminal_teacher import (
    GBX_TERMINAL_REGIME_TEACHER_MODEL,
    GreyBoxTerminalTeacher,
    gbx_terminal_scoped_checkpoint_path,
)
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_gbx_terminal_teacher_terminal_tensor_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTerminalTeacher(name=GBX_TERMINAL_REGIME_TEACHER_MODEL).fit([episode])

    seed = episode.seeds[0]
    regime = teacher.encode_round(episode)
    terminal = teacher.terminal_tensor(seed, regime)

    assert terminal.shape[-1] == 6
    assert np.all(np.isfinite(terminal))
    assert np.all(terminal >= 0.0)
    assert np.allclose(np.sum(terminal, axis=-1), 1.0, atol=1e-6)


def test_gbx_terminal_teacher_checkpoint_roundtrip(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTerminalTeacher(name=GBX_TERMINAL_REGIME_TEACHER_MODEL).fit([episode])
    checkpoint_path = gbx_terminal_scoped_checkpoint_path(sample_paths, round_ids=[ROUND_ID])
    teacher.save_checkpoint(checkpoint_path)

    restored = GreyBoxTerminalTeacher.load_checkpoint(checkpoint_path)

    assert restored.map_feature_names == teacher.map_feature_names
    assert restored.selected_rank == teacher.selected_rank
    assert np.allclose(restored.map_intercept, teacher.map_intercept)
