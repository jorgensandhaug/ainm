from __future__ import annotations

import json

import polars as pl

from astar.history.datasets.event_ledger import build_replay_event_ledger_dataset
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_build_replay_event_ledger_dataset_writes_expected_events(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)

    dataset = build_replay_event_ledger_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        dataset_name="event_ledger_test",
    )

    assert dataset.row_count > 0
    assert dataset.index_path is not None
    assert dataset.index_path.exists()
    payload = json.loads(dataset.summary_path.read_text(encoding="utf-8"))
    assert payload["dataset_kind"] == "replay_event_ledger"
    assert payload["event_counts"]["settlement_delta"] > 0
    assert payload["event_counts"]["collapse"] > 0

    events = pl.read_parquet(dataset.index_path)
    assert set(events.get_column("event_type").unique().to_list()) >= {"settlement_delta", "collapse"}
    assert {"population_delta", "food_delta", "wealth_delta", "defense_delta"} <= set(events.columns)
