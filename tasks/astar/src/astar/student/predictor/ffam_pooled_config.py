from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class FFAMPooledConfig(BaseModel):
    """Config for pooled ridge regression predictor.

    Radically different from ffam_mode:
    - No per-round operator, no SVD manifold, no posterior
    - Single ridge regression on pooled cells from all training rounds
    - Cell-level transcript features as direct regression inputs
    - Simple, fast, and genuinely different from mode-projection approach
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=6, ge=1)
    ridge_lambda: float = Field(default=10.0, ge=0.0)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)
    beta_min: float = Field(default=12.0, ge=0.0)
    beta_scale: float = Field(default=48.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.3, ge=0.0)
    cells_per_seed: int = Field(default=768, ge=1)
    synthetic_dataset_version: str = "v2"
    include_transcript_features: bool = True


FFAM_POOLED_CONFIGS: dict[str, FFAMPooledConfig] = {
    "ffam_pooled_v1": FFAMPooledConfig(
        model_name="ffam_pooled_v1",
        ridge_lambda=10.0,
        include_transcript_features=True,
    ),
    "ffam_pooled_v2": FFAMPooledConfig(
        model_name="ffam_pooled_v2",
        ridge_lambda=1.0,
        include_transcript_features=True,
    ),
    "ffam_pooled_v3": FFAMPooledConfig(
        model_name="ffam_pooled_v3",
        ridge_lambda=100.0,
        include_transcript_features=True,
    ),
    "ffam_pooled_v4": FFAMPooledConfig(
        model_name="ffam_pooled_v4",
        ridge_lambda=10.0,
        include_transcript_features=False,
    ),
}


def available_ffam_pooled_model_names() -> list[str]:
    return ["ffam_pooled", *sorted(FFAM_POOLED_CONFIGS)]


def is_ffam_pooled_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_pooled" or normalized in FFAM_POOLED_CONFIGS


def resolve_ffam_pooled_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMPooledConfig:
    normalized = model_name.strip().lower()
    resolved_name = "ffam_pooled_v1" if normalized == "ffam_pooled" else normalized
    if resolved_name not in FFAM_POOLED_CONFIGS:
        raise ValueError(f"unsupported ffam pooled model: {model_name}")
    config = FFAM_POOLED_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_pooled_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_pooled_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix
