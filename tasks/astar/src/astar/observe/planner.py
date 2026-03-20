from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.api.dto import RoundDetail
from astar.observe.query_plan import QueryPlan, write_query_plan
from astar.policy.query_plan import QueryPlanPolicy


class PlannedPolicyRun(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    policy_name: str
    query_count: int = Field(ge=0)
    plan_path: Path
    plan: QueryPlan


def build_policy_plan(
    policy: QueryPlanPolicy,
    round_detail: RoundDetail,
    output_path: Path,
) -> PlannedPolicyRun:
    plan = policy.build_plan(round_detail)
    write_query_plan(output_path, plan)
    return PlannedPolicyRun(
        round_id=round_detail.id,
        policy_name=plan.policy_name,
        query_count=sum(item.repeats for item in plan.items),
        plan_path=output_path,
        plan=plan,
    )
