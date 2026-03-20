from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.observe.results import QueryPlanRunResult, RecordedSimulationResult
from astar.workflows.results import (
    BuildSubmissionResult,
    ExplorationRunResult,
    FetchAnalysisResult,
    QueryPlanSummary,
    ReplayRoundResult,
    SubmitPredictionResult,
    SyncRoundResult,
)


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


__all__ = [
    "BuildSubmissionResult",
    "ExplorationRunResult",
    "FetchAnalysisResult",
    "HarvestReplaysResult",
    "QueryPlanRunResult",
    "QueryPlanSummary",
    "RecordedReplayResult",
    "RecordedSimulationResult",
    "ReplayHarvestSeedSummary",
    "ReplayRoundResult",
    "SubmitPredictionResult",
    "SyncRoundResult",
]
