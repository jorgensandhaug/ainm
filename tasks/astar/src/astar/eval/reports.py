from __future__ import annotations

from astar.eval.backtest import BacktestRoundResult
from astar.eval.diagnostics import LocalDatasetDiagnostics, RoundEpisodeDiagnostics


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
