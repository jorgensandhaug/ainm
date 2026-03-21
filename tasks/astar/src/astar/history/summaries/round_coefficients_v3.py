"""Enhanced spatial feature bank v3 for terminal probability prediction.

Key improvements over v2:
- Multi-scale neighborhood features (3x3, 5x5, 7x7) via fast box filtering
- Settlement count at multiple radii
- Richer terrain composition features
- More cross-feature interactions
- Vectorized computation (no Python loops for local ratios)
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_NAMES, buildable_mask, mountain_mask, sea_mask
from astar.core.world_state import InitialWorldState
from astar.features.coasts import coast_mask, normalized_coast_distance
from astar.features.influence import (
    normalized_land_distance_to_settlements,
    normalized_sea_distance_to_initial_ports,
    settlement_basin_gap,
)
from astar.history.episodes.models import RoundEpisode, SeedEpisode
from astar.history.summaries.round_coefficients import seed_empirical_terminal_probs
from astar.history.summaries.round_coefficients_v2 import (
    _clip_probabilities,
    _settlement_maps,
    _seed_transition_metrics,
    round_regime_summary_vector_v2,
)
from astar.infra.api.dto import InitialSettlement

_DYNAMIC_CLASS_INDEXES = (1, 2, 3, 4)


def _fast_box_mean(arr: np.ndarray, radius: int) -> np.ndarray:
    """Fast box-filter mean using integral image. O(H*W) regardless of radius."""
    h, w = arr.shape
    padded = np.pad(arr.astype(np.float64), radius, mode="edge")
    # Add zero border for proper integral image indexing
    ph, pw = padded.shape
    bordered = np.zeros((ph + 1, pw + 1), dtype=np.float64)
    bordered[1:, 1:] = padded
    integral = np.cumsum(np.cumsum(bordered, axis=0), axis=1)
    k = 2 * radius + 1
    # box_sum shape: (ph+1-k, pw+1-k) = (h+2r+1-2r-1, w+2r+1-2r-1) = (h, w)
    box_sum = (
        integral[k:, k:]
        - integral[:-k, k:]
        - integral[k:, :-k]
        + integral[:-k, :-k]
    )
    return box_sum / float(k * k)


def _settlement_distance_map(
    height: int, width: int, settlements: list[InitialSettlement],
) -> np.ndarray:
    """Euclidean distance from each cell to nearest settlement."""
    if not settlements:
        return np.full((height, width), float(max(height, width)), dtype=np.float64)
    ys, xs = np.mgrid[:height, :width]
    min_dist = np.full((height, width), 1e9, dtype=np.float64)
    for s in settlements:
        dist = np.sqrt((ys - s.y) ** 2 + (xs - s.x) ** 2).astype(np.float64)
        min_dist = np.minimum(min_dist, dist)
    return min_dist


def _settlement_count_in_radius(
    height: int, width: int,
    settlements: list[InitialSettlement],
    radius: float,
) -> np.ndarray:
    """Count of settlements within given Euclidean radius of each cell."""
    result = np.zeros((height, width), dtype=np.float64)
    ys, xs = np.mgrid[:height, :width]
    for s in settlements:
        dist_sq = (ys - s.y) ** 2 + (xs - s.x) ** 2
        result += (dist_sq <= radius * radius).astype(np.float64)
    return result


def _port_count_in_radius(
    height: int, width: int,
    settlements: list[InitialSettlement],
    radius: float,
) -> np.ndarray:
    """Count of ports within given Euclidean radius of each cell."""
    result = np.zeros((height, width), dtype=np.float64)
    ys, xs = np.mgrid[:height, :width]
    for s in settlements:
        if not s.has_port:
            continue
        dist_sq = (ys - s.y) ** 2 + (xs - s.x) ** 2
        result += (dist_sq <= radius * radius).astype(np.float64)
    return result


def _second_nearest_settlement_distance(
    height: int, width: int, settlements: list[InitialSettlement],
) -> np.ndarray:
    """Distance to second nearest settlement."""
    if len(settlements) < 2:
        return np.full((height, width), float(max(height, width)), dtype=np.float64)
    ys, xs = np.mgrid[:height, :width]
    distances = np.stack(
        [np.sqrt((ys - s.y) ** 2 + (xs - s.x) ** 2).astype(np.float64)
         for s in settlements],
        axis=0,
    )
    sorted_distances = np.sort(distances, axis=0)
    return sorted_distances[1]


def seed_feature_names_v3() -> list[str]:
    return [
        # === Original v2 features ===
        "buildable",
        "land",
        "coast",
        "coast_distance",
        "land_distance_to_settlement",
        "sea_distance_to_port",
        "forest_density",
        "mountain_density",
        "settlement_basin_gap",
        "frontier_score",
        "settlement_proximity",
        "coastal_exposure",
        "maritime_access",
        "initial_forest",
        "initial_mountain",
        "initial_ocean",
        "initial_settlement",
        "initial_port",
        "settlement_density",
        "port_density",
        "initial_built",
        "coast_x_buildable",
        "coast_x_settlement_proximity",
        "frontier_x_settlement_proximity",
        "frontier_x_maritime_access",
        "maritime_access_sq",
        "settlement_proximity_sq",
        "frontier_score_sq",
        # === New v3: multi-scale neighborhood features ===
        "forest_density_5x5",
        "forest_density_7x7",
        "mountain_density_5x5",
        "settlement_density_5x5",
        "settlement_density_7x7",
        "buildable_density_5x5",
        "coast_density_5x5",
        "land_fraction_5x5",
        # === New v3: settlement geometry ===
        "nearest_settlement_dist_norm",
        "second_nearest_settlement_dist_norm",
        "n_settlements_r3",
        "n_settlements_r5",
        "n_settlements_r8",
        "n_ports_r5",
        # === New v3: terrain composition interactions ===
        "forest_x_coast",
        "buildable_x_forest_density",
        "settlement_density_x_maritime_access",
        "frontier_x_forest_density",
        "coast_distance_sq",
        "settlement_proximity_cube",
        "coastal_exposure_x_buildable",
        "maritime_access_x_settlement_density",
        # === New v3: compound spatial indicators ===
        "inland_settlement_proximity",
        "coastal_settlement_proximity",
        "frontier_x_coast",
        "forest_edge",
    ]


def seed_feature_dict_v3(initial_state: InitialWorldState) -> dict[str, np.ndarray]:
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    height, width = grid.shape
    max_dim = float(max(height, width))
    settlements = [
        InitialSettlement(
            x=item.x, y=item.y, has_port=item.has_port, alive=item.alive,
        )
        for item in initial_state.settlements
    ]

    # Base masks
    buildable = buildable_mask(grid).astype(np.float64)
    land = (~sea_mask(grid)).astype(np.float64)
    coast_m = coast_mask(grid).astype(np.float64)
    is_forest = (grid == 4).astype(np.float64)
    is_mountain = mountain_mask(grid).astype(np.float64)
    is_ocean = (grid == 10).astype(np.float64)

    # Distance features
    coast_distance = normalized_coast_distance(grid)
    land_distance = normalized_land_distance_to_settlements(grid, settlements)
    sea_distance = normalized_sea_distance_to_initial_ports(grid, settlements)
    basin_gap = settlement_basin_gap(grid, settlements)

    # Derived
    frontier_score = 1.0 - basin_gap
    settlement_proximity = 1.0 - land_distance
    maritime_access = 1.0 - sea_distance
    coastal_exposure = 1.0 - coast_distance

    # Settlement maps
    settlement_map, port_map = _settlement_maps(initial_state)
    initial_built = np.isin(grid, (1, 2)).astype(np.float64)

    # Multi-scale neighborhood features (vectorized)
    forest_density_3 = _fast_box_mean(is_forest, 1)
    mountain_density_3 = _fast_box_mean(is_mountain, 1)
    settlement_density_3 = _fast_box_mean(settlement_map > 0.5, 1)
    port_density_3 = _fast_box_mean(port_map > 0.5, 1)

    forest_density_5 = _fast_box_mean(is_forest, 2)
    forest_density_7 = _fast_box_mean(is_forest, 3)
    mountain_density_5 = _fast_box_mean(is_mountain, 2)
    settlement_density_5 = _fast_box_mean(settlement_map > 0.5, 2)
    settlement_density_7 = _fast_box_mean(settlement_map > 0.5, 3)
    buildable_density_5 = _fast_box_mean(buildable, 2)
    coast_density_5 = _fast_box_mean(coast_m, 2)
    land_fraction_5 = _fast_box_mean(land, 2)

    # Settlement geometry
    nearest_dist = _settlement_distance_map(height, width, settlements)
    second_nearest_dist = _second_nearest_settlement_distance(height, width, settlements)
    nearest_dist_norm = nearest_dist / max(max_dim, 1.0)
    second_nearest_dist_norm = second_nearest_dist / max(max_dim, 1.0)
    n_settlements_r3 = _settlement_count_in_radius(height, width, settlements, 3.0)
    n_settlements_r5 = _settlement_count_in_radius(height, width, settlements, 5.0)
    n_settlements_r8 = _settlement_count_in_radius(height, width, settlements, 8.0)
    n_ports_r5 = _port_count_in_radius(height, width, settlements, 5.0)

    # Forest edge: cells that are forest-adjacent but not forest themselves
    forest_edge = np.clip(forest_density_3 - is_forest, 0.0, 1.0)

    features = {
        # Original v2
        "buildable": buildable,
        "land": land,
        "coast": coast_m,
        "coast_distance": coast_distance,
        "land_distance_to_settlement": land_distance,
        "sea_distance_to_port": sea_distance,
        "forest_density": forest_density_3,
        "mountain_density": mountain_density_3,
        "settlement_basin_gap": basin_gap,
        "frontier_score": frontier_score,
        "settlement_proximity": settlement_proximity,
        "coastal_exposure": coastal_exposure,
        "maritime_access": maritime_access,
        "initial_forest": is_forest,
        "initial_mountain": is_mountain.astype(np.float64),
        "initial_ocean": is_ocean,
        "initial_settlement": settlement_map,
        "initial_port": port_map,
        "settlement_density": settlement_density_3,
        "port_density": port_density_3,
        "initial_built": initial_built,
        "coast_x_buildable": coast_m * buildable,
        "coast_x_settlement_proximity": coast_m * settlement_proximity,
        "frontier_x_settlement_proximity": frontier_score * settlement_proximity,
        "frontier_x_maritime_access": frontier_score * maritime_access,
        "maritime_access_sq": maritime_access ** 2,
        "settlement_proximity_sq": settlement_proximity ** 2,
        "frontier_score_sq": frontier_score ** 2,
        # Multi-scale
        "forest_density_5x5": forest_density_5,
        "forest_density_7x7": forest_density_7,
        "mountain_density_5x5": mountain_density_5,
        "settlement_density_5x5": settlement_density_5,
        "settlement_density_7x7": settlement_density_7,
        "buildable_density_5x5": buildable_density_5,
        "coast_density_5x5": coast_density_5,
        "land_fraction_5x5": land_fraction_5,
        # Settlement geometry
        "nearest_settlement_dist_norm": nearest_dist_norm,
        "second_nearest_settlement_dist_norm": second_nearest_dist_norm,
        "n_settlements_r3": n_settlements_r3 / max(float(len(settlements)), 1.0),
        "n_settlements_r5": n_settlements_r5 / max(float(len(settlements)), 1.0),
        "n_settlements_r8": n_settlements_r8 / max(float(len(settlements)), 1.0),
        "n_ports_r5": n_ports_r5 / max(float(len(settlements)), 1.0),
        # Terrain interactions
        "forest_x_coast": is_forest * coast_m,
        "buildable_x_forest_density": buildable * forest_density_3,
        "settlement_density_x_maritime_access": settlement_density_3 * maritime_access,
        "frontier_x_forest_density": frontier_score * forest_density_3,
        "coast_distance_sq": coast_distance ** 2,
        "settlement_proximity_cube": settlement_proximity ** 3,
        "coastal_exposure_x_buildable": coastal_exposure * buildable,
        "maritime_access_x_settlement_density": maritime_access * settlement_density_3,
        # Compound indicators
        "inland_settlement_proximity": settlement_proximity * (1.0 - coast_m),
        "coastal_settlement_proximity": settlement_proximity * coast_m,
        "frontier_x_coast": frontier_score * coast_m,
        "forest_edge": forest_edge,
    }

    return features


def seed_feature_matrix_v3(initial_state: InitialWorldState) -> tuple[list[str], np.ndarray]:
    features = seed_feature_dict_v3(initial_state)
    names = seed_feature_names_v3()
    return names, np.stack([features[name] for name in names], axis=0).astype(np.float64)


def _fit_weighted_ridge(
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    sample_weights: np.ndarray,
    ridge_alpha: float,
) -> tuple[float, np.ndarray]:
    design = np.concatenate(
        [np.ones((feature_matrix.shape[0], 1), dtype=np.float64), feature_matrix],
        axis=1,
    )
    sqrt_weights = np.sqrt(np.clip(sample_weights, 1e-6, None))[:, None]
    design_w = design * sqrt_weights
    target_w = np.asarray(target, dtype=np.float64) * sqrt_weights[:, 0]
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design_w.T @ design_w + ridge_alpha * penalty
    rhs = design_w.T @ target_w
    solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0]), np.asarray(solution[1:], dtype=np.float64)


class RoundSemimechanisticCoefficientsV3(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    feature_names: list[str]
    summary_vector: np.ndarray
    dynamic_class_indexes: tuple[int, ...] = _DYNAMIC_CLASS_INDEXES
    dynamic_class_names: tuple[str, ...] = tuple(CLASS_NAMES[index] for index in _DYNAMIC_CLASS_INDEXES)
    intercepts: np.ndarray
    coefficients: np.ndarray
    sample_count: int = Field(ge=0)

    def combined_vector(self) -> np.ndarray:
        return np.concatenate(
            [
                self.intercepts.astype(np.float64),
                self.coefficients.reshape(-1).astype(np.float64),
            ],
            axis=0,
        )


def fit_round_semimechanistic_coefficients_v3(
    episode: RoundEpisode,
    *,
    ridge_alpha: float = 1e-2,
) -> RoundSemimechanisticCoefficientsV3:
    feature_names = seed_feature_names_v3()
    feature_rows: list[np.ndarray] = []
    target_rows: list[np.ndarray] = []
    weight_rows: list[np.ndarray] = []

    for seed in episode.seeds:
        empirical = seed_empirical_terminal_probs(seed)
        if empirical is None:
            continue
        _, feature_stack = seed_feature_matrix_v3(seed.initial_state)
        feature_dict = seed_feature_dict_v3(seed.initial_state)
        fit_mask = (feature_dict["land"] > 0.5) & ~(feature_dict["initial_mountain"] > 0.5)
        if not np.any(fit_mask):
            continue
        feature_rows.append(feature_stack[:, fit_mask].T.astype(np.float64))
        target_rows.append(np.asarray(empirical[fit_mask], dtype=np.float64))
        clipped = _clip_probabilities(np.asarray(empirical[fit_mask], dtype=np.float64))
        weights = -np.sum(clipped * np.log(clipped), axis=1)
        weight_rows.append(np.clip(weights, 1e-3, None))

    if not feature_rows:
        raise ValueError(f"round {episode.metadata.round_id} has no empirical targets")

    features = np.concatenate(feature_rows, axis=0)
    targets = np.concatenate(target_rows, axis=0)
    sample_weights = np.concatenate(weight_rows, axis=0)
    base_log = np.log(_clip_probabilities(targets[:, 0]))

    intercepts: list[float] = []
    coefficients: list[np.ndarray] = []
    for class_index in _DYNAMIC_CLASS_INDEXES:
        log_ratio_target = np.log(_clip_probabilities(targets[:, class_index])) - base_log
        intercept, coef = _fit_weighted_ridge(
            features,
            log_ratio_target,
            sample_weights=sample_weights,
            ridge_alpha=ridge_alpha,
        )
        intercepts.append(intercept)
        coefficients.append(coef)

    return RoundSemimechanisticCoefficientsV3(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        feature_names=feature_names,
        summary_vector=round_regime_summary_vector_v2(episode),
        intercepts=np.asarray(intercepts, dtype=np.float64),
        coefficients=np.stack(coefficients, axis=0),
        sample_count=int(features.shape[0]),
    )


__all__ = [
    "RoundSemimechanisticCoefficientsV3",
    "fit_round_semimechanistic_coefficients_v3",
    "seed_feature_dict_v3",
    "seed_feature_matrix_v3",
    "seed_feature_names_v3",
]
