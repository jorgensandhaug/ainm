from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.observe.evidence import build_round_evidence
from tests.conftest import ROUND_ID


def test_build_round_evidence_tracks_repeats(sample_paths: RepoPaths) -> None:
    evidence = build_round_evidence(sample_paths, ROUND_ID)
    seed_zero = evidence.per_seed[0]
    seed_one = evidence.per_seed[1]

    assert evidence.total_queries == 3
    assert seed_zero.query_count == 2
    assert seed_one.query_count == 1
    assert seed_zero.repeated_window_groups == 1
    assert int(seed_zero.observed_class_counts.sum()) == 50

from astar.core.trajectory import LiveQueryObs, LiveSettlementObs
from astar.core.grid import Viewport
from astar.observe.evidence import _build_seed_evidence_bundle
import numpy as np

def test_build_seed_evidence_bundle_resists_overlap_skew() -> None:
    # A base scenario with 2 distinct queries (no overlap)
    obs1 = LiveQueryObs(
        round_id="test", seed_index=0, query_index=0,
        viewport=Viewport(x=0, y=0, w=1, h=1),
        grid=np.array([[1]]), # class 1 (settlement)
        settlements=[
            LiveSettlementObs(x=0, y=0, population=100.0, food=None, wealth=None, defense=None, has_port=False, alive=True, owner_id=1)
        ]
    )
    obs2 = LiveQueryObs(
        round_id="test", seed_index=0, query_index=1,
        viewport=Viewport(x=1, y=1, w=1, h=1),
        grid=np.array([[2]]), # class 2 (port)
        settlements=[
            LiveSettlementObs(x=1, y=1, population=200.0, food=None, wealth=None, defense=None, has_port=True, alive=True, owner_id=1)
        ]
    )
    
    bundle_base = _build_seed_evidence_bundle(
        round_id="test", seed_index=0, map_width=10, map_height=10,
        observations=[obs1, obs2]
    )
    
    # Verify base frequencies: 50% class 1, 50% class 2. Population mean: 150.
    assert bundle_base.observed_class_frequencies[1] == 0.5
    assert bundle_base.observed_class_frequencies[2] == 0.5
    assert bundle_base.mean_population == 150.0

    # A skewed scenario: we query the first spot 99 more times!
    obs_skewed = [obs1] * 100 + [obs2]
    bundle_skewed = _build_seed_evidence_bundle(
        round_id="test", seed_index=0, map_width=10, map_height=10,
        observations=obs_skewed
    )

    # The spatial decoupling should ensure frequencies and means remain identical!
    np.testing.assert_allclose(
        bundle_skewed.observed_class_frequencies,
        bundle_base.observed_class_frequencies,
        err_msg="Class frequencies were skewed by overlapping queries!"
    )
    assert bundle_skewed.mean_population == 150.0, "Population mean was skewed by overlapping queries!"
