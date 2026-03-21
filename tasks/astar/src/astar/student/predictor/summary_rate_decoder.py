from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
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
    _decoder_design_tensor,
    _fit_weighted_ridge,
    _round_ids_with_replays_and_analyses,
    _spatial_basis,
)
from astar.teacher.regime.base import RegimePosteriorState
from astar.workflows.event_regime_posterior_audit import _round_target_frame


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.sqrt(np.maximum(np.var(features, axis=0), 1.0e-6))
    return means, scales


class SummaryRateDecoderPredictor(BaseRoundPredictor):
    name: str = "f1_summary_rate_decoder_v01"
    base_predictor: HistoricalBucketPriorPredictor
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    rate_target_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    decoder_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(6, dtype=np.float64))
    decoder_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 6), dtype=np.float64))
    feature_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    target_names: list[str] = Field(default_factory=list)
    summary_teacher: SummaryBankTeacherPredictor | None = None
    include_teacher_logits: bool = False
    k_neighbors: int = Field(default=7, ge=1)
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
        model_name: str = "f1_summary_rate_decoder_v01",
        probability_floor: float = 0.01,
        ridge_lambda: float = 12.0,
        include_teacher_logits: bool = False,
        synthetic_dataset_name: str | None = None,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        collapse_dataset_name: str = "f1_collapse_riskset_nr8_v1",
    ) -> SummaryRateDecoderPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary rate decoder requires at least two replay-backed analyzed rounds")

        target_frame = _round_target_frame(
            paths,
            birth_dataset_name=birth_dataset_name,
            collapse_dataset_name=collapse_dataset_name,
            target_family="rates",
        ).filter(pl.col("round_id").is_in(selected_round_ids))
        target_names = [name for name in target_frame.columns if name != "round_id"]
        target_by_round = {
            str(row["round_id"]): np.asarray(
                [row[name] for name in target_names],
                dtype=np.float64,
            )
            for row in target_frame.iter_rows(named=True)
        }
        if len(target_by_round) < 2:
            raise ValueError("summary rate decoder requires rate targets for at least two rounds")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(target_by_round),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )
        summary_teacher = (
            SummaryBankTeacherPredictor.fit_from_workspace(
                paths,
                round_ids=list(target_by_round),
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

        design_rows: list[np.ndarray] = []
        target_rows: list[np.ndarray] = []
        weight_rows: list[np.ndarray] = []
        feature_names: list[str] | None = None

        for round_id in sorted(target_by_round):
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
            rate_vector = target_by_round[round_id]
            for seed_index, analysis_record in sorted(analyses.items()):
                _, spatial_basis = _spatial_basis(round_detail, features, seed_index)
                feature_names, design_tensor = _decoder_design_tensor(
                    spatial_basis,
                    prior_bundle.predictions_by_seed[seed_index],
                    rate_vector,
                    teacher_prediction=teacher_predictions.get(seed_index),
                )
                ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                prior_logits = np.log(
                    np.maximum(np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64), 1.0e-6),
                )
                target_delta = np.log(np.maximum(ground_truth, 1.0e-6)) - prior_logits
                cell_weights = entropy_map(ground_truth).reshape(-1) + 0.05
                design_rows.append(design_tensor.reshape(-1, design_tensor.shape[-1]))
                target_rows.append(target_delta.reshape(-1, 6))
                weight_rows.append(cell_weights.astype(np.float64))

        if not design_rows or feature_names is None:
            raise ValueError("summary rate decoder fit produced no training rows")

        design_matrix = np.concatenate(design_rows, axis=0)
        targets = np.concatenate(target_rows, axis=0)
        weights = np.concatenate(weight_rows, axis=0)
        intercept, decoder_weights, means, scales = _fit_weighted_ridge(
            design_matrix,
            targets,
            weights,
            ridge_lambda=ridge_lambda,
        )

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
        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(sorted(target_by_round)),
        )

        summary_vectors: list[np.ndarray] = []
        rate_vectors: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(episode_path)
            summary_vectors.append(summary_vector)
            rate_vectors.append(target_by_round[round_id])
        if not summary_vectors:
            raise ValueError("summary rate decoder synthetic dataset is empty for selected rounds")
        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            rate_target_vectors=np.stack(rate_vectors, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            decoder_intercept=intercept,
            decoder_weights=decoder_weights,
            feature_means=means,
            feature_scales=scales,
            target_names=target_names,
            summary_teacher=summary_teacher,
            include_teacher_logits=include_teacher_logits,
            k_neighbors=k_neighbors,
            probability_floor=probability_floor,
        )

    def infer_rate_vector(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return np.asarray(np.mean(self.rate_target_vectors, axis=0), dtype=np.float64)
        summary_vector = _summary_vector_from_evidence(evidence)
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.summary_vectors - normalized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.summary_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        return np.asarray(np.tensordot(weights, self.rate_target_vectors[order], axes=(0, 0)), dtype=np.float64)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        rate_vector = self.infer_rate_vector(evidence)
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
            _, design_tensor = _decoder_design_tensor(
                spatial_basis,
                base_bundle.predictions_by_seed[seed_index],
                rate_vector,
                teacher_prediction=teacher_predictions.get(seed_index),
            )
            normalized_design = (design_tensor - self.feature_means[None, None, :]) / self.feature_scales[None, None, :]
            delta_logits = self.decoder_intercept[None, None, :] + np.tensordot(
                normalized_design,
                self.decoder_weights,
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


__all__ = ["SummaryRateDecoderPredictor"]
