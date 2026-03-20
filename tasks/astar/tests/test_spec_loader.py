from __future__ import annotations

from astar.spec_loader import load_object
from astar.workflows.specs import LiveRunSpec


def test_load_live_run_spec() -> None:
    loaded = load_object("experiments.live.explore_v1:spec")
    assert isinstance(loaded, LiveRunSpec)
    assert loaded.name == "explore_v1"
