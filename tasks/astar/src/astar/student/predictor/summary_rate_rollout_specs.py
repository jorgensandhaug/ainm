from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryRateRolloutModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    target_family: str = "birth_collapse_portsplit"
    summary_feature_variant: str = "basic"
    rollout_years: int = Field(default=50, ge=1)
    birth_scale: float = Field(default=0.16, ge=0.0)
    port_scale: float = Field(default=0.08, ge=0.0)
    collapse_scale: float = Field(default=0.14, ge=0.0)
    rebuild_scale: float = Field(default=0.11, ge=0.0)
    reclaim_scale: float = Field(default=0.08, ge=0.0)
    ruin_fade_scale: float = Field(default=0.02, ge=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)


SUMMARY_RATE_ROLLOUT_MODEL_SPECS = (
    SummaryRateRolloutModelSpec(
        request_names=("f1_summary_rate_rollout_birthcollapse_v01",),
        model_name="f1_summary_rate_rollout_birthcollapse_v01",
        prior_blend=0.0,
    ),
    SummaryRateRolloutModelSpec(
        request_names=("f1_summary_rate_rollout_birthcollapse_blend_v01",),
        model_name="f1_summary_rate_rollout_birthcollapse_blend_v01",
        prior_blend=0.35,
    ),
)

_SUMMARY_RATE_ROLLOUT_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_RATE_ROLLOUT_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_rate_rollout_model_spec(
    model_name: str,
) -> SummaryRateRolloutModelSpec | None:
    return _SUMMARY_RATE_ROLLOUT_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_rate_rollout_model_names() -> list[str]:
    return sorted(_SUMMARY_RATE_ROLLOUT_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryRateRolloutModelSpec",
    "SUMMARY_RATE_ROLLOUT_MODEL_SPECS",
    "resolve_summary_rate_rollout_model_spec",
    "supported_summary_rate_rollout_model_names",
]
