from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.world_state import InitialWorldState
from astar.features.geometry import compute_static_feature_dict
from astar.history.episodes.models import RoundEpisode, SeedEpisode
from astar.infra.api.dto import InitialSettlement


def _collect_first_steps(seed: SeedEpisode, codes: tuple[int, ...]) -> np.ndarray:
    if not seed.replay_runs:
        raise ValueError(f"seed {seed.seed_index} has no replay runs")
    height, width = seed.replay_runs[0].frames[0].grid.shape
    first_steps = np.full((len(seed.replay_runs), height, width), -1, dtype=np.int64)
    for run_index, run in enumerate(seed.replay_runs):
        for frame_index, frame in enumerate(run.frames):
            mask = np.isin(frame.grid, codes)
            first_steps[run_index][(first_steps[run_index] < 0) & mask] = frame_index
    return first_steps


def _owner_flip_counts(seed: SeedEpisode) -> np.ndarray:
    if not seed.replay_runs:
        raise ValueError(f"seed {seed.seed_index} has no replay runs")
    height, width = seed.replay_runs[0].frames[0].grid.shape
    counts = np.zeros((len(seed.replay_runs), height, width), dtype=np.int64)
    for run_index, run in enumerate(seed.replay_runs):
        previous = np.full((height, width), -1, dtype=np.int64)
        for frame in run.frames:
            current = np.full((height, width), -1, dtype=np.int64)
            for settlement in frame.settlements:
                if settlement.owner_id is not None:
                    current[settlement.y, settlement.x] = settlement.owner_id
            counts[run_index] += ((previous >= 0) & (current >= 0) & (previous != current)).astype(
                np.int64
            )
            previous = current
    return counts


def _mean_over_mask(values: np.ndarray, mask: np.ndarray) -> float:
    selected = values[mask]
    if selected.size == 0:
        return 0.0
    return float(np.mean(selected))


def _clip_probabilities(values: np.ndarray) -> np.ndarray:
    return np.asarray(np.clip(values, 1e-4, 1.0 - 1e-4), dtype=np.float64)


def _logit(values: np.ndarray) -> np.ndarray:
    clipped = _clip_probabilities(values)
    return np.asarray(np.log(clipped / (1.0 - clipped)), dtype=np.float64)


def _fit_ridge_logit(
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[float, np.ndarray]:
    design = np.concatenate(
        [np.ones((feature_matrix.shape[0], 1), dtype=np.float64), feature_matrix],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ _logit(target)
    solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0]), np.asarray(solution[1:], dtype=np.float64)


def seed_feature_names() -> list[str]:
    return [
        "buildable",
        "land",
        "coast",
        "coast_distance_steps_log1p",
        "coast_distance_unreachable",
        "land_distance_to_settlement_steps_log1p",
        "land_distance_to_settlement_unreachable",
        "sea_distance_to_port_steps_log1p",
        "sea_distance_to_port_unreachable",
        "settlement_basin_gap_steps_log1p",
        "settlement_basin_gap_unreachable",
        "coast_distance_decay_4",
        "land_distance_to_settlement_decay_4",
        "sea_distance_to_port_decay_4",
        "settlement_basin_gap_decay_4",
        "forest_density",
        "mountain_density",
        "coastal_exposure",
        "maritime_access",
        "frontier_score",
        "settlement_proximity",
        "initial_forest",
        "initial_mountain",
        "initial_ocean",
    ]


def seed_feature_dict(initial_state: InitialWorldState) -> dict[str, np.ndarray]:
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

    features = compute_static_feature_dict(grid, settlements)
    features.update(
        {
            "initial_forest": (grid == 4).astype(np.float64),
            "initial_mountain": (grid == 5).astype(np.float64),
            "initial_ocean": (grid == 10).astype(np.float64),
        }
    )
    return features


def seed_feature_matrix(initial_state: InitialWorldState) -> tuple[list[str], np.ndarray]:
    features = seed_feature_dict(initial_state)
    names = seed_feature_names()
    stack = np.stack([features[name] for name in names], axis=0).astype(np.float64)
    return names, stack


def seed_empirical_terminal_probs(seed: SeedEpisode) -> np.ndarray | None:
    if seed.terminal_truth is not None:
        return seed.terminal_truth.probs
    if not seed.replay_runs:
        return None
    height, width = seed.replay_runs[0].frames[-1].grid.shape
    counts = np.zeros((height, width, 6), dtype=np.float64)
    from astar.core.terrain import collapse_internal_grid

    for run in seed.replay_runs:
        collapsed = collapse_internal_grid(run.frames[-1].grid)
        for class_index in range(6):
            counts[:, :, class_index] += collapsed == class_index
    return counts / float(len(seed.replay_runs))


def seed_regime_summary_vector(seed: SeedEpisode) -> np.ndarray | None:
    empirical = seed_empirical_terminal_probs(seed)
    if empirical is None or not seed.replay_runs:
        return None
    features = seed_feature_dict(seed.initial_state)
    buildable = features["buildable"] > 0.5
    coast = features["coast"] > 0.5
    inland = buildable & ~coast

    build_hit_rate = np.mean(_collect_first_steps(seed, (1, 2, 3)) >= 0, axis=0)
    port_hit_rate = np.mean(_collect_first_steps(seed, (2,)) >= 0, axis=0)
    ruin_hit_rate = np.mean(_collect_first_steps(seed, (3,)) >= 0, axis=0)
    owner_flip_mean = np.mean(_owner_flip_counts(seed).astype(np.float64), axis=0)

    return np.asarray(
        [
            _mean_over_mask(build_hit_rate, buildable),
            _mean_over_mask(build_hit_rate, coast),
            _mean_over_mask(build_hit_rate, inland),
            _mean_over_mask(port_hit_rate, buildable),
            _mean_over_mask(ruin_hit_rate, buildable),
            _mean_over_mask(owner_flip_mean, buildable),
            float(np.mean(empirical[:, :, 1])),
            float(np.mean(empirical[:, :, 2])),
            float(np.mean(empirical[:, :, 3])),
            float(np.mean(empirical[:, :, 1] + empirical[:, :, 2])),
            float(np.mean(empirical[:, :, 2])),
            float(np.mean(empirical[:, :, 3])),
        ],
        dtype=np.float64,
    )


def round_regime_summary_vector(episode: RoundEpisode) -> np.ndarray:
    vectors = [
        vector for seed in episode.seeds if (vector := seed_regime_summary_vector(seed)) is not None
    ]
    if not vectors:
        return np.zeros(12, dtype=np.float64)
    return np.asarray(np.mean(np.stack(vectors, axis=0), axis=0), dtype=np.float64)


class RoundSemimechanisticCoefficients(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    feature_names: list[str]
    regime_vector: np.ndarray
    build_intercept: float
    build_coef: np.ndarray
    port_intercept: float
    port_coef: np.ndarray
    ruin_intercept: float
    ruin_coef: np.ndarray
    sample_count: int = Field(ge=0)

    def combined_vector(self) -> np.ndarray:
        return np.concatenate(
            [
                np.asarray([self.build_intercept], dtype=np.float64),
                self.build_coef.astype(np.float64),
                np.asarray([self.port_intercept], dtype=np.float64),
                self.port_coef.astype(np.float64),
                np.asarray([self.ruin_intercept], dtype=np.float64),
                self.ruin_coef.astype(np.float64),
            ],
            axis=0,
        )


def fit_round_semimechanistic_coefficients(
    episode: RoundEpisode,
    *,
    ridge_alpha: float = 1e-2,
) -> RoundSemimechanisticCoefficients:
    feature_names = seed_feature_names()
    feature_rows: list[np.ndarray] = []
    build_targets: list[np.ndarray] = []
    port_targets: list[np.ndarray] = []
    ruin_targets: list[np.ndarray] = []

    for seed in episode.seeds:
        empirical = seed_empirical_terminal_probs(seed)
        if empirical is None:
            continue
        _, feature_stack = seed_feature_matrix(seed.initial_state)
        feature_rows.append(feature_stack.reshape(feature_stack.shape[0], -1).T)
        build_targets.append(
            np.asarray(
                empirical[:, :, 1] + empirical[:, :, 2] + empirical[:, :, 3],
                dtype=np.float64,
            ).reshape(-1),
        )
        port_targets.append(np.asarray(empirical[:, :, 2], dtype=np.float64).reshape(-1))
        ruin_targets.append(np.asarray(empirical[:, :, 3], dtype=np.float64).reshape(-1))

    if not feature_rows:
        raise ValueError(
            f"round {episode.metadata.round_id} has no replay-backed terminal targets",
        )

    design_matrix = np.concatenate(feature_rows, axis=0)
    build_target = np.concatenate(build_targets, axis=0)
    port_target = np.concatenate(port_targets, axis=0)
    ruin_target = np.concatenate(ruin_targets, axis=0)
    build_intercept, build_coef = _fit_ridge_logit(
        design_matrix,
        build_target,
        ridge_alpha=ridge_alpha,
    )
    port_intercept, port_coef = _fit_ridge_logit(
        design_matrix,
        port_target,
        ridge_alpha=ridge_alpha,
    )
    ruin_intercept, ruin_coef = _fit_ridge_logit(
        design_matrix,
        ruin_target,
        ridge_alpha=ridge_alpha,
    )

    return RoundSemimechanisticCoefficients(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        feature_names=feature_names,
        regime_vector=round_regime_summary_vector(episode),
        build_intercept=build_intercept,
        build_coef=build_coef,
        port_intercept=port_intercept,
        port_coef=port_coef,
        ruin_intercept=ruin_intercept,
        ruin_coef=ruin_coef,
        sample_count=int(design_matrix.shape[0]),
    )


__all__ = [
    "RoundSemimechanisticCoefficients",
    "fit_round_semimechanistic_coefficients",
    "round_regime_summary_vector",
    "seed_empirical_terminal_probs",
    "seed_feature_dict",
    "seed_feature_matrix",
    "seed_feature_names",
]
