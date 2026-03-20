from __future__ import annotations

from astar.envs.synthetic import SyntheticActiveOracle
from astar.policy.interactive import build_interactive_policy
from astar.storage.manifests import RepoPaths
from astar.student.predictor.interactive import build_legacy_online_predictor
from astar.workflows.online_episode import run_online_episode
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_run_online_episode_uses_generic_oracle_loop(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=3)

    result = run_online_episode(
        SyntheticActiveOracle(paths=sample_paths),
        round_id=ROUND_ID,
        predictor=build_legacy_online_predictor("geometry_prior"),
        policy=build_interactive_policy("coverage"),
        budget=4,
        episode_seed=1,
    )

    assert result.executed_queries == 4
    assert len(result.query_trace) == 4
    assert set(result.prediction_bundle.predictions_by_seed) == {0, 1, 2, 3, 4}
