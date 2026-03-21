from __future__ import annotations

import pytest

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.policy import build_named_policy
from astar.policy.coverage import CoverageThenReplicatePolicy
from tests.conftest import ROUND_ID


def test_exploration_plan_adds_one_repeat_per_seed(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = CoverageThenReplicatePolicy(
        name="exploration_v2",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=5,
        probe_first=True,
    )
    plan = policy.build_plan(round_record.round)

    coverage_items = [item for item in plan.items if item.tag == "coverage"]
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]

    assert len(coverage_items) == 20
    assert len(repeat_items) == 5
    assert {item.seed_index for item in repeat_items} == {0, 1, 2, 3, 4}
    assert all(item.repeats == 1 for item in repeat_items)
    assert all(item.diagnostic_score is not None for item in repeat_items)

    coverage_pairs = {
        (item.seed_index, item.viewport.x, item.viewport.y) for item in coverage_items
    }
    repeat_pairs = {(item.seed_index, item.viewport.x, item.viewport.y) for item in repeat_items}
    assert repeat_pairs.issubset(coverage_pairs)


@pytest.mark.parametrize(
    ("policy_name", "expected_plan_name", "expected_repeat_budget"),
    [
        ("exploration_r1", "exploration_r1", 1),
        ("exploration_r2", "exploration_r2", 2),
        ("exploration_r3", "exploration_r3", 3),
        ("exploration_r4", "exploration_r4", 4),
        ("exploration_v2", "exploration_v2", 5),
    ],
)
def test_named_exploration_policies_resolve_repeat_budgets(
    sample_paths: WorkspacePaths,
    policy_name: str,
    expected_plan_name: str,
    expected_repeat_budget: int,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)

    policy = build_named_policy(policy_name)
    assert isinstance(policy, CoverageThenReplicatePolicy)
    assert policy.name == expected_plan_name
    assert policy.replicate_budget == expected_repeat_budget
    assert policy.probe_first is True

    plan = policy.build_plan(round_record.round)
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]
    assert len(repeat_items) == expected_repeat_budget
