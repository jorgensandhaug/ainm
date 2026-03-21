from __future__ import annotations

from astar.eval.science import evaluate_teacher_science
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.workflows.evaluate_teacher_science import evaluate_hazard_teacher_science
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_evaluate_teacher_science_smoke(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_science_test").fit([episode])
    report = evaluate_teacher_science(teacher, episode, n_rollouts=2)

    assert report.round_id == ROUND_ID
    assert report.seed_reports
    assert report.mean_terminal_l1 >= 0.0


def test_evaluate_hazard_teacher_science_workflow_writes_artifacts(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = evaluate_hazard_teacher_science(
        sample_paths,
        eval_round_ids=[ROUND_ID],
        train_round_ids=[ROUND_ID],
        model_name="hazard_teacher_science_test",
        n_rollouts=2,
    )

    assert result.report_count == 1
    assert result.artifact_path.exists()
    assert result.report_path.exists()
