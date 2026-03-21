from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.datasets.hazard_riskset import build_hazard_riskset_dataset
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.posterior.deepset_student import _summary_vector_from_artifact

SUPPORTED_EVENT_REGIME_TARGET_FAMILIES = (
    "rates",
    "collapse_portsplit",
    "birth_collapse_portsplit",
)

def _weighted_positive_rate(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.group_by("round_id").agg(
        (
            (
                pl.col("label").cast(pl.Float64, strict=False)
                * pl.col("sample_weight").cast(pl.Float64, strict=False)
            ).sum()
            / pl.col("sample_weight").cast(pl.Float64, strict=False).sum()
        ).alias("positive_rate"),
    )


def _logit(value: float) -> float:
    clipped = float(np.clip(value, 1.0e-4, 1.0 - 1.0e-4))
    return float(np.log(clipped / (1.0 - clipped)))


def _standardize(
    features: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.std(features, axis=0)
    return means, np.maximum(scales, 1.0e-6)


def _safe_ratio_expr(
    numerator: pl.Expr,
    denominator: pl.Expr,
    *,
    default: float = 0.5,
) -> pl.Expr:
    return pl.when(denominator > 0.0).then(numerator / denominator).otherwise(default)


def _logit_expr(expr: pl.Expr) -> pl.Expr:
    clipped = expr.clip(1.0e-4, 1.0 - 1.0e-4)
    return (clipped / (1.0 - clipped)).log()


def _knn_predict(
    train_x: np.ndarray,
    train_y: np.ndarray,
    query_x: np.ndarray,
    *,
    k_neighbors: int,
) -> np.ndarray:
    if train_x.shape[0] == 0:
        raise ValueError("kNN posterior audit requires at least one training episode")
    distances = np.linalg.norm(train_x - query_x[None, :], axis=1)
    order = np.argsort(distances)[: min(k_neighbors, train_x.shape[0])]
    neighbor_distances = distances[order]
    weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
    weights = weights / np.sum(weights)
    return np.asarray(np.tensordot(weights, train_y[order], axes=(0, 0)), dtype=np.float64)


class EventRegimePosteriorRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    episode_count: int = Field(ge=1)
    baseline_mae: float = Field(ge=0.0)
    knn_mae: float = Field(ge=0.0)
    mae_gain: float
    baseline_mse: float = Field(ge=0.0)
    knn_mse: float = Field(ge=0.0)
    mse_gain: float
    per_target_baseline_mae: dict[str, float]
    per_target_knn_mae: dict[str, float]
    per_target_baseline_mse: dict[str, float]
    per_target_knn_mse: dict[str, float]


class EventRegimePosteriorAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    dataset_name: str
    policy_name: str
    budget: int = Field(ge=1)
    samples_per_round: int = Field(ge=1)
    k_neighbors: int = Field(ge=1)
    target_family: str
    target_names: list[str]
    round_count: int = Field(ge=2)
    episode_count: int = Field(ge=1)
    aggregation_mode: str
    baseline_mae: float = Field(ge=0.0)
    knn_mae: float = Field(ge=0.0)
    mae_gain: float
    baseline_mse: float = Field(ge=0.0)
    knn_mse: float = Field(ge=0.0)
    mse_gain: float
    standardized_baseline_mae: float = Field(ge=0.0)
    standardized_knn_mae: float = Field(ge=0.0)
    standardized_mae_gain: float
    standardized_baseline_mse: float = Field(ge=0.0)
    standardized_knn_mse: float = Field(ge=0.0)
    standardized_mse_gain: float
    per_target_baseline_mae: dict[str, float]
    per_target_knn_mae: dict[str, float]
    per_target_baseline_mse: dict[str, float]
    per_target_knn_mse: dict[str, float]
    round_targets: list[dict[str, float | str]]
    rounds: list[EventRegimePosteriorRoundMetric]
    artifact_path: Path
    report_path: Path


def _render_report(result: EventRegimePosteriorAuditResult) -> str:
    lines = [
        f"event-regime-posterior-audit {result.audit_name}",
        "",
        f"dataset: {result.dataset_name}",
        f"policy_name: {result.policy_name}",
        f"budget: {result.budget}",
        f"samples_per_round: {result.samples_per_round}",
        f"k_neighbors: {result.k_neighbors}",
        f"target_family: {result.target_family}",
        f"rounds: {result.round_count}",
        f"episodes: {result.episode_count}",
        f"aggregation_mode: {result.aggregation_mode}",
        f"baseline_mae: {result.baseline_mae:.6f}",
        f"knn_mae: {result.knn_mae:.6f}",
        f"mae_gain: {result.mae_gain:.6f}",
        f"baseline_mse: {result.baseline_mse:.6f}",
        f"knn_mse: {result.knn_mse:.6f}",
        f"mse_gain: {result.mse_gain:.6f}",
        f"standardized_baseline_mae: {result.standardized_baseline_mae:.6f}",
        f"standardized_knn_mae: {result.standardized_knn_mae:.6f}",
        f"standardized_mae_gain: {result.standardized_mae_gain:.6f}",
        f"standardized_baseline_mse: {result.standardized_baseline_mse:.6f}",
        f"standardized_knn_mse: {result.standardized_knn_mse:.6f}",
        f"standardized_mse_gain: {result.standardized_mse_gain:.6f}",
        "",
        "per_target:",
    ]
    for target_name in result.target_names:
        lines.append(
            (
                f"- {target_name}: "
                f"baseline_mae={result.per_target_baseline_mae[target_name]:.6f} "
                f"knn_mae={result.per_target_knn_mae[target_name]:.6f} "
                f"baseline_mse={result.per_target_baseline_mse[target_name]:.6f} "
                f"knn_mse={result.per_target_knn_mse[target_name]:.6f}"
            ),
        )
    lines.extend(
        [
            "",
            "round_targets:",
        ],
    )
    for item in result.round_targets:
        target_bits = " ".join(
            f"{target_name}={float(item[target_name]):.6f}" for target_name in result.target_names
        )
        lines.append(
            f"- round={item['round_id']} {target_bits}",
        )
    lines.extend(
        [
            "",
            "per_round:",
        ],
    )
    for metric in result.rounds:
        lines.append(
            (
                f"- round={metric.round_id} episodes={metric.episode_count} "
                f"baseline_mae={metric.baseline_mae:.6f} knn_mae={metric.knn_mae:.6f} "
                f"baseline_mse={metric.baseline_mse:.6f} knn_mse={metric.knn_mse:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def _round_target_frame(
    paths: WorkspacePaths,
    *,
    birth_dataset_name: str,
    collapse_dataset_name: str,
    target_family: str,
) -> pl.DataFrame:
    if target_family not in SUPPORTED_EVENT_REGIME_TARGET_FAMILIES:
        raise ValueError(f"unsupported target family: {target_family}")

    birth_dir = paths.dataset_dir(birth_dataset_name)
    collapse_dir = paths.dataset_dir(collapse_dataset_name)
    if not collapse_dir.joinpath("riskset.parquet").exists():
        build_hazard_riskset_dataset(
            paths,
            event_type="collapse",
            dataset_name=collapse_dataset_name,
            negative_ratio=8.0,
        )
    weight = pl.col("sample_weight").cast(pl.Float64, strict=False)
    label = pl.col("label").cast(pl.Float64, strict=False)
    port_mask = pl.col("before_has_port").fill_null(False)
    nonport_mask = ~port_mask

    collapse = pl.read_parquet(
        collapse_dir / "riskset.parquet",
        columns=["round_id", "label", "sample_weight", "before_has_port"],
    ).group_by("round_id").agg(
        _logit_expr(
            _safe_ratio_expr(
                (label * weight).sum(),
                weight.sum(),
            ),
        ).alias("collapse_logit_rate"),
        _logit_expr(
            _safe_ratio_expr(
                pl.when(port_mask).then(label * weight).otherwise(0.0).sum(),
                pl.when(port_mask).then(weight).otherwise(0.0).sum(),
            ),
        ).alias("collapse_logit_port"),
        _logit_expr(
            _safe_ratio_expr(
                pl.when(nonport_mask).then(label * weight).otherwise(0.0).sum(),
                pl.when(nonport_mask).then(weight).otherwise(0.0).sum(),
            ),
        ).alias("collapse_logit_nonport"),
        _logit_expr(
            _safe_ratio_expr(
                pl.when(port_mask).then(label * weight).otherwise(0.0).sum(),
                (label * weight).sum(),
            ),
        ).alias("collapse_pos_port_share_logit"),
    ).sort("round_id")
    if target_family == "collapse_portsplit":
        return collapse.select(
            "round_id",
            "collapse_logit_rate",
            "collapse_logit_port",
            "collapse_logit_nonport",
            "collapse_pos_port_share_logit",
        )

    if not birth_dir.joinpath("riskset.parquet").exists():
        build_hazard_riskset_dataset(
            paths,
            event_type="birth",
            dataset_name=birth_dataset_name,
            negative_ratio=8.0,
        )
    birth = _weighted_positive_rate(
        pl.read_parquet(
            birth_dir / "riskset.parquet",
            columns=["round_id", "label", "sample_weight"],
        ),
    ).with_columns(
        pl.col("positive_rate")
        .map_elements(_logit, return_dtype=pl.Float64)
        .alias("birth_logit_rate"),
    ).select("round_id", "birth_logit_rate")
    if target_family == "rates":
        return birth.join(collapse.select("round_id", "collapse_logit_rate"), on="round_id", how="inner").sort(
            "round_id",
        )
    return birth.join(collapse, on="round_id", how="inner").sort("round_id").select(
        "round_id",
        "birth_logit_rate",
        "collapse_logit_rate",
        "collapse_logit_port",
        "collapse_logit_nonport",
        "collapse_pos_port_share_logit",
    )


def run_event_regime_posterior_audit(
    paths: WorkspacePaths,
    *,
    dataset_name: str = "f1_synthetic_live_coverage_b50_s4_v1",
    audit_name: str = "f1_event_regime_posterior_knn_audit_v01",
    policy_name: str = "coverage",
    samples_per_round: int = 4,
    budget: int = 50,
    k_neighbors: int = 7,
    birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
    collapse_dataset_name: str = "f1_collapse_riskset_nr8_v1",
    target_family: str = "rates",
) -> EventRegimePosteriorAuditResult:
    if samples_per_round <= 0:
        raise ValueError("samples_per_round must be positive")
    if budget <= 0:
        raise ValueError("budget must be positive")
    if k_neighbors <= 0:
        raise ValueError("k_neighbors must be positive")

    target_frame = _round_target_frame(
        paths,
        birth_dataset_name=birth_dataset_name,
        collapse_dataset_name=collapse_dataset_name,
        target_family=target_family,
    )
    target_names = [name for name in target_frame.columns if name != "round_id"]
    target_by_round = {
        str(row["round_id"]): np.asarray(
            [row[target_name] for target_name in target_names],
            dtype=np.float64,
        )
        for row in target_frame.iter_rows(named=True)
    }
    dataset = build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        round_ids=sorted(target_by_round),
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
        budget=budget,
    )
    if dataset.index_path is None:
        raise ValueError("synthetic live dataset requires an index path")
    index_table = pl.read_parquet(dataset.index_path)
    examples: list[tuple[str, np.ndarray, np.ndarray]] = []
    for row in index_table.iter_rows(named=True):
        round_id = str(row["round_id"])
        summary_vector, _ = _summary_vector_from_artifact(
            resolve_synthetic_episode_path(dataset.dataset_dir, Path(str(row["episode_path"]))),
        )
        target = target_by_round.get(round_id)
        if target is None:
            continue
        examples.append((round_id, summary_vector, target))
    if not examples:
        raise ValueError("posterior audit did not load any synthetic episodes")

    round_ids = sorted({round_id for round_id, _, _ in examples})
    if len(round_ids) < 2:
        raise ValueError("posterior audit requires at least two rounds")

    round_metrics: list[EventRegimePosteriorRoundMetric] = []
    standardized_round_metrics: list[tuple[float, float, float, float]] = []
    for held_out_round_id in round_ids:
        train = [item for item in examples if item[0] != held_out_round_id]
        test = [item for item in examples if item[0] == held_out_round_id]
        train_x = np.stack([item[1] for item in train], axis=0)
        train_y = np.stack([item[2] for item in train], axis=0)
        test_x = np.stack([item[1] for item in test], axis=0)
        test_y = np.stack([item[2] for item in test], axis=0)

        means, scales = _standardize(train_x)
        train_x_scaled = (train_x - means[None, :]) / scales[None, :]
        test_x_scaled = (test_x - means[None, :]) / scales[None, :]

        unique_train_rounds = sorted({item[0] for item in train})
        baseline_vector = np.mean(
            np.stack([target_by_round[round_id] for round_id in unique_train_rounds], axis=0),
            axis=0,
        )
        baseline_pred = np.repeat(baseline_vector[None, :], test_y.shape[0], axis=0)
        knn_pred = np.stack(
            [
                _knn_predict(
                    train_x_scaled,
                    train_y,
                    test_x_scaled[index],
                    k_neighbors=k_neighbors,
                )
                for index in range(test_x_scaled.shape[0])
            ],
            axis=0,
        )
        baseline_abs = np.abs(baseline_pred - test_y)
        knn_abs = np.abs(knn_pred - test_y)
        baseline_sq = (baseline_pred - test_y) ** 2
        knn_sq = (knn_pred - test_y) ** 2
        target_means, target_scales = _standardize(train_y)
        baseline_pred_standardized = (baseline_pred - target_means[None, :]) / target_scales[None, :]
        knn_pred_standardized = (knn_pred - target_means[None, :]) / target_scales[None, :]
        test_y_standardized = (test_y - target_means[None, :]) / target_scales[None, :]
        standardized_baseline_abs = np.abs(baseline_pred_standardized - test_y_standardized)
        standardized_knn_abs = np.abs(knn_pred_standardized - test_y_standardized)
        standardized_baseline_sq = (baseline_pred_standardized - test_y_standardized) ** 2
        standardized_knn_sq = (knn_pred_standardized - test_y_standardized) ** 2
        standardized_round_metrics.append(
            (
                float(np.mean(standardized_baseline_abs)),
                float(np.mean(standardized_knn_abs)),
                float(np.mean(standardized_baseline_sq)),
                float(np.mean(standardized_knn_sq)),
            ),
        )
        round_metrics.append(
            EventRegimePosteriorRoundMetric(
                round_id=held_out_round_id,
                episode_count=test_y.shape[0],
                baseline_mae=float(np.mean(baseline_abs)),
                knn_mae=float(np.mean(knn_abs)),
                mae_gain=float(np.mean(baseline_abs) - np.mean(knn_abs)),
                baseline_mse=float(np.mean(baseline_sq)),
                knn_mse=float(np.mean(knn_sq)),
                mse_gain=float(np.mean(baseline_sq) - np.mean(knn_sq)),
                per_target_baseline_mae={
                    name: float(np.mean(baseline_abs[:, index]))
                    for index, name in enumerate(target_names)
                },
                per_target_knn_mae={
                    name: float(np.mean(knn_abs[:, index]))
                    for index, name in enumerate(target_names)
                },
                per_target_baseline_mse={
                    name: float(np.mean(baseline_sq[:, index]))
                    for index, name in enumerate(target_names)
                },
                per_target_knn_mse={
                    name: float(np.mean(knn_sq[:, index]))
                    for index, name in enumerate(target_names)
                },
            ),
        )

    artifact_dir = paths.artifacts_dir / "family1" / "posterior_audit" / audit_name
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "result.json"
    report_path = artifact_dir / "report.md"
    result = EventRegimePosteriorAuditResult(
        audit_name=audit_name,
        dataset_name=dataset.dataset_name,
        policy_name=policy_name,
        budget=budget,
        samples_per_round=samples_per_round,
        k_neighbors=k_neighbors,
        target_family=target_family,
        target_names=target_names,
        round_count=len(round_metrics),
        episode_count=len(examples),
        aggregation_mode="equal_round_mean_primary",
        baseline_mae=float(np.mean([item.baseline_mae for item in round_metrics])),
        knn_mae=float(np.mean([item.knn_mae for item in round_metrics])),
        mae_gain=float(np.mean([item.mae_gain for item in round_metrics])),
        baseline_mse=float(np.mean([item.baseline_mse for item in round_metrics])),
        knn_mse=float(np.mean([item.knn_mse for item in round_metrics])),
        mse_gain=float(np.mean([item.mse_gain for item in round_metrics])),
        standardized_baseline_mae=float(np.mean([item[0] for item in standardized_round_metrics])),
        standardized_knn_mae=float(np.mean([item[1] for item in standardized_round_metrics])),
        standardized_mae_gain=float(
            np.mean([item[0] - item[1] for item in standardized_round_metrics]),
        ),
        standardized_baseline_mse=float(np.mean([item[2] for item in standardized_round_metrics])),
        standardized_knn_mse=float(np.mean([item[3] for item in standardized_round_metrics])),
        standardized_mse_gain=float(
            np.mean([item[2] - item[3] for item in standardized_round_metrics]),
        ),
        per_target_baseline_mae={
            name: float(np.mean([item.per_target_baseline_mae[name] for item in round_metrics]))
            for name in target_names
        },
        per_target_knn_mae={
            name: float(np.mean([item.per_target_knn_mae[name] for item in round_metrics]))
            for name in target_names
        },
        per_target_baseline_mse={
            name: float(np.mean([item.per_target_baseline_mse[name] for item in round_metrics]))
            for name in target_names
        },
        per_target_knn_mse={
            name: float(np.mean([item.per_target_knn_mse[name] for item in round_metrics]))
            for name in target_names
        },
        round_targets=target_frame.to_dicts(),
        rounds=round_metrics,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = [
    "SUPPORTED_EVENT_REGIME_TARGET_FAMILIES",
    "run_event_regime_posterior_audit",
    "EventRegimePosteriorAuditResult",
]
