from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict

from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor, TranscriptBeliefState
from astar.envs.types import ViewportQuery
from astar.observe.query_plan import QueryPlanItem
from astar.policy.adaptive import CoverageAdaptiveRepeatPolicy
from astar.policy.predictive_repeat import build_named_predictive_repeat_policy
from astar.policy.query_plan import QueryPlanPolicy
from astar.policy.registry import build_named_policy

_ADAPTIVE_PATTERN = re.compile(r"^adaptive(?:_r(\d+))?$")
_PREDICTIVE_REPEAT_PATTERN = re.compile(r"^(postinfo|scoregain)(?:_probe)?(?:_r(\d+))?$")


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


def build_interactive_policy(
    policy_name: str,
    *,
    predictor: OnlinePredictor | None = None,
) -> InteractiveQueryPolicy:
    normalized = policy_name.strip().lower()
    if normalized == "regime_probe_v1" or normalized == "regime_probe":
        from astar.policy.regime_probe import RegimeProbePolicy
        return RegimeProbePolicy(name="regime_probe_v1")
    adaptive_match = _ADAPTIVE_PATTERN.fullmatch(normalized)
    if adaptive_match is not None:
        replicate_budget_text = adaptive_match.group(1)
        replicate_budget = 5 if replicate_budget_text is None else int(replicate_budget_text)
        return CoverageAdaptiveRepeatPolicy(
            name=normalized,
            replicate_budget=replicate_budget,
        )
    predictive_repeat_match = _PREDICTIVE_REPEAT_PATTERN.fullmatch(normalized)
    if predictive_repeat_match is not None:
        replicate_budget_text = predictive_repeat_match.group(2)
        replicate_budget = 5 if replicate_budget_text is None else int(replicate_budget_text)
        return build_named_predictive_repeat_policy(
            normalized,
            predictor=predictor,
            replicate_budget=replicate_budget,
        )
    policy = build_named_policy(policy_name)
    return QueryPlanPolicyAdapter(policy=policy, name=policy.name)


__all__ = [
    "InteractiveQueryPolicy",
    "QueryPlanPolicyAdapter",
    "build_interactive_policy",
]
