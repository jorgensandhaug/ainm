from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.manifold import factorize_round_coefficients
from astar.history.summaries.round_coefficients import fit_round_semimechanistic_coefficients
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import _cached_dataset_name, _round_ids_with_replays
from astar.student.predictor.summary_bank_decoder import _round_ids_with_replays_and_analyses
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.std(features, axis=0)
    return means, np.maximum(scales, 1.0e-6)


def _knn_predict(
    train_x: np.ndarray,
    train_y: np.ndarray,
    query_x: np.ndarray,
    *,
    k_neighbors: int,
) -> np.ndarray:
    if train_x.shape[0] == 0:
        raise ValueError("summary round-law predictor requires at least one training episode")
    distances = np.linalg.norm(train_x - query_x[None, :], axis=1)
    order = np.argsort(distances)[: min(k_neighbors, train_x.shape[0])]
    neighbor_distances = distances[order]
    weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
    weights = weights / np.sum(weights)
    return np.asarray(np.tensordot(weights, train_y[order], axes=(0, 0)), dtype=np.float64)


class SummaryRoundLawPredictor(BaseRoundPredictor):
    name: str = "f1_summary_roundlaw_v01"
    decoder: HazardTeacher
    target_round_ids: tuple[str, ...] = ()
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    target_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    coefficient_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    coefficient_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    effective_law_rank: int = Field(default=0, ge=0)
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
        model_name: str = "f1_summary_roundlaw_v01",
        probability_floor: float = 0.01,
        law_rank: int = 0,
        ridge_alpha: float = 1.0e-2,
        synthetic_dataset_name: str | None = None,
    ) -> SummaryRoundLawPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary round-law predictor requires at least two replay-backed analyzed rounds")

        coefficient_rows = [
            fit_round_semimechanistic_coefficients(
                build_round_episode(paths, round_id),
                ridge_alpha=ridge_alpha,
            )
            for round_id in selected_round_ids
        ]
        feature_names = list(coefficient_rows[0].feature_names)
        coefficient_dim = int(coefficient_rows[0].combined_vector().size)
        if law_rank > 0:
            manifold = factorize_round_coefficients(coefficient_rows, max_rank=law_rank)
            target_by_round = {
                round_id: np.asarray(coordinates, dtype=np.float64)
                for round_id, coordinates in zip(manifold.round_ids, manifold.coordinates, strict=True)
            }
            coefficient_mean = np.asarray(manifold.mean_vector, dtype=np.float64)
            coefficient_basis = np.asarray(manifold.basis, dtype=np.float64)
            effective_law_rank = int(manifold.effective_rank)
        else:
            target_by_round = {
                row.round_id: np.asarray(row.combined_vector(), dtype=np.float64)
                for row in coefficient_rows
            }
            coefficient_mean = np.zeros(coefficient_dim, dtype=np.float64)
            coefficient_basis = np.zeros((0, coefficient_dim), dtype=np.float64)
            effective_law_rank = 0

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
            raise ValueError("summary round-law predictor requires a synthetic-live index")

        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(selected_round_ids),
        )
        summary_rows: list[np.ndarray] = []
        target_rows: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            target = target_by_round.get(round_id)
            if target is None:
                continue
            episode_path = resolve_synthetic_episode_path(dataset.dataset_dir, row["episode_path"])
            summary_vector, _ = _summary_vector_from_artifact(episode_path)
            summary_rows.append(summary_vector)
            target_rows.append(target)
        if not summary_rows:
            raise ValueError("summary round-law predictor synthetic dataset is empty for selected rounds")

        summary_stack = np.stack(summary_rows, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)
        decoder = HazardTeacher(
            name=f"{model_name}__decoder",
            feature_names=feature_names,
        )
        return cls(
            name=model_name,
            decoder=decoder,
            target_round_ids=tuple(selected_round_ids),
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            target_vectors=np.stack(target_rows, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            coefficient_mean=coefficient_mean,
            coefficient_basis=coefficient_basis,
            effective_law_rank=effective_law_rank,
            k_neighbors=k_neighbors,
            probability_floor=probability_floor,
        )

    def infer_coefficients(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0:
            target = (
                np.mean(self.target_vectors, axis=0)
                if self.target_vectors.shape[0] > 0
                else np.zeros(self.coefficient_mean.shape[0], dtype=np.float64)
            )
        else:
            summary_vector = _summary_vector_from_evidence(evidence)
            normalized = (summary_vector - self.summary_means) / self.summary_scales
            target = _knn_predict(
                self.summary_vectors,
                self.target_vectors,
                normalized,
                k_neighbors=self.k_neighbors,
            )
        target_array = np.asarray(target, dtype=np.float64)
        if self.effective_law_rank <= 0 or self.coefficient_basis.shape[0] == 0:
            return target_array
        return np.asarray(
            self.coefficient_mean + target_array @ self.coefficient_basis,
            dtype=np.float64,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: object | None = None,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features
        coefficient_vector = self.infer_coefficients(evidence)
        round_context = build_round_context_from_detail(round_detail)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in round_context.seeds:
            prediction = self.decoder.predict_from_coefficients(seed, coefficient_vector)
            predictions_by_seed[seed.seed_index] = apply_probability_floor(
                prediction,
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryRoundLawPredictor"]
