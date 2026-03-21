from __future__ import annotations

import numpy as np

from astar.core.trajectory import LiveQueryObs
from astar.envs.base import TranscriptBeliefState
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.policy import build_interactive_policy
from astar.policy.coverage import CoverageThenReplicatePolicy
from tests.conftest import ROUND_ID


def test_exploration_plan_adds_one_repeat_per_seed(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    policy = CoverageThenReplicatePolicy(
        name="exploration_v2",
        viewport_w=5,
        viewport_h=5,
        replicate_budget=5,
        probe_first=True,
    )
    plan = policy.build_plan(round_record.round)

    coverage_items = [item for item in plan.items if item.tag == "coverage"]
    repeat_items = [item for item in plan.items if item.tag == "diagnostic_repeat"]

    assert len(coverage_items) == 20
    assert len(repeat_items) == 5
    assert {item.seed_index for item in repeat_items} == {0, 1, 2, 3, 4}
    assert all(item.repeats == 1 for item in repeat_items)
    assert all(item.diagnostic_score is not None for item in repeat_items)

    coverage_pairs = {
        (item.seed_index, item.viewport.x, item.viewport.y) for item in coverage_items
    }
    repeat_pairs = {(item.seed_index, item.viewport.x, item.viewport.y) for item in repeat_items}
    assert repeat_pairs.issubset(coverage_pairs)


def test_regime_probe_balances_initial_queries_across_seeds(sample_paths: WorkspacePaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    belief = TranscriptBeliefState(
        online_episode=round_context_to_online_episode(round_context),
    )
    policy = build_interactive_policy("regime_probe")

    seen_seeds: list[int] = []
    for query_index in range(round_record.round.seeds_count):
        query = policy.select(belief, 50 - query_index)
        assert query is not None
        seen_seeds.append(query.seed_index)
        initial_state = round_record.round.initial_states[query.seed_index]
        full_grid = np.asarray(initial_state.grid, dtype=np.int64)
        patch = full_grid[
            query.viewport.y : query.viewport.y + query.viewport.h,
            query.viewport.x : query.viewport.x + query.viewport.w,
        ]
        observation = LiveQueryObs(
            round_id=ROUND_ID,
            seed_index=query.seed_index,
            viewport=query.viewport,
            grid=patch,
            settlements=(),
            query_index=query_index,
        )
        belief = TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, observation)},
                    ),
                },
            ),
        )

    assert seen_seeds == list(range(round_record.round.seeds_count))


def test_regime_probe_posterior_falls_back_without_predictor(
    sample_paths: WorkspacePaths,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    belief = TranscriptBeliefState(
        online_episode=round_context_to_online_episode(round_context),
    )
    policy = build_interactive_policy("regime_probe_posterior")

    seen_seeds: list[int] = []
    for query_index in range(round_record.round.seeds_count):
        query = policy.select(belief, 50 - query_index)
        assert query is not None
        seen_seeds.append(query.seed_index)
        initial_state = round_record.round.initial_states[query.seed_index]
        full_grid = np.asarray(initial_state.grid, dtype=np.int64)
        patch = full_grid[
            query.viewport.y : query.viewport.y + query.viewport.h,
            query.viewport.x : query.viewport.x + query.viewport.w,
        ]
        observation = LiveQueryObs(
            round_id=ROUND_ID,
            seed_index=query.seed_index,
            viewport=query.viewport,
            grid=patch,
            settlements=(),
            query_index=query_index,
        )
        belief = TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, observation)},
                    ),
                },
            ),
        )

    assert seen_seeds == list(range(round_record.round.seeds_count))


def test_regime_probe_posterior_blend_falls_back_without_predictor(
    sample_paths: WorkspacePaths,
) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    belief = TranscriptBeliefState(
        online_episode=round_context_to_online_episode(round_context),
    )
    policy = build_interactive_policy("regime_probe_posterior_blend")

    seen_seeds: list[int] = []
    for query_index in range(round_record.round.seeds_count):
        query = policy.select(belief, 50 - query_index)
        assert query is not None
        seen_seeds.append(query.seed_index)
        initial_state = round_record.round.initial_states[query.seed_index]
        full_grid = np.asarray(initial_state.grid, dtype=np.int64)
        patch = full_grid[
            query.viewport.y : query.viewport.y + query.viewport.h,
            query.viewport.x : query.viewport.x + query.viewport.w,
        ]
        observation = LiveQueryObs(
            round_id=ROUND_ID,
            seed_index=query.seed_index,
            viewport=query.viewport,
            grid=patch,
            settlements=(),
            query_index=query_index,
        )
        belief = TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, observation)},
                    ),
                },
            ),
        )

    assert seen_seeds == list(range(round_record.round.seeds_count))
