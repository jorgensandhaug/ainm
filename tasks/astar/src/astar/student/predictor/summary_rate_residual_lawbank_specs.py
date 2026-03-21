from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryRateResidualLawBankModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    ridge_lambda: float = Field(default=12.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    target_family: str = "collapse_portsplit"
    summary_feature_variant: str = "basic"
    residual_active_class_indices: tuple[int, ...] = (1, 2, 3)


SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS = (
    SummaryRateResidualLawBankModelSpec(
        request_names=("f1_summary_rate_residual_lawbank_collapse_portsplit_teacher_dyn_v01",),
        model_name="f1_summary_rate_residual_lawbank_collapse_portsplit_teacher_dyn_v01",
        residual_active_class_indices=(1, 2, 3),
    ),
    SummaryRateResidualLawBankModelSpec(
        request_names=("f1_summary_rate_residual_lawbank_collapse_portsplit_teacher_collapsequad_v01",),
        model_name="f1_summary_rate_residual_lawbank_collapse_portsplit_teacher_collapsequad_v01",
        residual_active_class_indices=(0, 1, 3, 4),
    ),
)

_SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_rate_residual_lawbank_model_spec(
    model_name: str,
) -> SummaryRateResidualLawBankModelSpec | None:
    return _SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_rate_residual_lawbank_model_names() -> list[str]:
    return sorted(_SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryRateResidualLawBankModelSpec",
    "SUMMARY_RATE_RESIDUAL_LAWBANK_MODEL_SPECS",
    "resolve_summary_rate_residual_lawbank_model_spec",
    "supported_summary_rate_residual_lawbank_model_names",
]
