from __future__ import annotations

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.workflows.fetch_analysis import fetch_analysis
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.results import FetchRoundAnalysesResult


def fetch_round_analyses(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
) -> FetchRoundAnalysesResult:
    round_record = read_round_record(paths, round_id)
    results = [
        fetch_analysis(paths, client, round_id, seed_index)
        for seed_index in range(round_record.round.seeds_count)
    ]
    materialized_episode = materialize_round_episode(paths, round_id)
    catalog = CatalogDB(paths.catalog_path)
    for result in results:
        catalog.log_event(
            CatalogEvent(
                event_kind="analysis_fetched",
                round_id=round_id,
                seed_index=result.seed_index,
                status="ok",
                artifact_path=result.tensor_path,
                payload_json=result.model_dump(mode="json"),
            ),
        )
    return FetchRoundAnalysesResult(
        round_id=round_id,
        fetched_results=results,
        materialized_episode=materialized_episode,
    )
