from __future__ import annotations

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.history.replay.terminal_cache import (
    empirical_terminal_probs_from_terminal_grids,
    load_or_build_seed_terminal_grid_cache,
)
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients,
    fit_round_semimechanistic_coefficients_from_seed_targets,
    seed_empirical_terminal_probs,
)
from astar.infra.artifacts.paths import WorkspacePaths
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_terminal_grid_cache_matches_empirical_terminal_probs(
    sample_paths: WorkspacePaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)

    episode = build_round_episode(sample_paths, ROUND_ID, include_replays=True)
    seed = episode.seeds[0]
    cached = load_or_build_seed_terminal_grid_cache(sample_paths, ROUND_ID, seed.seed_index)

    assert cached is not None
    replay_run_ids, terminal_grids = cached
    assert len(replay_run_ids) == 2
    assert terminal_grids.shape[0] == 2

    cached_probs = empirical_terminal_probs_from_terminal_grids(
        replay_run_ids,
        terminal_grids,
    )
    direct_probs = seed_empirical_terminal_probs(seed)

    assert cached_probs is not None
    assert direct_probs is not None
    assert np.allclose(cached_probs, direct_probs)

    subset_probs = empirical_terminal_probs_from_terminal_grids(
        replay_run_ids,
        terminal_grids,
        selected_run_ids=(replay_run_ids[0],),
    )
    assert subset_probs is not None
    assert subset_probs.shape == direct_probs.shape


def test_semimechanistic_coefficients_from_seed_targets_match_episode_fit(
    sample_paths: WorkspacePaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)

    episode = build_round_episode(sample_paths, ROUND_ID, include_replays=True)
    direct = fit_round_semimechanistic_coefficients(episode)
    seed_targets = [
        (seed.initial_state, empirical)
        for seed in episode.seeds
        if (empirical := seed_empirical_terminal_probs(seed)) is not None
    ]
    reconstructed = fit_round_semimechanistic_coefficients_from_seed_targets(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        seed_targets=seed_targets,
        regime_vector=direct.regime_vector,
    )

    assert np.allclose(reconstructed.combined_vector(), direct.combined_vector())
