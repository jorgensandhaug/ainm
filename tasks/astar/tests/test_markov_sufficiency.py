from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.markov_sufficiency import run_markov_sufficiency_audit
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_run_markov_sufficiency_audit_writes_artifacts(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_markov_sufficiency_audit(
        sample_paths,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID],
        audit_name="test_markov_sufficiency",
    )

    assert result.round_count == 2
    assert result.transition_count > 0
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert result.current_log_loss >= 0.0
    assert result.lag_log_loss >= 0.0
    assert len(result.event_metrics) == 5
