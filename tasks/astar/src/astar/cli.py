from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

from astar.cli_output import (
    render_backtest_round,
    render_build_benchmark_manifests,
    render_build_submission,
    render_corpus_summary,
    render_dataset_diagnostics,
    render_dataset_ref,
    render_episode_diagnostics,
    render_factorize_round_summaries,
    render_fetch_analysis,
    render_fetch_round_analyses,
    render_harvest_replays,
    render_historical_benchmark_comparison,
    render_historical_benchmark,
    render_ingest_replays,
    render_inspect_replays,
    render_json,
    render_live_online_run,
    render_materialize_episode,
    render_paired_benchmark_comparison,
    render_query_plan_run,
    render_query_plan_summary,
    render_recorded_replay,
    render_recorded_simulation,
    render_round_list,
    render_round_report,
    render_round_summary,
    render_stored_round,
    render_submit_prediction,
    render_summarize_replays,
    render_sync_round,
    render_synthetic_benchmark,
    render_synthetic_tournament,
    render_teacher_science,
    render_train_historical_bucket_prior,
    render_train_hazard_teacher,
    render_train_summary_student,
    render_validation,
    render_visualization_report,
)
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.eval.backtest import backtest_round_from_saved_analyses
from astar.eval.diagnostics import build_local_dataset_diagnostics, build_round_episode_diagnostics
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.datasets.teacher_terminal import build_teacher_terminal_dataset
from astar.history.datasets.teacher_transition import build_teacher_transition_dataset
from astar.history.replay.ingest import ingest_replays
from astar.infra.api.auth import AuthConfig
from astar.infra.api.client import AstarApiClient, ClientConfig
from astar.infra.api.dto import ReplayRequest, SimulationRequest
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_prediction_tensor, read_round_record
from astar.observe.executor import execute_query_plan, record_simulation
from astar.observe.planner import build_policy_plan
from astar.observe.query_plan import read_any_query_plan
from astar.policy import build_interactive_policy, build_named_policy
from astar.splits.synthetic_benchmark import build_default_benchmark_manifests
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.compare_synthetic_benchmarks import compare_benchmark_artifacts
from astar.workflows.compare_historical_benchmarks import compare_historical_benchmark_artifacts
from astar.workflows.corpus_summary import summarize_learning_corpus
from astar.workflows.evaluate_teacher_science import evaluate_hazard_teacher_science
from astar.workflows.factorize_round_summaries import factorize_round_summaries
from astar.workflows.fetch_analysis import fetch_analysis
from astar.workflows.fetch_round_analyses import fetch_round_analyses
from astar.workflows.historical_benchmark import run_historical_benchmark
from astar.workflows.live_online import run_live_online_round
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.replay_capture import fetch_replay, harvest_replays
from astar.workflows.results import QueryPlanSummary
from astar.workflows.round_report import build_round_report
from astar.workflows.submissions import build_submission, submit_saved_prediction
from astar.workflows.summarize_replays import inspect_replays, summarize_round_replays
from astar.workflows.sync_round import sync_round
from astar.workflows.synthetic_benchmark import run_synthetic_benchmark
from astar.workflows.synthetic_tournament import run_synthetic_tournament
from astar.workflows.train_historical_bucket_prior import train_historical_bucket_prior
from astar.workflows.visualize_model_prediction import visualize_model_prediction
from astar.workflows.train_student import train_summary_bank_student
from astar.workflows.train_teacher import train_hazard_teacher
from astar.workflows.visualize_terminal_comparison import visualize_terminal_comparison


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="astar")
    parser.add_argument("--root", default=".", help="repo root")
    parser.add_argument("--json", action=argparse.BooleanOptionalAction, default=False)
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser("sync-round")
    sync_parser.add_argument("--round-id", required=True)

    rounds_parser = subparsers.add_parser("list-rounds")
    rounds_parser.add_argument(
        "--status",
        choices=["pending", "active", "scoring", "completed"],
        default=None,
    )

    subparsers.add_parser("active-round")

    show_parser = subparsers.add_parser("show-round")
    show_parser.add_argument("--round-id", required=True)

    plan_parser = subparsers.add_parser("plan-queries")
    plan_parser.add_argument("--round-id", required=True)
    plan_parser.add_argument("--policy", default="coverage")

    simulate_parser = subparsers.add_parser("simulate-once")
    simulate_parser.add_argument("--round-id", required=True)
    simulate_parser.add_argument("--seed-index", type=int, required=True)
    simulate_parser.add_argument("--viewport-x", type=int, required=True)
    simulate_parser.add_argument("--viewport-y", type=int, required=True)
    simulate_parser.add_argument("--viewport-w", type=int, default=15)
    simulate_parser.add_argument("--viewport-h", type=int, default=15)
    simulate_parser.add_argument("--config-hash", default="manual")

    replay_fetch_parser = subparsers.add_parser("fetch-replay")
    replay_fetch_parser.add_argument("--round-id", required=True)
    replay_fetch_parser.add_argument("--seed-index", type=int, required=True)

    replay_harvest_parser = subparsers.add_parser("harvest-replays")
    replay_harvest_parser.add_argument("--round-id", action="append", default=None)
    replay_harvest_parser.add_argument(
        "--status",
        action="append",
        choices=["pending", "active", "scoring", "completed"],
        default=None,
    )
    replay_harvest_parser.add_argument("--samples-per-seed", type=int, default=1)
    replay_harvest_parser.add_argument("--max-new-replays", type=int, default=None)
    replay_harvest_parser.add_argument("--replay-rate-limit-per-second", type=float, default=1.0)
    replay_harvest_parser.add_argument("--cooldown-seconds", type=float, default=30.0)
    replay_harvest_parser.add_argument("--random-delay-min-seconds", type=float, default=0.0)
    replay_harvest_parser.add_argument("--random-delay-max-seconds", type=float, default=0.0)

    run_parser = subparsers.add_parser("run-queries")
    run_parser.add_argument("--plan", required=True)
    run_parser.add_argument("--config-hash", default="manual")

    ingest_replays_parser = subparsers.add_parser("ingest-replays")
    ingest_replays_parser.add_argument("--round-id", default=None)

    inspect_replays_parser = subparsers.add_parser("inspect-replays")
    inspect_replays_parser.add_argument("--round-id", default=None)

    summarize_replays_parser = subparsers.add_parser("summarize-replays")
    summarize_replays_parser.add_argument("--round-id", required=True)

    build_parser_cmd = subparsers.add_parser("build-submission")
    build_parser_cmd.add_argument("--round-id", required=True)
    build_parser_cmd.add_argument(
        "--model",
        choices=["uniform", "static_semantic", "historical_bucket_prior"],
        required=True,
    )

    validate_parser = subparsers.add_parser("validate-submission")
    validate_parser.add_argument("--round-id", required=True)
    validate_parser.add_argument("--seed-index", type=int, required=True)

    submit_parser = subparsers.add_parser("submit")
    submit_parser.add_argument("--round-id", required=True)
    submit_parser.add_argument("--seed-index", type=int, required=True)

    analysis_parser = subparsers.add_parser("fetch-analysis")
    analysis_parser.add_argument("--round-id", required=True)
    analysis_parser.add_argument("--seed-index", type=int, required=True)

    report_parser = subparsers.add_parser("round-report")
    report_parser.add_argument("--round-id", required=True)
    report_parser.add_argument("--seed-index", type=int, required=True)

    terminal_comparison_parser = subparsers.add_parser("visualize-terminal-comparison")
    terminal_comparison_parser.add_argument("--round-id", required=True)
    terminal_comparison_parser.add_argument("--seed-index", type=int, required=True)

    model_prediction_parser = subparsers.add_parser("visualize-model-prediction")
    model_prediction_parser.add_argument("--round-id", required=True)
    model_prediction_parser.add_argument("--seed-index", type=int, required=True)
    model_prediction_parser.add_argument(
        "--model",
        required=True,
    )

    fetch_round_analyses_parser = subparsers.add_parser("fetch-round-analyses")
    fetch_round_analyses_parser.add_argument("--round-id", required=True)

    episode_summary_parser = subparsers.add_parser("episode-summary")
    episode_summary_parser.add_argument("--round-id", required=True)

    materialize_episode_parser = subparsers.add_parser("materialize-episode")
    materialize_episode_parser.add_argument("--round-id", required=True)

    factorize_rounds_parser = subparsers.add_parser("factorize-round-summaries")
    factorize_rounds_parser.add_argument("--round-id", action="append", default=None)
    factorize_rounds_parser.add_argument("--max-rank", type=int, default=3)

    teacher_transition_parser = subparsers.add_parser("build-teacher-transition-dataset")
    teacher_transition_parser.add_argument("--round-id", action="append", default=None)

    teacher_terminal_parser = subparsers.add_parser("build-teacher-terminal-dataset")
    teacher_terminal_parser.add_argument("--round-id", action="append", default=None)

    train_historical_bucket_parser = subparsers.add_parser("train-historical-bucket-prior")
    train_historical_bucket_parser.add_argument("--round-id", action="append", default=None)
    train_historical_bucket_parser.add_argument("--exclude-round-id", action="append", default=None)
    train_historical_bucket_parser.add_argument("--model-name", default="historical_bucket_prior_v1")

    synthetic_live_parser = subparsers.add_parser("build-synthetic-live-dataset")
    synthetic_live_parser.add_argument("--round-id", action="append", default=None)
    synthetic_live_parser.add_argument("--policy", default="coverage")
    synthetic_live_parser.add_argument("--samples-per-round", type=int, default=1)

    synthetic_tournament_parser = subparsers.add_parser("run-synthetic-tournament")
    synthetic_tournament_parser.add_argument("--round-id", required=True)
    synthetic_tournament_parser.add_argument(
        "--model",
        default="latent_regime",
    )
    synthetic_tournament_parser.add_argument("--policy", default="coverage")
    synthetic_tournament_parser.add_argument("--samples-per-round", type=int, default=1)
    synthetic_tournament_parser.add_argument("--budget", type=int, default=50)
    synthetic_tournament_parser.add_argument("--episode-seed", type=int, default=0)

    synthetic_benchmark_parser = subparsers.add_parser("run-synthetic-benchmark")
    synthetic_benchmark_parser.add_argument("--round-id", action="append", default=None)
    synthetic_benchmark_parser.add_argument("--manifest", default=None)
    synthetic_benchmark_parser.add_argument(
        "--model",
        default="latent_regime",
    )
    synthetic_benchmark_parser.add_argument("--policy", default="coverage")
    synthetic_benchmark_parser.add_argument("--samples-per-round", type=int, default=1)
    synthetic_benchmark_parser.add_argument("--budget", type=int, default=50)
    synthetic_benchmark_parser.add_argument(
        "--episode-seed",
        action="append",
        type=int,
        default=None,
    )

    historical_benchmark_parser = subparsers.add_parser("run-historical-benchmark")
    historical_benchmark_parser.add_argument(
        "--model",
        required=True,
    )
    historical_benchmark_parser.add_argument(
        "--mode",
        choices=["prior_only", "online_interactive"],
        default="prior_only",
    )
    historical_benchmark_parser.add_argument("--round-id", action="append", default=None)
    historical_benchmark_parser.add_argument("--policy", default="coverage")
    historical_benchmark_parser.add_argument("--samples-per-round", type=int, default=1)
    historical_benchmark_parser.add_argument("--budget", type=int, default=50)
    historical_benchmark_parser.add_argument("--episode-seed", type=int, default=0)
    historical_benchmark_parser.add_argument("--episode-seed-count", type=int, default=1)
    historical_benchmark_parser.add_argument("--jobs", type=int, default=1)
    historical_benchmark_parser.add_argument(
        "--with-png",
        choices=["none", "top", "all"],
        default="top",
    )
    historical_benchmark_parser.add_argument("--name", default=None)

    compare_historical_parser = subparsers.add_parser("compare-historical-benchmarks")
    compare_historical_parser.add_argument("--baseline", required=True)
    compare_historical_parser.add_argument("--candidate", required=True)
    compare_historical_parser.add_argument("--bootstrap-samples", type=int, default=500)

    live_online_parser = subparsers.add_parser("run-live-online")
    live_online_parser.add_argument("--round-id", "--round", dest="round_id", default=None)
    live_online_parser.add_argument(
        "--model",
        default="latent_regime",
    )
    live_online_parser.add_argument("--policy", default="coverage")
    live_online_parser.add_argument("--samples-per-round", type=int, default=1)
    live_online_parser.add_argument(
        "--budget",
        type=int,
        default=50,
        help="new live queries to spend this run; use 0 to load saved local raw queries only",
    )
    live_online_parser.add_argument(
        "--allow-empty-queries",
        action="store_true",
        help="allow --budget 0 even with no saved raw queries; predicts from prior only",
    )
    live_online_parser.add_argument(
        "--submit-predictions",
        action=argparse.BooleanOptionalAction,
        default=True,
    )

    subparsers.add_parser("build-benchmark-manifests")

    compare_benchmarks_parser = subparsers.add_parser("compare-synthetic-benchmarks")
    compare_benchmarks_parser.add_argument("--baseline", required=True)
    compare_benchmarks_parser.add_argument("--candidate", required=True)
    compare_benchmarks_parser.add_argument("--bootstrap-samples", type=int, default=500)

    train_teacher_parser = subparsers.add_parser("train-hazard-teacher")
    train_teacher_parser.add_argument("--round-id", action="append", default=None)
    train_teacher_parser.add_argument("--model-name", default="hazard_teacher_v1")

    train_student_parser = subparsers.add_parser("train-summary-student")
    train_student_parser.add_argument("--dataset-name", default="synthetic_live_v1")
    train_student_parser.add_argument("--policy", default="coverage")
    train_student_parser.add_argument("--samples-per-round", type=int, default=1)
    train_student_parser.add_argument("--k-neighbors", type=int, default=5)
    train_student_parser.add_argument("--model-name", default="summary_bank_student_v1")

    science_parser = subparsers.add_parser("evaluate-teacher-science")
    science_parser.add_argument("--eval-round-id", action="append", default=None)
    science_parser.add_argument("--train-round-id", action="append", default=None)
    science_parser.add_argument("--model-name", default="hazard_teacher_v1")
    science_parser.add_argument("--n-rollouts", type=int, default=None)

    backtest_round_parser = subparsers.add_parser("backtest-round")
    backtest_round_parser.add_argument("--round-id", required=True)

    subparsers.add_parser("dataset-summary")
    subparsers.add_parser("corpus-summary")

    return parser


def _emit(json_mode: bool, payload: object, text: str) -> None:
    if json_mode:
        print(render_json(payload))
        return
    print(text)


def _format_http_error(exc: httpx.HTTPStatusError) -> str:
    response = exc.response
    detail = ""
    try:
        payload = response.json()
        if isinstance(payload, dict) and "detail" in payload:
            detail = str(payload["detail"])
    except ValueError:
        detail = response.text.strip()
    if not detail:
        detail = response.text.strip()
    status = f"http {response.status_code}"
    if detail:
        return f"{status}: {detail}"
    return status


def _build_query_plan_summary(plan_path: Path, policy: str, round_id: str) -> QueryPlanSummary:
    plan = read_any_query_plan(plan_path)
    seed_query_counts: dict[int, int] = {}
    diagnostic_query_count = 0
    total_queries = 0
    for item in plan.items:
        seed_query_counts[item.seed_index] = (
            seed_query_counts.get(item.seed_index, 0) + item.repeats
        )
        total_queries += item.repeats
        if item.tag == "diagnostic_repeat":
            diagnostic_query_count += item.repeats
    return QueryPlanSummary(
        round_id=round_id,
        policy_name=policy,
        item_count=len(plan.items),
        total_queries=total_queries,
        diagnostic_query_count=diagnostic_query_count,
        seed_query_counts=seed_query_counts,
        plan_path=plan_path,
    )


def _main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    paths = WorkspacePaths.from_root(args.root)
    paths.ensure_layout()
    load_env_file(paths.root / ".env")

    if args.command in {"list-rounds", "active-round"}:
        client = AstarApiClient(ClientConfig.from_env(), AuthConfig.from_env())
        if args.command == "list-rounds":
            rounds = client.list_rounds()
            if args.status is not None:
                rounds = [item for item in rounds if item.status == args.status]
            _emit(args.json, rounds, render_round_list(rounds))
            return 0
        active_round = client.get_active_round()
        _emit(args.json, active_round, render_round_summary(active_round))
        return 0

    if args.command == "show-round":
        record = read_round_record(paths, args.round_id)
        _emit(
            args.json,
            record,
            render_stored_round(record, paths.raw_round_path(args.round_id)),
        )
        return 0

    if args.command == "ingest-replays":
        ingest_result = ingest_replays(paths, args.round_id)
        _emit(args.json, ingest_result, render_ingest_replays(ingest_result))
        return 0

    if args.command == "inspect-replays":
        inspection_result = inspect_replays(paths, args.round_id)
        _emit(args.json, inspection_result, render_inspect_replays(inspection_result))
        return 0

    if args.command == "summarize-replays":
        summarize_result = summarize_round_replays(paths, args.round_id)
        _emit(args.json, summarize_result, render_summarize_replays(summarize_result))
        return 0

    if args.command == "build-submission":
        build_result = build_submission(paths, args.round_id, args.model)
        _emit(args.json, build_result, render_build_submission(build_result))
        return 0

    if args.command == "validate-submission":
        record = read_round_record(paths, args.round_id)
        tensor_path = paths.prediction_tensor_path(args.round_id, args.seed_index)
        tensor = load_prediction_tensor(
            tensor_path,
        )
        report = validate_prediction_tensor(
            tensor,
            SubmissionSpec(height=record.round.map_height, width=record.round.map_width),
        )
        _emit(
            args.json,
            report,
            render_validation(args.round_id, args.seed_index, tensor_path, report),
        )
        return 0

    if args.command == "round-report":
        artifacts = build_round_report(paths, args.round_id, args.seed_index)
        _emit(args.json, artifacts, render_round_report(artifacts))
        return 0

    if args.command == "episode-summary":
        episode_diagnostics = build_round_episode_diagnostics(paths, args.round_id)
        _emit(args.json, episode_diagnostics, render_episode_diagnostics(episode_diagnostics))
        return 0

    if args.command == "materialize-episode":
        materialized = materialize_round_episode(paths, args.round_id)
        _emit(args.json, materialized, render_materialize_episode(materialized))
        return 0

    if args.command == "factorize-round-summaries":
        factorized = factorize_round_summaries(
            paths,
            round_ids=args.round_id,
            max_rank=args.max_rank,
        )
        _emit(args.json, factorized, render_factorize_round_summaries(factorized))
        return 0

    if args.command == "build-teacher-transition-dataset":
        dataset = build_teacher_transition_dataset(paths, round_ids=args.round_id)
        _emit(args.json, dataset, render_dataset_ref(dataset))
        return 0

    if args.command == "build-teacher-terminal-dataset":
        dataset = build_teacher_terminal_dataset(paths, round_ids=args.round_id)
        _emit(args.json, dataset, render_dataset_ref(dataset))
        return 0

    if args.command == "train-historical-bucket-prior":
        bucket_result = train_historical_bucket_prior(
            paths,
            round_ids=args.round_id,
            exclude_round_ids=args.exclude_round_id,
            model_name=args.model_name,
        )
        _emit(
            args.json,
            bucket_result,
            render_train_historical_bucket_prior(bucket_result),
        )
        return 0

    if args.command == "build-synthetic-live-dataset":
        dataset = build_synthetic_live_dataset(
            paths,
            policy_name=args.policy,
            round_ids=args.round_id,
            samples_per_round=args.samples_per_round,
            dataset_name=f"synthetic_live_{args.policy}_v1",
        )
        _emit(args.json, dataset, render_dataset_ref(dataset))
        return 0

    if args.command == "train-hazard-teacher":
        teacher_result = train_hazard_teacher(
            paths,
            round_ids=args.round_id,
            model_name=args.model_name,
        )
        _emit(
            args.json,
            teacher_result,
            render_train_hazard_teacher(teacher_result),
        )
        return 0

    if args.command == "train-summary-student":
        student_result = train_summary_bank_student(
            paths,
            dataset_name=args.dataset_name,
            policy_name=args.policy,
            samples_per_round=args.samples_per_round,
            k_neighbors=args.k_neighbors,
            model_name=args.model_name,
        )
        _emit(
            args.json,
            student_result,
            render_train_summary_student(student_result),
        )
        return 0

    if args.command == "evaluate-teacher-science":
        science_result = evaluate_hazard_teacher_science(
            paths,
            eval_round_ids=args.eval_round_id,
            train_round_ids=args.train_round_id,
            model_name=args.model_name,
            n_rollouts=args.n_rollouts,
        )
        _emit(args.json, science_result, render_teacher_science(science_result))
        return 0

    if args.command == "run-synthetic-tournament":
        predictor = build_online_predictor(
            args.model,
            paths=paths,
            policy_name=args.policy,
            samples_per_round=args.samples_per_round,
        )
        tournament_result = run_synthetic_tournament(
            paths,
            round_id=args.round_id,
            predictor=predictor,
            policy=build_interactive_policy(args.policy, predictor=predictor),
            budget=args.budget,
            episode_seed=args.episode_seed,
        )
        _emit(
            args.json,
            tournament_result,
            render_synthetic_tournament(tournament_result),
        )
        return 0

    if args.command == "run-synthetic-benchmark":
        predictor = build_online_predictor(
            args.model,
            paths=paths,
            policy_name=args.policy,
            samples_per_round=args.samples_per_round,
        )
        benchmark_result = run_synthetic_benchmark(
            paths,
            predictor=predictor,
            policy=build_interactive_policy(args.policy, predictor=predictor),
            manifest_path=(Path(args.manifest) if args.manifest is not None else None),
            round_ids=args.round_id,
            episode_seeds=args.episode_seed,
            budget=args.budget,
        )
        _emit(
            args.json,
            benchmark_result,
            render_synthetic_benchmark(benchmark_result),
        )
        return 0

    if args.command == "run-historical-benchmark":
        benchmark_result = run_historical_benchmark(
            paths,
            model_name=args.model,
            round_ids=args.round_id,
            mode=args.mode,
            policy_name=args.policy,
            samples_per_round=args.samples_per_round,
            budget=args.budget,
            episode_seed=args.episode_seed,
            episode_seed_count=args.episode_seed_count,
            jobs=args.jobs,
            visualization_policy=args.with_png,
            benchmark_name=args.name,
        )
        _emit(
            args.json,
            benchmark_result,
            render_historical_benchmark(benchmark_result),
        )
        return 0

    if args.command == "compare-historical-benchmarks":
        comparison_result = compare_historical_benchmark_artifacts(
            paths,
            baseline_path=Path(args.baseline),
            candidate_path=Path(args.candidate),
            n_bootstrap=args.bootstrap_samples,
        )
        _emit(
            args.json,
            comparison_result,
            render_historical_benchmark_comparison(comparison_result),
        )
        return 0

    if args.command == "build-benchmark-manifests":
        manifest_result = build_default_benchmark_manifests(paths)
        _emit(
            args.json,
            manifest_result,
            render_build_benchmark_manifests(manifest_result),
        )
        return 0

    if args.command == "compare-synthetic-benchmarks":
        comparison_result = compare_benchmark_artifacts(
            paths,
            baseline_path=Path(args.baseline),
            candidate_path=Path(args.candidate),
            n_bootstrap=args.bootstrap_samples,
        )
        _emit(
            args.json,
            comparison_result,
            render_paired_benchmark_comparison(comparison_result),
        )
        return 0

    if args.command == "dataset-summary":
        dataset_diagnostics = build_local_dataset_diagnostics(paths)
        _emit(args.json, dataset_diagnostics, render_dataset_diagnostics(dataset_diagnostics))
        return 0

    if args.command == "corpus-summary":
        corpus_summary = summarize_learning_corpus(paths)
        _emit(args.json, corpus_summary, render_corpus_summary(corpus_summary))
        return 0

    if args.command == "backtest-round":
        backtest_result = backtest_round_from_saved_analyses(paths, args.round_id)
        _emit(args.json, backtest_result, render_backtest_round(backtest_result))
        return 0

    client_config = ClientConfig.from_env()
    if args.command == "harvest-replays":
        client_config = client_config.model_copy(
            update={"replay_rate_limit_per_second": args.replay_rate_limit_per_second},
        )
    client = AstarApiClient(client_config, AuthConfig.from_env())

    if args.command == "run-live-online":
        round_id = args.round_id
        if round_id is None:
            round_id = client.get_active_round().id
        predictor = build_online_predictor(
            args.model,
            paths=paths,
            policy_name=args.policy,
            samples_per_round=args.samples_per_round,
        )
        live_online_result = run_live_online_round(
            paths,
            client,
            round_id=round_id,
            predictor=predictor,
            policy=build_interactive_policy(args.policy, predictor=predictor),
            budget=args.budget,
            allow_empty_queries=args.allow_empty_queries,
            submit_predictions=args.submit_predictions,
        )
        _emit(args.json, live_online_result, render_live_online_run(live_online_result))
        return 0

    if args.command == "fetch-round-analyses":
        analyses_result = fetch_round_analyses(paths, client, args.round_id)
        _emit(args.json, analyses_result, render_fetch_round_analyses(analyses_result))
        return 0

    if args.command == "sync-round":
        sync_result = sync_round(paths, client, args.round_id)
        _emit(args.json, sync_result, render_sync_round(sync_result))
        return 0

    if args.command == "plan-queries":
        record = read_round_record(paths, args.round_id)
        policy = build_named_policy(args.policy)
        planned = build_policy_plan(
            policy,
            record.round,
            paths.artifacts_dir / "runs" / f"round_id={args.round_id}_policy={args.policy}.json",
        )
        plan_result = _build_query_plan_summary(
            planned.plan_path,
            planned.policy_name,
            args.round_id,
        )
        _emit(args.json, plan_result, render_query_plan_summary(plan_result))
        return 0

    if args.command == "simulate-once":
        simulation_result = record_simulation(
            paths,
            client,
            SimulationRequest(
                round_id=args.round_id,
                seed_index=args.seed_index,
                viewport_x=args.viewport_x,
                viewport_y=args.viewport_y,
                viewport_w=args.viewport_w,
                viewport_h=args.viewport_h,
            ),
            config_hash=args.config_hash,
        )
        _emit(args.json, simulation_result, render_recorded_simulation(simulation_result))
        return 0

    if args.command == "fetch-replay":
        recorded_replay = fetch_replay(
            paths,
            client,
            ReplayRequest(round_id=args.round_id, seed_index=args.seed_index),
        )
        _emit(args.json, recorded_replay, render_recorded_replay(recorded_replay))
        return 0

    if args.command == "harvest-replays":
        statuses = None if args.status is None else set(args.status)
        progress = None
        if not args.json:

            def _print_progress(message: str) -> None:
                print(message, file=sys.stderr, flush=True)

            progress = _print_progress
        harvest_result = harvest_replays(
            paths,
            client,
            round_ids=args.round_id,
            statuses=statuses,
            samples_per_seed=args.samples_per_seed,
            max_new_replays=args.max_new_replays,
            cooldown_seconds=args.cooldown_seconds,
            random_delay_min_seconds=args.random_delay_min_seconds,
            random_delay_max_seconds=args.random_delay_max_seconds,
            progress=progress,
        )
        _emit(args.json, harvest_result, render_harvest_replays(harvest_result))
        return 0

    if args.command == "run-queries":
        plan = read_any_query_plan(Path(args.plan))
        query_run_result = execute_query_plan(paths, client, plan, config_hash=args.config_hash)
        _emit(args.json, query_run_result, render_query_plan_run(query_run_result))
        return 0

    if args.command == "submit":
        submit_result = submit_saved_prediction(paths, client, args.round_id, args.seed_index)
        _emit(args.json, submit_result, render_submit_prediction(submit_result))
        return 0

    if args.command == "fetch-analysis":
        analysis_result = fetch_analysis(paths, client, args.round_id, args.seed_index)
        _emit(args.json, analysis_result, render_fetch_analysis(analysis_result))
        return 0

    if args.command == "visualize-terminal-comparison":
        artifacts = visualize_terminal_comparison(
            paths,
            args.round_id,
            args.seed_index,
            client=client,
        )
        _emit(args.json, artifacts, render_visualization_report(artifacts))
        return 0

    if args.command == "visualize-model-prediction":
        artifacts = visualize_model_prediction(
            paths,
            args.round_id,
            args.seed_index,
            args.model,
            client=client,
        )
        _emit(args.json, artifacts, render_visualization_report(artifacts))
        return 0

    raise ValueError(f"unsupported command: {args.command}")


def main() -> int:
    try:
        return _main()
    except httpx.HTTPStatusError as exc:
        print(_format_http_error(exc), file=sys.stderr)
        return 1
    except (ValueError, FileNotFoundError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
