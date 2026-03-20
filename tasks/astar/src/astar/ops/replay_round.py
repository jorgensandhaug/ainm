from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.replay_round import replay_round as replay_round_workflow
from astar.workflows.results import ReplayRoundResult


def replay_round(paths: WorkspacePaths, round_id: str) -> ReplayRoundResult:
    return replay_round_workflow(paths, round_id)
