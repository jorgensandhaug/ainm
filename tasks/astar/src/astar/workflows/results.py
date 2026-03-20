from __future__ import annotations

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.eval.backtest import BacktestRoundResult
from astar.eval.diagnostics import RoundEpisodeDiagnostics
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.replay.inspect import ReplayInspection, ReplayRoundInspection
from astar.history.summaries.hazards import ReplayHazardRoundSummary
from astar.models.latent_regime import RoundRegimePosterior
from astar.observe.results import QueryPlanRunResult


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


class ReplayRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    query_count: int = Field(ge=0)
    cell_observation_count: int = Field(ge=0)
    settlement_observation_count: int = Field(ge=0)
    rounds_path: Path
    seed_initial_states_path: Path
    query_log_path: Path
    cell_observations_path: Path
    settlement_observations_path: Path


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


class ExplorationRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    round_path: Path
    plan_path: Path
    planned_queries: int = Field(ge=0)
    dry_run: bool
    baseline_model: str | None = None
    sync_result: SyncRoundResult
    query_run_result: QueryPlanRunResult | None = None
    replay_result: ReplayRoundResult | None = None
    submission_build_result: BuildSubmissionResult | None = None
    submission_results: list[SubmitPredictionResult] = Field(default_factory=list)


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


class LiveRoundRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    spec_name: str
    round_id: str
    round_number: int
    sync_result: SyncRoundResult
    plan_path: Path
    query_run_result: QueryPlanRunResult | None = None
    replay_result: ReplayRoundResult | None = None
    prediction_dir: Path | None = None
    model_name: str | None = None
    regime_posterior: RoundRegimePosterior | None = None
    submitted_predictions: list[SubmitPredictionResult] = Field(default_factory=list)
    episode_diagnostics: RoundEpisodeDiagnostics | None = None
    materialized_episode: MaterializeEpisodeResult | None = None


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
