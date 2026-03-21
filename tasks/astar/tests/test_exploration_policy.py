from __future__ import annotations

import pytest

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.api.dto import InitialSettlement, InitialState, RoundDetail
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
    (
        "policy_name",
        "expected_plan_name",
        "expected_repeat_budget",
        "expected_late_repeat_budget",
        "expected_selection_mode",
        "expected_probe_first",
    ),
    [
        ("exploration_r1", "exploration_r1", 1, 0, "per_seed_best", True),
        ("exploration_r2", "exploration_r2", 2, 0, "per_seed_best", True),
        ("exploration_r3", "exploration_r3", 3, 0, "per_seed_best", True),
        ("exploration_r3_global", "exploration_r3_global", 3, 0, "global_top", True),
        ("exploration_r3_entropy", "exploration_r3_entropy", 3, 0, "per_seed_best", True),
        ("exploration_r3_global_entropy", "exploration_r3_global_entropy", 3, 0, "global_top", True),
        ("exploration_port_r3", "exploration_port_r3", 3, 0, "per_seed_best", True),
        ("exploration_frontier_r3", "exploration_frontier_r3", 3, 0, "per_seed_best", False),
        ("exploration_hybrid_r3", "exploration_hybrid_r3", 2, 1, "per_seed_best", True),
        ("exploration_hybrid_r3_global", "exploration_hybrid_r3_global", 2, 1, "global_top", True),
        ("exploration_r4", "exploration_r4", 4, 0, "per_seed_best", True),
        ("exploration_v2", "exploration_v2", 5, 0, "per_seed_best", True),
    ],
)
def test_named_exploration_policies_resolve_repeat_budgets(
    sample_paths: WorkspacePaths,
    policy_name: str,
    expected_plan_name: str,
    expected_repeat_budget: int,
    expected_late_repeat_budget: int,
    expected_selection_mode: str,
    expected_probe_first: bool,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)

    policy = build_named_policy(policy_name)
    assert isinstance(policy, CoverageThenReplicatePolicy)
    assert policy.name == expected_plan_name
    assert policy.replicate_budget == expected_repeat_budget
    assert policy.late_replicate_budget == expected_late_repeat_budget
    assert policy.probe_first is expected_probe_first
    assert policy.selection_mode == expected_selection_mode

    plan = policy.build_plan(round_record.round)
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]
    late_repeat_items = [item for item in plan.items if item.tag == "late_repeat"]
    assert len(repeat_items) == expected_repeat_budget
    assert len(late_repeat_items) == expected_late_repeat_budget


def test_hybrid_policy_places_late_repeats_after_coverage(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = build_named_policy("exploration_hybrid_r3")
    assert isinstance(policy, CoverageThenReplicatePolicy)

    plan = policy.build_plan(round_record.round)
    tags = [item.tag for item in plan.items]
    coverage_indexes = [index for index, tag in enumerate(tags) if tag == "coverage"]
    late_indexes = [index for index, tag in enumerate(tags) if tag == "late_repeat"]

    assert late_indexes
    assert coverage_indexes
    assert min(late_indexes) > max(coverage_indexes)


def test_global_top_repeat_selection_can_reuse_same_seed() -> None:
    round_detail = RoundDetail(
        id="synthetic",
        round_number=1,
        status="completed",
        map_width=10,
        map_height=5,
        seeds_count=2,
        initial_states=[
            InitialState(
                grid=[[1] * 10 for _ in range(5)],
                settlements=[
                    InitialSettlement(x=0, y=0, has_port=False),
                    InitialSettlement(x=1, y=0, has_port=False),
                    InitialSettlement(x=2, y=0, has_port=False),
                    InitialSettlement(x=5, y=0, has_port=False),
                    InitialSettlement(x=6, y=0, has_port=False),
                ],
            ),
            InitialState(
                grid=[[1] * 10 for _ in range(5)],
                settlements=[
                    InitialSettlement(x=0, y=0, has_port=False),
                ],
            ),
        ],
    )
    per_seed_policy = CoverageThenReplicatePolicy(
        name="per_seed",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=2,
        probe_first=True,
        selection_mode="per_seed_best",
    )
    global_policy = per_seed_policy.model_copy(
        update={"name": "global", "selection_mode": "global_top"},
    )

    per_seed_plan = per_seed_policy.build_plan(round_detail)
    global_plan = global_policy.build_plan(round_detail)
    per_seed_repeats = [item for item in per_seed_plan.items if item.tag == "diagnostic_repeat"]
    global_repeats = [item for item in global_plan.items if item.tag == "diagnostic_repeat"]

    assert [item.seed_index for item in per_seed_repeats] == [0, 1]
    assert [item.seed_index for item in global_repeats] == [0, 0]
