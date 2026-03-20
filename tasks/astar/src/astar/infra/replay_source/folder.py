from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict

from astar.infra.api.dto import StoredReplayRecord
from astar.infra.replay_source.base import ReplayRunHandle, ReplaySourceSummary
from astar.storage.io_raw import ReplayFileRecord


class FolderReplaySource(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    root_dir: Path

    def inspect(self) -> ReplaySourceSummary:
        per_round_counts: dict[str, int] = {}
        for round_dir in sorted(self.root_dir.glob("*")):
            if not round_dir.is_dir():
                continue
            count = sum(1 for path in round_dir.glob("seed_index=*/*.json") if path.is_file())
            if count > 0:
                per_round_counts[round_dir.name] = count
        return ReplaySourceSummary(
            root_dir=self.root_dir,
            round_ids=sorted(per_round_counts),
            run_count=sum(per_round_counts.values()),
            per_round_counts=per_round_counts,
        )

    def discover_runs(self, round_id: str | None = None) -> list[ReplayRunHandle]:
        handles: list[ReplayRunHandle] = []
        round_dirs = (
            [self.root_dir / round_id] if round_id is not None else sorted(self.root_dir.glob("*"))
        )
        for round_dir in round_dirs:
            if not round_dir.exists() or not round_dir.is_dir():
                continue
            for seed_dir in sorted(round_dir.glob("seed_index=*")):
                if not seed_dir.is_dir():
                    continue
                seed_index = int(seed_dir.name.split("=", 1)[1])
                for path in sorted(seed_dir.glob("*.json")):
                    handles.append(
                        ReplayRunHandle(
                            round_id=round_dir.name,
                            seed_index=seed_index,
                            source_path=path,
                        ),
                    )
        return handles

    def load_run(self, handle: ReplayRunHandle) -> ReplayFileRecord:
        record = StoredReplayRecord.model_validate_json(
            handle.source_path.read_text(encoding="utf-8"),
        )
        return ReplayFileRecord(path=handle.source_path, record=record)
