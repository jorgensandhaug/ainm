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


def test_build_hazard_riskset_dataset_streaming_matches_large_batch(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)

    streamed = build_hazard_riskset_dataset(
        sample_paths,
        event_type="birth",
        round_ids=[ROUND_ID],
        dataset_name="birth_riskset_streamed_test",
        negative_ratio=0.5,
        batch_row_count=7,
    )
    monolithic = build_hazard_riskset_dataset(
        sample_paths,
        event_type="birth",
        round_ids=[ROUND_ID],
        dataset_name="birth_riskset_largebatch_test",
        negative_ratio=0.5,
        batch_row_count=1_000_000,
    )

    streamed_payload = json.loads(streamed.summary_path.read_text(encoding="utf-8"))
    monolithic_payload = json.loads(monolithic.summary_path.read_text(encoding="utf-8"))
    assert streamed_payload["row_count"] == monolithic_payload["row_count"]
    assert streamed_payload["positive_count"] == monolithic_payload["positive_count"]
    assert streamed_payload["sampled_negative_count"] == monolithic_payload["sampled_negative_count"]

    sort_columns = ["round_id", "seed_index", "replay_run_id", "year_t", "y", "x"]
    streamed_riskset = pl.read_parquet(streamed.index_path).sort(sort_columns)
    monolithic_riskset = pl.read_parquet(monolithic.index_path).sort(sort_columns)
    assert streamed_riskset.equals(monolithic_riskset)
