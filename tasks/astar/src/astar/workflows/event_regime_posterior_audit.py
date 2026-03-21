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
        f"rounds: {result.round_count}",
        f"episodes: {result.episode_count}",
        f"aggregation_mode: {result.aggregation_mode}",
        f"baseline_mae: {result.baseline_mae:.6f}",
        f"knn_mae: {result.knn_mae:.6f}",
        f"mae_gain: {result.mae_gain:.6f}",
        f"baseline_mse: {result.baseline_mse:.6f}",
        f"knn_mse: {result.knn_mse:.6f}",
        f"mse_gain: {result.mse_gain:.6f}",
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
        lines.append(
            f"- round={item['round_id']} birth_logit_rate={float(item['birth_logit_rate']):.6f} "
            f"collapse_logit_rate={float(item['collapse_logit_rate']):.6f}",
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
) -> pl.DataFrame:
    birth_dir = paths.dataset_dir(birth_dataset_name)
    if not birth_dir.joinpath("riskset.parquet").exists():
        build_hazard_riskset_dataset(
            paths,
            event_type="birth",
            dataset_name=birth_dataset_name,
            negative_ratio=8.0,
        )
    collapse_dir = paths.dataset_dir(collapse_dataset_name)
    if not collapse_dir.joinpath("riskset.parquet").exists():
        build_hazard_riskset_dataset(
            paths,
            event_type="collapse",
            dataset_name=collapse_dataset_name,
            negative_ratio=8.0,
        )
    birth = _weighted_positive_rate(
        pl.read_parquet(
            birth_dir / "riskset.parquet",
            columns=["round_id", "label", "sample_weight"],
        ),
    ).rename({"positive_rate": "birth_positive_rate"})
    collapse = _weighted_positive_rate(
        pl.read_parquet(
            collapse_dir / "riskset.parquet",
            columns=["round_id", "label", "sample_weight"],
        ),
    ).rename({"positive_rate": "collapse_positive_rate"})
    target_frame = birth.join(collapse, on="round_id", how="inner").sort("round_id")
    return target_frame.with_columns(
        pl.col("birth_positive_rate").map_elements(_logit, return_dtype=pl.Float64).alias(
            "birth_logit_rate",
        ),
        pl.col("collapse_positive_rate").map_elements(_logit, return_dtype=pl.Float64).alias(
            "collapse_logit_rate",
        ),
    ).select(
        "round_id",
        "birth_logit_rate",
        "collapse_logit_rate",
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
    )
    target_by_round = {
        str(row["round_id"]): np.asarray(
            [row["birth_logit_rate"], row["collapse_logit_rate"]],
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
    target_names = ["birth_logit_rate", "collapse_logit_rate"]

    round_metrics: list[EventRegimePosteriorRoundMetric] = []
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


__all__ = ["run_event_regime_posterior_audit", "EventRegimePosteriorAuditResult"]
