from __future__ import annotations

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.birth_posterior import BirthPosteriorEventPredictor
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.heuristic import _neighbor_count
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.round import BaseRoundPredictor


class QueryResidualBirthBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "f1_query_residual_birthblend_b50s4k7_v01"
    base_predictor: QueryResidualPredictor
    birth_predictor: BirthPosteriorEventPredictor
    settlement_gain: float = Field(default=0.12, ge=0.0)
    port_gain: float = Field(default=0.06, ge=0.0)
    empty_penalty: float = Field(default=0.05, ge=0.0)
    forest_penalty: float = Field(default=0.02, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None = None,
        policy_name: str = "coverage",
        model_name: str = "f1_query_residual_birthblend_b50s4k7_v01",
        probability_floor: float = 0.01,
        query_samples_per_round: int = 1,
        query_cells_per_seed: int = 256,
        query_budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50),
        query_ridge_lambda: float = 8.0,
        query_temperature: float = 1.15,
        query_prior_blend: float = 0.35,
        query_signal_scale: float = 0.12,
        query_min_delta_scale: float = 0.4,
        query_residual_class_scale: tuple[float, ...] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0),
        query_teacher_blend: float = 0.12,
        query_beta_min: float = 8.0,
        query_beta_scale: float = 24.0,
        birth_budget: int = 50,
        birth_samples_per_round: int = 4,
        birth_k_neighbors: int = 7,
        birth_signal_scale: float = 1.10,
        birth_gain: float = 0.95,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        settlement_gain: float = 0.12,
        port_gain: float = 0.06,
        empty_penalty: float = 0.05,
        forest_penalty: float = 0.02,
    ) -> QueryResidualBirthBlendPredictor:
        base_predictor = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=query_samples_per_round,
            cells_per_seed=query_cells_per_seed,
            budget_prefixes=query_budget_prefixes,
            ridge_lambda=query_ridge_lambda,
            model_name=f"{model_name}__query_residual",
            probability_floor=probability_floor,
            temperature=query_temperature,
            prior_blend=query_prior_blend,
            signal_scale=query_signal_scale,
            min_delta_scale=query_min_delta_scale,
            residual_class_scale=query_residual_class_scale,
            teacher_blend=query_teacher_blend,
            beta_min=query_beta_min,
            beta_scale=query_beta_scale,
        )
        birth_predictor = BirthPosteriorEventPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            budget=birth_budget,
            samples_per_round=birth_samples_per_round,
            k_neighbors=birth_k_neighbors,
            birth_signal_scale=birth_signal_scale,
            birth_gain=birth_gain,
            maritime_from_birth=0.0,
            model_name=f"{model_name}__birth_posterior",
            probability_floor=probability_floor,
            birth_dataset_name=birth_dataset_name,
        )
        return cls(
            name=model_name,
            base_predictor=base_predictor,
            birth_predictor=birth_predictor,
            settlement_gain=settlement_gain,
            port_gain=port_gain,
            empty_penalty=empty_penalty,
            forest_penalty=forest_penalty,
            probability_floor=probability_floor,
        )

    def _blend_birth_signal(
        self,
        base_prediction: np.ndarray,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        seed_index: int,
        birth_signal: float,
        evidence: RoundEvidenceBundle | None,
    ) -> np.ndarray:
        if abs(birth_signal) <= 1.0e-8:
            return base_prediction
        initial_state = round_detail.initial_states[seed_index]
        seed_features = features.per_seed[seed_index]
        scored_grid = collapse_internal_grid(np.asarray(initial_state.grid, dtype=np.int64))
        buildable = seed_features.feature("buildable")
        settlement_proximity = seed_features.feature("settlement_proximity")
        coastal_exposure = seed_features.feature("coastal_exposure")
        maritime_access = seed_features.feature("maritime_access")
        forest_density = seed_features.feature("forest_density")

        settlement_neighbors = _neighbor_count(scored_grid == 1).astype(np.float64) / 9.0
        port_neighbors = _neighbor_count(scored_grid == 2).astype(np.float64) / 9.0
        ruin_neighbors = _neighbor_count(scored_grid == 3).astype(np.float64) / 9.0

        unobserved_mask = np.ones(scored_grid.shape, dtype=np.float64)
        if evidence is not None and seed_index in evidence.per_seed:
            observed = evidence.per_seed[seed_index].coverage_counts > 0
            unobserved_mask = (~observed).astype(np.float64)

        inactive_mask = (~np.isin(scored_grid, (1, 2, 3))).astype(np.float64)
        birth_mask = buildable * inactive_mask * unobserved_mask
        birth_support = birth_mask * (
            0.95 * settlement_proximity
            + 0.70 * settlement_neighbors
            + 0.35 * port_neighbors
            + 0.20 * ruin_neighbors
        )
        maritime_support = birth_mask * (
            0.90 * coastal_exposure * maritime_access
            + 0.50 * port_neighbors
            + 0.20 * settlement_proximity
        )

        logits = np.log(np.maximum(base_prediction, 1.0e-6))
        logits[..., 1] += birth_signal * self.settlement_gain * birth_support
        logits[..., 2] += birth_signal * self.port_gain * maritime_support
        logits[..., 0] -= birth_signal * self.empty_penalty * birth_mask
        logits[..., 4] -= birth_signal * self.forest_penalty * birth_mask * (0.5 + forest_density)

        shifted = logits - np.max(logits, axis=-1, keepdims=True)
        probabilities = np.exp(shifted)
        return apply_probability_floor(
            probabilities / np.sum(probabilities, axis=-1, keepdims=True),
            self.probability_floor,
        )

    def _predict_with_evidence(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle(round_detail, features, evidence)
        if evidence is None or evidence.total_queries == 0:
            return PredictionBundle(
                round_id=round_detail.id,
                model_name=self.name,
                predictions_by_seed=base_bundle.predictions_by_seed,
            )
        birth_signal = self.birth_predictor.infer_birth_signal(evidence)
        predictions_by_seed = {
            seed_index: self._blend_birth_signal(
                np.asarray(prediction, dtype=np.float64),
                round_detail,
                features,
                seed_index,
                birth_signal,
                evidence,
            )
            for seed_index, prediction in base_bundle.predictions_by_seed.items()
        }
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        return self._predict_with_evidence(
            context.round_context.to_round_detail(),
            context.geometry_bundle,
            context.evidence_bundle,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        return self._predict_with_evidence(round_detail, features, evidence)


__all__ = ["QueryResidualBirthBlendPredictor"]
