from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.round_dynamics_lowrank import run_round_dynamics_lowrank_audit
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round
from tests.test_history_datasets import _write_replays_for_all_seeds

THIRD_ROUND_ID = "00000000-0000-0000-0000-000000000003"


def test_run_round_dynamics_lowrank_audit_writes_artifacts(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _copy_round(sample_paths, ROUND_ID, THIRD_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=THIRD_ROUND_ID)

    result = run_round_dynamics_lowrank_audit(
        sample_paths,
        round_ids=[ROUND_ID, TRAIN_ROUND_ID, THIRD_ROUND_ID],
        audit_name="test_round_dynamics_lowrank",
        max_rank=3,
    )

    assert result.round_count == 3
    assert result.max_rank == 2
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert result.mean_baseline.mean_log_loss >= 0.0
    assert result.oracle_full.mean_log_loss >= 0.0
    assert len(result.rank_metrics) == 2
