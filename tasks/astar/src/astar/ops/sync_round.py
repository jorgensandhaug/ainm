from __future__ import annotations

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.results import SyncRoundResult
from astar.workflows.sync_round import sync_round as sync_round_workflow


def sync_round(paths: WorkspacePaths, client: AstarApiClient, round_id: str) -> SyncRoundResult:
    return sync_round_workflow(paths, client, round_id)
