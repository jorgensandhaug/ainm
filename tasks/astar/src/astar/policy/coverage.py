from __future__ import annotations

from typing import Literal

from pydantic import Field

from astar.core.grid import MapShape, TileSpec, tile_viewports
from astar.features.motifs import ViewportMotifScorer, rank_seed_viewports
from astar.infra.api.dto import RoundDetail
from astar.observe.query_plan import QueryPlan, QueryPlanItem
from astar.policy.query_plan import QueryPlanPolicy


class CoverageThenReplicatePolicy(QueryPlanPolicy):
    name: str = "coverage_then_replicate_v1"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    replicate_budget: int = Field(default=5, ge=0)
    probe_first: bool = True
    replicate_strategy: Literal["per_seed_top", "global_top", "global_best_repeated"] = "per_seed_top"
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    @staticmethod
    def _sort_key(item: object) -> tuple[float, int, int, int]:
        diagnostic = item
        return (
            -diagnostic.diagnostic_score,
            diagnostic.seed_index,
            diagnostic.viewport.y,
            diagnostic.viewport.x,
        )

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

        ranked_per_seed = [
            rank_seed_viewports(
                round_detail,
                seed_index,
                viewports,
                scorer=self.motif_scorer,
            )
            for seed_index in range(round_detail.seeds_count)
        ]
        diagnostic_items: list[QueryPlanItem]
        if self.replicate_strategy == "per_seed_top":
            ranked = sorted([diagnostics[0] for diagnostics in ranked_per_seed], key=self._sort_key)
            selected = ranked[: self.replicate_budget]
            diagnostic_items = [
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=item.seed_index,
                    viewport=item.viewport,
                    repeats=1,
                    tag="diagnostic_repeat",
                    diagnostic_score=item.diagnostic_score,
                )
                for item in selected
            ]
        elif self.replicate_strategy == "global_top":
            ranked = sorted(
                [item for diagnostics in ranked_per_seed for item in diagnostics],
                key=self._sort_key,
            )
            selected = ranked[: self.replicate_budget]
            diagnostic_items = [
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=item.seed_index,
                    viewport=item.viewport,
                    repeats=1,
                    tag="diagnostic_repeat",
                    diagnostic_score=item.diagnostic_score,
                )
                for item in selected
            ]
        elif self.replicate_strategy == "global_best_repeated":
            ranked = sorted(
                [item for diagnostics in ranked_per_seed for item in diagnostics],
                key=self._sort_key,
            )
            if not ranked:
                return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=items)
            best = ranked[0]
            diagnostic_items = [
                QueryPlanItem(
                    round_id=round_detail.id,
                    seed_index=best.seed_index,
                    viewport=best.viewport,
                    repeats=self.replicate_budget,
                    tag="diagnostic_repeat",
                    diagnostic_score=best.diagnostic_score,
                ),
            ]
        else:
            msg = f"unsupported replicate_strategy: {self.replicate_strategy}"
            raise ValueError(msg)
        if self.probe_first:
            items = diagnostic_items + items
        else:
            items = items + diagnostic_items
        return QueryPlan(round_id=round_detail.id, policy_name=self.name, items=items)
