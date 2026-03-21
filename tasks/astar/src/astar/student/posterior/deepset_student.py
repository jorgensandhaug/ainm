from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import (
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import (
    RoundEvidenceBundle,
    _coverage_summary_from_observations,
    _settlement_summary_from_groups,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState

SUPPORTED_SUMMARY_FEATURE_VARIANTS = ("basic", "stress_v1")


def _optional_float(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _normalize_summary_feature_variant(feature_variant: str | None) -> str:
    normalized = "basic" if feature_variant is None else feature_variant.strip().lower()
    if normalized not in SUPPORTED_SUMMARY_FEATURE_VARIANTS:
        raise ValueError(f"unsupported summary feature variant: {feature_variant}")
    return normalized


def _seed_summary_components_from_evidence(
    seed: object,
    *,
    feature_variant: str,
) -> list[float]:
    if feature_variant == "basic":
        return [
            float(seed.query_count),
            *seed.observed_class_frequencies.astype(np.float64).tolist(),
            _optional_float(seed.mean_population),
            _optional_float(seed.mean_food),
            _optional_float(seed.mean_wealth),
            _optional_float(seed.mean_defense),
        ]
    return [
        float(seed.query_count),
        float(seed.repeated_window_groups),
        float(seed.observed_cell_count),
        float(seed.repeated_cell_count),
        float(seed.mean_positive_coverage_count),
        *seed.observed_class_frequencies.astype(np.float64).tolist(),
        float(seed.mean_settlement_count),
        float(seed.std_settlement_count),
        float(seed.port_share),
        float(seed.owner_count),
        float(seed.largest_owner_share),
        float(seed.owner_hhi),
        _optional_float(seed.mean_population),
        _optional_float(seed.std_population),
        _optional_float(seed.q25_population),
        _optional_float(seed.q75_population),
        _optional_float(seed.mean_food),
        _optional_float(seed.std_food),
        _optional_float(seed.q25_food),
        _optional_float(seed.q75_food),
        _optional_float(seed.mean_wealth),
        _optional_float(seed.std_wealth),
        _optional_float(seed.q25_wealth),
        _optional_float(seed.q75_wealth),
        _optional_float(seed.mean_defense),
        _optional_float(seed.std_defense),
        _optional_float(seed.q25_defense),
        _optional_float(seed.q75_defense),
    ]


def _artifact_seed_summary_components(
    observations: list[LiveQueryObs],
    *,
    feature_variant: str,
) -> list[float]:
    class_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
    repeat_counts: dict[tuple[int, int, int, int, int], int] = {}
    for observation in observations:
        viewport = observation.viewport
        key = (
            int(observation.seed_index),
            int(viewport.x),
            int(viewport.y),
            int(viewport.w),
            int(viewport.h),
        )
        repeat_counts[key] = repeat_counts.get(key, 0) + 1
        collapsed = collapse_internal_grid(observation.grid)
        class_counts += np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
    total = float(np.sum(class_counts))
    class_frequencies = class_counts / total if total > 0 else np.zeros(CLASS_COUNT, dtype=np.float64)
    if feature_variant == "basic":
        settlement_summary = _settlement_summary_from_groups(
            [observation.settlements for observation in observations],
        )
        return [
            float(len(observations)),
            *class_frequencies.tolist(),
            _optional_float(settlement_summary["mean_population"]),
            _optional_float(settlement_summary["mean_food"]),
            _optional_float(settlement_summary["mean_wealth"]),
            _optional_float(settlement_summary["mean_defense"]),
        ]
    observed_cell_count, repeated_cell_count, mean_positive_coverage_count = _coverage_summary_from_observations(
        observations,
    )
    settlement_summary = _settlement_summary_from_groups(
        [observation.settlements for observation in observations],
    )
    return [
        float(len(observations)),
        float(sum(1 for count in repeat_counts.values() if count > 1)),
        float(observed_cell_count),
        float(repeated_cell_count),
        float(mean_positive_coverage_count),
        *class_frequencies.tolist(),
        float(settlement_summary["mean_settlement_count"]),
        float(settlement_summary["std_settlement_count"]),
        float(settlement_summary["port_share"]),
        float(settlement_summary["owner_count"]),
        float(settlement_summary["largest_owner_share"]),
        float(settlement_summary["owner_hhi"]),
        _optional_float(settlement_summary["mean_population"]),
        _optional_float(settlement_summary["std_population"]),
        _optional_float(settlement_summary["q25_population"]),
        _optional_float(settlement_summary["q75_population"]),
        _optional_float(settlement_summary["mean_food"]),
        _optional_float(settlement_summary["std_food"]),
        _optional_float(settlement_summary["q25_food"]),
        _optional_float(settlement_summary["q75_food"]),
        _optional_float(settlement_summary["mean_wealth"]),
        _optional_float(settlement_summary["std_wealth"]),
        _optional_float(settlement_summary["q25_wealth"]),
        _optional_float(settlement_summary["q75_wealth"]),
        _optional_float(settlement_summary["mean_defense"]),
        _optional_float(settlement_summary["std_defense"]),
        _optional_float(settlement_summary["q25_defense"]),
        _optional_float(settlement_summary["q75_defense"]),
    ]


def _summary_vector_from_evidence(
    evidence: RoundEvidenceBundle,
    *,
    feature_variant: str = "basic",
) -> np.ndarray:
    normalized_variant = _normalize_summary_feature_variant(feature_variant)
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        components.extend(
            _seed_summary_components_from_evidence(
                seed,
                feature_variant=normalized_variant,
            ),
        )
    return np.asarray(components, dtype=np.float64)


def _summary_vector_from_artifact(
    path: Path,
    *,
    feature_variant: str = "basic",
) -> tuple[np.ndarray, np.ndarray]:
    normalized_variant = _normalize_summary_feature_variant(feature_variant)
    artifact = load_synthetic_episode(path)
    grouped: dict[int, list[LiveQueryObs]] = {}
    for observation in artifact.observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    seed_indexes = sorted(
        set(grouped)
        | {int(seed_index) for seed_index in artifact.target_paths}
        | {int(seed_index) for seed_index in artifact.target_sources}
    )

    components: list[float] = []
    for seed_index in seed_indexes:
        observations = grouped.get(seed_index, [])
        components.extend(
            _artifact_seed_summary_components(
                observations,
                feature_variant=normalized_variant,
            ),
        )
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
            summary_vector, regime_vector = _summary_vector_from_artifact(
                resolve_synthetic_episode_path(dataset.dataset_dir, Path(str(path_value))),
            )
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
