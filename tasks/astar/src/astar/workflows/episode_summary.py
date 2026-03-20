from __future__ import annotations

from pathlib import Path

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.materialize_episode import materialize_round_episode


def write_episode_summary(paths: WorkspacePaths, round_id: str) -> Path:
    return materialize_round_episode(paths, round_id).summary_path
