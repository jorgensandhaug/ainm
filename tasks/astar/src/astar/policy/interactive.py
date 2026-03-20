from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from astar.envs.base import InteractiveQueryPolicy, TranscriptBeliefState
from astar.envs.types import ViewportQuery
from astar.observe.query_plan import QueryPlanItem
from astar.policy.query_plan import QueryPlanPolicy
from astar.policy.registry import build_named_policy


def _expand_query_items(items: list[QueryPlanItem]) -> list[QueryPlanItem]:
    expanded: list[QueryPlanItem] = []
    for item in items:
        expanded.extend(item for _ in range(item.repeats))
    return expanded


class QueryPlanPolicyAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    policy: QueryPlanPolicy
    name: str

    def select(
        self,
        belief: TranscriptBeliefState,
        budget_left: int,
    ) -> ViewportQuery | None:
        del budget_left
        plan = self.policy.build_plan(belief.round_context.to_round_detail())
        expanded_items = _expand_query_items(plan.items)
        observation_count = len(belief.observations)
        if observation_count >= len(expanded_items):
            return None
        item = expanded_items[observation_count]
        return ViewportQuery(
            seed_index=item.seed_index,
            viewport=item.viewport,
            rationale=item.tag,
        )


def build_interactive_policy(policy_name: str) -> QueryPlanPolicyAdapter:
    policy = build_named_policy(policy_name)
    return QueryPlanPolicyAdapter(policy=policy, name=policy.name)


__all__ = [
    "InteractiveQueryPolicy",
    "QueryPlanPolicyAdapter",
    "build_interactive_policy",
]
