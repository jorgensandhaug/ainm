from __future__ import annotations

import json
import time
from pathlib import Path

import duckdb

from astar.infra.catalog.schema import CatalogDatasetSummary, CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS event_log (
    event_id VARCHAR PRIMARY KEY,
    happened_at TIMESTAMP NOT NULL,
    event_kind VARCHAR NOT NULL,
    round_id VARCHAR,
    seed_index INTEGER,
    spec_name VARCHAR,
    status VARCHAR,
    artifact_path VARCHAR,
    payload_json VARCHAR NOT NULL
);
"""


class CatalogDB:
    def __init__(self, path: Path) -> None:
        self._path = path

    def _connect(self, read_only: bool = False) -> duckdb.DuckDBPyConnection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        last_error: duckdb.IOException | None = None
        for delay_seconds in (0.0, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6):
            if delay_seconds > 0.0:
                time.sleep(delay_seconds)
            try:
                return duckdb.connect(str(self._path), read_only=read_only)
            except duckdb.IOException as exc:
                if "Could not set lock" not in str(exc):
                    raise
                last_error = exc
        assert last_error is not None
        raise last_error

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(_SCHEMA_SQL)

    def log_event(self, event: CatalogEvent) -> None:
        self.initialize()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO event_log (
                    event_id, happened_at, event_kind, round_id, seed_index, spec_name,
                    status, artifact_path, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    event.event_id,
                    event.happened_at,
                    event.event_kind,
                    event.round_id,
                    event.seed_index,
                    event.spec_name,
                    event.status,
                    None if event.artifact_path is None else str(event.artifact_path),
                    json.dumps(to_jsonable(event.payload_json), sort_keys=True),
                ],
            )

    def summarize_dataset(self) -> CatalogDatasetSummary:
        if not self._path.exists():
            return CatalogDatasetSummary(
                round_count=0,
                query_event_count=0,
                submission_event_count=0,
                analysis_event_count=0,
                replay_event_count=0,
                replay_summary_event_count=0,
                live_run_event_count=0,
                materialized_event_count=0,
            )

        try:
            connection = self._connect(read_only=True)
        except duckdb.IOException:
            self.initialize()
            connection = self._connect(read_only=True)

        with connection:
            row = connection.execute(
                """
                SELECT
                    COUNT(DISTINCT round_id) FILTER (WHERE round_id IS NOT NULL) AS round_count,
                    COUNT(*) FILTER (WHERE event_kind = 'query_recorded') AS query_event_count,
                    COUNT(*) FILTER (
                        WHERE event_kind = 'prediction_submitted'
                    ) AS submission_event_count,
                    COUNT(*) FILTER (WHERE event_kind = 'analysis_fetched') AS analysis_event_count,
                    COUNT(*) FILTER (
                        WHERE event_kind = 'replay_runs_ingested'
                    ) AS replay_event_count,
                    COUNT(*) FILTER (
                        WHERE event_kind = 'replay_summary_built'
                    ) AS replay_summary_event_count,
                    COUNT(*) FILTER (WHERE event_kind = 'live_run') AS live_run_event_count,
                    COUNT(*) FILTER (
                        WHERE event_kind = 'episode_materialized'
                    ) AS materialized_event_count
                FROM event_log
                """,
            ).fetchone()
        assert row is not None
        return CatalogDatasetSummary(
            round_count=int(row[0]),
            query_event_count=int(row[1]),
            submission_event_count=int(row[2]),
            analysis_event_count=int(row[3]),
            replay_event_count=int(row[4]),
            replay_summary_event_count=int(row[5]),
            live_run_event_count=int(row[6]),
            materialized_event_count=int(row[7]),
        )
