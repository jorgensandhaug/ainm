"""Immutable model specs for MLP decoder predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MLPDecoderModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    hidden_dim: int = Field(default=64, ge=4)
    lr: float = Field(default=1e-3, gt=0.0)
    epochs: int = Field(default=200, ge=1)
    weight_decay: float = Field(default=1e-4, ge=0.0)
    summary_feature_variant: str = "basic"


_MLP_DECODER_SPECS: dict[str, MLPDecoderModelSpec] = {
    # Standard MLP decoder
    "f1_mlp_decoder_v01": MLPDecoderModelSpec(
        model_name="f1_mlp_decoder_v01",
        hidden_dim=64,
        epochs=200,
        lr=1e-3,
    ),
    # Wider MLP
    "f1_mlp_decoder_h128_v01": MLPDecoderModelSpec(
        model_name="f1_mlp_decoder_h128_v01",
        hidden_dim=128,
        epochs=200,
        lr=1e-3,
    ),
    # Deeper training
    "f1_mlp_decoder_e500_v01": MLPDecoderModelSpec(
        model_name="f1_mlp_decoder_e500_v01",
        hidden_dim=64,
        epochs=500,
        lr=5e-4,
    ),
    # k=3 regime inference
    "f1_mlp_decoder_k3_v01": MLPDecoderModelSpec(
        model_name="f1_mlp_decoder_k3_v01",
        hidden_dim=64,
        epochs=200,
        lr=1e-3,
        k_neighbors=3,
    ),
    # Stress features
    "f1_mlp_decoder_stress_v01": MLPDecoderModelSpec(
        model_name="f1_mlp_decoder_stress_v01",
        hidden_dim=64,
        epochs=200,
        lr=1e-3,
        summary_feature_variant="stress_v1",
    ),
}


def supported_mlp_decoder_model_names() -> list[str]:
    return sorted(_MLP_DECODER_SPECS.keys())


def resolve_mlp_decoder_model_spec(
    model_name: str,
) -> MLPDecoderModelSpec | None:
    return _MLP_DECODER_SPECS.get(model_name)
