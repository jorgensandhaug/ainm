from __future__ import annotations

import numpy as np
import pytest

from astar.core.grid import Viewport
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs
from astar.infra.api.dto import InitialSettlement, InitialState, RoundDetail
from astar.student.posterior.transcript_set import (
    WINDOW_DYNAMIC_FEATURE_NAMES,
    build_round_initial_feature_vector,
    build_transcript_summary_vector,
    build_transcript_window_set,
)


def _round_detail() -> RoundDetail:
    return RoundDetail(
        id="round-1",
        round_number=1,
        status="completed",
        map_width=3,
        map_height=3,
        seeds_count=2,
        initial_states=[
            InitialState(
                grid=[
                    [0, 0, 10],
                    [0, 4, 10],
                    [5, 11, 11],
                ],
                settlements=[
                    InitialSettlement(x=0, y=0, has_port=False),
                    InitialSettlement(x=1, y=1, has_port=True),
                ],
            ),
            InitialState(
                grid=[
                    [0, 11, 10],
                    [0, 4, 10],
                    [5, 11, 11],
                ],
                settlements=[],
            ),
        ],
    )


def _observations() -> tuple[LiveQueryObs, ...]:
    return (
        LiveQueryObs(
            round_id="round-1",
            seed_index=0,
            query_index=0,
            viewport=Viewport(x=0, y=0, w=2, h=2),
            grid=np.asarray([[1, 0], [0, 2]], dtype=np.int64),
            settlements=(
                LiveSettlementObs(
                    x=0,
                    y=0,
                    population=4.5,
                    food=1.1,
                    wealth=1.5,
                    defense=1.0,
                    has_port=False,
                    alive=True,
                    owner_id=1,
                ),
                LiveSettlementObs(
                    x=1,
                    y=1,
                    population=2.25,
                    food=0.55,
                    wealth=0.75,
                    defense=0.5,
                    has_port=True,
                    alive=True,
                    owner_id=1,
                ),
            ),
        ),
        LiveQueryObs(
            round_id="round-1",
            seed_index=0,
            query_index=1,
            viewport=Viewport(x=0, y=0, w=2, h=2),
            grid=np.asarray([[3, 0], [0, 2]], dtype=np.int64),
            settlements=(
                LiveSettlementObs(
                    x=1,
                    y=1,
                    population=2.25,
                    food=0.55,
                    wealth=0.75,
                    defense=0.5,
                    has_port=True,
                    alive=False,
                    owner_id=2,
                ),
            ),
        ),
        LiveQueryObs(
            round_id="round-1",
            seed_index=1,
            query_index=2,
            viewport=Viewport(x=1, y=0, w=2, h=2),
            grid=np.asarray([[0, 10], [4, 10]], dtype=np.int64),
            settlements=(),
        ),
    )


def test_build_transcript_window_set_groups_repeated_windows() -> None:
    window_set = build_transcript_window_set(_round_detail(), _observations())

    assert window_set.query_count == 3
    assert window_set.unique_window_count == 2
    repeated_group = window_set.groups[0]
    assert repeated_group.key.seed_index == 0
    assert len(repeated_group.observations) == 2
    assert np.isclose(repeated_group.repeat_query_fraction, 2.0 / 50.0)

    settlement_index = WINDOW_DYNAMIC_FEATURE_NAMES.index("final_class_freq::settlement")
    port_index = WINDOW_DYNAMIC_FEATURE_NAMES.index("final_class_freq::port")
    ruin_index = WINDOW_DYNAMIC_FEATURE_NAMES.index("final_class_freq::ruin")
    mean_population_index = WINDOW_DYNAMIC_FEATURE_NAMES.index("mean_population_norm")

    assert np.isclose(repeated_group.mean_dynamic_features[settlement_index], 0.125)
    assert np.isclose(repeated_group.mean_dynamic_features[port_index], 0.25)
    assert np.isclose(repeated_group.mean_dynamic_features[ruin_index], 0.125)
    assert np.isclose(repeated_group.mean_dynamic_features[mean_population_index], 0.625)


def test_build_transcript_summary_vector_is_order_invariant_and_repeat_aware() -> None:
    round_detail = _round_detail()
    observations = _observations()

    names_a, vector_a = build_transcript_summary_vector(round_detail, observations)
    names_b, vector_b = build_transcript_summary_vector(round_detail, tuple(reversed(observations)))
    _, vector_c = build_transcript_summary_vector(round_detail, observations[1:])

    assert names_a == names_b
    assert len(names_a) == len(vector_a)
    np.testing.assert_allclose(vector_a, vector_b)

    global_query_index = names_a.index("global::query_fraction")
    seed_zero_repeat_index = names_a.index("seed[0]::max_repeat_fraction")

    assert np.isclose(vector_a[global_query_index], 3.0 / 50.0)
    assert np.isclose(vector_c[global_query_index], 2.0 / 50.0)
    assert np.isclose(vector_a[seed_zero_repeat_index], 2.0 / 50.0)
    assert np.isclose(vector_c[seed_zero_repeat_index], 1.0 / 50.0)
    assert not np.allclose(vector_a, vector_c)


def test_transcript_summary_vector_includes_round_initial_features_without_queries() -> None:
    round_detail = _round_detail()

    initial_names, initial_vector = build_round_initial_feature_vector(round_detail)
    summary_names, summary_vector = build_transcript_summary_vector(round_detail, ())

    assert summary_names[: len(initial_names)] == initial_names
    np.testing.assert_allclose(summary_vector[: len(initial_vector)], initial_vector)

    settlement_density_index = initial_names.index("round::seed_mean::initial_settlement_density")
    assert initial_vector[settlement_density_index] > 0.0


def test_transcript_summary_rejects_observation_grid_shape_mismatch() -> None:
    with pytest.raises(ValueError, match="grid shape does not match viewport"):
        build_transcript_window_set(
            _round_detail(),
            (
                LiveQueryObs(
                    round_id="round-1",
                    seed_index=0,
                    query_index=0,
                    viewport=Viewport(x=0, y=0, w=2, h=2),
                    grid=np.asarray([[1, 0]], dtype=np.int64),
                    settlements=(),
                ),
            ),
        )


def test_transcript_summary_rejects_settlement_outside_viewport() -> None:
    with pytest.raises(ValueError, match="outside viewport"):
        build_transcript_window_set(
            _round_detail(),
            (
                LiveQueryObs(
                    round_id="round-1",
                    seed_index=0,
                    query_index=0,
                    viewport=Viewport(x=0, y=0, w=2, h=2),
                    grid=np.asarray([[1, 0], [0, 2]], dtype=np.int64),
                    settlements=(
                        LiveSettlementObs(
                            x=2,
                            y=2,
                            population=1.0,
                            food=1.0,
                            wealth=1.0,
                            defense=1.0,
                            has_port=False,
                            alive=True,
                            owner_id=1,
                        ),
                    ),
                ),
            ),
        )
