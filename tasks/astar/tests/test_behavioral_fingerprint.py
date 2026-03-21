from __future__ import annotations

import numpy as np
import pytest

from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.canonical_behavioral_probes import build_canonical_site_probes
from astar.history.summaries.behavioral_fingerprint import (
    CANONICAL_PROBE_LIBRARY_VERSION,
    SITE_FEATURE_NAMES,
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
    fit_round_behavioral_fingerprint,
    summarize_probe_support,
)
from astar.history.summaries.measurements import build_replay_measurement_bundle
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_fit_round_behavioral_fingerprint_and_probe_summary(
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

    fit = fit_round_behavioral_fingerprint(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
    )
    probe_library = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    )
    names, vector = fit.probe_summary(probe_library)

    assert fit.sample_count >= 1
    assert len(fit.site_binary_heads) == 2
    assert len(fit.live_binary_heads) >= 3
    assert len(fit.live_linear_heads) == 4
    assert len(fit.ruin_binary_heads) == 5
    assert len(fit.pairwise_binary_heads) == 3
    assert len(fit.pairwise_linear_heads) == 4
    assert len(fit.owner_linear_heads) == 6
    assert len(names) == len(vector)
    assert np.all(np.isfinite(vector))
    assert any(name.startswith("pairwise_binary::") for name in names)
    assert any(name.startswith("pairwise_linear::") for name in names)
    assert any(name.startswith("owner_linear::") for name in names)
    assert not any(name.startswith("owner::") for name in names)


def test_behavioral_fingerprint_probe_library_is_canonical_and_input_invariant(
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

    probe_a = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    )
    probe_b = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in reversed(bundles)] * 2,
        [bundle.live_settlement_transitions for bundle in reversed(bundles)] * 2,
        [bundle.ruin_transitions for bundle in reversed(bundles)] * 2,
        [bundle.pairwise_candidates for bundle in reversed(bundles)] * 2,
        [bundle.owner_years for bundle in reversed(bundles)] * 2,
    )

    assert probe_a.library_kind == "canonical"
    assert probe_a.library_version == "v1"
    assert probe_a.site_probe_names == probe_b.site_probe_names
    assert probe_a.live_probe_names == probe_b.live_probe_names
    assert probe_a.ruin_probe_names == probe_b.ruin_probe_names
    assert probe_a.pairwise_probe_names == probe_b.pairwise_probe_names
    assert probe_a.owner_probe_names == probe_b.owner_probe_names
    assert np.array_equal(probe_a.site_probe_matrix, probe_b.site_probe_matrix)
    assert np.array_equal(probe_a.live_probe_matrix, probe_b.live_probe_matrix)
    assert np.array_equal(probe_a.ruin_probe_matrix, probe_b.ruin_probe_matrix)
    assert np.array_equal(probe_a.pairwise_probe_matrix, probe_b.pairwise_probe_matrix)
    assert np.array_equal(probe_a.owner_probe_matrix, probe_b.owner_probe_matrix)
    assert probe_a.site_probe_names == (
        "open_inland",
        "open_coastal",
        "frontier_open",
        "forest_edge_open",
    )


def test_estimate_round_behavioral_fingerprint_bootstrap_is_finite(
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
    probe_library = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    )

    estimate = estimate_round_behavioral_fingerprint(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
        probe_library=probe_library,
        bootstrap_samples=3,
        rng_seed=7,
    )

    assert estimate.bootstrap_samples == 3
    assert len(estimate.summary_names) == len(estimate.summary_vector)
    assert estimate.summary_vector.shape == estimate.summary_std.shape
    assert np.all(np.isfinite(estimate.summary_vector))
    assert np.all(np.isfinite(estimate.summary_std))


def test_estimate_round_behavioral_fingerprint_is_probe_invariant(
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
    probe_a = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    )
    probe_b = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles] * 3,
        [bundle.live_settlement_transitions for bundle in bundles] * 3,
        [bundle.ruin_transitions for bundle in bundles] * 3,
        [bundle.pairwise_candidates for bundle in bundles] * 3,
        [bundle.owner_years for bundle in bundles] * 3,
    )

    estimate_a = estimate_round_behavioral_fingerprint(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
        probe_library=probe_a,
        bootstrap_samples=1,
        rng_seed=7,
    )
    estimate_b = estimate_round_behavioral_fingerprint(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
        probe_library=probe_b,
        bootstrap_samples=1,
        rng_seed=7,
    )

    assert estimate_a.summary_names == estimate_b.summary_names
    assert np.array_equal(estimate_a.summary_vector, estimate_b.summary_vector)
    assert np.array_equal(estimate_a.summary_std, estimate_b.summary_std)


def test_probe_summary_rejects_wrong_library_version(
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
    fit = fit_round_behavioral_fingerprint(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        bundles=bundles,
    )
    probe_library = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    ).model_copy(update={"library_version": f"{CANONICAL_PROBE_LIBRARY_VERSION}_other"})

    with pytest.raises(ValueError, match="unsupported probe library version"):
        fit.probe_summary(probe_library)


def test_canonical_probe_builder_rejects_missing_feature_assignments() -> None:
    with pytest.raises(ValueError, match="missing canonical probe feature"):
        build_canonical_site_probes(SITE_FEATURE_NAMES + ("new_feature",))


def test_summarize_probe_support_is_finite(
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
    probe_library = build_behavioral_fingerprint_probe_library(
        [bundle.site_opportunities for bundle in bundles],
        [bundle.live_settlement_transitions for bundle in bundles],
        [bundle.ruin_transitions for bundle in bundles],
        [bundle.pairwise_candidates for bundle in bundles],
        [bundle.owner_years for bundle in bundles],
    )

    support = summarize_probe_support(bundles, probe_library)

    for payload in support.values():
        fractions = np.asarray(payload["feature_support_fraction"], dtype=np.float64)
        distances = np.asarray(payload["nearest_standardized_distance"], dtype=np.float64)
        assert np.all(np.isfinite(fractions))
        assert np.all(fractions >= 0.0)
        assert np.all(fractions <= 1.0)
        if int(payload["sample_count"]) > 0:
            assert np.all(np.isfinite(distances))
        else:
            assert np.all(np.isinf(distances))
