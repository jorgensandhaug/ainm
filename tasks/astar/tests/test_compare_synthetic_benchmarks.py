from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.compare_synthetic_benchmarks import compare_benchmark_artifacts
from astar.workflows.synthetic_benchmark import run_synthetic_benchmark
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_compare_synthetic_benchmarks_on_same_manifest(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=3)

    baseline = run_synthetic_benchmark(
        sample_paths,
        predictor=build_online_predictor("geometry_prior"),
        policy=build_interactive_policy("coverage"),
        round_ids=[ROUND_ID],
        episode_seeds=[0, 1],
        budget=3,
        benchmark_name="baseline_geometry_prior_test",
    )
    candidate = run_synthetic_benchmark(
        sample_paths,
        predictor=build_online_predictor("latent_regime"),
        policy=build_interactive_policy("coverage"),
        round_ids=[ROUND_ID],
        episode_seeds=[0, 1],
        budget=3,
        benchmark_name="candidate_latent_regime_test",
    )

    comparison = compare_benchmark_artifacts(
        sample_paths,
        baseline_path=baseline.artifact_path,
        candidate_path=candidate.artifact_path,
        n_bootstrap=50,
    )

    assert comparison.episode_count == 2
    assert comparison.artifact_path is not None
    assert comparison.artifact_path.exists()
    assert comparison.report_path is not None
    assert comparison.report_path.exists()
