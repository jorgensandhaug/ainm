"""Immutable model specs for cell-type transfer predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CellTypeTransferModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    prior_blend: float = Field(default=0.3, ge=0.0, le=1.0)
    summary_feature_variant: str = "basic"


_CELL_TYPE_TRANSFER_SPECS: dict[str, CellTypeTransferModelSpec] = {
    # Standard: 30% prior blend
    "f1_cell_type_transfer_v01": CellTypeTransferModelSpec(
        model_name="f1_cell_type_transfer_v01",
        k_neighbors=7,
        prior_blend=0.3,
    ),
    # Pure transfer, no prior
    "f1_cell_type_transfer_pure_v01": CellTypeTransferModelSpec(
        model_name="f1_cell_type_transfer_pure_v01",
        k_neighbors=7,
        prior_blend=0.0,
    ),
    # Heavy prior blend
    "f1_cell_type_transfer_blend50_v01": CellTypeTransferModelSpec(
        model_name="f1_cell_type_transfer_blend50_v01",
        k_neighbors=7,
        prior_blend=0.5,
    ),
    # k=3 focused retrieval
    "f1_cell_type_transfer_k3_v01": CellTypeTransferModelSpec(
        model_name="f1_cell_type_transfer_k3_v01",
        k_neighbors=3,
        prior_blend=0.3,
    ),
    # Stress features
    "f1_cell_type_transfer_stress_v01": CellTypeTransferModelSpec(
        model_name="f1_cell_type_transfer_stress_v01",
        k_neighbors=7,
        prior_blend=0.3,
        summary_feature_variant="stress_v1",
    ),
}


def supported_cell_type_transfer_model_names() -> list[str]:
    return sorted(_CELL_TYPE_TRANSFER_SPECS.keys())


def resolve_cell_type_transfer_model_spec(
    model_name: str,
) -> CellTypeTransferModelSpec | None:
    return _CELL_TYPE_TRANSFER_SPECS.get(model_name)
