from __future__ import annotations

import json
from pathlib import Path

from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor
from astar.eval.competition import aggregate_episode_metrics
from astar.eval.reports import render_synthetic_benchmark_report
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.splits.synthetic_benchmark import load_benchmark_manifest
from astar.workflows.results import (
    SyntheticBenchmarkEpisodeResult,
    SyntheticBenchmarkResult,
)
from astar.workflows.synthetic_tournament import run_synthetic_tournament


def run_synthetic_benchmark(
    paths: WorkspacePaths,
    *,
    predictor: OnlinePredictor,
    policy: InteractiveQueryPolicy,
    manifest_path: Path | None = None,
    round_ids: list[str] | None = None,
    episode_seeds: list[int] | None = None,
    budget: int = 50,
    benchmark_name: str | None = None,
) -> SyntheticBenchmarkResult:
    manifest_name: str | None = None
    if manifest_path is not None:
        manifest = load_benchmark_manifest(manifest_path)
        selected_round_ids = manifest.round_ids
        selected_episode_seeds = manifest.episode_seeds
        budget = manifest.budget
        manifest_name = manifest.name
    else:
        selected_round_ids = round_ids or sorted(
            round_dir.name
            for round_dir in paths.raw_dir.joinpath("replays").glob("*")
            if round_dir.is_dir()
        )
        selected_episode_seeds = episode_seeds or [0]

    episodes: list[SyntheticBenchmarkEpisodeResult] = []
    mean_scores: list[float] = []
    mean_weighted_kls: list[float] = []
    for round_id in selected_round_ids:
        for episode_seed in selected_episode_seeds:
            tournament = run_synthetic_tournament(
                paths,
                round_id=round_id,
                predictor=predictor,
                policy=policy,
                budget=budget,
                episode_seed=episode_seed,
            )
            episodes.append(
                SyntheticBenchmarkEpisodeResult(
                    round_id=tournament.round_id,
                    round_number=tournament.round_number,
                    episode_seed=episode_seed,
                    mean_score=tournament.mean_score,
                    mean_weighted_kl=tournament.mean_weighted_kl,
                    tournament_artifact_path=tournament.artifact_path,
                ),
            )
            mean_scores.append(tournament.mean_score)
            mean_weighted_kls.append(tournament.mean_weighted_kl)

    aggregate = aggregate_episode_metrics(mean_scores, mean_weighted_kls)
    run_name = benchmark_name or (
        f"{manifest_name}__{policy.name}__{predictor.name}"
        if manifest_name is not None
        else f"{policy.name}+{predictor.name}"
    )
    artifact_path = paths.benchmark_result_path(run_name)
    report_path = artifact_path.with_suffix(".md")
    result = SyntheticBenchmarkResult(
        benchmark_name=run_name,
        predictor_name=predictor.name,
        policy_name=policy.name,
        manifest_path=manifest_path,
        budget=budget,
        round_ids=selected_round_ids,
        episode_seeds=selected_episode_seeds,
        aggregate=aggregate,
        episodes=episodes,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    report_path.write_text(render_synthetic_benchmark_report(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).try_log_event(
        CatalogEvent(
            event_kind="synthetic_benchmark",
            spec_name=run_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "budget": budget,
                "episode_count": aggregate.episode_count,
                "mean_score": aggregate.mean_score,
                "mean_weighted_kl": aggregate.mean_weighted_kl,
            },
        ),
    )
    return result


__all__ = ["run_synthetic_benchmark"]
