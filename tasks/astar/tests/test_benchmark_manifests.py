from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.splits.synthetic_benchmark import (
    build_default_benchmark_manifests,
    load_benchmark_manifest,
)
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_build_default_benchmark_manifests(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    result = build_default_benchmark_manifests(sample_paths, budget=7)

    assert len(result.manifest_paths) == 4
    smoke = load_benchmark_manifest(sample_paths.benchmark_manifest_path("smoke"))
    assert smoke.round_ids == [ROUND_ID]
    assert smoke.episode_seeds == [0]
    assert smoke.budget == 7
