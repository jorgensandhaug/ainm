from __future__ import annotations

from matplotlib.colors import LinearSegmentedColormap, ListedColormap

from astar.core.terrain import CLASS_COLORS


def categorical_cmap() -> ListedColormap:
    return ListedColormap(list(CLASS_COLORS))


def class_probability_cmap(class_color: str) -> LinearSegmentedColormap:
    return LinearSegmentedColormap.from_list(
        f"class_prob_{class_color.lstrip('#')}",
        ["#ffffff", class_color],
    )


__all__ = ["categorical_cmap", "class_probability_cmap"]
