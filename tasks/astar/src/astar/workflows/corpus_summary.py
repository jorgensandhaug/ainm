from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.history.corpus import LearningCorpus, load_learning_corpus
from astar.infra.artifacts.paths import WorkspacePaths


class CorpusSummaryResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    episode_count: int = Field(ge=0)
    analyzed_episode_count: int = Field(ge=0)
    replay_episode_count: int = Field(ge=0)
    leave_one_seed_out_task_count: int = Field(ge=0)
    two_seed_holdout_task_count: int = Field(ge=0)
    corpus: LearningCorpus


def summarize_learning_corpus(
    paths: WorkspacePaths,
    require_ground_truth: bool = False,
) -> CorpusSummaryResult:
    corpus = load_learning_corpus(paths, require_ground_truth=require_ground_truth)
    analyzed_episode_count = sum(
        1 for episode in corpus.episodes.values() if episode.analyzed_seed_count > 0
    )
    replay_episode_count = sum(
        1 for episode in corpus.episodes.values() if episode.replay_run_count > 0
    )
    return CorpusSummaryResult(
        episode_count=len(corpus.episodes),
        analyzed_episode_count=analyzed_episode_count,
        replay_episode_count=replay_episode_count,
        leave_one_seed_out_task_count=len(
            corpus.leave_one_seed_out_tasks(require_ground_truth=require_ground_truth),
        ),
        two_seed_holdout_task_count=len(
            corpus.held_out_seed_tasks(
                hidden_seed_count=2,
                require_ground_truth=require_ground_truth,
            ),
        ),
        corpus=corpus,
    )
