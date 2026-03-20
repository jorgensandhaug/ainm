from __future__ import annotations

from typing import Any

from astar.infra.artifacts.paths import WorkspacePaths
from astar.legacy.round_report import build_round_report as build_legacy_round_report


def build_round_report(paths: WorkspacePaths, round_id: str, seed_index: int) -> Any:
    return build_legacy_round_report(paths, round_id, seed_index)
