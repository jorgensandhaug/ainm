from __future__ import annotations

import numpy as np

from astar.features.coasts import coast_mask, normalized_coast_distance
from astar.features.geometry import compute_round_features
from astar.features.influence import (
    normalized_sea_distance_to_initial_ports,
    settlement_basin_gap,
)
from astar.features.reachability import normalize_distances
from astar.infra.api.dto import InitialSettlement
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from tests.conftest import ROUND_ID


def test_compute_round_features_has_expected_channels(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    bundle = compute_round_features(round_record.round)
    seed_features = bundle.per_seed[0]

    expected_shape = (round_record.round.map_height, round_record.round.map_width)
    assert seed_features.feature("buildable").shape == expected_shape
    assert seed_features.feature("frontier_score").shape == expected_shape
    assert seed_features.feature("coast_distance_steps").shape == expected_shape
    assert seed_features.feature("land_distance_to_settlement_steps_log1p").shape == expected_shape
    assert seed_features.feature("sea_distance_to_port_unreachable").shape == expected_shape
    assert seed_features.feature("settlement_basin_gap_decay_4").shape == expected_shape
    assert np.all(seed_features.feature("coastal_exposure") >= 0.0)
    assert np.all(seed_features.feature("coastal_exposure") <= 1.0)


def test_normalize_distances_keeps_unreachable_distinct_from_farthest_reachable() -> None:
    distances = np.asarray([[0, 1, 2, -1]], dtype=np.int64)

    normalized = normalize_distances(distances)

    assert np.allclose(normalized, np.asarray([[0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0]]))


def test_settlement_basin_gap_preserves_finite_gap_scale(
) -> None:
    grid = np.asarray([[0, 0, 0, 5, 0, 0, 0]], dtype=np.int64)
    settlements = [
        InitialSettlement(x=0, y=0, has_port=False),
        InitialSettlement(x=2, y=0, has_port=False),
        InitialSettlement(x=6, y=0, has_port=False),
    ]

    gap = settlement_basin_gap(grid, settlements)

    assert np.isclose(gap[0, 0], 2.0 / 3.0)
    assert np.isclose(gap[0, 1], 0.0)
    assert np.isclose(gap[0, 5], 1.0)


def test_coast_mask_counts_diagonal_shore_contact() -> None:
    grid = np.asarray(
        [
            [10, 0, 10],
            [0, 0, 0],
            [10, 0, 10],
        ],
        dtype=np.int64,
    )

    coast = coast_mask(grid)

    assert bool(coast[1, 1])


def test_normalized_coast_distance_treats_mountains_as_barriers() -> None:
    grid = np.asarray([[0, 5, 0, 10]], dtype=np.int64)

    distance = normalized_coast_distance(grid)

    assert np.isclose(distance[0, 2], 0.0)
    assert np.isclose(distance[0, 0], 1.0)


def test_sea_distance_falls_back_to_coastal_settlements_when_no_initial_ports() -> None:
    grid = np.asarray(
        [
            [10, 10, 10],
            [0, 0, 0],
            [0, 0, 0],
        ],
        dtype=np.int64,
    )
    settlements = [InitialSettlement(x=1, y=1, has_port=False)]

    distance = normalized_sea_distance_to_initial_ports(grid, settlements)

    assert np.isclose(distance[1, 1], 0.0)
    assert np.min(distance) < 1.0
