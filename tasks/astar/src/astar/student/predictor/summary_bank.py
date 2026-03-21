from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

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
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState


def _round_ids_with_replays(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    available = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if round_ids is None:
        return available
    return [round_id for round_id in round_ids if round_id in available]


def _round_scope_token(round_ids: Sequence[str]) -> str:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_dataset_name(
    *,
    policy_name: str,
    budget: int,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"f1_summary_bank_synth__policy={policy_name.strip().lower()}"
        f"__budget={budget}__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.maximum(np.std(features, axis=0), 1.0e-6)
    return means, scales


class SummaryBankTeacherPredictor(BaseRoundPredictor):
    name: str = "f1_summary_bank_teacher_b50s4k7_v01"
    teacher: HazardTeacher
    summary_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    regime_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
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
        model_name: str = "f1_summary_bank_teacher_b50s4k7_v01",
        probability_floor: float = 0.01,
        synthetic_dataset_name: str | None = None,
    ) -> SummaryBankTeacherPredictor:
        selected_round_ids = _round_ids_with_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("summary bank predictor requires replay-backed rounds")
        teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(
            [build_round_episode(paths, round_id) for round_id in selected_round_ids],
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
            pl.col("round_id").is_in(selected_round_ids),
        )
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, regime_vector = _summary_vector_from_artifact(episode_path)
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("summary bank predictor synthetic dataset is empty for selected rounds")
        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)
        return cls(
            name=model_name,
            teacher=teacher,
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            regime_vectors=np.stack(regime_vectors, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            k_neighbors=k_neighbors,
            probability_floor=probability_floor,
        )

    def infer_regime(self, evidence: RoundEvidenceBundle | None) -> RegimePosteriorState:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            mean = (
                np.mean(self.regime_vectors, axis=0)
                if self.regime_vectors.shape[0] > 0
                else np.zeros(1, dtype=np.float64)
            )
            return RegimePosteriorState(mean=np.asarray(mean, dtype=np.float64))
        summary_vector = _summary_vector_from_evidence(evidence)
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.summary_vectors - normalized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.summary_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        mean = np.asarray(np.tensordot(weights, self.regime_vectors[order], axes=(0, 0)))
        return RegimePosteriorState(
            mean=mean,
            particles=tuple(self.regime_vectors[index] for index in order),
            weights=np.asarray(weights, dtype=np.float64),
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: object | None = None,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features
        posterior = self.infer_regime(evidence)
        round_context = build_round_context_from_detail(round_detail)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in round_context.seeds:
            prediction = self.teacher.posterior_predictive(seed, posterior)
            predictions_by_seed[seed.seed_index] = apply_probability_floor(
                prediction,
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryBankTeacherPredictor"]
