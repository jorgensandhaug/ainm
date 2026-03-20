from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from astar.core.score import entropy_map


def plot_entropy_heatmap(prediction: np.ndarray, output_path: Path) -> Path:
    entropy = entropy_map(prediction)
    figure, axis = plt.subplots(figsize=(5, 5))
    image = axis.imshow(entropy, cmap="cividis")
    axis.set_title("Prediction entropy")
    axis.set_xlabel("x")
    axis.set_ylabel("y")
    figure.colorbar(image, ax=axis)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)
    return output_path
