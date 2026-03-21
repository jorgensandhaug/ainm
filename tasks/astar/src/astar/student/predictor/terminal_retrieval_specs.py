"""Immutable model specs for terminal retrieval predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TerminalRetrievalModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "coverage"
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    summary_feature_variant: str = "basic"


_TERMINAL_RETRIEVAL_SPECS: dict[str, TerminalRetrievalModelSpec] = {
    # Pure retrieval - no prior blend
    "f1_terminal_retrieval_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_v01",
        k_neighbors=7,
        prior_blend=0.0,
    ),
    # Retrieval with k=3 (less averaging)
    "f1_terminal_retrieval_k3_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_k3_v01",
        k_neighbors=3,
        prior_blend=0.0,
    ),
    # Retrieval with k=1 (nearest-neighbor only)
    "f1_terminal_retrieval_k1_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_k1_v01",
        k_neighbors=1,
        prior_blend=0.0,
    ),
    # Retrieval with moderate prior blend
    "f1_terminal_retrieval_blend30_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_blend30_v01",
        k_neighbors=7,
        prior_blend=0.3,
    ),
    # Retrieval with heavy prior blend
    "f1_terminal_retrieval_blend50_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_blend50_v01",
        k_neighbors=7,
        prior_blend=0.5,
    ),
    # Retrieval with stress_v1 summary features
    "f1_terminal_retrieval_stress_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_stress_v01",
        k_neighbors=7,
        prior_blend=0.0,
        summary_feature_variant="stress_v1",
    ),
    # Retrieval with stress_v1 + prior blend
    "f1_terminal_retrieval_stress_blend30_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_stress_blend30_v01",
        k_neighbors=7,
        prior_blend=0.3,
        summary_feature_variant="stress_v1",
    ),
    # k=3 with blend - focused retrieval
    "f1_terminal_retrieval_k3_blend30_v01": TerminalRetrievalModelSpec(
        model_name="f1_terminal_retrieval_k3_blend30_v01",
        k_neighbors=3,
        prior_blend=0.3,
    ),
}


def supported_terminal_retrieval_model_names() -> list[str]:
    return sorted(_TERMINAL_RETRIEVAL_SPECS.keys())


def resolve_terminal_retrieval_model_spec(
    model_name: str,
) -> TerminalRetrievalModelSpec | None:
    return _TERMINAL_RETRIEVAL_SPECS.get(model_name)
