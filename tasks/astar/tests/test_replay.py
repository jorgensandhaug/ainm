from __future__ import annotations

import polars as pl

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_query_records, read_round_record
from astar.infra.artifacts.tables import write_query_tables, write_round_tables
from tests.conftest import ROUND_ID


def test_identical_viewports_remain_distinct(sample_paths: RepoPaths) -> None:
    query_files = read_query_records(sample_paths, ROUND_ID)
    assert [item.record.query_id for item in query_files][:2] == ["q-0001", "q-0002"]
    assert query_files[0].record.request.model_dump() == query_files[1].record.request.model_dump()


def test_query_table_writers_write_expected_tables(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    query_files = read_query_records(sample_paths, ROUND_ID)
    write_round_tables(sample_paths, round_record)
    write_query_tables(sample_paths, ROUND_ID, query_files)

    query_log = pl.read_parquet(sample_paths.query_log_path(ROUND_ID))
    cell_observations = pl.read_parquet(sample_paths.cell_observations_path(ROUND_ID))
    settlement_observations = pl.read_parquet(sample_paths.settlement_observations_path(ROUND_ID))

    assert query_log.height == 3
    assert cell_observations.height == 75
    assert settlement_observations.height == 6
    assert query_log.select("query_id").to_series().to_list() == ["q-0001", "q-0002", "q-0003"]
