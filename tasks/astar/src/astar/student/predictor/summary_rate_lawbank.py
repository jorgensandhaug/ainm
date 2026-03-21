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
    _round_ids_with_replays_and_analyses,
    _spatial_basis,
    _weighted_standardize,
)
from astar.student.predictor.summary_rate_decoder import _target_frame
from astar.student.predictor.summary_roundlaw_decoder import (
    _fit_weighted_ridge_normalized,
    _flatten_law_vector,
    _law_design_tensor,
    _standardize,
    _unflatten_law_vector,
)
from astar.teacher.regime.base import RegimePosteriorState


class SummaryRateLawBankPredictor(BaseRoundPredictor):
    name: str = "f1_summary_rate_lawbank_collapse_portsplit_v01"
    base_predictor: HistoricalBucketPriorPredictor
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    rate_target_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    law_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    law_rate_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    law_rate_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    law_rate_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    feature_names: list[str] = Field(default_factory=list)
    feature_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    default_law_vector: np.ndarray = Field(default_factory=lambda: np.zeros(7, dtype=np.float64))
    target_family: str = "collapse_portsplit"
    target_names: list[str] = Field(default_factory=list)
    summary_teacher: SummaryBankTeacherPredictor | None = None
    include_teacher_logits: bool = False
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"

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
        model_name: str = "f1_summary_rate_lawbank_collapse_portsplit_v01",
        probability_floor: float = 0.01,
        ridge_lambda: float = 12.0,
        include_teacher_logits: bool = False,
        target_family: str = "collapse_portsplit",
        synthetic_dataset_name: str | None = None,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        collapse_dataset_name: str = "f1_collapse_riskset_nr8_v1",
        summary_feature_variant: str = "basic",
    ) -> SummaryRateLawBankPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary rate lawbank requires at least two replay-backed analyzed rounds")

        target_frame = _target_frame(
            paths,
            round_ids=selected_round_ids,
            birth_dataset_name=birth_dataset_name,
            collapse_dataset_name=collapse_dataset_name,
            target_family=target_family,
        )
        target_names = [name for name in target_frame.columns if name != "round_id"]
        target_by_round = {
            str(row["round_id"]): np.asarray([row[name] for name in target_names], dtype=np.float64)
            for row in target_frame.iter_rows(named=True)
        }
        if len(target_by_round) < 2:
            raise ValueError("summary rate lawbank requires rate targets for at least two rounds")

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
                summary_feature_variant=summary_feature_variant,
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
                target_rows.append(target_delta.reshape(-1, ground_truth.shape[-1]))
                weight_rows.append(cell_weights.astype(np.float64))
            if not design_rows:
                continue
            round_designs[round_id] = np.concatenate(design_rows, axis=0)
            round_targets[round_id] = np.concatenate(target_rows, axis=0)
            round_weights[round_id] = np.concatenate(weight_rows, axis=0)
            all_design_rows.append(round_designs[round_id])
            all_weight_rows.append(round_weights[round_id])

        if not all_design_rows or feature_names is None:
            raise ValueError("summary rate lawbank fit produced no training rows")

        feature_means, feature_scales = _weighted_standardize(
            np.concatenate(all_design_rows, axis=0),
            np.concatenate(all_weight_rows, axis=0),
        )

        law_round_ids: list[str] = []
        law_vectors: list[np.ndarray] = []
        law_rate_targets: list[np.ndarray] = []
        for round_id in sorted(target_by_round):
            if round_id not in round_designs:
                continue
            normalized_design = (round_designs[round_id] - feature_means[None, :]) / feature_scales[None, :]
            intercept, decoder_weights = _fit_weighted_ridge_normalized(
                normalized_design,
                round_targets[round_id],
                round_weights[round_id],
                ridge_lambda=ridge_lambda,
            )
            law_round_ids.append(round_id)
            law_vectors.append(_flatten_law_vector(intercept, decoder_weights))
            law_rate_targets.append(target_by_round[round_id])
        if len(law_vectors) < 2:
            raise ValueError("summary rate lawbank requires at least two fitted round laws")
        law_matrix = np.stack(law_vectors, axis=0)
        law_rate_matrix = np.stack(law_rate_targets, axis=0)
        law_rate_means, law_rate_scales = _standardize(law_rate_matrix)

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
        rate_vectors: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(
                episode_path,
                feature_variant=summary_feature_variant,
            )
            summary_vectors.append(summary_vector)
            rate_vectors.append(target_by_round[round_id])
        if not summary_vectors:
            raise ValueError("summary rate lawbank synthetic dataset is empty for selected rounds")
        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            rate_target_vectors=np.stack(rate_vectors, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            law_vectors=law_matrix,
            law_rate_vectors=(law_rate_matrix - law_rate_means[None, :]) / law_rate_scales[None, :],
            law_rate_means=law_rate_means,
            law_rate_scales=law_rate_scales,
            feature_names=feature_names,
            feature_means=feature_means,
            feature_scales=feature_scales,
            default_law_vector=np.mean(law_matrix, axis=0),
            target_family=target_family,
            target_names=target_names,
            summary_teacher=summary_teacher,
            include_teacher_logits=include_teacher_logits,
            k_neighbors=k_neighbors,
            probability_floor=probability_floor,
            summary_feature_variant=summary_feature_variant,
        )

    def infer_rate_vector(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return np.asarray(np.mean(self.rate_target_vectors, axis=0), dtype=np.float64)
        summary_vector = _summary_vector_from_evidence(
            evidence,
            feature_variant=self.summary_feature_variant,
        )
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.summary_vectors - normalized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.summary_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        return np.asarray(np.tensordot(weights, self.rate_target_vectors[order], axes=(0, 0)), dtype=np.float64)

    def infer_law_vector(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0 or self.law_vectors.shape[0] == 0:
            return np.asarray(self.default_law_vector, dtype=np.float64)
        rate_vector = self.infer_rate_vector(evidence)
        normalized_rate = (rate_vector - self.law_rate_means) / self.law_rate_scales
        distances = np.linalg.norm(self.law_rate_vectors - normalized_rate[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.law_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        return np.asarray(np.tensordot(weights, self.law_vectors[order], axes=(0, 0)), dtype=np.float64)

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


__all__ = ["SummaryRateLawBankPredictor"]
