from __future__ import annotations

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.exploration import explore_round as explore_round_workflow
from astar.workflows.results import ExplorationRunResult


def explore_round(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    baseline_model: str = "static_semantic",
    submit_baseline: bool = True,
    dry_run: bool = False,
) -> ExplorationRunResult:
    return explore_round_workflow(
        paths,
        client,
        round_id,
        baseline_model=baseline_model,
        submit_baseline=submit_baseline,
        dry_run=dry_run,
    )
