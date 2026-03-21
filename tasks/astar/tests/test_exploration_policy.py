from __future__ import annotations

import numpy as np

from astar.infra.api.dto import InitialState, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.registry import build_named_policy
from tests.conftest import ROUND_ID


def _round_detail(width: int, height: int, seeds_count: int = 5) -> RoundDetail:
    grid = np.full((height, width), 11, dtype=np.int64).tolist()
    return RoundDetail(
        id="round-test",
        round_number=1,
        status="completed",
        map_width=width,
        map_height=height,
        seeds_count=seeds_count,
        initial_states=[InitialState(grid=grid, settlements=[]) for _ in range(seeds_count)],
    )


def test_coverage_policy_fills_to_round_budget_on_standard_map() -> None:
    plan = build_named_policy("coverage").build_plan(_round_detail(40, 40))
    coverage_items = [item for item in plan.items if item.tag == "coverage"]
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]

    assert len(coverage_items) == 45
    assert len(repeat_items) == 5
    assert len(plan.items) == 50


def test_coverage_policy_cycles_repeats_on_tiny_map() -> None:
    plan = build_named_policy("coverage").build_plan(_round_detail(8, 8))
    coverage_items = [item for item in plan.items if item.tag == "coverage"]
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]

    assert len(coverage_items) == 5
    assert len(repeat_items) == 45
    assert len(plan.items) == 50


def test_exploration_plan_adds_one_repeat_per_seed(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = CoverageThenReplicatePolicy(
        name="exploration_v2",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=5,
        target_query_budget=None,
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
