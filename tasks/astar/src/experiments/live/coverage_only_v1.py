from __future__ import annotations

from astar.models.geometry_baseline import GeometryPriorPredictor
from astar.observe.policies.coverage_then_replicate import CoverageThenReplicatePolicy
from astar.workflows.specs import LiveRunSpec

spec = LiveRunSpec(
    name="coverage_only_v1",
    description="Simple geometry prior with pure coverage and no replicates.",
    policy=CoverageThenReplicatePolicy(name="coverage_only_v1", replicate_budget=0),
    predictor=GeometryPriorPredictor(),
    submit_predictions=True,
)
