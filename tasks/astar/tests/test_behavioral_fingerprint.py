from __future__ import annotations

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.behavioral_fingerprint import (
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
    fit_round_behavioral_fingerprint,
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
    )
    names, vector = fit.probe_summary(probe_library)

    assert fit.sample_count >= 1
    assert len(fit.site_binary_heads) == 2
    assert len(fit.live_binary_heads) >= 3
    assert len(fit.live_linear_heads) == 4
    assert len(fit.ruin_binary_heads) == 5
    assert len(names) == len(vector)
    assert np.all(np.isfinite(vector))


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
