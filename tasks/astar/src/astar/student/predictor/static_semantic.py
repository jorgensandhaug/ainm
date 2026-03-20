from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field

from astar.core.tensors import floor_and_normalize
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.types import FloatArray


class StaticSemanticConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    floor: float = Field(default=0.02, ge=0.0)
    class_priors: dict[int, tuple[float, ...]]

    def model_post_init(self, __context: object) -> None:
        for prior in self.class_priors.values():
            if len(prior) != CLASS_COUNT:
                msg = f"class prior must have {CLASS_COUNT} entries, got {len(prior)}"
                raise ValueError(msg)


DEFAULT_STATIC_SEMANTIC_CONFIG = StaticSemanticConfig(
    floor=0.02,
    class_priors={
        0: (0.90, 0.02, 0.02, 0.02, 0.02, 0.02),
        1: (0.20, 0.50, 0.10, 0.08, 0.07, 0.05),
        2: (0.15, 0.15, 0.50, 0.08, 0.07, 0.05),
        3: (0.25, 0.10, 0.05, 0.45, 0.10, 0.05),
        4: (0.12, 0.03, 0.02, 0.03, 0.76, 0.04),
        5: (0.01, 0.005, 0.005, 0.005, 0.005, 0.97),
    },
)


def default_static_semantic_config() -> StaticSemanticConfig:
    return DEFAULT_STATIC_SEMANTIC_CONFIG


def build_static_semantic_prediction(
    initial_grid: NDArray[np.int_],
    config: StaticSemanticConfig,
) -> FloatArray:
    scored_grid = collapse_internal_grid(initial_grid)
    height, width = scored_grid.shape
    prediction = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    for class_index, prior in config.class_priors.items():
        prediction[scored_grid == class_index] = np.asarray(prior, dtype=np.float64)
    return floor_and_normalize(prediction, config.floor)
