from __future__ import annotations

import numpy as np


def _steps(value: float) -> float:
    return float(np.log1p(max(value, 0.0)))


def _mark(value: float) -> float:
    return float(np.arcsinh(value))


def _count(value: float) -> float:
    return float(np.log1p(max(value, 0.0)))


def _vector(
    feature_names: tuple[str, ...],
    *,
    defaults: dict[str, float],
    overrides: dict[str, float] | None = None,
) -> np.ndarray:
    values = dict(defaults)
    if overrides:
        values.update(overrides)
    unknown = sorted(set(values) - set(feature_names))
    if unknown:
        raise ValueError(f"unknown canonical probe feature(s): {unknown}")
    missing = sorted(set(feature_names) - set(values))
    if missing:
        raise ValueError(f"missing canonical probe feature(s): {missing}")
    vector = np.zeros((len(feature_names),), dtype=np.float64)
    index_by_name = {name: index for index, name in enumerate(feature_names)}
    for name, value in values.items():
        vector[index_by_name[name]] = float(value)
    return vector


def build_canonical_site_probes(
    feature_names: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    defaults = {
        "prev_ruin": 0.0,
        "buildable": 1.0,
        "coast": 0.0,
        "coast_distance_steps_log1p": _steps(3.0),
        "coast_distance_unreachable": 0.0,
        "land_distance_to_settlement_steps_log1p": _steps(2.0),
        "land_distance_to_settlement_unreachable": 0.0,
        "sea_distance_to_port_steps_log1p": 0.0,
        "sea_distance_to_port_unreachable": 1.0,
        "settlement_basin_gap_steps_log1p": _steps(2.0),
        "settlement_basin_gap_unreachable": 0.0,
        "forest_density": 0.15,
        "mountain_density": 0.10,
        "settlement_proximity": 0.45,
        "maritime_access": 0.10,
        "frontier_score": 0.10,
        "nearby_live_count_log1p": _count(1.0),
        "nearby_same_owner_count_log1p": 0.0,
        "nearby_other_owner_count_log1p": 0.0,
        "nearby_port_count_log1p": 0.0,
        "nearby_ruin_count_log1p": 0.0,
    }
    probe_specs = (
        ("open_inland", {}),
        (
            "open_coastal",
            {
                "coast": 1.0,
                "coast_distance_steps_log1p": 0.0,
                "sea_distance_to_port_steps_log1p": _steps(2.0),
                "sea_distance_to_port_unreachable": 0.0,
                "maritime_access": 0.85,
                "nearby_port_count_log1p": _count(1.0),
                "settlement_proximity": 0.55,
            },
        ),
        (
            "frontier_open",
            {
                "frontier_score": 0.85,
                "nearby_live_count_log1p": _count(3.0),
                "nearby_same_owner_count_log1p": 0.0,
                "nearby_other_owner_count_log1p": _count(2.0),
                "settlement_proximity": 0.60,
                "maritime_access": 0.20,
            },
        ),
        (
            "forest_edge_open",
            {
                "forest_density": 0.85,
                "mountain_density": 0.05,
                "settlement_proximity": 0.35,
                "maritime_access": 0.05,
            },
        ),
    )
    return (
        tuple(name for name, _ in probe_specs),
        np.stack(
            [
                _vector(feature_names, defaults=defaults, overrides=overrides)
                for _, overrides in probe_specs
            ],
            axis=0,
        ).astype(np.float64),
    )


def build_canonical_live_probes(
    feature_names: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    defaults = {
        "prev_has_port": 0.0,
        "prev_owner_known": 1.0,
        "coast": 0.0,
        "coast_distance_steps_log1p": _steps(3.0),
        "coast_distance_unreachable": 0.0,
        "land_distance_to_settlement_steps_log1p": _steps(1.0),
        "land_distance_to_settlement_unreachable": 0.0,
        "sea_distance_to_port_steps_log1p": 0.0,
        "sea_distance_to_port_unreachable": 1.0,
        "settlement_basin_gap_steps_log1p": _steps(2.0),
        "settlement_basin_gap_unreachable": 0.0,
        "forest_density": 0.15,
        "mountain_density": 0.10,
        "settlement_proximity": 0.50,
        "maritime_access": 0.10,
        "frontier_score": 0.15,
        "nearby_live_count_log1p": _count(2.0),
        "nearby_same_owner_count_log1p": _count(1.0),
        "nearby_other_owner_count_log1p": 0.0,
        "nearby_port_count_log1p": 0.0,
        "nearby_ruin_count_log1p": 0.0,
        "prev_population_asinh": _mark(1.0),
        "prev_food_asinh": _mark(0.45),
        "prev_wealth_asinh": _mark(0.15),
        "prev_defense_asinh": _mark(0.35),
    }
    probe_specs = (
        (
            "weak_inland",
            {
                "settlement_proximity": 0.25,
                "nearby_live_count_log1p": _count(1.0),
                "frontier_score": 0.20,
                "prev_population_asinh": _mark(0.25),
                "prev_food_asinh": _mark(0.1),
                "prev_wealth_asinh": _mark(0.02),
                "prev_defense_asinh": _mark(0.08),
            },
        ),
        (
            "coastal_nonport",
            {
                "coast": 1.0,
                "coast_distance_steps_log1p": 0.0,
                "sea_distance_to_port_steps_log1p": _steps(2.0),
                "sea_distance_to_port_unreachable": 0.0,
                "settlement_proximity": 0.60,
                "maritime_access": 0.80,
                "nearby_port_count_log1p": _count(1.0),
                "prev_population_asinh": _mark(1.4),
                "prev_food_asinh": _mark(0.7),
                "prev_wealth_asinh": _mark(0.3),
                "prev_defense_asinh": _mark(0.45),
            },
        ),
        (
            "established_port",
            {
                "prev_has_port": 1.0,
                "coast": 1.0,
                "coast_distance_steps_log1p": 0.0,
                "sea_distance_to_port_steps_log1p": _steps(1.0),
                "sea_distance_to_port_unreachable": 0.0,
                "settlement_proximity": 0.75,
                "maritime_access": 0.95,
                "nearby_live_count_log1p": _count(3.0),
                "nearby_same_owner_count_log1p": _count(2.0),
                "nearby_port_count_log1p": _count(2.0),
                "prev_population_asinh": _mark(3.5),
                "prev_food_asinh": _mark(0.95),
                "prev_wealth_asinh": _mark(0.8),
                "prev_defense_asinh": _mark(0.75),
            },
        ),
        (
            "frontier_exposed",
            {
                "frontier_score": 0.90,
                "nearby_live_count_log1p": _count(3.0),
                "nearby_same_owner_count_log1p": _count(1.0),
                "nearby_other_owner_count_log1p": _count(2.0),
                "prev_population_asinh": _mark(1.0),
                "prev_food_asinh": _mark(0.35),
                "prev_wealth_asinh": _mark(0.12),
                "prev_defense_asinh": _mark(0.2),
            },
        ),
        (
            "defended_core",
            {
                "settlement_proximity": 0.80,
                "maritime_access": 0.25,
                "frontier_score": 0.05,
                "nearby_live_count_log1p": _count(4.0),
                "nearby_same_owner_count_log1p": _count(3.0),
                "nearby_other_owner_count_log1p": 0.0,
                "prev_population_asinh": _mark(2.4),
                "prev_food_asinh": _mark(0.75),
                "prev_wealth_asinh": _mark(0.35),
                "prev_defense_asinh": _mark(1.0),
            },
        ),
        (
            "rich_coastal",
            {
                "coast": 1.0,
                "coast_distance_steps_log1p": 0.0,
                "sea_distance_to_port_steps_log1p": _steps(2.0),
                "sea_distance_to_port_unreachable": 0.0,
                "settlement_proximity": 0.65,
                "maritime_access": 0.75,
                "nearby_live_count_log1p": _count(3.0),
                "nearby_same_owner_count_log1p": _count(2.0),
                "nearby_port_count_log1p": _count(1.0),
                "prev_population_asinh": _mark(2.8),
                "prev_food_asinh": _mark(0.9),
                "prev_wealth_asinh": _mark(0.8),
                "prev_defense_asinh": _mark(0.6),
            },
        ),
    )
    return (
        tuple(name for name, _ in probe_specs),
        np.stack(
            [
                _vector(feature_names, defaults=defaults, overrides=overrides)
                for _, overrides in probe_specs
            ],
            axis=0,
        ).astype(np.float64),
    )


def build_canonical_ruin_probes(
    feature_names: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    defaults = {
        "ruin_age_log1p": 0.0,
        "buildable": 1.0,
        "coast": 0.0,
        "coast_distance_steps_log1p": _steps(3.0),
        "coast_distance_unreachable": 0.0,
        "land_distance_to_settlement_steps_log1p": _steps(2.0),
        "land_distance_to_settlement_unreachable": 0.0,
        "sea_distance_to_port_steps_log1p": 0.0,
        "sea_distance_to_port_unreachable": 1.0,
        "settlement_basin_gap_steps_log1p": _steps(2.0),
        "settlement_basin_gap_unreachable": 0.0,
        "forest_density": 0.20,
        "mountain_density": 0.10,
        "settlement_proximity": 0.45,
        "maritime_access": 0.10,
        "frontier_score": 0.20,
        "nearby_live_count_log1p": _count(1.0),
        "nearby_same_owner_count_log1p": 0.0,
        "nearby_other_owner_count_log1p": 0.0,
        "nearby_port_count_log1p": 0.0,
        "nearby_ruin_count_log1p": _count(1.0),
    }
    probe_specs = (
        (
            "coastal_supported",
            {
                "coast": 1.0,
                "coast_distance_steps_log1p": 0.0,
                "sea_distance_to_port_steps_log1p": _steps(2.0),
                "sea_distance_to_port_unreachable": 0.0,
                "settlement_proximity": 0.65,
                "maritime_access": 0.85,
                "nearby_live_count_log1p": _count(2.0),
                "nearby_port_count_log1p": _count(1.0),
            },
        ),
        (
            "inland_supported",
            {
                "land_distance_to_settlement_steps_log1p": _steps(1.0),
                "settlement_proximity": 0.60,
                "maritime_access": 0.05,
                "nearby_live_count_log1p": _count(2.0),
                "nearby_same_owner_count_log1p": 0.0,
            },
        ),
        (
            "isolated",
            {
                "land_distance_to_settlement_steps_log1p": _steps(6.0),
                "settlement_basin_gap_steps_log1p": _steps(5.0),
                "settlement_proximity": 0.05,
                "maritime_access": 0.0,
                "frontier_score": 0.05,
                "nearby_live_count_log1p": 0.0,
                "nearby_same_owner_count_log1p": 0.0,
                "nearby_other_owner_count_log1p": 0.0,
                "nearby_port_count_log1p": 0.0,
                "nearby_ruin_count_log1p": _count(1.0),
            },
        ),
        (
            "forest_pressured",
            {
                "forest_density": 0.90,
                "settlement_proximity": 0.20,
                "frontier_score": 0.15,
                "nearby_live_count_log1p": _count(1.0),
            },
        ),
    )
    return (
        tuple(name for name, _ in probe_specs),
        np.stack(
            [
                _vector(feature_names, defaults=defaults, overrides=overrides)
                for _, overrides in probe_specs
            ],
            axis=0,
        ).astype(np.float64),
    )


def build_canonical_pairwise_probes(
    feature_names: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    defaults = {
        "same_owner": 0.0,
        "src_has_port": 0.0,
        "dst_has_port": 0.0,
        "maritime_pair": 0.0,
        "land_distance_log1p": _steps(2.0),
        "land_distance_unreachable": 0.0,
        "sea_distance_log1p": 0.0,
        "sea_distance_unreachable": 1.0,
        "src_population_asinh": _mark(1.4),
        "src_food_asinh": _mark(0.7),
        "src_wealth_asinh": _mark(0.25),
        "src_defense_asinh": _mark(0.45),
        "dst_population_asinh": _mark(1.2),
        "dst_food_asinh": _mark(0.65),
        "dst_wealth_asinh": _mark(0.2),
        "dst_defense_asinh": _mark(0.4),
    }
    probe_specs = (
        ("land_rival", {}),
        ("land_same_owner", {"same_owner": 1.0}),
        (
            "maritime_rival",
            {
                "src_has_port": 1.0,
                "dst_has_port": 1.0,
                "maritime_pair": 1.0,
                "land_distance_log1p": 0.0,
                "land_distance_unreachable": 1.0,
                "sea_distance_log1p": _steps(4.0),
                "sea_distance_unreachable": 0.0,
                "src_population_asinh": _mark(3.0),
                "src_food_asinh": _mark(0.85),
                "src_wealth_asinh": _mark(0.75),
                "src_defense_asinh": _mark(0.75),
                "dst_population_asinh": _mark(2.7),
                "dst_food_asinh": _mark(0.8),
                "dst_wealth_asinh": _mark(0.7),
                "dst_defense_asinh": _mark(0.65),
            },
        ),
        (
            "maritime_same_owner",
            {
                "same_owner": 1.0,
                "src_has_port": 1.0,
                "dst_has_port": 1.0,
                "maritime_pair": 1.0,
                "land_distance_log1p": 0.0,
                "land_distance_unreachable": 1.0,
                "sea_distance_log1p": _steps(4.0),
                "sea_distance_unreachable": 0.0,
                "src_population_asinh": _mark(2.6),
                "src_food_asinh": _mark(0.78),
                "src_wealth_asinh": _mark(0.65),
                "src_defense_asinh": _mark(0.65),
                "dst_population_asinh": _mark(2.4),
                "dst_food_asinh": _mark(0.75),
                "dst_wealth_asinh": _mark(0.6),
                "dst_defense_asinh": _mark(0.6),
            },
        ),
        (
            "strong_rival_pressure",
            {
                "src_has_port": 1.0,
                "land_distance_log1p": _steps(1.0),
                "src_population_asinh": _mark(4.5),
                "src_food_asinh": _mark(0.9),
                "src_wealth_asinh": _mark(0.8),
                "src_defense_asinh": _mark(0.8),
                "dst_population_asinh": _mark(0.35),
                "dst_food_asinh": _mark(0.08),
                "dst_wealth_asinh": _mark(0.02),
                "dst_defense_asinh": _mark(0.08),
            },
        ),
    )
    return (
        tuple(name for name, _ in probe_specs),
        np.stack(
            [
                _vector(feature_names, defaults=defaults, overrides=overrides)
                for _, overrides in probe_specs
            ],
            axis=0,
        ).astype(np.float64),
    )


def build_canonical_owner_probes(
    feature_names: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    defaults = {
        "settlement_count_log1p": _count(5.0),
        "port_count_log1p": _count(1.0),
        "coastal_share": 0.40,
        "frontier_share": 0.35,
        "total_population_asinh": _mark(8.0),
        "total_food_asinh": _mark(8.0),
        "total_wealth_asinh": _mark(0.4),
        "total_defense_asinh": _mark(6.0),
        "mean_frontier_score": 0.35,
        "mean_maritime_access": 0.45,
        "mean_settlement_proximity": 0.55,
    }
    probe_specs = (
        (
            "small_frontier_owner",
            {
                "settlement_count_log1p": _count(2.0),
                "port_count_log1p": 0.0,
                "coastal_share": 0.20,
                "frontier_share": 0.80,
                "total_population_asinh": _mark(2.0),
                "total_food_asinh": _mark(1.5),
                "total_wealth_asinh": _mark(0.08),
                "total_defense_asinh": _mark(1.5),
                "mean_frontier_score": 0.80,
                "mean_maritime_access": 0.20,
                "mean_settlement_proximity": 0.25,
            },
        ),
        (
            "large_maritime_owner",
            {
                "settlement_count_log1p": _count(12.0),
                "port_count_log1p": _count(5.0),
                "coastal_share": 0.75,
                "frontier_share": 0.30,
                "total_population_asinh": _mark(40.0),
                "total_food_asinh": _mark(20.0),
                "total_wealth_asinh": _mark(1.0),
                "total_defense_asinh": _mark(18.0),
                "mean_frontier_score": 0.35,
                "mean_maritime_access": 0.95,
                "mean_settlement_proximity": 0.75,
            },
        ),
        (
            "inland_owner",
            {
                "settlement_count_log1p": _count(6.0),
                "port_count_log1p": 0.0,
                "coastal_share": 0.05,
                "frontier_share": 0.45,
                "total_population_asinh": _mark(8.0),
                "total_food_asinh": _mark(6.0),
                "total_wealth_asinh": _mark(0.2),
                "total_defense_asinh": _mark(5.0),
                "mean_frontier_score": 0.40,
                "mean_maritime_access": 0.05,
                "mean_settlement_proximity": 0.50,
            },
        ),
        (
            "port_heavy_owner",
            {
                "settlement_count_log1p": _count(8.0),
                "port_count_log1p": _count(6.0),
                "coastal_share": 0.85,
                "frontier_share": 0.25,
                "total_population_asinh": _mark(18.0),
                "total_food_asinh": _mark(12.0),
                "total_wealth_asinh": _mark(1.4),
                "total_defense_asinh": _mark(10.0),
                "mean_frontier_score": 0.25,
                "mean_maritime_access": 0.98,
                "mean_settlement_proximity": 0.80,
            },
        ),
    )
    return (
        tuple(name for name, _ in probe_specs),
        np.stack(
            [
                _vector(feature_names, defaults=defaults, overrides=overrides)
                for _, overrides in probe_specs
            ],
            axis=0,
        ).astype(np.float64),
    )


__all__ = [
    "build_canonical_live_probes",
    "build_canonical_owner_probes",
    "build_canonical_pairwise_probes",
    "build_canonical_ruin_probes",
    "build_canonical_site_probes",
]
