from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_NAMES, buildable_mask, mountain_mask, sea_mask
from astar.core.world_state import InitialWorldState, SettlementFullState
from astar.features.coasts import coast_mask, normalized_coast_distance
from astar.features.influence import (
    normalized_land_distance_to_settlements,
    normalized_sea_distance_to_initial_ports,
    settlement_basin_gap,
)
from astar.history.episodes.models import RoundEpisode, SeedEpisode
from astar.history.summaries.round_coefficients import (
    seed_empirical_terminal_probs,
    seed_regime_summary_vector,
)
from astar.infra.api.dto import InitialSettlement

_DYNAMIC_CLASS_INDEXES = (1, 2, 3, 4)


def _local_ratio(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    ratio = np.zeros((height, width), dtype=np.float64)
    for y in range(height):
        y0 = max(0, y - 1)
        y1 = min(height, y + 2)
        for x in range(width):
            x0 = max(0, x - 1)
            x1 = min(width, x + 2)
            ratio[y, x] = float(np.mean(mask[y0:y1, x0:x1]))
    return ratio


def _clip_probabilities(values: np.ndarray) -> np.ndarray:
    return np.asarray(np.clip(values, 1e-4, 1.0 - 1e-4), dtype=np.float64)


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


def _curve_segment_means(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return np.zeros(3, dtype=np.float64)
    splits = np.array_split(np.asarray(values, dtype=np.float64), 3)
    return np.asarray(
        [float(np.mean(chunk)) if chunk.size > 0 else 0.0 for chunk in splits],
        dtype=np.float64,
    )


def _settlement_maps(initial_state: InitialWorldState) -> tuple[np.ndarray, np.ndarray]:
    height, width = initial_state.grid.shape
    settlement_map = np.zeros((height, width), dtype=np.float64)
    port_map = np.zeros((height, width), dtype=np.float64)
    for settlement in initial_state.settlements:
        settlement_map[settlement.y, settlement.x] = 1.0
        if settlement.has_port:
            port_map[settlement.y, settlement.x] = 1.0
    return settlement_map, port_map


def seed_feature_names_v2() -> list[str]:
    return [
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
    ]


def seed_feature_dict_v2(initial_state: InitialWorldState) -> dict[str, np.ndarray]:
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    settlements = [
        InitialSettlement(
            x=item.x,
            y=item.y,
            has_port=item.has_port,
            alive=item.alive,
        )
        for item in initial_state.settlements
    ]

    buildable = buildable_mask(grid).astype(np.float64)
    land = (~sea_mask(grid)).astype(np.float64)
    coast = coast_mask(grid).astype(np.float64)
    coast_distance = normalized_coast_distance(grid)
    land_distance = normalized_land_distance_to_settlements(grid, settlements)
    sea_distance = normalized_sea_distance_to_initial_ports(grid, settlements)
    basin_gap = settlement_basin_gap(grid, settlements)
    frontier_score = 1.0 - basin_gap
    settlement_proximity = 1.0 - land_distance
    maritime_access = 1.0 - sea_distance
    settlement_map, port_map = _settlement_maps(initial_state)
    initial_built = np.isin(grid, (1, 2)).astype(np.float64)

    return {
        "buildable": buildable,
        "land": land,
        "coast": coast,
        "coast_distance": coast_distance,
        "land_distance_to_settlement": land_distance,
        "sea_distance_to_port": sea_distance,
        "forest_density": _local_ratio(grid == 4),
        "mountain_density": _local_ratio(mountain_mask(grid)),
        "settlement_basin_gap": basin_gap,
        "frontier_score": frontier_score,
        "settlement_proximity": settlement_proximity,
        "coastal_exposure": 1.0 - coast_distance,
        "maritime_access": maritime_access,
        "initial_forest": (grid == 4).astype(np.float64),
        "initial_mountain": (grid == 5).astype(np.float64),
        "initial_ocean": (grid == 10).astype(np.float64),
        "initial_settlement": settlement_map,
        "initial_port": port_map,
        "settlement_density": _local_ratio(settlement_map > 0.5),
        "port_density": _local_ratio(port_map > 0.5),
        "initial_built": initial_built,
        "coast_x_buildable": coast * buildable,
        "coast_x_settlement_proximity": coast * settlement_proximity,
        "frontier_x_settlement_proximity": frontier_score * settlement_proximity,
        "frontier_x_maritime_access": frontier_score * maritime_access,
        "maritime_access_sq": maritime_access * maritime_access,
        "settlement_proximity_sq": settlement_proximity * settlement_proximity,
        "frontier_score_sq": frontier_score * frontier_score,
    }


def seed_feature_matrix_v2(initial_state: InitialWorldState) -> tuple[list[str], np.ndarray]:
    features = seed_feature_dict_v2(initial_state)
    names = seed_feature_names_v2()
    return names, np.stack([features[name] for name in names], axis=0).astype(np.float64)


def _settlement_lookup(frame_settlements: tuple[SettlementFullState, ...]) -> dict[tuple[int, int], SettlementFullState]:
    return {(settlement.x, settlement.y): settlement for settlement in frame_settlements}


def _seed_transition_metrics(seed: SeedEpisode) -> np.ndarray:
    if not seed.replay_runs:
        return np.zeros(19, dtype=np.float64)
    event_rows: list[np.ndarray] = []
    resource_rows: list[np.ndarray] = []
    curve_alive: list[np.ndarray] = []
    curve_port: list[np.ndarray] = []
    curve_ruin: list[np.ndarray] = []
    buildable = buildable_mask(np.asarray(seed.initial_state.grid, dtype=np.int64))
    buildable_count = float(max(1, int(np.count_nonzero(buildable))))

    for run in seed.replay_runs:
        alive_curve: list[float] = []
        port_curve: list[float] = []
        ruin_curve: list[float] = []
        for frame in run.frames:
            alive_curve.append(sum(1 for settlement in frame.settlements if settlement.alive))
            port_curve.append(sum(1 for settlement in frame.settlements if settlement.has_port))
            ruin_curve.append(float(np.count_nonzero(frame.grid == 3)))
        initial_alive = float(max(1, int(alive_curve[0])))
        curve_alive.append(np.asarray(alive_curve, dtype=np.float64) / initial_alive)
        curve_port.append(np.asarray(port_curve, dtype=np.float64) / initial_alive)
        curve_ruin.append(np.asarray(ruin_curve, dtype=np.float64) / buildable_count)

        for previous, current in zip(run.frames, run.frames[1:]):
            prev_grid = np.asarray(previous.grid, dtype=np.int64)
            curr_grid = np.asarray(current.grid, dtype=np.int64)
            collapse_rate = float(np.mean(np.isin(prev_grid, (1, 2)) & (curr_grid == 3)))
            rebuild_rate = float(np.mean((prev_grid == 3) & np.isin(curr_grid, (1, 2))))
            reclaim_rate = float(np.mean((prev_grid == 3) & (curr_grid == 4)))
            fade_rate = float(np.mean((prev_grid == 3) & np.isin(curr_grid, (0, 11))))
            portize_rate = float(np.mean((prev_grid == 1) & (curr_grid == 2)))
            event_rows.append(
                np.asarray(
                    [
                        collapse_rate,
                        rebuild_rate,
                        reclaim_rate,
                        fade_rate,
                        portize_rate,
                    ],
                    dtype=np.float64,
                ),
            )

            prev_by_xy = _settlement_lookup(previous.settlements)
            curr_by_xy = _settlement_lookup(current.settlements)
            common = tuple(sorted(set(prev_by_xy) & set(curr_by_xy)))
            if not common:
                resource_rows.append(np.zeros(5, dtype=np.float64))
                continue
            owner_flip_count = 0.0
            delta_pop: list[float] = []
            delta_food: list[float] = []
            delta_wealth: list[float] = []
            delta_defense: list[float] = []
            for key in common:
                prev_settlement = prev_by_xy[key]
                curr_settlement = curr_by_xy[key]
                if (
                    prev_settlement.owner_id is not None
                    and curr_settlement.owner_id is not None
                    and prev_settlement.owner_id != curr_settlement.owner_id
                ):
                    owner_flip_count += 1.0
                if prev_settlement.population is not None and curr_settlement.population is not None:
                    delta_pop.append(abs(float(curr_settlement.population - prev_settlement.population)))
                if prev_settlement.food is not None and curr_settlement.food is not None:
                    delta_food.append(abs(float(curr_settlement.food - prev_settlement.food)))
                if prev_settlement.wealth is not None and curr_settlement.wealth is not None:
                    delta_wealth.append(abs(float(curr_settlement.wealth - prev_settlement.wealth)))
                if prev_settlement.defense is not None and curr_settlement.defense is not None:
                    delta_defense.append(abs(float(curr_settlement.defense - prev_settlement.defense)))
            resource_rows.append(
                np.asarray(
                    [
                        owner_flip_count / float(max(1, len(common))),
                        float(np.mean(delta_pop)) if delta_pop else 0.0,
                        float(np.mean(delta_food)) if delta_food else 0.0,
                        float(np.mean(delta_wealth)) if delta_wealth else 0.0,
                        float(np.mean(delta_defense)) if delta_defense else 0.0,
                    ],
                    dtype=np.float64,
                ),
            )

    event_mean = (
        np.mean(np.stack(event_rows, axis=0), axis=0)
        if event_rows
        else np.zeros(5, dtype=np.float64)
    )
    resource_mean = (
        np.mean(np.stack(resource_rows, axis=0), axis=0)
        if resource_rows
        else np.zeros(5, dtype=np.float64)
    )
    alive_segments = _curve_segment_means(np.mean(np.stack(curve_alive, axis=0), axis=0))
    port_segments = _curve_segment_means(np.mean(np.stack(curve_port, axis=0), axis=0))
    ruin_segments = _curve_segment_means(np.mean(np.stack(curve_ruin, axis=0), axis=0))
    return np.concatenate(
        [alive_segments, port_segments, ruin_segments, event_mean, resource_mean],
        axis=0,
    ).astype(np.float64)


def seed_regime_summary_vector_v2(seed: SeedEpisode) -> np.ndarray | None:
    base = seed_regime_summary_vector(seed)
    if base is None:
        return None
    return np.concatenate([base, _seed_transition_metrics(seed)], axis=0).astype(np.float64)


def round_regime_summary_vector_v2(episode: RoundEpisode) -> np.ndarray:
    vectors = [
        vector for seed in episode.seeds if (vector := seed_regime_summary_vector_v2(seed)) is not None
    ]
    if not vectors:
        return np.zeros(31, dtype=np.float64)
    return np.asarray(np.mean(np.stack(vectors, axis=0), axis=0), dtype=np.float64)


class RoundSemimechanisticCoefficientsV2(BaseModel):
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


def fit_round_semimechanistic_coefficients_v2(
    episode: RoundEpisode,
    *,
    ridge_alpha: float = 1e-2,
) -> RoundSemimechanisticCoefficientsV2:
    feature_names = seed_feature_names_v2()
    feature_rows: list[np.ndarray] = []
    target_rows: list[np.ndarray] = []
    weight_rows: list[np.ndarray] = []

    for seed in episode.seeds:
        empirical = seed_empirical_terminal_probs(seed)
        if empirical is None:
            continue
        _, feature_stack = seed_feature_matrix_v2(seed.initial_state)
        feature_dict = seed_feature_dict_v2(seed.initial_state)
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

    return RoundSemimechanisticCoefficientsV2(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        feature_names=feature_names,
        summary_vector=round_regime_summary_vector_v2(episode),
        intercepts=np.asarray(intercepts, dtype=np.float64),
        coefficients=np.stack(coefficients, axis=0),
        sample_count=int(features.shape[0]),
    )


__all__ = [
    "RoundSemimechanisticCoefficientsV2",
    "fit_round_semimechanistic_coefficients_v2",
    "round_regime_summary_vector_v2",
    "seed_feature_dict_v2",
    "seed_feature_matrix_v2",
]
