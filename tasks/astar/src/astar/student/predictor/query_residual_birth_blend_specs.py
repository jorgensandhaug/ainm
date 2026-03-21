from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class QueryResidualBirthBlendModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    policy_name: str = "coverage"
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    query_samples_per_round: int = Field(default=1, ge=1)
    query_cells_per_seed: int = Field(default=256, ge=1)
    query_budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    query_ridge_lambda: float = Field(default=8.0, ge=0.0)
    query_temperature: float = Field(default=1.15, gt=0.0)
    query_prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    query_signal_scale: float = Field(default=0.12, gt=0.0)
    query_min_delta_scale: float = Field(default=0.4, ge=0.0, le=1.0)
    query_residual_class_scale: tuple[float, ...] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0)
    query_teacher_blend: float = Field(default=0.12, ge=0.0, le=1.0)
    query_beta_min: float = Field(default=8.0, ge=0.0)
    query_beta_scale: float = Field(default=24.0, ge=0.0)
    birth_budget: int = Field(default=50, ge=1)
    birth_samples_per_round: int = Field(default=4, ge=1)
    birth_k_neighbors: int = Field(default=7, ge=1)
    birth_signal_scale: float = Field(default=1.10, gt=0.0)
    birth_gain: float = Field(default=0.95, gt=0.0)
    birth_dataset_name: str = "f1_birth_riskset_nr8_v1"
    settlement_gain: float = Field(default=0.12, ge=0.0)
    port_gain: float = Field(default=0.06, ge=0.0)
    empty_penalty: float = Field(default=0.05, ge=0.0)
    forest_penalty: float = Field(default=0.02, ge=0.0)


QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS = (
    QueryResidualBirthBlendModelSpec(
        request_names=("f1_query_residual_birthblend_b50s4k7_v01",),
        model_name="f1_query_residual_birthblend_b50s4k7_v01",
    ),
)

_QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_query_residual_birth_blend_model_spec(
    model_name: str,
) -> QueryResidualBirthBlendModelSpec | None:
    return _QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_query_residual_birth_blend_model_names() -> list[str]:
    return sorted(_QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS_BY_NAME)


__all__ = [
    "QUERY_RESIDUAL_BIRTH_BLEND_MODEL_SPECS",
    "QueryResidualBirthBlendModelSpec",
    "resolve_query_residual_birth_blend_model_spec",
    "supported_query_residual_birth_blend_model_names",
]
