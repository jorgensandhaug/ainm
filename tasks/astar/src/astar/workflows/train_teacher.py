from __future__ import annotations

from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from astar.workflows.results import (
    TrainHazardTeacherResult,
    TrainStateSpaceTeacherResult,
)


def _replay_backed_episodes(
    paths: WorkspacePaths,
    round_ids: list[str] | None = None,
) -> list[RoundEpisode]:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
    return [episode for episode in episodes if episode.replay_run_count > 0]


def train_hazard_teacher(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    model_name: str = "hazard_teacher_v1",
    summary_backend: str = "behavioral_fingerprint_core",
    behavioral_fingerprint_summary_profile: str = "core_v1",
) -> TrainHazardTeacherResult:
    replay_episodes = _replay_backed_episodes(paths, round_ids)
    teacher = HazardTeacher(
        name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
    ).fit(replay_episodes)
    checkpoint_path = teacher.save_checkpoint(
        paths.model_dir(model_name) / "checkpoint.json",
    )
    result = TrainHazardTeacherResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        replay_episode_count=len(replay_episodes),
        replay_run_count=sum(episode.replay_run_count for episode in replay_episodes),
        checkpoint_path=checkpoint_path,
        embedding_dim=int(teacher.regime_bank.shape[1]),
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


def train_state_space_teacher(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    model_name: str = "state_space_teacher_v1",
    summary_backend: str = "behavioral_fingerprint_core",
    behavioral_fingerprint_summary_profile: str = "core_v1",
    regime_max_rank: int = 4,
    fit_workers: int = 1,
    max_site_rows: int = 120_000,
    max_live_rows: int = 120_000,
    max_pairwise_rows: int = 180_000,
    max_ruin_rows: int = 120_000,
    max_initial_rows: int = 80_000,
    rollout_noise_scale: float = 0.5,
) -> TrainStateSpaceTeacherResult:
    replay_episodes = _replay_backed_episodes(paths, round_ids)
    teacher = StateSpaceTeacher(
        name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        regime_max_rank=regime_max_rank,
        fit_workers=fit_workers,
        max_site_rows=max_site_rows,
        max_live_rows=max_live_rows,
        max_pairwise_rows=max_pairwise_rows,
        max_ruin_rows=max_ruin_rows,
        max_initial_rows=max_initial_rows,
        rollout_noise_scale=rollout_noise_scale,
    ).fit(replay_episodes)
    checkpoint_path = teacher.save_checkpoint(paths.model_dir(model_name) / "checkpoint.json")
    result = TrainStateSpaceTeacherResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        replay_episode_count=len(replay_episodes),
        replay_run_count=sum(episode.replay_run_count for episode in replay_episodes),
        checkpoint_path=checkpoint_path,
        regime_dim=teacher.regime_dim,
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
