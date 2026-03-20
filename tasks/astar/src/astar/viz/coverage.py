from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

from astar.core.grid import MapShape, Viewport, coverage_counts


def plot_query_coverage(map_shape: MapShape, viewports: list[Viewport], output_path: Path) -> Path:
    coverage = coverage_counts(map_shape, viewports)
    figure, axis = plt.subplots(figsize=(5, 5))
    image = axis.imshow(coverage, cmap="magma")
    for viewport in viewports:
        rectangle = Rectangle(
            (viewport.x - 0.5, viewport.y - 0.5),
            viewport.w,
            viewport.h,
            fill=False,
            edgecolor="white",
            linewidth=1.0,
            alpha=0.7,
        )
        axis.add_patch(rectangle)
    axis.set_title("Query coverage")
    axis.set_xlabel("x")
    axis.set_ylabel("y")
    figure.colorbar(image, ax=axis)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path
