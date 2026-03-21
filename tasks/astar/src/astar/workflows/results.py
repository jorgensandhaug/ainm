from __future__ import annotations

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.core.score import ScoreBreakdown
from astar.eval.backtest import BacktestRoundResult
from astar.eval.competition import CompetitionAggregate
from astar.eval.diagnostics import RoundEpisodeDiagnostics
from astar.eval.science import ScienceRoundReport
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.replay.inspect import ReplayInspection, ReplayRoundInspection
from astar.history.summaries.dynamic_law_validation import DynamicLawRoundValidationReport
from astar.history.summaries.event_summary import ReplayEventRoundSummary
from astar.history.summaries.hazards import ReplayHazardRoundSummary
from astar.history.summaries.measurements import ReplayMeasurementRoundSummary


class SyncRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    status: str
    map_width: int = Field(ge=1)
    map_height: int = Field(ge=1)
    seeds_count: int = Field(ge=1)
    closes_at: datetime | None = None
    round_path: Path


class QueryPlanSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    policy_name: str
    item_count: int = Field(ge=0)
    total_queries: int = Field(ge=0)
    diagnostic_query_count: int = Field(ge=0)
    seed_query_counts: dict[int, int]
    plan_path: Path


class RecordedReplayResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    sim_seed: int
    frame_count: int = Field(ge=1)
    settlement_observation_count: int = Field(ge=0)
    path: Path


class ReplayHarvestSeedSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    existing_before: int = Field(ge=0)
    captured: int = Field(ge=0)
    total_after: int = Field(ge=0)
    replay_dir: Path


class HarvestReplaysResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_ids: list[str]
    rounds_considered: int = Field(ge=0)
    seeds_considered: int = Field(ge=0)
    existing_replays: int = Field(ge=0)
    captured_replays: int = Field(ge=0)
    total_replays: int = Field(ge=0)
    rate_limit_cooldowns: int = Field(ge=0)
    replay_root: Path
    seed_summaries: list[ReplayHarvestSeedSummary]


class RoundReportArtifacts(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    report_path: Path
    manifest_path: Path | None = None
    figure_paths: dict[str, Path] = Field(default_factory=dict)
    initial_map_path: Path
    coverage_path: Path
    baseline_path: Path
    entropy_path: Path


class VisualizationReportResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    report_key: str
    title: str
    report_path: Path
    manifest_path: Path
    figure_paths: dict[str, Path]


class BuildSubmissionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    model_name: str
    seeds_built: int = Field(ge=0)
    prediction_paths: list[Path]
    submission_record_paths: list[Path]


class SubmitPredictionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    status: str
    model_name: str
    submission_record_path: Path


class FetchAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    score: float | None = None
    raw_path: Path
    tensor_path: Path


class MaterializedSeedArtifacts(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    seed_index: int = Field(ge=0)
    feature_path: Path
    evidence_path: Path
    replay_summary_path: Path | None = None
    replay_cell_events_path: Path | None = None
    replay_settlement_events_path: Path | None = None
    replay_site_transition_path: Path | None = None
    replay_site_opportunities_path: Path | None = None
    replay_settlement_measurements_path: Path | None = None
    replay_live_settlement_transitions_path: Path | None = None
    replay_ruin_transitions_path: Path | None = None
    replay_pairwise_candidates_path: Path | None = None
    replay_owner_years_path: Path | None = None
    replay_year_shocks_path: Path | None = None
    replay_macro_trajectories_path: Path | None = None
    replay_run_count: int = Field(default=0, ge=0)
    has_prediction: bool
    has_analysis: bool


class MaterializeEpisodeResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    summary_path: Path
    report_path: Path
    replay_report_path: Path | None = None
    feature_names: list[str]
    per_seed: list[MaterializedSeedArtifacts]
    diagnostics: RoundEpisodeDiagnostics
    replay_round_summary: ReplayHazardRoundSummary | None = None
    replay_event_summary: ReplayEventRoundSummary | None = None
    replay_measurement_summary: ReplayMeasurementRoundSummary | None = None
    backtest_result: BacktestRoundResult | None = None


class FetchRoundAnalysesResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    fetched_results: list[FetchAnalysisResult]
    materialized_episode: MaterializeEpisodeResult | None = None


class InspectReplaysResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    inspection: ReplayInspection
    round_inspection: ReplayRoundInspection | None = None


class SummarizeReplaysResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    replay_run_count: int = Field(ge=0)
    replay_seed_count: int = Field(ge=0)
    summary_paths: list[Path]
    cell_event_paths: list[Path]
    settlement_event_paths: list[Path]
    site_transition_paths: list[Path]
    site_opportunity_paths: list[Path]
    settlement_measurement_paths: list[Path]
    live_settlement_transition_paths: list[Path]
    ruin_transition_paths: list[Path]
    pairwise_candidate_paths: list[Path]
    owner_year_paths: list[Path]
    year_shock_paths: list[Path]
    macro_trajectory_paths: list[Path]
    round_summary_path: Path
    report_path: Path
    hazard_summary: ReplayHazardRoundSummary
    event_summary: ReplayEventRoundSummary
    measurement_summary: ReplayMeasurementRoundSummary


class TrainHazardTeacherResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    summary_backend: str = "behavioral_fingerprint_core"
    replay_episode_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    checkpoint_path: Path
    embedding_dim: int = Field(ge=1)


class TrainHistoricalBucketPriorResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    round_count: int = Field(ge=0)
    analyzed_seed_count: int = Field(ge=0)
    cell_count: int = Field(ge=0)
    terrain_bucket_count: int = Field(ge=0)
    structural_bucket_count: int = Field(ge=0)
    full_bucket_count: int = Field(ge=0)
    checkpoint_path: Path


class TrainSummaryStudentResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    summary_backend: str = "behavioral_fingerprint_core"
    dataset: SyntheticEpisodeDatasetRef
    checkpoint_path: Path
    teacher_checkpoint_path: Path
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)


class EvaluateTeacherScienceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    summary_backend: str = "behavioral_fingerprint_core"
    train_round_ids: list[str]
    eval_round_ids: list[str]
    report_count: int = Field(ge=0)
    mean_terminal_l1: float = Field(ge=0.0)
    mean_alive_curve_mae: float = Field(ge=0.0)
    mean_port_curve_mae: float = Field(ge=0.0)
    mean_ruin_curve_mae: float = Field(ge=0.0)
    mean_owner_flip_mae: float = Field(ge=0.0)
    mean_coefficient_l2: float = Field(ge=0.0)
    reports: list[ScienceRoundReport]
    artifact_path: Path
    report_path: Path


class EvaluateDynamicLawSummaryResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_ids: list[str]
    report_count: int = Field(ge=0)
    validation_profile: str
    max_holdout_runs: int = Field(ge=0)
    bootstrap_samples: int = Field(ge=0)
    rng_seed: int = Field(ge=0)
    site_max_rows: int | None = Field(default=None, ge=0)
    settlement_max_rows: int | None = Field(default=None, ge=0)
    pairwise_max_rows: int | None = Field(default=None, ge=0)
    elapsed_seconds: float = Field(ge=0.0)
    mean_site_binary_brier: float | None = None
    mean_settlement_binary_brier: float | None = None
    mean_settlement_linear_rmse: float | None = None
    mean_pairwise_binary_brier: float | None = None
    mean_pairwise_linear_rmse: float | None = None
    mean_ruin_binary_brier: float | None = None
    mean_owner_linear_rmse: float | None = None
    mean_macro_linear_rmse: float | None = None
    mean_year_shock_mae: float | None = None
    mean_probe_std: float | None = None
    artifact_path: Path
    report_path: Path
    round_reports: tuple[DynamicLawRoundValidationReport, ...]


class TournamentQueryTrace(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    query_index: int = Field(ge=0)
    seed_index: int = Field(ge=0)
    viewport: Viewport
    settlement_count: int = Field(ge=0)
    rationale: str | None = None


class SyntheticTournamentResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    oracle_name: str
    predictor_name: str
    policy_name: str
    episode_seed: int = Field(ge=0)
    budget: int = Field(ge=0)
    executed_queries: int = Field(ge=0)
    mean_score: float
    mean_weighted_kl: float
    score_by_seed: dict[int, ScoreBreakdown]
    query_trace: list[TournamentQueryTrace]
    artifact_path: Path


class SyntheticBenchmarkEpisodeResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    episode_seed: int = Field(ge=0)
    mean_score: float
    mean_weighted_kl: float
    tournament_artifact_path: Path


class SyntheticBenchmarkResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    benchmark_name: str
    predictor_name: str
    policy_name: str
    manifest_path: Path | None = None
    budget: int = Field(ge=0)
    round_ids: list[str]
    episode_seeds: list[int]
    aggregate: CompetitionAggregate
    episodes: list[SyntheticBenchmarkEpisodeResult]
    artifact_path: Path
    report_path: Path


class HistoricalBenchmarkCellIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    kl: float = Field(ge=0.0)
    predicted_class_index: int = Field(ge=0)
    predicted_class_name: str
    ground_truth_class_index: int = Field(ge=0)
    ground_truth_class_name: str


class HistoricalBenchmarkSeedResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    seed_index: int = Field(ge=0)
    mode: str
    model_name: str
    training_round_count: int = Field(ge=0)
    training_analyzed_seed_count: int = Field(ge=0)
    training_cell_count: int = Field(ge=0)
    policy_name: str | None = None
    samples_per_round: int | None = Field(default=None, ge=1)
    budget: int | None = Field(default=None, ge=0)
    episode_seed: int | None = Field(default=None, ge=0)
    executed_queries: int | None = Field(default=None, ge=0)
    score: float
    weighted_kl: float
    mean_prediction_entropy: float = Field(ge=0.0)
    mean_ground_truth_entropy: float = Field(ge=0.0)
    argmax_agreement_rate: float = Field(ge=0.0, le=1.0)
    predicted_class_mass: list[float]
    ground_truth_class_mass: list[float]
    residual_class_mass: list[float]
    support_full_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    support_structural_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    support_terrain_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    support_global_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    full_bucket_count_p10: float | None = Field(default=None, ge=0.0)
    full_bucket_count_p50: float | None = Field(default=None, ge=0.0)
    full_bucket_count_p90: float | None = Field(default=None, ge=0.0)
    visualization_seconds: float | None = Field(default=None, ge=0.0)
    top_kl_cells: list[HistoricalBenchmarkCellIssue]
    report_path: Path | None = None
    manifest_path: Path | None = None


class HistoricalBenchmarkRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    policy_name: str | None = None
    samples_per_round: int | None = Field(default=None, ge=1)
    budget: int | None = Field(default=None, ge=0)
    episode_seed: int | None = Field(default=None, ge=0)
    executed_queries: int | None = Field(default=None, ge=0)
    evaluated_seed_count: int = Field(ge=0)
    visualized_seed_count: int = Field(default=0, ge=0)
    mean_score: float
    mean_weighted_kl: float
    evaluation_seconds: float | None = Field(default=None, ge=0.0)
    visualization_seconds: float = Field(default=0.0, ge=0.0)
    seed_results: list[HistoricalBenchmarkSeedResult]


class HistoricalBenchmarkResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    benchmark_name: str
    model_name: str
    mode: str
    policy_name: str | None = None
    samples_per_round: int | None = Field(default=None, ge=1)
    budget: int | None = Field(default=None, ge=0)
    episode_seed: int | None = Field(default=None, ge=0)
    round_ids: list[str]
    aggregate: CompetitionAggregate
    rounds: list[HistoricalBenchmarkRoundResult]
    evaluated_seed_count: int = Field(ge=0)
    visualization_policy: str
    visualized_seed_count: int = Field(ge=0)
    evaluation_seconds: float = Field(default=0.0, ge=0.0)
    visualization_seconds: float = Field(default=0.0, ge=0.0)
    artifact_write_seconds: float = Field(default=0.0, ge=0.0)
    total_runtime_seconds: float = Field(default=0.0, ge=0.0)
    artifact_path: Path
    report_path: Path
    summary_jsonl_path: Path
    summary_csv_path: Path


class HistoricalBenchmarkSeedDelta(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    seed_index: int = Field(ge=0)
    baseline_score: float
    candidate_score: float
    score_delta: float
    baseline_weighted_kl: float
    candidate_weighted_kl: float
    weighted_kl_delta: float


class HistoricalBenchmarkComparison(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    baseline_model_name: str
    candidate_model_name: str
    mode: str
    policy_name: str | None = None
    budget: int | None = Field(default=None, ge=0)
    episode_seed: int | None = Field(default=None, ge=0)
    seed_count: int = Field(ge=0)
    mean_score_delta: float
    mean_weighted_kl_delta: float
    win_rate: float
    loss_rate: float
    tie_rate: float
    score_delta_ci_low: float
    score_delta_ci_high: float
    seeds: list[HistoricalBenchmarkSeedDelta]
    artifact_path: Path | None = None
    report_path: Path | None = None
