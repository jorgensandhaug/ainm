from __future__ import annotations

from astar.features.motifs import ViewportMotifScorer
from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.query_plan import QueryPlanPolicy


def build_named_policy(name: str) -> QueryPlanPolicy:
    normalized = name.strip().lower()
    if normalized == "coverage":
        return CoverageThenReplicatePolicy(
            name="coverage",
            replicate_budget=0,
            probe_first=False,
        )
    if normalized in ("exploration", "exploration_v2"):
        return CoverageThenReplicatePolicy(
            name="exploration_v2",
            replicate_budget=5,
            probe_first=True,
        )
    if normalized == "exploration_r1":
        return CoverageThenReplicatePolicy(
            name="exploration_r1",
            replicate_budget=1,
            probe_first=True,
        )
    if normalized == "exploration_r2":
        return CoverageThenReplicatePolicy(
            name="exploration_r2",
            replicate_budget=2,
            probe_first=True,
        )
    if normalized == "exploration_r3":
        return CoverageThenReplicatePolicy(
            name="exploration_r3",
            replicate_budget=3,
            probe_first=True,
        )
    if normalized == "exploration_r4":
        return CoverageThenReplicatePolicy(
            name="exploration_r4",
            replicate_budget=4,
            probe_first=True,
        )
    if normalized == "exploration_r3_settle_heavy":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_settle_heavy",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=ViewportMotifScorer(
                settlement_weight=10.0,
                settlement_pair_weight=5.0,
                port_weight=3.0,
                coastal_settlement_weight=4.0,
                coastline_weight=1.0,
                terrain_entropy_weight=1.0,
                edge_density_weight=1.0,
            ),
        )
    if normalized == "exploration_r5_settle_heavy":
        return CoverageThenReplicatePolicy(
            name="exploration_r5_settle_heavy",
            replicate_budget=5,
            probe_first=True,
            motif_scorer=ViewportMotifScorer(
                settlement_weight=10.0,
                settlement_pair_weight=5.0,
                port_weight=3.0,
                coastal_settlement_weight=4.0,
                coastline_weight=1.0,
                terrain_entropy_weight=1.0,
                edge_density_weight=1.0,
            ),
        )
    if normalized == "exploration_r3_settle_medium":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_settle_medium",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=ViewportMotifScorer(
                settlement_weight=6.0,
                settlement_pair_weight=3.0,
                port_weight=2.0,
                coastal_settlement_weight=3.0,
                coastline_weight=1.5,
                terrain_entropy_weight=1.5,
                edge_density_weight=1.5,
                forest_weight=0.25,
                mountain_weight=0.25,
                ocean_penalty_weight=1.5,
            ),
        )
    if normalized == "exploration_r3_settle_light":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_settle_light",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=ViewportMotifScorer(
                settlement_weight=4.0,
                settlement_pair_weight=2.0,
                port_weight=1.5,
                coastal_settlement_weight=2.0,
                coastline_weight=2.0,
                terrain_entropy_weight=2.0,
                edge_density_weight=2.0,
                forest_weight=0.3,
                mountain_weight=0.3,
                ocean_penalty_weight=1.0,
            ),
        )
    if normalized == "exploration_r3_settle_8x":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_settle_8x",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=ViewportMotifScorer(
                settlement_weight=8.0,
                settlement_pair_weight=4.0,
                port_weight=2.5,
                coastal_settlement_weight=3.5,
                coastline_weight=1.0,
                terrain_entropy_weight=1.0,
                edge_density_weight=1.0,
                forest_weight=0.15,
                mountain_weight=0.15,
                ocean_penalty_weight=1.5,
            ),
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
