from __future__ import annotations

import shutil
from datetime import UTC, datetime

from astar.history.replay.terminal_cache import load_or_build_seed_terminal_grid_cache
from astar.history.summaries.behavioral_fingerprint_manifold import (
    load_or_build_round_behavioral_fingerprint_measurement_bundles,
)
from astar.infra.api.dto import StoredRoundRecord
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_round_record
from astar.workflows.evaluate_regime_model import evaluate_regime_model
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds

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
    assert result.validation_profile == "science"
    assert result.round_count == 3
    assert result.summary_dim >= 1
    assert 1 <= result.max_rank <= 2
    assert 1 <= len(result.rank_reports) <= 2
    assert result.rank_reports[0].rank == 1
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert all(report.mean_reconstruction_rmse is not None for report in result.rank_reports)
    assert all(report.mean_terminal_weighted_kl is not None for report in result.rank_reports)
    assert all(report.mean_coefficient_l2 is not None for report in result.rank_reports)
    assert all(
        report.mean_raw_summary_terminal_weighted_kl is not None
        for report in result.rank_reports
    )
    assert all(report.mean_raw_summary_coefficient_l2 is not None for report in result.rank_reports)
    assert all(len(report.heldout_round_results) == 3 for report in result.rank_reports)
    assert all(
        item.raw_summary_terminal_weighted_kl is not None
        for report in result.rank_reports
        for item in report.heldout_round_results
    )
    assert all(
        item.raw_summary_coefficient_l2 is not None
        for report in result.rank_reports
        for item in report.heldout_round_results
    )
    assert result.rank_reports[0].in_sample_effective_rank <= 1
    assert all(item.effective_rank <= 1 for item in result.rank_reports[0].heldout_round_results)


def test_evaluate_regime_model_default_name_varies_by_config(sample_paths: RepoPaths) -> None:
    _clone_round(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)

    first = evaluate_regime_model(
        sample_paths,
        round_ids=[ROUND_ID, ROUND_ID_2],
        validation_profile="smoke",
        max_rank=1,
        bootstrap_samples=0,
        rng_seed=0,
    )
    second = evaluate_regime_model(
        sample_paths,
        round_ids=[ROUND_ID, ROUND_ID_2],
        validation_profile="dev",
        max_rank=1,
        bootstrap_samples=1,
        rng_seed=0,
    )

    assert first.artifact_path != second.artifact_path
    assert first.report_path != second.report_path


def test_evaluate_regime_model_discovers_rounds_from_derived_summaries(
    sample_paths: RepoPaths,
) -> None:
    _clone_round(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)
    load_or_build_round_behavioral_fingerprint_measurement_bundles(sample_paths, ROUND_ID)
    load_or_build_round_behavioral_fingerprint_measurement_bundles(sample_paths, ROUND_ID_2)
    for round_id in (ROUND_ID, ROUND_ID_2):
        for seed_index in range(5):
            load_or_build_seed_terminal_grid_cache(sample_paths, round_id, seed_index)
    shutil.rmtree(sample_paths.raw_dir / "replays")

    result = evaluate_regime_model(
        sample_paths,
        validation_profile="smoke",
        max_rank=1,
        bootstrap_samples=0,
        rng_seed=0,
        name="regime_model_eval_discovery_test",
    )

    assert result.round_count == 2
    assert sorted(result.round_ids) == [ROUND_ID, ROUND_ID_2]
    assert all(report.mean_terminal_weighted_kl is not None for report in result.rank_reports)


def test_evaluate_regime_model_skips_terminal_scoring_without_independent_truth(
    sample_paths: RepoPaths,
) -> None:
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
    _write_replays_for_all_seeds(sample_paths, run_count=1, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=1, round_id=ROUND_ID_2)
    _write_replays_for_all_seeds(sample_paths, run_count=1, round_id=ROUND_ID_3)

    result = evaluate_regime_model(
        sample_paths,
        round_ids=[ROUND_ID, ROUND_ID_2, ROUND_ID_3],
        validation_profile="smoke",
        max_rank=1,
        bootstrap_samples=0,
        rng_seed=0,
        name="regime_model_eval_single_run_truth_test",
    )

    assert result.rank_reports[0].mean_reconstruction_rmse is not None
    assert result.rank_reports[0].mean_terminal_weighted_kl is None
    assert result.rank_reports[0].mean_raw_summary_terminal_weighted_kl is None
    assert all(
        heldout.terminal_weighted_kl is None
        and heldout.raw_summary_terminal_weighted_kl is None
        for heldout in result.rank_reports[0].heldout_round_results
    )
