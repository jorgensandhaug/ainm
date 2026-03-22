from __future__ import annotations

import numpy as np

from astar.eval.science import evaluate_teacher_science
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_state_space_teacher_smoke(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = StateSpaceTeacher(
        name="state_space_teacher_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])

    regime = teacher.encode_round(episode)
    prediction = teacher.terminal_tensor(episode.seeds[0], regime, n_rollouts=2)
    report = evaluate_teacher_science(teacher, episode, n_rollouts=2)

    assert teacher.regime_dim >= 1
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)
    assert report.round_id == ROUND_ID
    assert report.seed_reports
    assert report.mean_terminal_l1 >= 0.0


def test_state_space_teacher_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = StateSpaceTeacher(
        name="state_space_teacher_roundtrip_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])
    regime = teacher.encode_round(episode)

    checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("state_space_teacher_roundtrip_test") / "checkpoint.json",
    )
    restored = StateSpaceTeacher.load_checkpoint(checkpoint_path)
    restored_regime = restored.encode_round(episode)

    original_prediction = teacher.terminal_tensor(episode.seeds[0], regime, n_rollouts=2)
    restored_prediction = restored.terminal_tensor(
        episode.seeds[0],
        restored_regime,
        n_rollouts=2,
    )

    assert restored.regime_encoder is not None
    np.testing.assert_allclose(restored_regime, regime)
    np.testing.assert_allclose(restored_prediction, original_prediction)


def test_state_space_teacher_workspace_fit_matches_episode_fit(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher_from_episode = StateSpaceTeacher(
        name="state_space_teacher_workspace_parity_episode_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])
    teacher_from_workspace = StateSpaceTeacher(
        name="state_space_teacher_workspace_parity_workspace_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit_from_workspace(sample_paths, [ROUND_ID])

    episode_regime = teacher_from_episode.encode_round(episode)
    workspace_regime = teacher_from_workspace.encode_round(episode)
    workspace_artifact_regime = teacher_from_workspace.encode_round_from_workspace(
        sample_paths,
        ROUND_ID,
    )

    np.testing.assert_allclose(workspace_regime, episode_regime)
    np.testing.assert_allclose(workspace_artifact_regime, episode_regime)
    np.testing.assert_allclose(
        teacher_from_workspace.terminal_tensor(
            episode.seeds[0],
            workspace_artifact_regime,
            n_rollouts=2,
        ),
        teacher_from_episode.terminal_tensor(
            episode.seeds[0],
            episode_regime,
            n_rollouts=2,
        ),
    )
