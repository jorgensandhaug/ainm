from __future__ import annotations

from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.workflows.results import TrainHazardTeacherResult


def train_hazard_teacher(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    model_name: str = "hazard_teacher_v1",
) -> TrainHazardTeacherResult:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
    replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
    teacher = HazardTeacher(name=model_name).fit(replay_episodes)
    checkpoint_path = teacher.save_checkpoint(
        paths.model_dir(model_name) / "checkpoint.json",
    )
    result = TrainHazardTeacherResult(
        model_name=model_name,
        replay_episode_count=len(replay_episodes),
        replay_run_count=sum(episode.replay_run_count for episode in replay_episodes),
        checkpoint_path=checkpoint_path,
        embedding_dim=int(getattr(teacher, "selected_rank", teacher.regime_bank.shape[1])),
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="training_run",
            spec_name=model_name,
            status="ok",
            artifact_path=checkpoint_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result
