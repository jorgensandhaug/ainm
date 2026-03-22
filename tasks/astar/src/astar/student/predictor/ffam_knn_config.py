from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FFAMKNNConfig(BaseModel):
    """Config for kNN terrain-matching predictor.

    Radically different from ffam_mode:
    - No per-round operator decomposition
    - No SVD manifold / mode coordinates
    - No MLP posterior over regime
    - Instead: per-cell kNN matching across ALL training cells
    - Transcript features used at cell level, not round level
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=6, ge=1)
    k_neighbors: int = Field(default=100, ge=1)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)
    beta_min: float = Field(default=12.0, ge=0.0)
    beta_scale: float = Field(default=48.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.3, ge=0.0)
    cells_per_seed: int = Field(default=768, ge=1)
    synthetic_dataset_version: str = "v2"
    distance_metric: Literal["euclidean", "cosine"] = "euclidean"
    distance_bandwidth: float = Field(default=1.0, gt=0.0)
    include_transcript_features: bool = True
    round_similarity_weight: float = Field(default=0.5, ge=0.0, le=1.0)


FFAM_KNN_DEFAULT_ALIAS = "ffam_knn_v1"

FFAM_KNN_CONFIGS: dict[str, FFAMKNNConfig] = {
    "ffam_knn_v1": FFAMKNNConfig(
        model_name="ffam_knn_v1",
        k_neighbors=100,
        include_transcript_features=True,
        round_similarity_weight=0.0,
    ),
    "ffam_knn_v2": FFAMKNNConfig(
        model_name="ffam_knn_v2",
        k_neighbors=200,
        include_transcript_features=True,
        round_similarity_weight=0.0,
    ),
    "ffam_knn_v3": FFAMKNNConfig(
        model_name="ffam_knn_v3",
        k_neighbors=100,
        include_transcript_features=True,
        round_similarity_weight=0.5,
    ),
    "ffam_knn_v4": FFAMKNNConfig(
        model_name="ffam_knn_v4",
        k_neighbors=50,
        include_transcript_features=True,
        round_similarity_weight=0.0,
        distance_bandwidth=0.5,
    ),
    "ffam_knn_v5": FFAMKNNConfig(
        model_name="ffam_knn_v5",
        k_neighbors=100,
        include_transcript_features=False,
        round_similarity_weight=0.0,
    ),
    # v6-v10: Improved kNN variants for better ensemble performance
    "ffam_knn_v6": FFAMKNNConfig(
        model_name="ffam_knn_v6",
        k_neighbors=50,
        include_transcript_features=True,
        round_similarity_weight=0.0,
        distance_bandwidth=2.0,
    ),
    "ffam_knn_v7": FFAMKNNConfig(
        model_name="ffam_knn_v7",
        k_neighbors=150,
        include_transcript_features=True,
        round_similarity_weight=0.0,
        distance_bandwidth=1.5,
    ),
    "ffam_knn_v8": FFAMKNNConfig(
        model_name="ffam_knn_v8",
        k_neighbors=100,
        include_transcript_features=True,
        round_similarity_weight=0.0,
        distance_bandwidth=0.5,
    ),
    "ffam_knn_v9": FFAMKNNConfig(
        model_name="ffam_knn_v9",
        k_neighbors=75,
        include_transcript_features=True,
        round_similarity_weight=0.0,
        distance_bandwidth=1.0,
        cells_per_seed=1600,
    ),
}


def available_ffam_knn_model_names() -> list[str]:
    return ["ffam_knn", *sorted(FFAM_KNN_CONFIGS)]


def is_ffam_knn_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_knn" or normalized in FFAM_KNN_CONFIGS


def resolve_ffam_knn_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMKNNConfig:
    normalized = model_name.strip().lower()
    resolved_name = FFAM_KNN_DEFAULT_ALIAS if normalized == "ffam_knn" else normalized
    if resolved_name not in FFAM_KNN_CONFIGS:
        raise ValueError(f"unsupported ffam knn model: {model_name}")
    config = FFAM_KNN_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_knn_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_knn_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix
