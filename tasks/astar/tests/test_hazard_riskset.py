from __future__ import annotations

import json

import polars as pl

from astar.history.datasets.hazard_riskset import build_hazard_riskset_dataset
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_build_hazard_riskset_dataset_for_collapse_includes_labels_and_weights(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)

    dataset = build_hazard_riskset_dataset(
        sample_paths,
        event_type="collapse",
        round_ids=[ROUND_ID],
        dataset_name="collapse_riskset_test",
        negative_ratio=0.5,
    )

    assert dataset.row_count > 0
    assert dataset.index_path is not None
    assert dataset.index_path.exists()
    payload = json.loads(dataset.summary_path.read_text(encoding="utf-8"))
    assert payload["dataset_kind"] == "hazard_riskset"
    assert payload["event_type"] == "collapse"
    assert payload["positive_count"] > 0
    assert payload["sampled_negative_count"] > 0

    riskset = pl.read_parquet(dataset.index_path)
    assert set(riskset.get_column("label").unique().to_list()) == {False, True}
    assert riskset.filter(pl.col("label") == False).get_column("sample_weight").min() > 1.0
