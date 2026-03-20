from __future__ import annotations

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.results import SubmitPredictionResult
from astar.workflows.submissions import submit_saved_prediction as submit_saved_prediction_workflow


def submit_saved_prediction(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    seed_index: int,
) -> SubmitPredictionResult:
    return submit_saved_prediction_workflow(paths, client, round_id, seed_index)
