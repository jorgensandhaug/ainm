from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import polars as pl

from astar.core.terrain import collapse_internal_grid
from astar.core.world_state import SettlementFullState
from astar.viz.base import categorical_cmap


def _scatter_settlements(
    axis: plt.Axes,
    settlements: tuple[SettlementFullState, ...] | list[SettlementFullState],
    *,
    facecolor: str,
    edgecolor: str,
) -> None:
    for settlement in settlements:
        marker = "s" if settlement.has_port else "o"
        axis.scatter(
            settlement.x,
            settlement.y,
            c=facecolor,
            marker=marker,
            s=36,
            linewidths=0.6,
            edgecolors=edgecolor,
        )


def _highlight_points(
    axis: plt.Axes,
    points: list[tuple[int, int]] | None,
) -> None:
    if not points:
        return
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    axis.scatter(
        xs,
        ys,
        marker="o",
        s=110,
        facecolors="none",
        edgecolors="#ef4444",
        linewidths=1.6,
    )


def plot_replay_transition(
    previous_grid: np.ndarray,
    current_grid: np.ndarray,
    previous_settlements: tuple[SettlementFullState, ...],
    current_settlements: tuple[SettlementFullState, ...],
    output_path: Path,
    *,
    title: str,
    focus_points: list[tuple[int, int]] | None = None,
) -> Path:
    previous_collapsed = collapse_internal_grid(previous_grid)
    current_collapsed = collapse_internal_grid(current_grid)
    changed_mask = previous_grid != current_grid
    changed_y, changed_x = np.nonzero(changed_mask)

    figure, axes = plt.subplots(1, 3, figsize=(12, 4.5))
    for axis, grid, settlements, panel_title, facecolor in (
        (axes[0], previous_collapsed, previous_settlements, "step t", "black"),
        (axes[1], current_collapsed, current_settlements, "step t+1", "white"),
    ):
        axis.imshow(grid, cmap=categorical_cmap(), vmin=0, vmax=5)
        _highlight_points(axis, focus_points)
        _scatter_settlements(axis, settlements, facecolor=facecolor, edgecolor="black")
        axis.set_title(panel_title)
        axis.set_xlabel("x")
        axis.set_ylabel("y")

    axes[2].imshow(current_collapsed, cmap=categorical_cmap(), vmin=0, vmax=5)
    if changed_x.size > 0:
        axes[2].scatter(
            changed_x,
            changed_y,
            marker="s",
            s=70,
            facecolors="none",
            edgecolors="#facc15",
            linewidths=1.1,
        )
    _highlight_points(axes[2], focus_points)
    _scatter_settlements(axes[2], current_settlements, facecolor="white", edgecolor="black")
    axes[2].set_title(f"changed cells ({int(changed_mask.sum())})")
    axes[2].set_xlabel("x")
    axes[2].set_ylabel("y")

    figure.suptitle(title)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_replay_mismatch_timeline(
    mismatch_rows: pl.DataFrame,
    output_path: Path,
    *,
    total_steps: int,
) -> Path:
    step_count = max(1, total_steps)
    steps = np.arange(step_count, dtype=np.int64)
    mismatch_kinds = ("ruin_without_collapse", "rebuild_without_settlement")
    count_series: dict[str, np.ndarray] = {}
    for mismatch_kind in mismatch_kinds:
        counts = {
            int(row["step"]): int(row["count"])
            for row in mismatch_rows.filter(pl.col("mismatch_kind") == mismatch_kind)
            .group_by("step")
            .len(name="count")
            .iter_rows(named=True)
        }
        count_series[mismatch_kind] = np.asarray(
            [counts.get(int(step), 0) for step in steps],
            dtype=np.int64,
        )

    figure, axis = plt.subplots(figsize=(8, 3.8))
    axis.plot(
        steps,
        count_series["ruin_without_collapse"],
        marker="o",
        linewidth=1.5,
        label="ruin without collapse",
    )
    axis.plot(
        steps,
        count_series["rebuild_without_settlement"],
        marker="s",
        linewidth=1.5,
        label="rebuild without settlement",
    )
    axis.set_title("Replay mismatch timeline")
    axis.set_xlabel("step")
    axis.set_ylabel("count")
    axis.legend()
    axis.grid(alpha=0.25)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_replay_change_timeline(
    cell_events: pl.DataFrame,
    settlement_transitions: pl.DataFrame,
    output_path: Path,
) -> Path:
    cell_counts = {
        int(row["step"]): int(row["count"])
        for row in cell_events.group_by("step").len(name="count").iter_rows(named=True)
    }
    settlement_changed = settlement_transitions.filter(pl.col("changed"))
    settlement_counts = {
        int(row["step"]): int(row["count"])
        for row in settlement_changed.group_by("step").len(name="count").iter_rows(named=True)
    }
    max_step = max(cell_counts.keys() | settlement_counts.keys(), default=0)
    steps = np.arange(max_step + 1, dtype=np.int64)
    cell_series = np.asarray([cell_counts.get(int(step), 0) for step in steps], dtype=np.int64)
    settlement_series = np.asarray(
        [settlement_counts.get(int(step), 0) for step in steps],
        dtype=np.int64,
    )

    figure, axis = plt.subplots(figsize=(8, 3.8))
    axis.plot(steps, cell_series, marker="o", linewidth=1.5, label="cell changes")
    axis.plot(
        steps,
        settlement_series,
        marker="s",
        linewidth=1.5,
        label="settlement transitions",
    )
    axis.set_title("Replay change timeline")
    axis.set_xlabel("step")
    axis.set_ylabel("count")
    axis.legend()
    axis.grid(alpha=0.25)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path

__all__ = [
    "plot_replay_change_timeline",
    "plot_replay_mismatch_timeline",
    "plot_replay_transition",
]
