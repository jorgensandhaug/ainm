from __future__ import annotations

from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class DatasetRef(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    dataset_name: str
    dataset_kind: str
    dataset_dir: Path
    summary_path: Path
    index_path: Path | None = None
    row_count: int = Field(ge=0)
    round_count: int = Field(ge=0)


class SyntheticEpisodeDatasetRef(DatasetRef):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    policy_name: str
    episode_count: int = Field(ge=0)
    total_query_count: int = Field(ge=0)
    samples_per_round: int = Field(ge=1)


class DatasetBuilder(Protocol):
    name: str

    def build(self, *args: object, **kwargs: object) -> DatasetRef: ...
