"""Immutable model specs for hazard posterior V2 port predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class HazardPosteriorV2PortModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=5, ge=1)
    latent_rank: int = Field(default=3, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"


_HAZARD_POSTERIOR_V2_PORT_SPECS: dict[str, HazardPosteriorV2PortModelSpec] = {
    # Direct port of agent1's best config: k5 r3 l32 m70
    "f1_hazard_posterior_v2_k5_r3_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # Higher rank
    "f1_hazard_posterior_v2_k5_r5_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r5_v01",
        k_neighbors=5,
        latent_rank=5,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # Lower ridge
    "f1_hazard_posterior_v2_k5_r3_l16_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_l16_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=16.0,
        predicted_particle_weight=0.7,
    ),
    # More kNN weight
    "f1_hazard_posterior_v2_k5_r3_m50_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_m50_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.5,
    ),
    # Stress features
    "f1_hazard_posterior_v2_k5_r3_stress_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_stress_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
        summary_feature_variant="stress_v1",
    ),
    # k=3 focused
    "f1_hazard_posterior_v2_k3_r3_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k3_r3_v01",
        k_neighbors=3,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # Higher ridge alpha
    "f1_hazard_posterior_v2_k5_r3_l64_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_l64_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=64.0,
        predicted_particle_weight=0.7,
    ),
    # Much higher ridge alpha
    "f1_hazard_posterior_v2_k5_r3_l128_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_l128_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=128.0,
        predicted_particle_weight=0.7,
    ),
    # Higher predicted particle weight
    "f1_hazard_posterior_v2_k5_r3_m80_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_m80_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.8,
    ),
    # Even higher predicted particle weight
    "f1_hazard_posterior_v2_k5_r3_m90_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_m90_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.9,
    ),
    # More samples per round for richer summary bank
    "f1_hazard_posterior_v2_k5_r3_s8_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r3_s8_v01",
        k_neighbors=5,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
        samples_per_round=8,
    ),
    # k=7 for more neighbors
    "f1_hazard_posterior_v2_k7_r3_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k7_r3_v01",
        k_neighbors=7,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # Lower rank
    "f1_hazard_posterior_v2_k5_r2_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k5_r2_v01",
        k_neighbors=5,
        latent_rank=2,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # k=9 - even more neighbors
    "f1_hazard_posterior_v2_k9_r3_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k9_r3_v01",
        k_neighbors=9,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.7,
    ),
    # k=7 m90 - best k with high particle weight
    "f1_hazard_posterior_v2_k7_r3_m90_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k7_r3_m90_v01",
        k_neighbors=7,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.9,
    ),
    # k=7 m80 - best k with high particle weight
    "f1_hazard_posterior_v2_k7_r3_m80_v01": HazardPosteriorV2PortModelSpec(
        model_name="f1_hazard_posterior_v2_k7_r3_m80_v01",
        k_neighbors=7,
        latent_rank=3,
        ridge_alpha=32.0,
        predicted_particle_weight=0.8,
    ),
}


def supported_hazard_posterior_v2_port_model_names() -> list[str]:
    return sorted(_HAZARD_POSTERIOR_V2_PORT_SPECS.keys())


def resolve_hazard_posterior_v2_port_model_spec(
    model_name: str,
) -> HazardPosteriorV2PortModelSpec | None:
    return _HAZARD_POSTERIOR_V2_PORT_SPECS.get(model_name)
