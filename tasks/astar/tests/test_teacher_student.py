from __future__ import annotations

import numpy as np

from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import compute_round_features
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.evidence import build_round_evidence
from astar.policy.offline_env import OfflinePolicyEnv
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.workflows.train_student import train_summary_bank_student
from astar.workflows.train_teacher import train_hazard_teacher
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_hazard_teacher_and_summary_bank_student_smoke(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    teacher_result = train_hazard_teacher(
        sample_paths,
        round_ids=[ROUND_ID],
        model_name="hazard_teacher_test",
    )
    student_result = train_summary_bank_student(
        sample_paths,
        dataset_name="synthetic_live_student_test",
        policy_name="coverage",
        samples_per_round=1,
        k_neighbors=3,
        model_name="summary_bank_student_test",
    )

    assert teacher_result.embedding_dim >= 1
    assert teacher_result.checkpoint_path.exists()
    assert student_result.sample_count >= 1
    assert student_result.checkpoint_path.exists()


def test_summary_bank_student_predicts_and_offline_env_scores(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_test").fit([round_episode])
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_test",
    )
    from astar.student.posterior.deepset_student import SummaryBankStudent

    student = SummaryBankStudent.fit_from_dataset(dataset, teacher, k_neighbors=1)

    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    transcript_observations = (
        round_episode.live_transcript.observations
        if round_episode.live_transcript is not None
        else ()
    )
    context = LiveInferenceContext(
        online_episode=round_context_to_online_episode(
            round_context,
            transcript_observations,
        ),
        geometry_bundle=compute_round_features(round_record.round),
        evidence_bundle=build_round_evidence(sample_paths, ROUND_ID),
    )

    posterior = student.infer_regime(context)
    prediction = student.predict_seed(context, 0)

    assert posterior.mean.ndim == 1
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)
    assert not hasattr(context.online_episode.round_context.seeds[0], "replay_runs")
    assert not hasattr(context.online_episode.round_context.seeds[0], "terminal_truth")

    env = OfflinePolicyEnv(round_episode=round_episode, sample_index=0)
    assert round_episode.live_transcript is not None
    query = env.sample_query(
        seed_index=0,
        viewport=round_episode.live_transcript.observations[0].viewport,
        query_index=0,
    )
    scores = env.score_predictions({0: prediction})

    assert query.seed_index == 0
    assert 0 in scores


def test_summary_bank_student_spatial_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_spatial_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_spatial_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_spatial_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_SPATIAL_V2,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_SPATIAL_V2,
        normalize_summary=True,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_spatial_test"),
        teacher_checkpoint_path,
    )
    reloaded = SummaryBankStudent.load_checkpoint(checkpoint_path)

    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    transcript_observations = (
        round_episode.live_transcript.observations
        if round_episode.live_transcript is not None
        else ()
    )
    context = LiveInferenceContext(
        online_episode=round_context_to_online_episode(
            round_context,
            transcript_observations,
        ),
        geometry_bundle=compute_round_features(round_record.round),
        evidence_bundle=build_round_evidence(sample_paths, ROUND_ID),
    )

    posterior = reloaded.infer_regime(context)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_SPATIAL_V2
    assert reloaded.normalize_summary is True
    assert posterior.mean.ndim == 1


def test_summary_bank_student_semantic_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_semantic_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_semantic_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_semantic_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_SEMANTIC_V3,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
        normalize_summary=True,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_semantic_test"),
        teacher_checkpoint_path,
    )
    reloaded = SummaryBankStudent.load_checkpoint(checkpoint_path)

    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    transcript_observations = (
        round_episode.live_transcript.observations
        if round_episode.live_transcript is not None
        else ()
    )
    context = LiveInferenceContext(
        online_episode=round_context_to_online_episode(
            round_context,
            transcript_observations,
        ),
        geometry_bundle=compute_round_features(round_record.round),
        evidence_bundle=build_round_evidence(sample_paths, ROUND_ID),
    )

    posterior = reloaded.infer_regime(context)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_SEMANTIC_V3
    assert reloaded.normalize_summary is True
    assert posterior.mean.ndim == 1


def test_summary_bank_student_semantic_ridge_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_semantic_ridge_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_semantic_ridge_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_semantic_ridge_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_SEMANTIC_V3,
        SUMMARY_HEAD_RIDGE,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
        normalize_summary=True,
        inference_head=SUMMARY_HEAD_RIDGE,
        ridge_alpha=2.0,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_semantic_ridge_test"),
        teacher_checkpoint_path,
    )
    reloaded = SummaryBankStudent.load_checkpoint(checkpoint_path)

    round_record = read_round_record(sample_paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    transcript_observations = (
        round_episode.live_transcript.observations
        if round_episode.live_transcript is not None
        else ()
    )
    context = LiveInferenceContext(
        online_episode=round_context_to_online_episode(
            round_context,
            transcript_observations,
        ),
        geometry_bundle=compute_round_features(round_record.round),
        evidence_bundle=build_round_evidence(sample_paths, ROUND_ID),
    )

    posterior = reloaded.infer_regime(context)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_SEMANTIC_V3
    assert reloaded.inference_head == SUMMARY_HEAD_RIDGE
    assert reloaded.normalize_summary is True
    assert posterior.mean.ndim == 1
