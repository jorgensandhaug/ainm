from __future__ import annotations

from pathlib import Path

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent


def test_catalog_logs_and_summarizes_events(tmp_path: Path) -> None:
    paths = RepoPaths.from_root(tmp_path)
    paths.ensure_layout()
    catalog = CatalogDB(paths.catalog_path)
    catalog.log_event(CatalogEvent(event_kind="query_recorded", round_id="r-1"))
    catalog.log_event(CatalogEvent(event_kind="prediction_submitted", round_id="r-1", seed_index=0))
    summary = catalog.summarize_dataset()

    assert summary.round_count == 1
    assert summary.query_event_count == 1
    assert summary.submission_event_count == 1
