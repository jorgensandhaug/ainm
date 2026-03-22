from __future__ import annotations

from astar.policy.coverage import CoverageThenReplicatePolicy
from astar.policy.query_plan import QueryPlanPolicy
from astar.student.predictor.ffam_config import is_ffam_model_name
from astar.student.predictor.ffam_knn_config import is_ffam_knn_model_name
from astar.student.predictor.ffam_mode_config import is_ffam_mode_model_name
from astar.student.predictor.query_residual_config import is_query_residual_model_name


def _is_ffam_ensemble_model_name(model_name: str) -> bool:
    """Lazy check to avoid circular imports."""
    normalized = model_name.strip().lower()
    return normalized == "ffam_ensemble" or normalized.startswith("ffam_ensemble_v")


def _is_ffam_pooled_model_name(model_name: str) -> bool:
    """Lazy check to avoid circular imports."""
    normalized = model_name.strip().lower()
    return normalized == "ffam_pooled" or normalized.startswith("ffam_pooled_v")
from astar.features.motifs import ViewportMotifScorer

DEFAULT_POLICY_NAME = "coverage"
QUERY_RESIDUAL_DEFAULT_POLICY_NAME = "exploration_r3"
FFAM_DEFAULT_POLICY_NAME = "exploration_r3"


def _entropy_bias_scorer() -> ViewportMotifScorer:
    return ViewportMotifScorer(
        settlement_weight=3.0,
        settlement_pair_weight=1.5,
        port_weight=1.0,
        coastal_settlement_weight=1.0,
        coastline_weight=3.0,
        terrain_entropy_weight=5.0,
        edge_density_weight=5.0,
        forest_weight=0.5,
        mountain_weight=0.5,
        ocean_penalty_weight=1.0,
    )


def _port_bias_scorer() -> ViewportMotifScorer:
    return ViewportMotifScorer(
        settlement_weight=6.0,
        settlement_pair_weight=4.0,
        port_weight=8.0,
        coastal_settlement_weight=7.0,
        coastline_weight=5.0,
        terrain_entropy_weight=1.5,
        edge_density_weight=1.5,
        forest_weight=0.25,
        mountain_weight=0.25,
        ocean_penalty_weight=0.75,
    )


def _frontier_bias_scorer() -> ViewportMotifScorer:
    return ViewportMotifScorer(
        settlement_weight=5.0,
        settlement_pair_weight=6.5,
        port_weight=2.0,
        coastal_settlement_weight=2.5,
        coastline_weight=3.0,
        terrain_entropy_weight=5.5,
        edge_density_weight=6.0,
        forest_weight=1.0,
        mountain_weight=1.0,
        ocean_penalty_weight=0.5,
    )


def default_policy_name_for_model(model_name: str | None = None) -> str:
    if model_name is not None and is_query_residual_model_name(model_name):
        return QUERY_RESIDUAL_DEFAULT_POLICY_NAME
    if model_name is not None and (is_ffam_model_name(model_name) or is_ffam_mode_model_name(model_name) or is_ffam_knn_model_name(model_name) or _is_ffam_ensemble_model_name(model_name) or _is_ffam_pooled_model_name(model_name)):
        return FFAM_DEFAULT_POLICY_NAME
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
    if normalized in {"exploration_r1", "exploration_v2_r1"}:
        return CoverageThenReplicatePolicy(
            name="exploration_r1",
            replicate_budget=1,
            probe_first=True,
        )
    if normalized in {"exploration_r2", "exploration_v2_r2"}:
        return CoverageThenReplicatePolicy(
            name="exploration_r2",
            replicate_budget=2,
            probe_first=True,
        )
    if normalized in {"exploration_r3", "exploration_v2_r3"}:
        return CoverageThenReplicatePolicy(
            name="exploration_r3",
            replicate_budget=3,
            probe_first=True,
        )
    if normalized == "exploration_r3_global":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_global",
            replicate_budget=3,
            probe_first=True,
            selection_mode="global_top",
        )
    if normalized == "exploration_r3_entropy":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_entropy",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=_entropy_bias_scorer(),
        )
    if normalized == "exploration_r3_global_entropy":
        return CoverageThenReplicatePolicy(
            name="exploration_r3_global_entropy",
            replicate_budget=3,
            probe_first=True,
            selection_mode="global_top",
            motif_scorer=_entropy_bias_scorer(),
        )
    if normalized == "exploration_port_r3":
        return CoverageThenReplicatePolicy(
            name="exploration_port_r3",
            replicate_budget=3,
            probe_first=True,
            motif_scorer=_port_bias_scorer(),
        )
    if normalized == "exploration_frontier_r3":
        return CoverageThenReplicatePolicy(
            name="exploration_frontier_r3",
            replicate_budget=3,
            probe_first=False,
            motif_scorer=_frontier_bias_scorer(),
        )
    if normalized == "exploration_hybrid_r3":
        return CoverageThenReplicatePolicy(
            name="exploration_hybrid_r3",
            replicate_budget=2,
            late_replicate_budget=1,
            probe_first=True,
            motif_scorer=_port_bias_scorer(),
            late_motif_scorer=_frontier_bias_scorer(),
        )
    if normalized == "exploration_hybrid_r3_global":
        return CoverageThenReplicatePolicy(
            name="exploration_hybrid_r3_global",
            replicate_budget=2,
            late_replicate_budget=1,
            probe_first=True,
            selection_mode="global_top",
            late_selection_mode="global_top",
            motif_scorer=_port_bias_scorer(),
            late_motif_scorer=_frontier_bias_scorer(),
        )
    if normalized in {"exploration_r4", "exploration_v2_r4"}:
        return CoverageThenReplicatePolicy(
            name="exploration_r4",
            replicate_budget=4,
            probe_first=True,
        )
    if normalized in {"exploration_r5", "exploration_v2_r5"}:
        return CoverageThenReplicatePolicy(
            name="exploration_r5",
            replicate_budget=5,
            probe_first=True,
        )
    if normalized == "exploration_r5_global":
        return CoverageThenReplicatePolicy(
            name="exploration_r5_global",
            replicate_budget=5,
            probe_first=True,
            selection_mode="global_top",
        )
    if normalized == "exploration_r5_port":
        return CoverageThenReplicatePolicy(
            name="exploration_r5_port",
            replicate_budget=5,
            probe_first=True,
            motif_scorer=_port_bias_scorer(),
        )
    if normalized == "exploration_r5_frontier":
        return CoverageThenReplicatePolicy(
            name="exploration_r5_frontier",
            replicate_budget=5,
            probe_first=True,
            motif_scorer=_frontier_bias_scorer(),
        )
    if normalized == "exploration_hybrid_r5":
        return CoverageThenReplicatePolicy(
            name="exploration_hybrid_r5",
            replicate_budget=3,
            late_replicate_budget=2,
            probe_first=True,
            motif_scorer=_port_bias_scorer(),
            late_motif_scorer=_frontier_bias_scorer(),
        )
    if normalized == "exploration_r5_entropy":
        return CoverageThenReplicatePolicy(
            name="exploration_r5_entropy",
            replicate_budget=5,
            probe_first=True,
            motif_scorer=_entropy_bias_scorer(),
        )
    # Smart query policies
    if normalized == "concentrated_r5":
        from astar.policy.smart_query import ConcentratedRepeatPolicy
        return ConcentratedRepeatPolicy(
            name="concentrated_r5",
            repeat_budget=5,
            probe_first=True,
        )
    if normalized == "concentrated_r3":
        from astar.policy.smart_query import ConcentratedRepeatPolicy
        return ConcentratedRepeatPolicy(
            name="concentrated_r3",
            repeat_budget=3,
            probe_first=True,
        )
    if normalized == "settlement_focused_r3":
        from astar.policy.smart_query import SettlementFocusedPolicy
        return SettlementFocusedPolicy(
            name="settlement_focused_r3",
            repeat_budget=3,
        )
    if normalized == "settlement_focused_r5":
        from astar.policy.smart_query import SettlementFocusedPolicy
        return SettlementFocusedPolicy(
            name="settlement_focused_r5",
            repeat_budget=5,
        )
    if normalized == "heavy_repeat_3s":
        from astar.policy.smart_query import HeavyRepeatPolicy
        return HeavyRepeatPolicy(
            name="heavy_repeat_3s",
            coverage_seeds=3,
            repeat_budget=23,  # 3 seeds × 9 vp = 27 coverage + 23 repeats = 50
        )
    if normalized == "heavy_repeat_4s":
        from astar.policy.smart_query import HeavyRepeatPolicy
        return HeavyRepeatPolicy(
            name="heavy_repeat_4s",
            coverage_seeds=4,
            repeat_budget=14,  # 4 seeds × 9 vp = 36 coverage + 14 repeats = 50
        )
    msg = f"unsupported policy: {name}"
    raise ValueError(msg)
