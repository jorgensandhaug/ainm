from __future__ import annotations

import json
from pathlib import Path

import pytest
import polars as pl
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
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


@pytest.mark.parametrize(
    "model_name",
    [
        "query_residual_v8",
        "query_residual_v9",
        "query_residual_v10",
        "query_residual_v9_locgate_v001",
        "query_residual_v9_v10_adaptive025_v001",
        "query_residual_v9_v10_builtfreqgate_v001",
        "query_residual_v9_v10_builtfreqgatewide_v001",
        "query_residual_v9_v10_builtfreqgatexwide_v001",
        "query_residual_v9_v10_blend025_v001",
    ],
)
def test_query_residual_variant_online_historical_benchmark_runs(
    sample_paths: RepoPaths,
    model_name: str,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name=model_name,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name=f"test_{model_name}_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 1
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


def test_smh_resid_localgate_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="smh_resid_z12_h0_covbase_locgate_v001",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_smh_resid_localgate_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 1
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


@pytest.mark.parametrize(
    "model_name",
    [
        "smh_coeffbank_z0_h0_covlike_calbase_v001",
        "smh_coeffbank_z0_h0_covmarkpostw06_v001",
        "smh_coeffbank_z0_h0_covmarkpostw12_v001",
        "smh_coeffbank_z0_h0_covmarkpostw24_v001",
        "smh_coeffbank_z0_h0_covlike_calbase_resid_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend020_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend025_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend030_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend035_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend040_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend045_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend050_v001",
        "smh_coeffbank_z0_h0_covlike_hbexact_calresid_adapt025_v001",
        "smh_coeffbank_z0_h0_covlike_builtfocus_v001",
        "smh_coeffbank_z0_h0_covlike_builtsharp_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend25_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend40_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend50_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend60_v001",
        "smh_coeffbank_z0_h0_covlike_hbadapt25_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_resid_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_v001",
        "smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_resid_v001",
        "smh_knn5_z12_h0_covsum_calbase_v001",
        "smh_knn5_z12_h0_covaug_calbase_v001",
        "smh_knn5_z12_h0_covaug_calbank_v001",
        "smh_knn5_z3_h0_covaug_calbase_v001",
        "smh_knn5_z3_h0_covaug_calblend35_v001",
    ],
)
def test_smh_knn_variants_online_historical_benchmark_runs(
    sample_paths: RepoPaths,
    model_name: str,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name=model_name,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name=f"test_{model_name}_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 1
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


def test_query_residual_dataset_cache_respects_round_scope(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    legacy_dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_coverage_v1",
    )
    assert legacy_dataset.index_path is not None

    resolved_index_path = _ensure_synthetic_dataset(
        sample_paths,
        policy_name="coverage",
        samples_per_round=1,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
    )

    assert resolved_index_path != legacy_dataset.index_path
    index_table = pl.read_parquet(resolved_index_path)
    assert set(index_table["round_id"].to_list()) == {ROUND_ID, TRAIN_ROUND_ID}


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
