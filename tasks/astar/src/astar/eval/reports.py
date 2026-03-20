from __future__ import annotations

from astar.eval.backtest import BacktestRoundResult
from astar.eval.competition import PairedBenchmarkComparison
from astar.eval.diagnostics import LocalDatasetDiagnostics, RoundEpisodeDiagnostics
from astar.eval.science import ScienceRoundReport
from astar.workflows.results import (
    EvaluateTeacherScienceResult,
    HistoricalBenchmarkComparison,
    HistoricalBenchmarkResult,
    SyntheticBenchmarkResult,
)


def render_round_episode_diagnostics(diagnostics: RoundEpisodeDiagnostics) -> str:
    lines = [
        f"episode #{diagnostics.summary.round_number} {diagnostics.summary.round_id}",
        f"status: {diagnostics.summary.status}",
        f"queries: {diagnostics.summary.query_count}",
        f"repeated_window_groups: {diagnostics.summary.repeated_window_groups}",
        f"submissions: {diagnostics.summary.submission_count}",
        f"analyses: {diagnostics.summary.analysis_count}",
        f"replay_runs: {diagnostics.summary.replay_run_count}",
        f"replay_seeds: {diagnostics.summary.replay_seed_count}",
        f"replay_summaries: {diagnostics.summary.replay_summary_count}",
    ]
    if diagnostics.mean_ground_truth_entropy is not None:
        lines.append(f"mean_ground_truth_entropy: {diagnostics.mean_ground_truth_entropy:.4f}")
    for item in diagnostics.per_seed:
        lines.append(
            f"seed {item.seed_index}: queries={item.query_count} "
            f"coverage_min={item.coverage_min} coverage_max={item.coverage_max} "
            f"repeats={item.repeated_window_groups}",
        )
    return "\n".join(lines)


def render_local_dataset_diagnostics(diagnostics: LocalDatasetDiagnostics) -> str:
    lines = [
        f"rounds: {len(diagnostics.round_ids)}",
        f"rounds_with_queries: {diagnostics.rounds_with_queries}",
        f"rounds_with_submissions: {diagnostics.rounds_with_submissions}",
        f"rounds_with_analyses: {diagnostics.rounds_with_analyses}",
        f"rounds_with_replays: {diagnostics.rounds_with_replays}",
        f"rounds_with_replay_summaries: {diagnostics.rounds_with_replay_summaries}",
        f"rounds_with_features: {diagnostics.rounds_with_features}",
        f"rounds_with_evidence: {diagnostics.rounds_with_evidence}",
        f"rounds_materialized: {diagnostics.rounds_materialized}",
        f"datasets: {diagnostics.dataset_count}",
        f"models: {diagnostics.model_count}",
        f"replay_manifolds: {diagnostics.replay_manifold_count}",
    ]
    if diagnostics.catalog is not None:
        lines.append(
            "catalog_events: "
            f"queries={diagnostics.catalog.query_event_count} "
            f"submissions={diagnostics.catalog.submission_event_count} "
            f"analyses={diagnostics.catalog.analysis_event_count} "
            f"replays={diagnostics.catalog.replay_event_count} "
            f"replay_summaries={diagnostics.catalog.replay_summary_event_count} "
            f"live_runs={diagnostics.catalog.live_run_event_count} "
            f"materialized={diagnostics.catalog.materialized_event_count}",
        )
    return "\n".join(lines)


def render_backtest_round_report(result: BacktestRoundResult) -> str:
    lines = [
        f"backtest-round {result.round_id}",
        f"mean_score: {result.mean_score:.4f}",
    ]
    for item in result.seed_results:
        lines.append(
            f"seed {item.seed_index}: score={item.score_breakdown.score:.4f} "
            f"weighted_kl={item.score_breakdown.weighted_kl:.6f}",
        )
    return "\n".join(lines)


def render_synthetic_benchmark_report(result: SyntheticBenchmarkResult) -> str:
    lines = [
        f"synthetic-benchmark {result.benchmark_name}",
        f"predictor: {result.predictor_name}",
        f"policy: {result.policy_name}",
        f"manifest: {result.manifest_path}",
        f"budget: {result.budget}",
        f"episodes: {result.aggregate.episode_count}",
        f"mean_score: {result.aggregate.mean_score:.4f}",
        f"mean_weighted_kl: {result.aggregate.mean_weighted_kl:.6f}",
        f"score_range: {result.aggregate.min_score:.4f}..{result.aggregate.max_score:.4f}",
    ]
    for item in result.episodes:
        lines.append(
            f"round={item.round_id} episode_seed={item.episode_seed} "
            f"score={item.mean_score:.4f} weighted_kl={item.mean_weighted_kl:.6f}",
        )
    return "\n".join(lines)


def render_historical_benchmark_report(result: HistoricalBenchmarkResult) -> str:
    lines = [
        f"historical-benchmark {result.benchmark_name}",
        f"model: {result.model_name}",
        f"mode: {result.mode}",
        f"policy: {result.policy_name or 'n/a'}",
        f"budget: {result.budget if result.budget is not None else 'n/a'}",
        f"episode_seed: {result.episode_seed if result.episode_seed is not None else 'n/a'}",
        f"rounds: {len(result.rounds)}",
        f"evaluated_seeds: {result.evaluated_seed_count}",
        f"visualization_policy: {result.visualization_policy}",
        f"visualized_seeds: {result.visualized_seed_count}",
        f"mean_score: {result.aggregate.mean_score:.4f}",
        f"mean_weighted_kl: {result.aggregate.mean_weighted_kl:.6f}",
        f"timing_total_s: {result.total_runtime_seconds:.3f}",
        f"timing_eval_s: {result.evaluation_seconds:.3f}",
        f"timing_viz_s: {result.visualization_seconds:.3f}",
        f"timing_write_s: {result.artifact_write_seconds:.3f}",
        (
            "round_mean_score_range: "
            f"{result.aggregate.min_score:.4f}..{result.aggregate.max_score:.4f}"
        ),
        f"artifact: {result.artifact_path}",
        f"report: {result.report_path}",
        f"summary_jsonl: {result.summary_jsonl_path}",
        f"summary_csv: {result.summary_csv_path}",
    ]
    for round_result in result.rounds:
        round_prefix = (
            f"#{round_result.round_number} {round_result.round_id}"
            if round_result.round_number is not None
            else round_result.round_id
        )
        executed_queries = (
            round_result.executed_queries
            if round_result.executed_queries is not None
            else "n/a"
        )
        lines.append(
            f"{round_prefix} seeds={round_result.evaluated_seed_count} "
            f"visualized={round_result.visualized_seed_count} "
            f"queries={executed_queries} "
            f"score={round_result.mean_score:.4f} kl={round_result.mean_weighted_kl:.6f} "
            f"eval_s={(round_result.evaluation_seconds or 0.0):.3f} "
            f"viz_s={round_result.visualization_seconds:.3f}",
        )
        for seed_result in round_result.seed_results:
            support = (
                "n/a"
                if seed_result.support_full_pct is None
                else (
                    "full="
                    f"{seed_result.support_full_pct:.3f} "
                    f"struct={seed_result.support_structural_pct:.3f} "
                    f"terrain={seed_result.support_terrain_pct:.3f} "
                    f"global={seed_result.support_global_pct:.3f}"
                )
            )
            lines.append(
                f"  seed={seed_result.seed_index} score={seed_result.score:.4f} "
                f"kl={seed_result.weighted_kl:.6f} support={support} "
                f"viz_s={(seed_result.visualization_seconds or 0.0):.3f}",
            )
    return "\n".join(lines)


def render_historical_benchmark_comparison_report(result: HistoricalBenchmarkComparison) -> str:
    lines = [
        "historical-benchmark-comparison",
        f"baseline: {result.baseline_model_name}",
        f"candidate: {result.candidate_model_name}",
        f"mode: {result.mode}",
        f"policy: {result.policy_name or 'n/a'}",
        f"budget: {result.budget if result.budget is not None else 'n/a'}",
        f"episode_seed: {result.episode_seed if result.episode_seed is not None else 'n/a'}",
        f"seeds: {result.seed_count}",
        f"mean_score_delta: {result.mean_score_delta:.4f}",
        f"mean_weighted_kl_delta: {result.mean_weighted_kl_delta:.6f}",
        f"win_rate: {result.win_rate:.3f}",
        f"loss_rate: {result.loss_rate:.3f}",
        f"tie_rate: {result.tie_rate:.3f}",
        f"score_delta_ci95: [{result.score_delta_ci_low:.4f}, {result.score_delta_ci_high:.4f}]",
    ]
    for item in result.seeds:
        lines.append(
            f"round={item.round_id} seed={item.seed_index} "
            f"delta={item.score_delta:.4f} kl_delta={item.weighted_kl_delta:.6f}",
        )
    return "\n".join(lines)


def render_paired_benchmark_comparison_report(result: PairedBenchmarkComparison) -> str:
    lines = [
        "paired-benchmark-comparison",
        f"baseline: {result.baseline_predictor_name}",
        f"candidate: {result.candidate_predictor_name}",
        f"policy: {result.policy_name}",
        f"episodes: {result.episode_count}",
        f"mean_score_delta: {result.mean_score_delta:.4f}",
        f"mean_weighted_kl_delta: {result.mean_weighted_kl_delta:.6f}",
        f"win_rate: {result.win_rate:.3f}",
        f"loss_rate: {result.loss_rate:.3f}",
        f"tie_rate: {result.tie_rate:.3f}",
        f"score_delta_ci95: [{result.score_delta_ci_low:.4f}, {result.score_delta_ci_high:.4f}]",
    ]
    for item in result.episodes:
        lines.append(
            f"round={item.round_id} episode_seed={item.episode_seed} "
            f"delta={item.score_delta:.4f} kl_delta={item.weighted_kl_delta:.6f}",
        )
    return "\n".join(lines)


def render_science_round_report(result: ScienceRoundReport) -> str:
    lines = [
        f"science-round {result.round_id}",
        f"teacher: {result.teacher_name}",
        f"regime_dim: {result.regime_dim}",
        f"mean_terminal_l1: {result.mean_terminal_l1:.6f}",
        f"mean_alive_curve_mae: {result.mean_alive_curve_mae:.6f}",
        f"mean_port_curve_mae: {result.mean_port_curve_mae:.6f}",
        f"mean_ruin_curve_mae: {result.mean_ruin_curve_mae:.6f}",
        f"mean_owner_flip_mae: {result.mean_owner_flip_mae:.6f}",
        f"mean_coefficient_l2: {result.mean_coefficient_l2:.6f}",
    ]
    for item in result.seed_reports:
        lines.append(
            f"seed={item.seed_index} terminal_l1={item.terminal_l1:.6f} "
            f"alive_mae={item.alive_curve_mae:.6f} port_mae={item.port_curve_mae:.6f} "
            f"ruin_mae={item.ruin_curve_mae:.6f} coeff_l2={item.coefficient_l2:.6f}",
        )
    return "\n".join(lines)


def render_teacher_science_report(result: EvaluateTeacherScienceResult) -> str:
    lines = [
        f"teacher-science {result.model_name}",
        f"train_rounds: {len(result.train_round_ids)}",
        f"eval_rounds: {len(result.eval_round_ids)}",
        f"reports: {result.report_count}",
        f"mean_terminal_l1: {result.mean_terminal_l1:.6f}",
        f"mean_alive_curve_mae: {result.mean_alive_curve_mae:.6f}",
        f"mean_port_curve_mae: {result.mean_port_curve_mae:.6f}",
        f"mean_ruin_curve_mae: {result.mean_ruin_curve_mae:.6f}",
        f"mean_owner_flip_mae: {result.mean_owner_flip_mae:.6f}",
        f"mean_coefficient_l2: {result.mean_coefficient_l2:.6f}",
    ]
    for item in result.reports:
        lines.append(
            f"round={item.round_id} terminal_l1={item.mean_terminal_l1:.6f} "
            f"alive_mae={item.mean_alive_curve_mae:.6f} "
            f"port_mae={item.mean_port_curve_mae:.6f} "
            f"ruin_mae={item.mean_ruin_curve_mae:.6f}",
        )
    return "\n".join(lines)
