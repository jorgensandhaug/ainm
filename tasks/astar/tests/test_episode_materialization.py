from __future__ import annotations

import shutil

import numpy as np

from astar.history.learning import load_round_learning_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.summarize_replays import summarize_round_replays
from tests.conftest import ROUND_ID


def test_materialize_round_episode_writes_feature_and_evidence_artifacts(
    sample_paths: RepoPaths,
) -> None:
    result = materialize_round_episode(sample_paths, ROUND_ID)

    assert result.summary_path.exists()
    assert result.report_path.exists()
    assert result.per_seed
    assert all(item.feature_path.exists() for item in result.per_seed)
    assert all(item.evidence_path.exists() for item in result.per_seed)


def test_load_round_learning_episode_reads_materialized_arrays(sample_paths: RepoPaths) -> None:
    materialize_round_episode(sample_paths, ROUND_ID)
    episode = load_round_learning_episode(sample_paths, ROUND_ID)

    assert episode.round_id == ROUND_ID
    assert episode.query_count == 3
    assert episode.per_seed[0].feature("buildable").shape == episode.per_seed[0].initial_grid.shape
    assert np.any(episode.per_seed[0].coverage_counts > 0)
    assert episode.per_seed[0].replay_event_summary_names is None or (
        len(episode.per_seed[0].replay_event_summary_names) > 0
    )


def test_load_round_learning_episode_reads_replay_event_summaries_when_present(
    sample_paths: RepoPaths,
) -> None:
    from tests.replay_test_utils import _write_replays_for_all_seeds

    _write_replays_for_all_seeds(sample_paths, run_count=1)
    materialize_round_episode(sample_paths, ROUND_ID)
    episode = load_round_learning_episode(sample_paths, ROUND_ID)

    assert episode.per_seed[0].replay_event_summary_names is not None
    assert episode.per_seed[0].replay_event_summary_vector is not None
    assert episode.per_seed[0].replay_frame_transition_count > 0
    assert episode.per_seed[0].replay_site_opportunity_count > 0
    assert episode.per_seed[0].replay_year_shock_count > 0
    assert len(episode.per_seed[0].replay_event_summary_names) == int(
        episode.per_seed[0].replay_event_summary_vector.shape[0],
    )


def test_materialize_round_episode_keeps_replay_event_summary_when_present(
    sample_paths: RepoPaths,
) -> None:
    from tests.replay_test_utils import _write_replays_for_all_seeds

    _write_replays_for_all_seeds(sample_paths, run_count=1)
    result = materialize_round_episode(sample_paths, ROUND_ID)

    assert result.replay_event_summary is not None
    assert len(result.replay_event_summary.seed_summaries) >= 1


def test_materialize_round_episode_can_use_cached_replay_summaries_without_raw_replays(
    sample_paths: RepoPaths,
) -> None:
    from tests.replay_test_utils import _write_replays_for_all_seeds

    _write_replays_for_all_seeds(sample_paths, run_count=1)
    summarize_round_replays(sample_paths, ROUND_ID)
    shutil.rmtree(sample_paths.raw_replay_dir(ROUND_ID, 0).parent)

    result = materialize_round_episode(sample_paths, ROUND_ID)

    assert result.replay_round_summary is not None
    assert result.replay_round_summary.replay_run_count == 5
    assert result.per_seed[0].replay_run_count == 1
    assert result.per_seed[1].replay_run_count == 1


def test_round_learning_episode_can_hide_evidence_for_seed(sample_paths: RepoPaths) -> None:
    materialize_round_episode(sample_paths, ROUND_ID)
    episode = load_round_learning_episode(sample_paths, ROUND_ID)

    masked = episode.with_hidden_evidence([0])

    assert masked.per_seed[0].query_count == 0
    assert np.all(masked.per_seed[0].coverage_counts == 0)
    assert masked.per_seed[1].query_count == episode.per_seed[1].query_count
