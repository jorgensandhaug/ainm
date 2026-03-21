from __future__ import annotations

from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.query_plan import QueryPlanPolicy
from astar.student.predictor.query_residual_config import is_query_residual_model_name

DEFAULT_POLICY_NAME = "coverage"
QUERY_RESIDUAL_DEFAULT_POLICY_NAME = "exploration"


def default_policy_name_for_model(model_name: str | None = None) -> str:
    if model_name is not None and is_query_residual_model_name(model_name):
        return QUERY_RESIDUAL_DEFAULT_POLICY_NAME
    return DEFAULT_POLICY_NAME


def resolve_policy_name(
    policy_name: str | None,
    *,
    model_name: str | None = None,
) -> str:
    if policy_name is None:
        return default_policy_name_for_model(model_name)
    normalized = policy_name.strip().lower()
    if normalized in {"default", "auto"}:
        return default_policy_name_for_model(model_name)
    return normalized


def build_named_policy(name: str) -> QueryPlanPolicy:
    normalized = name.strip().lower()
    if normalized in {"coverage", "coverage_then_replicate_v1"}:
        return CoverageThenReplicatePolicy(
            name="coverage",
            replicate_budget=0,
            probe_first=False,
        )
    if normalized in {"exploration", "exploration_v2"}:
        return CoverageThenReplicatePolicy(
            name="exploration_v2",
            replicate_budget=5,
            probe_first=True,
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
