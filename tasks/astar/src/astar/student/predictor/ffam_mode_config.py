from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.student.predictor.query_residual_config import RegimeInputVariant


class FFAMModeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=512, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    operator_ridge_lambda: float = Field(default=8.0, ge=0.0)
    posterior_ridge_lambda: float = Field(default=8.0, gt=0.0)
    projected_mode_dim: int = Field(default=3, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.02, gt=0.0)
    prior_blend: float = Field(default=0.15, ge=0.0, le=1.0)
    residual_class_scale: tuple[float, ...] = (1.0, 0.8, 0.7, 0.7, 0.95, 1.0)
    beta_min: float = Field(default=2.0, ge=0.0)
    beta_scale: float = Field(default=8.0, ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "motif_v1"
    posterior_method: str = "particle_mixture"
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)


FFAM_MODE_DEFAULT_ALIAS = "ffam_mode_v1"


FFAM_MODE_CONFIGS: dict[str, FFAMModeConfig] = {
    "ffam_mode_v1": FFAMModeConfig(
        model_name="ffam_mode_v1",
        projected_mode_dim=3,
        posterior_method="particle_mixture",
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.15,
        posterior_ood_prior_blend=0.45,
    ),
    "ffam_mode_v2": FFAMModeConfig(
        model_name="ffam_mode_v2",
        projected_mode_dim=3,
        posterior_method="local_linear",
        posterior_metric_dim=8,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.1,
        prior_blend=0.12,
        posterior_ood_prior_blend=0.35,
    ),
    "ffam_mode_v3": FFAMModeConfig(
        model_name="ffam_mode_v3",
        projected_mode_dim=3,
        posterior_method="hybrid",
        posterior_metric_dim=10,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.15,
        posterior_particle_blend=0.6,
        prior_blend=0.18,
        posterior_ood_prior_blend=0.55,
        residual_class_scale=(0.9, 0.7, 0.6, 0.6, 0.85, 0.95),
        temperature=1.04,
    ),
}


def available_ffam_mode_model_names() -> list[str]:
    return ["ffam_mode", *sorted(FFAM_MODE_CONFIGS)]


def is_ffam_mode_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_mode" or normalized in FFAM_MODE_CONFIGS


def resolve_ffam_mode_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMModeConfig:
    normalized = model_name.strip().lower()
    resolved_name = FFAM_MODE_DEFAULT_ALIAS if normalized == "ffam_mode" else normalized
    if resolved_name not in FFAM_MODE_CONFIGS:
        raise ValueError(f"unsupported ffam mode model: {model_name}")
    config = FFAM_MODE_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_mode_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_mode_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix


__all__ = [
    "FFAM_MODE_CONFIGS",
    "FFAM_MODE_DEFAULT_ALIAS",
    "FFAMModeConfig",
    "available_ffam_mode_model_names",
    "ffam_mode_checkpoint_name",
    "is_ffam_mode_model_name",
    "resolve_ffam_mode_config",
]
