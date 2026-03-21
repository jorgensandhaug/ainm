from __future__ import annotations

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.history.replay.events import (
    dynamic_graph_feature_stack,
    extract_cell_transition_rows,
    extract_graph_snapshot_rows,
    extract_settlement_event_rows,
)
from astar.teacher.dynamics.transition_teacher import (
    GBX_TRANSITION_TEACHER_GRAPH_MODEL,
    GreyBoxTransitionTeacher,
    gbx_transition_round_coefficients_path,
    gbx_transition_scoped_checkpoint_path,
    load_round_transition_coefficients,
    save_round_transition_coefficients,
)
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


def test_dynamic_graph_feature_stack_is_valid() -> None:
    class_grid = np.asarray(
        [
            [0, 0, 0, 0],
            [0, 1, 0, 2],
            [0, 0, 3, 0],
            [0, 0, 0, 0],
        ],
        dtype=np.int64,
    )
    names, stack = dynamic_graph_feature_stack(class_grid)

    assert len(names) == 4
    assert stack.shape == (4, 4, 4)
    assert float(stack[0, 1, 1]) == 1.0
    assert float(stack[1, 1, 3]) == 1.0
    assert float(stack[3, 2, 2]) == 1.0
    assert np.all(stack >= 0.0)
    assert np.all(stack <= 1.0)


def test_gbx_transition_teacher_graph_terminal_tensor_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(
        name=GBX_TRANSITION_TEACHER_GRAPH_MODEL,
        include_graph_features=True,
    ).fit([episode])

    seed = episode.seeds[0]
    regime = teacher.encode_round(episode)
    terminal = teacher.terminal_tensor(seed, regime)

    assert terminal.shape[-1] == 6
    assert np.all(np.isfinite(terminal))
    assert np.all(terminal >= 0.0)
    assert np.allclose(np.sum(terminal, axis=-1), 1.0, atol=1e-6)


def test_gbx_transition_teacher_map_posterior_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(name="gbx_transition_teacher_test").fit([episode])

    posterior = teacher.map_posterior(episode.seeds)

    assert posterior.particles is not None
    assert posterior.weights is not None
    assert len(posterior.particles) >= 1
    assert np.isclose(float(np.sum(posterior.weights)), 1.0)
    assert posterior.mean.shape == teacher.regime_bank[0].shape


def test_gbx_transition_teacher_checkpoint_roundtrip(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(name="gbx_transition_teacher_test").fit([episode])
    checkpoint_path = gbx_transition_scoped_checkpoint_path(sample_paths, round_ids=[ROUND_ID])
    teacher.save_checkpoint(checkpoint_path)

    restored = GreyBoxTransitionTeacher.load_checkpoint(checkpoint_path)

    assert restored.map_feature_names == teacher.map_feature_names
    assert restored.selected_rank == teacher.selected_rank
    assert restored.horizon == teacher.horizon
    assert np.allclose(restored.map_intercept, teacher.map_intercept)


def test_gbx_transition_teacher_graph_checkpoint_roundtrip(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(
        name=GBX_TRANSITION_TEACHER_GRAPH_MODEL,
        include_graph_features=True,
    ).fit([episode])
    checkpoint_path = gbx_transition_scoped_checkpoint_path(
        sample_paths,
        round_ids=[ROUND_ID],
        model_name=GBX_TRANSITION_TEACHER_GRAPH_MODEL,
    )
    teacher.save_checkpoint(checkpoint_path)

    restored = GreyBoxTransitionTeacher.load_checkpoint(checkpoint_path)

    assert restored.include_graph_features is True
    assert restored.map_feature_names == teacher.map_feature_names
    assert restored.selected_rank == teacher.selected_rank


def test_round_transition_coefficients_roundtrip(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTransitionTeacher(name="gbx_transition_teacher_test")
    row = teacher._fit_round_coefficients(episode, ridge_alpha=1.0)
    path = gbx_transition_round_coefficients_path(sample_paths, round_id=ROUND_ID)
    save_round_transition_coefficients(path, row)

    restored = load_round_transition_coefficients(path)

    assert restored.round_id == row.round_id
    assert restored.feature_names == row.feature_names
    assert restored.sample_count == row.sample_count
    assert np.allclose(restored.regime_vector, row.regime_vector)
    assert np.allclose(restored.intercept, row.intercept)
    assert np.allclose(restored.coefficients, row.coefficients)
