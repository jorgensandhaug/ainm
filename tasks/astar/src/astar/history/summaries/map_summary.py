from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.teacher.decoder.base import SeedLike

from .round_coefficients import seed_feature_dict


def seed_map_summary_names() -> list[str]:
    names = [f"initial_class_mass_{class_index}" for class_index in range(CLASS_COUNT)]
    names.extend(
        [
            "buildable_mean",
            "coast_mean",
            "frontier_mean",
            "settlement_proximity_mean",
            "coastal_exposure_mean",
            "maritime_access_mean",
            "forest_density_mean",
            "mountain_density_mean",
            "settlement_count",
            "port_count",
        ],
    )
    return names


def seed_map_summary_vector(seed: SeedLike) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(seed.initial_state.grid, dtype=np.int64))
    class_mass = np.bincount(
        collapsed.reshape(-1),
        minlength=CLASS_COUNT,
    ).astype(np.float64)
    class_mass = class_mass / float(np.sum(class_mass))
    feature_dict = seed_feature_dict(seed.initial_state)
    settlements = tuple(seed.initial_state.settlements)
    port_count = sum(1 for item in settlements if item.has_port)
    return np.asarray(
        [
            *class_mass.tolist(),
            float(np.mean(feature_dict["buildable"])),
            float(np.mean(feature_dict["coast"])),
            float(np.mean(feature_dict["frontier_score"])),
            float(np.mean(feature_dict["settlement_proximity"])),
            float(np.mean(feature_dict["coastal_exposure"])),
            float(np.mean(feature_dict["maritime_access"])),
            float(np.mean(feature_dict["forest_density"])),
            float(np.mean(feature_dict["mountain_density"])),
            float(len(settlements)),
            float(port_count),
        ],
        dtype=np.float64,
    )


def round_map_summary_names() -> list[str]:
    per_seed_names = seed_map_summary_names()
    names = [f"map_mean__{name}" for name in per_seed_names]
    names.extend(f"map_std__{name}" for name in per_seed_names)
    return names


def round_map_summary_vector(seeds: Sequence[SeedLike]) -> np.ndarray:
    seed_vectors = np.stack([seed_map_summary_vector(seed) for seed in seeds], axis=0)
    return np.concatenate(
        [
            np.mean(seed_vectors, axis=0),
            np.std(seed_vectors, axis=0),
        ],
        axis=0,
    ).astype(np.float64)


__all__ = [
    "round_map_summary_names",
    "round_map_summary_vector",
    "seed_map_summary_names",
    "seed_map_summary_vector",
]
