from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class CatalogEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(default_factory=lambda: uuid4().hex)
    happened_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    event_kind: str
    round_id: str | None = None
    seed_index: int | None = None
    spec_name: str | None = None
    status: str | None = None
    artifact_path: Path | None = None
    payload_json: dict[str, Any] = Field(default_factory=dict)


class CatalogDatasetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_count: int = Field(ge=0)
    query_event_count: int = Field(ge=0)
    submission_event_count: int = Field(ge=0)
    analysis_event_count: int = Field(ge=0)
    replay_event_count: int = Field(ge=0)
    replay_summary_event_count: int = Field(ge=0)
    live_run_event_count: int = Field(ge=0)
    materialized_event_count: int = Field(ge=0)
