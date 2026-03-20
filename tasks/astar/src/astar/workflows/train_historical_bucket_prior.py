from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.workflows.results import TrainHistoricalBucketPriorResult


def train_historical_bucket_prior(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    exclude_round_ids: list[str] | None = None,
    model_name: str = "historical_bucket_prior_v1",
) -> TrainHistoricalBucketPriorResult:
    predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
        paths,
        round_ids=round_ids,
        exclude_round_ids=exclude_round_ids,
        model_name=model_name,
    )
    checkpoint_path = predictor.save_checkpoint(
        paths.model_dir(model_name) / "checkpoint.json",
    )
    result = TrainHistoricalBucketPriorResult(
        model_name=model_name,
        round_count=len(predictor.round_ids),
        analyzed_seed_count=predictor.analyzed_seed_count,
        cell_count=predictor.cell_count,
        terrain_bucket_count=len(predictor.terrain_means),
        structural_bucket_count=len(predictor.structural_means),
        full_bucket_count=len(predictor.full_means),
        checkpoint_path=checkpoint_path,
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="training_run",
            spec_name=model_name,
            status="ok",
            artifact_path=checkpoint_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


__all__ = ["train_historical_bucket_prior"]
