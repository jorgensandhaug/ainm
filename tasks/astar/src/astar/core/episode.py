from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class RoundEpisodePaths(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_path: Path
    query_dir: Path
    submission_dir: Path
    analysis_dir: Path
    query_log_path: Path
    cell_observations_path: Path
    settlement_observations_path: Path


class RoundEpisodeSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    status: str
    seed_count: int = Field(ge=1)
    query_count: int = Field(ge=0)
    repeated_window_groups: int = Field(ge=0)
    submission_count: int = Field(ge=0)
    analysis_count: int = Field(ge=0)
    replay_run_count: int = Field(default=0, ge=0)
    replay_seed_count: int = Field(default=0, ge=0)
    replay_summary_count: int = Field(default=0, ge=0)
