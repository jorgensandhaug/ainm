from __future__ import annotations

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.fetch_analysis import fetch_analysis as fetch_analysis_workflow
from astar.workflows.results import FetchAnalysisResult


def fetch_analysis(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    seed_index: int,
) -> FetchAnalysisResult:
    return fetch_analysis_workflow(paths, client, round_id, seed_index)
