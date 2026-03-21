from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryRoundLawModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    law_rank: int = Field(default=0, ge=0)
    ridge_alpha: float = Field(default=1.0e-2, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


SUMMARY_ROUNDLAW_MODEL_SPECS = (
    SummaryRoundLawModelSpec(
        request_names=("f1_summary_roundlaw_v01",),
        model_name="f1_summary_roundlaw_v01",
    ),
    SummaryRoundLawModelSpec(
        request_names=("f1_summary_roundlaw_k1_v01",),
        model_name="f1_summary_roundlaw_k1_v01",
        k_neighbors=1,
    ),
    SummaryRoundLawModelSpec(
        request_names=("f1_summary_roundlaw_r2_v01",),
        model_name="f1_summary_roundlaw_r2_v01",
        law_rank=2,
    ),
)

_SUMMARY_ROUNDLAW_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_ROUNDLAW_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_roundlaw_model_spec(
    model_name: str,
) -> SummaryRoundLawModelSpec | None:
    return _SUMMARY_ROUNDLAW_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_roundlaw_model_names() -> list[str]:
    return sorted(_SUMMARY_ROUNDLAW_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryRoundLawModelSpec",
    "SUMMARY_ROUNDLAW_MODEL_SPECS",
    "resolve_summary_roundlaw_model_spec",
    "supported_summary_roundlaw_model_names",
]
