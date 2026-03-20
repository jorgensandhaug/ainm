from __future__ import annotations

import polars as pl

from astar.ops.replay_round import replay_round
from astar.storage.io_raw import read_query_records
from astar.storage.manifests import RepoPaths
from tests.conftest import ROUND_ID


def test_identical_viewports_remain_distinct(sample_paths: RepoPaths) -> None:
    query_files = read_query_records(sample_paths, ROUND_ID)
    assert [item.record.query_id for item in query_files][:2] == ["q-0001", "q-0002"]
    assert query_files[0].record.request.model_dump() == query_files[1].record.request.model_dump()


def test_replay_round_writes_expected_tables(sample_paths: RepoPaths) -> None:
    replay_round(sample_paths, ROUND_ID)

    query_log = pl.read_parquet(sample_paths.query_log_path(ROUND_ID))
    cell_observations = pl.read_parquet(sample_paths.cell_observations_path(ROUND_ID))
    settlement_observations = pl.read_parquet(sample_paths.settlement_observations_path(ROUND_ID))

    assert query_log.height == 3
    assert cell_observations.height == 75
    assert settlement_observations.height == 6
    assert query_log.select("query_id").to_series().to_list() == ["q-0001", "q-0002", "q-0003"]
