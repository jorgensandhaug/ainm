from __future__ import annotations

import shutil

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.dynamic_law_validation import (
    evaluate_round_dynamic_law_summary,
)
from astar.history.summaries.measurements import build_replay_measurement_bundle
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.workflows.evaluate_dynamic_law_summary import evaluate_dynamic_law_summary
from astar.workflows.summarize_replays import summarize_round_replays
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_evaluate_round_dynamic_law_summary_returns_finite_metrics(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_record = read_round_record(sample_paths, ROUND_ID)
    round_features = compute_round_features(round_record.round)
    episode = build_round_episode(sample_paths, ROUND_ID)
    bundles = [
        build_replay_measurement_bundle(
            np.asarray(seed.initial_state.grid, dtype=np.int64),
            round_features.per_seed[seed.seed_index],
            list(seed.replay_runs),
        )
        for seed in episode.seeds
        if seed.replay_runs
    ]

    report = evaluate_round_dynamic_law_summary(
        round_id=ROUND_ID,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
        max_holdout_runs=3,
        bootstrap_samples=3,
        rng_seed=0,
    )

    assert len(report.evaluated_holdout_run_ids) >= 1
    assert len(report.probe_summary_names) == len(report.probe_summary_std)
    assert np.all(np.isfinite(np.asarray(report.probe_summary_std, dtype=np.float64)))
    assert any(metric.value is not None for metric in report.settlement_binary_metrics)
    assert any(metric.sample_count > 0 for metric in report.settlement_linear_metrics)
    assert len(report.ruin_binary_metrics) == 5
    assert any(metric.sample_count > 0 for metric in report.owner_linear_metrics)
    assert any(metric.sample_count > 0 for metric in report.macro_linear_metrics)


def test_evaluate_dynamic_law_summary_uses_cached_measurements(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)
    shutil.rmtree(sample_paths.raw_replay_dir(ROUND_ID, 0).parent)

    result = evaluate_dynamic_law_summary(
        sample_paths,
        round_ids=[ROUND_ID],
        max_holdout_runs=3,
        bootstrap_samples=2,
        rng_seed=0,
        name="dynamic_law_validation_cached_test",
    )

    assert result.report_count == 1
    assert result.artifact_path.exists()
    assert result.report_path.exists()
    assert result.mean_settlement_binary_brier is not None
    assert result.round_reports[0].round_id == ROUND_ID


def test_evaluate_dynamic_law_summary_profile_defaults(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)

    result = evaluate_dynamic_law_summary(
        sample_paths,
        round_ids=[ROUND_ID],
        validation_profile="smoke",
        rng_seed=0,
        name="dynamic_law_validation_profile_smoke_test",
    )

    assert result.validation_profile == "smoke"
    assert result.max_holdout_runs == 1
    assert result.bootstrap_samples == 0
    assert result.rng_seed == 0
    assert result.site_max_rows == 8_000
    assert result.settlement_max_rows == 8_000
    assert result.pairwise_max_rows == 16_000
    assert result.elapsed_seconds >= 0.0


def test_evaluate_dynamic_law_summary_explicit_overrides_win(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)

    result = evaluate_dynamic_law_summary(
        sample_paths,
        round_ids=[ROUND_ID],
        validation_profile="smoke",
        max_holdout_runs=3,
        bootstrap_samples=2,
        site_max_rows=9_000,
        settlement_max_rows=10_000,
        pairwise_max_rows=11_000,
        rng_seed=0,
        name="dynamic_law_validation_profile_override_test",
    )

    assert result.validation_profile == "smoke"
    assert result.max_holdout_runs == 3
    assert result.bootstrap_samples == 2
    assert result.rng_seed == 0
    assert result.site_max_rows == 9_000
    assert result.settlement_max_rows == 10_000
    assert result.pairwise_max_rows == 11_000


def test_evaluate_dynamic_law_summary_default_name_depends_on_config(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)

    smoke_result = evaluate_dynamic_law_summary(
        sample_paths,
        round_ids=[ROUND_ID],
        validation_profile="smoke",
        rng_seed=0,
    )
    dev_result = evaluate_dynamic_law_summary(
        sample_paths,
        round_ids=[ROUND_ID],
        validation_profile="dev",
        rng_seed=1,
    )

    assert smoke_result.artifact_path != dev_result.artifact_path
    assert smoke_result.report_path != dev_result.report_path
