from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankTeacherPredictor,
    _cached_dataset_name,
    _round_ids_with_replays,
)
from astar.student.predictor.summary_bank_decoder import (
    _round_ids_with_replays_and_analyses,
    _spatial_basis,
    _weighted_standardize,
)
from astar.teacher.regime.base import RegimePosteriorState


def _law_design_tensor(
    spatial_basis: np.ndarray,
    prior_prediction: np.ndarray,
    *,
    teacher_prediction: np.ndarray | None,
) -> tuple[list[str], np.ndarray]:
    prior_logits = np.log(np.maximum(np.asarray(prior_prediction, dtype=np.float64), 1.0e-6))
    components = [spatial_basis, prior_logits]
    names = [
        *[f"spatial_{index}" for index in range(spatial_basis.shape[-1])],
        *[f"prior_logit_{class_name}" for class_name in CLASS_NAMES],
    ]
    if teacher_prediction is not None:
        teacher_logits = np.log(np.maximum(np.asarray(teacher_prediction, dtype=np.float64), 1.0e-6))
        components.append(teacher_logits)
        names.extend([f"teacher_logit_{class_name}" for class_name in CLASS_NAMES])
    return names, np.concatenate(components, axis=-1)


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.sqrt(np.maximum(np.var(features, axis=0), 1.0e-6))
    return means, scales


def _fit_weighted_ridge_normalized(
    normalized_features: np.ndarray,
    targets: np.ndarray,
    weights: np.ndarray,
    *,
    ridge_lambda: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate([np.ones((normalized_features.shape[0], 1), dtype=np.float64), normalized_features], axis=1)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ (design * weights[:, None]) + ridge_lambda * penalty
    rhs = design.T @ (targets * weights[:, None])
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _flatten_law_vector(intercept: np.ndarray, decoder_weights: np.ndarray) -> np.ndarray:
    return np.concatenate([intercept.reshape(-1), decoder_weights.reshape(-1)], axis=0)


def _unflatten_law_vector(
    law_vector: np.ndarray,
    *,
    feature_count: int,
) -> tuple[np.ndarray, np.ndarray]:
    intercept_dim = CLASS_COUNT
    expected_dim = intercept_dim + feature_count * CLASS_COUNT
    if law_vector.shape[0] != expected_dim:
        raise ValueError(
            f"law vector has dim={law_vector.shape[0]} but expected {expected_dim} for feature_count={feature_count}",
        )
    intercept = np.asarray(law_vector[:intercept_dim], dtype=np.float64)
    decoder_weights = np.asarray(law_vector[intercept_dim:], dtype=np.float64).reshape(feature_count, CLASS_COUNT)
    return intercept, decoder_weights


def _compress_law_matrix(
    law_matrix: np.ndarray,
    *,
    law_rank: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if law_rank <= 0:
        return law_matrix, np.zeros(law_matrix.shape[1], dtype=np.float64), np.zeros(
            (0, law_matrix.shape[1]),
            dtype=np.float64,
        )
    center = np.mean(law_matrix, axis=0)
    centered = law_matrix - center[None, :]
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    rank = min(law_rank, vt.shape[0], law_matrix.shape[0] - 1)
    if rank <= 0:
        return law_matrix, np.zeros(law_matrix.shape[1], dtype=np.float64), np.zeros(
            (0, law_matrix.shape[1]),
            dtype=np.float64,
        )
    basis = np.asarray(vt[:rank], dtype=np.float64)
    targets = centered @ basis.T
    return np.asarray(targets, dtype=np.float64), np.asarray(center, dtype=np.float64), basis


class SummaryRoundLawDecoderPredictor(BaseRoundPredictor):
    name: str = "f1_summary_roundlaw_decoder_v01"
    base_predictor: HistoricalBucketPriorPredictor
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    law_target_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    feature_names: list[str] = Field(default_factory=list)
    feature_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    default_law_vector: np.ndarray = Field(default_factory=lambda: np.zeros(CLASS_COUNT + 1, dtype=np.float64))
    law_center: np.ndarray = Field(default_factory=lambda: np.zeros(CLASS_COUNT + 1, dtype=np.float64))
    law_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, CLASS_COUNT + 1), dtype=np.float64))
    summary_teacher: SummaryBankTeacherPredictor | None = None
    include_teacher_logits: bool = False
    k_neighbors: int = Field(default=7, ge=1)
    law_rank: int = Field(default=0, ge=0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        budget: int = 50,
        samples_per_round: int = 4,
        k_neighbors: int = 7,
        model_name: str = "f1_summary_roundlaw_decoder_v01",
        probability_floor: float = 0.01,
        ridge_lambda: float = 12.0,
        law_rank: int = 0,
        include_teacher_logits: bool = False,
        synthetic_dataset_name: str | None = None,
    ) -> SummaryRoundLawDecoderPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary round-law decoder requires at least two replay-backed analyzed rounds")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )
        summary_teacher = (
            SummaryBankTeacherPredictor.fit_from_workspace(
                paths,
                round_ids=list(selected_round_ids),
                policy_name=policy_name,
                budget=budget,
                samples_per_round=samples_per_round,
                k_neighbors=k_neighbors,
                model_name=f"{model_name}__summary_teacher",
                probability_floor=probability_floor,
                synthetic_dataset_name=synthetic_dataset_name,
            )
            if include_teacher_logits
            else None
        )

        round_designs: dict[str, np.ndarray] = {}
        round_targets: dict[str, np.ndarray] = {}
        round_weights: dict[str, np.ndarray] = {}
        all_design_rows: list[np.ndarray] = []
        all_weight_rows: list[np.ndarray] = []
        feature_names: list[str] | None = None

        for round_id in selected_round_ids:
            round_detail = read_round_record(paths, round_id).round
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            features = compute_round_features(round_detail)
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
            teacher_predictions: dict[int, np.ndarray] = {}
            if summary_teacher is not None:
                exact_regime = summary_teacher.teacher.encode_round(build_round_episode(paths, round_id))
                exact_posterior = RegimePosteriorState(mean=np.asarray(exact_regime, dtype=np.float64))
                round_context = build_round_context_from_detail(round_detail)
                teacher_predictions = {
                    seed.seed_index: summary_teacher.teacher.posterior_predictive(seed, exact_posterior)
                    for seed in round_context.seeds
                }
            design_rows: list[np.ndarray] = []
            target_rows: list[np.ndarray] = []
            weight_rows: list[np.ndarray] = []
            for seed_index, analysis_record in sorted(analyses.items()):
                _, spatial_basis = _spatial_basis(round_detail, features, seed_index)
                feature_names, design_tensor = _law_design_tensor(
                    spatial_basis,
                    prior_bundle.predictions_by_seed[seed_index],
                    teacher_prediction=teacher_predictions.get(seed_index),
                )
                ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                prior_logits = np.log(
                    np.maximum(np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64), 1.0e-6),
                )
                target_delta = np.log(np.maximum(ground_truth, 1.0e-6)) - prior_logits
                cell_weights = entropy_map(ground_truth).reshape(-1) + 0.05
                design_rows.append(design_tensor.reshape(-1, design_tensor.shape[-1]))
                target_rows.append(target_delta.reshape(-1, CLASS_COUNT))
                weight_rows.append(cell_weights.astype(np.float64))
            if not design_rows:
                continue
            round_designs[round_id] = np.concatenate(design_rows, axis=0)
            round_targets[round_id] = np.concatenate(target_rows, axis=0)
            round_weights[round_id] = np.concatenate(weight_rows, axis=0)
            all_design_rows.append(round_designs[round_id])
            all_weight_rows.append(round_weights[round_id])

        if not all_design_rows or feature_names is None:
            raise ValueError("summary round-law decoder fit produced no training rows")

        feature_means, feature_scales = _weighted_standardize(
            np.concatenate(all_design_rows, axis=0),
            np.concatenate(all_weight_rows, axis=0),
        )

        law_round_ids = [round_id for round_id in selected_round_ids if round_id in round_designs]
        law_vectors: list[np.ndarray] = []
        for round_id in law_round_ids:
            normalized_design = (round_designs[round_id] - feature_means[None, :]) / feature_scales[None, :]
            intercept, decoder_weights = _fit_weighted_ridge_normalized(
                normalized_design,
                round_targets[round_id],
                round_weights[round_id],
                ridge_lambda=ridge_lambda,
            )
            law_vectors.append(_flatten_law_vector(intercept, decoder_weights))
        law_matrix = np.stack(law_vectors, axis=0)
        default_law_vector = np.mean(law_matrix, axis=0)
        compressed_targets, law_center, law_basis = _compress_law_matrix(law_matrix, law_rank=law_rank)
        law_targets_by_round = {
            round_id: np.asarray(target_vector, dtype=np.float64)
            for round_id, target_vector in zip(law_round_ids, compressed_targets, strict=True)
        }

        dataset_round_ids = _round_ids_with_replays(paths)
        resolved_dataset_name = synthetic_dataset_name or _cached_dataset_name(
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            round_ids=dataset_round_ids,
        )
        dataset = build_synthetic_live_dataset(
            paths,
            policy_name=policy_name,
            round_ids=list(dataset_round_ids),
            samples_per_round=samples_per_round,
            dataset_name=resolved_dataset_name,
            budget=budget,
        )
        if dataset.index_path is None:
            raise ValueError("synthetic live dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path).filter(pl.col("round_id").is_in(law_round_ids))

        summary_vectors: list[np.ndarray] = []
        law_targets: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(episode_path)
            summary_vectors.append(summary_vector)
            law_targets.append(law_targets_by_round[round_id])
        if not summary_vectors:
            raise ValueError("summary round-law decoder synthetic dataset is empty for selected rounds")
        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            law_target_vectors=np.stack(law_targets, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            feature_names=feature_names,
            feature_means=feature_means,
            feature_scales=feature_scales,
            default_law_vector=default_law_vector,
            law_center=law_center,
            law_basis=law_basis,
            summary_teacher=summary_teacher,
            include_teacher_logits=include_teacher_logits,
            k_neighbors=k_neighbors,
            law_rank=law_rank,
            probability_floor=probability_floor,
        )

    def _reconstruct_law_vector(self, law_target: np.ndarray) -> np.ndarray:
        if self.law_basis.shape[0] == 0:
            return np.asarray(law_target, dtype=np.float64)
        return np.asarray(self.law_center + law_target @ self.law_basis, dtype=np.float64)

    def infer_law_vector(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return np.asarray(self.default_law_vector, dtype=np.float64)
        summary_vector = _summary_vector_from_evidence(evidence)
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.summary_vectors - normalized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.summary_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        law_target = np.asarray(np.tensordot(weights, self.law_target_vectors[order], axes=(0, 0)), dtype=np.float64)
        return self._reconstruct_law_vector(law_target)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        law_vector = self.infer_law_vector(evidence)
        intercept, decoder_weights = _unflatten_law_vector(
            law_vector,
            feature_count=len(self.feature_names),
        )
        teacher_predictions: dict[int, np.ndarray] = {}
        if self.include_teacher_logits and self.summary_teacher is not None:
            posterior = self.summary_teacher.infer_regime(evidence)
            round_context = build_round_context_from_detail(round_detail)
            teacher_predictions = {
                seed.seed_index: self.summary_teacher.teacher.posterior_predictive(seed, posterior)
                for seed in round_context.seeds
            }
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            _, spatial_basis = _spatial_basis(round_detail, features, seed_index)
            _, design_tensor = _law_design_tensor(
                spatial_basis,
                base_bundle.predictions_by_seed[seed_index],
                teacher_prediction=teacher_predictions.get(seed_index),
            )
            normalized_design = (design_tensor - self.feature_means[None, None, :]) / self.feature_scales[None, None, :]
            delta_logits = intercept[None, None, :] + np.tensordot(
                normalized_design,
                decoder_weights,
                axes=([2], [0]),
            )
            prior_logits = np.log(np.maximum(base_bundle.predictions_by_seed[seed_index], 1.0e-6))
            predictions_by_seed[seed_index] = apply_probability_floor(
                softmax_logits(prior_logits + delta_logits),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryRoundLawDecoderPredictor"]
