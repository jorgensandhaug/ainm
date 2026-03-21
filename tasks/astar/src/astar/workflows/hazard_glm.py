from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.datasets.hazard_riskset import build_hazard_riskset_dataset
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable


class HazardGlmRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    row_count: int = Field(ge=1)
    population_weight_sum: float = Field(gt=0.0)
    weighted_positive_rate: float = Field(ge=0.0, le=1.0)
    baseline_log_loss: float = Field(ge=0.0)
    glm_log_loss: float = Field(ge=0.0)
    log_loss_gain: float
    baseline_brier: float = Field(ge=0.0)
    glm_brier: float = Field(ge=0.0)
    brier_gain: float


class HazardGlmCoefficient(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    feature_name: str
    coefficient: float


class HazardGlmAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    event_type: str
    feature_profile: str
    dataset_name: str
    aggregation_mode: str
    round_ids: list[str]
    round_count: int = Field(ge=2)
    row_count: int = Field(ge=1)
    weighted_positive_rate: float = Field(ge=0.0, le=1.0)
    baseline_log_loss: float = Field(ge=0.0)
    glm_log_loss: float = Field(ge=0.0)
    log_loss_gain: float
    baseline_brier: float = Field(ge=0.0)
    glm_brier: float = Field(ge=0.0)
    brier_gain: float
    pooled_baseline_log_loss: float = Field(ge=0.0)
    pooled_glm_log_loss: float = Field(ge=0.0)
    pooled_log_loss_gain: float
    pooled_baseline_brier: float = Field(ge=0.0)
    pooled_glm_brier: float = Field(ge=0.0)
    pooled_brier_gain: float
    feature_names: list[str]
    coefficients: list[HazardGlmCoefficient]
    rounds: list[HazardGlmRoundMetric]
    artifact_path: Path
    report_path: Path


@dataclass(frozen=True)
class HazardGlmSpec:
    event_type: str
    feature_profile: str
    dataset_name: str
    audit_name: str
    feature_names: tuple[str, ...]
    parquet_columns: tuple[str, ...]
    design_matrix_fn: Callable[[pl.DataFrame], tuple[np.ndarray, np.ndarray, np.ndarray]]
    notes: tuple[str, ...]
    negative_ratio: float = 8.0


def _sigmoid(values: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(values, -30.0, 30.0)))


def _weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    return float(np.sum(values * weights) / max(np.sum(weights), 1e-12))


def _weighted_log_loss(labels: np.ndarray, probs: np.ndarray, weights: np.ndarray) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    probs_array = np.clip(np.asarray(probs, dtype=np.float64), 1e-6, 1.0 - 1.0e-6)
    weights_array = np.asarray(weights, dtype=np.float64)
    losses = -(labels_array * np.log(probs_array) + (1.0 - labels_array) * np.log(1.0 - probs_array))
    return _weighted_mean(losses, weights_array)


def _weighted_brier(labels: np.ndarray, probs: np.ndarray, weights: np.ndarray) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    probs_array = np.asarray(probs, dtype=np.float64)
    weights_array = np.asarray(weights, dtype=np.float64)
    return _weighted_mean((probs_array - labels_array) ** 2, weights_array)


def _weighted_standardize(
    features: np.ndarray,
    weights: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    weight_total = max(float(np.sum(weights)), 1e-12)
    means = np.sum(features * weights[:, None], axis=0) / weight_total
    centered = features - means[None, :]
    variances = np.sum((centered**2) * weights[:, None], axis=0) / weight_total
    scales = np.sqrt(np.maximum(variances, 1e-6))
    return means, scales


def _fit_weighted_logistic_regression(
    features: np.ndarray,
    labels: np.ndarray,
    weights: np.ndarray,
    *,
    ridge_lambda: float,
    max_iter: int,
    tol: float,
) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    means, scales = _weighted_standardize(features, weights)
    normalized = (features - means[None, :]) / scales[None, :]
    design = np.concatenate(
        [np.ones((normalized.shape[0], 1), dtype=np.float64), normalized],
        axis=1,
    )
    beta = np.zeros(design.shape[1], dtype=np.float64)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    for _ in range(max_iter):
        logits = design @ beta
        probs = _sigmoid(logits)
        residual = weights * (probs - labels)
        grad = design.T @ residual
        grad[1:] += ridge_lambda * beta[1:]
        curvature = weights * probs * (1.0 - probs)
        hessian = design.T @ (design * curvature[:, None])
        hessian[1:, 1:] += ridge_lambda * np.eye(design.shape[1] - 1, dtype=np.float64)
        delta = np.linalg.solve(hessian + 1e-6 * penalty, grad)
        beta -= delta
        if float(np.max(np.abs(delta))) < tol:
            break
    return float(beta[0]), np.asarray(beta[1:], dtype=np.float64), means, scales


def _predict_logistic(
    features: np.ndarray,
    intercept: float,
    coefficients: np.ndarray,
    means: np.ndarray,
    scales: np.ndarray,
) -> np.ndarray:
    normalized = (features - means[None, :]) / scales[None, :]
    return np.asarray(_sigmoid(intercept + normalized @ coefficients), dtype=np.float64)


def _float_column(frame: pl.DataFrame, name: str) -> np.ndarray:
    return (
        frame.get_column(name)
        .cast(pl.Float64, strict=False)
        .fill_null(0.0)
        .to_numpy()
        .astype(np.float64)
    )


def _bool_column(frame: pl.DataFrame, name: str) -> np.ndarray:
    return (
        frame.get_column(name)
        .cast(pl.Float64, strict=False)
        .fill_null(0.0)
        .to_numpy()
        .astype(np.float64)
    )


def _safe_ratio(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    return np.asarray(numerator / np.maximum(denominator, 1.0), dtype=np.float64)


def _birth_design_matrix(frame: pl.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    current_is_forest = (
        frame.get_column("current_class").to_numpy().astype(np.int64) == 4
    ).astype(np.float64)
    feature_arrays = [
        _bool_column(frame, "coast"),
        _float_column(frame, "settlement_proximity"),
        _float_column(frame, "maritime_access"),
        _float_column(frame, "frontier_score"),
        _float_column(frame, "forest_density"),
        _float_column(frame, "mountain_density"),
        _float_column(frame, "settlement_neighbors"),
        _float_column(frame, "port_neighbors"),
        _float_column(frame, "ruin_neighbors"),
        _float_column(frame, "forest_neighbors"),
        current_is_forest,
    ]
    features = np.stack(feature_arrays, axis=1).astype(np.float64)
    labels = _float_column(frame, "label")
    weights = _float_column(frame, "sample_weight")
    return features, labels, weights


def _collapse_design_matrix(frame: pl.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    current_is_port = (
        frame.get_column("current_class").to_numpy().astype(np.int64) == 2
    ).astype(np.float64)
    population_before = _float_column(frame, "population_before")
    food_before = _float_column(frame, "food_before")
    wealth_before = _float_column(frame, "wealth_before")
    defense_before = _float_column(frame, "defense_before")
    feature_arrays = [
        _bool_column(frame, "coast"),
        _float_column(frame, "settlement_proximity"),
        _float_column(frame, "maritime_access"),
        _float_column(frame, "frontier_score"),
        _float_column(frame, "forest_density"),
        _float_column(frame, "mountain_density"),
        _float_column(frame, "settlement_neighbors"),
        _float_column(frame, "port_neighbors"),
        _float_column(frame, "ruin_neighbors"),
        _float_column(frame, "forest_neighbors"),
        current_is_port,
        np.log1p(np.maximum(population_before, 0.0)),
        np.log1p(np.maximum(food_before, 0.0)),
        np.log1p(np.maximum(wealth_before, 0.0)),
        np.log1p(np.maximum(defense_before, 0.0)),
        _safe_ratio(food_before, population_before),
        _safe_ratio(wealth_before, population_before),
        _safe_ratio(defense_before, population_before),
    ]
    features = np.stack(feature_arrays, axis=1).astype(np.float64)
    labels = _float_column(frame, "label")
    weights = _float_column(frame, "sample_weight")
    return features, labels, weights


def _collapse_observed_design_matrix(
    frame: pl.DataFrame,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    current_is_port = (
        frame.get_column("current_class").to_numpy().astype(np.int64) == 2
    ).astype(np.float64)
    feature_arrays = [
        _bool_column(frame, "coast"),
        _float_column(frame, "settlement_proximity"),
        _float_column(frame, "maritime_access"),
        _float_column(frame, "frontier_score"),
        _float_column(frame, "forest_density"),
        _float_column(frame, "mountain_density"),
        _float_column(frame, "settlement_neighbors"),
        _float_column(frame, "port_neighbors"),
        _float_column(frame, "ruin_neighbors"),
        _float_column(frame, "forest_neighbors"),
        current_is_port,
    ]
    features = np.stack(feature_arrays, axis=1).astype(np.float64)
    labels = _float_column(frame, "label")
    weights = _float_column(frame, "sample_weight")
    return features, labels, weights


HAZARD_GLM_SPECS: dict[tuple[str, str], HazardGlmSpec] = {
    ("birth", "default"): HazardGlmSpec(
        event_type="birth",
        feature_profile="default",
        dataset_name="f1_birth_riskset_nr8_v1",
        audit_name="f1_birth_glm_staticlocal_audit_v01",
        feature_names=(
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
            "current_is_forest",
        ),
        parquet_columns=(
            "round_id",
            "label",
            "sample_weight",
            "current_class",
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
        ),
        design_matrix_fn=_birth_design_matrix,
        notes=(
            "evaluation is leave-one-round-out on the weighted sampled birth risk set",
            "birth feature set uses static spatial context plus local yearly neighborhood counts",
        ),
    ),
    ("collapse", "full"): HazardGlmSpec(
        event_type="collapse",
        feature_profile="full",
        dataset_name="f1_collapse_riskset_nr8_v1",
        audit_name="f1_collapse_glm_staticlocal_audit_v01",
        feature_names=(
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
            "current_is_port",
            "log_population_before",
            "log_food_before",
            "log_wealth_before",
            "log_defense_before",
            "food_per_population",
            "wealth_per_population",
            "defense_per_population",
        ),
        parquet_columns=(
            "round_id",
            "label",
            "sample_weight",
            "current_class",
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
            "population_before",
            "food_before",
            "wealth_before",
            "defense_before",
        ),
        design_matrix_fn=_collapse_design_matrix,
        notes=(
            "evaluation is leave-one-round-out on the weighted sampled collapse risk set",
            "collapse feature set adds pre-event settlement state because starvation and fragility are not visible in static map features alone",
        ),
    ),
    ("collapse", "observed"): HazardGlmSpec(
        event_type="collapse",
        feature_profile="observed",
        dataset_name="f1_collapse_riskset_nr8_v1",
        audit_name="f1_collapse_glm_observed_audit_v01",
        feature_names=(
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
            "current_is_port",
        ),
        parquet_columns=(
            "round_id",
            "label",
            "sample_weight",
            "current_class",
            "coast",
            "settlement_proximity",
            "maritime_access",
            "frontier_score",
            "forest_density",
            "mountain_density",
            "settlement_neighbors",
            "port_neighbors",
            "ruin_neighbors",
            "forest_neighbors",
        ),
        design_matrix_fn=_collapse_observed_design_matrix,
        notes=(
            "evaluation is leave-one-round-out on the weighted sampled collapse risk set",
            "observed collapse feature set removes hidden settlement-state columns and keeps only structural context visible in replay frames and approximable in live-safe models",
        ),
    ),
}


def supported_hazard_glm_events() -> list[str]:
    return sorted({event_type for event_type, _ in HAZARD_GLM_SPECS})

def supported_hazard_glm_profiles(event_type: str) -> list[str]:
    normalized_event = event_type.strip().lower()
    return sorted(
        profile
        for event_name, profile in HAZARD_GLM_SPECS
        if event_name == normalized_event
    )


def resolve_hazard_glm_spec(
    event_type: str,
    feature_profile: str | None = None,
) -> HazardGlmSpec:
    normalized_event = event_type.strip().lower()
    normalized_profile = (
        feature_profile.strip().lower()
        if feature_profile is not None
        else {"birth": "default", "collapse": "full"}.get(normalized_event, "default")
    )
    spec = HAZARD_GLM_SPECS.get((normalized_event, normalized_profile))
    if spec is None:
        raise ValueError(
            f"unsupported hazard glm spec: event={event_type} profile={normalized_profile}",
        )
    return spec


def _render_report(result: HazardGlmAuditResult, spec: HazardGlmSpec) -> str:
    lines = [
        f"hazard-glm-audit {result.audit_name}",
        "",
        f"event_type: {result.event_type}",
        f"feature_profile: {result.feature_profile}",
        f"dataset: {result.dataset_name}",
        f"rounds: {result.round_count}",
        f"rows: {result.row_count}",
        f"aggregation_mode: {result.aggregation_mode}",
        f"weighted_positive_rate: {result.weighted_positive_rate:.6f}",
        f"round_mean_baseline_log_loss: {result.baseline_log_loss:.6f}",
        f"round_mean_glm_log_loss: {result.glm_log_loss:.6f}",
        f"round_mean_log_loss_gain: {result.log_loss_gain:.6f}",
        f"round_mean_baseline_brier: {result.baseline_brier:.6f}",
        f"round_mean_glm_brier: {result.glm_brier:.6f}",
        f"round_mean_brier_gain: {result.brier_gain:.6f}",
        f"pooled_baseline_log_loss: {result.pooled_baseline_log_loss:.6f}",
        f"pooled_glm_log_loss: {result.pooled_glm_log_loss:.6f}",
        f"pooled_log_loss_gain: {result.pooled_log_loss_gain:.6f}",
        f"pooled_baseline_brier: {result.pooled_baseline_brier:.6f}",
        f"pooled_glm_brier: {result.pooled_glm_brier:.6f}",
        f"pooled_brier_gain: {result.pooled_brier_gain:.6f}",
        "",
        "notes:",
    ]
    lines.extend(f"- {note}" for note in spec.notes)
    lines.extend(
        [
            "- primary aggregate is equal-round mean because round is the statistical unit",
            "- pooled weighted metrics are secondary diagnostics over the held-out risk-set population",
            "- all positives are kept; negatives are deterministically downsampled and inverse-probability weighted",
            "",
            "coefficients_z_scored_feature_space:",
        ],
    )
    for item in result.coefficients:
        lines.append(f"- {item.feature_name}: {item.coefficient:.6f}")
    lines.append("")
    lines.append("per_round:")
    for metric in result.rounds:
        lines.append(
            (
                f"- round={metric.round_id} rows={metric.row_count} "
                f"weight_sum={metric.population_weight_sum:.1f} "
                f"prev={metric.weighted_positive_rate:.6f} "
                f"baseline_ll={metric.baseline_log_loss:.6f} "
                f"glm_ll={metric.glm_log_loss:.6f} "
                f"gain={metric.log_loss_gain:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def run_hazard_glm_audit(
    paths: WorkspacePaths,
    *,
    event_type: str,
    feature_profile: str | None = None,
    dataset_name: str | None = None,
    audit_name: str | None = None,
    ridge_lambda: float = 1.0,
    max_iter: int = 12,
    tol: float = 1e-5,
) -> HazardGlmAuditResult:
    spec = resolve_hazard_glm_spec(event_type, feature_profile)
    resolved_dataset_name = dataset_name or spec.dataset_name
    resolved_audit_name = audit_name or spec.audit_name
    dataset_dir = paths.dataset_dir(resolved_dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "riskset.parquet"
    if not summary_path.exists() or not index_path.exists():
        build_hazard_riskset_dataset(
            paths,
            event_type=spec.event_type,
            dataset_name=resolved_dataset_name,
            negative_ratio=spec.negative_ratio,
        )
    frame = pl.read_parquet(index_path, columns=list(spec.parquet_columns))
    round_ids = sorted(frame.get_column("round_id").unique().to_list())
    if len(round_ids) < 2:
        raise ValueError(f"{spec.event_type} hazard glm audit requires at least two rounds")

    round_metrics: list[HazardGlmRoundMetric] = []
    pooled_labels: list[np.ndarray] = []
    pooled_baseline_probs: list[np.ndarray] = []
    pooled_glm_probs: list[np.ndarray] = []
    pooled_weights: list[np.ndarray] = []
    for held_out_round_id in round_ids:
        train = frame.filter(pl.col("round_id") != held_out_round_id)
        test = frame.filter(pl.col("round_id") == held_out_round_id)
        train_x, train_y, train_w = spec.design_matrix_fn(train)
        test_x, test_y, test_w = spec.design_matrix_fn(test)
        intercept, coefficients, means, scales = _fit_weighted_logistic_regression(
            train_x,
            train_y,
            train_w,
            ridge_lambda=ridge_lambda,
            max_iter=max_iter,
            tol=tol,
        )
        test_probs = _predict_logistic(test_x, intercept, coefficients, means, scales)
        baseline_prob = np.full(
            test_y.shape,
            fill_value=np.clip(_weighted_mean(train_y, train_w), 1e-6, 1.0 - 1.0e-6),
            dtype=np.float64,
        )
        baseline_log_loss = _weighted_log_loss(test_y, baseline_prob, test_w)
        glm_log_loss = _weighted_log_loss(test_y, test_probs, test_w)
        baseline_brier = _weighted_brier(test_y, baseline_prob, test_w)
        glm_brier = _weighted_brier(test_y, test_probs, test_w)
        pooled_labels.append(test_y)
        pooled_baseline_probs.append(baseline_prob)
        pooled_glm_probs.append(test_probs)
        pooled_weights.append(test_w)
        round_metrics.append(
            HazardGlmRoundMetric(
                round_id=held_out_round_id,
                row_count=int(test.height),
                population_weight_sum=float(np.sum(test_w)),
                weighted_positive_rate=_weighted_mean(test_y, test_w),
                baseline_log_loss=baseline_log_loss,
                glm_log_loss=glm_log_loss,
                log_loss_gain=baseline_log_loss - glm_log_loss,
                baseline_brier=baseline_brier,
                glm_brier=glm_brier,
                brier_gain=baseline_brier - glm_brier,
            ),
        )

    baseline_log_loss = float(np.mean([metric.baseline_log_loss for metric in round_metrics]))
    glm_log_loss = float(np.mean([metric.glm_log_loss for metric in round_metrics]))
    baseline_brier = float(np.mean([metric.baseline_brier for metric in round_metrics]))
    glm_brier = float(np.mean([metric.glm_brier for metric in round_metrics]))
    pooled_y = np.concatenate(pooled_labels, axis=0)
    pooled_baseline = np.concatenate(pooled_baseline_probs, axis=0)
    pooled_glm = np.concatenate(pooled_glm_probs, axis=0)
    pooled_w = np.concatenate(pooled_weights, axis=0)
    pooled_baseline_log_loss = _weighted_log_loss(pooled_y, pooled_baseline, pooled_w)
    pooled_glm_log_loss = _weighted_log_loss(pooled_y, pooled_glm, pooled_w)
    pooled_baseline_brier = _weighted_brier(pooled_y, pooled_baseline, pooled_w)
    pooled_glm_brier = _weighted_brier(pooled_y, pooled_glm, pooled_w)

    full_x, full_y, full_w = spec.design_matrix_fn(frame)
    intercept, coefficients, _, _ = _fit_weighted_logistic_regression(
        full_x,
        full_y,
        full_w,
        ridge_lambda=ridge_lambda,
        max_iter=max_iter,
        tol=tol,
    )
    coefficient_rows = [
        HazardGlmCoefficient(feature_name="intercept", coefficient=intercept),
        *[
            HazardGlmCoefficient(feature_name=name, coefficient=float(value))
            for name, value in zip(spec.feature_names, coefficients, strict=True)
        ],
    ]
    artifact_dir = paths.artifacts_dir / "family1" / "hazard_glm" / resolved_audit_name
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "result.json"
    report_path = artifact_dir / "report.md"
    result = HazardGlmAuditResult(
        audit_name=resolved_audit_name,
        event_type=spec.event_type,
        feature_profile=spec.feature_profile,
        dataset_name=resolved_dataset_name,
        aggregation_mode="equal_round_mean_primary",
        round_ids=round_ids,
        round_count=len(round_ids),
        row_count=int(frame.height),
        weighted_positive_rate=_weighted_mean(full_y, full_w),
        baseline_log_loss=baseline_log_loss,
        glm_log_loss=glm_log_loss,
        log_loss_gain=baseline_log_loss - glm_log_loss,
        baseline_brier=baseline_brier,
        glm_brier=glm_brier,
        brier_gain=baseline_brier - glm_brier,
        pooled_baseline_log_loss=pooled_baseline_log_loss,
        pooled_glm_log_loss=pooled_glm_log_loss,
        pooled_log_loss_gain=pooled_baseline_log_loss - pooled_glm_log_loss,
        pooled_baseline_brier=pooled_baseline_brier,
        pooled_glm_brier=pooled_glm_brier,
        pooled_brier_gain=pooled_baseline_brier - pooled_glm_brier,
        feature_names=["intercept", *spec.feature_names],
        coefficients=coefficient_rows,
        rounds=round_metrics,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report(result, spec), encoding="utf-8")
    return result


__all__ = [
    "HazardGlmAuditResult",
    "HazardGlmCoefficient",
    "HazardGlmRoundMetric",
    "run_hazard_glm_audit",
    "supported_hazard_glm_events",
    "supported_hazard_glm_profiles",
]
