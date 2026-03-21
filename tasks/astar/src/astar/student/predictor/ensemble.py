"""Ensemble predictor that blends multiple online predictors.

Combines predictions from different model families by geometric
averaging in probability space (equivalent to log-probability blending).
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.envs.types import RoundContext
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor


class EnsemblePredictor(BaseRoundPredictor):
    """Ensemble predictor that blends multiple models."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "f1_ensemble_v01"
    components: tuple[object, ...] = ()  # RoundPredictorAdapter objects (avoided import for circular dep)
    component_weights: tuple[float, ...] = ()
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    blend_mode: str = "geometric"  # "geometric" or "arithmetic"

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        model_names: Sequence[str] = (),
        weights: Sequence[float] = (),
        model_name: str = "f1_ensemble_v01",
        probability_floor: float = 0.01,
        policy_name: str = "coverage",
        blend_mode: str = "geometric",
    ) -> EnsemblePredictor:
        if not model_names:
            raise ValueError("ensemble requires at least one component model")
        if weights and len(weights) != len(model_names):
            raise ValueError("weights must match model_names length")

        resolved_weights = list(weights) if weights else [1.0 / len(model_names)] * len(model_names)
        total_w = sum(resolved_weights)
        resolved_weights = [w / total_w for w in resolved_weights]

        # Lazy import to avoid circular dependency
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
            component_weights=tuple(resolved_weights),
            probability_floor=probability_floor,
            blend_mode=blend_mode,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        """Blend component predictions in log-probability space."""
        component_predictions: list[PredictionBundle] = []
        for comp in self.components:
            # Each component is a RoundPredictorAdapter with a .predict method
            # or has build_prediction_bundle_from_context / build_prediction_bundle
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

        blended = self._blend_predictions(component_predictions, context.round_context.round_id)
        return blended

    def _blend_predictions(
        self,
        component_predictions: list[PredictionBundle],
        round_id: str,
    ) -> PredictionBundle:
        seed_indices = set()
        for pred in component_predictions:
            seed_indices.update(pred.predictions_by_seed.keys())

        blended: dict[int, np.ndarray] = {}
        for seed_index in sorted(seed_indices):
            if self.blend_mode == "arithmetic":
                # Arithmetic mean in probability space
                accum = None
                for j, pred in enumerate(component_predictions):
                    if seed_index not in pred.predictions_by_seed:
                        continue
                    probs = np.asarray(pred.predictions_by_seed[seed_index], dtype=np.float64)
                    if accum is None:
                        accum = self.component_weights[j] * probs
                    else:
                        accum += self.component_weights[j] * probs
                if accum is not None:
                    # Renormalize
                    sums = np.sum(accum, axis=-1, keepdims=True)
                    normalized = accum / np.maximum(sums, 1e-12)
                    blended[seed_index] = apply_probability_floor(normalized, self.probability_floor)
            else:
                # Geometric mean in log-probability space
                log_accum = None
                for j, pred in enumerate(component_predictions):
                    if seed_index not in pred.predictions_by_seed:
                        continue
                    probs = np.asarray(pred.predictions_by_seed[seed_index], dtype=np.float64)
                    log_probs = np.log(np.maximum(probs, 1e-12))
                    if log_accum is None:
                        log_accum = self.component_weights[j] * log_probs
                    else:
                        log_accum += self.component_weights[j] * log_probs
                if log_accum is not None:
                    shifted = log_accum - np.max(log_accum, axis=-1, keepdims=True)
                    exp_probs = np.exp(shifted)
                    normalized = exp_probs / np.sum(exp_probs, axis=-1, keepdims=True)
                    blended[seed_index] = apply_probability_floor(normalized, self.probability_floor)

        return PredictionBundle(
            round_id=round_id,
            model_name=self.name,
            predictions_by_seed=blended,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        component_predictions: list[PredictionBundle] = []
        for comp in self.components:
            inner = getattr(comp, "predictor", comp)
            pred = inner.build_prediction_bundle(
                round_detail,
                features,
                evidence,
            )
            component_predictions.append(pred)
        return self._blend_predictions(component_predictions, round_detail.id)
