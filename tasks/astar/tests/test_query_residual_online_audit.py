from __future__ import annotations

import pytest

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.historical_benchmark import run_historical_benchmark
from astar.workflows.query_residual_online_audit import run_query_residual_online_audit
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round, _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def _write_sample_analyses_for_all_seeds(paths: RepoPaths, *, round_id: str) -> None:
    for seed_index in range(5):
        _write_sample_analysis(paths, round_id=round_id, seed_index=seed_index)


def test_query_residual_online_audit_matches_historical_benchmark(
    sample_paths: RepoPaths,
) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    benchmark = run_historical_benchmark(
        sample_paths,
        model_name="query_residual",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        mode="online_interactive",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_online_audit_benchmark",
    )
    audit = run_query_residual_online_audit(
        sample_paths,
        model_name="query_residual",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        audit_name="test_query_residual_online_audit",
        policy_name="coverage",
        budget=4,
        episode_seed=1,
    )

    assert audit.model_name == "query_residual_v7"
    assert audit.round_count == 2
    assert audit.evaluated_seed_count == 10
    assert audit.artifact_path.exists()
    assert audit.report_path.exists()
    assert audit.aggregate_score == pytest.approx(benchmark.aggregate.mean_score)
    assert audit.aggregate_weighted_kl == pytest.approx(benchmark.aggregate.mean_weighted_kl)

    audit_rounds = {item.round_id: item for item in audit.rounds}
    benchmark_rounds = {item.round_id: item for item in benchmark.rounds}
    assert set(audit_rounds) == set(benchmark_rounds)
    for round_id, benchmark_round in benchmark_rounds.items():
        audit_round = audit_rounds[round_id]
        assert audit_round.query_count == benchmark_round.executed_queries
        assert audit_round.mean_score == pytest.approx(benchmark_round.mean_score)
        assert audit_round.mean_weighted_kl == pytest.approx(benchmark_round.mean_weighted_kl)
