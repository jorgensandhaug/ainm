from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.synthetic_benchmark import run_synthetic_benchmark
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_synthetic_benchmark_runs_multiple_episode_seeds(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=3)

    result = run_synthetic_benchmark(
        sample_paths,
        predictor=build_online_predictor("geometry_prior"),
        policy=build_interactive_policy("coverage"),
        round_ids=[ROUND_ID],
        episode_seeds=[0, 1],
        budget=3,
    )

    assert result.aggregate.episode_count == 2
    assert len(result.episodes) == 2
    assert result.artifact_path.exists()
    assert result.report_path.exists()
