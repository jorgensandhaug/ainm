from __future__ import annotations

from typing import Literal

from pydantic import Field

from astar.core.grid import MapShape, TileSpec, tile_viewports
from astar.features.motifs import ViewportMotifScore, ViewportMotifScorer, rank_seed_viewports
from astar.infra.api.dto import RoundDetail
from astar.observe.query_plan import QueryPlan, QueryPlanItem
from astar.policy.query_plan import QueryPlanPolicy


class CoverageThenReplicatePolicy(QueryPlanPolicy):
    name: str = "coverage_then_replicate_v1"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    replicate_budget: int = Field(default=5, ge=0)
    probe_first: bool = True
    selection_mode: Literal["per_seed_best", "global_top"] = "per_seed_best"
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def _repeat_candidates(
        self,
        round_detail: RoundDetail,
        viewports: list,
    ) -> list[ViewportMotifScore]:
        ranked_per_seed = [
            rank_seed_viewports(
                round_detail,
                seed_index,
                viewports,
                scorer=self.motif_scorer,
            )
            for seed_index in range(round_detail.seeds_count)
        ]
        if self.selection_mode == "global_top":
            return [item for ranked in ranked_per_seed for item in ranked]
        return [ranked[0] for ranked in ranked_per_seed]

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

        ranked = sorted(
            self._repeat_candidates(round_detail, viewports),
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
