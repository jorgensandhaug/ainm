from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from astar.student.predictor.query_residual_config import RegimeInputVariant


class FFAMOperatorConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=512, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    operator_ridge_lambda: float = Field(default=8.0, ge=0.0)
    posterior_ridge_lambda: float = Field(default=8.0, gt=0.0)
    projected_operator_dim: int = Field(default=4, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.1, gt=0.0)
    prior_blend: float = Field(default=0.2, ge=0.0, le=1.0)
    residual_class_scale: tuple[float, ...] = (1.0, 0.7, 0.6, 0.6, 0.9, 1.0)
    beta_min: float = Field(default=2.0, ge=0.0)
    beta_scale: float = Field(default=8.0, ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "base"
    posterior_method: str = "global_ridge"
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_retrieval_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    manifold_neighbor_count: int = Field(default=0, ge=0)
    manifold_bandwidth: float = Field(default=1.0, gt=0.0)
    manifold_blend: float = Field(default=0.0, ge=0.0, le=1.0)


FFAM_OPERATOR_DEFAULT_ALIAS = "ffam_operator_v1"


FFAM_OPERATOR_CONFIGS: dict[str, FFAMOperatorConfig] = {
    "ffam_operator_v1": FFAMOperatorConfig(
        model_name="ffam_operator_v1",
        projected_operator_dim=4,
        regime_input_variant="base",
    ),
    "ffam_operator_v2": FFAMOperatorConfig(
        model_name="ffam_operator_v2",
        projected_operator_dim=6,
        regime_input_variant="motif_v1",
        manifold_neighbor_count=3,
        manifold_bandwidth=1.25,
        manifold_blend=0.3,
    ),
    "ffam_operator_v3": FFAMOperatorConfig(
        model_name="ffam_operator_v3",
        projected_operator_dim=5,
        regime_input_variant="motif_v1",
        prior_blend=0.15,
        temperature=1.05,
        residual_class_scale=(1.0, 0.8, 0.7, 0.7, 0.95, 1.0),
    ),
    "ffam_operator_v4": FFAMOperatorConfig(
        model_name="ffam_operator_v4",
        projected_operator_dim=3,
        regime_input_variant="motif_v1",
        posterior_method="local_linear",
        posterior_metric_dim=8,
        posterior_neighbor_count=12,
        posterior_bandwidth=1.35,
        posterior_retrieval_blend=0.35,
        posterior_ood_prior_blend=0.30,
        prior_blend=0.12,
        manifold_neighbor_count=3,
        manifold_bandwidth=1.25,
        manifold_blend=0.20,
    ),
    "ffam_operator_v5": FFAMOperatorConfig(
        model_name="ffam_operator_v5",
        projected_operator_dim=3,
        regime_input_variant="motif_v1",
        posterior_method="local_linear",
        posterior_metric_dim=10,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.10,
        posterior_retrieval_blend=0.50,
        posterior_ood_prior_blend=0.45,
        prior_blend=0.08,
        manifold_neighbor_count=4,
        manifold_bandwidth=1.10,
        manifold_blend=0.30,
        temperature=1.0,
    ),
    "ffam_operator_v6": FFAMOperatorConfig(
        model_name="ffam_operator_v6",
        projected_operator_dim=3,
        regime_input_variant="motif_v1",
        posterior_method="local_linear",
        posterior_metric_dim=10,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.20,
        posterior_retrieval_blend=1.0,
        posterior_ood_prior_blend=0.55,
        prior_blend=0.10,
        manifold_neighbor_count=0,
        manifold_blend=0.0,
        temperature=1.02,
    ),
    "ffam_operator_v7": FFAMOperatorConfig(
        model_name="ffam_operator_v7",
        projected_operator_dim=3,
        regime_input_variant="motif_v1",
        posterior_method="local_linear",
        posterior_metric_dim=8,
        posterior_neighbor_count=12,
        posterior_bandwidth=0.95,
        posterior_retrieval_blend=1.0,
        posterior_ood_prior_blend=0.70,
        prior_blend=0.18,
        manifold_neighbor_count=0,
        manifold_blend=0.0,
        temperature=1.05,
    ),
}


def available_ffam_operator_model_names() -> list[str]:
    return ["ffam_operator", *sorted(FFAM_OPERATOR_CONFIGS)]


def is_ffam_operator_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_operator" or normalized in FFAM_OPERATOR_CONFIGS


def resolve_ffam_operator_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMOperatorConfig:
    normalized = model_name.strip().lower()
    resolved_name = FFAM_OPERATOR_DEFAULT_ALIAS if normalized == "ffam_operator" else normalized
    if resolved_name not in FFAM_OPERATOR_CONFIGS:
        raise ValueError(f"unsupported ffam operator model: {model_name}")
    config = FFAM_OPERATOR_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_operator_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_operator_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix


__all__ = [
    "FFAMOperatorConfig",
    "FFAM_OPERATOR_CONFIGS",
    "FFAM_OPERATOR_DEFAULT_ALIAS",
    "available_ffam_operator_model_names",
    "ffam_operator_checkpoint_name",
    "is_ffam_operator_model_name",
    "resolve_ffam_operator_config",
]
