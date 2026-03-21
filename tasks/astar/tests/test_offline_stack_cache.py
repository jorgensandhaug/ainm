from __future__ import annotations

from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.student.predictor.offline_stack import _teacher_signature
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_teacher_signature_tracks_regime_encoding_not_just_name(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher_core = HazardTeacher(
        name="hazard_teacher_signature_test",
        behavioral_fingerprint_summary_profile="core_v1",
    ).fit([episode])
    teacher_full = HazardTeacher(
        name="hazard_teacher_signature_test",
        behavioral_fingerprint_summary_profile="full_v1",
    ).fit([episode])
    checkpoint_path = teacher_core.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_signature_test") / "checkpoint.json",
    )
    restored_core = HazardTeacher.load_checkpoint(checkpoint_path)

    assert _teacher_signature(teacher_core) == _teacher_signature(restored_core)
    assert _teacher_signature(teacher_core) != _teacher_signature(teacher_full)
