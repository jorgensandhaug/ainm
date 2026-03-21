from __future__ import annotations

import csv
import json
from pathlib import Path
from time import perf_counter

from astar.eval.competition import CompetitionAggregate, aggregate_episode_metrics
from astar.eval.reports import render_historical_benchmark_report
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import (
    ModelSeedEvaluationContext,
    discover_historical_eval_round_ids,
    evaluate_model_on_round,
)
from astar.workflows.results import (
    HistoricalBenchmarkResult,
    HistoricalBenchmarkRoundResult,
    HistoricalBenchmarkSeedResult,
)
from astar.workflows.visualize_model_prediction import write_model_evaluation_report


def _seed_key(seed_result: HistoricalBenchmarkSeedResult) -> tuple[str, int]:
    return (seed_result.round_id, seed_result.seed_index)


def _select_visualization_keys(
    seed_results: list[HistoricalBenchmarkSeedResult],
    *,
    policy: str,
) -> set[tuple[str, int]]:
    if policy == "none":
        return set()
    if policy == "all":
        return {_seed_key(item) for item in seed_results}

    selected: set[tuple[str, int]] = set()
    for item in sorted(seed_results, key=lambda row: row.weighted_kl, reverse=True)[:5]:
        selected.add(_seed_key(item))
    for item in sorted(seed_results, key=lambda row: row.score, reverse=True)[:3]:
        selected.add(_seed_key(item))
    support_rows = [item for item in seed_results if item.support_full_pct is not None]
    for item in sorted(
        support_rows,
        key=lambda row: (
            row.support_full_pct if row.support_full_pct is not None else 1.0,
            -row.weighted_kl,
        ),
    )[:5]:
        selected.add(_seed_key(item))
    return selected


def _write_summary_jsonl(path: Path, seed_results: list[HistoricalBenchmarkSeedResult]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for item in seed_results:
            handle.write(json.dumps(to_jsonable(item), sort_keys=True))
            handle.write("\n")
    return path


def _write_summary_csv(path: Path, seed_results: list[HistoricalBenchmarkSeedResult]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [to_jsonable(item) for item in seed_results]
    if not rows:
        path.write_text("", encoding="utf-8")
        return path

    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: (
                        json.dumps(value, sort_keys=True)
                        if isinstance(value, list | dict)
                        else value
                    )
                    for key, value in row.items()
                },
            )
    return path


def run_historical_benchmark(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: list[str] | None = None,
    mode: str = "prior_only",
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    budget: int = 50,
    episode_seed: int = 0,
    episode_seed_count: int = 1,
    visualization_policy: str = "top",
    benchmark_name: str | None = None,
) -> HistoricalBenchmarkResult:
    started_at = perf_counter()
    if episode_seed_count < 1:
        raise ValueError("episode_seed_count must be >= 1")
    selected_round_ids = discover_historical_eval_round_ids(paths, round_ids)
    if mode == "online_interactive":
        missing_replays = [
            round_id
            for round_id in selected_round_ids
            if not paths.raw_dir.joinpath("replays", round_id).is_dir()
        ]
        if missing_replays:
            raise ValueError(
                "online_interactive historical benchmark requires replay-backed rounds; "
                f"missing replay dirs for: {', '.join(missing_replays)}",
            )
    if model_name.strip().lower() == "historical_bucket_prior" and len(selected_round_ids) < 2:
        raise ValueError(
            "historical_bucket_prior requires at least two analyzed rounds for holdout eval",
        )
    normalized_model_name = model_name.strip().lower()
    resolved_samples_per_round = samples_per_round if normalized_model_name == "query_residual" else None
    if normalized_model_name == "query_residual" and len(selected_round_ids) < 2:
        raise ValueError("query_residual requires at least two replay-backed analyzed rounds for holdout eval")
    if mode == "prior_only" and normalized_model_name == "latent_regime":
        raise ValueError("latent_regime requires mode=online_interactive for historical benchmark")
    if mode == "online_interactive" and normalized_model_name == "static_semantic":
        raise ValueError("static_semantic is only supported in mode=prior_only")
    if mode not in {"prior_only", "online_interactive"}:
        raise ValueError(f"unsupported historical benchmark mode: {mode}")
    resolved_policy_name = (
        None if mode == "prior_only" else build_interactive_policy(policy_name).name
    )
    model_suffix = ""
    if normalized_model_name == "query_residual":
        model_suffix = f"__samples={samples_per_round}"
    interactive_suffix = ""
    resolved_episode_seeds = (
        None
        if mode == "prior_only"
        else [episode_seed + offset for offset in range(episode_seed_count)]
    )
    if mode != "prior_only":
        episode_token = (
            str(episode_seed)
            if episode_seed_count == 1
            else f"{resolved_episode_seeds[0]}..{resolved_episode_seeds[-1]}"
        )
        interactive_suffix = (
            f"__policy={resolved_policy_name}"
            f"__budget={budget}"
            f"__episode_seed={episode_token}"
        )

    run_name = benchmark_name or (
        f"historical__{mode}__{model_name}"
        f"{model_suffix}"
        f"{interactive_suffix}"
        f"__rounds={len(selected_round_ids)}"
    )
    benchmark_dir = paths.benchmark_dir() / run_name
    artifact_path = benchmark_dir / "result.json"
    report_path = benchmark_dir / "report.md"
    summary_jsonl_path = benchmark_dir / "summary.jsonl"
    summary_csv_path = benchmark_dir / "summary.csv"

    contexts_by_key: dict[tuple[str, int, int | None], ModelSeedEvaluationContext] = {}
    seed_results_by_key: dict[tuple[str, int, int | None], HistoricalBenchmarkSeedResult] = {}
    per_round_keys: dict[str, list[tuple[str, int, int | None]]] = {}
    round_evaluation_seconds: dict[str, float] = {}
    round_visualization_seconds: dict[str, float] = {}
    round_mean_scores: list[float] = []
    round_mean_weighted_kls: list[float] = []

    for held_out_round_id in selected_round_ids:
        training_round_ids = [item for item in selected_round_ids if item != held_out_round_id]
        evaluation_seeds = [None] if resolved_episode_seeds is None else list(resolved_episode_seeds)
        round_seconds = 0.0
        predictor_started_at = perf_counter()
        online_predictor = (
            None
            if mode != "online_interactive"
            else build_online_predictor(
                model_name,
                paths=paths,
                historical_round_ids=training_round_ids,
                policy_name=policy_name,
                samples_per_round=samples_per_round,
            )
        )
        round_seconds += perf_counter() - predictor_started_at
        keys: list[tuple[str, int, int | None]] = []
        for current_episode_seed in evaluation_seeds:
            evaluation_started_at = perf_counter()
            contexts = evaluate_model_on_round(
                paths,
                round_id=held_out_round_id,
                model_name=model_name,
                training_round_ids=training_round_ids,
                mode=mode,
                policy_name=policy_name if mode == "online_interactive" else None,
                samples_per_round=samples_per_round,
                budget=budget,
                episode_seed=0 if current_episode_seed is None else current_episode_seed,
                online_predictor=online_predictor,
            )
            round_seconds += perf_counter() - evaluation_started_at
            for context in contexts:
                key = (context.round_id, context.seed_index, context.episode_seed)
                keys.append(key)
                contexts_by_key[key] = context
                seed_results_by_key[key] = context.to_seed_result()
        round_evaluation_seconds[held_out_round_id] = round_seconds
        if not keys:
            continue
        per_round_keys[held_out_round_id] = keys
        round_mean_scores.append(
            sum(seed_results_by_key[key].score for key in keys) / float(len(keys)),
        )
        round_mean_weighted_kls.append(
            sum(seed_results_by_key[key].weighted_kl for key in keys) / float(len(keys)),
        )

    if not seed_results_by_key:
        raise ValueError("historical benchmark produced no evaluated seeds")

    visualization_keys = _select_visualization_keys(
        list(seed_results_by_key.values()),
        policy=visualization_policy,
    )
    for round_id, seed_index in sorted(visualization_keys):
        matching_keys = [
            key
            for key in contexts_by_key
            if key[0] == round_id and key[1] == seed_index
        ]
        if not matching_keys:
            continue
        matching_keys.sort(key=lambda item: (-1 if item[2] is None else int(item[2])))
        key = matching_keys[0]
        context = contexts_by_key[key]
        visualization_started_at = perf_counter()
        viz_result = write_model_evaluation_report(
            context,
            benchmark_dir
            / "visualizations"
            / round_id
            / f"seed_index={seed_index}"
            / context.model_name,
            report_key="historical_benchmark_seed",
            title=(
                f"Historical Benchmark Round {context.round_number} "
                f"Seed {seed_index} {context.model_name}"
            ),
        )
        visualization_seconds = perf_counter() - visualization_started_at
        round_visualization_seconds[round_id] = (
            round_visualization_seconds.get(round_id, 0.0) + visualization_seconds
        )
        seed_results_by_key[key] = seed_results_by_key[
            key
        ].model_copy(
            update={
                "report_path": viz_result.report_path,
                "manifest_path": viz_result.manifest_path,
                "visualization_seconds": visualization_seconds,
            },
        )

    round_results: list[HistoricalBenchmarkRoundResult] = []
    for round_id in selected_round_ids:
        keys = per_round_keys.get(round_id, [])
        if not keys:
            continue
        round_seed_results = [seed_results_by_key[key] for key in keys]
        round_results.append(
            HistoricalBenchmarkRoundResult(
                round_id=round_id,
                round_number=round_seed_results[0].round_number,
                policy_name=round_seed_results[0].policy_name,
                samples_per_round=round_seed_results[0].samples_per_round,
                budget=round_seed_results[0].budget,
                episode_seeds=None if resolved_episode_seeds is None else list(resolved_episode_seeds),
                episode_seed=(
                    None
                    if resolved_episode_seeds is None or len(resolved_episode_seeds) != 1
                    else resolved_episode_seeds[0]
                ),
                evaluated_episode_count=(
                    1 if resolved_episode_seeds is None else len(resolved_episode_seeds)
                ),
                executed_queries=round_seed_results[0].executed_queries,
                evaluated_seed_count=len(round_seed_results),
                visualized_seed_count=sum(
                    1 for item in round_seed_results if item.report_path is not None
                ),
                mean_score=(
                    sum(item.score for item in round_seed_results)
                    / float(len(round_seed_results))
                ),
                mean_weighted_kl=(
                    sum(item.weighted_kl for item in round_seed_results)
                    / float(len(round_seed_results))
                ),
                evaluation_seconds=round_evaluation_seconds.get(round_id),
                visualization_seconds=round_visualization_seconds.get(round_id, 0.0),
                seed_results=round_seed_results,
            ),
        )

    aggregate: CompetitionAggregate = aggregate_episode_metrics(
        round_mean_scores,
        round_mean_weighted_kls,
    )
    all_seed_results = [
        seed_result
        for round_result in round_results
        for seed_result in round_result.seed_results
    ]
    result = HistoricalBenchmarkResult(
        benchmark_name=run_name,
        model_name=model_name,
        mode=mode,
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
        budget=None if mode == "prior_only" else budget,
        episode_seeds=resolved_episode_seeds,
        episode_seed=(
            None
            if mode == "prior_only" or resolved_episode_seeds is None or len(resolved_episode_seeds) != 1
            else resolved_episode_seeds[0]
        ),
        round_ids=[item.round_id for item in round_results],
        aggregate=aggregate,
        rounds=round_results,
        evaluated_seed_count=len(all_seed_results),
        visualization_policy=visualization_policy,
        visualized_seed_count=len(visualization_keys),
        evaluation_seconds=sum(round_evaluation_seconds.values()),
        visualization_seconds=sum(round_visualization_seconds.values()),
        artifact_write_seconds=0.0,
        total_runtime_seconds=0.0,
        artifact_path=artifact_path,
        report_path=report_path,
        summary_jsonl_path=summary_jsonl_path,
        summary_csv_path=summary_csv_path,
    )

    benchmark_dir.mkdir(parents=True, exist_ok=True)
    artifact_write_started_at = perf_counter()
    _write_summary_jsonl(summary_jsonl_path, all_seed_results)
    _write_summary_csv(summary_csv_path, all_seed_results)
    artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    report_path.write_text(render_historical_benchmark_report(result) + "\n", encoding="utf-8")
    artifact_write_seconds = perf_counter() - artifact_write_started_at
    result = result.model_copy(
        update={
            "artifact_write_seconds": artifact_write_seconds,
            "total_runtime_seconds": perf_counter() - started_at,
        },
    )
    artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    report_path.write_text(render_historical_benchmark_report(result) + "\n", encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="historical_benchmark",
            spec_name=run_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "mode": mode,
                "round_count": len(result.rounds),
                "evaluated_seed_count": result.evaluated_seed_count,
                "visualized_seed_count": result.visualized_seed_count,
                "samples_per_round": result.samples_per_round,
                "episode_seeds": result.episode_seeds,
                "mean_score": result.aggregate.mean_score,
                "mean_weighted_kl": result.aggregate.mean_weighted_kl,
                "evaluation_seconds": result.evaluation_seconds,
                "visualization_seconds": result.visualization_seconds,
                "artifact_write_seconds": result.artifact_write_seconds,
                "total_runtime_seconds": result.total_runtime_seconds,
            },
        ),
    )
    return result


__all__ = ["run_historical_benchmark"]
