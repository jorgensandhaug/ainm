from __future__ import annotations

from astar.core.grid import Viewport
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.historical import HistoricalReplayOracle
from astar.envs.synthetic import SyntheticActiveOracle
from astar.envs.types import ViewportQuery
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_historical_and_synthetic_oracles_expose_online_round_surface(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    historical = HistoricalReplayOracle(paths=sample_paths)
    synthetic = SyntheticActiveOracle(paths=sample_paths)

    round_context = historical.get_round_context(ROUND_ID)
    assert round_context.round_id == ROUND_ID
    assert len(round_context.seeds) == 5

    query = ViewportQuery(
        seed_index=0,
        viewport=Viewport(x=0, y=0, w=15, h=15),
    )
    observation = synthetic.sample_view(ROUND_ID, query, rng_seed=1)
    assert observation.seed_index == 0
    assert observation.grid.shape == (observation.viewport.h, observation.viewport.w)
    assert observation.viewport.w <= 15
    assert observation.viewport.h <= 15

    truth = historical.get_ground_truth(ROUND_ID)
    assert set(truth.truths_by_seed) == {0, 1, 2, 3, 4}


def test_online_inference_context_exposes_only_online_safe_seed_state(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_context = HistoricalReplayOracle(paths=sample_paths).get_round_context(ROUND_ID)
    context = round_context_to_live_inference_context(round_context)

    seed = context.round_context.seeds[0]
    assert seed.seed_index == 0
    assert not hasattr(seed, "replay_runs")
    assert not hasattr(seed, "terminal_truth")
    assert not hasattr(context, "round_episode")
