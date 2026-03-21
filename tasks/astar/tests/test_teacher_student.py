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
from tests.test_historical_benchmark import _write_sample_analysis
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


def test_summary_bank_student_temporal_ridge_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_temporal_ridge_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_temporal_ridge_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_temporal_ridge_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_TEMPORAL_V4,
        SUMMARY_HEAD_RIDGE,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
        normalize_summary=True,
        inference_head=SUMMARY_HEAD_RIDGE,
        ridge_alpha=2.0,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_temporal_ridge_test"),
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

    assert reloaded.summary_encoder == SUMMARY_ENCODER_TEMPORAL_V4
    assert reloaded.inference_head == SUMMARY_HEAD_RIDGE
    assert reloaded.normalize_summary is True
    assert posterior.mean.ndim == 1


def test_summary_bank_student_temporal_coefficient_checkpoint_roundtrip(sample_paths: RepoPaths) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_temporal_coeff_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_temporal_coeff_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_temporal_coeff_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_TEMPORAL_V4,
        SUMMARY_HEAD_COEFFICIENT_RIDGE,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
        normalize_summary=True,
        inference_head=SUMMARY_HEAD_COEFFICIENT_RIDGE,
        ridge_alpha=2.0,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_temporal_coeff_test"),
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

    prediction = reloaded.predict_seed(context, 0)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_TEMPORAL_V4
    assert reloaded.inference_head == SUMMARY_HEAD_COEFFICIENT_RIDGE
    assert reloaded.normalize_summary is True
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)


def test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_temporal_coeff_residual_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_temporal_coeff_residual_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_temporal_coeff_residual_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_TEMPORAL_V4,
        SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
        normalize_summary=True,
        inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        ridge_alpha=2.0,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_temporal_coeff_residual_test"),
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

    prediction = reloaded.predict_seed(context, 0)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_TEMPORAL_V4
    assert reloaded.inference_head == SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN
    assert reloaded.normalize_summary is True
    assert reloaded.neighbor_distance_scale > 0.0
    assert 0.0 <= reloaded.summary_confidence(context) <= 1.0
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)


def test_summary_bank_student_temporal_multiscale_residual_checkpoint_roundtrip(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    round_episode = build_round_episode(sample_paths, ROUND_ID)
    teacher = HazardTeacher(name="hazard_teacher_temporal_multiscale_test").fit([round_episode])
    teacher_checkpoint_path = teacher.save_checkpoint(
        sample_paths.model_dir("hazard_teacher_temporal_multiscale_test") / "checkpoint.json",
    )
    dataset = build_synthetic_live_dataset(
        sample_paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_summary_temporal_multiscale_test",
    )
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_TEMPORAL_MULTISCALE_V5,
        SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        SummaryBankStudent,
    )

    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=1,
        summary_encoder=SUMMARY_ENCODER_TEMPORAL_MULTISCALE_V5,
        normalize_summary=True,
        inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        ridge_alpha=2.0,
        residual_confidence_power=1.0,
    )
    checkpoint_path = student.save_checkpoint(
        sample_paths.model_dir("summary_bank_student_temporal_multiscale_test"),
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

    prediction = reloaded.predict_seed(context, 0)

    assert reloaded.summary_encoder == SUMMARY_ENCODER_TEMPORAL_MULTISCALE_V5
    assert reloaded.inference_head == SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN
    assert reloaded.normalize_summary is True
    assert reloaded.residual_confidence_power == 1.0
    assert prediction.shape[-1] == 6
    assert np.allclose(prediction.sum(axis=-1), 1.0)


def test_summary_temporal_multiscale_encoder_zero_observation_shape(sample_paths: RepoPaths) -> None:
    from astar.observe.evidence import build_round_evidence_from_observations
    from astar.student.posterior.deepset_student import (
        SUMMARY_ENCODER_TEMPORAL_MULTISCALE_V5,
        _summary_vector_from_evidence,
        _summary_vector_semantic_v3,
    )

    round_record = read_round_record(sample_paths, ROUND_ID)
    geometry_bundle = compute_round_features(round_record.round)
    evidence = build_round_evidence_from_observations(round_record.round, ())
    semantic = _summary_vector_semantic_v3(
        evidence,
        geometry_bundle=geometry_bundle,
    )
    multiscale = _summary_vector_from_evidence(
        evidence,
        summary_encoder=SUMMARY_ENCODER_TEMPORAL_MULTISCALE_V5,
        geometry_bundle=geometry_bundle,
        observations=(),
        round_detail=round_record.round,
    )

    expected_prefix = np.concatenate([semantic, semantic, semantic, semantic, semantic], axis=0)
    assert multiscale.shape == (semantic.shape[0] * 6,)
    assert np.allclose(multiscale[: expected_prefix.shape[0]], expected_prefix)
    assert np.allclose(multiscale[expected_prefix.shape[0] :], 0.0)


def test_summary_bank_residual_confidence_shrinks_far_neighbor_residual() -> None:
    from astar.student.posterior.deepset_student import (
        SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        SummaryBankStudent,
    )

    teacher = HazardTeacher(name="hazard_teacher_residual_confidence_test")
    base_kwargs = dict(
        name="summary_bank_student_residual_confidence_test",
        dataset_name="synthetic_live_residual_confidence_test",
        summary_vectors=np.asarray([[0.0], [100.0]], dtype=np.float64),
        regime_vectors=np.zeros((2, 1), dtype=np.float64),
        k_neighbors=2,
        normalize_summary=False,
        inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
        feature_mean=np.zeros(1, dtype=np.float64),
        feature_scale=np.ones(1, dtype=np.float64),
        regime_intercept=np.zeros(1, dtype=np.float64),
        regime_weights=np.zeros((1, 1), dtype=np.float64),
        coefficient_intercept=np.zeros(1, dtype=np.float64),
        coefficient_weights=np.zeros((1, 1), dtype=np.float64),
        coefficient_vectors=np.asarray([[10.0], [10.0]], dtype=np.float64),
        neighbor_distance_scale=10.0,
        teacher=teacher,
    )
    without_shrink = SummaryBankStudent(**base_kwargs)
    with_shrink = SummaryBankStudent(
        **base_kwargs,
        residual_confidence_power=1.0,
    )

    query_vector = np.asarray([1000.0], dtype=np.float64)
    baseline = without_shrink._predict_coefficient_vector(query_vector)
    shrunk = with_shrink._predict_coefficient_vector(query_vector)

    assert baseline.shape == (1,)
    assert 0.0 < shrunk[0] < baseline[0]


def test_summary_bank_exact_local_evidence_posterior_uses_observed_counts() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import _apply_exact_local_evidence_posterior

    prediction = np.full((2, 2, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((2, 2, 6), dtype=np.int64)
    count_tensor[0, 0, 1] = 1
    count_tensor[0, 0, 2] = 3
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[1, 0], [0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    posterior = _apply_exact_local_evidence_posterior(
        prediction,
        seed_evidence,
        beta_min=0.0,
        beta_scale=0.0,
    )

    assert np.allclose(posterior[0, 0], np.asarray([0.0, 0.25, 0.75, 0.0, 0.0, 0.0]))
    assert np.allclose(posterior[1, 1], prediction[1, 1])


def test_summary_bank_exact_local_evidence_count_pivot_reduces_prior_shrinkage() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import _apply_exact_local_evidence_posterior

    prediction = np.full((1, 1, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((1, 1, 6), dtype=np.int64)
    count_tensor[0, 0, 2] = 12
    count_tensor[0, 0, 1] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=16,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[1]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    fixed_beta = _apply_exact_local_evidence_posterior(
        prediction,
        seed_evidence,
        beta_min=2.0,
        beta_scale=8.0,
    )
    count_adaptive = _apply_exact_local_evidence_posterior(
        prediction,
        seed_evidence,
        beta_min=2.0,
        beta_scale=8.0,
        count_pivot=4.0,
    )

    assert count_adaptive[0, 0, 2] > fixed_beta[0, 0, 2]
    assert count_adaptive[0, 0, 1] > fixed_beta[0, 0, 1]


def test_summary_bank_local_blur_evidence_updates_neighboring_unobserved_cells() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import _apply_local_blur_evidence_update

    prediction = np.full((3, 3, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((3, 3, 6), dtype=np.int64)
    count_tensor[1, 1, 2] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    updated = _apply_local_blur_evidence_update(
        prediction,
        seed_evidence,
        sigma=1.0,
        strength=2.0,
    )

    assert np.allclose(updated[1, 1], prediction[1, 1])
    assert updated[1, 2, 2] > prediction[1, 2, 2]
    assert np.allclose(updated.sum(axis=-1), 1.0)


def test_summary_bank_local_blur_evidence_respects_spatial_gate() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import _apply_local_blur_evidence_update

    prediction = np.full((3, 3, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((3, 3, 6), dtype=np.int64)
    count_tensor[1, 1, 2] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )
    blocked_gate = np.zeros((3, 3), dtype=np.float64)
    blocked_gate[1, 1] = 1.0

    updated = _apply_local_blur_evidence_update(
        prediction,
        seed_evidence,
        sigma=1.0,
        strength=2.0,
        spatial_gate=blocked_gate,
    )

    assert np.allclose(updated, prediction)


def test_summary_bank_local_blur_evidence_respects_class_scale() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import _apply_local_blur_evidence_update

    prediction = np.full((3, 3, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((3, 3, 6), dtype=np.int64)
    count_tensor[1, 1, 2] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    updated = _apply_local_blur_evidence_update(
        prediction,
        seed_evidence,
        sigma=1.0,
        strength=2.0,
        class_scale=np.zeros(6, dtype=np.float64),
    )

    assert np.allclose(updated, prediction)


def test_summary_bank_secondary_student_weight_map_prefers_smoother_far_from_observed() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import (
        SECONDARY_ROUTE_COVERAGE_DISTANCE,
        _secondary_student_weight_map,
    )

    count_tensor = np.zeros((5, 5, 6), dtype=np.int64)
    count_tensor[2, 2, 2] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray(
            [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
            ],
            dtype=np.int64,
        ),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    weight_map = _secondary_student_weight_map(
        seed_evidence,
        route_mode=SECONDARY_ROUTE_COVERAGE_DISTANCE,
        distance_scale=2.0,
        count_scale=0.0,
    )

    assert weight_map.shape == (5, 5, 1)
    assert weight_map[2, 2, 0] == 0.0
    assert 0.0 < weight_map[2, 3, 0] < 1.0
    assert weight_map[0, 0, 0] == 1.0


def test_summary_bank_secondary_student_count_route_prefers_smoother_low_count_cells() -> None:
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.summary_bank import (
        SECONDARY_ROUTE_OBSERVATION_COUNT,
        _secondary_student_weight_map,
    )

    count_tensor = np.zeros((2, 2, 6), dtype=np.int64)
    count_tensor[0, 0, 2] = 3
    count_tensor[0, 1, 2] = 1
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[1, 1], [0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )

    weight_map = _secondary_student_weight_map(
        seed_evidence,
        route_mode=SECONDARY_ROUTE_OBSERVATION_COUNT,
        distance_scale=0.0,
        count_scale=3.0,
    )

    assert weight_map.shape == (2, 2, 1)
    assert weight_map[0, 0, 0] == 0.0
    assert 0.0 < weight_map[0, 1, 0] < 1.0
    assert weight_map[1, 0, 0] == 1.0


def test_evidence_field_local_refinement_spreads_built_signal_to_neighbors() -> None:
    from astar.features.geometry import SeedFeatureBundle
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.evidence_field import _apply_local_evidence_field_refinement

    prediction = np.full((3, 3, 6), 1.0 / 6.0, dtype=np.float64)
    count_tensor = np.zeros((3, 3, 6), dtype=np.int64)
    count_tensor[1, 1, 1] = 4
    observed_class_counts = np.sum(count_tensor, axis=(0, 1))
    observed_class_frequencies = observed_class_counts.astype(np.float64) / float(
        np.sum(observed_class_counts),
    )
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.asarray([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=np.int64),
        observed_class_counts=observed_class_counts,
        observed_class_frequencies=observed_class_frequencies,
        observed_class_count_tensor=count_tensor,
    )
    seed_features = SeedFeatureBundle(
        round_id="round",
        seed_index=0,
        height=3,
        width=3,
        features={
            "buildable": np.ones((3, 3), dtype=np.float64),
            "settlement_proximity": np.ones((3, 3), dtype=np.float64),
            "coastal_exposure": np.ones((3, 3), dtype=np.float64),
            "maritime_access": np.ones((3, 3), dtype=np.float64),
            "frontier_score": np.ones((3, 3), dtype=np.float64),
            "forest_density": np.zeros((3, 3), dtype=np.float64),
            "mountain_density": np.zeros((3, 3), dtype=np.float64),
        },
    )

    refined = _apply_local_evidence_field_refinement(
        prediction,
        seed_evidence=seed_evidence,
        seed_features=seed_features,
        initial_scored_grid=np.zeros((3, 3), dtype=np.int64),
        blur_radius=1,
        blur_sigma=1.0,
        count_scale=3.0,
        field_strength=1.5,
        port_strength=1.0,
        ruin_strength=1.0,
        forest_strength=1.0,
        empty_strength=1.0,
        probability_floor=0.01,
    )

    assert np.allclose(refined.sum(axis=-1), 1.0)
    assert refined[1, 2, 1] > prediction[1, 2, 1]
    assert np.allclose(refined[1, 1], prediction[1, 1])


def test_evidence_field_settlement_state_refinement_uses_live_settlement_stats() -> None:
    from astar.core.grid import Viewport
    from astar.core.trajectory import LiveQueryObs
    from astar.core.world_state import LiveSettlementObs
    from astar.features.geometry import SeedFeatureBundle
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.evidence_field import _apply_settlement_state_refinement

    prediction = np.full((3, 3, 6), 1.0 / 6.0, dtype=np.float64)
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=1,
        repeated_window_groups=0,
        coverage_counts=np.zeros((3, 3), dtype=np.int64),
        observed_class_counts=np.zeros(6, dtype=np.int64),
        observed_class_frequencies=np.zeros(6, dtype=np.float64),
        observed_class_count_tensor=np.zeros((3, 3, 6), dtype=np.int64),
    )
    seed_features = SeedFeatureBundle(
        round_id="round",
        seed_index=0,
        height=3,
        width=3,
        features={
            "buildable": np.ones((3, 3), dtype=np.float64),
            "settlement_proximity": np.ones((3, 3), dtype=np.float64),
            "coastal_exposure": np.ones((3, 3), dtype=np.float64),
            "maritime_access": np.ones((3, 3), dtype=np.float64),
            "frontier_score": np.ones((3, 3), dtype=np.float64),
            "forest_density": np.zeros((3, 3), dtype=np.float64),
            "mountain_density": np.zeros((3, 3), dtype=np.float64),
        },
    )
    observations = (
        LiveQueryObs(
            round_id="round",
            seed_index=0,
            viewport=Viewport(x=0, y=0, w=3, h=3),
            grid=np.zeros((3, 3), dtype=np.int64),
            settlements=(
                LiveSettlementObs(
                    x=1,
                    y=1,
                    population=4.5,
                    food=1.1,
                    wealth=1.5,
                    defense=1.0,
                    has_port=True,
                    alive=True,
                    owner_id=1,
                ),
            ),
            query_index=0,
        ),
    )

    refined = _apply_settlement_state_refinement(
        prediction,
        observations=observations,
        seed_index=0,
        seed_evidence=seed_evidence,
        seed_features=seed_features,
        initial_scored_grid=np.zeros((3, 3), dtype=np.int64),
        state_sigma=1.5,
        state_strength=1.2,
        state_port_strength=1.3,
        state_ruin_strength=1.2,
        probability_floor=0.01,
    )

    assert np.allclose(refined.sum(axis=-1), 1.0)
    assert refined[1, 2, 1] > prediction[1, 2, 1]
    assert refined[1, 2, 2] > prediction[1, 2, 2]


def test_evidence_field_global_state_refinement_uses_seed_level_state_summary() -> None:
    from astar.features.geometry import SeedFeatureBundle
    from astar.observe.evidence import SeedEvidenceBundle
    from astar.student.predictor.evidence_field import _apply_global_state_feature_refinement

    prediction = np.full((2, 2, 6), 1.0 / 6.0, dtype=np.float64)
    seed_evidence = SeedEvidenceBundle(
        round_id="round",
        seed_index=0,
        query_count=4,
        repeated_window_groups=0,
        coverage_counts=np.zeros((2, 2), dtype=np.int64),
        observed_class_counts=np.zeros(6, dtype=np.int64),
        observed_class_frequencies=np.zeros(6, dtype=np.float64),
        observed_class_count_tensor=np.zeros((2, 2, 6), dtype=np.int64),
        mean_population=4.5,
        mean_food=1.1,
        mean_wealth=1.5,
        mean_defense=1.0,
        mean_settlement_count=1.0,
        alive_fraction=1.0,
        port_fraction=1.0,
        largest_owner_share=1.0,
        owner_hhi=0.0,
    )
    seed_features = SeedFeatureBundle(
        round_id="round",
        seed_index=0,
        height=2,
        width=2,
        features={
            "buildable": np.ones((2, 2), dtype=np.float64),
            "settlement_proximity": np.ones((2, 2), dtype=np.float64),
            "coastal_exposure": np.ones((2, 2), dtype=np.float64),
            "maritime_access": np.ones((2, 2), dtype=np.float64),
            "frontier_score": np.ones((2, 2), dtype=np.float64),
            "forest_density": np.zeros((2, 2), dtype=np.float64),
            "mountain_density": np.zeros((2, 2), dtype=np.float64),
        },
    )

    refined = _apply_global_state_feature_refinement(
        prediction,
        seed_evidence=seed_evidence,
        seed_features=seed_features,
        initial_scored_grid=np.zeros((2, 2), dtype=np.int64),
        global_state_strength=1.0,
        global_port_strength=1.2,
        global_ruin_strength=1.1,
        probability_floor=0.01,
    )

    assert np.allclose(refined.sum(axis=-1), 1.0)
    assert refined[0, 0, 1] > prediction[0, 0, 1]
    assert refined[0, 0, 2] > prediction[0, 0, 2]


def test_transcript_memory_seed_vector_reflects_observed_class_counts() -> None:
    from astar.features.geometry import RoundFeatureBundle, SeedFeatureBundle
    from astar.observe.evidence import RoundEvidenceBundle, SeedEvidenceBundle
    from astar.student.predictor.transcript_memory import _seed_memory_vector

    seed0_counts = np.zeros((2, 2, 6), dtype=np.int64)
    seed0_counts[0, 0, 1] = 3
    seed1_counts = np.zeros((2, 2, 6), dtype=np.int64)
    round_evidence = RoundEvidenceBundle(
        round_id="round",
        per_seed={
            0: SeedEvidenceBundle(
                round_id="round",
                seed_index=0,
                query_count=1,
                repeated_window_groups=0,
                coverage_counts=np.zeros((2, 2), dtype=np.int64),
                observed_class_counts=np.sum(seed0_counts, axis=(0, 1)),
                observed_class_frequencies=np.asarray([0.0, 1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64),
                observed_class_count_tensor=seed0_counts,
            ),
            1: SeedEvidenceBundle(
                round_id="round",
                seed_index=1,
                query_count=0,
                repeated_window_groups=0,
                coverage_counts=np.zeros((2, 2), dtype=np.int64),
                observed_class_counts=np.sum(seed1_counts, axis=(0, 1)),
                observed_class_frequencies=np.zeros(6, dtype=np.float64),
                observed_class_count_tensor=seed1_counts,
            ),
        },
    )
    per_seed_features = {
        seed_index: SeedFeatureBundle(
            round_id="round",
            seed_index=seed_index,
            height=2,
            width=2,
            features={
                "buildable": np.ones((2, 2), dtype=np.float64),
                "coast": np.zeros((2, 2), dtype=np.float64),
                "settlement_proximity": np.ones((2, 2), dtype=np.float64),
                "coastal_exposure": np.zeros((2, 2), dtype=np.float64),
                "maritime_access": np.zeros((2, 2), dtype=np.float64),
                "frontier_score": np.ones((2, 2), dtype=np.float64),
                "forest_density": np.zeros((2, 2), dtype=np.float64),
                "mountain_density": np.zeros((2, 2), dtype=np.float64),
            },
        )
        for seed_index in (0, 1)
    }
    round_features = RoundFeatureBundle(round_id="round", per_seed=per_seed_features)

    vector = _seed_memory_vector(round_evidence, round_features, seed_index=0)

    assert vector.shape[0] > 10
    assert np.max(vector) > 0.0


def test_transcript_residual_memory_blend_with_residual_shifts_mass() -> None:
    from astar.student.predictor.transcript_residual_memory import _blend_with_residual

    base = np.asarray([[[0.70, 0.20, 0.10]]], dtype=np.float64)
    residual = np.asarray([[[-0.20, 0.15, 0.05]]], dtype=np.float64)

    refined = _blend_with_residual(
        base,
        residual,
        correction_scale=1.0,
        probability_floor=0.01,
    )

    assert np.allclose(refined.sum(axis=-1), 1.0)
    assert refined[0, 0, 1] > base[0, 0, 1]
    assert refined[0, 0, 2] > base[0, 0, 2]


def test_transcript_sequence_query_token_vector_is_order_sensitive() -> None:
    from astar.core.grid import Viewport
    from astar.core.trajectory import LiveQueryObs
    from astar.core.world_state import LiveSettlementObs
    from astar.student.predictor.transcript_sequence_residual_memory import _query_token_vector

    obs_a = LiveQueryObs(
        round_id="round",
        seed_index=0,
        viewport=Viewport(x=0, y=0, w=2, h=2),
        grid=np.asarray([[0, 1], [1, 1]], dtype=np.int64),
        settlements=(
            LiveSettlementObs(x=0, y=0, population=2.0, food=0.5, wealth=0.3, defense=0.1, has_port=False, alive=True),
        ),
        query_index=0,
    )
    obs_b = LiveQueryObs(
        round_id="round",
        seed_index=0,
        viewport=Viewport(x=2, y=1, w=2, h=2),
        grid=np.asarray([[2, 2], [3, 3]], dtype=np.int64),
        settlements=(
            LiveSettlementObs(x=2, y=1, population=4.0, food=0.9, wealth=1.1, defense=0.7, has_port=True, alive=True),
        ),
        query_index=1,
    )

    token_a = _query_token_vector(obs_a, map_width=8, map_height=8)
    token_b = _query_token_vector(obs_b, map_width=8, map_height=8)

    assert token_a.shape == token_b.shape
    assert not np.allclose(token_a, token_b)


def test_transcript_sequence_factor_residual_ridge_weights_fit_targets() -> None:
    from astar.student.predictor.transcript_sequence_factor_residual import _ridge_weights

    features = np.asarray([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]], dtype=np.float64)
    targets = np.asarray([[2.0], [3.0], [5.0]], dtype=np.float64)

    weights = _ridge_weights(features, targets, ridge_lambda=1e-6)
    preds = features @ weights

    assert weights.shape == (2, 1)
    assert np.allclose(preds, targets, atol=1e-3)


def test_summary_bank_variant_with_secondary_student_saves_secondary_checkpoint(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)

    from astar.student.predictor.summary_bank import (
        _cached_model_name,
        load_or_fit_named_summary_bank_predictor,
    )

    predictor_a = load_or_fit_named_summary_bank_predictor(
        sample_paths,
        model_name="teacher_student_blend_v99",
        round_ids=[ROUND_ID],
        policy_name="coverage",
    )
    predictor_b = load_or_fit_named_summary_bank_predictor(
        sample_paths,
        model_name="teacher_student_blend_v99",
        round_ids=[ROUND_ID],
        policy_name="coverage",
    )

    secondary_checkpoint_path = (
        sample_paths.model_dir(
            _cached_model_name(
                model_name="teacher_student_blend_v99",
                policy_name="coverage",
                samples_per_round=4,
                round_ids=[ROUND_ID],
            ),
        )
        / "secondary"
        / "summary_bank_student.json"
    )

    assert secondary_checkpoint_path.exists()
    assert predictor_a.secondary_student is not None
    assert predictor_b.secondary_student is not None
    assert predictor_b.secondary_student.k_neighbors == 5


def test_summary_bank_variant_with_secondary_student_can_use_distinct_encoder(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)

    from astar.student.posterior.deepset_student import SUMMARY_ENCODER_SEMANTIC_V3
    from astar.student.predictor.summary_bank import load_or_fit_named_summary_bank_predictor

    predictor = load_or_fit_named_summary_bank_predictor(
        sample_paths,
        model_name="teacher_student_blend_v103",
        round_ids=[ROUND_ID],
        policy_name="coverage",
    )

    assert predictor.secondary_student is not None
    assert predictor.secondary_student.summary_encoder == SUMMARY_ENCODER_SEMANTIC_V3


def test_summary_bank_variants_share_base_prior_and_teacher_cache(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)

    from astar.student.predictor.summary_bank import (
        _cached_shared_base_prior_name,
        _cached_shared_hazard_teacher_name,
        load_or_fit_named_summary_bank_predictor,
    )

    predictor_a = load_or_fit_named_summary_bank_predictor(
        sample_paths,
        model_name="teacher_student_blend_v21",
        round_ids=[ROUND_ID],
        policy_name="coverage",
    )
    predictor_b = load_or_fit_named_summary_bank_predictor(
        sample_paths,
        model_name="teacher_student_blend_v23",
        round_ids=[ROUND_ID],
        policy_name="coverage",
    )

    shared_base_path = (
        sample_paths.model_dir(_cached_shared_base_prior_name(round_ids=[ROUND_ID])) / "base_prior.json"
    )
    shared_teacher_path = (
        sample_paths.model_dir(_cached_shared_hazard_teacher_name(round_ids=[ROUND_ID]))
        / "hazard_teacher.json"
    )

    assert shared_base_path.exists()
    assert shared_teacher_path.exists()
    assert predictor_a.base_predictor.analyzed_seed_count == predictor_b.base_predictor.analyzed_seed_count
    assert predictor_b.student.teacher.name == _cached_shared_hazard_teacher_name(round_ids=[ROUND_ID])
