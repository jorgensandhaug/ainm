from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import json
from multiprocessing import get_context
from time import perf_counter

import numpy as np

from astar.eval.competition import CompetitionAggregate, aggregate_episode_metrics
from astar.eval.reports import render_historical_benchmark_report
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.evidence_field import (
    is_evidence_field_model_name,
    resolve_evidence_field_samples_per_round,
)
from astar.student.predictor.query_residual import (
    is_query_residual_model_name,
    resolve_query_residual_samples_per_round,
)
from astar.student.predictor.summary_bank import (
    is_summary_bank_model_name,
    resolve_summary_bank_variant_spec,
)
from astar.student.predictor.transcript_memory import (
    is_transcript_memory_model_name,
    resolve_transcript_memory_samples_per_round,
)
from astar.student.predictor.transcript_residual_memory import (
    is_transcript_residual_memory_model_name,
    resolve_transcript_residual_memory_samples_per_round,
)
from astar.student.predictor.transcript_sequence_residual_memory import (
    is_transcript_sequence_residual_memory_model_name,
    resolve_transcript_sequence_residual_memory_samples_per_round,
)
from astar.student.predictor.transcript_sequence_factor_residual import (
    is_transcript_sequence_factor_residual_model_name,
    resolve_transcript_sequence_factor_residual_samples_per_round,
)
from astar.student.predictor.round_transcript_residual_memory import (
    is_round_transcript_residual_memory_model_name,
    resolve_round_transcript_residual_memory_samples_per_round,
)
from astar.student.predictor.round_transcript_factor_residual import (
    is_round_transcript_factor_residual_model_name,
    resolve_round_transcript_factor_residual_samples_per_round,
)
from astar.student.predictor.round_transcript_prototype_residual import (
    is_round_transcript_prototype_residual_model_name,
    resolve_round_transcript_prototype_residual_samples_per_round,
)
from astar.student.predictor.round_heatmap_factor_residual import (
    is_round_heatmap_factor_residual_model_name,
    resolve_round_heatmap_factor_residual_samples_per_round,
)
from astar.student.predictor.round_heatmap_residual_memory import (
    is_round_heatmap_residual_memory_model_name,
    resolve_round_heatmap_residual_memory_samples_per_round,
)
from astar.student.predictor.round_heatmap_prototype_residual import (
    is_round_heatmap_prototype_residual_model_name,
    resolve_round_heatmap_prototype_residual_samples_per_round,
)
from astar.student.predictor.round_heatmap_kernel_residual import (
    is_round_heatmap_kernel_residual_model_name,
    resolve_round_heatmap_kernel_residual_samples_per_round,
)
from astar.student.predictor.round_settlement_graph_factor_residual import (
    is_round_settlement_graph_factor_residual_model_name,
    resolve_round_settlement_graph_factor_residual_samples_per_round,
)
from astar.student.predictor.settlement_state_field_blend import (
    is_settlement_state_field_blend_model_name,
    resolve_settlement_state_field_blend_samples_per_round,
)
from astar.workflows.historical_benchmark import (
    _effective_round_weight,
    _evaluate_round_worker,
    _select_visualization_keys,
    _write_summary_csv,
    _write_summary_jsonl,
)
from astar.workflows.model_eval import (
    ModelSeedEvaluationContext,
    discover_historical_eval_round_ids,
)
from astar.workflows.results import (
    HistoricalBenchmarkResult,
    HistoricalBenchmarkRoundResult,
    HistoricalBenchmarkSeedResult,
)
from astar.workflows.visualize_model_prediction import write_model_evaluation_report


def _replay_backed_round_ids(paths: WorkspacePaths, round_ids: list[str]) -> list[str]:
    return [
        round_id
        for round_id in round_ids
        if paths.raw_dir.joinpath("replays", round_id).is_dir()
    ]


def run_targeted_holdout_benchmark(
    paths: WorkspacePaths,
    *,
    model_name: str,
    held_out_round_ids: list[str],
    mode: str = "prior_only",
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
    budget: int = 50,
    episode_seed: int = 0,
    visualization_policy: str = "none",
    benchmark_name: str | None = None,
    jobs: int = 1,
) -> HistoricalBenchmarkResult:
    started_at = perf_counter()
    if jobs < 1:
        raise ValueError("targeted holdout jobs must be >= 1")
    if not held_out_round_ids:
        raise ValueError("targeted holdout requires at least one held-out round")

    selected_round_ids = discover_historical_eval_round_ids(paths, held_out_round_ids)
    all_analyzed_round_ids = discover_historical_eval_round_ids(paths)
    normalized_model_name = model_name.strip().lower()

    if mode not in {"prior_only", "online_interactive"}:
        raise ValueError(f"unsupported targeted holdout mode: {mode}")
    if mode == "prior_only" and normalized_model_name == "latent_regime":
        raise ValueError("latent_regime requires mode=online_interactive for targeted holdout")
    if mode == "online_interactive" and normalized_model_name == "static_semantic":
        raise ValueError("static_semantic is only supported in mode=prior_only")

    if mode == "online_interactive":
        missing_replays = [
            round_id
            for round_id in selected_round_ids
            if not paths.raw_dir.joinpath("replays", round_id).is_dir()
        ]
        if missing_replays:
            raise ValueError(
                "online_interactive targeted holdout requires replay-backed held-out rounds; "
                f"missing replay dirs for: {', '.join(missing_replays)}",
            )
        training_round_ids = tuple(
            round_id
            for round_id in _replay_backed_round_ids(paths, all_analyzed_round_ids)
            if round_id not in set(selected_round_ids)
        )
    else:
        training_round_ids = tuple(
            round_id for round_id in all_analyzed_round_ids if round_id not in set(selected_round_ids)
        )

    if len(training_round_ids) < 1:
        raise ValueError("targeted holdout requires at least one training round")
    if normalized_model_name == "historical_bucket_prior" and len(training_round_ids) < 1:
        raise ValueError("historical_bucket_prior targeted holdout requires analyzed training rounds")
    if is_query_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("query_residual targeted holdout requires replay-backed training rounds")
    if is_summary_bank_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("teacher_student_blend targeted holdout requires replay-backed training rounds")
    if is_evidence_field_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("evidence_field_blend targeted holdout requires replay-backed training rounds")
    if is_transcript_memory_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("transcript_memory targeted holdout requires replay-backed training rounds")
    if is_transcript_residual_memory_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("transcript_residual_memory targeted holdout requires replay-backed training rounds")
    if is_transcript_sequence_residual_memory_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("transcript_sequence_residual_memory targeted holdout requires replay-backed training rounds")
    if is_transcript_sequence_factor_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("transcript_sequence_factor_residual targeted holdout requires replay-backed training rounds")
    if is_round_transcript_residual_memory_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_transcript_residual_memory targeted holdout requires replay-backed training rounds")
    if is_round_transcript_factor_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_transcript_factor_residual targeted holdout requires replay-backed training rounds")
    if is_round_transcript_prototype_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_transcript_prototype_residual targeted holdout requires replay-backed training rounds")
    if is_round_heatmap_factor_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_heatmap_factor_residual targeted holdout requires replay-backed training rounds")
    if is_round_heatmap_residual_memory_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_heatmap_residual_memory targeted holdout requires replay-backed training rounds")
    if is_round_heatmap_prototype_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_heatmap_prototype_residual targeted holdout requires replay-backed training rounds")
    if is_round_heatmap_kernel_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_heatmap_kernel_residual targeted holdout requires replay-backed training rounds")
    if is_round_settlement_graph_factor_residual_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("round_settlement_graph_factor_residual targeted holdout requires replay-backed training rounds")
    if is_settlement_state_field_blend_model_name(normalized_model_name) and len(training_round_ids) < 1:
        raise ValueError("settlement_state_field_blend targeted holdout requires replay-backed training rounds")

    resolved_policy_name = (
        None if mode == "prior_only" else build_interactive_policy(policy_name).name
    )
    resolved_samples_per_round = (
        resolve_query_residual_samples_per_round(
            normalized_model_name,
            samples_per_round=samples_per_round,
        )
        if is_query_residual_model_name(normalized_model_name)
        else (
            resolve_summary_bank_variant_spec(
                normalized_model_name,
                samples_per_round=samples_per_round,
            ).samples_per_round
            if is_summary_bank_model_name(normalized_model_name)
            else (
                resolve_evidence_field_samples_per_round(
                    normalized_model_name,
                    samples_per_round=samples_per_round,
                )
                if is_evidence_field_model_name(normalized_model_name)
                else (
                    resolve_transcript_memory_samples_per_round(
                        normalized_model_name,
                        samples_per_round=samples_per_round,
                    )
                    if is_transcript_memory_model_name(normalized_model_name)
                    else (
                        resolve_transcript_residual_memory_samples_per_round(
                            normalized_model_name,
                            samples_per_round=samples_per_round,
                        )
                        if is_transcript_residual_memory_model_name(normalized_model_name)
                        else (
                            resolve_transcript_sequence_residual_memory_samples_per_round(
                                normalized_model_name,
                                samples_per_round=samples_per_round,
                            )
                            if is_transcript_sequence_residual_memory_model_name(normalized_model_name)
                            else (
                                resolve_transcript_sequence_factor_residual_samples_per_round(
                                    normalized_model_name,
                                    samples_per_round=samples_per_round,
                                )
                                if is_transcript_sequence_factor_residual_model_name(normalized_model_name)
                                else (
                                    resolve_round_transcript_residual_memory_samples_per_round(
                                        normalized_model_name,
                                        samples_per_round=samples_per_round,
                                    )
                                    if is_round_transcript_residual_memory_model_name(normalized_model_name)
                                    else (
                                        resolve_round_transcript_factor_residual_samples_per_round(
                                            normalized_model_name,
                                            samples_per_round=samples_per_round,
                                        )
                                        if is_round_transcript_factor_residual_model_name(normalized_model_name)
                                        else (
                                            resolve_round_transcript_prototype_residual_samples_per_round(
                                                normalized_model_name,
                                                samples_per_round=samples_per_round,
                                            )
                                            if is_round_transcript_prototype_residual_model_name(normalized_model_name)
                                            else (
                                                resolve_round_heatmap_factor_residual_samples_per_round(
                                                    normalized_model_name,
                                                    samples_per_round=samples_per_round,
                                                )
                                                if is_round_heatmap_factor_residual_model_name(normalized_model_name)
                                                else (
                                                    resolve_round_heatmap_residual_memory_samples_per_round(
                                                        normalized_model_name,
                                                        samples_per_round=samples_per_round,
                                                    )
                                                    if is_round_heatmap_residual_memory_model_name(normalized_model_name)
                                                    else (
                                                        resolve_round_heatmap_prototype_residual_samples_per_round(
                                                            normalized_model_name,
                                                            samples_per_round=samples_per_round,
                                                        )
                                                        if is_round_heatmap_prototype_residual_model_name(normalized_model_name)
                                                        else (
                                                            resolve_round_heatmap_kernel_residual_samples_per_round(
                                                                normalized_model_name,
                                                                samples_per_round=samples_per_round,
                                                            )
                                                            if is_round_heatmap_kernel_residual_model_name(normalized_model_name)
                                                            else (
                                                                resolve_round_settlement_graph_factor_residual_samples_per_round(
                                                                    normalized_model_name,
                                                                    samples_per_round=samples_per_round,
                                                                )
                                                                if is_round_settlement_graph_factor_residual_model_name(normalized_model_name)
                                                                else (
                                                                    resolve_settlement_state_field_blend_samples_per_round(
                                                                        normalized_model_name,
                                                                        samples_per_round=samples_per_round,
                                                                    )
                                                                    if is_settlement_state_field_blend_model_name(normalized_model_name)
                                                                    else None
                                                                )
                                                            )
                                                        )
                                                    )
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    )

    model_suffix = ""
    if is_query_residual_model_name(normalized_model_name) or is_summary_bank_model_name(
        normalized_model_name,
    ) or is_evidence_field_model_name(
        normalized_model_name,
    ) or is_transcript_memory_model_name(
        normalized_model_name,
    ) or is_transcript_residual_memory_model_name(
        normalized_model_name,
    ) or is_transcript_sequence_residual_memory_model_name(
        normalized_model_name,
    ) or is_transcript_sequence_factor_residual_model_name(
        normalized_model_name,
    ) or is_round_transcript_residual_memory_model_name(
        normalized_model_name,
    ) or is_round_transcript_factor_residual_model_name(
        normalized_model_name,
    ) or is_round_transcript_prototype_residual_model_name(
        normalized_model_name,
    ) or is_round_heatmap_factor_residual_model_name(
        normalized_model_name,
    ) or is_round_heatmap_residual_memory_model_name(
        normalized_model_name,
    ) or is_round_heatmap_prototype_residual_model_name(
        normalized_model_name,
    ) or is_round_heatmap_kernel_residual_model_name(
        normalized_model_name,
    ) or is_round_settlement_graph_factor_residual_model_name(
        normalized_model_name,
    ) or is_settlement_state_field_blend_model_name(
        normalized_model_name,
    ):
        model_suffix = f"__samples={resolved_samples_per_round}"
    interactive_suffix = ""
    if mode != "prior_only":
        interactive_suffix = (
            f"__policy={resolved_policy_name}"
            f"__budget={budget}"
            f"__episode_seed={episode_seed}"
        )
    run_name = benchmark_name or (
        f"targeted_holdout__{mode}__{model_name}"
        f"{model_suffix}"
        f"{interactive_suffix}"
        f"__heldout={len(selected_round_ids)}__train={len(training_round_ids)}"
    )

    benchmark_dir = paths.benchmark_dir() / run_name
    artifact_path = benchmark_dir / "result.json"
    report_path = benchmark_dir / "report.md"
    summary_jsonl_path = benchmark_dir / "summary.jsonl"
    summary_csv_path = benchmark_dir / "summary.csv"

    contexts_by_key: dict[tuple[str, int], ModelSeedEvaluationContext] = {}
    seed_results_by_key: dict[tuple[str, int], HistoricalBenchmarkSeedResult] = {}
    per_round_keys: dict[str, list[tuple[str, int]]] = {}
    round_evaluation_seconds: dict[str, float] = {}
    round_visualization_seconds: dict[str, float] = {}
    round_mean_scores: list[float] = []
    round_mean_weighted_kls: list[float] = []
    evaluated_by_round: dict[str, list[ModelSeedEvaluationContext]] = {}

    if jobs == 1 or len(selected_round_ids) <= 1:
        for held_out_round_id in selected_round_ids:
            round_id, contexts, evaluation_seconds = _evaluate_round_worker(
                root=str(paths.root),
                round_id=held_out_round_id,
                model_name=model_name,
                training_round_ids=training_round_ids,
                mode=mode,
                policy_name=policy_name if mode == "online_interactive" else None,
                samples_per_round=samples_per_round,
                budget=budget,
                episode_seed=episode_seed,
            )
            evaluated_by_round[round_id] = contexts
            round_evaluation_seconds[round_id] = evaluation_seconds
    else:
        max_workers = min(jobs, len(selected_round_ids))
        with ProcessPoolExecutor(
            max_workers=max_workers,
            mp_context=get_context("spawn"),
        ) as executor:
            futures = [
                executor.submit(
                    _evaluate_round_worker,
                    root=str(paths.root),
                    round_id=held_out_round_id,
                    model_name=model_name,
                    training_round_ids=training_round_ids,
                    mode=mode,
                    policy_name=policy_name if mode == "online_interactive" else None,
                    samples_per_round=samples_per_round,
                    budget=budget,
                    episode_seed=episode_seed,
                )
                for held_out_round_id in selected_round_ids
            ]
            for future in futures:
                round_id, contexts, evaluation_seconds = future.result()
                evaluated_by_round[round_id] = contexts
                round_evaluation_seconds[round_id] = evaluation_seconds

    for held_out_round_id in selected_round_ids:
        contexts = evaluated_by_round.get(held_out_round_id, [])
        if not contexts:
            continue
        keys: list[tuple[str, int]] = []
        for context in contexts:
            key = (context.round_id, context.seed_index)
            keys.append(key)
            contexts_by_key[key] = context
            seed_results_by_key[key] = context.to_seed_result()
        per_round_keys[held_out_round_id] = keys
        round_mean_scores.append(
            sum(seed_results_by_key[key].score for key in keys) / float(len(keys)),
        )
        round_mean_weighted_kls.append(
            sum(seed_results_by_key[key].weighted_kl for key in keys) / float(len(keys)),
        )

    if not seed_results_by_key:
        raise ValueError("targeted holdout produced no evaluated seeds")

    visualization_keys = _select_visualization_keys(
        list(seed_results_by_key.values()),
        policy=visualization_policy,
    )
    for round_id, seed_index in sorted(visualization_keys):
        context = contexts_by_key[(round_id, seed_index)]
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
                f"Targeted Holdout Round {context.round_number} "
                f"Seed {seed_index} {context.model_name}"
            ),
        )
        visualization_seconds = perf_counter() - visualization_started_at
        round_visualization_seconds[round_id] = (
            round_visualization_seconds.get(round_id, 0.0) + visualization_seconds
        )
        seed_results_by_key[(round_id, seed_index)] = seed_results_by_key[
            (round_id, seed_index)
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
        round_record = read_round_record(paths, round_id).round
        effective_round_weight = _effective_round_weight(
            round_number=round_record.round_number,
            round_weight=round_record.round_weight,
        )
        round_results.append(
            HistoricalBenchmarkRoundResult(
                round_id=round_id,
                round_number=round_seed_results[0].round_number,
                round_weight=effective_round_weight,
                policy_name=round_seed_results[0].policy_name,
                samples_per_round=round_seed_results[0].samples_per_round,
                budget=round_seed_results[0].budget,
                episode_seed=round_seed_results[0].episode_seed,
                executed_queries=round_seed_results[0].executed_queries,
                evaluated_seed_count=len(round_seed_results),
                visualized_seed_count=sum(
                    1 for item in round_seed_results if item.report_path is not None
                ),
                mean_score=sum(item.score for item in round_seed_results) / float(len(round_seed_results)),
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
    round_score_array = np.asarray([item.mean_score for item in round_results], dtype=np.float64)
    round_kl_array = np.asarray([item.mean_weighted_kl for item in round_results], dtype=np.float64)
    round_weight_array = np.asarray(
        [
            _effective_round_weight(
                round_number=item.round_number,
                round_weight=item.round_weight,
            )
            for item in round_results
        ],
        dtype=np.float64,
    )
    weight_denom = float(np.sum(round_weight_array))
    official_weighted_mean_score = (
        float(np.sum(round_weight_array * round_score_array) / weight_denom)
        if weight_denom > 0.0
        else None
    )
    official_weighted_mean_weighted_kl = (
        float(np.sum(round_weight_array * round_kl_array) / weight_denom)
        if weight_denom > 0.0
        else None
    )
    worst_round_result = min(round_results, key=lambda item: item.mean_score)
    result = HistoricalBenchmarkResult(
        benchmark_name=run_name,
        model_name=model_name,
        mode=mode,
        policy_name=resolved_policy_name,
        samples_per_round=resolved_samples_per_round,
        budget=None if mode == "prior_only" else budget,
        episode_seed=None if mode == "prior_only" else episode_seed,
        round_ids=[item.round_id for item in round_results],
        aggregate=aggregate,
        rounds=round_results,
        official_weighted_mean_score=official_weighted_mean_score,
        official_weighted_mean_weighted_kl=official_weighted_mean_weighted_kl,
        round_mean_score_std=float(np.std(round_score_array)) if len(round_score_array) > 0 else None,
        round_mean_weighted_kl_std=float(np.std(round_kl_array)) if len(round_kl_array) > 0 else None,
        worst_round_id=worst_round_result.round_id,
        worst_round_number=worst_round_result.round_number,
        worst_round_weight=worst_round_result.round_weight,
        worst_round_mean_score=worst_round_result.mean_score,
        worst_round_mean_weighted_kl=worst_round_result.mean_weighted_kl,
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
            event_kind="historical_targeted_holdout",
            spec_name=run_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "mode": mode,
                "held_out_round_count": len(result.rounds),
                "training_round_count": len(training_round_ids),
                "evaluated_seed_count": result.evaluated_seed_count,
                "visualized_seed_count": result.visualized_seed_count,
                "samples_per_round": result.samples_per_round,
                "mean_score": result.aggregate.mean_score,
                "mean_weighted_kl": result.aggregate.mean_weighted_kl,
                "official_weighted_mean_score": result.official_weighted_mean_score,
                "official_weighted_mean_weighted_kl": result.official_weighted_mean_weighted_kl,
                "round_mean_score_std": result.round_mean_score_std,
                "round_mean_weighted_kl_std": result.round_mean_weighted_kl_std,
                "worst_round_id": result.worst_round_id,
                "worst_round_mean_score": result.worst_round_mean_score,
                "worst_round_mean_weighted_kl": result.worst_round_mean_weighted_kl,
                "evaluation_seconds": result.evaluation_seconds,
                "visualization_seconds": result.visualization_seconds,
                "artifact_write_seconds": result.artifact_write_seconds,
                "total_runtime_seconds": result.total_runtime_seconds,
            },
        ),
    )
    return result


__all__ = ["run_targeted_holdout_benchmark"]
