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
from astar.history.summaries.hazards import ReplayHazardRoundSummary


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
    round_summary_path: Path
    report_path: Path
    hazard_summary: ReplayHazardRoundSummary


class TrainHazardTeacherResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    replay_episode_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    checkpoint_path: Path
    embedding_dim: int = Field(ge=1)


class TrainSummaryStudentResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
    dataset: SyntheticEpisodeDatasetRef
    checkpoint_path: Path
    teacher_checkpoint_path: Path
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)


class EvaluateTeacherScienceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    model_name: str
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
