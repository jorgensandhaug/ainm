"""Adaptive Ensemble Predictor.

Combines multiple model families with observation-adaptive weighting.
The key insight: different models excel on different types of rounds.
- query_residual_v19 is best on active rounds
- spatial_correction helps on barren rounds
- Ensemble blends them based on detected round regime.
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.query_residual import (
    load_or_fit_named_query_residual_predictor,
)

# ---------------------------------------------------------------------------
# Model names
# ---------------------------------------------------------------------------
ADAPTIVE_ENSEMBLE_ALIAS = "adaptive_ensemble"
ADAPTIVE_ENSEMBLE_V1 = "adaptive_ensemble_v1"
ADAPTIVE_ENSEMBLE_V2 = "adaptive_ensemble_v2"
ADAPTIVE_ENSEMBLE_V3 = "adaptive_ensemble_v3"
ADAPTIVE_ENSEMBLE_V4 = "adaptive_ensemble_v4"
ADAPTIVE_ENSEMBLE_V5 = "adaptive_ensemble_v5"
ADAPTIVE_ENSEMBLE_V6 = "adaptive_ensemble_v6"
ADAPTIVE_ENSEMBLE_V7 = "adaptive_ensemble_v7"
ADAPTIVE_ENSEMBLE_V8 = "adaptive_ensemble_v8"
ADAPTIVE_ENSEMBLE_V9 = "adaptive_ensemble_v9"
ADAPTIVE_ENSEMBLE_V10 = "adaptive_ensemble_v10"
ADAPTIVE_ENSEMBLE_V11 = "adaptive_ensemble_v11"
ADAPTIVE_ENSEMBLE_V12 = "adaptive_ensemble_v12"

ADAPTIVE_ENSEMBLE_MODEL_NAMES = frozenset({
    ADAPTIVE_ENSEMBLE_ALIAS,
    ADAPTIVE_ENSEMBLE_V1,
    ADAPTIVE_ENSEMBLE_V2,
    ADAPTIVE_ENSEMBLE_V3,
    ADAPTIVE_ENSEMBLE_V4,
    ADAPTIVE_ENSEMBLE_V5,
    ADAPTIVE_ENSEMBLE_V6,
    ADAPTIVE_ENSEMBLE_V7,
    ADAPTIVE_ENSEMBLE_V8,
    ADAPTIVE_ENSEMBLE_V9,
    ADAPTIVE_ENSEMBLE_V10,
    ADAPTIVE_ENSEMBLE_V11,
    ADAPTIVE_ENSEMBLE_V12,
})

ADAPTIVE_ENSEMBLE_MODEL_CHOICE_LIST = [
    ADAPTIVE_ENSEMBLE_ALIAS,
    ADAPTIVE_ENSEMBLE_V1,
    ADAPTIVE_ENSEMBLE_V2,
    ADAPTIVE_ENSEMBLE_V3,
    ADAPTIVE_ENSEMBLE_V4,
    ADAPTIVE_ENSEMBLE_V5,
    ADAPTIVE_ENSEMBLE_V6,
    ADAPTIVE_ENSEMBLE_V7,
    ADAPTIVE_ENSEMBLE_V8,
    ADAPTIVE_ENSEMBLE_V9,
    ADAPTIVE_ENSEMBLE_V10,
    ADAPTIVE_ENSEMBLE_V11,
    ADAPTIVE_ENSEMBLE_V12,
]


class AdaptiveEnsembleVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_models: tuple[str, ...] = ("query_residual_v19",)
    samples_per_round: int = Field(default=2, ge=1)
    prob_floor: float = Field(default=0.005, ge=0.0)
    # Barren-round correction
    barren_threshold: float = Field(default=0.03, ge=0.0)
    barren_settlement_scale: float = Field(default=0.5, ge=0.0)  # scale down settlement probs
    barren_ruin_scale: float = Field(default=0.3, ge=0.0)  # scale down ruin probs
    # Active-round boost (only for high-activity rounds)
    active_threshold: float = Field(default=0.15, ge=0.0)
    active_settlement_boost: float = Field(default=1.05, ge=0.0)
    # Observation-direct correction
    obs_correction_strength: float = Field(default=0.0, ge=0.0, le=1.0)
    # Graduated scaling (smooth instead of binary threshold)
    graduated_scaling: bool = False
    graduated_scale_power: float = Field(default=1.0, ge=0.0)  # Higher = sharper transition


def is_adaptive_ensemble_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in ADAPTIVE_ENSEMBLE_MODEL_NAMES


def resolve_adaptive_ensemble_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> AdaptiveEnsembleVariantSpec:
    normalized = model_name.strip().lower()
    if normalized not in ADAPTIVE_ENSEMBLE_MODEL_NAMES:
        msg = f"unsupported adaptive_ensemble model: {model_name}"
        raise ValueError(msg)

    specs = {
        ADAPTIVE_ENSEMBLE_V1: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V1,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.03,
            barren_settlement_scale=0.4,
            barren_ruin_scale=0.3,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V2: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V2,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.02,
            barren_settlement_scale=0.3,
            barren_ruin_scale=0.2,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V3: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V3,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.05,
            barren_settlement_scale=0.5,
            barren_ruin_scale=0.4,
            active_threshold=0.12,
            active_settlement_boost=1.02,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V4: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V4,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.04,
            barren_settlement_scale=0.45,
            barren_ruin_scale=0.35,
            active_threshold=0.12,
            active_settlement_boost=1.0,
            obs_correction_strength=0.05,
        ),
        # v5-v8: optimize around v1's winning threshold (0.03) and scaling (0.4/0.3)
        ADAPTIVE_ENSEMBLE_V5: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V5,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.035,
            barren_settlement_scale=0.35,
            barren_ruin_scale=0.25,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V6: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V6,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.025,
            barren_settlement_scale=0.45,
            barren_ruin_scale=0.35,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V7: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V7,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.03,
            barren_settlement_scale=0.3,
            barren_ruin_scale=0.2,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        ADAPTIVE_ENSEMBLE_V8: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V8,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.03,
            barren_settlement_scale=0.5,
            barren_ruin_scale=0.4,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
        ),
        # v9-v12: graduated scaling variants (smooth transition instead of binary threshold)
        ADAPTIVE_ENSEMBLE_V9: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V9,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.03,
            barren_settlement_scale=0.3,
            barren_ruin_scale=0.2,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
            graduated_scaling=True,
            graduated_scale_power=1.0,
        ),
        ADAPTIVE_ENSEMBLE_V10: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V10,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.04,
            barren_settlement_scale=0.25,
            barren_ruin_scale=0.15,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
            graduated_scaling=True,
            graduated_scale_power=0.5,
        ),
        ADAPTIVE_ENSEMBLE_V11: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V11,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.03,
            barren_settlement_scale=0.2,
            barren_ruin_scale=0.15,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
            graduated_scaling=True,
            graduated_scale_power=1.5,
        ),
        ADAPTIVE_ENSEMBLE_V12: AdaptiveEnsembleVariantSpec(
            model_name=ADAPTIVE_ENSEMBLE_V12,
            base_models=("query_residual_v19",),
            samples_per_round=2,
            barren_threshold=0.035,
            barren_settlement_scale=0.3,
            barren_ruin_scale=0.2,
            active_threshold=0.15,
            active_settlement_boost=1.0,
            obs_correction_strength=0.0,
            graduated_scaling=True,
            graduated_scale_power=2.0,
        ),
    }
    resolved_name = normalized if normalized != ADAPTIVE_ENSEMBLE_ALIAS else ADAPTIVE_ENSEMBLE_V1
    spec = specs.get(resolved_name, specs[ADAPTIVE_ENSEMBLE_V1])

    if samples_per_round is not None:
        spec = spec.model_copy(update={"samples_per_round": samples_per_round})

    return spec


def resolve_adaptive_ensemble_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int | None:
    spec = resolve_adaptive_ensemble_variant_spec(model_name, samples_per_round=samples_per_round)
    return spec.samples_per_round


# ---------------------------------------------------------------------------
# Core model
# ---------------------------------------------------------------------------


def _detect_regime(observations: list) -> dict[str, float]:
    """Detect the round regime from viewport observations."""
    total_cells = 0
    built_cells = 0
    settlement_count = 0
    port_count = 0
    ruin_count = 0
    total_settlements = 0
    alive_settlements = 0

    for obs in observations:
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)
        total_cells += collapsed.size
        built_cells += np.sum((collapsed == 1) | (collapsed == 2) | (collapsed == 3))
        settlement_count += np.sum(collapsed == 1)
        port_count += np.sum(collapsed == 2)
        ruin_count += np.sum(collapsed == 3)

        for s in obs.settlements:
            total_settlements += 1
            if s.alive:
                alive_settlements += 1

    n_cells = max(total_cells, 1)
    n_sett = max(total_settlements, 1)

    return {
        "build_rate": float(built_cells / n_cells),
        "settlement_rate": float(settlement_count / n_cells),
        "port_rate": float(port_count / n_cells),
        "ruin_rate": float(ruin_count / n_cells),
        "alive_fraction": float(alive_settlements / n_sett),
    }


class AdaptiveEnsemblePredictor(BaseModel):
    """Combine base predictor with regime-dependent calibration."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "adaptive_ensemble_v1"
    spec: AdaptiveEnsembleVariantSpec = Field(
        default_factory=lambda: AdaptiveEnsembleVariantSpec(model_name=ADAPTIVE_ENSEMBLE_V1)
    )
    base_predictor: BaseRoundPredictor | None = None

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        seeds_count = round_detail.seeds_count
        observations = list(context.observations)

        # Get base prediction
        base_build_from_context = getattr(self.base_predictor, "build_prediction_bundle_from_context", None)
        if callable(base_build_from_context):
            base_bundle = base_build_from_context(context)
        else:
            base_bundle = self.base_predictor.build_prediction_bundle(
                round_detail,
                context.geometry_bundle,
                context.evidence_bundle,
            )

        # Detect regime
        regime = _detect_regime(observations)

        # Apply regime-dependent corrections
        seed_predictions: dict[int, np.ndarray] = {}
        for seed_index in range(seeds_count):
            base_pred = base_bundle.predictions_by_seed.get(seed_index)
            if base_pred is None:
                continue

            corrected = base_pred.copy()

            # Apply calibration
            if self.spec.graduated_scaling:
                # Graduated: smooth interpolation based on build rate
                build_rate = regime["build_rate"]
                threshold = self.spec.barren_threshold
                if build_rate < threshold * 2.0:
                    # Scale factor goes from barren_scale at build_rate=0 to 1.0 at threshold*2
                    t = min(build_rate / max(threshold * 2.0, 1e-8), 1.0)
                    t = t ** self.spec.graduated_scale_power
                    sett_scale = self.spec.barren_settlement_scale + t * (1.0 - self.spec.barren_settlement_scale)
                    ruin_scale = self.spec.barren_ruin_scale + t * (1.0 - self.spec.barren_ruin_scale)
                    corrected[:, :, 1] *= sett_scale
                    corrected[:, :, 2] *= sett_scale
                    corrected[:, :, 3] *= ruin_scale
                    corrected[:, :, 0] = np.maximum(
                        1.0 - corrected[:, :, 1] - corrected[:, :, 2] - corrected[:, :, 3] - corrected[:, :, 4] - corrected[:, :, 5],
                        0.01,
                    )
            else:
                # Binary threshold
                if regime["build_rate"] < self.spec.barren_threshold:
                    corrected[:, :, 1] *= self.spec.barren_settlement_scale
                    corrected[:, :, 2] *= self.spec.barren_settlement_scale
                    corrected[:, :, 3] *= self.spec.barren_ruin_scale
                    corrected[:, :, 0] = np.maximum(
                        1.0 - corrected[:, :, 1] - corrected[:, :, 2] - corrected[:, :, 3] - corrected[:, :, 4] - corrected[:, :, 5],
                        0.01,
                    )
                elif regime["build_rate"] > self.spec.active_threshold:
                    corrected[:, :, 1] *= self.spec.active_settlement_boost
                    corrected[:, :, 2] *= self.spec.active_settlement_boost

            # Renormalize
            corrected = np.clip(corrected, 1e-8, None)
            corrected /= corrected.sum(axis=-1, keepdims=True)

            corrected = apply_probability_floor(corrected, floor=self.spec.prob_floor)
            seed_predictions[seed_index] = corrected

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=seed_predictions,
        )


# ---------------------------------------------------------------------------
# Factory / builder
# ---------------------------------------------------------------------------


def load_or_fit_adaptive_ensemble_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> AdaptiveEnsemblePredictor:
    """Build adaptive ensemble predictor."""
    spec = resolve_adaptive_ensemble_variant_spec(model_name, samples_per_round=samples_per_round)
    workspace_paths = paths or WorkspacePaths.from_root(".")
    resolved_policy_name = (policy_name or "coverage").strip().lower()

    # Build the base predictor (currently just query_residual_v19)
    base_model = spec.base_models[0] if spec.base_models else "query_residual_v19"
    base_predictor = load_or_fit_named_query_residual_predictor(
        workspace_paths,
        model_name=base_model,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        policy_name=resolved_policy_name,
        samples_per_round=spec.samples_per_round,
    )

    return AdaptiveEnsemblePredictor(
        name=spec.model_name,
        spec=spec,
        base_predictor=base_predictor,
    )


def load_or_fit_named_adaptive_ensemble_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> BaseRoundPredictor:
    """Entry point for the interactive predictor factory."""
    predictor = load_or_fit_adaptive_ensemble_predictor(
        model_name,
        paths=paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    return _AdaptiveEnsembleRoundAdapter(
        name=predictor.name,
        predictor=predictor,
    )


class _AdaptiveEnsembleRoundAdapter(BaseRoundPredictor):
    predictor: AdaptiveEnsemblePredictor

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        raise NotImplementedError("Use build_prediction_bundle_from_context instead")

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        return self.predictor.build_prediction_bundle_from_context(context)
