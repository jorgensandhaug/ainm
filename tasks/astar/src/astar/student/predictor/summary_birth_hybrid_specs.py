from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryBirthHybridModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    birth_signal_scale: float = Field(default=1.10, gt=0.0)
    birth_gain: float = Field(default=0.95, gt=0.0)
    maritime_from_birth: float = Field(default=0.0, ge=0.0)
    teacher_gain: float = Field(default=0.20, ge=0.0)
    settlement_gain: float = Field(default=1.0, ge=0.0)
    port_gain: float = Field(default=1.0, ge=0.0)
    ruin_gain: float = Field(default=1.0, ge=0.0)
    forest_gain: float = Field(default=0.15, ge=0.0)
    delta_clip: float = Field(default=0.08, gt=0.0)
    birth_mode: str = "full_overlay"
    birth_local_gain: float = Field(default=1.0, ge=0.0)
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)
    birth_dataset_name: str = "f1_birth_riskset_nr8_v1"


SUMMARY_BIRTH_HYBRID_MODEL_SPECS = (
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_t20_v01",),
        model_name="f1_summary_birth_hybrid_t20_v01",
        birth_mode="full_overlay",
        teacher_gain=0.20,
        delta_clip=0.08,
        forest_gain=0.15,
    ),
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_t35_v01",),
        model_name="f1_summary_birth_hybrid_t35_v01",
        birth_mode="full_overlay",
        teacher_gain=0.35,
        delta_clip=0.10,
        forest_gain=0.20,
    ),
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_t20m25_v01",),
        model_name="f1_summary_birth_hybrid_t20m25_v01",
        birth_mode="full_overlay",
        teacher_gain=0.20,
        delta_clip=0.08,
        maritime_from_birth=0.25,
        port_gain=1.15,
        forest_gain=0.15,
    ),
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_s25_t20_v02",),
        model_name="f1_summary_birth_hybrid_s25_t20_v02",
        birth_mode="signal_only",
        birth_local_gain=0.25,
        teacher_gain=0.20,
        delta_clip=0.08,
        forest_gain=0.15,
    ),
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_s25_t35_v02",),
        model_name="f1_summary_birth_hybrid_s25_t35_v02",
        birth_mode="signal_only",
        birth_local_gain=0.25,
        teacher_gain=0.35,
        delta_clip=0.10,
        forest_gain=0.20,
    ),
    SummaryBirthHybridModelSpec(
        request_names=("f1_summary_birth_hybrid_s25_t20m25_v02",),
        model_name="f1_summary_birth_hybrid_s25_t20m25_v02",
        birth_mode="signal_only",
        birth_local_gain=0.25,
        teacher_gain=0.20,
        delta_clip=0.08,
        maritime_from_birth=0.25,
        port_gain=1.15,
        forest_gain=0.15,
    ),
)

_SUMMARY_BIRTH_HYBRID_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_BIRTH_HYBRID_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_birth_hybrid_model_spec(model_name: str) -> SummaryBirthHybridModelSpec | None:
    return _SUMMARY_BIRTH_HYBRID_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_birth_hybrid_model_names() -> list[str]:
    return sorted(_SUMMARY_BIRTH_HYBRID_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryBirthHybridModelSpec",
    "SUMMARY_BIRTH_HYBRID_MODEL_SPECS",
    "resolve_summary_birth_hybrid_model_spec",
    "supported_summary_birth_hybrid_model_names",
]
