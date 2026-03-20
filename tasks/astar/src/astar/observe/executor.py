from __future__ import annotations

import subprocess
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import BudgetStatus, SimulationRequest, StoredQueryRecord
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import write_query_record
from astar.observe.query_plan import QueryPlan
from astar.observe.results import QueryPlanRunResult, RecordedSimulationResult


def current_git_sha() -> str:
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            )
            .stdout.strip()
        )
    except Exception:
        return "unknown"


def record_simulation(
    paths: WorkspacePaths,
    client: AstarApiClient,
    request: SimulationRequest,
    config_hash: str = "manual",
    query_id: str | None = None,
) -> RecordedSimulationResult:
    response = client.simulate(request)
    resolved_query_id = query_id or uuid4().hex
    record = StoredQueryRecord(
        query_id=resolved_query_id,
        requested_at=datetime.now(UTC),
        git_sha=current_git_sha(),
        config_hash=config_hash,
        request=request,
        response=response,
    )
    path = write_query_record(paths, request.round_id, record)
    return RecordedSimulationResult(
        round_id=request.round_id,
        seed_index=request.seed_index,
        query_id=resolved_query_id,
        viewport=response.viewport,
        observed_height=len(response.grid),
        observed_width=len(response.grid[0]),
        settlements_logged=len(response.settlements),
        queries_used=response.queries_used,
        queries_max=response.queries_max,
        path=path,
    )


def _iter_query_requests(plan: QueryPlan) -> list[tuple[str, SimulationRequest]]:
    requests: list[tuple[str, SimulationRequest]] = []
    for item_index, item in enumerate(plan.items):
        for repeat_index in range(item.repeats):
            query_id = f"{item_index:04d}-{repeat_index:02d}"
            requests.append(
                (
                    query_id,
                    SimulationRequest(
                        round_id=item.round_id,
                        seed_index=item.seed_index,
                        viewport_x=item.viewport.x,
                        viewport_y=item.viewport.y,
                        viewport_w=item.viewport.w,
                        viewport_h=item.viewport.h,
                    ),
                ),
            )
    return requests


def _remaining_budget_for_round(budget: BudgetStatus, round_id: str) -> int | None:
    if not budget.active or budget.round_id != round_id:
        return None
    return budget.queries_max - budget.queries_used


def execute_query_plan(
    paths: WorkspacePaths,
    client: AstarApiClient,
    plan: QueryPlan,
    config_hash: str = "manual",
) -> QueryPlanRunResult:
    saved_paths = []
    pending_requests: list[tuple[str, SimulationRequest]] = []
    for query_id, request in _iter_query_requests(plan):
        output_path = paths.raw_query_path(plan.round_id, query_id)
        if output_path.exists():
            saved_paths.append(output_path)
        else:
            pending_requests.append((query_id, request))

    total_planned_queries = len(saved_paths) + len(pending_requests)
    if not pending_requests:
        return QueryPlanRunResult(
            round_id=plan.round_id,
            policy_name=plan.policy_name,
            total_planned_queries=total_planned_queries,
            executed_queries=0,
            reused_queries=len(saved_paths),
            query_dir=paths.raw_query_dir(plan.round_id),
            saved_paths=saved_paths,
        )

    remaining_budget = _remaining_budget_for_round(client.get_budget(), plan.round_id)
    if remaining_budget is not None and remaining_budget <= 0:
        msg = (
            f"query budget exhausted for round {plan.round_id}; "
            f"found {len(saved_paths)} existing planned raw queries and "
            f"{len(pending_requests)} are still missing"
        )
        raise ValueError(msg)

    executed_queries = 0
    for query_id, request in pending_requests:
        try:
            result = record_simulation(
                paths,
                client,
                request,
                config_hash=config_hash,
                query_id=query_id,
            )
            saved_paths.append(result.path)
            executed_queries += 1
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                remaining_budget = _remaining_budget_for_round(
                    client.get_budget(),
                    plan.round_id,
                )
                if remaining_budget is not None and remaining_budget <= 0:
                    msg = (
                        f"query budget exhausted for round {plan.round_id}; "
                        f"captured {len(saved_paths)} of {total_planned_queries} "
                        "planned raw queries locally"
                    )
                    raise ValueError(msg) from exc
            raise

    return QueryPlanRunResult(
        round_id=plan.round_id,
        policy_name=plan.policy_name,
        total_planned_queries=total_planned_queries,
        executed_queries=executed_queries,
        reused_queries=len(saved_paths) - executed_queries,
        query_dir=paths.raw_query_dir(plan.round_id),
        saved_paths=saved_paths,
    )
