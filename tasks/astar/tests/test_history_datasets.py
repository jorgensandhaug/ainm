from __future__ import annotations

from astar.envs.synthetic import SyntheticActiveOracle
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
)
from astar.history.datasets.teacher_terminal import build_teacher_terminal_dataset
from astar.history.datasets.teacher_transition import build_teacher_transition_dataset
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.workflows.online_episode import run_online_episode
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def test_teacher_datasets_build_from_replay_backed_round(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    transition_dataset = build_teacher_transition_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        dataset_name="teacher_transition_test",
    )
    terminal_dataset = build_teacher_terminal_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        dataset_name="teacher_terminal_test",
    )

    assert transition_dataset.row_count > 0
    assert transition_dataset.index_path is not None
    assert transition_dataset.index_path.exists()
    assert terminal_dataset.row_count == 5
    assert terminal_dataset.index_path is not None
    assert terminal_dataset.index_path.exists()


def test_synthetic_live_dataset_builds_episode_artifacts(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=2,
        dataset_name="synthetic_live_test",
    )

    assert dataset.row_count == 2
    assert dataset.episode_count == 2
    assert dataset.index_path is not None
    assert dataset.index_path.exists()

    artifact_path = dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    artifact = load_synthetic_episode(artifact_path)
    assert artifact.round_id == ROUND_ID
    assert artifact.policy_name == "coverage"
    assert len(artifact.observations) > 0
    assert artifact.regime_vector.ndim == 1
    assert set(artifact.target_paths) == {0, 1, 2, 3, 4}


def test_synthetic_live_dataset_matches_shared_online_episode_runtime(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=3)

    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_runtime_match_test",
    )
    artifact_path = dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    artifact = load_synthetic_episode(artifact_path)

    oracle = SyntheticActiveOracle(paths=sample_paths)
    policy = build_interactive_policy("coverage")
    round_context = oracle.get_round_context(ROUND_ID)
    budget = sum(
        item.repeats
        for item in policy.policy.build_plan(round_context.to_round_detail()).items
    )
    episode_run = run_online_episode(
        oracle,
        round_id=ROUND_ID,
        predictor=TranscriptRecorderPredictor(),
        policy=policy,
        budget=budget,
        episode_seed=0,
    )

    runtime_observations = episode_run.belief.observations
    assert len(artifact.observations) == len(runtime_observations)
    for artifact_obs, runtime_obs in zip(artifact.observations, runtime_observations, strict=True):
        assert artifact_obs.round_id == runtime_obs.round_id
        assert artifact_obs.seed_index == runtime_obs.seed_index
        assert artifact_obs.viewport == runtime_obs.viewport
        assert artifact_obs.query_index == runtime_obs.query_index
        assert artifact_obs.grid.tolist() == runtime_obs.grid.tolist()
        assert [item.model_dump(mode="json") for item in artifact_obs.settlements] == [
            item.model_dump(mode="json") for item in runtime_obs.settlements
        ]
