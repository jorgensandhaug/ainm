from __future__ import annotations

import numpy as np
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.models.base import BaseRoundPredictor
from astar.models.calibrate import apply_probability_floor


class GeometryPriorPredictor(BaseRoundPredictor):
    name: str = "geometry_prior_v1"
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: object | None = None,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, initial_state in enumerate(round_detail.initial_states):
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            scored_grid = collapse_internal_grid(grid)
            seed_features = features.per_seed[seed_index]

            buildable = seed_features.feature("buildable")
            settlement_proximity = seed_features.feature("settlement_proximity")
            coastal_exposure = seed_features.feature("coastal_exposure")
            maritime_access = seed_features.feature("maritime_access")
            frontier_score = seed_features.feature("frontier_score")
            forest_density = seed_features.feature("forest_density")
            mountain_density = seed_features.feature("mountain_density")

            logits = np.zeros(
                (round_detail.map_height, round_detail.map_width, CLASS_COUNT),
                dtype=np.float64,
            )
            logits[..., 0] = 1.8 + 1.0 * (1.0 - buildable) + 0.7 * (1.0 - settlement_proximity)
            logits[..., 1] = (
                0.8
                + 2.4 * settlement_proximity
                + 0.8 * frontier_score
                + 0.2 * forest_density
            )
            logits[..., 2] = 0.3 + 3.0 * coastal_exposure * maritime_access * settlement_proximity
            logits[..., 3] = (
                0.2
                + 1.6 * frontier_score
                + 0.5 * settlement_proximity
                + 0.4 * mountain_density
            )
            logits[..., 4] = (
                0.3
                + 2.6 * (scored_grid == 4)
                + 0.8 * forest_density * (1.0 - settlement_proximity)
            )
            logits[..., 5] = 0.1 + 6.0 * (scored_grid == 5) + 0.4 * mountain_density

            logits[..., 1] += 1.1 * (scored_grid == 1)
            logits[..., 2] += 1.4 * (scored_grid == 2)
            logits[..., 3] += 1.2 * (scored_grid == 3)
            logits[..., 4] += 0.9 * (scored_grid == 4)

            probabilities = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
            predictions_by_seed[seed_index] = apply_probability_floor(
                probabilities / np.sum(probabilities, axis=-1, keepdims=True),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )
