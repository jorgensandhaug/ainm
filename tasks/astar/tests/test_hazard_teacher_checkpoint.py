from __future__ import annotations

import json

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.workflows.train_student import train_summary_bank_student
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_hazard_teacher_checkpoint_roundtrip_preserves_replay_encoding(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_roundtrip_test").fit([episode])
    regime = teacher.encode_round(episode)
    prediction = teacher.terminal_tensor(episode.seeds[0], regime)

    checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_roundtrip_test") / "checkpoint.json",
    )
    restored = HazardTeacher.load_checkpoint(checkpoint_path)
    restored_regime = restored.encode_round(episode)
    restored_prediction = restored.terminal_tensor(episode.seeds[0], restored_regime)

    assert restored.regime_encoder is not None
    assert restored.supports_offline_regime_encoding
    np.testing.assert_allclose(restored_regime, regime)
    np.testing.assert_allclose(restored_prediction, prediction)


def test_hazard_teacher_loads_legacy_decoder_only_checkpoint_backward_compatibly(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_legacy_checkpoint_test").fit([episode])
    checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_legacy_checkpoint_test") / "checkpoint.json",
    )

    payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    payload.pop("regime_encoder_checkpoint", None)
    checkpoint_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    restored = HazardTeacher.load_checkpoint(checkpoint_path)
    posterior_prediction = restored.terminal_tensor(
        episode.seeds[0],
        teacher.encode_round(episode),
    )

    assert restored.regime_encoder is None
    assert not restored.supports_offline_regime_encoding
    assert posterior_prediction.shape[-1] == 6


def test_hazard_teacher_without_replay_bank_preserves_student_side_semantics(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_without_replay_bank_test").fit([episode])
    regime = teacher.encode_round(episode)
    prediction = teacher.terminal_tensor(episode.seeds[0], regime)

    pruned = teacher.without_replay_bank()

    assert pruned.replay_bank_round_ids == ()
    assert pruned.replay_bank_seed_indexes == ()
    assert pruned.replay_runs_bank == ()
    assert pruned.supports_offline_regime_encoding
    np.testing.assert_allclose(pruned.encode_round(episode), regime)
    np.testing.assert_allclose(pruned.terminal_tensor(episode.seeds[0], regime), prediction)


def test_hazard_teacher_workspace_fit_matches_episode_fit(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher_from_episode = HazardTeacher(
        name="hazard_teacher_workspace_parity_episode_test"
    ).fit([episode]).without_replay_bank()
    teacher_from_workspace = HazardTeacher(
        name="hazard_teacher_workspace_parity_workspace_test"
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
        teacher_from_workspace.terminal_tensor(episode.seeds[0], workspace_artifact_regime),
        teacher_from_episode.terminal_tensor(episode.seeds[0], episode_regime),
    )


def test_train_summary_bank_student_saves_teacher_checkpoint_with_round_encoder(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = train_summary_bank_student(
        sample_paths,
        round_ids=[ROUND_ID],
        dataset_name="synthetic_live_summary_teacher_ckpt_test",
        model_name="summary_bank_student_teacher_ckpt_test",
    )
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher.load_checkpoint(result.teacher_checkpoint_path)

    regime = teacher.encode_round(episode)

    assert teacher.supports_offline_regime_encoding
    assert regime.ndim == 1
    assert regime.shape[0] >= 1
