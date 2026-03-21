"""Immutable model specs for adaptive ensemble predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AdaptiveEnsembleModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    component_model_names: tuple[str, str]  # (global_model, local_model)
    base_weight_global: float = Field(default=0.5, ge=0.0, le=1.0)
    coverage_boost: float = Field(default=0.3, ge=0.0, le=0.5)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    policy_name: str = "coverage"
    blur_sigma: float = Field(default=3.0, ge=0.5)


_ADAPTIVE_ENSEMBLE_SPECS: dict[str, AdaptiveEnsembleModelSpec] = {
    # Standard: 50% base with 30% boost near observations
    "f1_adaptive_ensemble_v01": AdaptiveEnsembleModelSpec(
        model_name="f1_adaptive_ensemble_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        base_weight_global=0.5,
        coverage_boost=0.3,
        blur_sigma=3.0,
    ),
    # Higher boost for local model near observations
    "f1_adaptive_ensemble_boost40_v01": AdaptiveEnsembleModelSpec(
        model_name="f1_adaptive_ensemble_boost40_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        base_weight_global=0.4,
        coverage_boost=0.4,
        blur_sigma=3.0,
    ),
    # Wider blur for smoother transition
    "f1_adaptive_ensemble_wide_v01": AdaptiveEnsembleModelSpec(
        model_name="f1_adaptive_ensemble_wide_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        base_weight_global=0.5,
        coverage_boost=0.3,
        blur_sigma=5.0,
    ),
    # Narrower blur for sharper transitions
    "f1_adaptive_ensemble_narrow_v01": AdaptiveEnsembleModelSpec(
        model_name="f1_adaptive_ensemble_narrow_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        base_weight_global=0.5,
        coverage_boost=0.3,
        blur_sigma=1.5,
    ),
}


def supported_adaptive_ensemble_model_names() -> list[str]:
    return sorted(_ADAPTIVE_ENSEMBLE_SPECS.keys())


def resolve_adaptive_ensemble_model_spec(
    model_name: str,
) -> AdaptiveEnsembleModelSpec | None:
    return _ADAPTIVE_ENSEMBLE_SPECS.get(model_name)
