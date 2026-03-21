from __future__ import annotations

import json
from pathlib import Path

import pytest

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.student.predictor.ffam_mode import FFAMModePredictor
from astar.student.predictor.ffam_mode_config import resolve_ffam_mode_config
from astar.student.predictor.ffam_operator import FFAMOperatorPredictor
from astar.student.predictor.ffam_retrieval import FFAMRetrievalPredictor
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


def test_ffam_mode_default_alias_promoted_to_v17() -> None:
    assert resolve_ffam_mode_config("ffam_mode").model_name == "ffam_mode_v17"


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


@pytest.mark.parametrize(
    "model_name",
    [
        "ffam_retrieval_v1",
        "ffam_retrieval_v2",
        "ffam_retrieval_v3",
        "ffam_retrieval_v4",
        "ffam_retrieval_v5",
        "ffam_retrieval_v6",
        "ffam_retrieval_v7",
        "ffam_retrieval_v8",
        "ffam_mode_v1",
        "ffam_mode_v2",
        "ffam_mode_v3",
        "ffam_mode_v4",
        "ffam_mode_v5",
        "ffam_mode_v6",
        "ffam_mode_v7",
        "ffam_mode_v8",
        "ffam_mode_v9",
        "ffam_mode_v10",
        "ffam_mode_v11",
        "ffam_mode_v12",
        "ffam_mode_v13",
        "ffam_mode_v14",
        "ffam_mode_v15",
        "ffam_mode_v16",
        "ffam_mode_v17",
        "ffam_mode_v18",
        "ffam_mode_v19",
        "ffam_mode_v20",
        "ffam_mode_v21",
        "ffam_mode_v22",
        "ffam_mode_v23",
        "ffam_mode_v24",
        "ffam_mode_v25",
        "ffam_mode_v26",
        "ffam_mode_v27",
        "ffam_mode_v28",
        "ffam_mode_v29",
        "ffam_mode_v30",
        "ffam_mode_v31",
        "ffam_mode_v32",
        "ffam_mode_v33",
        "ffam_mode_v34",
        "ffam_mode_v35",
        "ffam_mode_v36",
        "ffam_mode_v37",
        "ffam_mode_v38",
        "ffam_mode_v39",
        "ffam_mode_v40",
        "ffam_operator_v1",
        "ffam_operator_v2",
        "ffam_operator_v3",
        "ffam_operator_v4",
        "ffam_operator_v5",
        "ffam_operator_v6",
        "ffam_operator_v7",
        "ffam_operator_v8",
        "ffam_operator_v9",
        "ffam_operator_v10",
        "ffam_operator_v11",
        "query_residual",
        "query_residual_v8",
        "query_residual_v10",
        "query_residual_v11",
        "query_residual_v12",
        "query_residual_v13",
        "query_residual_v14",
        "query_residual_v15",
        "query_residual_v16",
        "query_residual_v17",
        "query_residual_v18",
        "query_residual_v19",
    ],
)
def test_query_residual_online_historical_benchmark_runs(
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


def test_query_residual_online_historical_benchmark_uses_model_default_policy(
    sample_paths: RepoPaths,
) -> None:
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
        budget=4,
        episode_seed=1,
        visualization_policy="none",
        benchmark_name="test_query_residual_online_default_policy",
    )

    assert result.policy_name == "exploration_r3"


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


def test_compare_historical_benchmarks_allows_policy_mismatch(
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
        benchmark_name="test_historical_policy_baseline",
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
        benchmark_name="test_historical_policy_candidate",
    )
    comparison = compare_historical_benchmark_artifacts(
        sample_paths,
        baseline_path=Path(baseline.artifact_path),
        candidate_path=Path(candidate.artifact_path),
        n_bootstrap=20,
    )

    assert comparison.seed_count == 2
    assert comparison.baseline_policy_name == "coverage"
    assert comparison.candidate_policy_name == "exploration_v2"
    assert comparison.policy_name is None
    assert comparison.artifact_path is not None and comparison.artifact_path.exists()
    assert comparison.report_path is not None and comparison.report_path.exists()


def test_query_residual_v10_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = QueryResidualPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="query_residual_v10",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "query_residual_v10" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = QueryResidualPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "query_residual_v10"
    assert loaded.ensemble_partner is not None
    assert loaded.ensemble_partner.name == "query_residual_v9"
    assert loaded.ensemble_partner_model_name == "query_residual_v9"
    assert loaded.ensemble_max_weight > 0.0


def test_query_residual_v12_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = QueryResidualPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="query_residual_v12",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "query_residual_v12" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = QueryResidualPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "query_residual_v12"
    assert loaded.regime_input_variant == "motif_v1"
    assert loaded.regime_weights.shape == predictor.regime_weights.shape


def test_query_residual_v13_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = QueryResidualPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="query_residual_v13",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "query_residual_v13" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = QueryResidualPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "query_residual_v13"
    assert loaded.beta_min == 4.0
    assert loaded.beta_scale == 12.0


def test_query_residual_v15_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = QueryResidualPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="query_residual_v15",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "query_residual_v15" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = QueryResidualPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "query_residual_v15"
    assert loaded.beta_repeat_discount == 1.5


def test_query_residual_v19_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = QueryResidualPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="query_residual_v19",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "query_residual_v19" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = QueryResidualPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "query_residual_v19"
    assert loaded.beta_min == 3.0
    assert loaded.beta_scale == 10.0


def test_ffam_retrieval_v3_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMRetrievalPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_retrieval_v3",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_retrieval_v3" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMRetrievalPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_retrieval_v3"
    assert loaded.summary_variant == "v2"
    assert loaded.projected_regime_dim == 3
    assert loaded.k_neighbors == 8


def test_ffam_retrieval_v5_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMRetrievalPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_retrieval_v5",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_retrieval_v5" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMRetrievalPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_retrieval_v5"
    assert loaded.summary_variant == "v3"
    assert loaded.target_kind == "coefficients"
    assert loaded.projected_regime_dim == 4


def test_ffam_retrieval_v7_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMRetrievalPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_retrieval_v7",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_retrieval_v7" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMRetrievalPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_retrieval_v7"
    assert loaded.summary_variant == "v3"
    assert loaded.target_kind == "coefficients"
    assert loaded.inference_mode == "global_ridge"
    assert loaded.projected_regime_dim == 4


def test_ffam_operator_v2_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMOperatorPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_operator_v2",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_operator_v2" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMOperatorPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_operator_v2"
    assert loaded.projected_operator_dim == 6
    assert loaded.regime_input_variant == "motif_v1"


def test_ffam_operator_v4_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMOperatorPredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_operator_v4",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_operator_v4" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMOperatorPredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_operator_v4"
    assert loaded.projected_operator_dim == 3
    assert loaded.posterior_method == "local_linear"
    assert loaded.posterior_neighbor_count == 12
    assert loaded.posterior_ood_prior_blend > 0.0


def test_ffam_mode_v2_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v2",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v2" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v2"
    assert loaded.projected_mode_dim == 3
    assert loaded.posterior_method == "local_linear"
    assert loaded.mode_basis.shape == predictor.mode_basis.shape


def test_ffam_mode_v8_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v8",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v8" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v8"
    assert loaded.decoder_method == "operator_hybrid"
    assert loaded.decoder_particle_blend == predictor.decoder_particle_blend
    assert loaded.round_operator_bank.shape == predictor.round_operator_bank.shape


def test_ffam_mode_v12_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v12",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v12" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v12"
    assert loaded.decoder_method == "cluster_mode_projection"
    assert loaded.posterior_metric_method == "supervised"
    assert loaded.cluster_count == predictor.cluster_count
    assert loaded.posterior_cluster_id_bank.shape == predictor.posterior_cluster_id_bank.shape


def test_ffam_mode_v15_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v15",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v15" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v15"
    assert loaded.posterior_method == "kernel_ridge"
    assert loaded.decoder_method == "cluster_mode_projection"
    assert loaded.posterior_kernel_alpha.shape == predictor.posterior_kernel_alpha.shape


def test_ffam_mode_v17_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v17",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v17" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v17"
    assert loaded.posterior_input_source == "summary_input"
    assert loaded.posterior_summary_variant == "v3"
    assert loaded.posterior_fallback_weights.shape == predictor.posterior_fallback_weights.shape


def test_ffam_mode_v21_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v21",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v21" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v21"
    assert loaded.posterior_input_source == "combined_input"
    assert loaded.posterior_summary_variant == "v3"
    assert loaded.posterior_input_names == predictor.posterior_input_names


def test_ffam_mode_v25_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v25",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v25" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v25"
    assert loaded.decoder_method == "cluster_operator_hybrid"
    assert loaded.decoder_particle_ood_scale == predictor.decoder_particle_ood_scale


def test_ffam_mode_v29_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v29",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v29" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v29"
    assert loaded.posterior_method == "kernel_ridge"
    assert loaded.posterior_input_source == "summary_input"
    assert loaded.posterior_kernel_alpha.shape == predictor.posterior_kernel_alpha.shape


def test_ffam_mode_v33_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v33",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v33" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v33"
    assert loaded.decoder_method == "quadratic_mode_projection"
    assert loaded.quadratic_decoder_weights.shape == predictor.quadratic_decoder_weights.shape


def test_ffam_mode_v37_checkpoint_roundtrip(sample_paths: RepoPaths, tmp_path: Path) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    predictor = FFAMModePredictor.fit_named_from_workspace(
        sample_paths,
        model_name="ffam_mode_v37",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
    )
    checkpoint_path = tmp_path / "ffam_mode_v37" / "checkpoint.json"
    predictor.save_checkpoint(checkpoint_path)
    loaded = FFAMModePredictor.load_checkpoint(checkpoint_path)

    assert loaded.name == "ffam_mode_v37"
    assert loaded.hazard_decoder_blend == predictor.hazard_decoder_blend
    assert loaded.hazard_decoder_weights.shape == predictor.hazard_decoder_weights.shape
