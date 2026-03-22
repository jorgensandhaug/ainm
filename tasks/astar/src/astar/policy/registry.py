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
    if normalized in ("exploration", "exploration_v2"):
        return CoverageThenReplicatePolicy(
            name="exploration_v2",
            replicate_budget=5,
            probe_first=True,
        )
    if normalized == "exploration_r1":
        return CoverageThenReplicatePolicy(
            name="exploration_r1",
            replicate_budget=1,
            probe_first=True,
        )
    if normalized == "exploration_r2":
        return CoverageThenReplicatePolicy(
            name="exploration_r2",
            replicate_budget=2,
            probe_first=True,
        )
    if normalized == "exploration_r3":
        return CoverageThenReplicatePolicy(
            name="exploration_r3",
            replicate_budget=3,
            probe_first=True,
        )
    if normalized == "exploration_r4":
        return CoverageThenReplicatePolicy(
            name="exploration_r4",
            replicate_budget=4,
            probe_first=True,
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
