from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, _build_seed_evidence_bundle
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState


def _optional_float(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _summary_vector_from_evidence(evidence: RoundEvidenceBundle) -> np.ndarray:
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        components.append(float(seed.query_count))
        components.extend(seed.observed_class_frequencies.astype(np.float64).tolist())
        components.append(_optional_float(seed.mean_population))
        components.append(_optional_float(seed.mean_food))
        components.append(_optional_float(seed.mean_wealth))
        components.append(_optional_float(seed.mean_defense))
    return np.asarray(components, dtype=np.float64)


def _summary_vector_from_artifact(path: Path) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path)
    
    seeds_count = max(5, max(artifact.target_sources.keys(), default=-1) + 1)
    grouped: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in range(seeds_count)}
    for observation in artifact.observations:
        grouped[observation.seed_index].append(observation)

    max_x = max((obs.viewport.x + obs.viewport.w for obs in artifact.observations), default=40)
    max_y = max((obs.viewport.y + obs.viewport.h for obs in artifact.observations), default=40)
    map_width = max(40, max_x)
    map_height = max(40, max_y)

    components: list[float] = []
    for seed_index in sorted(grouped):
        observations = grouped[seed_index]
        bundle = _build_seed_evidence_bundle(
            round_id=artifact.round_id,
            seed_index=seed_index,
            map_width=map_width,
            map_height=map_height,
            observations=observations,
        )
        components.append(float(bundle.query_count))
        components.extend(bundle.observed_class_frequencies.astype(np.float64).tolist())
        components.append(_optional_float(bundle.mean_population))
        components.append(_optional_float(bundle.mean_food))
        components.append(_optional_float(bundle.mean_wealth))
        components.append(_optional_float(bundle.mean_defense))
    return np.asarray(components, dtype=np.float64), artifact.regime_vector


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


class SummaryBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "summary_bank_student_v1"
    dataset_name: str = "synthetic_live_v1"
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
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for path_value in index_table["episode_path"].to_list():
            summary_vector, regime_vector = _summary_vector_from_artifact(Path(str(path_value)))
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any summary vectors")
        return cls(
            dataset_name=dataset.dataset_name,
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
                to_jsonable(self.checkpoint(npz_path, teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = _summary_vector_from_evidence(context.evidence_bundle)
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
