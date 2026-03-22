from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SummaryVariant = Literal["v1", "v2", "v3"]
WeightMode = Literal["inverse_distance", "softmax"]
TargetKind = Literal["regime", "coefficients"]
InferenceMode = Literal["neighbor_average", "global_ridge"]


class FFAMRetrievalConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=1, ge=1)
    synthetic_dataset_version: str = "v1"
    k_neighbors: int = Field(default=5, ge=1)
    summary_variant: SummaryVariant = "v1"
    use_standardized_distance: bool = False
    weight_mode: WeightMode = "inverse_distance"
    weight_temperature: float = Field(default=0.0, ge=0.0)
    inverse_distance_power: float = Field(default=1.0, gt=0.0)
    projected_regime_dim: int = Field(default=0, ge=0)
    target_kind: TargetKind = "regime"
    inference_mode: InferenceMode = "neighbor_average"
    ridge_alpha: float = Field(default=1e-2, gt=0.0)


FFAM_RETRIEVAL_DEFAULT_ALIAS = "ffam_retrieval_v1"


FFAM_RETRIEVAL_CONFIGS: dict[str, FFAMRetrievalConfig] = {
    "ffam_retrieval_v1": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v1",
        policy_name="exploration_r3",
        summary_variant="v1",
        k_neighbors=5,
        weight_mode="inverse_distance",
        inverse_distance_power=1.0,
    ),
    "ffam_retrieval_v2": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v2",
        policy_name="exploration_r3",
        summary_variant="v2",
        k_neighbors=8,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.5,
    ),
    "ffam_retrieval_v3": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v3",
        policy_name="exploration_r3",
        summary_variant="v2",
        k_neighbors=8,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.25,
        projected_regime_dim=3,
    ),
    "ffam_retrieval_v4": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v4",
        policy_name="exploration_r3",
        summary_variant="v3",
        synthetic_dataset_version="v2",
        k_neighbors=8,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.25,
    ),
    "ffam_retrieval_v5": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v5",
        policy_name="exploration_r3",
        summary_variant="v3",
        synthetic_dataset_version="v2",
        k_neighbors=6,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.0,
        projected_regime_dim=4,
        target_kind="coefficients",
    ),
    "ffam_retrieval_v6": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v6",
        policy_name="exploration_r3",
        summary_variant="v3",
        synthetic_dataset_version="v2",
        k_neighbors=5,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.25,
        target_kind="coefficients",
    ),
    "ffam_retrieval_v7": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v7",
        policy_name="exploration_r3",
        summary_variant="v3",
        synthetic_dataset_version="v2",
        k_neighbors=6,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.0,
        projected_regime_dim=4,
        target_kind="coefficients",
        inference_mode="global_ridge",
        ridge_alpha=1e-2,
    ),
    "ffam_retrieval_v8": FFAMRetrievalConfig(
        model_name="ffam_retrieval_v8",
        policy_name="exploration_r3",
        summary_variant="v3",
        synthetic_dataset_version="v2",
        k_neighbors=6,
        use_standardized_distance=True,
        weight_mode="softmax",
        weight_temperature=1.0,
        projected_regime_dim=3,
        target_kind="regime",
        inference_mode="global_ridge",
        ridge_alpha=1e-2,
    ),
}


def available_ffam_model_names() -> list[str]:
    return ["ffam_retrieval", *sorted(FFAM_RETRIEVAL_CONFIGS)]


def is_ffam_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_retrieval" or normalized in FFAM_RETRIEVAL_CONFIGS


def resolve_ffam_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMRetrievalConfig:
    normalized = model_name.strip().lower()
    resolved_name = FFAM_RETRIEVAL_DEFAULT_ALIAS if normalized == "ffam_retrieval" else normalized
    if resolved_name not in FFAM_RETRIEVAL_CONFIGS:
        raise ValueError(f"unsupported ffam model: {model_name}")
    config = FFAM_RETRIEVAL_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_synthetic_dataset_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: list[str],
    summary_variant: SummaryVariant,
    synthetic_dataset_version: str,
    target_kind: TargetKind,
) -> str:
    del model_name, summary_variant
    digest = hashlib.sha1("\n".join(sorted(round_ids)).encode("utf-8")).hexdigest()[:10]
    return (
        f"{synthetic_dataset_version}__ffam_synthetic_live"
        f"__policy={policy_name}"
        f"__samples={samples_per_round}"
        f"__target={target_kind}"
        f"__rounds=sha1={digest}"
    )


def ffam_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix


__all__ = [
    "FFAM_RETRIEVAL_CONFIGS",
    "FFAM_RETRIEVAL_DEFAULT_ALIAS",
    "FFAMRetrievalConfig",
    "InferenceMode",
    "WeightMode",
    "TargetKind",
    "available_ffam_model_names",
    "ffam_checkpoint_name",
    "ffam_synthetic_dataset_name",
    "is_ffam_model_name",
    "resolve_ffam_config",
]
