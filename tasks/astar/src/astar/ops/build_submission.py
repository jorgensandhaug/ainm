from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.results import BuildSubmissionResult
from astar.workflows.submissions import build_submission as build_submission_workflow


def build_submission(
    paths: WorkspacePaths,
    round_id: str,
    model_name: str,
) -> BuildSubmissionResult:
    return build_submission_workflow(paths, round_id, model_name)
