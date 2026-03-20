from __future__ import annotations

from astar.observe.evidence import build_round_evidence
from astar.storage.manifests import RepoPaths
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
