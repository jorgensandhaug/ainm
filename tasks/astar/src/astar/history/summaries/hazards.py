from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.features.geometry import RoundFeatureBundle
from astar.history.replay.frame_stats import ReplaySeedAggregate


def _hazard_from_first_steps(first_steps: np.ndarray, horizon: int) -> np.ndarray:
    run_count = float(max(1, first_steps.shape[0]))
    hazards = np.zeros((horizon, *first_steps.shape[1:]), dtype=np.float64)
    remaining = np.full(first_steps.shape[1:], run_count, dtype=np.float64)
    for step in range(horizon):
        hit_count = np.sum(first_steps == step, axis=0, dtype=np.int64).astype(np.float64)
        valid = remaining > 0.0
        denominator = np.where(valid, remaining, 1.0)
        hazards[step] = np.where(valid, hit_count / denominator, 0.0)
        remaining = np.where(valid, remaining - hit_count, remaining)
    return hazards


def _collect_first_steps(runs: list[ReplayRun], codes: tuple[int, ...]) -> np.ndarray:
    if not runs:
        raise ValueError("cannot collect first steps for empty replay list")
    height, width = runs[0].frames[0].grid.shape
    stacks: list[np.ndarray] = []
    for run in runs:
        first_steps = np.full((height, width), -1, dtype=np.int64)
        for frame_index, frame in enumerate(run.frames):
            mask = np.isin(frame.grid, codes)
            first_steps[(first_steps < 0) & mask] = frame_index
        stacks.append(first_steps)
    return np.stack(stacks, axis=0)


def _mean_over_mask(values: np.ndarray, mask: np.ndarray) -> float:
    selected = values[mask]
    if selected.size == 0:
        return 0.0
    return float(np.mean(selected))


class ReplayHazardSeedSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    build_hazard_by_step: np.ndarray
    port_hazard_by_step: np.ndarray
    ruin_hazard_by_step: np.ndarray
    build_hit_rate: np.ndarray
    port_hit_rate: np.ndarray
    ruin_hit_rate: np.ndarray
    built_hit_rate_mean: float = Field(ge=0.0)
    coastal_built_hit_rate_mean: float = Field(ge=0.0)
    inland_built_hit_rate_mean: float = Field(ge=0.0)
    port_hit_rate_mean: float = Field(ge=0.0)
    ruin_hit_rate_mean: float = Field(ge=0.0)
    owner_flip_mean: float = Field(ge=0.0)
    coefficient_vector: np.ndarray


class ReplayHazardRoundSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    replay_seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    seed_summaries: list[ReplayHazardSeedSummary]
    mean_alive_curve: np.ndarray
    mean_port_curve: np.ndarray
    mean_ruin_curve: np.ndarray
    coefficient_matrix: np.ndarray
    coefficient_mean: np.ndarray


def build_seed_hazard_summary(
    runs: list[ReplayRun],
    aggregate: ReplaySeedAggregate,
    round_features: RoundFeatureBundle,
) -> ReplayHazardSeedSummary:
    seed_features = round_features.per_seed[aggregate.seed_index]
    buildable_mask = seed_features.feature("buildable") > 0.5
    coast_mask = seed_features.feature("coast") > 0.5
    inland_mask = buildable_mask & ~coast_mask

    build_hit_rate = (aggregate.first_built_step >= 0).astype(np.float64)
    port_hit_rate = (aggregate.first_port_step >= 0).astype(np.float64)
    ruin_hit_rate = (aggregate.first_ruin_step >= 0).astype(np.float64)

    horizon = len(aggregate.survival_curve_mean)
    build_hazard = _hazard_from_first_steps(_collect_first_steps(runs, (1, 2, 3)), horizon=horizon)
    port_hazard = _hazard_from_first_steps(_collect_first_steps(runs, (2,)), horizon=horizon)
    ruin_hazard = _hazard_from_first_steps(_collect_first_steps(runs, (3,)), horizon=horizon)

    built_hit_rate_mean = _mean_over_mask(build_hit_rate, buildable_mask)
    coastal_built_hit_rate_mean = _mean_over_mask(build_hit_rate, coast_mask)
    inland_built_hit_rate_mean = _mean_over_mask(build_hit_rate, inland_mask)
    port_hit_rate_mean = _mean_over_mask(port_hit_rate, buildable_mask)
    ruin_hit_rate_mean = _mean_over_mask(ruin_hit_rate, buildable_mask)
    owner_flip_mean = _mean_over_mask(
        aggregate.owner_flip_counts.astype(np.float64), buildable_mask
    )

    coefficient_vector = np.asarray(
        [
            built_hit_rate_mean,
            coastal_built_hit_rate_mean,
            inland_built_hit_rate_mean,
            port_hit_rate_mean,
            ruin_hit_rate_mean,
            owner_flip_mean,
            float(np.mean(aggregate.mean_terminal_probs[:, :, 1])),
            float(np.mean(aggregate.mean_terminal_probs[:, :, 2])),
            float(np.mean(aggregate.mean_terminal_probs[:, :, 3])),
            float(np.mean(aggregate.survival_curve_mean)),
            float(np.mean(aggregate.port_curve_mean)),
            float(np.mean(aggregate.ruin_curve_mean)),
        ],
        dtype=np.float64,
    )

    return ReplayHazardSeedSummary(
        round_id=aggregate.round_id,
        seed_index=aggregate.seed_index,
        replay_run_count=aggregate.replay_run_count,
        build_hazard_by_step=build_hazard,
        port_hazard_by_step=port_hazard,
        ruin_hazard_by_step=ruin_hazard,
        build_hit_rate=build_hit_rate,
        port_hit_rate=port_hit_rate,
        ruin_hit_rate=ruin_hit_rate,
        built_hit_rate_mean=built_hit_rate_mean,
        coastal_built_hit_rate_mean=coastal_built_hit_rate_mean,
        inland_built_hit_rate_mean=inland_built_hit_rate_mean,
        port_hit_rate_mean=port_hit_rate_mean,
        ruin_hit_rate_mean=ruin_hit_rate_mean,
        owner_flip_mean=owner_flip_mean,
        coefficient_vector=coefficient_vector,
    )


def build_round_hazard_summary(
    round_id: str,
    round_number: int,
    runs_by_seed: dict[int, list[ReplayRun]],
    aggregates: list[ReplaySeedAggregate],
    round_features: RoundFeatureBundle,
) -> ReplayHazardRoundSummary:
    if not aggregates:
        raise ValueError("cannot build round hazard summary without replay aggregates")

    seed_summaries = [
        build_seed_hazard_summary(runs_by_seed[aggregate.seed_index], aggregate, round_features)
        for aggregate in sorted(aggregates, key=lambda item: item.seed_index)
    ]
    coefficient_matrix = np.stack(
        [summary.coefficient_vector for summary in seed_summaries],
        axis=0,
    )
    return ReplayHazardRoundSummary(
        round_id=round_id,
        round_number=round_number,
        replay_seed_count=len(seed_summaries),
        replay_run_count=sum(summary.replay_run_count for summary in seed_summaries),
        seed_summaries=seed_summaries,
        mean_alive_curve=np.mean(
            np.stack([item.survival_curve_mean for item in aggregates], axis=0),
            axis=0,
        ),
        mean_port_curve=np.mean(
            np.stack([item.port_curve_mean for item in aggregates], axis=0),
            axis=0,
        ),
        mean_ruin_curve=np.mean(
            np.stack([item.ruin_curve_mean for item in aggregates], axis=0),
            axis=0,
        ),
        coefficient_matrix=coefficient_matrix,
        coefficient_mean=np.mean(coefficient_matrix, axis=0),
    )
