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
