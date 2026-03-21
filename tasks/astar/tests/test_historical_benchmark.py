from __future__ import annotations

import json
from pathlib import Path

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.student.predictor.interactive import build_online_predictor
from astar.student.predictor.query_residual import QueryResidualPredictor
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


def test_gbx_transition_teacher_prior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_transition_teacher",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_transition_teacher_prior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_transition_teacher_v1"


def test_gbx_maponly_bucket_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_prior_maponly_bucket",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_maponly_bucket",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_prior_maponly_bucket_v1"


def test_hazard_teacher_prior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_teacher",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_hazard_teacher_prior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "hazard_teacher_v1"


def test_hazard_teacher_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="hazard_teacher_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_hazard_teacher_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "hazard_teacher_mapprior_v1"


def test_gbx_terminal_regime_teacher_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_terminal_regime_teacher_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_terminal_regime_teacher_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_terminal_regime_teacher_mapprior_v1"


def test_gbx_terminal_regime_residual_teacher_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_terminal_regime_residual_teacher_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_terminal_regime_residual_teacher_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_terminal_regime_residual_teacher_mapprior_v1"


def test_gbx_terminal_regime_mapknn_teacher_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_terminal_regime_mapknn_teacher",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_terminal_regime_mapknn_teacher",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_terminal_regime_mapknn_teacher_v1"


def test_gbx_terminal_regime_mapllr_teacher_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_terminal_regime_mapllr_teacher",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_terminal_regime_mapllr_teacher",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_terminal_regime_mapllr_teacher_v1"


def test_gbx_maponly_terminal_mapknn_blend10_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_maponly_terminal_mapknn_blend10",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_maponly_terminal_mapknn_blend10",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_maponly_terminal_mapknn_blend10_v1"


def test_gbx_maponly_terminal_mapknn_entropyblend25_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_maponly_terminal_mapknn_entropyblend25",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_maponly_terminal_mapknn_entropyblend25",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_maponly_terminal_mapknn_entropyblend25_v1"


def test_gbx_maponly_terminal_mapknn_dynblend50_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_maponly_terminal_mapknn_dynblend50",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_maponly_terminal_mapknn_dynblend50",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_maponly_terminal_mapknn_dynblend50_v1"


def test_gbx_transition_teacher_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_transition_teacher_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_transition_teacher_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_transition_teacher_mapprior_v1"


def test_gbx_transition_teacher_graph_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_transition_teacher_graph_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_transition_teacher_graph_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_transition_teacher_graph_mapprior_v1"


def test_gbx_transition_teacher_graph_phase_global_mapprior_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="gbx_transition_teacher_graph_phase_global_mapprior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_gbx_transition_teacher_graph_phase_global_mapprior",
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.rounds[0].seed_results[0].model_name == "gbx_transition_teacher_graph_phase_global_mapprior_v1"


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


def test_run_historical_benchmark_prior_mode_parallel_jobs(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        visualization_policy="none",
        benchmark_name="test_historical_benchmark_parallel_jobs",
        jobs=2,
    )

    assert result.mode == "prior_only"
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


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


def test_query_residual_v11_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v11",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v11_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.rounds[0].seed_results[0].model_name == "query_residual_v11"


def test_query_residual_v11_covtrain_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v11_covtrain",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="exploration",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v11_covtrain_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "exploration_v2"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.rounds[0].seed_results[0].model_name == "query_residual_v11_covtrain"


def test_query_residual_v11_covtrain_p0_b624_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v11_covtrain_p0_b624",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="exploration",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v11_covtrain_p0_b624_online",
    )

    predictor = build_online_predictor(
        "query_residual_v11_covtrain_p0_b624",
        paths=sample_paths,
        historical_round_ids=[TRAIN_ROUND_ID],
        policy_name="exploration",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "exploration_v2"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.rounds[0].seed_results[0].model_name == "query_residual_v11_covtrain_p0_b624"
    assert predictor.name == "query_residual_v11_covtrain_p0_b624"
    assert predictor.predictor.prior_blend == 0.0
    assert predictor.predictor.beta_min == 6.0
    assert predictor.predictor.beta_scale == 24.0


def test_query_residual_v11_covtrain_p0_b624_t100_online_historical_benchmark_runs(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v11_covtrain_p0_b624_t100",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v11_covtrain_p0_b624_t100_online",
    )

    predictor = build_online_predictor(
        "query_residual_v11_covtrain_p0_b624_t100",
        paths=sample_paths,
        historical_round_ids=[TRAIN_ROUND_ID],
        policy_name="coverage",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 2
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.rounds[0].seed_results[0].model_name == "query_residual_v11_covtrain_p0_b624_t100"
    assert predictor.name == "query_residual_v11_covtrain_p0_b624_t100"
    assert predictor.predictor.prior_blend == 0.0
    assert predictor.predictor.beta_min == 6.0
    assert predictor.predictor.beta_scale == 24.0
    assert predictor.predictor.temperature == 1.0


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


def test_compare_historical_benchmarks_allows_cross_policy_pairing(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    baseline = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_historical_compare_policy_baseline",
    )
    candidate = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="exploration",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_historical_compare_policy_candidate",
    )
    comparison = compare_historical_benchmark_artifacts(
        sample_paths,
        baseline_path=Path(baseline.artifact_path),
        candidate_path=Path(candidate.artifact_path),
        n_bootstrap=20,
    )

    assert comparison.seed_count == 2
    assert comparison.policy_name is None
    assert comparison.baseline_policy_name == "coverage"
    assert comparison.candidate_policy_name == "exploration_v2"
    assert comparison.artifact_path is not None and comparison.artifact_path.exists()


def test_query_residual_scoped_checkpoint_reuse(
    sample_paths: RepoPaths,
    monkeypatch,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    build_online_predictor(
        "query_residual",
        paths=sample_paths,
        historical_round_ids=[TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
    )

    def _fail_fit(cls, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("scoped checkpoint should be reused")

    monkeypatch.setattr(QueryResidualPredictor, "fit_from_workspace", classmethod(_fail_fit))
    predictor = build_online_predictor(
        "query_residual",
        paths=sample_paths,
        historical_round_ids=[TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
    )

    assert predictor.name == "query_residual_v8"
