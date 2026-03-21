"""Adaptive per-cell ensemble predictor.

Instead of fixed weights, this ensemble adapts blend weights per-cell
based on observation coverage. Cells near observed locations trust
query_residual more; cells far from observations trust hazard_posterior more.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor


class AdaptiveEnsemblePredictor(BaseRoundPredictor):
    """Ensemble with per-cell adaptive blend weights based on observation coverage."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "f1_adaptive_ensemble_v01"
    components: tuple[object, ...] = ()
    base_weight_global: float = Field(default=0.5, ge=0.0, le=1.0)
    coverage_boost: float = Field(default=0.3, ge=0.0, le=0.5)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    blur_sigma: float = Field(default=3.0, ge=0.5)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        model_names: Sequence[str] = (),
        model_name: str = "f1_adaptive_ensemble_v01",
        probability_floor: float = 0.01,
        policy_name: str = "coverage",
        base_weight_global: float = 0.5,
        coverage_boost: float = 0.3,
        blur_sigma: float = 3.0,
    ) -> AdaptiveEnsemblePredictor:
        if len(model_names) != 2:
            raise ValueError("adaptive ensemble requires exactly 2 component models (global + local)")

        from astar.student.predictor.interactive import build_online_predictor

        components: list[object] = []
        for mname in model_names:
            predictor = build_online_predictor(
                mname,
                paths=paths,
                historical_round_ids=list(round_ids) if round_ids is not None else None,
                policy_name=policy_name,
            )
            components.append(predictor)

        return cls(
            name=model_name,
            components=tuple(components),
            base_weight_global=base_weight_global,
            coverage_boost=coverage_boost,
            probability_floor=probability_floor,
            blur_sigma=blur_sigma,
        )

    def _gaussian_blur(self, mask: np.ndarray) -> np.ndarray:
        """Simple Gaussian blur using iterated box filters."""
        result = mask.astype(np.float64).copy()
        sigma = self.blur_sigma
        iterations = max(1, int(sigma))
        for _ in range(iterations):
            padded = np.pad(result, 1, mode='edge')
            result = (
                padded[:-2, :-2] + padded[:-2, 1:-1] + padded[:-2, 2:]
                + padded[1:-1, :-2] + padded[1:-1, 1:-1] + padded[1:-1, 2:]
                + padded[2:, :-2] + padded[2:, 1:-1] + padded[2:, 2:]
            ) / 9.0
        return result

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        # Get predictions from both components
        component_predictions: list[PredictionBundle] = []
        for comp in self.components:
            inner = getattr(comp, "predictor", comp)
            build_ctx = getattr(inner, "build_prediction_bundle_from_context", None)
            if callable(build_ctx):
                pred = build_ctx(context)
            else:
                round_detail = context.round_context.to_round_detail()
                pred = inner.build_prediction_bundle(
                    round_detail,
                    context.geometry_bundle,
                    context.evidence_bundle,
                )
            component_predictions.append(pred)

        if len(component_predictions) != 2:
            raise ValueError("adaptive ensemble requires exactly 2 components")

        global_pred = component_predictions[0]  # hazard posterior (global model)
        local_pred = component_predictions[1]   # query residual (local model)

        # Build observation coverage map from transcript observations
        h = context.round_context.map_height
        w = context.round_context.map_width
        coverage_map = np.zeros((h, w), dtype=np.float64)

        for obs in context.observations:
            vp = obs.viewport
            coverage_map[vp.y:vp.y + vp.h, vp.x:vp.x + vp.w] = 1.0

        # Blur the coverage map to create a soft proximity field
        coverage_proximity = self._gaussian_blur(coverage_map)
        coverage_proximity = np.clip(coverage_proximity, 0.0, 1.0)

        # Compute per-cell blend weight for the LOCAL model
        # Near observed cells: trust local more (higher weight)
        # Far from observed cells: trust global more (lower weight for local)
        local_weight = self.base_weight_global + self.coverage_boost * coverage_proximity
        local_weight = np.clip(local_weight, 0.0, 1.0)
        global_weight = 1.0 - local_weight

        # Blend predictions per seed
        seed_indices = set(global_pred.predictions_by_seed.keys()) & set(local_pred.predictions_by_seed.keys())

        blended: dict[int, np.ndarray] = {}
        for seed_index in sorted(seed_indices):
            g_probs = np.asarray(global_pred.predictions_by_seed[seed_index], dtype=np.float64)
            l_probs = np.asarray(local_pred.predictions_by_seed[seed_index], dtype=np.float64)

            # Geometric mean with per-cell adaptive weights
            g_log = np.log(np.maximum(g_probs, 1e-12))
            l_log = np.log(np.maximum(l_probs, 1e-12))

            log_blend = global_weight[..., None] * g_log + local_weight[..., None] * l_log
            shifted = log_blend - np.max(log_blend, axis=-1, keepdims=True)
            exp_probs = np.exp(shifted)
            normalized = exp_probs / np.sum(exp_probs, axis=-1, keepdims=True)
            blended[seed_index] = apply_probability_floor(normalized, self.probability_floor)

        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=blended,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        # Fallback: equal weight (no observations available)
        component_predictions: list[PredictionBundle] = []
        for comp in self.components:
            inner = getattr(comp, "predictor", comp)
            pred = inner.build_prediction_bundle(round_detail, features, evidence)
            component_predictions.append(pred)

        seed_indices = set()
        for pred in component_predictions:
            seed_indices.update(pred.predictions_by_seed.keys())

        blended: dict[int, np.ndarray] = {}
        for seed_index in sorted(seed_indices):
            log_accum = None
            for j, pred in enumerate(component_predictions):
                if seed_index not in pred.predictions_by_seed:
                    continue
                probs = np.asarray(pred.predictions_by_seed[seed_index], dtype=np.float64)
                log_probs = np.log(np.maximum(probs, 1e-12))
                if log_accum is None:
                    log_accum = 0.5 * log_probs
                else:
                    log_accum += 0.5 * log_probs
            if log_accum is not None:
                shifted = log_accum - np.max(log_accum, axis=-1, keepdims=True)
                exp_probs = np.exp(shifted)
                normalized = exp_probs / np.sum(exp_probs, axis=-1, keepdims=True)
                blended[seed_index] = apply_probability_floor(normalized, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=blended,
        )
