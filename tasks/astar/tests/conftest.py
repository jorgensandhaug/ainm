from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths

ROUND_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


@pytest.fixture
def sample_paths(tmp_path: Path, repo_root: Path) -> RepoPaths:
    paths = RepoPaths.from_root(tmp_path)
    paths.ensure_layout()
    shutil.copy(
        repo_root / "data" / "raw" / "rounds" / f"{ROUND_ID}.json",
        paths.raw_round_path(ROUND_ID),
    )
    destination_dir = paths.raw_query_dir(ROUND_ID)
    destination_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted((repo_root / "data" / "raw" / "queries" / ROUND_ID).glob("*.json")):
        shutil.copy(source, destination_dir / source.name)
    return paths
