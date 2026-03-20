from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.models.base import BaseRoundPredictor
from astar.models.calibrate import apply_probability_floor
from astar.models.geometry_baseline import GeometryPriorPredictor
from astar.observe.evidence import RoundEvidenceBundle


class RoundRegimePosterior(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    expansion: float = Field(ge=-1.0, le=1.0)
    maritime: float = Field(ge=-1.0, le=1.0)
    conflict: float = Field(ge=-1.0, le=1.0)
    winter: float = Field(ge=-1.0, le=1.0)
    reclamation: float = Field(ge=-1.0, le=1.0)
    evidence_queries: int = Field(ge=0)


class HeuristicLatentRegimeInferer(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = "heuristic_regime_v1"
    winter_food_center: float = Field(default=0.4)

    def infer(
        self,
        base_predictions: PredictionBundle,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle,
    ) -> RoundRegimePosterior:
        del features
        expected_counts = np.zeros(6, dtype=np.float64)
        observed_counts = np.zeros(6, dtype=np.float64)
        mean_food_values: list[float] = []

        for seed_index, seed_evidence in evidence.per_seed.items():
            prediction = base_predictions.predictions_by_seed[seed_index]
            coverage = seed_evidence.coverage_counts.astype(np.float64)
            expected_counts += np.sum(prediction * coverage[..., None], axis=(0, 1))
            observed_counts += seed_evidence.observed_class_counts.astype(np.float64)
            if seed_evidence.mean_food is not None:
                mean_food_values.append(seed_evidence.mean_food)

        observed_total = float(np.sum(observed_counts))
        if observed_total == 0.0:
            return RoundRegimePosterior(
                expansion=0.0,
                maritime=0.0,
                conflict=0.0,
                winter=0.0,
                reclamation=0.0,
                evidence_queries=0,
            )

        expected_total = float(np.sum(expected_counts))
        expected_frequencies = expected_counts / expected_total
        observed_frequencies = observed_counts / observed_total
        residual = observed_frequencies - expected_frequencies

        mean_food = (
            float(np.mean(mean_food_values))
            if mean_food_values
            else self.winter_food_center
        )
        winter_signal = (self.winter_food_center - mean_food) / max(self.winter_food_center, 1e-6)

        expansion = float(np.clip(residual[1] + 0.5 * residual[2] - 0.5 * residual[3], -1.0, 1.0))
        maritime = float(np.clip(2.5 * residual[2], -1.0, 1.0))
        conflict = float(np.clip(2.0 * residual[3], -1.0, 1.0))
        reclamation = float(np.clip(1.5 * residual[4] - 0.5 * residual[1], -1.0, 1.0))
        winter = float(np.clip(winter_signal + residual[0] + residual[3] - residual[1], -1.0, 1.0))

        return RoundRegimePosterior(
            expansion=expansion,
            maritime=maritime,
            conflict=conflict,
            winter=winter,
            reclamation=reclamation,
            evidence_queries=evidence.total_queries,
        )


class LatentRegimePredictor(BaseRoundPredictor):
    name: str = "latent_regime_v1"
    base_predictor: GeometryPriorPredictor = Field(default_factory=GeometryPriorPredictor)
    inferer: HeuristicLatentRegimeInferer = Field(default_factory=HeuristicLatentRegimeInferer)
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)

    def infer_regime_posterior(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None,
    ) -> RoundRegimePosterior:
        if evidence is None or evidence.total_queries == 0:
            return RoundRegimePosterior(
                expansion=0.0,
                maritime=0.0,
                conflict=0.0,
                winter=0.0,
                reclamation=0.0,
                evidence_queries=0,
            )
        base_predictions = self.base_predictor.build_prediction_bundle(round_detail, features)
        return self.inferer.infer(base_predictions, features, evidence)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        base_predictions = self.base_predictor.build_prediction_bundle(round_detail, features)
        if evidence is None or evidence.total_queries == 0:
            return PredictionBundle(
                round_id=round_detail.id,
                model_name=self.name,
                predictions_by_seed=base_predictions.predictions_by_seed,
            )

        regime = self.infer_regime_posterior(round_detail, features, evidence)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, base_prediction in base_predictions.predictions_by_seed.items():
            seed_features = features.per_seed[seed_index]
            frontier_score = seed_features.feature("frontier_score")
            settlement_proximity = seed_features.feature("settlement_proximity")
            coastal_exposure = seed_features.feature("coastal_exposure")
            maritime_access = seed_features.feature("maritime_access")
            forest_density = seed_features.feature("forest_density")
            buildable = seed_features.feature("buildable")

            logits = np.log(np.maximum(base_prediction, 1e-6))
            logits[..., 1] += regime.expansion * (1.1 * settlement_proximity + 0.7 * frontier_score)
            logits[..., 2] += regime.maritime * (
                1.4 * coastal_exposure * maritime_access * settlement_proximity
            )
            logits[..., 3] += regime.conflict * (1.1 * frontier_score + 0.3 * settlement_proximity)
            logits[..., 4] += regime.reclamation * (
                0.9 * forest_density * (1.0 - settlement_proximity)
            )
            logits[..., 0] += regime.winter * (0.8 * buildable * (1.0 - forest_density))
            logits[..., 1] -= regime.winter * 0.5 * settlement_proximity
            logits[..., 2] -= regime.winter * 0.3 * coastal_exposure

            shifted = logits - np.max(logits, axis=-1, keepdims=True)
            probabilities = np.exp(shifted)
            predictions_by_seed[seed_index] = apply_probability_floor(
                probabilities / np.sum(probabilities, axis=-1, keepdims=True),
                self.probability_floor,
            )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )
