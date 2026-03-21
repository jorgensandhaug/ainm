from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.infra.api.dto import AnalysisResponse, StoredAnalysisRecord
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import write_analysis_record
from astar.workflows.visualize_terminal_comparison import visualize_terminal_comparison
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_sample_replay


def _write_sample_analysis(paths: RepoPaths, *, seed_index: int) -> None:
    round_record = json.loads(paths.raw_round_path(ROUND_ID).read_text(encoding="utf-8"))
    initial_grid = np.asarray(
        round_record["round"]["initial_states"][seed_index]["grid"],
        dtype=np.int64,
    )
    collapsed = collapse_internal_grid(initial_grid)
    ground_truth = np.zeros(
        (collapsed.shape[0], collapsed.shape[1], CLASS_COUNT),
        dtype=np.float64,
    )
    for class_index in range(CLASS_COUNT):
        ground_truth[:, :, class_index] = collapsed == class_index

    prediction = np.full_like(ground_truth, 1.0 / float(CLASS_COUNT))
    record = StoredAnalysisRecord(
        fetched_at=datetime.now(UTC),
        round_id=ROUND_ID,
        seed_index=seed_index,
        analysis=AnalysisResponse(
            prediction=prediction.tolist(),
            ground_truth=ground_truth.tolist(),
            score=12.5,
            width=collapsed.shape[1],
            height=collapsed.shape[0],
            initial_grid=initial_grid.tolist(),
        ),
    )
    write_analysis_record(paths, ROUND_ID, seed_index, record)


def test_visualize_terminal_comparison_builds_manifest_and_figures(sample_paths: RepoPaths) -> None:
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c0", sim_seed=100)
    _write_sample_replay(sample_paths, seed_index=0, capture_id="c1", sim_seed=101)
    _write_sample_analysis(sample_paths, seed_index=0)

    result = visualize_terminal_comparison(sample_paths, ROUND_ID, 0)

    assert result.report_key == "terminal_comparison"
    assert result.report_path.exists()
    assert result.manifest_path.exists()
    assert set(result.figure_paths) == {
        "initial_map",
        "classwise_comparison",
        "replay_atlas",
        "ground_truth_atlas",
        "residual_atlas",
        "entropy_comparison",
        "kl_divergence",
    }
    assert all(path.exists() for path in result.figure_paths.values())
    assert sample_paths.replay_summary_path(ROUND_ID, 0).exists()

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["report_key"] == "terminal_comparison"
    assert manifest["seed_index"] == 0
    assert manifest["metadata"]["replay_run_count"] == 2
    assert len(manifest["figures"]) == 7
