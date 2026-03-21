from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs
from astar.features.geometry import RoundFeatureBundle, SeedFeatureBundle, compute_round_features
from astar.infra.api.dto import InitialSettlement, RoundDetail

COMPETITION_SEED_COUNT = 5
MAX_QUERY_BUDGET = 50.0
_POPULATION_SCALE = 4.5
_FOOD_SCALE = 1.1
_WEALTH_SCALE = 1.5
_DEFENSE_SCALE = 1.0

WINDOW_STATIC_FEATURE_NAMES = (
    "viewport_x_fraction",
    "viewport_y_fraction",
    "viewport_w_fraction",
    "viewport_h_fraction",
    "viewport_area_fraction",
    *[f"initial_class_freq::{class_name}" for class_name in CLASS_NAMES],
    "initial_settlement_density",
    "initial_port_density",
)

WINDOW_DYNAMIC_FEATURE_NAMES = (
    *[f"final_class_freq::{class_name}" for class_name in CLASS_NAMES],
    *[f"delta_class_freq::{class_name}" for class_name in CLASS_NAMES],
    "observed_settlement_density",
    "observed_alive_density",
    "observed_port_density",
    "observed_alive_fraction",
    "observed_port_fraction",
    "observed_distinct_owner_fraction",
    "mean_population_norm",
    "mean_food_norm",
    "mean_wealth_norm",
    "mean_defense_norm",
)

WINDOW_GROUP_FEATURE_NAMES = (
    *WINDOW_STATIC_FEATURE_NAMES,
    "repeat_query_fraction",
    *[f"mean::{name}" for name in WINDOW_DYNAMIC_FEATURE_NAMES],
    *[f"std::{name}" for name in WINDOW_DYNAMIC_FEATURE_NAMES],
)

_SUMMARY_SCALAR_NAMES = (
    "query_fraction",
    "unique_window_fraction",
    "mean_repeat_fraction",
    "max_repeat_fraction",
)

ROUND_INITIAL_SEED_FEATURE_NAMES = (
    *[f"initial_class_freq::{class_name}" for class_name in CLASS_NAMES],
    "initial_settlement_density",
    "initial_port_density",
    "buildable_fraction",
    "coast_fraction",
    "mean_forest_density",
    "mean_mountain_density",
    "mean_frontier_score",
    "mean_settlement_proximity",
    "mean_maritime_access",
)


@dataclass(frozen=True, slots=True)
class TranscriptWindowKey:
    seed_index: int
    x: int
    y: int
    w: int
    h: int

    @classmethod
    def from_observation(cls, observation: LiveQueryObs) -> TranscriptWindowKey:
        viewport = observation.viewport
        return cls(
            seed_index=observation.seed_index,
            x=viewport.x,
            y=viewport.y,
            w=viewport.w,
            h=viewport.h,
        )


@dataclass(frozen=True, slots=True)
class TranscriptWindowObservation:
    key: TranscriptWindowKey
    query_index: int
    static_features: np.ndarray
    dynamic_features: np.ndarray


@dataclass(frozen=True, slots=True)
class TranscriptWindowGroup:
    key: TranscriptWindowKey
    observations: tuple[TranscriptWindowObservation, ...]
    static_features: np.ndarray
    mean_dynamic_features: np.ndarray
    std_dynamic_features: np.ndarray
    repeat_query_fraction: float

    def feature_vector(self) -> np.ndarray:
        return np.concatenate(
            [
                np.asarray(self.static_features, dtype=np.float64),
                np.asarray([self.repeat_query_fraction], dtype=np.float64),
                np.asarray(self.mean_dynamic_features, dtype=np.float64),
                np.asarray(self.std_dynamic_features, dtype=np.float64),
            ],
            axis=0,
        )


@dataclass(frozen=True, slots=True)
class TranscriptWindowSet:
    seed_count: int
    groups: tuple[TranscriptWindowGroup, ...]

    @property
    def query_count(self) -> int:
        return sum(len(group.observations) for group in self.groups)

    @property
    def unique_window_count(self) -> int:
        return len(self.groups)


def _normalize_optional(value: float | None, scale: float) -> float:
    if value is None:
        return 0.0
    return float(value) / scale


def _initial_patch(round_detail: RoundDetail, key: TranscriptWindowKey) -> np.ndarray:
    grid = np.asarray(round_detail.initial_states[key.seed_index].grid, dtype=np.int64)
    return np.asarray(
        grid[key.y : key.y + key.h, key.x : key.x + key.w],
        dtype=np.int64,
    )


def _class_frequency_vector(grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    area = max(1, collapsed.shape[0] * collapsed.shape[1])
    return np.asarray(
        [
            float(np.count_nonzero(collapsed == class_index)) / float(area)
            for class_index in range(CLASS_COUNT)
        ],
        dtype=np.float64,
    )


def _viewport_geometry_vector(
    round_detail: RoundDetail,
    key: TranscriptWindowKey,
) -> np.ndarray:
    return np.asarray(
        [
            float(key.x) / float(round_detail.map_width),
            float(key.y) / float(round_detail.map_height),
            float(key.w) / float(round_detail.map_width),
            float(key.h) / float(round_detail.map_height),
            float(key.w * key.h) / float(round_detail.map_width * round_detail.map_height),
        ],
        dtype=np.float64,
    )


def _settlements_in_window(
    settlements: Sequence[InitialSettlement],
    key: TranscriptWindowKey,
) -> list[InitialSettlement]:
    return [
        settlement
        for settlement in settlements
        if key.x <= settlement.x < (key.x + key.w) and key.y <= settlement.y < (key.y + key.h)
    ]


def _initial_settlement_vector(
    round_detail: RoundDetail,
    key: TranscriptWindowKey,
) -> np.ndarray:
    area = float(key.w * key.h)
    settlements = _settlements_in_window(
        round_detail.initial_states[key.seed_index].settlements,
        key,
    )
    settlement_count = len(settlements)
    port_count = sum(1 for settlement in settlements if settlement.has_port)
    return np.asarray(
        [
            settlement_count / area,
            port_count / area,
        ],
        dtype=np.float64,
    )


def _seed_round_initial_feature_vector(
    round_detail: RoundDetail,
    seed_index: int,
    feature_bundle: SeedFeatureBundle,
) -> np.ndarray:
    initial_state = round_detail.initial_states[seed_index]
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    area = float(max(1, grid.shape[0] * grid.shape[1]))
    class_frequencies = _class_frequency_vector(grid)
    settlement_count = len(initial_state.settlements)
    port_count = sum(1 for settlement in initial_state.settlements if settlement.has_port)
    return np.asarray(
        [
            *class_frequencies.tolist(),
            float(settlement_count) / area,
            float(port_count) / area,
            float(np.mean(feature_bundle.feature("buildable"))),
            float(np.mean(feature_bundle.feature("coast"))),
            float(np.mean(feature_bundle.feature("forest_density"))),
            float(np.mean(feature_bundle.feature("mountain_density"))),
            float(np.mean(feature_bundle.feature("frontier_score"))),
            float(np.mean(feature_bundle.feature("settlement_proximity"))),
            float(np.mean(feature_bundle.feature("maritime_access"))),
        ],
        dtype=np.float64,
    )


def round_initial_feature_names() -> tuple[str, ...]:
    return (
        *[f"round::seed_mean::{name}" for name in ROUND_INITIAL_SEED_FEATURE_NAMES],
        *[f"round::seed_std::{name}" for name in ROUND_INITIAL_SEED_FEATURE_NAMES],
    )


def build_round_initial_feature_vector(
    round_detail: RoundDetail,
    *,
    geometry_bundle: RoundFeatureBundle | None = None,
) -> tuple[tuple[str, ...], np.ndarray]:
    resolved_geometry_bundle = (
        geometry_bundle
        if geometry_bundle is not None
        else compute_round_features(round_detail)
    )
    seed_vectors = np.stack(
        [
            _seed_round_initial_feature_vector(
                round_detail,
                seed_index,
                resolved_geometry_bundle.per_seed[seed_index],
            )
            for seed_index in range(round_detail.seeds_count)
        ],
        axis=0,
    )
    aggregated = np.concatenate(
        [
            np.asarray(np.mean(seed_vectors, axis=0), dtype=np.float64),
            np.asarray(np.std(seed_vectors, axis=0), dtype=np.float64),
        ],
        axis=0,
    )
    return round_initial_feature_names(), aggregated


def _observed_settlement_vector(
    settlements: Sequence[LiveSettlementObs],
    key: TranscriptWindowKey,
) -> np.ndarray:
    for settlement in settlements:
        if not (
            key.x <= settlement.x < (key.x + key.w) and key.y <= settlement.y < (key.y + key.h)
        ):
            msg = (
                "observed settlement lies outside viewport: "
                f"settlement=({settlement.x}, {settlement.y}) "
                f"viewport=({key.x}, {key.y}, {key.w}, {key.h})"
            )
            raise ValueError(msg)
    area = float(key.w * key.h)
    count = len(settlements)
    alive_count = sum(1 for settlement in settlements if settlement.alive)
    port_count = sum(1 for settlement in settlements if settlement.has_port)
    distinct_owner_count = len(
        {settlement.owner_id for settlement in settlements if settlement.owner_id is not None}
    )
    denominator = float(max(count, 1))
    return np.asarray(
        [
            float(count) / area,
            float(alive_count) / area,
            float(port_count) / area,
            float(alive_count) / denominator,
            float(port_count) / denominator,
            float(distinct_owner_count) / denominator,
            np.mean(
                [
                    _normalize_optional(settlement.population, _POPULATION_SCALE)
                    for settlement in settlements
                ],
                dtype=np.float64,
            )
            if settlements
            else 0.0,
            np.mean(
                [_normalize_optional(settlement.food, _FOOD_SCALE) for settlement in settlements],
                dtype=np.float64,
            )
            if settlements
            else 0.0,
            np.mean(
                [
                    _normalize_optional(settlement.wealth, _WEALTH_SCALE)
                    for settlement in settlements
                ],
                dtype=np.float64,
            )
            if settlements
            else 0.0,
            np.mean(
                [
                    _normalize_optional(settlement.defense, _DEFENSE_SCALE)
                    for settlement in settlements
                ],
                dtype=np.float64,
            )
            if settlements
            else 0.0,
        ],
        dtype=np.float64,
    )


def summarize_transcript_observation(
    round_detail: RoundDetail,
    observation: LiveQueryObs,
) -> TranscriptWindowObservation:
    key = TranscriptWindowKey.from_observation(observation)
    expected_shape = (key.h, key.w)
    actual_shape = tuple(np.asarray(observation.grid).shape)
    if actual_shape != expected_shape:
        raise ValueError(
            "observation grid shape does not match viewport: "
            f"expected {expected_shape}, got {actual_shape}"
        )
    initial_patch = _initial_patch(round_detail, key)
    if tuple(initial_patch.shape) != expected_shape:
        raise ValueError(
            "initial patch shape does not match viewport after slicing: "
            f"expected {expected_shape}, got {tuple(initial_patch.shape)}"
        )
    initial_class_features = _class_frequency_vector(initial_patch)
    final_class_features = _class_frequency_vector(observation.grid)
    static_features = np.concatenate(
        [
            _viewport_geometry_vector(round_detail, key),
            initial_class_features,
            _initial_settlement_vector(round_detail, key),
        ],
        axis=0,
    )
    dynamic_features = np.concatenate(
        [
            final_class_features,
            final_class_features - initial_class_features,
            _observed_settlement_vector(observation.settlements, key),
        ],
        axis=0,
    )
    return TranscriptWindowObservation(
        key=key,
        query_index=observation.query_index,
        static_features=np.asarray(static_features, dtype=np.float64),
        dynamic_features=np.asarray(dynamic_features, dtype=np.float64),
    )


def build_transcript_window_set(
    round_detail: RoundDetail,
    observations: Sequence[LiveQueryObs],
) -> TranscriptWindowSet:
    grouped: dict[TranscriptWindowKey, list[TranscriptWindowObservation]] = defaultdict(list)
    for observation in observations:
        summary = summarize_transcript_observation(round_detail, observation)
        grouped[summary.key].append(summary)

    groups: list[TranscriptWindowGroup] = []
    for key in sorted(
        grouped,
        key=lambda item: (item.seed_index, item.y, item.x, item.h, item.w),
    ):
        ordered = tuple(sorted(grouped[key], key=lambda item: item.query_index))
        dynamic_matrix = np.stack([item.dynamic_features for item in ordered], axis=0)
        groups.append(
            TranscriptWindowGroup(
                key=key,
                observations=ordered,
                static_features=np.asarray(ordered[0].static_features, dtype=np.float64),
                mean_dynamic_features=np.asarray(np.mean(dynamic_matrix, axis=0), dtype=np.float64),
                std_dynamic_features=np.asarray(np.std(dynamic_matrix, axis=0), dtype=np.float64),
                repeat_query_fraction=float(len(ordered)) / MAX_QUERY_BUDGET,
            )
        )

    return TranscriptWindowSet(
        seed_count=max(COMPETITION_SEED_COUNT, round_detail.seeds_count),
        groups=tuple(groups),
    )


def _aggregate_group_vectors(groups: Sequence[TranscriptWindowGroup]) -> np.ndarray:
    if not groups:
        zero_group = np.zeros(len(WINDOW_GROUP_FEATURE_NAMES), dtype=np.float64)
        return np.concatenate(
            [
                np.zeros(len(_SUMMARY_SCALAR_NAMES), dtype=np.float64),
                zero_group,
                zero_group,
            ],
            axis=0,
        )
    group_vectors = np.stack([group.feature_vector() for group in groups], axis=0)
    repeat_counts = np.asarray([len(group.observations) for group in groups], dtype=np.float64)
    query_count = float(np.sum(repeat_counts))
    unique_window_count = float(len(groups))
    summary_scalars = np.asarray(
        [
            query_count / MAX_QUERY_BUDGET,
            unique_window_count / MAX_QUERY_BUDGET,
            float(np.mean(repeat_counts)) / MAX_QUERY_BUDGET,
            float(np.max(repeat_counts)) / MAX_QUERY_BUDGET,
        ],
        dtype=np.float64,
    )
    return np.concatenate(
        [
            summary_scalars,
            np.asarray(np.mean(group_vectors, axis=0), dtype=np.float64),
            np.asarray(np.std(group_vectors, axis=0), dtype=np.float64),
        ],
        axis=0,
    )


def transcript_summary_feature_names(seed_count: int) -> tuple[str, ...]:
    global_names = (
        *[f"global::{name}" for name in _SUMMARY_SCALAR_NAMES],
        *[f"global::group_mean::{name}" for name in WINDOW_GROUP_FEATURE_NAMES],
        *[f"global::group_std::{name}" for name in WINDOW_GROUP_FEATURE_NAMES],
    )
    per_seed_names = tuple(
        name
        for seed_index in range(seed_count)
        for name in (
            *[f"seed[{seed_index}]::{scalar_name}" for scalar_name in _SUMMARY_SCALAR_NAMES],
            *[
                f"seed[{seed_index}]::group_mean::{feature_name}"
                for feature_name in WINDOW_GROUP_FEATURE_NAMES
            ],
            *[
                f"seed[{seed_index}]::group_std::{feature_name}"
                for feature_name in WINDOW_GROUP_FEATURE_NAMES
            ],
        )
    )
    return global_names + per_seed_names


def transcript_summary_vector(window_set: TranscriptWindowSet) -> np.ndarray:
    global_summary = _aggregate_group_vectors(window_set.groups)
    per_seed_groups: dict[int, list[TranscriptWindowGroup]] = {
        seed_index: [] for seed_index in range(window_set.seed_count)
    }
    for group in window_set.groups:
        per_seed_groups[group.key.seed_index].append(group)
    per_seed_summary = [
        _aggregate_group_vectors(per_seed_groups[seed_index])
        for seed_index in range(window_set.seed_count)
    ]
    return np.concatenate(
        [global_summary, *per_seed_summary],
        axis=0,
    ).astype(np.float64)


def build_transcript_summary_vector(
    round_detail: RoundDetail,
    observations: Sequence[LiveQueryObs],
    *,
    geometry_bundle: RoundFeatureBundle | None = None,
) -> tuple[tuple[str, ...], np.ndarray]:
    round_feature_names, round_feature_vector = build_round_initial_feature_vector(
        round_detail,
        geometry_bundle=geometry_bundle,
    )
    window_set = build_transcript_window_set(round_detail, observations)
    feature_names = round_feature_names + transcript_summary_feature_names(window_set.seed_count)
    feature_vector = np.concatenate(
        [
            round_feature_vector,
            transcript_summary_vector(window_set),
        ],
        axis=0,
    ).astype(np.float64)
    return feature_names, feature_vector


__all__ = [
    "COMPETITION_SEED_COUNT",
    "MAX_QUERY_BUDGET",
    "ROUND_INITIAL_SEED_FEATURE_NAMES",
    "WINDOW_DYNAMIC_FEATURE_NAMES",
    "WINDOW_GROUP_FEATURE_NAMES",
    "WINDOW_STATIC_FEATURE_NAMES",
    "TranscriptWindowGroup",
    "TranscriptWindowKey",
    "TranscriptWindowObservation",
    "TranscriptWindowSet",
    "build_round_initial_feature_vector",
    "build_transcript_summary_vector",
    "build_transcript_window_set",
    "round_initial_feature_names",
    "summarize_transcript_observation",
    "transcript_summary_feature_names",
    "transcript_summary_vector",
]
