from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from astar.student.predictor.query_residual_config import RegimeInputVariant

SummaryVariant = Literal["v1", "v2", "v3"]


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
    posterior_input_source: str = "regime_input"
    posterior_summary_variant: SummaryVariant = "v3"
    posterior_method: str = "particle_mixture"
    decoder_method: str = "mode_projection"
    decoder_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    decoder_particle_ood_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_particle_blend: float = Field(default=0.5, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_metric_method: str = "pca"
    cluster_count: int = Field(default=1, ge=1)


FFAM_MODE_DEFAULT_ALIAS = "ffam_mode_v17"


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
    "ffam_mode_v4": FFAMModeConfig(
        model_name="ffam_mode_v4",
        projected_mode_dim=2,
        posterior_method="local_linear",
        posterior_metric_dim=6,
        posterior_neighbor_count=16,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v5": FFAMModeConfig(
        model_name="ffam_mode_v5",
        projected_mode_dim=4,
        posterior_method="local_linear",
        posterior_metric_dim=10,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.1,
        prior_blend=0.12,
        posterior_ood_prior_blend=0.35,
    ),
    "ffam_mode_v6": FFAMModeConfig(
        model_name="ffam_mode_v6",
        projected_mode_dim=5,
        posterior_method="hybrid",
        posterior_metric_dim=12,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.15,
        posterior_particle_blend=0.5,
        prior_blend=0.16,
        posterior_ood_prior_blend=0.5,
        residual_class_scale=(0.92, 0.72, 0.62, 0.62, 0.86, 0.96),
        temperature=1.03,
    ),
    "ffam_mode_v7": FFAMModeConfig(
        model_name="ffam_mode_v7",
        projected_mode_dim=3,
        posterior_method="local_linear",
        decoder_method="operator_particle_mixture",
        posterior_metric_dim=8,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.0,
        prior_blend=0.08,
        posterior_ood_prior_blend=0.25,
    ),
    "ffam_mode_v8": FFAMModeConfig(
        model_name="ffam_mode_v8",
        projected_mode_dim=3,
        posterior_method="local_linear",
        decoder_method="operator_hybrid",
        decoder_particle_blend=0.65,
        posterior_metric_dim=8,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.25,
    ),
    "ffam_mode_v9": FFAMModeConfig(
        model_name="ffam_mode_v9",
        projected_mode_dim=4,
        posterior_method="local_linear",
        decoder_method="operator_hybrid",
        decoder_particle_blend=0.75,
        posterior_metric_dim=10,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.05,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v10": FFAMModeConfig(
        model_name="ffam_mode_v10",
        projected_mode_dim=3,
        posterior_method="local_linear",
        posterior_metric_method="supervised",
        posterior_metric_dim=4,
        posterior_neighbor_count=18,
        posterior_bandwidth=1.0,
        prior_blend=0.12,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v11": FFAMModeConfig(
        model_name="ffam_mode_v11",
        projected_mode_dim=4,
        posterior_method="hybrid",
        posterior_metric_method="supervised",
        posterior_metric_dim=5,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.45,
        prior_blend=0.12,
        posterior_ood_prior_blend=0.32,
    ),
    "ffam_mode_v12": FFAMModeConfig(
        model_name="ffam_mode_v12",
        projected_mode_dim=3,
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=5,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v13": FFAMModeConfig(
        model_name="ffam_mode_v13",
        projected_mode_dim=4,
        posterior_method="hybrid",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=6,
        posterior_neighbor_count=22,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.45,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v14": FFAMModeConfig(
        model_name="ffam_mode_v14",
        projected_mode_dim=3,
        posterior_method="kernel_ridge",
        posterior_metric_method="supervised",
        posterior_metric_dim=5,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v15": FFAMModeConfig(
        model_name="ffam_mode_v15",
        projected_mode_dim=3,
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=5,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v16": FFAMModeConfig(
        model_name="ffam_mode_v16",
        projected_mode_dim=4,
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=6,
        posterior_bandwidth=1.05,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v17": FFAMModeConfig(
        model_name="ffam_mode_v17",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v18": FFAMModeConfig(
        model_name="ffam_mode_v18",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="hybrid",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.45,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v19": FFAMModeConfig(
        model_name="ffam_mode_v19",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="pca",
        cluster_count=2,
        posterior_metric_dim=10,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.1,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v20": FFAMModeConfig(
        model_name="ffam_mode_v20",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v2",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=6,
        posterior_neighbor_count=20,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v21": FFAMModeConfig(
        model_name="ffam_mode_v21",
        projected_mode_dim=3,
        posterior_input_source="combined_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=12,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v22": FFAMModeConfig(
        model_name="ffam_mode_v22",
        projected_mode_dim=4,
        posterior_input_source="combined_input",
        posterior_summary_variant="v3",
        posterior_method="hybrid",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=12,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.4,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v23": FFAMModeConfig(
        model_name="ffam_mode_v23",
        projected_mode_dim=3,
        posterior_input_source="combined_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=16,
        posterior_neighbor_count=28,
        posterior_bandwidth=1.1,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v24": FFAMModeConfig(
        model_name="ffam_mode_v24",
        projected_mode_dim=4,
        posterior_input_source="combined_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=3,
        posterior_metric_dim=12,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v25": FFAMModeConfig(
        model_name="ffam_mode_v25",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_operator_hybrid",
        decoder_particle_blend=0.08,
        decoder_particle_ood_scale=0.28,
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v26": FFAMModeConfig(
        model_name="ffam_mode_v26",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_operator_hybrid",
        decoder_particle_blend=0.15,
        decoder_particle_ood_scale=0.35,
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v27": FFAMModeConfig(
        model_name="ffam_mode_v27",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="hybrid",
        decoder_method="cluster_operator_hybrid",
        decoder_particle_blend=0.1,
        decoder_particle_ood_scale=0.35,
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.45,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v28": FFAMModeConfig(
        model_name="ffam_mode_v28",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="cluster_operator_hybrid",
        decoder_particle_blend=0.12,
        decoder_particle_ood_scale=0.42,
        posterior_metric_method="supervised",
        cluster_count=3,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v29": FFAMModeConfig(
        model_name="ffam_mode_v29",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v30": FFAMModeConfig(
        model_name="ffam_mode_v30",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=10,
        posterior_bandwidth=0.9,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v31": FFAMModeConfig(
        model_name="ffam_mode_v31",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=3,
        posterior_metric_dim=10,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v32": FFAMModeConfig(
        model_name="ffam_mode_v32",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="kernel_ridge",
        decoder_method="cluster_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=12,
        posterior_bandwidth=1.15,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.3,
    ),
    "ffam_mode_v33": FFAMModeConfig(
        model_name="ffam_mode_v33",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="quadratic_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v34": FFAMModeConfig(
        model_name="ffam_mode_v34",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="quadratic_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=10,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v35": FFAMModeConfig(
        model_name="ffam_mode_v35",
        projected_mode_dim=4,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="hybrid",
        decoder_method="quadratic_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=2,
        posterior_metric_dim=10,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.05,
        posterior_particle_blend=0.45,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
    ),
    "ffam_mode_v36": FFAMModeConfig(
        model_name="ffam_mode_v36",
        projected_mode_dim=3,
        posterior_input_source="summary_input",
        posterior_summary_variant="v3",
        posterior_method="local_linear",
        decoder_method="quadratic_mode_projection",
        posterior_metric_method="supervised",
        cluster_count=3,
        posterior_metric_dim=8,
        posterior_neighbor_count=24,
        posterior_bandwidth=1.0,
        prior_blend=0.1,
        posterior_ood_prior_blend=0.28,
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
