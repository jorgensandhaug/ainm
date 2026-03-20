from __future__ import annotations

from astar.models.latent_regime import LatentRegimePredictor
from astar.observe.policies.coverage_then_replicate import CoverageThenReplicatePolicy
from astar.workflows.specs import LiveRunSpec

spec = LiveRunSpec(
    name="explore_v1",
    description=(
        "Full-sweep coverage plus one diagnostic replicate per seed, with a geometry prior "
        "updated by a shared round-latent heuristic posterior."
    ),
    policy=CoverageThenReplicatePolicy(replicate_budget=5),
    predictor=LatentRegimePredictor(),
    submit_predictions=True,
)
