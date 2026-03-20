from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import LiveQueryObs
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.core.world_state import LiveSettlementObs
from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor
from astar.envs.live import LiveApiOracle
from astar.envs.types import RoundContext
from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import BudgetStatus
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_query_records
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
    loaded_queries: int = Field(ge=0)
    executed_queries: int = Field(ge=0)
    prediction_dir: str
    submitted_predictions: int = Field(ge=0)


def _build_live_observations_from_saved_queries(
    paths: WorkspacePaths,
    round_id: str,
) -> tuple[LiveQueryObs, ...]:
    query_records = read_query_records(paths, round_id)
    observations: list[LiveQueryObs] = []
    for query_index, item in enumerate(
        sorted(
            query_records,
            key=lambda record: (record.record.requested_at, record.record.query_id),
        ),
    ):
        observations.append(
            LiveQueryObs(
                round_id=round_id,
                seed_index=item.record.request.seed_index,
                viewport=item.record.response.viewport,
                grid=np.asarray(item.record.response.grid, dtype=np.int64),
                settlements=tuple(
                    LiveSettlementObs(
                        x=settlement.x,
                        y=settlement.y,
                        population=settlement.population,
                        food=settlement.food,
                        wealth=settlement.wealth,
                        defense=settlement.defense,
                        has_port=settlement.has_port,
                        alive=settlement.alive,
                        owner_id=settlement.owner_id,
                    )
                    for settlement in item.record.response.settlements
                ),
                query_index=query_index,
            ),
        )
    return tuple(observations)


def _rebuild_prediction_from_saved_queries(
    predictor: OnlinePredictor,
    round_context: RoundContext,
    observations: tuple[LiveQueryObs, ...],
):
    belief = predictor.init_belief(round_context)
    for observation in observations:
        belief = predictor.update(belief, observation)
    return belief, predictor.predict(belief)


def _remaining_queries(budget_status: BudgetStatus, round_id: str) -> int:
    if not budget_status.active or budget_status.round_id != round_id:
        msg = f"round {round_id} is not the active round for live querying"
        raise ValueError(msg)
    return budget_status.queries_max - budget_status.queries_used


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
    if budget < 0:
        raise ValueError("budget must be >= 0")

    saved_observations = _build_live_observations_from_saved_queries(paths, round_id)
    if budget == 0:
        if not saved_observations:
            msg = (
                f"budget=0 requested for round {round_id}, but no saved local raw queries exist; "
                "run with a positive --budget first"
            )
            raise ValueError(msg)
    elif saved_observations:
        msg = (
            f"round {round_id} already has {len(saved_observations)} saved local raw queries; "
            "refusing to spend new live queries on top. Re-run with --budget 0 to use saved files."
        )
        raise ValueError(msg)

    if budget > 0:
        remaining_queries = _remaining_queries(client.get_budget(), round_id)
        if remaining_queries < budget:
            msg = (
                f"requested {budget} new live queries for round {round_id}, "
                f"but only {remaining_queries} remain remotely; "
                "re-run with --budget 0 to use saved local queries instead"
            )
            raise ValueError(msg)

    oracle = LiveApiOracle(paths=paths, client=client)
    if budget == 0:
        round_context = oracle.get_round_context(round_id)
        _, prediction_bundle = _rebuild_prediction_from_saved_queries(
            predictor,
            round_context,
            saved_observations,
        )
        executed_queries = 0
        loaded_queries = len(saved_observations)
    else:
        online_episode = run_online_episode(
            oracle,
            round_id=round_id,
            predictor=predictor,
            policy=policy,
            budget=budget,
        )
        round_context = online_episode.round_context
        prediction_bundle = online_episode.prediction_bundle
        executed_queries = online_episode.executed_queries
        loaded_queries = 0

    for prediction in prediction_bundle.predictions_by_seed.values():
        validate_prediction_tensor(
            prediction,
            SubmissionSpec(height=round_context.map_height, width=round_context.map_width),
        )
    persist_prediction_bundle(
        paths,
        round_id,
        prediction_bundle.model_name,
        prediction_bundle.predictions_by_seed,
    )
    submission_count = 0
    if submit_predictions:
        for seed_index in sorted(prediction_bundle.predictions_by_seed):
            submit_saved_prediction(paths, client, round_id, seed_index)
            submission_count += 1
    result = LiveOnlineRunResult(
        round_id=round_id,
        round_number=round_context.round_number,
        oracle_name=oracle.name,
        predictor_name=predictor.name,
        policy_name=policy.name,
        budget=budget,
        loaded_queries=loaded_queries,
        executed_queries=executed_queries,
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
