from __future__ import annotations

import numpy as np

from astar.features.geometry import compute_round_features
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
    assert np.all(seed_features.feature("coastal_exposure") >= 0.0)
    assert np.all(seed_features.feature("coastal_exposure") <= 1.0)
