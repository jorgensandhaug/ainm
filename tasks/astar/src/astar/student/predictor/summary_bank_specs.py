from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryBankModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


SUMMARY_BANK_MODEL_SPECS = (
    SummaryBankModelSpec(
        request_names=("f1_summary_bank_teacher_b50s4k7_v01",),
        model_name="f1_summary_bank_teacher_b50s4k7_v01",
    ),
)

_SUMMARY_BANK_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_BANK_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_bank_model_spec(model_name: str) -> SummaryBankModelSpec | None:
    return _SUMMARY_BANK_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_bank_model_names() -> list[str]:
    return sorted(_SUMMARY_BANK_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryBankModelSpec",
    "SUMMARY_BANK_MODEL_SPECS",
    "resolve_summary_bank_model_spec",
    "supported_summary_bank_model_names",
]
