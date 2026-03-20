from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from numpy.typing import NDArray

from astar.domain.terrain import CLASS_COLORS, collapse_internal_grid


def _base_cmap() -> ListedColormap:
    return ListedColormap(list(CLASS_COLORS))


def plot_initial_state(
    initial_grid: NDArray[np.int_],
    settlements: list[tuple[int, int, bool]],
    output_path: Path,
) -> Path:
    collapsed = collapse_internal_grid(initial_grid)
    figure, axis = plt.subplots(figsize=(5, 5))
    image = axis.imshow(collapsed, cmap=_base_cmap(), vmin=0, vmax=5)
    for x, y, has_port in settlements:
        marker = "s" if has_port else "o"
        axis.scatter(x, y, c="black", marker=marker, s=40, linewidths=0.5, edgecolors="white")
    axis.set_title("Initial map")
    axis.set_xlabel("x")
    axis.set_ylabel("y")
    figure.colorbar(image, ax=axis, ticks=list(range(6)), label="class")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_argmax_prediction(prediction: NDArray[np.float64], output_path: Path) -> Path:
    argmax_grid = prediction.argmax(axis=-1)
    confidence = prediction.max(axis=-1)

    figure, axes = plt.subplots(1, 2, figsize=(10, 4.5))
    image = axes[0].imshow(argmax_grid, cmap=_base_cmap(), vmin=0, vmax=5)
    axes[0].set_title("Baseline argmax")
    axes[0].set_xlabel("x")
    axes[0].set_ylabel("y")
    figure.colorbar(image, ax=axes[0], ticks=list(range(6)))

    conf = axes[1].imshow(confidence, cmap="viridis", vmin=0.0, vmax=1.0)
    axes[1].set_title("Baseline confidence")
    axes[1].set_xlabel("x")
    axes[1].set_ylabel("y")
    figure.colorbar(conf, ax=axes[1])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path
