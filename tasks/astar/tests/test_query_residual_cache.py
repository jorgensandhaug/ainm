from __future__ import annotations

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.store import read_round_record
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    _shared_base_checkpoint_path,
    _shared_teacher_checkpoint_path,
)
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import TRAIN_ROUND_ID, _copy_round, _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def _write_sample_analyses_for_all_seeds(paths, *, round_id: str) -> None:
    for seed_index in range(5):
        _write_sample_analysis(paths, round_id=round_id, seed_index=seed_index)


def test_hazard_teacher_checkpoint_round_trip_preserves_terminal_tensor(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_roundtrip").fit([round_episode])
    checkpoint_path = sample_paths.model_dir("hazard_teacher_roundtrip") / "checkpoint.json"
    teacher.save_checkpoint(checkpoint_path)

    restored = HazardTeacher.load_checkpoint(checkpoint_path)
    regime = teacher.encode_round(round_episode)
    seed = round_episode.seeds[0]

    assert np.allclose(
        teacher.terminal_tensor(seed, regime),
        restored.terminal_tensor(seed, regime),
    )


def test_query_residual_reuses_shared_base_and_teacher_cache(sample_paths, monkeypatch) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=ROUND_ID)
    _write_sample_analyses_for_all_seeds(sample_paths, round_id=TRAIN_ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=TRAIN_ROUND_ID)

    round_ids = [ROUND_ID, TRAIN_ROUND_ID]
    first = QueryResidualPredictor.fit_from_workspace(
        sample_paths,
        round_ids=round_ids,
        policy_name="coverage",
        samples_per_round=1,
        cells_per_seed=16,
        budget_prefixes=(0, 4),
        ridge_lambda=4.0,
        model_name="query_residual_cache_a",
    )

    assert _shared_base_checkpoint_path(sample_paths, round_ids).exists()
    assert _shared_teacher_checkpoint_path(sample_paths, round_ids).exists()

    def _unexpected_base_fit(*args, **kwargs):
        del args, kwargs
        raise AssertionError("shared base prior cache should avoid refit")

    def _unexpected_teacher_fit(*args, **kwargs):
        del args, kwargs
        raise AssertionError("shared hazard teacher cache should avoid refit")

    monkeypatch.setattr(HistoricalBucketPriorPredictor, "fit_from_workspace", _unexpected_base_fit)
    monkeypatch.setattr(HazardTeacher, "fit", _unexpected_teacher_fit)

    second = QueryResidualPredictor.fit_from_workspace(
        sample_paths,
        round_ids=round_ids,
        policy_name="coverage",
        samples_per_round=1,
        cells_per_seed=16,
        budget_prefixes=(0, 4),
        ridge_lambda=4.0,
        model_name="query_residual_cache_b",
    )

    assert np.allclose(first.regime_intercept, second.regime_intercept)
    assert np.allclose(first.regime_weights, second.regime_weights)
    assert np.allclose(first.intercept, second.intercept)
    assert np.allclose(first.coefficients, second.coefficients)
    assert first.base_predictor.round_ids == second.base_predictor.round_ids
    assert first.teacher.round_ids == second.teacher.round_ids
    assert first.teacher.name != second.teacher.name
    assert second.teacher.name == "query_residual_cache_b__hazard_teacher"

    round_detail = read_round_record(sample_paths, ROUND_ID).round
    geometry = compute_round_features(round_detail)
    first_prediction = first.build_prediction_bundle(round_detail, geometry, None)
    second_prediction = second.build_prediction_bundle(round_detail, geometry, None)

    assert np.allclose(
        first_prediction.predictions_by_seed[0],
        second_prediction.predictions_by_seed[0],
    )
