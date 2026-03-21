from __future__ import annotations

import numpy as np

from astar.envs.types import build_round_context_from_detail
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.store import read_round_record
from astar.student.predictor.gbx_map_prior import GreyBoxMapOnlyBucketPredictor
from astar.teacher.dynamics.terminal_teacher import (
    GBX_TERMINAL_REGIME_TEACHER_MODEL,
    GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
    GreyBoxTerminalTeacher,
    gbx_terminal_scoped_checkpoint_path,
)
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_gbx_terminal_teacher_terminal_tensor_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTerminalTeacher(name=GBX_TERMINAL_REGIME_TEACHER_MODEL).fit([episode])

    seed = episode.seeds[0]
    regime = teacher.encode_round(episode)
    terminal = teacher.terminal_tensor(seed, regime)

    assert terminal.shape[-1] == 6
    assert np.all(np.isfinite(terminal))
    assert np.all(terminal >= 0.0)
    assert np.allclose(np.sum(terminal, axis=-1), 1.0, atol=1e-6)


def test_gbx_terminal_teacher_checkpoint_roundtrip(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = GreyBoxTerminalTeacher(name=GBX_TERMINAL_REGIME_TEACHER_MODEL).fit([episode])
    checkpoint_path = gbx_terminal_scoped_checkpoint_path(sample_paths, round_ids=[ROUND_ID])
    teacher.save_checkpoint(checkpoint_path)

    restored = GreyBoxTerminalTeacher.load_checkpoint(checkpoint_path)

    assert restored.map_feature_names == teacher.map_feature_names
    assert restored.selected_rank == teacher.selected_rank
    assert np.allclose(restored.map_intercept, teacher.map_intercept)


def test_gbx_terminal_residual_teacher_terminal_tensor_is_valid(sample_paths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    episode = build_round_episode(sample_paths, ROUND_ID)
    round_detail = read_round_record(sample_paths, ROUND_ID).round
    base_predictor = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
        sample_paths,
        round_ids=[ROUND_ID],
    )
    base_bundle = base_predictor.build_prediction_bundle(round_detail, None)
    teacher = GreyBoxTerminalTeacher(
        name=GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
        use_base_residual=True,
    )
    row = teacher._fit_round_coefficients(
        episode,
        ridge_alpha=1.0,
        base_predictions_by_seed={
            int(seed_index): np.asarray(prediction, dtype=np.float64)
            for seed_index, prediction in base_bundle.predictions_by_seed.items()
        },
    )
    teacher = teacher.fit([episode], coefficient_rows=[row])

    round_context = build_round_context_from_detail(round_detail)
    posterior = teacher.map_posterior(round_context.seeds)
    seed = episode.seeds[0]
    terminal = teacher.posterior_predictive(
        seed,
        posterior,
        base_prediction=np.asarray(base_bundle.predictions_by_seed[seed.seed_index], dtype=np.float64),
    )

    assert terminal.shape[-1] == 6
    assert np.all(np.isfinite(terminal))
    assert np.all(terminal >= 0.0)
    assert np.allclose(np.sum(terminal, axis=-1), 1.0, atol=1e-6)
