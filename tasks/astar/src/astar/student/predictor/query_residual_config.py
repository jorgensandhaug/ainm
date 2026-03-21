from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class QueryResidualConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=256, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    ridge_lambda: float = Field(default=8.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.15, gt=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    signal_scale: float = Field(default=0.12, gt=0.0)
    min_delta_scale: float = Field(default=0.4, ge=0.0, le=1.0)
    residual_class_scale: tuple[float, ...] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0)
    teacher_blend: float = Field(default=0.12, ge=0.0, le=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    manifold_neighbor_count: int = Field(default=0, ge=0)
    manifold_bandwidth: float = Field(default=1.0, gt=0.0)
    manifold_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    manifold_novelty_power: float = Field(default=0.0, ge=0.0)
    novelty_prior_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    ensemble_partner_model_name: str | None = None
    ensemble_max_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    ensemble_novelty_power: float = Field(default=1.0, ge=0.0)
    ensemble_signal_power: float = Field(default=1.0, ge=0.0)


QUERY_RESIDUAL_DEFAULT_ALIAS = "query_residual_v7"


QUERY_RESIDUAL_CONFIGS: dict[str, QueryResidualConfig] = {
    "query_residual_v7": QueryResidualConfig(
        model_name="query_residual_v7",
        policy_name="coverage",
        synthetic_dataset_version="v2",
    ),
    "query_residual_v8": QueryResidualConfig(
        model_name="query_residual_v8",
        policy_name="coverage",
        synthetic_dataset_version="v2",
        manifold_neighbor_count=3,
        manifold_bandwidth=1.35,
        manifold_blend=0.35,
        novelty_prior_weight=0.2,
    ),
    "query_residual_v9": QueryResidualConfig(
        model_name="query_residual_v9",
        policy_name="coverage",
        synthetic_dataset_version="v2",
        manifold_neighbor_count=3,
        manifold_bandwidth=1.35,
        manifold_blend=0.4,
        manifold_novelty_power=1.0,
        novelty_prior_weight=0.15,
    ),
    "query_residual_v10": QueryResidualConfig(
        model_name="query_residual_v10",
        policy_name="coverage",
        synthetic_dataset_version="v2",
        ensemble_partner_model_name="query_residual_v9",
        ensemble_max_weight=0.45,
        ensemble_novelty_power=1.0,
    ),
    "query_residual_v11": QueryResidualConfig(
        model_name="query_residual_v11",
        policy_name="coverage",
        synthetic_dataset_version="v2",
        ensemble_partner_model_name="query_residual_v9",
        ensemble_max_weight=0.45,
        ensemble_novelty_power=2.0,
        ensemble_signal_power=0.0,
    ),
}


def available_query_residual_model_names() -> list[str]:
    return ["query_residual", *sorted(QUERY_RESIDUAL_CONFIGS)]


def is_query_residual_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "query_residual" or normalized in QUERY_RESIDUAL_CONFIGS


def resolve_query_residual_config(
    model_name: str,
    *,
    policy_name: str | None = None,
) -> QueryResidualConfig:
    normalized = model_name.strip().lower()
    resolved_name = (
        QUERY_RESIDUAL_DEFAULT_ALIAS if normalized == "query_residual" else normalized
    )
    if resolved_name not in QUERY_RESIDUAL_CONFIGS:
        msg = f"unsupported query_residual model: {model_name}"
        raise ValueError(msg)
    config = QUERY_RESIDUAL_CONFIGS[resolved_name]
    if policy_name is None:
        return config
    return config.model_copy(update={"policy_name": policy_name.strip().lower()})


def query_residual_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_query_residual_config(model_name, policy_name=policy_name)
    if samples_per_round is not None:
        config = config.model_copy(update={"samples_per_round": samples_per_round})
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix


__all__ = [
    "QUERY_RESIDUAL_CONFIGS",
    "QUERY_RESIDUAL_DEFAULT_ALIAS",
    "QueryResidualConfig",
    "available_query_residual_model_names",
    "is_query_residual_model_name",
    "query_residual_checkpoint_name",
    "resolve_query_residual_config",
]
