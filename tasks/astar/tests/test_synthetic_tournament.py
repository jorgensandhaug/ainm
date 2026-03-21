from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.synthetic_tournament import run_synthetic_tournament
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_synthetic_tournament_runs_end_to_end(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=3)

    result = run_synthetic_tournament(
        sample_paths,
        round_id=ROUND_ID,
        predictor=build_online_predictor("latent_regime"),
        policy=build_interactive_policy("coverage"),
        budget=6,
        episode_seed=2,
    )

    assert result.round_id == ROUND_ID
    assert result.executed_queries == 6
    assert len(result.query_trace) == 6
    assert set(result.score_by_seed) == {0, 1, 2, 3, 4}
    assert 0.0 <= result.mean_score <= 100.0
    assert result.artifact_path.exists()
