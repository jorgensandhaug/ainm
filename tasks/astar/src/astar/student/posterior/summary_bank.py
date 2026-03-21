from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.posterior.transcript_artifacts import (
    summary_vector_from_artifact,
    summary_vector_from_context,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState


class SummaryBankStudentCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    teacher_checkpoint_path: str
    k_neighbors: int = Field(ge=1)
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    summary_feature_names: list[str] = Field(default_factory=list)
    teacher_name: str


class SummaryBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "summary_bank_student_v1"
    dataset_name: str = "synthetic_live_v1"
    summary_feature_names: tuple[str, ...] = ()
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    teacher: HazardTeacher

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: HazardTeacher,
        *,
        k_neighbors: int = 5,
    ) -> SummaryBankStudent:
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        summary_feature_names: tuple[str, ...] | None = None
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for path_value in index_table["episode_path"].to_list():
            feature_names, summary_vector, regime_vector = summary_vector_from_artifact(
                Path(str(path_value))
            )
            if summary_feature_names is None:
                summary_feature_names = feature_names
            elif feature_names != summary_feature_names:
                raise ValueError("summary-bank feature names drifted across synthetic episodes")
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any summary vectors")
        return cls(
            dataset_name=dataset.dataset_name,
            summary_feature_names=summary_feature_names or (),
            summary_vectors=np.stack(summary_vectors, axis=0),
            regime_vectors=np.stack(regime_vectors, axis=0),
            k_neighbors=k_neighbors,
            teacher=teacher,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        teacher_checkpoint_path: Path,
    ) -> SummaryBankStudentCheckpoint:
        return SummaryBankStudentCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            k_neighbors=self.k_neighbors,
            sample_count=int(self.summary_vectors.shape[0]),
            summary_dim=int(self.summary_vectors.shape[1]),
            regime_dim=int(self.regime_vectors.shape[1]),
            summary_feature_names=list(self.summary_feature_names),
            teacher_name=self.teacher.name,
        )

    def save_checkpoint(self, checkpoint_dir: Path, teacher_checkpoint_path: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "bank.npz"
        json_path = checkpoint_dir / "summary_bank_student.json"
        np.savez_compressed(
            npz_path,
            summary_vectors=self.summary_vectors,
            regime_vectors=self.regime_vectors,
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(Path(npz_path.name), teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(
        cls,
        path: Path,
        *,
        teacher: HazardTeacher,
    ) -> SummaryBankStudent:
        checkpoint = SummaryBankStudentCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8")
        )
        if checkpoint.teacher_name != teacher.name:
            raise ValueError(
                "summary-bank teacher mismatch: "
                f"checkpoint expects {checkpoint.teacher_name}, got {teacher.name}"
            )
        npz_path = Path(checkpoint.checkpoint_npz_path)
        if not npz_path.is_absolute():
            npz_path = (path.parent / npz_path).resolve()
        arrays = np.load(npz_path)
        summary_vectors = np.asarray(arrays["summary_vectors"], dtype=np.float64)
        regime_vectors = np.asarray(arrays["regime_vectors"], dtype=np.float64)
        if summary_vectors.ndim != 2 or summary_vectors.shape[0] != checkpoint.sample_count:
            raise ValueError("summary-bank checkpoint summary_vectors shape mismatch")
        if regime_vectors.ndim != 2 or regime_vectors.shape[0] != checkpoint.sample_count:
            raise ValueError("summary-bank checkpoint regime_vectors shape mismatch")
        if summary_vectors.shape[1] != checkpoint.summary_dim:
            raise ValueError("summary-bank checkpoint summary_dim mismatch")
        if regime_vectors.shape[1] != checkpoint.regime_dim:
            raise ValueError("summary-bank checkpoint regime_dim mismatch")
        if summary_vectors.shape[0] != regime_vectors.shape[0]:
            raise ValueError("summary-bank checkpoint sample rows mismatch")
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            summary_feature_names=tuple(checkpoint.summary_feature_names),
            summary_vectors=summary_vectors,
            regime_vectors=regime_vectors,
            k_neighbors=checkpoint.k_neighbors,
            teacher=teacher,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = summary_vector_from_context(context)
        if self.summary_vectors.size == 0:
            raise ValueError("summary bank is empty")
        if query_vector.shape[0] != self.summary_vectors.shape[1]:
            raise ValueError(
                "summary-bank query vector shape mismatch: "
                f"expected {self.summary_vectors.shape[1]}, got {query_vector.shape[0]}"
            )
        distances = np.linalg.norm(self.summary_vectors - query_vector[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        mean = np.tensordot(weights, self.regime_vectors[order], axes=(0, 0))
        particles = tuple(self.regime_vectors[index] for index in order)
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


__all__ = ["SummaryBankStudent", "SummaryBankStudentCheckpoint"]
