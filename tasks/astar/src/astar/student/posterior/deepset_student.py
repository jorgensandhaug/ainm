from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, coverage_counts
from astar.core.terrain import CLASS_COUNT, buildable_mask, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.features.coasts import coast_mask as build_coast_mask
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

SummaryVariant = Literal["v1", "v2", "v3"]

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


def _seed_summary_block_size(variant: SummaryVariant) -> int:
    base = 1 + CLASS_COUNT + 4
    if variant == "v1":
        return base
    if variant == "v2":
        return base + 10
    return base + 26


def _summary_vector_from_observations(
    observations: tuple[LiveQueryObs, ...],
    *,
    seed_count: int,
    map_width: int,
    map_height: int,
    variant: SummaryVariant,
    initial_grids: tuple[np.ndarray, ...] | None = None,
) -> np.ndarray:
    if variant == "v3":
        if initial_grids is None or len(initial_grids) < seed_count:
            raise ValueError("summary variant v3 requires initial grids")
        per_seed_initial = {
            seed_index: (
                collapse_internal_grid(np.asarray(initial_grids[seed_index], dtype=np.int64)),
                build_coast_mask(np.asarray(initial_grids[seed_index], dtype=np.int64)).astype(bool),
                (
                    buildable_mask(np.asarray(initial_grids[seed_index], dtype=np.int64))
                    & ~build_coast_mask(np.asarray(initial_grids[seed_index], dtype=np.int64))
                ).astype(bool),
            )
            for seed_index in range(seed_count)
        }
    else:
        per_seed_initial = {}

    grouped: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in range(seed_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)

    components: list[float] = []
    area_denominator = float(max(map_width * map_height, 1))

    for seed_index in range(seed_count):
        seed_observations = grouped.get(seed_index, [])
        class_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
        populations: list[float] = []
        foods: list[float] = []
        wealths: list[float] = []
        defenses: list[float] = []

        settlement_counts: list[float] = []
        alive_share: list[float] = []
        port_share: list[float] = []
        center_x: list[float] = []
        center_y: list[float] = []
        area_share: list[float] = []

        initial_empty_count = 0.0
        initial_forest_count = 0.0
        initial_coast_count = 0.0
        initial_inland_count = 0.0
        built_on_initial_empty = 0.0
        port_on_initial_empty = 0.0
        ruin_on_initial_empty = 0.0
        forest_on_initial_empty = 0.0
        built_on_initial_forest = 0.0
        ruin_on_initial_forest = 0.0
        forest_on_initial_forest = 0.0
        built_on_initial_coast = 0.0
        port_on_initial_coast = 0.0
        ruin_on_initial_coast = 0.0
        built_on_initial_inland = 0.0
        changed_cell_count = 0.0
        observed_cell_count = 0.0

        for observation in seed_observations:
            collapsed = collapse_internal_grid(observation.grid)
            bincount = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
            class_counts += bincount

            settlements = observation.settlements
            settlement_counts.append(float(len(settlements)))
            if settlements:
                alive_total = sum(1 for settlement in settlements if settlement.alive)
                port_total = sum(1 for settlement in settlements if settlement.has_port)
                alive_share.append(alive_total / float(len(settlements)))
                port_share.append(port_total / float(len(settlements)))
            else:
                alive_share.append(0.0)
                port_share.append(0.0)

            center_x.append(
                float(observation.viewport.x + (0.5 * observation.viewport.w)) / float(max(map_width, 1)),
            )
            center_y.append(
                float(observation.viewport.y + (0.5 * observation.viewport.h)) / float(max(map_height, 1)),
            )
            area_share.append(
                float(observation.viewport.w * observation.viewport.h) / area_denominator,
            )

            if variant == "v3":
                initial_collapsed, initial_coast_mask, initial_inland_mask = per_seed_initial[seed_index]
                y0 = int(observation.viewport.y)
                y1 = y0 + int(observation.viewport.h)
                x0 = int(observation.viewport.x)
                x1 = x0 + int(observation.viewport.w)
                initial_patch = initial_collapsed[y0:y1, x0:x1]
                coast_patch = initial_coast_mask[y0:y1, x0:x1]
                inland_patch = initial_inland_mask[y0:y1, x0:x1]

                empty_patch = initial_patch == 0
                forest_patch = initial_patch == 4
                built_patch = np.isin(collapsed, (1, 2, 3))
                port_patch = collapsed == 2
                ruin_patch = collapsed == 3
                forest_final_patch = collapsed == 4

                observed_cell_count += float(collapsed.size)
                initial_empty_count += float(np.count_nonzero(empty_patch))
                initial_forest_count += float(np.count_nonzero(forest_patch))
                initial_coast_count += float(np.count_nonzero(coast_patch))
                initial_inland_count += float(np.count_nonzero(inland_patch))
                built_on_initial_empty += float(np.count_nonzero(built_patch & empty_patch))
                port_on_initial_empty += float(np.count_nonzero(port_patch & empty_patch))
                ruin_on_initial_empty += float(np.count_nonzero(ruin_patch & empty_patch))
                forest_on_initial_empty += float(np.count_nonzero(forest_final_patch & empty_patch))
                built_on_initial_forest += float(np.count_nonzero(built_patch & forest_patch))
                ruin_on_initial_forest += float(np.count_nonzero(ruin_patch & forest_patch))
                forest_on_initial_forest += float(np.count_nonzero(forest_final_patch & forest_patch))
                built_on_initial_coast += float(np.count_nonzero(built_patch & coast_patch))
                port_on_initial_coast += float(np.count_nonzero(port_patch & coast_patch))
                ruin_on_initial_coast += float(np.count_nonzero(ruin_patch & coast_patch))
                built_on_initial_inland += float(np.count_nonzero(built_patch & inland_patch))
                changed_cell_count += float(np.count_nonzero(collapsed != initial_patch))

            for settlement in settlements:
                if settlement.population is not None:
                    populations.append(float(settlement.population))
                if settlement.food is not None:
                    foods.append(float(settlement.food))
                if settlement.wealth is not None:
                    wealths.append(float(settlement.wealth))
                if settlement.defense is not None:
                    defenses.append(float(settlement.defense))

        total = float(np.sum(class_counts))
        class_frequencies = (
            class_counts / total if total > 0 else np.zeros(CLASS_COUNT, dtype=np.float64)
        )
        components.append(float(len(seed_observations)))
        components.extend(class_frequencies.tolist())
        components.append(float(np.mean(populations)) if populations else 0.0)
        components.append(float(np.mean(foods)) if foods else 0.0)
        components.append(float(np.mean(wealths)) if wealths else 0.0)
        components.append(float(np.mean(defenses)) if defenses else 0.0)

        if variant == "v2":
            if seed_observations:
                coverage = coverage_counts(
                    MapShape(width=map_width, height=map_height),
                    [item.viewport for item in seed_observations],
                ).astype(np.float64)
                covered = coverage > 0.0
                repeated = coverage > 1.0
                components.extend(
                    [
                        float(np.mean(settlement_counts)),
                        float(np.mean(alive_share)),
                        float(np.mean(port_share)),
                        float(np.mean(center_x)),
                        float(np.mean(center_y)),
                        float(np.std(center_x)),
                        float(np.std(center_y)),
                        float(np.mean(area_share)),
                        float(np.mean(covered)),
                        float(np.mean(repeated)),
                    ],
                )
            else:
                components.extend([0.0] * 10)
        elif variant == "v3":
            if seed_observations:
                coverage = coverage_counts(
                    MapShape(width=map_width, height=map_height),
                    [item.viewport for item in seed_observations],
                ).astype(np.float64)
                covered = coverage > 0.0
                repeated = coverage > 1.0
                components.extend(
                    [
                        float(np.mean(settlement_counts)),
                        float(np.mean(alive_share)),
                        float(np.mean(port_share)),
                        float(np.mean(center_x)),
                        float(np.mean(center_y)),
                        float(np.std(center_x)),
                        float(np.std(center_y)),
                        float(np.mean(area_share)),
                        float(np.mean(covered)),
                        float(np.mean(repeated)),
                        initial_empty_count / max(observed_cell_count, 1.0),
                        initial_forest_count / max(observed_cell_count, 1.0),
                        initial_coast_count / max(observed_cell_count, 1.0),
                        initial_inland_count / max(observed_cell_count, 1.0),
                        built_on_initial_empty / max(initial_empty_count, 1.0),
                        port_on_initial_empty / max(initial_empty_count, 1.0),
                        ruin_on_initial_empty / max(initial_empty_count, 1.0),
                        forest_on_initial_empty / max(initial_empty_count, 1.0),
                        built_on_initial_forest / max(initial_forest_count, 1.0),
                        ruin_on_initial_forest / max(initial_forest_count, 1.0),
                        forest_on_initial_forest / max(initial_forest_count, 1.0),
                        built_on_initial_coast / max(initial_coast_count, 1.0),
                        port_on_initial_coast / max(initial_coast_count, 1.0),
                        ruin_on_initial_coast / max(initial_coast_count, 1.0),
                        built_on_initial_inland / max(initial_inland_count, 1.0),
                        changed_cell_count / max(observed_cell_count, 1.0),
                    ],
                )
            else:
                components.extend([0.0] * 26)

    return np.asarray(components, dtype=np.float64)


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
