from __future__ import annotations

import json
from pathlib import Path

from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.compare_historical_benchmarks import compare_historical_benchmark_artifacts
from astar.workflows.historical_benchmark import run_historical_benchmark
from astar.workflows.targeted_holdout_benchmark import run_targeted_holdout_benchmark
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import (
    TRAIN_ROUND_ID,
    _copy_round,
    _write_sample_analysis,
)
from tests.test_history_datasets import _write_replays_for_all_seeds

EXTRA_TRAIN_ROUND_ID_1 = "00000000-0000-0000-0000-000000000003"
EXTRA_TRAIN_ROUND_ID_2 = "00000000-0000-0000-0000-000000000004"


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
    assert result.official_weighted_mean_score is not None
    assert result.official_weighted_mean_weighted_kl is not None
    assert result.round_mean_score_std is not None
    assert result.round_mean_weighted_kl_std is not None
    assert result.worst_round_id in {ROUND_ID, TRAIN_ROUND_ID}
    assert result.worst_round_mean_score is not None
    assert result.worst_round_mean_weighted_kl is not None

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


def test_run_historical_benchmark_supports_parallel_round_eval(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_historical_benchmark_parallel",
        jobs=2,
    )

    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.executed_queries == 4


def test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _copy_round(sample_paths, ROUND_ID, EXTRA_TRAIN_ROUND_ID_1)
    _copy_round(sample_paths, ROUND_ID, EXTRA_TRAIN_ROUND_ID_2)
    for round_id in [ROUND_ID, TRAIN_ROUND_ID, EXTRA_TRAIN_ROUND_ID_1, EXTRA_TRAIN_ROUND_ID_2]:
        _write_sample_analysis(sample_paths, round_id=round_id, seed_index=0)
        _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=round_id)

    result = run_targeted_holdout_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v16",
        held_out_round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_targeted_holdout_teacher_student_v16",
    )

    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    assert result.summary_jsonl_path.exists()
    assert result.round_ids == [ROUND_ID, TRAIN_ROUND_ID]
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.training_round_count == 2
            assert seed_result.samples_per_round == 8


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


def test_query_residual_v8_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v8",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v8_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


def test_query_residual_v9_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v9",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v9_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


def test_query_residual_v10_online_historical_benchmark_runs(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v10",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v10_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


def test_query_residual_v11_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

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
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 2
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 2


def test_query_residual_v12_online_historical_benchmark_defaults_to_samples_3(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=3, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v12",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v12_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 3
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 3
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 3


def test_query_residual_v13_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v13",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v13_online",
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


def test_query_residual_v14_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v14",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v14_online",
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


def test_query_residual_v15_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v15",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v15_online",
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


def test_query_residual_v16_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v16",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v16_online",
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


def test_query_residual_v17_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v17",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v17_online",
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


def test_query_residual_v18_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v18",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v18_online",
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


def test_query_residual_v19_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v19",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v19_online",
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


def test_query_residual_v20_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v20",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v20_online",
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


def test_query_residual_v21_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v21",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v21_online",
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


def test_query_residual_v22_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v22",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_v22_online",
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


def test_teacher_student_blend_v1_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v1",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v1_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v4_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v4",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v4_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v6_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v6",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v6_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v8_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v8",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v8_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v10_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v10",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v10_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v12_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v12",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v12_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v16_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v16",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v16_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v18_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v18",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v18_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v20_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v20",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v20_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v22_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v22",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v22_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v24_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v24",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v24_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v26_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v26",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v26_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v28_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v28",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v28_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v30_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v30",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v30_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v32_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v32",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v32_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v34_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v34",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v34_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v36_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v36",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v36_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v38_online_historical_benchmark_defaults_to_samples_8(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v38",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v38_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 8
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 8
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 8


def test_teacher_student_blend_v40_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v40",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v40_online",
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


def test_teacher_student_blend_v42_online_historical_benchmark_defaults_to_samples_1(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v42",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v42_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 1
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 1
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 1


def test_teacher_student_blend_v44_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v44",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v44_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v46_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v46",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v46_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v48_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v48",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v48_online",
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


def test_teacher_student_blend_v50_online_historical_benchmark_defaults_to_samples_1(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v50",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v50_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 1
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 1
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 1


def test_teacher_student_blend_v52_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v52",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v52_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v54_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v54",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v54_online",
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


def test_teacher_student_blend_v56_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v56",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v56_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v58_online_historical_benchmark_defaults_to_samples_2(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v58",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v58_online",
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


def test_teacher_student_blend_v60_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v60",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v60_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v62_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v62",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v62_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v64_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v64",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v64_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v66_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v66",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v66_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v68_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v68",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v68_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v70_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v70",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v70_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v72_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v72",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v72_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v74_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v74",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v74_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v76_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v76",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v76_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_teacher_student_blend_v78_online_historical_benchmark_defaults_to_samples_4(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_historical_benchmark(
        sample_paths,
        model_name="teacher_student_blend_v78",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_teacher_student_blend_v78_online",
    )

    assert result.mode == "online_interactive"
    assert result.policy_name == "coverage"
    assert result.samples_per_round == 4
    assert result.budget == 4
    assert result.episode_seed == 1
    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()
    for round_result in result.rounds:
        assert round_result.samples_per_round == 4
        for seed_result in round_result.seed_results:
            assert seed_result.samples_per_round == 4


def test_query_residual_rebuilds_dataset_when_legacy_cache_misses_rounds(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_coverage_v1",
    )

    result = run_historical_benchmark(
        sample_paths,
        model_name="query_residual_v7",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_cache_rebuild",
    )

    assert result.evaluated_seed_count == 2
    assert result.artifact_path.exists()


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
