from __future__ import annotations

import numpy as np

from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
)
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.infra.api.dto import InitialSettlement, InitialState, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.student.posterior.state_space_student import StateSpaceStudent
from astar.student.posterior.transcript_set import (
    build_round_initial_feature_vector,
    build_transcript_summary_vector,
)
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from astar.workflows.train_student import train_state_space_student
from astar.workflows.train_teacher import train_state_space_teacher
from tests.conftest import ROUND_ID
from tests.replay_test_utils import _write_replays_for_all_seeds


def _fit_teacher(sample_paths: RepoPaths) -> tuple[RoundEpisode, StateSpaceTeacher]:
    episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = StateSpaceTeacher(
        name="state_space_teacher_student_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])
    return episode, teacher


def _posterior_round_detail() -> RoundDetail:
    return RoundDetail(
        id="round-prior-test",
        round_number=7,
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


def test_state_space_student_uses_map_conditioned_prior_without_queries() -> None:
    round_detail = _posterior_round_detail()
    round_context = build_round_context_from_detail(round_detail)
    context = round_context_to_live_inference_context(round_context, ())
    summary_feature_names, summary_vector = build_transcript_summary_vector(round_detail, ())
    prior_feature_names, prior_feature_vector = build_round_initial_feature_vector(round_detail)

    expected_prior_mean = np.asarray([1.7], dtype=np.float64)
    student = StateSpaceStudent(
        name="state_space_student_map_prior_test",
        summary_feature_names=summary_feature_names,
        summary_mean=np.zeros_like(summary_vector, dtype=np.float64),
        summary_scale=np.ones_like(summary_vector, dtype=np.float64),
        prior_feature_names=prior_feature_names,
        prior_feature_mean=np.zeros_like(prior_feature_vector, dtype=np.float64),
        prior_feature_scale=np.ones_like(prior_feature_vector, dtype=np.float64),
        prior_regression_weights=np.concatenate(
            [
                np.zeros((1, 1), dtype=np.float64),
                np.asarray([[0.0]] * prior_feature_vector.shape[0], dtype=np.float64),
            ],
            axis=0,
        ),
        regime_prior_mean=np.asarray([0.0], dtype=np.float64),
        regime_prior_cov=np.asarray([[1.0]], dtype=np.float64),
        conditional_prior_cov=np.asarray([[0.25]], dtype=np.float64),
        regime_residual_cov=np.asarray([[0.5]], dtype=np.float64),
        regression_weights=np.zeros((summary_vector.shape[0] + 1, 1), dtype=np.float64),
        prototype_summary_vectors=np.zeros((0, summary_vector.shape[0]), dtype=np.float64),
        prototype_regime_vectors=np.zeros((0, 1), dtype=np.float64),
        proposal_mass=0.55,
        prior_mass_floor=0.0,
        teacher=StateSpaceTeacher(name="state_space_teacher_map_prior_test", regime_dim=1),
    ).model_copy(
        update={
            "prior_regression_weights": np.concatenate(
                [
                    expected_prior_mean.reshape(1, 1),
                    np.zeros((prior_feature_vector.shape[0], 1), dtype=np.float64),
                ],
                axis=0,
            )
        }
    )

    posterior = student.infer_regime(context)

    np.testing.assert_allclose(posterior.mean, expected_prior_mean)
    assert posterior.cov is not None
    np.testing.assert_allclose(
        posterior.cov,
        np.asarray([[0.25]], dtype=np.float64),
        atol=1e-6,
    )


def test_state_space_student_fit_predict_and_checkpoint_roundtrip(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    episode, teacher = _fit_teacher(sample_paths)
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_state_space_student_test",
        regime_encoder=teacher,
    )
    student = StateSpaceStudent.fit_from_dataset(
        dataset,
        teacher,
        prototype_count=2,
        decoder_rollouts=2,
        terminal_calibration_rollouts=1,
        max_terminal_calibration_samples=1,
    )
    artifact = load_synthetic_episode(
        dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    )
    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    context = round_context_to_live_inference_context(round_context, artifact.observations)

    posterior = student.infer_regime(context)
    prediction = student.predict_seed(context, 0)

    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("state_space_teacher_student_test") / "checkpoint.json",
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("state_space_student_roundtrip_test"),
        teacher_checkpoint_path,
    )
    restored = StateSpaceStudent.load_checkpoint(checkpoint_path)
    restored_posterior = restored.infer_regime(context)
    restored_prediction = restored.predict_seed(context, 0)
    restored_teacher_regime = restored.teacher.encode_round(episode)

    assert posterior.weights is not None
    assert posterior.particles is not None
    assert posterior.mean.shape == teacher.encode_round(episode).shape
    assert restored.teacher.regime_encoder is not None
    assert restored.prior_feature_names == student.prior_feature_names
    assert restored.prototype_round_ids == student.prototype_round_ids
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)
    np.testing.assert_allclose(np.sum(posterior.weights), 1.0)
    np.testing.assert_allclose(restored_teacher_regime, teacher.encode_round(episode))
    np.testing.assert_allclose(restored_posterior.mean, posterior.mean)
    np.testing.assert_allclose(restored_prediction, prediction)


def test_state_space_train_workflows_smoke(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    teacher_result = train_state_space_teacher(
        sample_paths,
        round_ids=[ROUND_ID],
        model_name="state_space_teacher_workflow_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    )
    student_result = train_state_space_student(
        sample_paths,
        round_ids=[ROUND_ID],
        dataset_name="synthetic_live_state_space_workflow_test",
        policy_name="coverage",
        samples_per_round=1,
        prototype_count=2,
        decoder_rollouts=2,
        model_name="state_space_student_workflow_test",
        teacher_model_name="state_space_teacher_workflow_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    )

    assert teacher_result.regime_dim >= 1
    assert teacher_result.checkpoint_path.exists()
    assert student_result.sample_count >= 1
    assert student_result.checkpoint_path.exists()
