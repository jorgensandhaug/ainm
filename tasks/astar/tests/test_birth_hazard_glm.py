from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.birth_hazard_glm import run_birth_hazard_glm_audit
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_run_birth_hazard_glm_audit_writes_artifacts(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    result = run_birth_hazard_glm_audit(
        sample_paths,
        dataset_name="birth_riskset_test",
        audit_name="birth_glm_audit_test",
        max_iter=6,
    )

    assert result.round_count == 2
    assert result.row_count > 0
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert result.baseline_log_loss >= 0.0
    assert result.glm_log_loss >= 0.0
