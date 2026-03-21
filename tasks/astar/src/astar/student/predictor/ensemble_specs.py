"""Immutable model specs for ensemble predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EnsembleModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    component_model_names: tuple[str, ...]
    component_weights: tuple[float, ...]
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    policy_name: str = "coverage"


_ENSEMBLE_SPECS: dict[str, EnsembleModelSpec] = {
    # Hazard V2 + query_residual, equal weight
    "f1_ensemble_hv2_qr_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.5, 0.5),
    ),
    # Hazard V2 dominant
    "f1_ensemble_hv2_qr_70_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_70_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.7, 0.3),
    ),
    # Query residual dominant
    "f1_ensemble_hv2_qr_30_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_30_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.3, 0.7),
    ),
    # k9 hazard + supportx
    "f1_ensemble_hv2k9_sx_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2k9_sx_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k9_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
    ),
}


def supported_ensemble_model_names() -> list[str]:
    return sorted(_ENSEMBLE_SPECS.keys())


def resolve_ensemble_model_spec(
    model_name: str,
) -> EnsembleModelSpec | None:
    return _ENSEMBLE_SPECS.get(model_name)
