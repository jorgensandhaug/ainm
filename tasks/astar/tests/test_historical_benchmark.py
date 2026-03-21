from __future__ import annotations

import json
from pathlib import Path

import polars as pl

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.student.predictor.query_residual import _ensure_synthetic_dataset
from astar.workflows.compare_historical_benchmarks import compare_historical_benchmark_artifacts
from astar.workflows.historical_benchmark import run_historical_benchmark
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import (
    TRAIN_ROUND_ID,
    _copy_round,
    _write_sample_analysis,
)
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_run_historical_benchmark_writes_summaries(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_historical_benchmark",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.aggregate.episode_count == 2
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert result.summary_jsonl_path.exists()
    assert result.summary_csv_path.exists()
    assert result.evaluation_seconds >= 0.0
    assert result.visualization_seconds == 0.0
    assert result.total_runtime_seconds >= result.evaluation_seconds

    summary_lines = result.summary_jsonl_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(summary_lines) == 2
    first_row = json.loads(summary_lines[0])
    assert first_row["mode"] == "prior_only"
    assert first_row["model_name"] == "historical_bucket_prior_v1"
    assert first_row["visualization_seconds"] is None
    assert "weighted_kl" in first_row


def test_run_historical_benchmark_online_mode_reuses_online_episode_path(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    prior_result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="prior_only",
        visualization_policy="none",
        benchmark_name="test_historical_benchmark_prior",
    )
    online_result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_historical_benchmark_online",
    )

    assert online_result.mode == "online_interactive"
    assert online_result.policy_name == "coverage"
    assert online_result.budget == 4
    assert online_result.episode_seed == 1
    for round_result in online_result.rounds:
        assert round_result.executed_queries == 4

    prior_by_key = {
        (item.round_id, item.seed_index): item
        for round_result in prior_result.rounds
        for item in round_result.seed_results
    }
    online_by_key = {
        (item.round_id, item.seed_index): item
        for round_result in online_result.rounds
        for item in round_result.seed_results
    }
    assert set(prior_by_key) == set(online_by_key)
    for key in prior_by_key:
        assert online_by_key[key].score == prior_by_key[key].score
        assert online_by_key[key].weighted_kl == prior_by_key[key].weighted_kl


def test_query_residual_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 2
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 2


def test_query_residual_online_historical_benchmark_multi_episode_runs(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        episode_seed_count=2,
        visualization_policy="none",
        benchmark_name="test_query_residual_online_multi_episode",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed is None
    assert result.episode_seeds == [1, 2]
    assert result.evaluated_seed_count == 4
    for round_result in result.rounds:
        assert round_result.evaluated_episode_count == 2
        assert round_result.episode_seed is None
        assert round_result.episode_seeds == [1, 2]
        for seed_result in round_result.seed_results:
            assert seed_result.episode_seed in {1, 2}


def test_run_historical_benchmark_jobs_parallel_sets_result_metadata(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        jobs=2,
        visualization_policy="none",
        benchmark_name="test_historical_benchmark_jobs2",
    )

    assert result.jobs == 2
    report_text = result.report_path.read_text(encoding="utf-8")
    assert "jobs: 2" in report_text


def test_hazard_posterior_knn_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_posterior_knn_k3",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_hazard_posterior_knn_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.evaluated_seed_count == 2
    for round_result in result.rounds:
        assert round_result.samples_per_round == 2
        for seed_result in round_result.seed_results:
            assert "hazard_posterior_knn_v1" in seed_result.model_name
            assert "__k=3" in seed_result.model_name


def test_hazard_posterior_blend_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_posterior_blend_a35_k5",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_hazard_posterior_blend_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.evaluated_seed_count == 2
    for round_result in result.rounds:
        for seed_result in round_result.seed_results:
            assert "hazard_posterior_blend_v1" in seed_result.model_name
            assert "__a=35" in seed_result.model_name


def test_hazard_posterior_v2_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_posterior_v2_k5_r3",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_hazard_posterior_v2_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.evaluated_seed_count == 2
    for round_result in result.rounds:
        for seed_result in round_result.seed_results:
            assert "hazard_posterior_v2" in seed_result.model_name
            assert "__k=5" in seed_result.model_name
            assert "__rank=" in seed_result.model_name


def test_hazard_posterior_v2_blend_online_historical_benchmark_runs(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_posterior_v2_blend_a20_k5_r3",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        samples_per_round=2,
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_hazard_posterior_v2_blend_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.evaluated_seed_count == 2
    for round_result in result.rounds:
        for seed_result in round_result.seed_results:
            assert "hazard_posterior_v2_blend" in seed_result.model_name
            assert "__a=20" in seed_result.model_name


def test_query_residual_rebuilds_stale_legacy_synthetic_dataset(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    legacy_dir = sample_paths.dataset_dir("synthetic_live_coverage_v1")
    legacy_dir.mkdir(parents=True, exist_ok=True)
    (legacy_dir / "summary.json").write_text("{}", encoding="utf-8")
    pl.DataFrame(
        [
            {
                "round_id": ROUND_ID,
                "sample_index": 0,
                "policy_name": "coverage",
                "query_count": 1,
                "episode_path": str(sample_paths.root / "missing_episode.json"),
            },
        ],
    ).write_parquet(legacy_dir / "index.parquet")

    index_path = _ensure_synthetic_dataset(
        sample_paths,
        policy_name="coverage",
        samples_per_round=1,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
    )

    index_table = pl.read_parquet(index_path)
    assert index_table.height == 2
    assert all(Path(path).exists() for path in index_table.get_column("episode_path").to_list())


def test_compare_historical_benchmarks_pairs_seed_results(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    baseline = run_historical_benchmark(
        sample_paths,
        model_name="static_semantic",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_historical_baseline",
    )
    candidate = run_historical_benchmark(
        sample_paths,
        model_name="geometry_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_historical_candidate",
    )
    comparison = compare_historical_benchmark_artifacts(
        sample_paths,
        baseline_path=Path(baseline.artifact_path),
        candidate_path=Path(candidate.artifact_path),
        n_bootstrap=20,
    )

    assert comparison.seed_count == 2
    assert comparison.artifact_path is not None and comparison.artifact_path.exists()
    assert comparison.report_path is not None and comparison.report_path.exists()
