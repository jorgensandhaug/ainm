from __future__ import annotations

from pydantic import Field

from astar.core.grid import MapShape, TileSpec, tile_viewports
from astar.features.motifs import ViewportMotifScorer, rank_seed_viewports
from astar.infra.api.dto import RoundDetail
from astar.observe.policies.base import BaseQueryPolicy
from astar.observe.query_plan import QueryPlan, QueryPlanItem


class CoverageThenReplicatePolicy(BaseQueryPolicy):
    name: str = "coverage_then_replicate_v1"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    replicate_budget: int = Field(default=5, ge=0)
    probe_first: bool = True
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def build_plan(self, round_detail: RoundDetail) -> QueryPlan:
        viewports = tile_viewports(
            MapShape(width=round_detail.map_width, height=round_detail.map_height),
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )
        items = [
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
        if self.replicate_budget <= 0:
            return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=items)

        top_per_seed = [
            rank_seed_viewports(
                round_detail,
                seed_index,
                viewports,
                scorer=self.motif_scorer,
            )[0]
            for seed_index in range(round_detail.seeds_count)
        ]
        ranked = sorted(
            top_per_seed,
            key=lambda item: (
                -item.diagnostic_score,
                item.seed_index,
                item.viewport.y,
                item.viewport.x,
            ),
        )
        selected = ranked[: self.replicate_budget]
        diagnostic_items: list[QueryPlanItem] = []
        for item in selected:
            diagnostic_items.append(
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=item.seed_index,
                    viewport=item.viewport,
                    repeats=1,
                    tag="diagnostic_repeat",
                    diagnostic_score=item.diagnostic_score,
                ),
            )
        if self.probe_first:
            items = diagnostic_items + items
        else:
            items = items + diagnostic_items
        return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=items)
