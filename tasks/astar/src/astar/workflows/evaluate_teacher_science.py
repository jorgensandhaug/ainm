from __future__ import annotations

import json

import numpy as np

from astar.eval.reports import render_teacher_science_report
from astar.eval.science import evaluate_teacher_science
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from astar.workflows.results import EvaluateTeacherScienceResult


def evaluate_hazard_teacher_science(
    paths: WorkspacePaths,
    *,
    eval_round_ids: list[str] | None = None,
    train_round_ids: list[str] | None = None,
    model_name: str = "hazard_teacher_v1",
    summary_backend: str = "behavioral_fingerprint_core",
    behavioral_fingerprint_summary_profile: str = "core_v1",
    n_rollouts: int | None = None,
) -> EvaluateTeacherScienceResult:
    replay_round_ids = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    selected_eval_round_ids = eval_round_ids or replay_round_ids
    selected_train_round_ids = train_round_ids or [
        round_id for round_id in replay_round_ids if round_id not in set(selected_eval_round_ids)
    ]
    if not selected_train_round_ids:
        selected_train_round_ids = selected_eval_round_ids

    train_episodes = [build_round_episode(paths, round_id) for round_id in selected_train_round_ids]
    teacher = HazardTeacher(
        name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
    ).fit(
        [episode for episode in train_episodes if episode.replay_run_count > 0],
    )

    reports = [
        evaluate_teacher_science(
            teacher,
            build_round_episode(paths, round_id),
            n_rollouts=n_rollouts,
        )
        for round_id in selected_eval_round_ids
    ]
    artifact_name = f"teacher_science__{model_name}"
    artifact_path = paths.artifacts_dir / "reports" / f"{artifact_name}.json"
    report_path = paths.artifacts_dir / "reports" / f"{artifact_name}.md"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    result = EvaluateTeacherScienceResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        train_round_ids=selected_train_round_ids,
        eval_round_ids=selected_eval_round_ids,
        report_count=len(reports),
        mean_terminal_l1=float(np.mean([item.mean_terminal_l1 for item in reports])),
        mean_alive_curve_mae=float(np.mean([item.mean_alive_curve_mae for item in reports])),
        mean_port_curve_mae=float(np.mean([item.mean_port_curve_mae for item in reports])),
        mean_ruin_curve_mae=float(np.mean([item.mean_ruin_curve_mae for item in reports])),
        mean_owner_flip_mae=float(np.mean([item.mean_owner_flip_mae for item in reports])),
        mean_coefficient_l2=float(np.mean([item.mean_coefficient_l2 for item in reports])),
        reports=reports,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(render_teacher_science_report(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="science_evaluation",
            spec_name=model_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


def evaluate_state_space_teacher_science(
    paths: WorkspacePaths,
    *,
    eval_round_ids: list[str] | None = None,
    train_round_ids: list[str] | None = None,
    model_name: str = "state_space_teacher_v1",
    summary_backend: str = "behavioral_fingerprint_core",
    behavioral_fingerprint_summary_profile: str = "core_v1",
    n_rollouts: int | None = None,
    regime_max_rank: int = 4,
    fit_workers: int = 1,
    max_site_rows: int = 120_000,
    max_live_rows: int = 120_000,
    max_pairwise_rows: int = 180_000,
    max_ruin_rows: int = 120_000,
    max_initial_rows: int = 80_000,
    rollout_noise_scale: float = 0.5,
) -> EvaluateTeacherScienceResult:
    replay_round_ids = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    selected_eval_round_ids = eval_round_ids or replay_round_ids
    selected_train_round_ids = train_round_ids or [
        round_id for round_id in replay_round_ids if round_id not in set(selected_eval_round_ids)
    ]
    if not selected_train_round_ids:
        selected_train_round_ids = selected_eval_round_ids

    train_episodes = [build_round_episode(paths, round_id) for round_id in selected_train_round_ids]
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
    ).fit([episode for episode in train_episodes if episode.replay_run_count > 0])

    reports = [
        evaluate_teacher_science(
            teacher,
            build_round_episode(paths, round_id),
            n_rollouts=n_rollouts,
        )
        for round_id in selected_eval_round_ids
    ]
    artifact_name = f"teacher_science__{model_name}"
    artifact_path = paths.artifacts_dir / "reports" / f"{artifact_name}.json"
    report_path = paths.artifacts_dir / "reports" / f"{artifact_name}.md"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    result = EvaluateTeacherScienceResult(
        model_name=model_name,
        summary_backend=summary_backend,
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        train_round_ids=selected_train_round_ids,
        eval_round_ids=selected_eval_round_ids,
        report_count=len(reports),
        mean_terminal_l1=float(np.mean([item.mean_terminal_l1 for item in reports])),
        mean_alive_curve_mae=float(np.mean([item.mean_alive_curve_mae for item in reports])),
        mean_port_curve_mae=float(np.mean([item.mean_port_curve_mae for item in reports])),
        mean_ruin_curve_mae=float(np.mean([item.mean_ruin_curve_mae for item in reports])),
        mean_owner_flip_mae=float(np.mean([item.mean_owner_flip_mae for item in reports])),
        mean_coefficient_l2=float(np.mean([item.mean_coefficient_l2 for item in reports])),
        reports=reports,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(render_teacher_science_report(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="science_evaluation",
            spec_name=model_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


__all__ = [
    "evaluate_hazard_teacher_science",
    "evaluate_state_space_teacher_science",
]
