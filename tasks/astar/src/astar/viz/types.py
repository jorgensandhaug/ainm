from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FigureSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str
    title: str
    path: Path
    description: str | None = None


class ReportManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    report_key: str
    title: str
    report_path: Path
    round_id: str | None = None
    seed_index: int | None = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    figures: list[FigureSpec] = Field(default_factory=list)


__all__ = ["FigureSpec", "ReportManifest"]
