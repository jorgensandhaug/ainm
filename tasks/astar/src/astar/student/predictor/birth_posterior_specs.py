from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class BirthPosteriorModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    birth_signal_scale: float = Field(default=1.0, gt=0.0)
    birth_gain: float = Field(default=1.0, gt=0.0)
    maritime_from_birth: float = Field(default=0.0, ge=0.0)
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)
    birth_dataset_name: str = "f1_birth_riskset_nr8_v1"


BIRTH_POSTERIOR_MODEL_SPECS = (
    BirthPosteriorModelSpec(
        request_names=("f1_birth_posterior_event_b50s4k7_v01",),
        model_name="f1_birth_posterior_event_b50s4k7_v01",
        birth_signal_scale=1.10,
        birth_gain=0.95,
        maritime_from_birth=0.0,
    ),
    BirthPosteriorModelSpec(
        request_names=("f1_birth_posterior_event_b50s4k7m25_v01",),
        model_name="f1_birth_posterior_event_b50s4k7m25_v01",
        birth_signal_scale=1.10,
        birth_gain=0.95,
        maritime_from_birth=0.25,
    ),
)

_BIRTH_POSTERIOR_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in BIRTH_POSTERIOR_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_birth_posterior_model_spec(model_name: str) -> BirthPosteriorModelSpec | None:
    return _BIRTH_POSTERIOR_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_birth_posterior_model_names() -> list[str]:
    return sorted(_BIRTH_POSTERIOR_MODEL_SPECS_BY_NAME)


__all__ = [
    "BirthPosteriorModelSpec",
    "BIRTH_POSTERIOR_MODEL_SPECS",
    "resolve_birth_posterior_model_spec",
    "supported_birth_posterior_model_names",
]
