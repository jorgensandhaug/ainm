from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import Normalize

from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COLORS, CLASS_NAMES
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.viz.base import class_probability_cmap


def _validate_categorical_tensor(tensor: np.ndarray) -> np.ndarray:
    array = np.asarray(tensor, dtype=np.float64)
    if array.ndim != 3:
        msg = f"expected 3D tensor, got shape {array.shape!r}"
        raise ValueError(msg)
    validate_prediction_tensor(
        array,
        SubmissionSpec(height=array.shape[0], width=array.shape[1], classes=array.shape[2]),
    )
    return array


def _style_axis(axis: plt.Axes, title: str) -> None:
    axis.set_title(title)
    axis.set_xlabel("x")
    axis.set_ylabel("y")


def plot_class_probability_atlas(
    tensor: np.ndarray,
    output_path: Path,
    *,
    source_name: str,
    class_names: tuple[str, ...] = CLASS_NAMES,
    class_colors: tuple[str, ...] = CLASS_COLORS,
) -> Path:
    array = _validate_categorical_tensor(tensor)
    class_count = array.shape[2]
    columns = 2
    rows = int(np.ceil(class_count / columns))
    figure, axes = plt.subplots(rows, columns, figsize=(9, 4.2 * rows), squeeze=False)

    for class_index in range(rows * columns):
        axis = axes[class_index // columns][class_index % columns]
        if class_index >= class_count:
            axis.axis("off")
            continue
        image = axis.imshow(
            array[:, :, class_index],
            cmap=class_probability_cmap(class_colors[class_index]),
            vmin=0.0,
            vmax=1.0,
        )
        _style_axis(axis, f"{source_name}: {class_names[class_index]}")
        figure.colorbar(image, ax=axis, fraction=0.046, pad=0.04)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_categorical_tensor_comparison(
    left: np.ndarray,
    right: np.ndarray,
    output_path: Path,
    *,
    left_name: str,
    right_name: str,
    class_names: tuple[str, ...] = CLASS_NAMES,
    class_colors: tuple[str, ...] = CLASS_COLORS,
) -> Path:
    left_array = _validate_categorical_tensor(left)
    right_array = _validate_categorical_tensor(right)
    if left_array.shape != right_array.shape:
        msg = f"shape mismatch: {left_array.shape!r} != {right_array.shape!r}"
        raise ValueError(msg)

    class_count = left_array.shape[2]
    figure, axes = plt.subplots(class_count, 2, figsize=(10, 3.3 * class_count), squeeze=False)

    for class_index in range(class_count):
        cmap = class_probability_cmap(class_colors[class_index])
        left_image = axes[class_index][0].imshow(
            left_array[:, :, class_index],
            cmap=cmap,
            vmin=0.0,
            vmax=1.0,
        )
        right_image = axes[class_index][1].imshow(
            right_array[:, :, class_index],
            cmap=cmap,
            vmin=0.0,
            vmax=1.0,
        )
        _style_axis(axes[class_index][0], f"{left_name}: {class_names[class_index]}")
        _style_axis(axes[class_index][1], f"{right_name}: {class_names[class_index]}")
        figure.colorbar(left_image, ax=axes[class_index][0], fraction=0.046, pad=0.04)
        figure.colorbar(right_image, ax=axes[class_index][1], fraction=0.046, pad=0.04)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_categorical_tensor_residuals(
    left: np.ndarray,
    right: np.ndarray,
    output_path: Path,
    *,
    left_name: str,
    right_name: str,
    class_names: tuple[str, ...] = CLASS_NAMES,
) -> Path:
    left_array = _validate_categorical_tensor(left)
    right_array = _validate_categorical_tensor(right)
    if left_array.shape != right_array.shape:
        msg = f"shape mismatch: {left_array.shape!r} != {right_array.shape!r}"
        raise ValueError(msg)

    residual = left_array - right_array
    scale = float(np.max(np.abs(residual)))
    if scale == 0.0:
        scale = 1.0
    norm = Normalize(vmin=-scale, vmax=scale)
    class_count = residual.shape[2]
    columns = 2
    rows = int(np.ceil(class_count / columns))
    figure, axes = plt.subplots(rows, columns, figsize=(9, 4.2 * rows), squeeze=False)

    for class_index in range(rows * columns):
        axis = axes[class_index // columns][class_index % columns]
        if class_index >= class_count:
            axis.axis("off")
            continue
        image = axis.imshow(residual[:, :, class_index], cmap="coolwarm", norm=norm)
        _style_axis(axis, f"{class_names[class_index]}: {left_name} - {right_name}")
        figure.colorbar(image, ax=axis, fraction=0.046, pad=0.04)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_scalar_field_comparison(
    left: np.ndarray,
    right: np.ndarray,
    output_path: Path,
    *,
    left_name: str,
    right_name: str,
    title: str,
    cmap: str = "viridis",
    vmin: float | None = None,
    vmax: float | None = None,
) -> Path:
    left_array = np.asarray(left, dtype=np.float64)
    right_array = np.asarray(right, dtype=np.float64)
    if left_array.ndim != 2 or right_array.ndim != 2:
        raise ValueError("scalar field comparison expects 2D arrays")
    if left_array.shape != right_array.shape:
        msg = f"shape mismatch: {left_array.shape!r} != {right_array.shape!r}"
        raise ValueError(msg)

    computed_vmin = float(np.min([left_array.min(), right_array.min()])) if vmin is None else vmin
    computed_vmax = float(np.max([left_array.max(), right_array.max()])) if vmax is None else vmax
    figure, axes = plt.subplots(1, 2, figsize=(10, 4.5))
    left_image = axes[0].imshow(left_array, cmap=cmap, vmin=computed_vmin, vmax=computed_vmax)
    right_image = axes[1].imshow(right_array, cmap=cmap, vmin=computed_vmin, vmax=computed_vmax)
    _style_axis(axes[0], f"{title}: {left_name}")
    _style_axis(axes[1], f"{title}: {right_name}")
    figure.colorbar(left_image, ax=axes[0], fraction=0.046, pad=0.04)
    figure.colorbar(right_image, ax=axes[1], fraction=0.046, pad=0.04)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path


def plot_entropy_comparison(
    left: np.ndarray,
    right: np.ndarray,
    output_path: Path,
    *,
    left_name: str,
    right_name: str,
) -> Path:
    return plot_scalar_field_comparison(
        entropy_map(left),
        entropy_map(right),
        output_path,
        left_name=left_name,
        right_name=right_name,
        title="Entropy",
        cmap="cividis",
    )


__all__ = [
    "plot_categorical_tensor_comparison",
    "plot_categorical_tensor_residuals",
    "plot_class_probability_atlas",
    "plot_entropy_comparison",
    "plot_scalar_field_comparison",
]
