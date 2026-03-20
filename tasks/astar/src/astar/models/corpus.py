from __future__ import annotations

from itertools import combinations

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.paths import WorkspacePaths
from astar.models.episode_dataset import RoundLearningEpisode, load_round_learning_episode


class CorpusEpisodeSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    status: str
    seed_count: int = Field(ge=0)
    analyzed_seed_count: int = Field(ge=0)
    query_count: int = Field(ge=0)
    replay_run_count: int = Field(default=0, ge=0)


class SupportQueryTask(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    support_seed_indexes: list[int]
    query_seed_indexes: list[int]
    analyzed_seed_count: int = Field(ge=0)
    query_count: int = Field(ge=0)


class LearningCorpus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    episodes: dict[str, RoundLearningEpisode]

    @property
    def round_ids(self) -> list[str]:
        return sorted(self.episodes)

    @property
    def summaries(self) -> list[CorpusEpisodeSummary]:
        return [
            CorpusEpisodeSummary(
                round_id=episode.round_id,
                round_number=episode.round_number,
                status=episode.status,
                seed_count=len(episode.per_seed),
                analyzed_seed_count=episode.analyzed_seed_count,
                query_count=episode.query_count,
                replay_run_count=episode.replay_run_count,
            )
            for episode in self.episodes.values()
        ]

    def leave_one_seed_out_tasks(
        self,
        require_ground_truth: bool = False,
    ) -> list[SupportQueryTask]:
        tasks: list[SupportQueryTask] = []
        for episode in self.episodes.values():
            all_seed_indexes = sorted(episode.per_seed)
            for hidden_seed_index in all_seed_indexes:
                if (
                    require_ground_truth
                    and episode.per_seed[hidden_seed_index].ground_truth is None
                ):
                    continue
                support_seed_indexes = [
                    seed_index for seed_index in all_seed_indexes if seed_index != hidden_seed_index
                ]
                tasks.append(
                    SupportQueryTask(
                        round_id=episode.round_id,
                        support_seed_indexes=support_seed_indexes,
                        query_seed_indexes=[hidden_seed_index],
                        analyzed_seed_count=episode.analyzed_seed_count,
                        query_count=episode.query_count,
                    ),
                )
        return tasks

    def held_out_seed_tasks(
        self,
        hidden_seed_count: int,
        require_ground_truth: bool = False,
    ) -> list[SupportQueryTask]:
        if hidden_seed_count <= 0:
            msg = "hidden_seed_count must be positive"
            raise ValueError(msg)

        tasks: list[SupportQueryTask] = []
        for episode in self.episodes.values():
            all_seed_indexes = sorted(episode.per_seed)
            if hidden_seed_count >= len(all_seed_indexes):
                continue
            for hidden_seed_indexes in combinations(all_seed_indexes, hidden_seed_count):
                if require_ground_truth and any(
                    episode.per_seed[seed_index].ground_truth is None
                    for seed_index in hidden_seed_indexes
                ):
                    continue
                support_seed_indexes = [
                    seed_index
                    for seed_index in all_seed_indexes
                    if seed_index not in hidden_seed_indexes
                ]
                tasks.append(
                    SupportQueryTask(
                        round_id=episode.round_id,
                        support_seed_indexes=support_seed_indexes,
                        query_seed_indexes=list(hidden_seed_indexes),
                        analyzed_seed_count=episode.analyzed_seed_count,
                        query_count=episode.query_count,
                    ),
                )
        return tasks


def load_learning_corpus(
    paths: WorkspacePaths,
    require_ground_truth: bool = False,
) -> LearningCorpus:
    episodes: dict[str, RoundLearningEpisode] = {}
    for summary_path in sorted(paths.artifacts_dir.joinpath("episodes").glob("*/summary.json")):
        round_id = summary_path.parent.name
        episode = load_round_learning_episode(paths, round_id)
        if require_ground_truth and episode.analyzed_seed_count == 0:
            continue
        episodes[round_id] = episode
    return LearningCorpus(episodes=episodes)
