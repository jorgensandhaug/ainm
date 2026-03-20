from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.workflows.corpus_summary import summarize_learning_corpus
from astar.workflows.materialize_episode import materialize_round_episode
from tests.conftest import ROUND_ID


def test_summarize_learning_corpus_counts_materialized_episode(sample_paths: RepoPaths) -> None:
    materialize_round_episode(sample_paths, ROUND_ID)

    summary = summarize_learning_corpus(sample_paths)

    assert summary.episode_count == 1
    assert summary.leave_one_seed_out_task_count == 5
    assert summary.two_seed_holdout_task_count == 10
    assert summary.corpus.round_ids == [ROUND_ID]
