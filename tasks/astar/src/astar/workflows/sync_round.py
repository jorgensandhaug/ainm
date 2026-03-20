from __future__ import annotations

from datetime import UTC, datetime

from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import StoredRoundRecord
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import write_round_record
from astar.workflows.results import SyncRoundResult


def sync_round(paths: WorkspacePaths, client: AstarApiClient, round_id: str) -> SyncRoundResult:
    round_detail = client.get_round(round_id)
    record = StoredRoundRecord(fetched_at=datetime.now(UTC), round=round_detail)
    round_path = write_round_record(paths, record)
    return SyncRoundResult(
        round_id=round_detail.id,
        round_number=round_detail.round_number,
        status=round_detail.status,
        map_width=round_detail.map_width,
        map_height=round_detail.map_height,
        seeds_count=round_detail.seeds_count,
        closes_at=round_detail.closes_at,
        round_path=round_path,
    )
