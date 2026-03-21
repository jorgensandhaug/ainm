from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class QueryResidualModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=256, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    ridge_lambda: float = Field(default=8.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.15, gt=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    signal_scale: float = Field(default=0.12, gt=0.0)
    min_delta_scale: float = Field(default=0.4, ge=0.0, le=1.0)
    residual_class_scale: tuple[float, ...] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0)
    teacher_blend: float = Field(default=0.12, ge=0.0, le=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    feature_variant: str = "v1"


QUERY_RESIDUAL_MODEL_SPECS = (
    QueryResidualModelSpec(
        request_names=("query_residual", "query_residual_v7"),
        model_name="query_residual_v7",
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_p45_v01",),
        model_name="f1_student_query_residual_p45_v01",
        budget_prefixes=(0, 5, 10, 20, 35, 45, 50),
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_s4p45_v01",),
        model_name="f1_student_query_residual_s4p45_v01",
        samples_per_round=4,
        budget_prefixes=(0, 5, 10, 20, 35, 45, 50),
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_tb0_v01",),
        model_name="f1_student_query_residual_tb0_v01",
        teacher_blend=0.0,
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_tb6_v01",),
        model_name="f1_student_query_residual_tb6_v01",
        teacher_blend=0.06,
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_s2_v01",),
        model_name="f1_student_query_residual_s2_v01",
        samples_per_round=2,
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_state_v01",),
        model_name="f1_student_query_residual_state_v01",
        feature_variant="v2_state",
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_state_tails_v01",),
        model_name="f1_student_query_residual_state_tails_v01",
        feature_variant="v3_state_tails",
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_localstate_v01",),
        model_name="f1_student_query_residual_localstate_v01",
        feature_variant="v4_localstate",
    ),
    QueryResidualModelSpec(
        request_names=("f1_student_query_residual_localblur_v01",),
        model_name="f1_student_query_residual_localblur_v01",
        feature_variant="v5_localblur",
    ),
)

_QUERY_RESIDUAL_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in QUERY_RESIDUAL_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_query_residual_model_spec(model_name: str) -> QueryResidualModelSpec | None:
    return _QUERY_RESIDUAL_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_query_residual_model_names() -> list[str]:
    return sorted(_QUERY_RESIDUAL_MODEL_SPECS_BY_NAME)


__all__ = [
    "QueryResidualModelSpec",
    "QUERY_RESIDUAL_MODEL_SPECS",
    "resolve_query_residual_model_spec",
    "supported_query_residual_model_names",
]
