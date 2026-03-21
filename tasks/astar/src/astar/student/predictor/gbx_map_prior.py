from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.envs.types import build_round_context_from_detail
from astar.history.summaries.map_summary import round_map_summary_vector
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import (
    _feature_arrays,
    _full_key,
    _structural_key,
)
from astar.student.predictor.round import BaseRoundPredictor


GBX_PRIOR_MAPONLY_BUCKET_MODEL = "gbx_prior_maponly_bucket_v1"


class GreyBoxMapRoundStats(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    map_summary: np.ndarray
    global_sum: np.ndarray
    global_count: int = Field(ge=1)
    terrain_sums: dict[str, np.ndarray] = Field(default_factory=dict)
    terrain_counts: dict[str, int] = Field(default_factory=dict)
    structural_sums: dict[str, np.ndarray] = Field(default_factory=dict)
    structural_counts: dict[str, int] = Field(default_factory=dict)
    full_sums: dict[str, np.ndarray] = Field(default_factory=dict)
    full_counts: dict[str, int] = Field(default_factory=dict)


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


def _weighted_sum_map(
    stats: Sequence[GreyBoxMapRoundStats],
    weights: np.ndarray,
    field_name: str,
) -> tuple[dict[str, np.ndarray], dict[str, float]]:
    weighted_sums: dict[str, np.ndarray] = {}
    weighted_counts: dict[str, float] = {}
    for stat, weight in zip(stats, weights, strict=True):
        sum_map = getattr(stat, field_name)
        count_map = getattr(stat, field_name.replace("sums", "counts"))
        for key, value in sum_map.items():
            if key not in weighted_sums:
                weighted_sums[key] = np.zeros(CLASS_COUNT, dtype=np.float64)
                weighted_counts[key] = 0.0
            weighted_sums[key] += float(weight) * np.asarray(value, dtype=np.float64)
            weighted_counts[key] += float(weight) * float(count_map[key])
    return weighted_sums, weighted_counts


class GreyBoxMapOnlyBucketPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_PRIOR_MAPONLY_BUCKET_MODEL
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    settlement_distance_edges: tuple[int, ...] = (0, 1, 2, 4, 8)
    port_distance_edges: tuple[int, ...] = (0, 1, 2, 4, 8)
    forest_count_cap: int = Field(default=3, ge=0)
    shrinkage_terrain: float = Field(default=64.0, ge=0.0)
    shrinkage_structural: float = Field(default=24.0, ge=0.0)
    shrinkage_full: float = Field(default=12.0, ge=0.0)
    neighbor_count: int = Field(default=3, ge=1)
    distance_floor: float = Field(default=1e-3, gt=0.0)
    round_ids: tuple[str, ...] = ()
    analyzed_seed_count: int = Field(default=0, ge=0)
    cell_count: int = Field(default=0, ge=0)
    round_stats: tuple[GreyBoxMapRoundStats, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None = None,
        exclude_round_ids: list[str] | None = None,
        model_name: str = GBX_PRIOR_MAPONLY_BUCKET_MODEL,
        probability_floor: float = 0.01,
    ) -> GreyBoxMapOnlyBucketPredictor:
        excluded = set(exclude_round_ids or [])
        if round_ids is None:
            selected_round_ids = sorted(path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json"))
        else:
            selected_round_ids = list(round_ids)

        prototype = cls(name=model_name, probability_floor=probability_floor)
        analyzed_seed_count = 0
        cell_count = 0
        used_round_ids: list[str] = []
        round_stats: list[GreyBoxMapRoundStats] = []

        for round_id in selected_round_ids:
            if round_id in excluded:
                continue
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            round_record = read_round_record(paths, round_id)
            round_context = build_round_context_from_detail(round_record.round)
            global_sum = np.zeros(CLASS_COUNT, dtype=np.float64)
            global_count = 0
            terrain_sums: dict[str, np.ndarray] = {}
            terrain_counts: dict[str, int] = {}
            structural_sums: dict[str, np.ndarray] = {}
            structural_counts: dict[str, int] = {}
            full_sums: dict[str, np.ndarray] = {}
            full_counts: dict[str, int] = {}
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
                global_sum += np.sum(ground_truth, axis=(0, 1))
                global_count += ground_truth.shape[0] * ground_truth.shape[1]
                analyzed_seed_count += 1
                cell_count += ground_truth.shape[0] * ground_truth.shape[1]
                for y in range(ground_truth.shape[0]):
                    for x in range(ground_truth.shape[1]):
                        target = np.asarray(ground_truth[y, x], dtype=np.float64)
                        terrain_key = str(int(features["terrain_code"][y, x]))
                        structural_key = _structural_key(
                            int(features["terrain_code"][y, x]),
                            int(features["coastal_flag"][y, x]),
                            int(features["forest_bucket"][y, x]),
                            int(features["mountain_flag"][y, x]),
                        )
                        full_key = _full_key(
                            int(features["terrain_code"][y, x]),
                            int(features["coastal_flag"][y, x]),
                            int(features["forest_bucket"][y, x]),
                            int(features["mountain_flag"][y, x]),
                            int(features["settlement_bucket"][y, x]),
                            int(features["port_bucket"][y, x]),
                        )
                        _update_stats(terrain_sums, terrain_counts, terrain_key, target)
                        _update_stats(structural_sums, structural_counts, structural_key, target)
                        _update_stats(full_sums, full_counts, full_key, target)
            if global_count == 0:
                continue
            used_round_ids.append(round_id)
            round_stats.append(
                GreyBoxMapRoundStats(
                    round_id=round_id,
                    map_summary=round_map_summary_vector(round_context.seeds),
                    global_sum=global_sum,
                    global_count=global_count,
                    terrain_sums=terrain_sums,
                    terrain_counts=terrain_counts,
                    structural_sums=structural_sums,
                    structural_counts=structural_counts,
                    full_sums=full_sums,
                    full_counts=full_counts,
                ),
            )

        if not round_stats:
            raise ValueError("no analyzed rounds available for grey-box map-only prior")

        return cls(
            name=model_name,
            probability_floor=probability_floor,
            settlement_distance_edges=prototype.settlement_distance_edges,
            port_distance_edges=prototype.port_distance_edges,
            forest_count_cap=prototype.forest_count_cap,
            shrinkage_terrain=prototype.shrinkage_terrain,
            shrinkage_structural=prototype.shrinkage_structural,
            shrinkage_full=prototype.shrinkage_full,
            neighbor_count=prototype.neighbor_count,
            distance_floor=prototype.distance_floor,
            round_ids=tuple(used_round_ids),
            analyzed_seed_count=analyzed_seed_count,
            cell_count=cell_count,
            round_stats=tuple(round_stats),
        )

    def _round_neighbor_weights(self, round_detail: RoundDetail) -> tuple[tuple[GreyBoxMapRoundStats, ...], np.ndarray]:
        round_context = build_round_context_from_detail(round_detail)
        target = round_map_summary_vector(round_context.seeds)
        bank = np.stack([item.map_summary for item in self.round_stats], axis=0)
        distances = np.linalg.norm(bank - target[None, :], axis=1)
        order = np.argsort(distances)[: min(self.neighbor_count, len(distances))]
        selected = tuple(self.round_stats[index] for index in order)
        weights = 1.0 / np.clip(distances[order], self.distance_floor, None)
        weights = weights / np.sum(weights)
        return selected, np.asarray(weights, dtype=np.float64)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: object = None,
        evidence: object = None,
    ) -> PredictionBundle:
        selected_rounds, weights = self._round_neighbor_weights(round_detail)
        global_sum = np.zeros(CLASS_COUNT, dtype=np.float64)
        global_count = 0.0
        for stat, weight in zip(selected_rounds, weights, strict=True):
            global_sum += float(weight) * stat.global_sum
            global_count += float(weight) * float(stat.global_count)
        global_mean = global_sum / max(global_count, 1.0)
        terrain_sums, terrain_counts = _weighted_sum_map(selected_rounds, weights, "terrain_sums")
        structural_sums, structural_counts = _weighted_sum_map(selected_rounds, weights, "structural_sums")
        full_sums, full_counts = _weighted_sum_map(selected_rounds, weights, "full_sums")

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, initial_state in enumerate(round_detail.initial_states):
            initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
            feature_arrays = _feature_arrays(
                initial_grid,
                initial_state.settlements,
                settlement_distance_edges=self.settlement_distance_edges,
                port_distance_edges=self.port_distance_edges,
                forest_count_cap=self.forest_count_cap,
            )
            prediction = np.zeros((round_detail.map_height, round_detail.map_width, CLASS_COUNT), dtype=np.float64)
            for y in range(round_detail.map_height):
                for x in range(round_detail.map_width):
                    terrain_key = str(int(feature_arrays["terrain_code"][y, x]))
                    structural_key = _structural_key(
                        int(feature_arrays["terrain_code"][y, x]),
                        int(feature_arrays["coastal_flag"][y, x]),
                        int(feature_arrays["forest_bucket"][y, x]),
                        int(feature_arrays["mountain_flag"][y, x]),
                    )
                    full_key = _full_key(
                        int(feature_arrays["terrain_code"][y, x]),
                        int(feature_arrays["coastal_flag"][y, x]),
                        int(feature_arrays["forest_bucket"][y, x]),
                        int(feature_arrays["mountain_flag"][y, x]),
                        int(feature_arrays["settlement_bucket"][y, x]),
                        int(feature_arrays["port_bucket"][y, x]),
                    )

                    terrain_count = terrain_counts.get(terrain_key, 0.0)
                    terrain_prior = global_mean
                    if terrain_key in terrain_sums and terrain_count > 0.0:
                        terrain_mean = terrain_sums[terrain_key] / terrain_count
                        terrain_prior = (
                            terrain_count * terrain_mean + self.shrinkage_terrain * global_mean
                        ) / (terrain_count + self.shrinkage_terrain)

                    structural_count = structural_counts.get(structural_key, 0.0)
                    structural_prior = terrain_prior
                    if structural_key in structural_sums and structural_count > 0.0:
                        structural_mean = structural_sums[structural_key] / structural_count
                        structural_prior = (
                            structural_count * structural_mean
                            + self.shrinkage_structural * terrain_prior
                        ) / (structural_count + self.shrinkage_structural)

                    full_count = full_counts.get(full_key, 0.0)
                    full_prior = structural_prior
                    if full_key in full_sums and full_count > 0.0:
                        full_mean = full_sums[full_key] / full_count
                        full_prior = (
                            full_count * full_mean + self.shrinkage_full * structural_prior
                        ) / (full_count + self.shrinkage_full)
                    prediction[y, x] = apply_probability_floor(full_prior, self.probability_floor)
            predictions_by_seed[seed_index] = prediction
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = [
    "GBX_PRIOR_MAPONLY_BUCKET_MODEL",
    "GreyBoxMapOnlyBucketPredictor",
    "GreyBoxMapRoundStats",
]
