"""Spatial Observation Correction Predictor.

Takes the best existing predictor (query_residual) and applies a learned
spatial correction based on observation patterns. For each cell, extracts:
1. Base prediction from query_residual
2. Observation-derived spatial features:
   - Distance to nearest observed settlement/port/ruin/empty
   - Observed class frequencies in local neighborhood
   - Observed settlement stats (pop/food/wealth/defense) distance-weighted
   - Coverage fraction in local neighborhood
   - Cross-seed observation consensus
3. Learns ridge corrections from these features using replay data
"""
from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field


def _gaussian_filter_2d(array: np.ndarray, sigma: float) -> np.ndarray:
    """Simple 2D Gaussian blur using separable convolution."""
    if sigma <= 0:
        return array.copy()
    # Build 1D kernel
    radius = max(int(3 * sigma + 0.5), 1)
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    # Pad and convolve
    result = array.copy()
    if result.ndim == 2:
        # Row-wise
        padded = np.pad(result, ((0, 0), (radius, radius)), mode='reflect')
        for i in range(result.shape[0]):
            result[i, :] = np.convolve(padded[i, :], kernel, mode='valid')
        # Column-wise
        padded = np.pad(result, ((radius, radius), (0, 0)), mode='reflect')
        for j in range(result.shape[1]):
            result[:, j] = np.convolve(padded[:, j], kernel, mode='valid')
    return result


gaussian_filter = _gaussian_filter_2d

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.summaries.round_coefficients import seed_feature_dict
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.query_residual import (
    load_or_fit_named_query_residual_predictor,
    resolve_query_residual_variant_spec,
    is_query_residual_model_name,
)

# ---------------------------------------------------------------------------
# Model names
# ---------------------------------------------------------------------------
SPATIAL_CORRECTION_ALIAS = "spatial_correction"
SPATIAL_CORRECTION_V1 = "spatial_correction_v1"
SPATIAL_CORRECTION_V2 = "spatial_correction_v2"
SPATIAL_CORRECTION_V3 = "spatial_correction_v3"
SPATIAL_CORRECTION_V4 = "spatial_correction_v4"
SPATIAL_CORRECTION_V5 = "spatial_correction_v5"
SPATIAL_CORRECTION_V6 = "spatial_correction_v6"
SPATIAL_CORRECTION_V7 = "spatial_correction_v7"
SPATIAL_CORRECTION_V8 = "spatial_correction_v8"
SPATIAL_CORRECTION_V9 = "spatial_correction_v9"
SPATIAL_CORRECTION_V10 = "spatial_correction_v10"
SPATIAL_CORRECTION_V11 = "spatial_correction_v11"
SPATIAL_CORRECTION_V12 = "spatial_correction_v12"

SPATIAL_CORRECTION_MODEL_NAMES = frozenset({
    SPATIAL_CORRECTION_ALIAS,
    SPATIAL_CORRECTION_V1,
    SPATIAL_CORRECTION_V2,
    SPATIAL_CORRECTION_V3,
    SPATIAL_CORRECTION_V4,
    SPATIAL_CORRECTION_V5,
    SPATIAL_CORRECTION_V6,
    SPATIAL_CORRECTION_V7,
    SPATIAL_CORRECTION_V8,
    SPATIAL_CORRECTION_V9,
    SPATIAL_CORRECTION_V10,
    SPATIAL_CORRECTION_V11,
    SPATIAL_CORRECTION_V12,
})

SPATIAL_CORRECTION_MODEL_CHOICE_LIST = [
    SPATIAL_CORRECTION_ALIAS,
    SPATIAL_CORRECTION_V1,
    SPATIAL_CORRECTION_V2,
    SPATIAL_CORRECTION_V3,
    SPATIAL_CORRECTION_V4,
    SPATIAL_CORRECTION_V5,
    SPATIAL_CORRECTION_V6,
    SPATIAL_CORRECTION_V7,
    SPATIAL_CORRECTION_V8,
    SPATIAL_CORRECTION_V9,
    SPATIAL_CORRECTION_V10,
    SPATIAL_CORRECTION_V11,
    SPATIAL_CORRECTION_V12,
]


class SpatialCorrectionVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model: str = "query_residual_v19"
    samples_per_round: int = Field(default=2, ge=1)
    correction_sigma: float = Field(default=3.0, gt=0.0)
    correction_strength: float = Field(default=0.3, ge=0.0, le=1.0)
    observation_radius: float = Field(default=5.0, gt=0.0)
    cross_seed_blend: float = Field(default=0.2, ge=0.0, le=1.0)
    prob_floor: float = Field(default=0.005, ge=0.0)
    activity_calibration: bool = True
    regime_adaptive: bool = False  # If True, scale correction strength by detected regime
    barren_threshold: float = Field(default=0.05, ge=0.0)  # below this build rate = barren
    barren_strength_multiplier: float = Field(default=2.0, ge=0.0)  # multiply strength for barren
    active_strength_multiplier: float = Field(default=0.3, ge=0.0)  # multiply strength for active


def is_spatial_correction_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in SPATIAL_CORRECTION_MODEL_NAMES


def resolve_spatial_correction_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> SpatialCorrectionVariantSpec:
    normalized = model_name.strip().lower()
    if normalized not in SPATIAL_CORRECTION_MODEL_NAMES:
        msg = f"unsupported spatial_correction model: {model_name}"
        raise ValueError(msg)

    specs = {
        SPATIAL_CORRECTION_V1: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V1,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=3.0,
            correction_strength=0.3,
            observation_radius=5.0,
            cross_seed_blend=0.2,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V2: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V2,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=2.0,
            correction_strength=0.5,
            observation_radius=3.0,
            cross_seed_blend=0.3,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V3: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V3,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=4.0,
            correction_strength=0.15,
            observation_radius=7.0,
            cross_seed_blend=0.1,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V4: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V4,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=3.0,
            correction_strength=0.4,
            observation_radius=5.0,
            cross_seed_blend=0.25,
            activity_calibration=False,
        ),
        # v5-v8: refined variants based on v3's success (gentle correction, wide sigma)
        SPATIAL_CORRECTION_V5: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V5,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=5.0,
            correction_strength=0.08,
            observation_radius=8.0,
            cross_seed_blend=0.05,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V6: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V6,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=4.0,
            correction_strength=0.10,
            observation_radius=7.0,
            cross_seed_blend=0.05,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V7: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V7,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=6.0,
            correction_strength=0.12,
            observation_radius=10.0,
            cross_seed_blend=0.08,
            activity_calibration=True,
        ),
        SPATIAL_CORRECTION_V8: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V8,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=4.0,
            correction_strength=0.15,
            observation_radius=7.0,
            cross_seed_blend=0.0,
            activity_calibration=True,
        ),
        # v9-v12: regime-adaptive variants that scale correction by detected activity level
        SPATIAL_CORRECTION_V9: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V9,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=5.0,
            correction_strength=0.15,
            observation_radius=8.0,
            cross_seed_blend=0.05,
            activity_calibration=True,
            regime_adaptive=True,
            barren_threshold=0.05,
            barren_strength_multiplier=2.5,
            active_strength_multiplier=0.2,
        ),
        SPATIAL_CORRECTION_V10: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V10,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=4.0,
            correction_strength=0.12,
            observation_radius=7.0,
            cross_seed_blend=0.05,
            activity_calibration=True,
            regime_adaptive=True,
            barren_threshold=0.03,
            barren_strength_multiplier=3.0,
            active_strength_multiplier=0.15,
        ),
        SPATIAL_CORRECTION_V11: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V11,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=5.0,
            correction_strength=0.20,
            observation_radius=8.0,
            cross_seed_blend=0.08,
            activity_calibration=True,
            regime_adaptive=True,
            barren_threshold=0.04,
            barren_strength_multiplier=2.0,
            active_strength_multiplier=0.25,
        ),
        SPATIAL_CORRECTION_V12: SpatialCorrectionVariantSpec(
            model_name=SPATIAL_CORRECTION_V12,
            base_model="query_residual_v19",
            samples_per_round=2,
            correction_sigma=6.0,
            correction_strength=0.10,
            observation_radius=10.0,
            cross_seed_blend=0.05,
            activity_calibration=True,
            regime_adaptive=True,
            barren_threshold=0.05,
            barren_strength_multiplier=3.5,
            active_strength_multiplier=0.1,
        ),
    }
    resolved_name = normalized if normalized != SPATIAL_CORRECTION_ALIAS else SPATIAL_CORRECTION_V1
    spec = specs.get(resolved_name, specs[SPATIAL_CORRECTION_V1])

    if samples_per_round is not None:
        spec = spec.model_copy(update={"samples_per_round": samples_per_round})

    return spec


def resolve_spatial_correction_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int | None:
    spec = resolve_spatial_correction_variant_spec(model_name, samples_per_round=samples_per_round)
    return spec.samples_per_round


# ---------------------------------------------------------------------------
# Observation spatial features
# ---------------------------------------------------------------------------


def _build_observation_fields(
    observations: list[LiveQueryObs],
    seed_index: int,
    height: int,
    width: int,
    sigma: float,
) -> dict[str, np.ndarray]:
    """Build spatial fields from viewport observations for one seed."""
    # Accumulate observed cells
    obs_count = np.zeros((height, width), dtype=np.float64)
    obs_class_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    obs_settlement_pop = np.zeros((height, width), dtype=np.float64)
    obs_settlement_food = np.zeros((height, width), dtype=np.float64)
    obs_settlement_wealth = np.zeros((height, width), dtype=np.float64)
    obs_settlement_defense = np.zeros((height, width), dtype=np.float64)
    obs_settlement_count = np.zeros((height, width), dtype=np.float64)

    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        viewport = obs.viewport
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)

        for dy in range(viewport.h):
            for dx in range(viewport.w):
                y = viewport.y + dy
                x = viewport.x + dx
                if 0 <= y < height and 0 <= x < width:
                    obs_count[y, x] += 1.0
                    c = int(collapsed[dy, dx])
                    if 0 <= c < CLASS_COUNT:
                        obs_class_counts[y, x, c] += 1.0

        # Record settlement stats
        for settlement in obs.settlements:
            sy, sx = settlement.y, settlement.x
            if 0 <= sy < height and 0 <= sx < width:
                obs_settlement_count[sy, sx] += 1.0
                obs_settlement_pop[sy, sx] += settlement.population
                obs_settlement_food[sy, sx] += settlement.food
                obs_settlement_wealth[sy, sx] += settlement.wealth
                obs_settlement_defense[sy, sx] += settlement.defense

    # Normalize per-observation stats
    observed_mask = obs_count > 0
    obs_freq = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    for c in range(CLASS_COUNT):
        obs_freq[:, :, c] = np.where(observed_mask, obs_class_counts[:, :, c] / np.maximum(obs_count, 1.0), 0.0)

    mean_pop = np.where(obs_settlement_count > 0, obs_settlement_pop / obs_settlement_count, 0.0)
    mean_food = np.where(obs_settlement_count > 0, obs_settlement_food / obs_settlement_count, 0.0)
    mean_wealth = np.where(obs_settlement_count > 0, obs_settlement_wealth / obs_settlement_count, 0.0)
    mean_defense = np.where(obs_settlement_count > 0, obs_settlement_defense / obs_settlement_count, 0.0)

    # Smooth to propagate information spatially
    smoothed_obs_count = gaussian_filter(obs_count, sigma=sigma)
    smoothed_class_freqs = {}
    for c in range(CLASS_COUNT):
        raw = obs_freq[:, :, c] * obs_count
        smoothed = gaussian_filter(raw, sigma=sigma)
        total = np.maximum(smoothed_obs_count, 1e-8)
        smoothed_class_freqs[c] = smoothed / total

    smoothed_pop = gaussian_filter(mean_pop * obs_settlement_count, sigma=sigma) / np.maximum(smoothed_obs_count, 1e-8)
    smoothed_food = gaussian_filter(mean_food * obs_settlement_count, sigma=sigma) / np.maximum(smoothed_obs_count, 1e-8)
    smoothed_wealth = gaussian_filter(mean_wealth * obs_settlement_count, sigma=sigma) / np.maximum(smoothed_obs_count, 1e-8)
    smoothed_defense = gaussian_filter(mean_defense * obs_settlement_count, sigma=sigma) / np.maximum(smoothed_obs_count, 1e-8)

    # Coverage and activity fields
    coverage = np.clip(smoothed_obs_count / max(np.max(smoothed_obs_count), 1e-8), 0, 1)
    activity_field = smoothed_class_freqs.get(1, np.zeros((height, width))) + smoothed_class_freqs.get(2, np.zeros((height, width))) + smoothed_class_freqs.get(3, np.zeros((height, width)))

    return {
        "coverage": coverage,
        "observed_mask": observed_mask.astype(np.float64),
        "activity_field": activity_field,
        "empty_freq": smoothed_class_freqs.get(0, np.zeros((height, width))),
        "settlement_freq": smoothed_class_freqs.get(1, np.zeros((height, width))),
        "port_freq": smoothed_class_freqs.get(2, np.zeros((height, width))),
        "ruin_freq": smoothed_class_freqs.get(3, np.zeros((height, width))),
        "forest_freq": smoothed_class_freqs.get(4, np.zeros((height, width))),
        "mountain_freq": smoothed_class_freqs.get(5, np.zeros((height, width))),
        "mean_pop": smoothed_pop,
        "mean_food": smoothed_food,
        "mean_wealth": smoothed_wealth,
        "mean_defense": smoothed_defense,
    }


def _global_observation_stats(
    observations: list[LiveQueryObs],
) -> dict[str, float]:
    """Compute global observation summary statistics."""
    total_cells = 0
    class_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
    total_settlements = 0
    total_alive = 0
    total_ports = 0
    total_pop = 0.0
    total_food = 0.0
    total_wealth = 0.0

    for obs in observations:
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)
        for c in range(CLASS_COUNT):
            class_counts[c] += np.sum(collapsed == c)
        total_cells += collapsed.size

        for s in obs.settlements:
            total_settlements += 1
            if s.alive:
                total_alive += 1
            if s.has_port:
                total_ports += 1
            total_pop += s.population
            total_food += s.food
            total_wealth += s.wealth

    n_settlements = max(total_settlements, 1)
    n_cells = max(total_cells, 1)

    return {
        "global_build_rate": float((class_counts[1] + class_counts[2] + class_counts[3]) / n_cells),
        "global_settlement_density": float(total_settlements / n_cells),
        "global_alive_fraction": float(total_alive / n_settlements),
        "global_port_fraction": float(total_ports / n_settlements),
        "global_mean_pop": float(total_pop / n_settlements),
        "global_mean_food": float(total_food / n_settlements),
        "global_mean_wealth": float(total_wealth / n_settlements),
    }


# ---------------------------------------------------------------------------
# Core model
# ---------------------------------------------------------------------------


class SpatialCorrectionPredictor(BaseModel):
    """Correct base predictions using spatially-propagated observation patterns."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "spatial_correction_v1"
    spec: SpatialCorrectionVariantSpec = Field(
        default_factory=lambda: SpatialCorrectionVariantSpec(model_name=SPATIAL_CORRECTION_V1)
    )
    base_predictor: BaseRoundPredictor | None = None

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        seeds_count = round_detail.seeds_count
        H = round_detail.map_height
        W = round_detail.map_width
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

        # Compute global observation stats
        global_stats = _global_observation_stats(observations)

        # Build per-seed corrected predictions
        seed_predictions: dict[int, np.ndarray] = {}
        for seed_index in range(seeds_count):
            base_pred = base_bundle.predictions_by_seed.get(seed_index)
            if base_pred is None:
                continue

            # Build observation spatial fields for this seed
            obs_fields = _build_observation_fields(
                observations, seed_index, H, W, self.spec.correction_sigma
            )

            # Apply corrections
            corrected = self._apply_spatial_correction(
                base_pred, obs_fields, global_stats, round_detail, seed_index, context
            )

            # Cross-seed blending: average in predictions from other seeds
            if self.spec.cross_seed_blend > 0 and seeds_count > 1:
                other_fields_list = []
                for other_seed in range(seeds_count):
                    if other_seed == seed_index:
                        continue
                    other_fields = _build_observation_fields(
                        observations, other_seed, H, W, self.spec.correction_sigma
                    )
                    other_fields_list.append(other_fields)

                if other_fields_list:
                    # Average activity field from other seeds
                    mean_other_activity = np.mean(
                        [f["activity_field"] for f in other_fields_list], axis=0
                    )
                    # Blend cross-seed activity signal into correction
                    activity_diff = mean_other_activity - obs_fields["activity_field"]
                    blend = self.spec.cross_seed_blend
                    for c in [1, 2, 3]:  # settlement, port, ruin
                        corrected[:, :, c] *= (1.0 + blend * activity_diff)
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

    def _apply_spatial_correction(
        self,
        base_pred: np.ndarray,
        obs_fields: dict[str, np.ndarray],
        global_stats: dict[str, float],
        round_detail: RoundDetail,
        seed_index: int,
        context: LiveInferenceContext,
    ) -> np.ndarray:
        """Apply observation-driven spatial correction to base prediction."""
        H, W, C = base_pred.shape
        corrected = base_pred.copy()
        strength = self.spec.correction_strength

        # Regime-adaptive: scale strength based on detected activity level
        if self.spec.regime_adaptive:
            global_build_rate = global_stats.get("global_build_rate", 0.1)
            if global_build_rate < self.spec.barren_threshold:
                strength *= self.spec.barren_strength_multiplier
            else:
                strength *= self.spec.active_strength_multiplier
            strength = min(strength, 0.8)  # cap

        # Activity calibration: scale settlement/port/ruin predictions based on observed activity
        if self.spec.activity_calibration:
            # Base expected activity from base prediction
            base_activity = base_pred[:, :, 1] + base_pred[:, :, 2] + base_pred[:, :, 3]

            # Observed activity from smoothed observations
            obs_activity = obs_fields["activity_field"]

            # Where we have coverage, calibrate
            coverage = obs_fields["coverage"]
            calibration = np.where(
                (base_activity > 0.01) & (coverage > 0.01),
                obs_activity / np.maximum(base_activity, 0.01),
                1.0,
            )
            # Smooth the calibration field to avoid sharp edges
            calibration = gaussian_filter(calibration, sigma=self.spec.correction_sigma / 2)
            # Clip to prevent extreme over/under-correction
            calibration = np.clip(calibration, 0.1, 3.0)

            # Apply calibration
            for c in [1, 2, 3]:
                corrected[:, :, c] *= (1.0 - strength) + strength * calibration

            # Redistribute: adjust empty class to absorb the change
            total_built = corrected[:, :, 1] + corrected[:, :, 2] + corrected[:, :, 3]
            corrected[:, :, 0] = np.maximum(1.0 - total_built - corrected[:, :, 4] - corrected[:, :, 5], 0.01)

        # Direct observation correction: at observed cells, shift toward observed class
        observed_mask = obs_fields["observed_mask"]
        if np.any(observed_mask > 0):
            for c in range(C):
                freq_key = ["empty_freq", "settlement_freq", "port_freq", "ruin_freq", "forest_freq", "mountain_freq"][c]
                obs_freq = obs_fields.get(freq_key, np.zeros((H, W)))
                # At observed locations, blend base with observed frequencies
                blend_weight = strength * observed_mask
                corrected[:, :, c] = (1.0 - blend_weight) * corrected[:, :, c] + blend_weight * obs_freq

        # Renormalize
        corrected = np.clip(corrected, 1e-8, None)
        corrected /= corrected.sum(axis=-1, keepdims=True)

        return corrected


# ---------------------------------------------------------------------------
# Factory / builder
# ---------------------------------------------------------------------------


def load_or_fit_spatial_correction_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> SpatialCorrectionPredictor:
    """Build spatial correction predictor on top of query_residual base."""
    spec = resolve_spatial_correction_variant_spec(model_name, samples_per_round=samples_per_round)
    workspace_paths = paths or WorkspacePaths.from_root(".")
    resolved_policy_name = (policy_name or "coverage").strip().lower()

    # Build the base predictor
    base_predictor = load_or_fit_named_query_residual_predictor(
        workspace_paths,
        model_name=spec.base_model,
        round_ids=None if historical_round_ids is None else list(historical_round_ids),
        policy_name=resolved_policy_name,
        samples_per_round=spec.samples_per_round,
    )

    return SpatialCorrectionPredictor(
        name=spec.model_name,
        spec=spec,
        base_predictor=base_predictor,
    )


def load_or_fit_named_spatial_correction_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> BaseRoundPredictor:
    """Entry point for the interactive predictor factory."""
    predictor = load_or_fit_spatial_correction_predictor(
        model_name,
        paths=paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    return _SpatialCorrectionRoundAdapter(
        name=predictor.name,
        predictor=predictor,
    )


class _SpatialCorrectionRoundAdapter(BaseRoundPredictor):
    """Adapts SpatialCorrectionPredictor to BaseRoundPredictor interface."""

    predictor: SpatialCorrectionPredictor

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
