from __future__ import annotations

from astar.observe.policies.base import BaseQueryPolicy
from astar.observe.policies.coverage_then_replicate import CoverageThenReplicatePolicy


def build_named_policy(name: str) -> BaseQueryPolicy:
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
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
