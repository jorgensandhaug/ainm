from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.synthetic_transcript_audit import run_synthetic_transcript_audit
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round, _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def _write_sample_analyses_for_all_seeds(paths: RepoPaths, *, round_id: str) -> None:
    for seed_index in range(5):
        _write_sample_analysis(paths, round_id=round_id, seed_index=seed_index)


def test_synthetic_transcript_audit_runs_on_two_round_sample(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_synthetic_transcript_audit(
        sample_paths,
        model_name="historical_bucket_prior",
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        dataset_name="synthetic_transcript_audit_test_dataset",
        audit_name="synthetic_transcript_audit_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
    )

    assert result.model_name == "historical_bucket_prior"
    assert result.round_count == 2
    assert result.episode_count == 2
    assert result.evaluated_seed_count == 10
    assert result.samples_per_round == 1
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert len(result.rounds) == 2
    assert all(metric.episode_count == 1 for metric in result.rounds)
