from __future__ import annotations

from pathlib import Path

import numpy as np

from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
)
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.student.posterior.summary_bank import SummaryBankStudent
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_synthetic_episode_stores_portable_round_detail_reference(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_artifact_test").fit([round_episode])
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_round_detail_ref_test",
        regime_encoder=teacher,
    )
    artifact = load_synthetic_episode(
        dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    )

    assert artifact.round_detail_path == Path("data/raw/rounds") / f"{ROUND_ID}.json"
    assert artifact.round_detail_path is not None
    assert not artifact.round_detail_path.is_absolute()


def test_summary_bank_student_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_summary_bank_roundtrip").fit([round_episode])
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_bank_roundtrip",
        regime_encoder=teacher,
    )
    student = SummaryBankStudent.fit_from_dataset(dataset, teacher, k_neighbors=1)
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_roundtrip_test"),
        sample_paths.model_dir("hazard_teacher_summary_bank_roundtrip") / "checkpoint.json",
    )
    restored = SummaryBankStudent.load_checkpoint(checkpoint_path, teacher=teacher)

    assert restored.summary_feature_names == student.summary_feature_names
    assert restored.k_neighbors == student.k_neighbors
    np.testing.assert_allclose(restored.summary_vectors, student.summary_vectors)
    np.testing.assert_allclose(restored.regime_vectors, student.regime_vectors)
