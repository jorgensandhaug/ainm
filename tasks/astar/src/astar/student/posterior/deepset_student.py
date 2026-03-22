from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, coverage_counts
from astar.core.terrain import CLASS_COUNT, buildable_mask, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.features.coasts import coast_mask as build_coast_mask
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.regime.base import RegimePosteriorState

SummaryVariant = Literal["v1", "v2", "v3"]
TargetKind = Literal["regime", "coefficients"]
InferenceMode = Literal["neighbor_average", "global_ridge"]


def _optional_float(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate(
        [np.ones((inputs.shape[0], 1), dtype=np.float64), inputs],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ targets
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


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


def _summary_vector_from_artifact(
    path: Path,
    *,
    variant: SummaryVariant,
) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path)
    return (
        _summary_vector_from_observations(
            artifact.observations,
            seed_count=artifact.seed_count,
            map_width=artifact.map_width,
            map_height=artifact.map_height,
            variant=variant,
            initial_grids=artifact.initial_grids,
        ),
        artifact.regime_vector,
    )


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
    summary_variant: SummaryVariant = "v1"
    use_standardized_distance: bool = False
    weight_temperature: float = Field(default=0.0, ge=0.0)
    inverse_distance_power: float = Field(default=1.0, gt=0.0)
    projected_regime_dim: int = Field(default=0, ge=0)
    target_kind: TargetKind = "regime"
    inference_mode: InferenceMode = "neighbor_average"
    ridge_alpha: float = Field(default=1e-2, gt=0.0)


class SummaryBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "summary_bank_student_v1"
    dataset_name: str = "synthetic_live_v1"
    summary_variant: SummaryVariant = "v1"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    use_standardized_distance: bool = False
    weight_temperature: float = Field(default=0.0, ge=0.0)
    inverse_distance_power: float = Field(default=1.0, gt=0.0)
    target_kind: TargetKind = "regime"
    inference_mode: InferenceMode = "neighbor_average"
    ridge_alpha: float = Field(default=1e-2, gt=0.0)
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regression_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regression_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    teacher: Any

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: Any,
        *,
        round_ids: list[str] | None = None,
        k_neighbors: int = 5,
        summary_variant: SummaryVariant = "v1",
        use_standardized_distance: bool = False,
        weight_temperature: float = 0.0,
        inverse_distance_power: float = 1.0,
        projected_regime_dim: int = 0,
        target_kind: TargetKind = "regime",
        inference_mode: InferenceMode = "neighbor_average",
        ridge_alpha: float = 1e-2,
    ) -> SummaryBankStudent:
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        if round_ids is not None:
            index_table = index_table.filter(pl.col("round_id").is_in(round_ids))
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for path_value in index_table["episode_path"].to_list():
            summary_vector, regime_vector = _summary_vector_from_artifact(
                Path(str(path_value)),
                variant=summary_variant,
            )
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any summary vectors")

        summary_matrix = np.stack(summary_vectors, axis=0)
        regime_matrix = np.stack(regime_vectors, axis=0)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)

        effective_regime_vectors = regime_matrix
        regime_mean = np.zeros(regime_matrix.shape[1], dtype=np.float64)
        regime_basis = np.zeros((0, regime_matrix.shape[1]), dtype=np.float64)
        if projected_regime_dim > 0 and regime_matrix.shape[0] > 0:
            regime_mean = np.mean(regime_matrix, axis=0)
            centered = regime_matrix - regime_mean[None, :]
            _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
            effective_dim = max(1, min(projected_regime_dim, vt_matrix.shape[0]))
            regime_basis = np.asarray(vt_matrix[:effective_dim], dtype=np.float64)
            effective_regime_vectors = centered @ regime_basis.T

        effective_summary_matrix = summary_matrix
        if use_standardized_distance:
            effective_summary_matrix = (
                summary_matrix - summary_mean[None, :]
            ) / summary_scale[None, :]
        regression_intercept = np.zeros(effective_regime_vectors.shape[1], dtype=np.float64)
        regression_weights = np.zeros(
            (effective_summary_matrix.shape[1], effective_regime_vectors.shape[1]),
            dtype=np.float64,
        )
        if inference_mode == "global_ridge":
            regression_intercept, regression_weights = _fit_linear_map(
                np.asarray(effective_summary_matrix, dtype=np.float64),
                np.asarray(effective_regime_vectors, dtype=np.float64),
                ridge_alpha=ridge_alpha,
            )

        return cls(
            dataset_name=dataset.dataset_name,
            summary_variant=summary_variant,
            summary_vectors=summary_matrix,
            regime_vectors=np.asarray(effective_regime_vectors, dtype=np.float64),
            k_neighbors=k_neighbors,
            use_standardized_distance=use_standardized_distance,
            weight_temperature=weight_temperature,
            inverse_distance_power=inverse_distance_power,
            target_kind=target_kind,
            inference_mode=inference_mode,
            ridge_alpha=ridge_alpha,
            summary_mean=np.asarray(summary_mean, dtype=np.float64),
            summary_scale=np.asarray(summary_scale, dtype=np.float64),
            regime_mean=np.asarray(regime_mean, dtype=np.float64),
            regime_basis=np.asarray(regime_basis, dtype=np.float64),
            regression_intercept=np.asarray(regression_intercept, dtype=np.float64),
            regression_weights=np.asarray(regression_weights, dtype=np.float64),
            teacher=teacher,
        )

    @classmethod
    def load_checkpoint(
        cls,
        path: Path,
        teacher: Any,
    ) -> SummaryBankStudent:
        checkpoint = SummaryBankStudentCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8"),
        )
        arrays = np.load(checkpoint.checkpoint_npz_path)
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            summary_variant=checkpoint.summary_variant,
            summary_vectors=np.asarray(arrays["summary_vectors"], dtype=np.float64),
            regime_vectors=np.asarray(arrays["regime_vectors"], dtype=np.float64),
            k_neighbors=checkpoint.k_neighbors,
            use_standardized_distance=checkpoint.use_standardized_distance,
            weight_temperature=checkpoint.weight_temperature,
            inverse_distance_power=checkpoint.inverse_distance_power,
            target_kind=checkpoint.target_kind,
            inference_mode=checkpoint.inference_mode,
            ridge_alpha=checkpoint.ridge_alpha,
            summary_mean=np.asarray(arrays["summary_mean"], dtype=np.float64),
            summary_scale=np.asarray(arrays["summary_scale"], dtype=np.float64),
            regime_mean=np.asarray(arrays["regime_mean"], dtype=np.float64),
            regime_basis=np.asarray(arrays["regime_basis"], dtype=np.float64),
            regression_intercept=np.asarray(arrays["regression_intercept"], dtype=np.float64),
            regression_weights=np.asarray(arrays["regression_weights"], dtype=np.float64),
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
            summary_variant=self.summary_variant,
            use_standardized_distance=self.use_standardized_distance,
            weight_temperature=self.weight_temperature,
            inverse_distance_power=self.inverse_distance_power,
            projected_regime_dim=int(self.regime_basis.shape[0]),
            target_kind=self.target_kind,
            inference_mode=self.inference_mode,
            ridge_alpha=self.ridge_alpha,
        )

    def save_checkpoint(self, checkpoint_dir: Path, teacher_checkpoint_path: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "bank.npz"
        json_path = checkpoint_dir / "summary_bank_student.json"
        np.savez_compressed(
            npz_path,
            summary_vectors=self.summary_vectors,
            regime_vectors=self.regime_vectors,
            summary_mean=self.summary_mean,
            summary_scale=self.summary_scale,
            regime_mean=self.regime_mean,
            regime_basis=self.regime_basis,
            regression_intercept=self.regression_intercept,
            regression_weights=self.regression_weights,
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(npz_path, teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    def _summary_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        return _summary_vector_from_observations(
            context.observations,
            seed_count=len(context.round_context.seeds),
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            variant=self.summary_variant,
            initial_grids=tuple(
                np.asarray(seed.initial_state.grid, dtype=np.int64)
                for seed in context.round_context.seeds
            ),
        )

    def _normalized_summary_matrix(self) -> np.ndarray:
        if not self.use_standardized_distance:
            return self.summary_vectors
        return (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]

    def _normalized_summary_vector(self, query_vector: np.ndarray) -> np.ndarray:
        if not self.use_standardized_distance:
            return np.asarray(query_vector, dtype=np.float64)
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _weights_from_distances(self, distances: np.ndarray) -> np.ndarray:
        if self.weight_temperature > 0.0:
            scaled = -distances / max(self.weight_temperature, 1e-6)
            scaled -= np.max(scaled)
            weights = np.exp(scaled)
        else:
            weights = 1.0 / np.clip(distances, 1e-6, None) ** self.inverse_distance_power
        weights = np.asarray(weights, dtype=np.float64)
        return weights / np.sum(weights)

    def _decode_target_vectors(self, values: np.ndarray) -> np.ndarray:
        if self.regime_basis.size == 0:
            return np.asarray(values, dtype=np.float64)
        return np.asarray(
            self.regime_mean + np.asarray(values, dtype=np.float64) @ self.regime_basis,
            dtype=np.float64,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = self._normalized_summary_vector(self._summary_query_vector(context))
        if self.inference_mode == "global_ridge":
            effective_mean = self.regression_intercept + query_vector @ self.regression_weights
            decoded_mean = self._decode_target_vectors(effective_mean)
            return RegimePosteriorState(
                mean=np.asarray(decoded_mean, dtype=np.float64),
            )
        summary_matrix = self._normalized_summary_matrix()
        distances = np.linalg.norm(summary_matrix - query_vector[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = self._weights_from_distances(nearest_distances)
        decoded_regimes = self._decode_target_vectors(self.regime_vectors[order])
        mean = np.tensordot(weights, decoded_regimes, axes=(0, 0))
        particles = tuple(decoded_regimes[index] for index in range(decoded_regimes.shape[0]))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        seed = context.round_context.seeds[seed_index]
        if self.target_kind == "coefficients":
            if posterior.particles is not None and posterior.weights is not None:
                components = [
                    self.teacher.decode_coefficients(seed, particle) for particle in posterior.particles
                ]
                stacked = np.stack(components, axis=0)
                weights = np.asarray(posterior.weights, dtype=np.float64)
                weights = weights / np.sum(weights)
                return np.tensordot(weights, stacked, axes=(0, 0))
            return self.teacher.decode_coefficients(seed, posterior.mean)
        return self.teacher.posterior_predictive(
            seed,
            posterior,
        )


__all__ = [
    "SummaryBankStudent",
    "SummaryBankStudentCheckpoint",
    "SummaryVariant",
    "TargetKind",
    "InferenceMode",
]


def _summary_vector_from_artifact_v2(path: Path) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path)
    observations = list(artifact.observations)
    target_seed_indexes = [int(seed_index) for seed_index in artifact.target_sources]
    inferred_width = artifact.map_width or max(
        (observation.viewport.x + observation.viewport.w for observation in observations),
        default=1,
    )
    inferred_height = artifact.map_height or max(
        (observation.viewport.y + observation.viewport.h for observation in observations),
        default=1,
    )
    seed_count = max(
        [observation.seed_index for observation in observations] + target_seed_indexes,
        default=-1,
    ) + 1
    return (
        _summary_vector_from_observations(
            observations,
            map_width=max(1, inferred_width),
            map_height=max(1, inferred_height),
            seed_count=max(1, seed_count),
        ),
        artifact.regime_vector,
    )


def _load_v2_training_pairs(
    dataset: SyntheticEpisodeDatasetRef,
) -> tuple[np.ndarray, np.ndarray]:
    if dataset.index_path is None:
        raise ValueError("synthetic dataset requires an index path")
    index_table = pl.read_parquet(dataset.index_path)
    summary_vectors: list[np.ndarray] = []
    regime_vectors: list[np.ndarray] = []
    for path_value in index_table["episode_path"].to_list():
        summary_vector, regime_vector = _summary_vector_from_artifact_v2(Path(str(path_value)))
        summary_vectors.append(summary_vector)
        regime_vectors.append(regime_vector)
    if not summary_vectors:
        raise ValueError("synthetic dataset did not yield any summary vectors")
    return np.stack(summary_vectors, axis=0), np.stack(regime_vectors, axis=0)


def _fit_refined_student_components(
    dataset: SyntheticEpisodeDatasetRef,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
    summary_mean = np.mean(summary_matrix, axis=0)
    summary_scale = np.std(summary_matrix, axis=0)
    summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
    normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]

    regime_mean = np.mean(regime_matrix, axis=0)
    centered_regime = regime_matrix - regime_mean[None, :]
    gram = normalized_summary.T @ normalized_summary
    rhs = normalized_summary.T @ centered_regime
    projection = np.linalg.solve(
        gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
        rhs,
    )
    regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
    regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
    regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
    return (
        summary_matrix,
        regime_matrix,
        summary_mean.astype(np.float64),
        summary_scale.astype(np.float64),
        regime_mean.astype(np.float64),
        np.asarray(projection, dtype=np.float64),
        np.asarray(regime_clip, dtype=np.float64),
    )


def _fit_attention_refined_student_components(
    dataset: SyntheticEpisodeDatasetRef,
    *,
    ridge_alpha: float,
    inducing_count: int,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    if dataset.index_path is None:
        raise ValueError("synthetic dataset requires an index path")
    index_table = pl.read_parquet(dataset.index_path)
    if index_table.height == 0:
        raise ValueError("synthetic dataset did not yield any episodes")

    episode_rows: list[tuple[np.ndarray, tuple[np.ndarray, ...], np.ndarray]] = []
    token_rows: list[np.ndarray] = []
    for path_value in index_table["episode_path"].to_list():
        artifact = load_synthetic_episode(Path(str(path_value)))
        observations = list(artifact.observations)
        target_seed_indexes = [int(seed_index) for seed_index in artifact.target_sources]
        inferred_width = artifact.map_width or max(
            (observation.viewport.x + observation.viewport.w for observation in observations),
            default=1,
        )
        inferred_height = artifact.map_height or max(
            (observation.viewport.y + observation.viewport.h for observation in observations),
            default=1,
        )
        seed_count = max(
            [observation.seed_index for observation in observations] + target_seed_indexes,
            default=-1,
        ) + 1
        resolved_width = max(1, inferred_width)
        resolved_height = max(1, inferred_height)
        resolved_seed_count = max(1, seed_count)
        base_summary = _summary_vector_from_observations(
            observations,
            map_width=resolved_width,
            map_height=resolved_height,
            seed_count=resolved_seed_count,
        )
        token_groups = _observation_token_groups(
            observations,
            map_width=resolved_width,
            map_height=resolved_height,
            seed_count=resolved_seed_count,
        )
        for token_matrix in token_groups:
            if token_matrix.shape[0] > 0:
                token_rows.append(token_matrix)
        episode_rows.append(
            (
                base_summary,
                token_groups,
                np.asarray(artifact.regime_vector, dtype=np.float64),
            ),
        )

    all_tokens = (
        np.concatenate(token_rows, axis=0)
        if token_rows
        else np.zeros((1, _OBSERVATION_FEATURE_DIM), dtype=np.float64)
    )
    token_feature_mean = np.mean(all_tokens, axis=0)
    token_feature_scale = np.std(all_tokens, axis=0)
    token_feature_scale = np.where(token_feature_scale > 1e-6, token_feature_scale, 1.0)
    normalized_tokens = (all_tokens - token_feature_mean[None, :]) / token_feature_scale[None, :]
    inducing_points = _select_inducing_points(
        normalized_tokens,
        inducing_count=inducing_count,
    )

    summary_matrix = np.stack(
        [
            np.concatenate(
                [
                    base_summary,
                    np.concatenate(
                        [
                            _attention_pool_features(
                                token_matrix,
                                token_feature_mean=token_feature_mean,
                                token_feature_scale=token_feature_scale,
                                inducing_points=inducing_points,
                            )
                            for token_matrix in token_groups
                        ],
                        axis=0,
                    ),
                ],
                axis=0,
            ).astype(np.float64)
            for base_summary, token_groups, _ in episode_rows
        ],
        axis=0,
    )
    regime_matrix = np.stack([regime_vector for _, _, regime_vector in episode_rows], axis=0)

    summary_mean = np.mean(summary_matrix, axis=0)
    summary_scale = np.std(summary_matrix, axis=0)
    summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
    normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]
    regime_mean = np.mean(regime_matrix, axis=0)
    centered_regime = regime_matrix - regime_mean[None, :]
    gram = normalized_summary.T @ normalized_summary
    rhs = normalized_summary.T @ centered_regime
    projection = np.linalg.solve(
        gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
        rhs,
    )
    regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
    regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
    regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
    return (
        summary_matrix.astype(np.float64),
        regime_matrix.astype(np.float64),
        summary_mean.astype(np.float64),
        summary_scale.astype(np.float64),
        regime_mean.astype(np.float64),
        np.asarray(projection, dtype=np.float64),
        np.asarray(regime_clip, dtype=np.float64),
        token_feature_mean.astype(np.float64),
        token_feature_scale.astype(np.float64),
        inducing_points.astype(np.float64),
    )


def _observation_grid_loglikelihood(
    predictive_tensor: np.ndarray,
    observation: LiveQueryObs,
    *,
    class_floor: float,
    class_weights: np.ndarray,
) -> float:
    viewport = observation.viewport
    patch = np.asarray(
        predictive_tensor[
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
            :,
        ],
        dtype=np.float64,
    )
    observed_classes = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
    class_probabilities = np.take_along_axis(
        patch,
        observed_classes[..., None],
        axis=-1,
    ).reshape(-1)
    observation_weights = np.asarray(class_weights[observed_classes.reshape(-1)], dtype=np.float64)
    safe_probabilities = np.clip(class_probabilities, class_floor, 1.0)
    if safe_probabilities.size == 0:
        return 0.0
    weight_sum = float(np.sum(observation_weights))
    if not np.isfinite(weight_sum) or weight_sum <= 0.0:
        return float(np.mean(np.log(safe_probabilities)))
    return float(np.sum(observation_weights * np.log(safe_probabilities)) / weight_sum)


def _posterior_reweighted_by_observations(
    context: LiveInferenceContext,
    *,
    teacher: object,
    particles: tuple[np.ndarray, ...],
    base_weights: np.ndarray,
    observation_weight: float,
    observation_class_floor: float,
    observation_class_weights: np.ndarray,
) -> np.ndarray:
    if observation_weight <= 0.0 or not context.observations:
        return np.asarray(base_weights, dtype=np.float64)
    terminal_tensor = getattr(teacher, "terminal_tensor", None)
    if not callable(terminal_tensor):
        return np.asarray(base_weights, dtype=np.float64)

    seed_cache: dict[int, list[np.ndarray]] = {}
    log_likelihoods = np.zeros(len(particles), dtype=np.float64)
    for particle_index in range(len(particles)):
        total_log_likelihood = 0.0
        for observation in context.observations:
            per_seed = seed_cache.setdefault(observation.seed_index, [])
            while len(per_seed) <= particle_index:
                seed = context.round_context.seeds[observation.seed_index]
                per_seed.append(
                    np.asarray(terminal_tensor(seed, particles[len(per_seed)]), dtype=np.float64),
                )
            total_log_likelihood += _observation_grid_loglikelihood(
                per_seed[particle_index],
                observation,
                class_floor=observation_class_floor,
                class_weights=observation_class_weights,
            )
        log_likelihoods[particle_index] = total_log_likelihood

    log_prior = np.log(np.clip(np.asarray(base_weights, dtype=np.float64), 1e-12, None))
    centered_log_likelihoods = log_likelihoods - float(np.mean(log_likelihoods))
    logits = log_prior + observation_weight * centered_log_likelihoods
    logits = logits - float(np.max(logits))
    refined = np.exp(np.clip(logits, -60.0, 0.0))
    total = float(np.sum(refined))
    if not np.isfinite(total) or total <= 0.0:
        return np.asarray(base_weights, dtype=np.float64)
    return np.asarray(refined / total, dtype=np.float64)


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




# === Agent1 additions (observation-set student family) ===

class ObservationSetBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_bank_student_v2"
    dataset_name: str = "synthetic_live_v2"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
    ) -> ObservationSetBankStudent:
        summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale.astype(np.float64),
            k_neighbors=k_neighbors,
            teacher=teacher,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        normalized_query = (query_vector - self.summary_mean) / self.summary_scale
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
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


class ObservationSetDistilledStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_distilled_student_v3"
    dataset_name: str = "synthetic_live_v3"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=8.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 8.0,
        predicted_particle_weight: float = 0.35,
    ) -> ObservationSetDistilledStudent:
        summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]

        regime_mean = np.mean(regime_matrix, axis=0)
        centered_regime = regime_matrix - regime_mean[None, :]
        gram = normalized_summary.T @ normalized_summary
        rhs = normalized_summary.T @ centered_regime
        projection = np.linalg.solve(
            gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
            rhs,
        )
        regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
        regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
        regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean.astype(np.float64),
            summary_scale=summary_scale.astype(np.float64),
            regime_mean=regime_mean.astype(np.float64),
            regime_projection=np.asarray(projection, dtype=np.float64),
            regime_clip=np.asarray(regime_clip, dtype=np.float64),
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            teacher=teacher,
        )

    def _predict_regime_mean(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        normalized_query = (query_vector - self.summary_mean) / self.summary_scale
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        predicted_mean = self._predict_regime_mean(context)
        distances = np.linalg.norm(self.regime_vectors - predicted_mean[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(weights, particle_matrix, axes=(0, 0))
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


class ObservationSetRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_refined_student_v4"
    dataset_name: str = "synthetic_live_v4"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=16.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 16.0,
        predicted_particle_weight: float = 0.5,
    ) -> ObservationSetRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
        ) = _fit_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
        )
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(weights, particle_matrix, axes=(0, 0))
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


class ObservationSetParticleRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_particle_refined_student_v5"
    dataset_name: str = "synthetic_live_v5"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    observation_weight: float = Field(default=8.0, gt=0.0)
    observation_class_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    observation_class_weights: np.ndarray = Field(
        default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64),
    )
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 32.0,
        predicted_particle_weight: float = 0.7,
        observation_weight: float = 8.0,
        observation_class_floor: float = 0.01,
        observation_class_weights: np.ndarray | None = None,
    ) -> ObservationSetParticleRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
        ) = _fit_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
        )
        resolved_class_weights = (
            np.asarray(observation_class_weights, dtype=np.float64)
            if observation_class_weights is not None
            else np.ones(CLASS_COUNT, dtype=np.float64)
        )
        if resolved_class_weights.shape != (CLASS_COUNT,):
            msg = (
                "observation_class_weights must have shape "
                f"({CLASS_COUNT},), got {resolved_class_weights.shape!r}"
            )
            raise ValueError(msg)
        resolved_class_weights = np.clip(resolved_class_weights, 1e-6, None)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_floor=observation_class_floor,
            observation_class_weights=resolved_class_weights,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        refined_weights = _posterior_reweighted_by_observations(
            context,
            teacher=self.teacher,
            particles=particles,
            base_weights=weights,
            observation_weight=self.observation_weight,
            observation_class_floor=self.observation_class_floor,
            observation_class_weights=self.observation_class_weights,
        )
        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(refined_weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(refined_weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetAttentionParticleRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_attention_particle_refined_student_v1"
    dataset_name: str = "synthetic_live_v6"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    token_feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(_OBSERVATION_FEATURE_DIM, dtype=np.float64))
    token_feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(_OBSERVATION_FEATURE_DIM, dtype=np.float64))
    inducing_points: np.ndarray = Field(default_factory=lambda: np.zeros((1, _OBSERVATION_FEATURE_DIM), dtype=np.float64))
    inducing_count: int = Field(default=6, ge=1)
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    observation_weight: float = Field(default=8.0, gt=0.0)
    observation_class_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    observation_class_weights: np.ndarray = Field(
        default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64),
    )
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        inducing_count: int = 6,
        k_neighbors: int = 5,
        ridge_alpha: float = 32.0,
        predicted_particle_weight: float = 0.7,
        observation_weight: float = 8.0,
        observation_class_floor: float = 0.01,
        observation_class_weights: np.ndarray | None = None,
    ) -> ObservationSetAttentionParticleRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
            token_feature_mean,
            token_feature_scale,
            inducing_points,
        ) = _fit_attention_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
            inducing_count=inducing_count,
        )
        resolved_class_weights = (
            np.asarray(observation_class_weights, dtype=np.float64)
            if observation_class_weights is not None
            else np.ones(CLASS_COUNT, dtype=np.float64)
        )
        if resolved_class_weights.shape != (CLASS_COUNT,):
            msg = (
                "observation_class_weights must have shape "
                f"({CLASS_COUNT},), got {resolved_class_weights.shape!r}"
            )
            raise ValueError(msg)
        resolved_class_weights = np.clip(resolved_class_weights, 1e-6, None)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            token_feature_mean=token_feature_mean,
            token_feature_scale=token_feature_scale,
            inducing_points=inducing_points,
            inducing_count=inducing_points.shape[0],
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_floor=observation_class_floor,
            observation_class_weights=resolved_class_weights,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _attention_augmented_summary_vector(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
            token_feature_mean=self.token_feature_mean,
            token_feature_scale=self.token_feature_scale,
            inducing_points=self.inducing_points,
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        refined_weights = _posterior_reweighted_by_observations(
            context,
            teacher=self.teacher,
            particles=particles,
            base_weights=weights,
            observation_weight=self.observation_weight,
            observation_class_floor=self.observation_class_floor,
            observation_class_weights=self.observation_class_weights,
        )
        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(refined_weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(refined_weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )
