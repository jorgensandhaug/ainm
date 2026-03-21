from __future__ import annotations

from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.student.posterior.deepset_student import SummaryBankStudent
from astar.student.posterior.state_space_student import StateSpaceStudent
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from astar.workflows.results import TrainStateSpaceStudentResult, TrainSummaryStudentResult
from astar.workflows.train_teacher import train_hazard_teacher


def train_summary_bank_student(
    paths: WorkspacePaths,
    *,
    dataset_name: str = "synthetic_live_v1",
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    k_neighbors: int = 5,
    model_name: str = "summary_bank_student_v1",
    summary_backend: str = "behavioral_fingerprint_core",
    behavioral_fingerprint_summary_profile: str = "core_v1",
) -> TrainSummaryStudentResult:
    teacher_result = train_hazard_teacher(
        paths,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
    )
    from astar.history.episodes.build import build_round_episode
    from astar.teacher.dynamics.hazard_teacher import HazardTeacher

    replay_round_ids = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    replay_episodes = [build_round_episode(paths, round_id) for round_id in replay_round_ids]
    teacher = HazardTeacher(
        name=teacher_result.model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
    ).fit(
        [episode for episode in replay_episodes if episode.replay_run_count > 0],
    )
    dataset = build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
        regime_encoder=teacher,
    )
    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=k_neighbors,
    )
    checkpoint_path = student.save_checkpoint(
        paths.model_dir(model_name),
        teacher_result.checkpoint_path,
    )
    result = TrainSummaryStudentResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        dataset=dataset,
        checkpoint_path=checkpoint_path,
        teacher_checkpoint_path=teacher_result.checkpoint_path,
        sample_count=int(student.summary_vectors.shape[0]),
        summary_dim=int(student.summary_vectors.shape[1]),
        regime_dim=int(student.regime_vectors.shape[1]),
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


def train_state_space_student(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "synthetic_live_state_space_v1",
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    prototype_count: int = 6,
    decoder_rollouts: int = 32,
    model_name: str = "state_space_student_v1",
    teacher_model_name: str = "state_space_teacher_v1",
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
) -> TrainStateSpaceStudentResult:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
    replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]

    teacher = StateSpaceTeacher(
        name=teacher_model_name,
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
    teacher_checkpoint_path = teacher.save_checkpoint(
        paths.model_dir(teacher_model_name) / "checkpoint.json",
    )

    dataset = build_synthetic_live_dataset(
        paths,
        round_ids=selected_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
        regime_encoder=teacher,
    )
    student = StateSpaceStudent.fit_from_dataset(
        dataset,
        teacher,
        prototype_count=prototype_count,
        decoder_rollouts=decoder_rollouts,
    )
    checkpoint_path = student.save_checkpoint(
        paths.model_dir(model_name),
        teacher_checkpoint_path,
    )
    result = TrainStateSpaceStudentResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        dataset=dataset,
        checkpoint_path=checkpoint_path,
        teacher_checkpoint_path=teacher_checkpoint_path,
        sample_count=int(student.prototype_regime_vectors.shape[0]),
        summary_dim=int(student.summary_mean.shape[0]),
        regime_dim=int(student.regime_prior_mean.shape[0]),
        prototype_count=student.prototype_count,
        ridge_alpha=student.ridge_alpha,
        proposal_mass=student.proposal_mass,
        decoder_rollouts=student.decoder_rollouts,
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
