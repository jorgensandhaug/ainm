from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor
from astar.envs.live import LiveApiOracle
from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.workflows.online_episode import run_online_episode
from astar.workflows.submissions import persist_prediction_bundle, submit_saved_prediction


class LiveOnlineRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    oracle_name: str
    predictor_name: str
    policy_name: str
    budget: int = Field(ge=0)
    executed_queries: int = Field(ge=0)
    prediction_dir: str
    submitted_predictions: int = Field(ge=0)


def run_live_online_round(
    paths: WorkspacePaths,
    client: AstarApiClient,
    *,
    round_id: str,
    predictor: OnlinePredictor,
    policy: InteractiveQueryPolicy,
    budget: int = 50,
    submit_predictions: bool = True,
) -> LiveOnlineRunResult:
    oracle = LiveApiOracle(paths=paths, client=client)
    online_episode = run_online_episode(
        oracle,
        round_id=round_id,
        predictor=predictor,
        policy=policy,
        budget=budget,
    )
    round_context = online_episode.round_context
    for prediction in online_episode.prediction_bundle.predictions_by_seed.values():
        validate_prediction_tensor(
            prediction,
            SubmissionSpec(height=round_context.map_height, width=round_context.map_width),
        )
    persist_prediction_bundle(
        paths,
        round_id,
        online_episode.prediction_bundle.model_name,
        online_episode.prediction_bundle.predictions_by_seed,
    )
    submission_count = 0
    if submit_predictions:
        for seed_index in sorted(online_episode.prediction_bundle.predictions_by_seed):
            submit_saved_prediction(paths, client, round_id, seed_index)
            submission_count += 1
    result = LiveOnlineRunResult(
        round_id=round_id,
        round_number=round_context.round_number,
        oracle_name=oracle.name,
        predictor_name=predictor.name,
        policy_name=policy.name,
        budget=budget,
        executed_queries=online_episode.executed_queries,
        prediction_dir=str(paths.prediction_dir(round_id)),
        submitted_predictions=submission_count,
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="live_online_run",
            round_id=round_id,
            spec_name=f"{policy.name}+{predictor.name}",
            status="ok",
            artifact_path=paths.prediction_dir(round_id),
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


__all__ = ["LiveOnlineRunResult", "run_live_online_round"]
