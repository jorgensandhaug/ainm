from __future__ import annotations

from astar.core.grid import MapShape, TileSpec, tile_viewports
from astar.features.motifs import rank_seed_viewports
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
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


def test_exploration_global_plan_uses_top_global_viewports(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = CoverageThenReplicatePolicy(
        name="exploration_global_v1",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=3,
        probe_first=True,
        replicate_strategy="global_top",
    )
    plan = policy.build_plan(round_record.round)

    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]
    assert len(repeat_items) == 3
    assert all(item.repeats == 1 for item in repeat_items)

    viewports = tile_viewports(
        MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
        TileSpec(width=5, height=5),
    )
    ranked = sorted(
        [
            item
            for seed_index in range(round_record.round.seeds_count)
            for item in rank_seed_viewports(round_record.round, seed_index, viewports)
        ],
        key=lambda item: (-item.diagnostic_score, item.seed_index, item.viewport.y, item.viewport.x),
    )
    expected = [
        (item.seed_index, item.viewport.x, item.viewport.y)
        for item in ranked[:3]
    ]
    actual = [(item.seed_index, item.viewport.x, item.viewport.y) for item in repeat_items]
    assert actual == expected


def test_exploration_focus_plan_repeats_single_best_global_viewport(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = CoverageThenReplicatePolicy(
        name="exploration_focus_v1",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=5,
        probe_first=True,
        replicate_strategy="global_best_repeated",
    )
    plan = policy.build_plan(round_record.round)

    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]
    assert len(repeat_items) == 1
    assert repeat_items[0].repeats == 5

    viewports = tile_viewports(
        MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
        TileSpec(width=5, height=5),
    )
    ranked = sorted(
        [
            item
            for seed_index in range(round_record.round.seeds_count)
            for item in rank_seed_viewports(round_record.round, seed_index, viewports)
        ],
        key=lambda item: (-item.diagnostic_score, item.seed_index, item.viewport.y, item.viewport.x),
    )
    best = ranked[0]
    repeat = repeat_items[0]
    assert (repeat.seed_index, repeat.viewport.x, repeat.viewport.y) == (
        best.seed_index,
        best.viewport.x,
        best.viewport.y,
    )
