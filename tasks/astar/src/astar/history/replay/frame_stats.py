from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import ReplayRun
from astar.core.types import FloatArray, IntArray


class ReplayRunFrameStats(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    replay_run_id: str
    round_id: str
    seed_index: int = Field(ge=0)
    frame_count: int = Field(ge=1)
    settlement_counts_by_step: IntArray
    alive_counts_by_step: IntArray
    port_counts_by_step: IntArray
    ruin_cell_counts_by_step: IntArray
    forest_cell_counts_by_step: IntArray
    terminal_class_histogram: IntArray


def summarize_replay_run(run: ReplayRun) -> ReplayRunFrameStats:
    settlement_counts: list[int] = []
    alive_counts: list[int] = []
    port_counts: list[int] = []
    ruin_counts: list[int] = []
    forest_counts: list[int] = []

    for frame in run.frames:
        settlement_counts.append(len(frame.settlements))
        alive_counts.append(sum(1 for settlement in frame.settlements if settlement.alive))
        port_counts.append(sum(1 for settlement in frame.settlements if settlement.has_port))
        ruin_counts.append(int(np.count_nonzero(frame.grid == 3)))
        forest_counts.append(int(np.count_nonzero(frame.grid == 4)))

    terminal_grid = collapse_internal_grid(run.frames[-1].grid)
    terminal_histogram = np.bincount(
        terminal_grid.reshape(-1),
        minlength=CLASS_COUNT,
    ).astype(np.int64)

    return ReplayRunFrameStats(
        replay_run_id=run.replay_run_id,
        round_id=run.round_id,
        seed_index=run.seed_index,
        frame_count=len(run.frames),
        settlement_counts_by_step=np.asarray(settlement_counts, dtype=np.int64),
        alive_counts_by_step=np.asarray(alive_counts, dtype=np.int64),
        port_counts_by_step=np.asarray(port_counts, dtype=np.int64),
        ruin_cell_counts_by_step=np.asarray(ruin_counts, dtype=np.int64),
        forest_cell_counts_by_step=np.asarray(forest_counts, dtype=np.int64),
        terminal_class_histogram=terminal_histogram,
    )


class ReplaySeedAggregate(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    mean_terminal_probs: FloatArray
    first_built_step: IntArray
    first_port_step: IntArray
    first_ruin_step: IntArray
    owner_flip_counts: IntArray
    survival_curve_mean: FloatArray
    port_curve_mean: FloatArray
    ruin_curve_mean: FloatArray


def _mean_first_hit_step(step_stack: np.ndarray) -> IntArray:
    observed_mask = step_stack >= 0
    observed_count = observed_mask.sum(axis=0)
    safe_stack = np.where(observed_mask, step_stack, 0)
    mean_step = np.full(step_stack.shape[1:], -1, dtype=np.int64)
    has_observation = observed_count > 0
    if np.any(has_observation):
        mean_values = (
            safe_stack.sum(axis=0, dtype=np.int64)[has_observation]
            / observed_count[has_observation]
        )
        mean_step[has_observation] = np.rint(mean_values).astype(np.int64)
    return mean_step


def summarize_replay_runs(runs: list[ReplayRun]) -> ReplaySeedAggregate:
    if not runs:
        raise ValueError("cannot summarize empty replay run list")

    first_run = runs[0]
    height, width = first_run.frames[0].grid.shape
    terminal_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    first_built_steps: list[IntArray] = []
    first_port_steps: list[IntArray] = []
    first_ruin_steps: list[IntArray] = []
    owner_flip_counts: list[IntArray] = []
    survival_curves: list[np.ndarray] = []
    port_curves: list[np.ndarray] = []
    ruin_curves: list[np.ndarray] = []

    for run in runs:
        if run.frames[0].grid.shape != (height, width):
            raise ValueError("all replay runs for one seed must share shape")

        terminal_grid = collapse_internal_grid(run.frames[-1].grid)
        for class_index in range(CLASS_COUNT):
            terminal_counts[:, :, class_index] += terminal_grid == class_index

        built_steps = np.full((height, width), -1, dtype=np.int64)
        port_steps = np.full((height, width), -1, dtype=np.int64)
        ruin_steps = np.full((height, width), -1, dtype=np.int64)
        owner_grid_prev = np.full((height, width), -1, dtype=np.int64)
        owner_flip_grid = np.zeros((height, width), dtype=np.int64)
        survival_curve = np.zeros(len(run.frames), dtype=np.float64)
        port_curve = np.zeros(len(run.frames), dtype=np.float64)
        ruin_curve = np.zeros(len(run.frames), dtype=np.float64)

        for frame_index, frame in enumerate(run.frames):
            built_mask = np.isin(frame.grid, (1, 2, 3))
            port_mask = frame.grid == 2
            ruin_mask = frame.grid == 3
            built_steps[(built_steps < 0) & built_mask] = frame_index
            port_steps[(port_steps < 0) & port_mask] = frame_index
            ruin_steps[(ruin_steps < 0) & ruin_mask] = frame_index

            owner_grid = np.full((height, width), -1, dtype=np.int64)
            for settlement in frame.settlements:
                if settlement.owner_id is not None:
                    owner_grid[settlement.y, settlement.x] = settlement.owner_id
            owner_flip_grid += (
                (owner_grid_prev >= 0) & (owner_grid >= 0) & (owner_grid_prev != owner_grid)
            ).astype(np.int64)
            owner_grid_prev = owner_grid

            survival_curve[frame_index] = sum(
                1.0 for settlement in frame.settlements if settlement.alive
            )
            port_curve[frame_index] = sum(
                1.0 for settlement in frame.settlements if settlement.has_port
            )
            ruin_curve[frame_index] = float(np.count_nonzero(ruin_mask))

        first_built_steps.append(built_steps)
        first_port_steps.append(port_steps)
        first_ruin_steps.append(ruin_steps)
        owner_flip_counts.append(owner_flip_grid)
        survival_curves.append(survival_curve)
        port_curves.append(port_curve)
        ruin_curves.append(ruin_curve)

    return ReplaySeedAggregate(
        round_id=first_run.round_id,
        seed_index=first_run.seed_index,
        replay_run_count=len(runs),
        mean_terminal_probs=terminal_counts / float(len(runs)),
        first_built_step=_mean_first_hit_step(np.stack(first_built_steps, axis=0)),
        first_port_step=_mean_first_hit_step(np.stack(first_port_steps, axis=0)),
        first_ruin_step=_mean_first_hit_step(np.stack(first_ruin_steps, axis=0)),
        owner_flip_counts=np.sum(np.stack(owner_flip_counts, axis=0), axis=0).astype(np.int64),
        survival_curve_mean=np.mean(np.stack(survival_curves, axis=0), axis=0),
        port_curve_mean=np.mean(np.stack(port_curves, axis=0), axis=0),
        ruin_curve_mean=np.mean(np.stack(ruin_curves, axis=0), axis=0),
    )
