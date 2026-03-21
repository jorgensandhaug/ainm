from __future__ import annotations

import re

from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.query_plan import QueryPlanPolicy


_POLICY_PATTERN = re.compile(r"^(coverage|exploration)(?:_r(\d+))?$")


def build_named_policy(name: str) -> QueryPlanPolicy:
    normalized = name.strip().lower()
    match = _POLICY_PATTERN.fullmatch(normalized)
    if match is not None:
        family, replicate_budget_text = match.groups()
        if family == "coverage":
            default_budget = 0
            probe_first = False
        else:
            default_budget = 5
            probe_first = True
        replicate_budget = default_budget if replicate_budget_text is None else int(replicate_budget_text)
        return CoverageThenReplicatePolicy(
            name=normalized,
            replicate_budget=replicate_budget,
            probe_first=probe_first,
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
