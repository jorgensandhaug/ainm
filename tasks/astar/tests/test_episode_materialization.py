from __future__ import annotations

import numpy as np

from astar.history.learning import load_round_learning_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.materialize_episode import materialize_round_episode
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


def test_round_learning_episode_can_hide_evidence_for_seed(sample_paths: RepoPaths) -> None:
    materialize_round_episode(sample_paths, ROUND_ID)
    episode = load_round_learning_episode(sample_paths, ROUND_ID)

    masked = episode.with_hidden_evidence([0])

    assert masked.per_seed[0].query_count == 0
    assert np.all(masked.per_seed[0].coverage_counts == 0)
    assert masked.per_seed[1].query_count == episode.per_seed[1].query_count


def test_load_round_learning_episode_rebuilds_corrupt_materialized_arrays(
    sample_paths: RepoPaths,
) -> None:
    materialize_round_episode(sample_paths, ROUND_ID)
    sample_paths.feature_tensor_path(ROUND_ID, 0).write_bytes(b"corrupt-feature")
    sample_paths.evidence_tensor_path(ROUND_ID, 0).write_bytes(b"corrupt-evidence")

    episode = load_round_learning_episode(sample_paths, ROUND_ID)

    assert episode.per_seed[0].feature("buildable").shape == episode.per_seed[0].initial_grid.shape
    assert episode.per_seed[0].query_count > 0
