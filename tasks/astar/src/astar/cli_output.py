from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from astar.core.validation import SubmissionValidationReport
from astar.eval.backtest import BacktestRoundResult
from astar.eval.competition import PairedBenchmarkComparison
from astar.eval.diagnostics import LocalDatasetDiagnostics, RoundEpisodeDiagnostics
from astar.eval.reports import (
    render_backtest_round_report,
    render_local_dataset_diagnostics,
    render_round_episode_diagnostics,
)
from astar.history.datasets.base import DatasetRef, SyntheticEpisodeDatasetRef
from astar.history.replay.ingest import IngestReplaysResult
from astar.infra.api.dto import RoundSummary, StoredRoundRecord
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.results import QueryPlanRunResult, RecordedSimulationResult
from astar.splits.synthetic_benchmark import BuildBenchmarkManifestsResult
from astar.student.predictor.heuristic import RoundRegimePosterior
from astar.workflows.corpus_summary import CorpusSummaryResult
from astar.workflows.factorize_round_summaries import FactorizeRoundSummariesResult
from astar.workflows.live_online import LiveOnlineRunResult
from astar.workflows.replay_eda import ReplayEdaResult
from astar.workflows.results import (
    BuildSubmissionResult,
    EvaluateDynamicLawSummaryResult,
    EvaluateTeacherScienceResult,
    FetchAnalysisResult,
    FetchRoundAnalysesResult,
    HarvestReplaysResult,
    HistoricalBenchmarkComparison,
    HistoricalBenchmarkResult,
    InspectReplaysResult,
    MaterializeEpisodeResult,
    QueryPlanSummary,
    RecordedReplayResult,
    RoundReportArtifacts,
    SubmitPredictionResult,
    SummarizeReplaysResult,
    SyncRoundResult,
    SyntheticBenchmarkResult,
    SyntheticTournamentResult,
    TrainHazardTeacherResult,
    TrainHistoricalBucketPriorResult,
    TrainSummaryStudentResult,
    VisualizationReportResult,
)


def _format_datetime(value: datetime | None) -> str:
    if value is None:
        return "n/a"
    return value.isoformat()


def _jsonable(value: object) -> Any:
    return to_jsonable(value)


def render_json(value: object) -> str:
    return json.dumps(_jsonable(value), indent=2)


def render_round_list(rounds: list[RoundSummary]) -> str:
    if not rounds:
        return "no rounds"
    lines = [f"rounds: {len(rounds)}"]
    for item in rounds:
        lines.append(
            " ".join(
                [
                    f"#{item.round_number}",
                    item.status,
                    item.id,
                    f"{item.map_height}x{item.map_width}",
                    f"window={item.prediction_window_minutes}m",
                    f"closes={item.closes_at.isoformat()}",
                    f"weight={item.round_weight}",
                ]
            ),
        )
    return "\n".join(lines)


def render_round_summary(round_summary: RoundSummary) -> str:
    return "\n".join(
        [
            f"active-round #{round_summary.round_number} {round_summary.id}",
            f"status: {round_summary.status}",
            f"map: {round_summary.map_height}x{round_summary.map_width}",
            f"window: {round_summary.prediction_window_minutes}m",
            f"started_at: {round_summary.started_at.isoformat()}",
            f"closes_at: {round_summary.closes_at.isoformat()}",
            f"round_weight: {round_summary.round_weight}",
        ],
    )


def render_dataset_ref(dataset: DatasetRef) -> str:
    lines = [
        f"{dataset.dataset_kind} {dataset.dataset_name}",
        f"rounds: {dataset.round_count}",
        f"rows: {dataset.row_count}",
        f"dir: {dataset.dataset_dir}",
        f"summary: {dataset.summary_path}",
    ]
    if dataset.index_path is not None:
        lines.append(f"index: {dataset.index_path}")
    if isinstance(dataset, SyntheticEpisodeDatasetRef):
        lines.append(f"policy: {dataset.policy_name}")
        lines.append(f"episodes: {dataset.episode_count}")
        lines.append(f"total_queries: {dataset.total_query_count}")
        lines.append(f"samples_per_round: {dataset.samples_per_round}")
    return "\n".join(lines)


def render_sync_round(result: SyncRoundResult) -> str:
    return "\n".join(
        [
            f"sync-round #{result.round_number} {result.round_id}",
            f"status: {result.status}",
            f"map: {result.map_height}x{result.map_width}",
            f"seeds: {result.seeds_count}",
            f"closes_at: {_format_datetime(result.closes_at)}",
            f"raw_round: {result.round_path}",
        ],
    )


def render_stored_round(record: StoredRoundRecord, path: Path) -> str:
    lines = [
        f"show-round #{record.round.round_number} {record.round.id}",
        f"status: {record.round.status}",
        f"fetched_at: {_format_datetime(record.fetched_at)}",
        f"map: {record.round.map_height}x{record.round.map_width}",
        f"seeds: {record.round.seeds_count}",
        f"started_at: {_format_datetime(record.round.started_at)}",
        f"closes_at: {_format_datetime(record.round.closes_at)}",
    ]
    if record.round.round_weight is not None:
        lines.append(f"round_weight: {record.round.round_weight}")
    for seed_index, initial_state in enumerate(record.round.initial_states):
        settlement_count = len(initial_state.settlements)
        port_count = sum(1 for item in initial_state.settlements if item.has_port)
        alive_count = sum(1 for item in initial_state.settlements if item.alive)
        lines.append(
            f"seed {seed_index}: settlements={settlement_count} "
            f"ports={port_count} alive={alive_count}",
        )
    lines.append(f"raw_round: {path}")
    return "\n".join(lines)


def render_query_plan_summary(result: QueryPlanSummary) -> str:
    seed_counts = ", ".join(
        f"seed {seed_index}={count}"
        for seed_index, count in sorted(result.seed_query_counts.items())
    )
    return "\n".join(
        [
            f"plan-queries {result.policy_name} {result.round_id}",
            f"items: {result.item_count}",
            f"total_queries: {result.total_queries}",
            f"diagnostic_queries: {result.diagnostic_query_count}",
            f"per_seed: {seed_counts}",
            f"plan_path: {result.plan_path}",
        ],
    )


def render_recorded_simulation(result: RecordedSimulationResult) -> str:
    viewport = result.viewport
    return "\n".join(
        [
            f"simulate-once {result.round_id} seed={result.seed_index}",
            f"viewport: x={viewport.x} y={viewport.y} w={viewport.w} h={viewport.h}",
            f"observed_grid: {result.observed_height}x{result.observed_width}",
            f"settlements_logged: {result.settlements_logged}",
            f"budget: {result.queries_used}/{result.queries_max}",
            f"raw_query: {result.path}",
        ],
    )


def render_recorded_replay(result: RecordedReplayResult) -> str:
    return "\n".join(
        [
            f"fetch-replay {result.round_id} seed={result.seed_index}",
            f"sim_seed: {result.sim_seed}",
            f"frames: {result.frame_count}",
            f"settlement_observations: {result.settlement_observation_count}",
            f"raw_replay: {result.path}",
        ],
    )


def render_query_plan_run(result: QueryPlanRunResult) -> str:
    return "\n".join(
        [
            f"run-queries {result.policy_name} {result.round_id}",
            f"planned: {result.total_planned_queries}",
            f"executed: {result.executed_queries}",
            f"reused: {result.reused_queries}",
            f"query_dir: {result.query_dir}",
        ],
    )


def render_harvest_replays(result: HarvestReplaysResult) -> str:
    lines = [
        "harvest-replays",
        f"rounds: {result.rounds_considered}",
        f"seeds: {result.seeds_considered}",
        f"existing_replays: {result.existing_replays}",
        f"captured_replays: {result.captured_replays}",
        f"total_replays: {result.total_replays}",
        f"rate_limit_cooldowns: {result.rate_limit_cooldowns}",
        f"replay_root: {result.replay_root}",
    ]
    for item in result.seed_summaries:
        lines.append(
            " ".join(
                [
                    f"round={item.round_id}",
                    f"seed={item.seed_index}",
                    f"existing={item.existing_before}",
                    f"captured={item.captured}",
                    f"total={item.total_after}",
                    f"dir={item.replay_dir}",
                ],
            ),
        )
    return "\n".join(lines)


def render_ingest_replays(result: IngestReplaysResult) -> str:
    lines = [
        "ingest-replays",
        f"rounds: {result.rounds_considered}",
        f"replay_runs: {result.replay_run_count}",
    ]
    for item in result.per_seed:
        lines.append(
            f"round={item.round_id} seed={item.seed_index} runs={item.replay_run_count}",
        )
    return "\n".join(lines)


def render_inspect_replays(result: InspectReplaysResult) -> str:
    lines = [
        "inspect-replays",
        f"root: {result.inspection.source_summary.root_dir}",
        f"rounds: {len(result.inspection.source_summary.round_ids)}",
        f"runs: {result.inspection.source_summary.run_count}",
    ]
    for round_id in result.inspection.source_summary.round_ids:
        lines.append(
            f"round {round_id}: {result.inspection.source_summary.per_round_counts[round_id]} runs",
        )
    if result.round_inspection is not None:
        lines.append(f"selected_round: {result.round_inspection.round_id}")
        for item in result.round_inspection.per_seed:
            lines.append(f"seed {item.seed_index}: replay_runs={item.replay_run_count}")
    return "\n".join(lines)


def render_summarize_replays(result: SummarizeReplaysResult) -> str:
    event_summaries_by_seed = {
        seed_summary.seed_index: seed_summary
        for seed_summary in result.event_summary.seed_summaries
    }
    cell_event_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.cell_event_paths,
            strict=True,
        )
    }
    settlement_event_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.settlement_event_paths,
            strict=True,
        )
    }
    site_transition_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.site_transition_paths,
            strict=True,
        )
    }
    site_opportunity_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.site_opportunity_paths,
            strict=True,
        )
    }
    settlement_measurement_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.settlement_measurement_paths,
            strict=True,
        )
    }
    live_settlement_transition_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.live_settlement_transition_paths,
            strict=True,
        )
    }
    ruin_transition_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.ruin_transition_paths,
            strict=True,
        )
    }
    pairwise_candidate_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.pairwise_candidate_paths,
            strict=True,
        )
    }
    owner_year_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.owner_year_paths,
            strict=True,
        )
    }
    year_shock_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.year_shock_paths,
            strict=True,
        )
    }
    macro_trajectory_paths_by_seed = {
        seed_summary.seed_index: path
        for seed_summary, path in zip(
            result.hazard_summary.seed_summaries,
            result.macro_trajectory_paths,
            strict=True,
        )
    }
    lines = [
        f"summarize-replays #{result.round_number} {result.round_id}",
        f"replay_seed_count: {result.replay_seed_count}",
        f"replay_run_count: {result.replay_run_count}",
        f"round_summary: {result.round_summary_path}",
        f"report: {result.report_path}",
        f"coefficient_mean: {result.hazard_summary.coefficient_mean.tolist()}",
        (
            "measurement_counts: "
            f"frames={result.measurement_summary.frame_transition_count} "
            f"sites={result.measurement_summary.site_transition_count} "
            f"opportunities={result.measurement_summary.site_opportunity_count} "
            f"settlements={result.measurement_summary.settlement_measurement_count} "
            f"live={result.measurement_summary.live_settlement_transition_count} "
            f"ruins={result.measurement_summary.ruin_transition_count} "
            f"pairs={result.measurement_summary.pairwise_candidate_count} "
            f"owners={result.measurement_summary.owner_year_count} "
            f"years={result.measurement_summary.year_shock_count}"
            f" macro={result.measurement_summary.macro_trajectory_count}"
        ),
    ]
    for seed_summary, summary_path in zip(
        result.hazard_summary.seed_summaries,
        result.summary_paths,
        strict=True,
        ):
        event_summary = event_summaries_by_seed[seed_summary.seed_index]
        cell_event_path = cell_event_paths_by_seed[seed_summary.seed_index]
        settlement_event_path = settlement_event_paths_by_seed[seed_summary.seed_index]
        site_transition_path = site_transition_paths_by_seed[seed_summary.seed_index]
        site_opportunity_path = site_opportunity_paths_by_seed[seed_summary.seed_index]
        settlement_measurement_path = settlement_measurement_paths_by_seed[seed_summary.seed_index]
        live_settlement_transition_path = live_settlement_transition_paths_by_seed[
            seed_summary.seed_index
        ]
        ruin_transition_path = ruin_transition_paths_by_seed[seed_summary.seed_index]
        pairwise_candidate_path = pairwise_candidate_paths_by_seed[seed_summary.seed_index]
        owner_year_path = owner_year_paths_by_seed[seed_summary.seed_index]
        year_shock_path = year_shock_paths_by_seed[seed_summary.seed_index]
        macro_trajectory_path = macro_trajectory_paths_by_seed[seed_summary.seed_index]
        lines.append(
            " ".join(
                [
                    f"seed {seed_summary.seed_index}:",
                    f"runs={seed_summary.replay_run_count}",
                    f"built={seed_summary.built_hit_rate_mean:.4f}",
                    f"port={seed_summary.port_hit_rate_mean:.4f}",
                    f"ruin={seed_summary.ruin_hit_rate_mean:.4f}",
                    f"matched_ruin={event_summary.matched_ruin_event_count}",
                    f"site_ruin={event_summary.site_ruin_event_count}",
                    f"owner_flips={seed_summary.owner_flip_mean:.4f}",
                    f"summary={summary_path}",
                    f"cell_events={cell_event_path}",
                    f"settlement_events={settlement_event_path}",
                    f"site_transitions={site_transition_path}",
                    f"site_opportunities={site_opportunity_path}",
                    f"settlement_measurements={settlement_measurement_path}",
                    f"live_settlement_transitions={live_settlement_transition_path}",
                    f"ruin_transitions={ruin_transition_path}",
                    f"pairwise_candidates={pairwise_candidate_path}",
                    f"owner_years={owner_year_path}",
                    f"year_shocks={year_shock_path}",
                    f"macro_trajectories={macro_trajectory_path}",
                ],
            ),
        )
    return "\n".join(lines)


def render_factorize_round_summaries(result: FactorizeRoundSummariesResult) -> str:
    loo = result.leave_one_out_report
    loo_mae = "n/a" if loo.mean_mae is None else f"{loo.mean_mae:.6f}"
    loo_baseline_mae = (
        "n/a"
        if loo.mean_baseline_mae is None
        else f"{loo.mean_baseline_mae:.6f}"
    )
    loo_improvement = (
        "n/a"
        if loo.mean_mae_improvement is None
        else f"{loo.mean_mae_improvement:.6f}"
    )
    return "\n".join(
        [
            "factorize-round-summaries",
            f"summary_kind: {result.summary_kind}",
            f"rounds: {result.round_count}",
            f"effective_rank: {result.effective_rank}",
            f"explained_variance_ratio: {result.factorization.explained_variance_ratio.tolist()}",
            f"loo_rounds: {loo.eligible_round_count}",
            f"loo_mean_mae: {loo_mae}",
            f"loo_mean_baseline_mae: {loo_baseline_mae}",
            f"loo_mean_mae_improvement: {loo_improvement}",
            f"summary: {result.summary_path}",
            f"basis: {result.basis_path}",
            f"loo_report: {result.leave_one_out_path}",
        ],
    )


def render_train_hazard_teacher(result: TrainHazardTeacherResult) -> str:
    return "\n".join(
        [
            f"train-hazard-teacher {result.model_name}",
            f"replay_episodes: {result.replay_episode_count}",
            f"replay_runs: {result.replay_run_count}",
            f"embedding_dim: {result.embedding_dim}",
            f"checkpoint: {result.checkpoint_path}",
        ],
    )


def render_train_historical_bucket_prior(result: TrainHistoricalBucketPriorResult) -> str:
    return "\n".join(
        [
            f"train-historical-bucket-prior {result.model_name}",
            f"rounds: {result.round_count}",
            f"analyzed_seeds: {result.analyzed_seed_count}",
            f"cells: {result.cell_count}",
            f"terrain_buckets: {result.terrain_bucket_count}",
            f"structural_buckets: {result.structural_bucket_count}",
            f"full_buckets: {result.full_bucket_count}",
            f"checkpoint: {result.checkpoint_path}",
        ],
    )


def render_train_summary_student(result: TrainSummaryStudentResult) -> str:
    return "\n".join(
        [
            f"train-summary-student {result.model_name}",
            f"dataset: {result.dataset.dataset_name}",
            f"samples: {result.sample_count}",
            f"summary_dim: {result.summary_dim}",
            f"regime_dim: {result.regime_dim}",
            f"teacher_checkpoint: {result.teacher_checkpoint_path}",
            f"checkpoint: {result.checkpoint_path}",
        ],
    )


def render_teacher_science(result: EvaluateTeacherScienceResult) -> str:
    lines = [
        f"evaluate-teacher-science {result.model_name}",
        f"train_rounds: {len(result.train_round_ids)}",
        f"eval_rounds: {len(result.eval_round_ids)}",
        f"reports: {result.report_count}",
        f"mean_terminal_l1: {result.mean_terminal_l1:.6f}",
        f"mean_alive_curve_mae: {result.mean_alive_curve_mae:.6f}",
        f"mean_port_curve_mae: {result.mean_port_curve_mae:.6f}",
        f"mean_ruin_curve_mae: {result.mean_ruin_curve_mae:.6f}",
        f"mean_owner_flip_mae: {result.mean_owner_flip_mae:.6f}",
        f"mean_coefficient_l2: {result.mean_coefficient_l2:.6f}",
        f"artifact: {result.artifact_path}",
        f"report: {result.report_path}",
    ]
    return "\n".join(lines)


def render_dynamic_law_summary_validation(result: EvaluateDynamicLawSummaryResult) -> str:
    return "\n".join(
        [
            "evaluate-dynamic-law-summary",
            f"profile: {result.validation_profile}",
            f"rounds: {result.report_count}",
            f"holdout_runs: {result.max_holdout_runs}",
            f"bootstrap_samples: {result.bootstrap_samples}",
            f"rng_seed: {result.rng_seed}",
            f"site_max_rows: {result.site_max_rows}",
            f"settlement_max_rows: {result.settlement_max_rows}",
            f"pairwise_max_rows: {result.pairwise_max_rows}",
            f"elapsed_seconds: {result.elapsed_seconds:.3f}",
            f"mean_site_binary_brier: {result.mean_site_binary_brier}",
            f"mean_settlement_binary_brier: {result.mean_settlement_binary_brier}",
            f"mean_settlement_linear_rmse: {result.mean_settlement_linear_rmse}",
            f"mean_pairwise_binary_brier: {result.mean_pairwise_binary_brier}",
            f"mean_pairwise_linear_rmse: {result.mean_pairwise_linear_rmse}",
            f"mean_ruin_binary_brier: {result.mean_ruin_binary_brier}",
            f"mean_owner_linear_rmse: {result.mean_owner_linear_rmse}",
            f"mean_macro_linear_rmse: {result.mean_macro_linear_rmse}",
            f"mean_year_shock_mae: {result.mean_year_shock_mae}",
            f"mean_probe_std: {result.mean_probe_std}",
            f"artifact: {result.artifact_path}",
            f"report: {result.report_path}",
        ],
    )


def render_build_submission(result: BuildSubmissionResult) -> str:
    prediction_dir = result.prediction_paths[0].parent if result.prediction_paths else "n/a"
    submission_dir = (
        result.submission_record_paths[0].parent if result.submission_record_paths else "n/a"
    )
    return "\n".join(
        [
            f"build-submission {result.round_id}",
            f"model: {result.model_name}",
            f"seeds_built: {result.seeds_built}",
            f"prediction_dir: {prediction_dir}",
            f"raw_submission_dir: {submission_dir}",
        ],
    )


def render_validation(
    round_id: str,
    seed_index: int,
    tensor_path: Path,
    report: SubmissionValidationReport,
) -> str:
    return "\n".join(
        [
            f"validate-submission {round_id} seed={seed_index}",
            f"shape: {report.height}x{report.width}x{report.classes}",
            f"min_probability: {report.min_probability:.6f}",
            f"max_probability: {report.max_probability:.6f}",
            f"max_sum_deviation: {report.max_sum_deviation:.6f}",
            f"tensor: {tensor_path}",
        ],
    )


def render_submit_prediction(result: SubmitPredictionResult) -> str:
    return "\n".join(
        [
            f"submit {result.round_id} seed={result.seed_index}",
            f"status: {result.status}",
            f"model: {result.model_name}",
            f"raw_submission: {result.submission_record_path}",
        ],
    )


def render_fetch_analysis(result: FetchAnalysisResult) -> str:
    score = "n/a" if result.score is None else str(result.score)
    return "\n".join(
        [
            f"fetch-analysis {result.round_id} seed={result.seed_index}",
            f"shape: {result.height}x{result.width}",
            f"score: {score}",
            f"raw_analysis: {result.raw_path}",
            f"tensor: {result.tensor_path}",
        ],
    )


def render_round_report(artifacts: RoundReportArtifacts) -> str:
    lines = [
        "round-report",
        f"output_dir: {artifacts.report_path.parent}",
        f"report: {artifacts.report_path}",
    ]
    if artifacts.manifest_path is not None:
        lines.append(f"manifest: {artifacts.manifest_path}")
    lines.extend(
        [
            f"initial_map: {artifacts.initial_map_path}",
            f"coverage: {artifacts.coverage_path}",
            f"baseline: {artifacts.baseline_path}",
            f"entropy: {artifacts.entropy_path}",
        ],
    )
    return "\n".join(lines)


def render_visualization_report(result: VisualizationReportResult) -> str:
    lines = [
        f"visualization {result.report_key}",
        f"title: {result.title}",
        f"output_dir: {result.report_path.parent}",
        f"report: {result.report_path}",
        f"manifest: {result.manifest_path}",
    ]
    for key, path in sorted(result.figure_paths.items()):
        lines.append(f"{key}: {path}")
    return "\n".join(lines)


def render_regime_posterior(result: RoundRegimePosterior) -> str:
    return (
        "regime: "
        f"expansion={result.expansion:.3f} "
        f"maritime={result.maritime:.3f} "
        f"conflict={result.conflict:.3f} "
        f"winter={result.winter:.3f} "
        f"reclamation={result.reclamation:.3f} "
        f"evidence_queries={result.evidence_queries}"
    )


def render_fetch_round_analyses(result: FetchRoundAnalysesResult) -> str:
    lines = [
        f"fetch-round-analyses {result.round_id}",
        f"seeds_fetched: {len(result.fetched_results)}",
    ]
    for item in result.fetched_results:
        score = "n/a" if item.score is None else str(item.score)
        lines.append(f"seed {item.seed_index}: score={score} tensor={item.tensor_path}")
    if result.materialized_episode is not None:
        lines.append(f"episode_summary: {result.materialized_episode.summary_path}")
        lines.append(f"episode_report: {result.materialized_episode.report_path}")
    return "\n".join(lines)


def render_episode_diagnostics(diagnostics: RoundEpisodeDiagnostics) -> str:
    return render_round_episode_diagnostics(diagnostics)


def render_dataset_diagnostics(diagnostics: LocalDatasetDiagnostics) -> str:
    return render_local_dataset_diagnostics(diagnostics)


def render_backtest_round(result: BacktestRoundResult) -> str:
    return render_backtest_round_report(result)


def render_materialize_episode(result: MaterializeEpisodeResult) -> str:
    lines = [
        f"materialize-episode #{result.round_number} {result.round_id}",
        f"summary: {result.summary_path}",
        f"report: {result.report_path}",
        f"feature_names: {', '.join(result.feature_names)}",
        (
            "episode: "
            f"queries={result.diagnostics.summary.query_count} "
            f"repeats={result.diagnostics.summary.repeated_window_groups} "
            f"submissions={result.diagnostics.summary.submission_count} "
            f"analyses={result.diagnostics.summary.analysis_count} "
            f"replay_runs={result.diagnostics.summary.replay_run_count}"
        ),
    ]
    for item in result.per_seed:
        lines.append(
            " ".join(
                [
                    f"seed {item.seed_index}:",
                    f"features={item.feature_path}",
                    f"evidence={item.evidence_path}",
                    f"replay_summary={item.replay_summary_path}",
                    f"replay_cell_events={item.replay_cell_events_path}",
                    f"replay_settlement_events={item.replay_settlement_events_path}",
                    f"replay_site_transitions={item.replay_site_transition_path}",
                    f"replay_site_opportunities={item.replay_site_opportunities_path}",
                    (
                        "replay_settlement_measurements="
                        f"{item.replay_settlement_measurements_path}"
                    ),
                    (
                        "replay_live_settlement_transitions="
                        f"{item.replay_live_settlement_transitions_path}"
                    ),
                    f"replay_ruin_transitions={item.replay_ruin_transitions_path}",
                    f"replay_pairwise_candidates={item.replay_pairwise_candidates_path}",
                    f"replay_owner_years={item.replay_owner_years_path}",
                    f"replay_year_shocks={item.replay_year_shocks_path}",
                    f"replay_macro_trajectories={item.replay_macro_trajectories_path}",
                    f"replay_runs={item.replay_run_count}",
                    f"prediction={str(item.has_prediction).lower()}",
                    f"analysis={str(item.has_analysis).lower()}",
                ],
            ),
        )
    if result.replay_round_summary is not None:
        lines.append(f"replay_report: {result.replay_report_path}")
        lines.append(
            f"replay_coefficients_mean: {result.replay_round_summary.coefficient_mean.tolist()}",
        )
    if result.replay_event_summary is not None:
        site_ruin_total = sum(
            item.site_ruin_event_count for item in result.replay_event_summary.seed_summaries
        )
        matched_ruin_total = sum(
            item.matched_ruin_event_count for item in result.replay_event_summary.seed_summaries
        )
        lines.append(
            (
                "replay_events: "
                f"matched_ruin={matched_ruin_total} "
                f"site_ruin={site_ruin_total}"
            ),
        )
    if result.replay_measurement_summary is not None:
        lines.append(
            (
                "replay_measurements: "
                f"frames={result.replay_measurement_summary.frame_transition_count} "
                f"sites={result.replay_measurement_summary.site_transition_count} "
                f"opportunities={result.replay_measurement_summary.site_opportunity_count} "
                f"settlements={result.replay_measurement_summary.settlement_measurement_count} "
                f"live={result.replay_measurement_summary.live_settlement_transition_count} "
                f"ruins={result.replay_measurement_summary.ruin_transition_count} "
                f"pairs={result.replay_measurement_summary.pairwise_candidate_count} "
                f"owners={result.replay_measurement_summary.owner_year_count} "
                f"years={result.replay_measurement_summary.year_shock_count}"
                f" macro={result.replay_measurement_summary.macro_trajectory_count}"
            ),
        )
    if result.backtest_result is not None:
        lines.append(f"backtest_mean_score: {result.backtest_result.mean_score:.4f}")
    return "\n".join(lines)


def render_synthetic_tournament(result: SyntheticTournamentResult) -> str:
    lines = [
        (
            f"synthetic-tournament #{result.round_number} {result.round_id}"
            if result.round_number is not None
            else f"synthetic-tournament {result.round_id}"
        ),
        f"oracle: {result.oracle_name}",
        f"predictor: {result.predictor_name}",
        f"policy: {result.policy_name}",
        f"episode_seed: {result.episode_seed}",
        f"queries: {result.executed_queries}/{result.budget}",
        f"mean_score: {result.mean_score:.4f}",
        f"mean_weighted_kl: {result.mean_weighted_kl:.6f}",
        f"artifact: {result.artifact_path}",
    ]
    for seed_index, breakdown in sorted(result.score_by_seed.items()):
        lines.append(
            f"seed {seed_index}: score={breakdown.score:.4f} kl={breakdown.weighted_kl:.6f}",
        )
    return "\n".join(lines)


def render_synthetic_benchmark(result: SyntheticBenchmarkResult) -> str:
    lines = [
        "synthetic-benchmark",
        f"name: {result.benchmark_name}",
        f"output_dir: {result.artifact_path.parent}",
        f"predictor: {result.predictor_name}",
        f"policy: {result.policy_name}",
        f"manifest: {result.manifest_path}",
        f"budget: {result.budget}",
        f"episodes: {result.aggregate.episode_count}",
        f"mean_score: {result.aggregate.mean_score:.4f}",
        f"mean_weighted_kl: {result.aggregate.mean_weighted_kl:.6f}",
        f"score_range: {result.aggregate.min_score:.4f}..{result.aggregate.max_score:.4f}",
        f"artifact: {result.artifact_path}",
        f"report: {result.report_path}",
    ]
    for item in result.episodes:
        round_prefix = (
            f"#{item.round_number} {item.round_id}"
            if item.round_number is not None
            else item.round_id
        )
        lines.append(
            f"{round_prefix} episode_seed={item.episode_seed} "
            f"score={item.mean_score:.4f} kl={item.mean_weighted_kl:.6f}",
        )
    return "\n".join(lines)


def render_historical_benchmark(result: HistoricalBenchmarkResult) -> str:
    lines = [
        "historical-benchmark",
        f"name: {result.benchmark_name}",
        f"output_dir: {result.artifact_path.parent}",
        f"model: {result.model_name}",
        f"mode: {result.mode}",
        f"policy: {result.policy_name or 'n/a'}",
        (
            "samples_per_round: "
            f"{result.samples_per_round if result.samples_per_round is not None else 'n/a'}"
        ),
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
    worst = sorted(
        (
            seed_result
            for round_result in result.rounds
            for seed_result in round_result.seed_results
        ),
        key=lambda item: item.weighted_kl,
        reverse=True,
    )[:5]
    for item in worst:
        round_prefix = (
            f"#{item.round_number} {item.round_id}"
            if item.round_number is not None
            else item.round_id
        )
        support = (
            "n/a"
            if item.support_full_pct is None
            else (
                f"full={item.support_full_pct:.3f} "
                f"struct={item.support_structural_pct:.3f} "
                f"terrain={item.support_terrain_pct:.3f} "
                f"global={item.support_global_pct:.3f}"
            )
        )
        lines.append(
            f"worst {round_prefix} seed={item.seed_index} "
            f"queries={item.executed_queries if item.executed_queries is not None else 'n/a'} "
            f"score={item.score:.4f} kl={item.weighted_kl:.6f} support={support}",
        )
    return "\n".join(lines)


def render_build_benchmark_manifests(result: BuildBenchmarkManifestsResult) -> str:
    lines = [
        "build-benchmark-manifests",
        f"rounds: {result.round_count}",
        f"manifests: {len(result.manifest_paths)}",
    ]
    for path in result.manifest_paths:
        lines.append(str(path))
    return "\n".join(lines)


def render_paired_benchmark_comparison(result: PairedBenchmarkComparison) -> str:
    lines = [
        "compare-synthetic-benchmarks",
        f"output_dir: {result.artifact_path.parent if result.artifact_path is not None else 'n/a'}",
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
        f"artifact: {result.artifact_path}",
        f"report: {result.report_path}",
    ]
    for item in result.episodes:
        round_prefix = (
            f"#{item.round_number} {item.round_id}"
            if item.round_number is not None
            else item.round_id
        )
        lines.append(
            f"{round_prefix} episode_seed={item.episode_seed} "
            f"delta={item.score_delta:.4f} kl_delta={item.weighted_kl_delta:.6f}",
        )
    return "\n".join(lines)


def render_historical_benchmark_comparison(result: HistoricalBenchmarkComparison) -> str:
    lines = [
        "compare-historical-benchmarks",
        f"output_dir: {result.artifact_path.parent if result.artifact_path is not None else 'n/a'}",
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
        f"artifact: {result.artifact_path}",
        f"report: {result.report_path}",
    ]
    for item in result.seeds[:10]:
        round_prefix = (
            f"#{item.round_number} {item.round_id}"
            if item.round_number is not None
            else item.round_id
        )
        lines.append(
            f"{round_prefix} seed={item.seed_index} "
            f"delta={item.score_delta:.4f} kl_delta={item.weighted_kl_delta:.6f}",
        )
    return "\n".join(lines)


def render_live_online_run(result: LiveOnlineRunResult) -> str:
    lines = [
        (
            f"run-live-online #{result.round_number} {result.round_id}"
            if result.round_number is not None
            else f"run-live-online {result.round_id}"
        ),
        f"oracle: {result.oracle_name}",
        f"predictor: {result.predictor_name}",
        f"policy: {result.policy_name}",
        (
            "samples_per_round: "
            f"{result.samples_per_round if result.samples_per_round is not None else 'n/a'}"
        ),
        f"loaded_queries: {result.loaded_queries}",
        f"new_queries: {result.executed_queries}/{result.budget}",
        f"prediction_dir: {result.prediction_dir}",
        f"submitted_predictions: {result.submitted_predictions}",
    ]
    return "\n".join(lines)


def render_corpus_summary(result: CorpusSummaryResult) -> str:
    lines = [
        f"episodes: {result.episode_count}",
        f"episodes_with_ground_truth: {result.analyzed_episode_count}",
        f"episodes_with_replays: {result.replay_episode_count}",
        f"leave_one_seed_out_tasks: {result.leave_one_seed_out_task_count}",
        f"two_seed_holdout_tasks: {result.two_seed_holdout_task_count}",
    ]
    for item in sorted(result.corpus.summaries, key=lambda summary: summary.round_number):
        lines.append(
            f"episode #{item.round_number} {item.round_id}: "
            f"status={item.status} seeds={item.seed_count} "
            f"analyzed={item.analyzed_seed_count} queries={item.query_count} "
            f"replays={item.replay_run_count}",
        )
    return "\n".join(lines)


def render_replay_eda(result: ReplayEdaResult) -> str:
    lines = [
        "replay-eda",
        f"rounds: {result.round_count}",
        f"seeds: {result.seed_count}",
        f"replay_runs: {result.replay_run_count}",
        f"skipped_short_replays: {result.skipped_short_replay_count}",
        f"changed_cell_year_rate: {result.changed_cell_year_rate:.6f}",
        f"mountain_breaks: {result.mountain_break_count}",
        f"mountain_births: {result.mountain_birth_count}",
        f"ocean_changes_out: {result.ocean_change_out_count}",
        f"ocean_changes_in: {result.ocean_change_in_count}",
        f"inland_port_gains: {result.inland_port_gain_count}",
        f"summary: {result.summary_path}",
        f"report: {result.report_path}",
    ]
    if result.round_summaries:
        top_round = result.round_summaries[0]
        lines.append(
            " ".join(
                [
                    "most_dynamic_round:",
                    f"#{top_round.round_number}",
                    top_round.round_id,
                    f"rate={top_round.changed_cell_year_rate:.6f}",
                ],
            ),
        )
    return "\n".join(lines)
