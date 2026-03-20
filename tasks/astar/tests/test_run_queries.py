from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import cast

import pytest

from astar.core.grid import Viewport
from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import (
    BudgetStatus,
    SimulationRequest,
    SimulationResponse,
    StoredQueryRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import write_query_record
from astar.observe.executor import execute_query_plan as run_query_plan
from astar.observe.query_plan import QueryPlan, QueryPlanItem


class NoopClient:
    def get_budget(self) -> BudgetStatus:
        raise AssertionError(
            "get_budget should not be called when all planned raw queries already exist",
        )

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        raise AssertionError(
            "simulate should not be called when all planned raw queries already exist",
        )


class ExhaustedBudgetClient:
    def __init__(self, round_id: str) -> None:
        self.round_id = round_id
        self.simulate_calls = 0

    def get_budget(self) -> BudgetStatus:
        return BudgetStatus(
            round_id=self.round_id,
            queries_used=50,
            queries_max=50,
            active=True,
        )

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        self.simulate_calls += 1
        raise AssertionError("simulate should not be called when budget is already exhausted")


def _make_plan(round_id: str) -> QueryPlan:
    return QueryPlan(
        round_id=round_id,
        policy_name="test",
        items=[
            QueryPlanItem(
                round_id=round_id,
                seed_index=0,
                viewport=Viewport(x=0, y=0, w=5, h=5),
                repeats=1,
            ),
        ],
    )


def _write_existing_query(paths: RepoPaths, round_id: str, query_id: str) -> Path:
    return write_query_record(
        paths,
        round_id,
        StoredQueryRecord(
            query_id=query_id,
            requested_at=datetime.now(UTC),
            git_sha="test",
            config_hash="test",
            request=SimulationRequest(
                round_id=round_id,
                seed_index=0,
                viewport_x=0,
                viewport_y=0,
                viewport_w=5,
                viewport_h=5,
            ),
            response=SimulationResponse(
                grid=[[0, 0, 0, 0, 0] for _ in range(5)],
                settlements=[],
                viewport=Viewport(x=0, y=0, w=5, h=5),
                width=40,
                height=40,
                queries_used=1,
                queries_max=50,
            ),
        ),
    )


def test_run_query_plan_reuses_existing_raw_query(tmp_path: Path) -> None:
    round_id = "round-reuse"
    paths = RepoPaths.from_root(tmp_path)
    paths.ensure_layout()
    existing_path = _write_existing_query(paths, round_id, "0000-00")

    result = run_query_plan(paths, cast(AstarApiClient, NoopClient()), _make_plan(round_id))

    assert result.saved_paths == [existing_path]
    assert result.executed_queries == 0
    assert result.reused_queries == 1


def test_run_query_plan_raises_clear_error_when_budget_is_exhausted(tmp_path: Path) -> None:
    round_id = "round-exhausted"
    paths = RepoPaths.from_root(tmp_path)
    paths.ensure_layout()
    client = ExhaustedBudgetClient(round_id)

    with pytest.raises(ValueError, match="query budget exhausted"):
        run_query_plan(paths, cast(AstarApiClient, client), _make_plan(round_id))

    assert client.simulate_calls == 0
