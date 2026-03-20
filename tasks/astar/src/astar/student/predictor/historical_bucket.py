from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, land_mask
from astar.features.coasts import coast_mask
from astar.features.reachability import multi_source_distance
from astar.infra.api.dto import InitialSettlement, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor


class BucketPriorRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str
    count: int = Field(ge=1)
    mean: list[float]


class HistoricalBucketPriorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    round_ids: list[str]
    analyzed_seed_count: int = Field(ge=0)
    cell_count: int = Field(ge=0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    settlement_distance_edges: list[int]
    port_distance_edges: list[int]
    forest_count_cap: int = Field(ge=0)
    shrinkage_terrain: float = Field(ge=0.0)
    shrinkage_structural: float = Field(ge=0.0)
    shrinkage_full: float = Field(ge=0.0)
    global_count: int = Field(ge=1)
    global_mean: list[float]
    terrain_rows: list[BucketPriorRow]
    structural_rows: list[BucketPriorRow]
    full_rows: list[BucketPriorRow]


class HistoricalBucketSeedDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    terrain_bucket_count: np.ndarray
    structural_bucket_count: np.ndarray
    full_bucket_count: np.ndarray
    support_level: np.ndarray


def _neighbor_count(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    counts = np.zeros((height, width), dtype=np.int64)
    for delta_y in (-1, 0, 1):
        for delta_x in (-1, 0, 1):
            if delta_y == 0 and delta_x == 0:
                continue
            source_y = slice(max(0, -delta_y), min(height, height - delta_y))
            source_x = slice(max(0, -delta_x), min(width, width - delta_x))
            target_y = slice(max(0, delta_y), min(height, height + delta_y))
            target_x = slice(max(0, delta_x), min(width, width + delta_x))
            counts[target_y, target_x] += mask[source_y, source_x].astype(np.int64)
    return counts


def _distance_buckets(distances: np.ndarray, edges: tuple[int, ...]) -> np.ndarray:
    buckets = np.full(distances.shape, len(edges), dtype=np.int64)
    unreachable = distances < 0
    for bucket_index, upper_bound in enumerate(edges):
        mask = (distances >= 0) & (distances <= upper_bound) & (buckets == len(edges))
        buckets[mask] = bucket_index
    buckets[unreachable] = len(edges) + 1
    return buckets


def _settlement_sources(settlements: list[InitialSettlement]) -> list[tuple[int, int]]:
    return [(item.y, item.x) for item in settlements]


def _port_sources(settlements: list[InitialSettlement]) -> list[tuple[int, int]]:
    return [(item.y, item.x) for item in settlements if item.has_port]


def _feature_arrays(
    initial_grid: np.ndarray,
    settlements: list[InitialSettlement],
    *,
    settlement_distance_edges: tuple[int, ...],
    port_distance_edges: tuple[int, ...],
    forest_count_cap: int,
) -> dict[str, np.ndarray]:
    forest_neighbors = _neighbor_count(initial_grid == 4)
    mountain_neighbors = _neighbor_count(initial_grid == 5)
    land = land_mask(initial_grid)

    settlement_distance = multi_source_distance(land, _settlement_sources(settlements))
    port_distance = multi_source_distance(land, _port_sources(settlements))

    return {
        "terrain_code": initial_grid.astype(np.int64),
        "coastal_flag": coast_mask(initial_grid).astype(np.int64),
        "forest_bucket": np.minimum(forest_neighbors, forest_count_cap).astype(np.int64),
        "mountain_flag": (mountain_neighbors > 0).astype(np.int64),
        "settlement_bucket": _distance_buckets(
            settlement_distance,
            settlement_distance_edges,
        ).astype(np.int64),
        "port_bucket": _distance_buckets(port_distance, port_distance_edges).astype(np.int64),
    }


def _full_key(
    terrain_code: int,
    coastal_flag: int,
    forest_bucket: int,
    mountain_flag: int,
    settlement_bucket: int,
    port_bucket: int,
) -> str:
    return (
        f"{terrain_code}|{coastal_flag}|{forest_bucket}|{mountain_flag}|"
        f"{settlement_bucket}|{port_bucket}"
    )


def _structural_key(
    terrain_code: int,
    coastal_flag: int,
    forest_bucket: int,
    mountain_flag: int,
) -> str:
    return f"{terrain_code}|{coastal_flag}|{forest_bucket}|{mountain_flag}"


def _update_stats(
    sums: dict[str, np.ndarray],
    counts: dict[str, int],
    key: str,
    target: np.ndarray,
) -> None:
    if key not in sums:
        sums[key] = np.zeros(CLASS_COUNT, dtype=np.float64)
        counts[key] = 0
    sums[key] += target
    counts[key] += 1


def _means_from_stats(
    sums: dict[str, np.ndarray],
    counts: dict[str, int],
) -> dict[str, np.ndarray]:
    return {
        key: np.asarray(value / float(counts[key]), dtype=np.float64)
        for key, value in sums.items()
    }


def _rows_from_means(means: dict[str, np.ndarray], counts: dict[str, int]) -> list[BucketPriorRow]:
    return [
        BucketPriorRow(key=key, count=counts[key], mean=np.asarray(means[key], dtype=np.float64).tolist())
        for key in sorted(means)
    ]


class HistoricalBucketPriorPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "historical_bucket_prior_v1"
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    settlement_distance_edges: tuple[int, ...] = (0, 1, 2, 4, 8)
    port_distance_edges: tuple[int, ...] = (0, 1, 2, 4, 8)
    forest_count_cap: int = Field(default=3, ge=0)
    shrinkage_terrain: float = Field(default=64.0, ge=0.0)
    shrinkage_structural: float = Field(default=24.0, ge=0.0)
    shrinkage_full: float = Field(default=12.0, ge=0.0)
    round_ids: tuple[str, ...] = ()
    analyzed_seed_count: int = Field(default=0, ge=0)
    cell_count: int = Field(default=0, ge=0)
    global_count: int = Field(default=1, ge=1)
    global_mean: np.ndarray = Field(
        default_factory=lambda: np.full(CLASS_COUNT, 1.0 / CLASS_COUNT, dtype=np.float64),
    )
    terrain_means: dict[str, np.ndarray] = Field(default_factory=dict)
    terrain_counts: dict[str, int] = Field(default_factory=dict)
    structural_means: dict[str, np.ndarray] = Field(default_factory=dict)
    structural_counts: dict[str, int] = Field(default_factory=dict)
    full_means: dict[str, np.ndarray] = Field(default_factory=dict)
    full_counts: dict[str, int] = Field(default_factory=dict)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None = None,
        exclude_round_ids: list[str] | None = None,
        model_name: str = "historical_bucket_prior_v1",
        probability_floor: float = 0.01,
    ) -> HistoricalBucketPriorPredictor:
        excluded = set(exclude_round_ids or [])
        if round_ids is None:
            selected_round_ids = sorted(path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json"))
        else:
            selected_round_ids = list(round_ids)

        global_sum = np.zeros(CLASS_COUNT, dtype=np.float64)
        global_count = 0
        analyzed_seed_count = 0
        terrain_sums: dict[str, np.ndarray] = {}
        terrain_counts: dict[str, int] = {}
        structural_sums: dict[str, np.ndarray] = {}
        structural_counts: dict[str, int] = {}
        full_sums: dict[str, np.ndarray] = {}
        full_counts: dict[str, int] = {}
        used_round_ids: list[str] = []

        prototype = cls(name=model_name, probability_floor=probability_floor)
        for round_id in selected_round_ids:
            if round_id in excluded:
                continue
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            round_record = read_round_record(paths, round_id)
            used_round_ids.append(round_id)
            for seed_index, analysis_record in sorted(analyses.items()):
                initial_state = round_record.round.initial_states[seed_index]
                initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
                features = _feature_arrays(
                    initial_grid,
                    initial_state.settlements,
                    settlement_distance_edges=prototype.settlement_distance_edges,
                    port_distance_edges=prototype.port_distance_edges,
                    forest_count_cap=prototype.forest_count_cap,
                )
                ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                analyzed_seed_count += 1
                cell_targets = ground_truth.reshape(-1, CLASS_COUNT)
                global_sum += np.sum(cell_targets, axis=0)
                global_count += int(cell_targets.shape[0])

                terrain_flat = features["terrain_code"].reshape(-1)
                coastal_flat = features["coastal_flag"].reshape(-1)
                forest_flat = features["forest_bucket"].reshape(-1)
                mountain_flat = features["mountain_flag"].reshape(-1)
                settlement_flat = features["settlement_bucket"].reshape(-1)
                port_flat = features["port_bucket"].reshape(-1)
                for row_index, target in enumerate(cell_targets):
                    terrain_key = str(int(terrain_flat[row_index]))
                    structural_key = _structural_key(
                        int(terrain_flat[row_index]),
                        int(coastal_flat[row_index]),
                        int(forest_flat[row_index]),
                        int(mountain_flat[row_index]),
                    )
                    full_key = _full_key(
                        int(terrain_flat[row_index]),
                        int(coastal_flat[row_index]),
                        int(forest_flat[row_index]),
                        int(mountain_flat[row_index]),
                        int(settlement_flat[row_index]),
                        int(port_flat[row_index]),
                    )
                    _update_stats(terrain_sums, terrain_counts, terrain_key, target)
                    _update_stats(structural_sums, structural_counts, structural_key, target)
                    _update_stats(full_sums, full_counts, full_key, target)

        if global_count == 0:
            raise ValueError("no analyzed historical cells available for bucket prior")

        return cls(
            name=model_name,
            probability_floor=probability_floor,
            round_ids=tuple(used_round_ids),
            analyzed_seed_count=analyzed_seed_count,
            cell_count=global_count,
            global_count=global_count,
            global_mean=np.asarray(global_sum / float(global_count), dtype=np.float64),
            terrain_means=_means_from_stats(terrain_sums, terrain_counts),
            terrain_counts=terrain_counts,
            structural_means=_means_from_stats(structural_sums, structural_counts),
            structural_counts=structural_counts,
            full_means=_means_from_stats(full_sums, full_counts),
            full_counts=full_counts,
        )

    def checkpoint(self) -> HistoricalBucketPriorCheckpoint:
        return HistoricalBucketPriorCheckpoint(
            name=self.name,
            round_ids=list(self.round_ids),
            analyzed_seed_count=self.analyzed_seed_count,
            cell_count=self.cell_count,
            probability_floor=self.probability_floor,
            settlement_distance_edges=list(self.settlement_distance_edges),
            port_distance_edges=list(self.port_distance_edges),
            forest_count_cap=self.forest_count_cap,
            shrinkage_terrain=self.shrinkage_terrain,
            shrinkage_structural=self.shrinkage_structural,
            shrinkage_full=self.shrinkage_full,
            global_count=self.global_count,
            global_mean=self.global_mean.tolist(),
            terrain_rows=_rows_from_means(self.terrain_means, self.terrain_counts),
            structural_rows=_rows_from_means(self.structural_means, self.structural_counts),
            full_rows=_rows_from_means(self.full_means, self.full_counts),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> HistoricalBucketPriorPredictor:
        checkpoint = HistoricalBucketPriorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        return cls(
            name=checkpoint.name,
            probability_floor=checkpoint.probability_floor,
            settlement_distance_edges=tuple(checkpoint.settlement_distance_edges),
            port_distance_edges=tuple(checkpoint.port_distance_edges),
            forest_count_cap=checkpoint.forest_count_cap,
            shrinkage_terrain=checkpoint.shrinkage_terrain,
            shrinkage_structural=checkpoint.shrinkage_structural,
            shrinkage_full=checkpoint.shrinkage_full,
            round_ids=tuple(checkpoint.round_ids),
            analyzed_seed_count=checkpoint.analyzed_seed_count,
            cell_count=checkpoint.cell_count,
            global_count=checkpoint.global_count,
            global_mean=np.asarray(checkpoint.global_mean, dtype=np.float64),
            terrain_means={
                row.key: np.asarray(row.mean, dtype=np.float64) for row in checkpoint.terrain_rows
            },
            terrain_counts={row.key: row.count for row in checkpoint.terrain_rows},
            structural_means={
                row.key: np.asarray(row.mean, dtype=np.float64)
                for row in checkpoint.structural_rows
            },
            structural_counts={row.key: row.count for row in checkpoint.structural_rows},
            full_means={row.key: np.asarray(row.mean, dtype=np.float64) for row in checkpoint.full_rows},
            full_counts={row.key: row.count for row in checkpoint.full_rows},
        )

    def _shrink(
        self,
        mean: np.ndarray | None,
        count: int,
        parent: np.ndarray,
        strength: float,
    ) -> np.ndarray:
        if mean is None or count <= 0:
            return parent
        return np.asarray(
            (float(count) * mean + float(strength) * parent) / float(count + strength),
            dtype=np.float64,
        )

    def _terrain_prior(self, terrain_code: int) -> np.ndarray:
        key = str(int(terrain_code))
        return self._shrink(
            self.terrain_means.get(key),
            self.terrain_counts.get(key, 0),
            self.global_mean,
            self.shrinkage_terrain,
        )

    def _structural_prior(
        self,
        terrain_code: int,
        coastal_flag: int,
        forest_bucket: int,
        mountain_flag: int,
    ) -> np.ndarray:
        terrain_prior = self._terrain_prior(terrain_code)
        key = _structural_key(terrain_code, coastal_flag, forest_bucket, mountain_flag)
        return self._shrink(
            self.structural_means.get(key),
            self.structural_counts.get(key, 0),
            terrain_prior,
            self.shrinkage_structural,
        )

    def _full_prior(
        self,
        terrain_code: int,
        coastal_flag: int,
        forest_bucket: int,
        mountain_flag: int,
        settlement_bucket: int,
        port_bucket: int,
    ) -> np.ndarray:
        parent = self._structural_prior(
            terrain_code,
            coastal_flag,
            forest_bucket,
            mountain_flag,
        )
        key = _full_key(
            terrain_code,
            coastal_flag,
            forest_bucket,
            mountain_flag,
            settlement_bucket,
            port_bucket,
        )
        return self._shrink(
            self.full_means.get(key),
            self.full_counts.get(key, 0),
            parent,
            self.shrinkage_full,
        )

    def _predict_seed(
        self,
        round_id: str,
        seed_index: int,
        initial_grid: np.ndarray,
        settlements: list[InitialSettlement],
    ) -> tuple[np.ndarray, HistoricalBucketSeedDiagnostics]:
        feature_arrays = _feature_arrays(
            initial_grid,
            settlements,
            settlement_distance_edges=self.settlement_distance_edges,
            port_distance_edges=self.port_distance_edges,
            forest_count_cap=self.forest_count_cap,
        )
        height, width = initial_grid.shape
        prediction = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
        terrain_counts = np.zeros((height, width), dtype=np.int64)
        structural_counts = np.zeros((height, width), dtype=np.int64)
        full_counts = np.zeros((height, width), dtype=np.int64)
        support_level = np.zeros((height, width), dtype=np.int64)

        for y in range(height):
            for x in range(width):
                terrain_code = int(feature_arrays["terrain_code"][y, x])
                coastal_flag = int(feature_arrays["coastal_flag"][y, x])
                forest_bucket = int(feature_arrays["forest_bucket"][y, x])
                mountain_flag = int(feature_arrays["mountain_flag"][y, x])
                settlement_bucket = int(feature_arrays["settlement_bucket"][y, x])
                port_bucket = int(feature_arrays["port_bucket"][y, x])

                terrain_key = str(terrain_code)
                structural_key = _structural_key(
                    terrain_code,
                    coastal_flag,
                    forest_bucket,
                    mountain_flag,
                )
                full_key = _full_key(
                    terrain_code,
                    coastal_flag,
                    forest_bucket,
                    mountain_flag,
                    settlement_bucket,
                    port_bucket,
                )
                terrain_count = self.terrain_counts.get(terrain_key, 0)
                structural_count = self.structural_counts.get(structural_key, 0)
                full_count = self.full_counts.get(full_key, 0)

                terrain_counts[y, x] = terrain_count
                structural_counts[y, x] = structural_count
                full_counts[y, x] = full_count
                if full_count > 0:
                    support_level[y, x] = 3
                elif structural_count > 0:
                    support_level[y, x] = 2
                elif terrain_count > 0:
                    support_level[y, x] = 1

                prediction[y, x] = self._full_prior(
                    terrain_code,
                    coastal_flag,
                    forest_bucket,
                    mountain_flag,
                    settlement_bucket,
                    port_bucket,
                )

        return apply_probability_floor(
            prediction,
            self.probability_floor,
        ), HistoricalBucketSeedDiagnostics(
            round_id=round_id,
            seed_index=seed_index,
            terrain_bucket_count=terrain_counts,
            structural_bucket_count=structural_counts,
            full_bucket_count=full_counts,
            support_level=support_level,
        )

    def build_seed_diagnostics(
        self,
        round_detail: RoundDetail,
        seed_index: int,
    ) -> HistoricalBucketSeedDiagnostics:
        initial_state = round_detail.initial_states[seed_index]
        _, diagnostics = self._predict_seed(
            round_detail.id,
            seed_index,
            np.asarray(initial_state.grid, dtype=np.int64),
            initial_state.settlements,
        )
        return diagnostics

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: object | None = None,
        evidence: object | None = None,
    ) -> PredictionBundle:
        del features, evidence
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, initial_state in enumerate(round_detail.initial_states):
            prediction, _ = self._predict_seed(
                round_detail.id,
                seed_index,
                np.asarray(initial_state.grid, dtype=np.int64),
                initial_state.settlements,
            )
            predictions_by_seed[seed_index] = prediction
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = [
    "HistoricalBucketPriorCheckpoint",
    "HistoricalBucketPriorPredictor",
    "HistoricalBucketSeedDiagnostics",
]
