from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from astar.envs.historical import _cached_round_episode
from astar.envs.synthetic import SyntheticActiveOracle
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.history.datasets.teacher_terminal import build_teacher_terminal_dataset
from astar.history.datasets.teacher_transition import build_teacher_transition_dataset
from astar.infra.api.dto import (
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    SettlementObservation,
    StoredReplayRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record, write_replay_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.workflows.online_episode import run_online_episode
from tests.conftest import ROUND_ID


def _write_sample_replay(
    paths: RepoPaths,
    *,
    round_id: str = ROUND_ID,
    seed_index: int,
    capture_id: str,
    sim_seed: int,
) -> None:
    round_record = read_round_record(paths, round_id)
    base_grid = [row[:] for row in round_record.round.initial_states[seed_index].grid]
    built_grid = [row[:] for row in base_grid]
    ruined_grid = [row[:] for row in built_grid]
    built_grid[seed_index][seed_index] = 1
    built_grid[seed_index][seed_index + 1] = 2
    ruined_grid[seed_index][seed_index] = 3
    ruined_grid[seed_index + 1][seed_index] = 4
    settlement = SettlementObservation(
        x=seed_index,
        y=seed_index,
        population=1.5 + seed_index,
        food=0.4,
        wealth=0.6,
        defense=0.7,
        has_port=(seed_index % 2 == 0),
        alive=True,
        owner_id=seed_index,
    )
    record = StoredReplayRecord(
        capture_id=capture_id,
        requested_at=datetime.now(UTC),
        git_sha="test",
        request=ReplayRequest(round_id=round_id, seed_index=seed_index),
        response=ReplayResponse(
            round_id=round_id,
            seed_index=seed_index,
            sim_seed=sim_seed,
            width=round_record.round.map_width,
            height=round_record.round.map_height,
            frames=[
                ReplayFrame(step=0, grid=base_grid, settlements=[settlement]),
                ReplayFrame(step=1, grid=built_grid, settlements=[settlement]),
                ReplayFrame(step=2, grid=ruined_grid, settlements=[settlement]),
            ],
        ),
    )
    write_replay_record(paths, record)


def _write_replays_for_all_seeds(
    paths: RepoPaths,
    run_count: int = 1,
    *,
    round_id: str = ROUND_ID,
) -> None:
    for seed_index in range(5):
        for run_index in range(run_count):
            _write_sample_replay(
                paths,
                round_id=round_id,
                seed_index=seed_index,
                capture_id=f"seed{seed_index}_run{run_index}",
                sim_seed=1000 + seed_index * 10 + run_index,
            )


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


def test_resolve_synthetic_episode_path_recovers_from_stale_absolute_index_path(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_portability_test",
    )
    local_path = dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    stale_path = Path("/tmp/old-worktree/data/artifacts/datasets/synthetic_live_portability_test/episodes") / local_path.name

    resolved = resolve_synthetic_episode_path(dataset.dataset_dir, stale_path)

    assert resolved == local_path


def test_synthetic_live_dataset_respects_budget_override(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _cached_round_episode.cache_clear()

    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_budget_override_test",
        budget=3,
    )
    artifact_path = dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    artifact = load_synthetic_episode(artifact_path)
    summary = json.loads(dataset.summary_path.read_text(encoding="utf-8"))

    assert artifact.budget == 3
    assert len(artifact.observations) == 3
    assert summary["budget"] == 3
    assert _cached_round_episode.cache_info().currsize == 0
