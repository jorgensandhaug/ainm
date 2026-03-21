from __future__ import annotations

from datetime import UTC, datetime

from astar.infra.api.dto import StoredRoundRecord
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_round_record
from astar.workflows.evaluate_regime_model import evaluate_regime_model
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds

ROUND_ID_2 = "00000000-0000-0000-0000-000000000002"
ROUND_ID_3 = "00000000-0000-0000-0000-000000000003"


def _clone_round(
    paths: RepoPaths,
    *,
    source_round_id: str,
    target_round_id: str,
    round_number: int,
) -> None:
    record = read_round_record(paths, source_round_id)
    cloned_round = record.round.model_copy(
        update={
            "id": target_round_id,
            "round_number": round_number,
        },
    )
    write_round_record(
        paths,
        StoredRoundRecord(
            fetched_at=datetime.now(UTC),
            round=cloned_round,
        ),
    )


def test_evaluate_regime_model_writes_rank_reports(sample_paths: RepoPaths) -> None:
    _clone_round(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _clone_round(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_3,
        round_number=3,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_3)

    result = evaluate_regime_model(
        sample_paths,
        round_ids=[ROUND_ID, ROUND_ID_2, ROUND_ID_3],
        max_rank=2,
        bootstrap_samples=0,
        rng_seed=0,
        name="regime_model_eval_test",
    )

    assert result.summary_backend == "behavioral_fingerprint_core"
    assert result.round_count == 3
    assert result.summary_dim >= 1
    assert result.max_rank == 2
    assert len(result.rank_reports) == 2
    assert result.rank_reports[0].rank == 1
    assert result.rank_reports[1].rank == 2
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert all(report.mean_reconstruction_rmse is not None for report in result.rank_reports)
    assert all(report.mean_terminal_l1 is not None for report in result.rank_reports)
    assert all(report.mean_coefficient_l2 is not None for report in result.rank_reports)
    assert all(len(report.heldout_round_results) == 3 for report in result.rank_reports)
