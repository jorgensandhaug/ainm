from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import buildable_mask, land_mask, mountain_mask
from astar.features.coasts import coast_distance_steps, coast_mask, normalized_coast_distance
from astar.features.influence import (
    land_distance_to_settlements_steps,
    normalized_land_distance_to_settlements,
    normalized_sea_distance_to_initial_ports,
    sea_distance_to_initial_ports_steps,
    settlement_basin_gap,
    settlement_basin_gap_steps,
)
from astar.infra.api.dto import InitialSettlement, RoundDetail


def _local_ratio(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    ratio = np.zeros((height, width), dtype=np.float64)
    for y in range(height):
        for x in range(width):
            y0 = max(y - 1, 0)
            y1 = min(y + 2, height)
            x0 = max(x - 1, 0)
            x1 = min(x + 2, width)
            ratio[y, x] = float(np.mean(mask[y0:y1, x0:x1]))
    return ratio


class SeedFeatureBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    height: int = Field(ge=1)
    width: int = Field(ge=1)
    features: dict[str, np.ndarray]

    def feature(self, name: str) -> np.ndarray:
        return self.features[name]


class RoundFeatureBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    per_seed: dict[int, SeedFeatureBundle]


def _distance_feature_family(
    name: str,
    raw_steps: np.ndarray,
    normalized: np.ndarray,
) -> dict[str, np.ndarray]:
    reachable = raw_steps >= 0
    steps = np.where(reachable, raw_steps, 0).astype(np.float64)
    unreachable = (~reachable).astype(np.float64)
    features: dict[str, np.ndarray] = {
        name: normalized.astype(np.float64),
        f"{name}_steps": steps,
        f"{name}_steps_log1p": np.log1p(steps),
        f"{name}_unreachable": unreachable,
    }
    for scale in (2.0, 4.0, 8.0):
        suffix = int(scale)
        features[f"{name}_decay_{suffix}"] = np.exp(-steps / scale) * (1.0 - unreachable)
    return features


def compute_static_feature_dict(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
) -> dict[str, np.ndarray]:
    buildable = buildable_mask(grid).astype(np.float64)
    land = land_mask(grid).astype(np.float64)
    coast = coast_mask(grid).astype(np.float64)

    coast_distance_raw = coast_distance_steps(grid)
    coast_distance = normalized_coast_distance(grid)
    land_distance_raw = land_distance_to_settlements_steps(grid, settlements)
    land_distance = normalized_land_distance_to_settlements(grid, settlements)
    sea_distance_raw = sea_distance_to_initial_ports_steps(grid, settlements)
    sea_distance = normalized_sea_distance_to_initial_ports(grid, settlements)
    basin_gap_raw = settlement_basin_gap_steps(grid, settlements)
    basin_gap = settlement_basin_gap(grid, settlements)

    forest_density = _local_ratio(grid == 4)
    mountain_density = _local_ratio(mountain_mask(grid))
    frontier_score = 1.0 - basin_gap
    settlement_proximity = 1.0 - land_distance
    coastal_exposure = 1.0 - coast_distance
    maritime_access = 1.0 - sea_distance

    features = {
        "buildable": buildable,
        "land": land,
        "coast": coast,
        "forest_density": forest_density,
        "mountain_density": mountain_density,
        "frontier_score": frontier_score,
        "settlement_proximity": settlement_proximity,
        "coastal_exposure": coastal_exposure,
        "maritime_access": maritime_access,
    }
    features.update(_distance_feature_family("coast_distance", coast_distance_raw, coast_distance))
    features.update(
        _distance_feature_family(
            "land_distance_to_settlement",
            land_distance_raw,
            land_distance,
        )
    )
    features.update(
        _distance_feature_family(
            "sea_distance_to_port",
            sea_distance_raw,
            sea_distance,
        )
    )
    features.update(
        _distance_feature_family(
            "settlement_basin_gap",
            basin_gap_raw,
            basin_gap,
        )
    )
    return features


def compute_seed_features(round_detail: RoundDetail, seed_index: int) -> SeedFeatureBundle:
    initial_state = round_detail.initial_states[seed_index]
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    features = compute_static_feature_dict(grid, initial_state.settlements)
    return SeedFeatureBundle(
        round_id=round_detail.id,
        seed_index=seed_index,
        height=round_detail.map_height,
        width=round_detail.map_width,
        features=features,
    )


def compute_round_features(round_detail: RoundDetail) -> RoundFeatureBundle:
    return RoundFeatureBundle(
        round_id=round_detail.id,
        per_seed={
            seed_index: compute_seed_features(round_detail, seed_index)
            for seed_index in range(round_detail.seeds_count)
        },
    )
