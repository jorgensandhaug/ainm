from __future__ import annotations

from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.query_plan import QueryPlanPolicy


def build_named_policy(name: str) -> QueryPlanPolicy:
    normalized = name.strip().lower()
    if normalized == "coverage":
        return CoverageThenReplicatePolicy(
            name="coverage",
            replicate_budget=0,
            probe_first=False,
        )
    if normalized == "exploration":
        return CoverageThenReplicatePolicy(
            name="exploration_v2",
            replicate_budget=5,
            probe_first=True,
        )
    if normalized == "exploration_global":
        return CoverageThenReplicatePolicy(
            name="exploration_global_v1",
            replicate_budget=5,
            probe_first=True,
            replicate_strategy="global_top",
        )
    if normalized == "exploration_focus":
        return CoverageThenReplicatePolicy(
            name="exploration_focus_v1",
            replicate_budget=5,
            probe_first=True,
            replicate_strategy="global_best_repeated",
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
