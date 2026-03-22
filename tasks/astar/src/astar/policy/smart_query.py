"""Smart query policies that focus budget on informative observations.

Key insight: 15x15 viewports are ~95% static (ocean/mountain/forest).
Only settlement areas carry information about the round's hidden parameters.
These policies try to maximize information per query.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from astar.core.grid import MapShape, TileSpec, Viewport, tile_viewports
from astar.features.motifs import ViewportMotifScorer, rank_seed_viewports
from astar.infra.api.dto import RoundDetail
from astar.observe.query_plan import QueryPlan, QueryPlanItem
from astar.policy.query_plan import QueryPlanPolicy

import numpy as np


def _settlement_density_per_viewport(
    round_detail: RoundDetail,
    seed_index: int,
    viewports: list[Viewport],
) -> list[tuple[int, float]]:
    """Count settlements in each viewport. Returns (viewport_index, count)."""
    settlements = round_detail.initial_states[seed_index].settlements
    results = []
    for vi, v in enumerate(viewports):
        count = sum(
            1 for s in settlements
            if v.x <= s.x < v.x + v.w and v.y <= s.y < v.y + v.h
        )
        results.append((vi, float(count)))
    return results


def _find_settlement_viewports(
    round_detail: RoundDetail,
    seed_index: int,
    viewport_w: int = 10,
    viewport_h: int = 10,
    max_viewports: int = 6,
) -> list[Viewport]:
    """Find viewports centered on settlement clusters."""
    settlements = round_detail.initial_states[seed_index].settlements
    if not settlements:
        return []

    map_w = round_detail.map_width
    map_h = round_detail.map_height

    # Score every possible viewport position by settlement count
    best_positions: list[tuple[int, int, int]] = []
    for y in range(0, map_h - viewport_h + 1, 3):  # step by 3 for speed
        for x in range(0, map_w - viewport_w + 1, 3):
            count = sum(
                1 for s in settlements
                if x <= s.x < x + viewport_w and y <= s.y < y + viewport_h
            )
            if count > 0:
                best_positions.append((count, x, y))

    best_positions.sort(reverse=True)

    # Greedily select non-overlapping viewports
    selected: list[Viewport] = []
    covered_settlements: set[tuple[int, int]] = set()
    for count, x, y in best_positions:
        if len(selected) >= max_viewports:
            break
        # Check which new settlements this covers
        new_settlements = {
            (s.x, s.y) for s in settlements
            if x <= s.x < x + viewport_w and y <= s.y < y + viewport_h
            and (s.x, s.y) not in covered_settlements
        }
        if not new_settlements:
            continue
        selected.append(Viewport(x=x, y=y, w=viewport_w, h=viewport_h))
        covered_settlements.update(new_settlements)

    return selected


class ConcentratedRepeatPolicy(QueryPlanPolicy):
    """Full coverage + concentrated repeats on the SINGLE most diagnostic viewport.

    Instead of spreading repeats across different viewports (exploration_r3),
    repeat the same viewport multiple times for better statistical evidence.
    """
    name: str = "concentrated_r5"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    repeat_budget: int = Field(default=5, ge=0)
    probe_first: bool = True
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def build_plan(self, round_detail: RoundDetail) -> QueryPlan:
        viewports = tile_viewports(
            MapShape(width=round_detail.map_width, height=round_detail.map_height),
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )

        # Coverage items
        coverage_items = [
            QueryPlanItem(
                round_id=round_detail.id,
                seed_index=seed_index,
                viewport=viewport,
                repeats=1,
                tag="coverage",
            )
            for seed_index in range(round_detail.seeds_count)
            for viewport in viewports
        ]

        if self.repeat_budget <= 0:
            return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=coverage_items)

        # Find the SINGLE best viewport across all seeds
        best_score = -1.0
        best_seed = 0
        best_viewport = viewports[0]
        for seed_index in range(round_detail.seeds_count):
            ranked = rank_seed_viewports(
                round_detail, seed_index, viewports, scorer=self.motif_scorer,
            )
            if ranked and ranked[0].diagnostic_score > best_score:
                best_score = ranked[0].diagnostic_score
                best_seed = ranked[0].seed_index
                best_viewport = ranked[0].viewport

        # All repeats on the same viewport
        repeat_items = [
            QueryPlanItem(
                round_id=round_detail.id,
                seed_index=best_seed,
                viewport=best_viewport,
                repeats=1,
                tag="concentrated_repeat",
                diagnostic_score=best_score,
            )
            for _ in range(self.repeat_budget)
        ]

        if self.probe_first:
            return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=repeat_items + coverage_items)
        return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=coverage_items + repeat_items)


class SettlementFocusedPolicy(QueryPlanPolicy):
    """Prioritize viewports by settlement density.

    Queries settlement-dense viewports first across all seeds,
    then fills remaining budget with less important coverage.
    Uses settlement count as the diagnostic score instead of
    the hand-designed motif scorer.
    """
    name: str = "settlement_focused"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    repeat_budget: int = Field(default=3, ge=0)

    def build_plan(self, round_detail: RoundDetail) -> QueryPlan:
        viewports = tile_viewports(
            MapShape(width=round_detail.map_width, height=round_detail.map_height),
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )

        # Score each (seed, viewport) by settlement count
        scored_items: list[tuple[float, int, int, Viewport]] = []
        for seed_index in range(round_detail.seeds_count):
            densities = _settlement_density_per_viewport(round_detail, seed_index, viewports)
            for vi, count in densities:
                scored_items.append((count, seed_index, vi, viewports[vi]))

        # Sort by settlement density (highest first)
        scored_items.sort(key=lambda x: (-x[0], x[1], x[2]))

        # Build plan: all coverage items but ordered by settlement density
        seen: set[tuple[int, int]] = set()
        ordered_items: list[QueryPlanItem] = []
        for count, seed_index, vi, viewport in scored_items:
            key = (seed_index, vi)
            if key in seen:
                continue
            seen.add(key)
            ordered_items.append(
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=seed_index,
                    viewport=viewport,
                    repeats=1,
                    tag="coverage_by_density",
                    diagnostic_score=count,
                )
            )

        # Add repeats of the top settlement-dense viewports
        if self.repeat_budget > 0:
            top = scored_items[:self.repeat_budget]
            repeat_items = [
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=item[1],
                    viewport=item[3],
                    repeats=1,
                    tag="density_repeat",
                    diagnostic_score=item[0],
                )
                for item in top
            ]
            ordered_items = repeat_items + ordered_items

        return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=ordered_items)


class HeavyRepeatPolicy(QueryPlanPolicy):
    """Trade coverage for many more repeats on high-value viewports.

    Instead of full 45-query coverage, cover only the most important
    viewports and use the freed budget for heavy repeating.
    """
    name: str = "heavy_repeat"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    coverage_seeds: int = Field(default=3, ge=1)  # only cover 3/5 seeds
    repeat_budget: int = Field(default=20, ge=0)
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def build_plan(self, round_detail: RoundDetail) -> QueryPlan:
        viewports = tile_viewports(
            MapShape(width=round_detail.map_width, height=round_detail.map_height),
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )

        effective_seeds = min(self.coverage_seeds, round_detail.seeds_count)

        # Rank seeds by total settlement count
        seed_settlement_counts = []
        for seed_index in range(round_detail.seeds_count):
            count = len(round_detail.initial_states[seed_index].settlements)
            seed_settlement_counts.append((count, seed_index))
        seed_settlement_counts.sort(reverse=True)
        selected_seeds = [s[1] for s in seed_settlement_counts[:effective_seeds]]

        # Coverage for selected seeds only
        coverage_items = [
            QueryPlanItem(
                round_id=round_detail.id,
                seed_index=seed_index,
                viewport=viewport,
                repeats=1,
                tag="coverage",
            )
            for seed_index in selected_seeds
            for viewport in viewports
        ]

        # Heavy repeats on the best viewports across ALL seeds
        all_ranked = []
        for seed_index in range(round_detail.seeds_count):
            ranked = rank_seed_viewports(
                round_detail, seed_index, viewports, scorer=self.motif_scorer,
            )
            all_ranked.extend(ranked)
        all_ranked.sort(key=lambda x: -x.diagnostic_score)

        repeat_items = []
        for item in all_ranked[:self.repeat_budget]:
            repeat_items.append(
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=item.seed_index,
                    viewport=item.viewport,
                    repeats=1,
                    tag="heavy_repeat",
                    diagnostic_score=item.diagnostic_score,
                ),
            )

        return QueryPlan(
            round_id=round_detail.id,
            policy_name=self.name,
            items=repeat_items + coverage_items,
        )
