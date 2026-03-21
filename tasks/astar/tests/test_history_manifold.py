from __future__ import annotations

import shutil

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.behavioral_fingerprint_manifold import (
    factorize_round_behavioral_fingerprint_subspace,
)
from astar.history.summaries.dynamic_law import (
    build_dynamic_law_probe_library,
    fit_round_dynamic_law_summary,
)
from astar.history.summaries.dynamic_law_manifold import factorize_round_dynamic_law_subspace
from astar.history.summaries.event_manifold import factorize_round_event_summary_subspace
from astar.history.summaries.factorization import (
    evaluate_factorization_leave_one_out,
    factorize_summary_matrix,
)
from astar.history.summaries.manifold import factorize_round_regime_manifold
from astar.history.summaries.measurements import build_replay_measurement_bundle
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.workflows.factorize_round_summaries import factorize_round_summaries
from astar.workflows.summarize_replays import summarize_round_replays
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_factorize_round_regime_manifold_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    manifold, summary_path, basis_path = factorize_round_regime_manifold(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_regime_manifold_test",
    )

    assert len(manifold.round_ids) == 1
    assert manifold.effective_rank == 1
    assert summary_path.exists()
    assert basis_path.exists()


def test_factorize_round_event_summary_subspace_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    factorization, summary_path, basis_path = factorize_round_event_summary_subspace(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_event_summary_subspace_test",
    )

    assert factorization.summary_kind == "event_summary"
    assert len(factorization.round_ids) == 1
    assert factorization.effective_rank == 1
    assert summary_path.exists()
    assert basis_path.exists()


def test_fit_round_dynamic_law_summary_and_probe_library(
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

    law = fit_round_dynamic_law_summary(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
    )
    probes = build_dynamic_law_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.settlement_measurements for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
    )
    names, vector = law.probe_summary(probes)

    assert law.sample_count >= 1
    assert len(law.settlement_binary_heads) >= 1
    assert len(names) == len(vector)
    assert np.all(np.isfinite(vector))


def test_factorize_round_dynamic_law_subspace_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    factorization, summary_path, basis_path = factorize_round_dynamic_law_subspace(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_dynamic_law_subspace_test",
    )

    assert factorization.summary_kind == "dynamic_law"
    assert len(factorization.round_ids) == 1
    assert factorization.effective_rank == 1
    assert summary_path.exists()
    assert basis_path.exists()


def test_factorize_round_behavioral_fingerprint_subspace_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    factorization, summary_path, basis_path = factorize_round_behavioral_fingerprint_subspace(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_behavioral_fingerprint_subspace_test",
        bootstrap_samples=2,
    )

    assert factorization.summary_kind == "behavioral_fingerprint"
    assert len(factorization.round_ids) == 1
    assert factorization.effective_rank == 1
    assert summary_path.exists()
    assert basis_path.exists()
    with np.load(basis_path) as payload:
        assert "summary_std_matrix" in payload


def test_factorize_round_dynamic_law_subspace_uses_saved_measurements(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)
    shutil.rmtree(sample_paths.raw_replay_dir(ROUND_ID, 0).parent)

    factorization, summary_path, basis_path = factorize_round_dynamic_law_subspace(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_dynamic_law_subspace_cached_test",
    )

    assert factorization.summary_kind == "dynamic_law"
    assert summary_path.exists()
    assert basis_path.exists()


def test_factorize_round_behavioral_fingerprint_subspace_uses_saved_measurements(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    summarize_round_replays(sample_paths, ROUND_ID)
    shutil.rmtree(sample_paths.raw_replay_dir(ROUND_ID, 0).parent)

    factorization, summary_path, basis_path = factorize_round_behavioral_fingerprint_subspace(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_behavioral_fingerprint_subspace_cached_test",
    )

    assert factorization.summary_kind == "behavioral_fingerprint"
    assert summary_path.exists()
    assert basis_path.exists()


def test_leave_one_out_factorization_recovers_exact_one_dimensional_structure() -> None:
    factorization = factorize_summary_matrix(
        summary_kind="synthetic",
        summary_names=["x", "y"],
        round_ids=["r0", "r1", "r2"],
        round_numbers=[0, 1, 2],
        sample_counts=[1, 1, 1],
        summary_matrix=np.asarray(
            [
                [0.0, 0.0],
                [1.0, 2.0],
                [2.0, 4.0],
            ],
            dtype=np.float64,
        ),
        max_rank=1,
    )

    report = evaluate_factorization_leave_one_out(
        factorization,
        max_rank=1,
    )

    assert report.eligible_round_count == 3
    assert report.mean_mae is not None and report.mean_mae < 1e-8
    assert report.mean_rmse is not None and report.mean_rmse < 1e-8
    assert report.mean_mae_improvement is not None and report.mean_mae_improvement > 0.0


def test_factorize_round_summaries_defaults_to_dynamic_law(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = factorize_round_summaries(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
    )

    assert result.summary_kind == "dynamic_law"
    assert result.factorization.summary_kind == "dynamic_law"
    assert result.summary_path.exists()
    assert result.basis_path.exists()
    assert result.leave_one_out_path.exists()
    assert result.leave_one_out_report.eligible_round_count == 0


def test_factorize_round_summaries_behavioral_fingerprint_path_available(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = factorize_round_summaries(
        sample_paths,
        round_ids=[ROUND_ID],
        summary_kind="behavioral_fingerprint",
        max_rank=2,
    )

    assert result.summary_kind == "behavioral_fingerprint"
    assert result.factorization.summary_kind == "behavioral_fingerprint"
    assert result.summary_path.exists()
    assert result.basis_path.exists()
    assert result.leave_one_out_path.exists()


def test_factorize_round_summaries_legacy_path_still_available(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = factorize_round_summaries(
        sample_paths,
        round_ids=[ROUND_ID],
        summary_kind="legacy_terminal_coeff",
        max_rank=2,
    )

    assert result.summary_kind == "legacy_terminal_coeff"
    assert result.factorization.summary_kind == "legacy_terminal_coeff"
    assert result.summary_path.exists()
    assert result.basis_path.exists()
    assert result.leave_one_out_path.exists()
