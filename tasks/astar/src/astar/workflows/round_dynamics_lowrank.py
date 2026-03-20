from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.manifold import factorize_round_coefficients
from astar.history.summaries.round_coefficients import (
    RoundSemimechanisticCoefficients,
    fit_round_semimechanistic_coefficients,
    seed_empirical_terminal_probs,
    seed_feature_matrix,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable

TARGET_NAMES = ("build", "port", "ruin")


class LowRankTargetMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    target_name: str
    log_loss: float = Field(ge=0.0)
    brier: float = Field(ge=0.0)


class LowRankEvalMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    coefficient_rmse: float = Field(ge=0.0)
    relative_coefficient_rmse: float = Field(ge=0.0)
    mean_log_loss: float = Field(ge=0.0)
    mean_brier: float = Field(ge=0.0)
    target_metrics: list[LowRankTargetMetric]


class LowRankRankMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rank: int = Field(ge=1)
    explained_variance_ratio: float = Field(ge=0.0)
    cumulative_explained_variance_ratio: float = Field(ge=0.0)
    mean_baseline_gain: float
    oracle_gap: float
    oracle_capture_ratio: float
    mean_baseline_brier_gain: float
    oracle_brier_gap: float
    oracle_brier_capture_ratio: float
    evaluation: LowRankEvalMetric


class LowRankRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int | None = None
    sample_count: int = Field(ge=1)
    mean_baseline: LowRankEvalMetric
    oracle_full: LowRankEvalMetric
    rank_metrics: list[LowRankRankMetric]


class RoundDynamicsLowRankAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    audit_scope: str
    projection_mode: str
    round_ids: list[str]
    round_count: int = Field(ge=2)
    coefficient_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    max_rank: int = Field(ge=1)
    singular_values: np.ndarray
    explained_variance_ratio: np.ndarray
    cumulative_explained_variance_ratio: np.ndarray
    mean_baseline: LowRankEvalMetric
    oracle_full: LowRankEvalMetric
    rank_metrics: list[LowRankRankMetric]
    rounds: list[LowRankRoundMetric]
    cross_round_low_rank: str
    artifact_path: Path
    report_path: Path


def _round_terminal_dataset(episode: RoundEpisode) -> tuple[np.ndarray, np.ndarray]:
    feature_rows: list[np.ndarray] = []
    target_rows: list[np.ndarray] = []
    for seed in episode.seeds:
        empirical = seed_empirical_terminal_probs(seed)
        if empirical is None:
            continue
        _, feature_stack = seed_feature_matrix(seed.initial_state)
        feature_rows.append(feature_stack.reshape(feature_stack.shape[0], -1).T.astype(np.float64))
        target_rows.append(
            np.stack(
                [
                    np.asarray(empirical[:, :, 1] + empirical[:, :, 2] + empirical[:, :, 3], dtype=np.float64).reshape(-1),
                    np.asarray(empirical[:, :, 2], dtype=np.float64).reshape(-1),
                    np.asarray(empirical[:, :, 3], dtype=np.float64).reshape(-1),
                ],
                axis=1,
            ),
        )
    if not feature_rows:
        raise ValueError(f"round {episode.metadata.round_id} has no replay-backed regression dataset")
    return np.concatenate(feature_rows, axis=0), np.concatenate(target_rows, axis=0)


def _sigmoid(logits: np.ndarray) -> np.ndarray:
    clipped = np.clip(np.asarray(logits, dtype=np.float64), -40.0, 40.0)
    return 1.0 / (1.0 + np.exp(-clipped))


def _predict_targets(
    coefficient_vector: np.ndarray,
    design_matrix: np.ndarray,
    *,
    feature_dim: int,
) -> np.ndarray:
    vector = np.asarray(coefficient_vector, dtype=np.float64).reshape(-1)
    expected_dim = 3 * (feature_dim + 1)
    if vector.size != expected_dim:
        raise ValueError(f"expected coefficient vector of size {expected_dim}, got {vector.size}")
    predictions: list[np.ndarray] = []
    offset = 0
    for _ in TARGET_NAMES:
        intercept = float(vector[offset])
        offset += 1
        coef = vector[offset : offset + feature_dim]
        offset += feature_dim
        predictions.append(_sigmoid(intercept + design_matrix @ coef))
    return np.stack(predictions, axis=1)


def _binary_log_loss(labels: np.ndarray, probs: np.ndarray) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    probs_array = np.clip(np.asarray(probs, dtype=np.float64), 1e-6, 1.0 - 1.0e-6)
    return float(
        np.mean(-(labels_array * np.log(probs_array) + (1.0 - labels_array) * np.log(1.0 - probs_array))),
    )


def _brier_score(labels: np.ndarray, probs: np.ndarray) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    probs_array = np.asarray(probs, dtype=np.float64)
    return float(np.mean((probs_array - labels_array) ** 2))


def _evaluation_metric(
    coefficient_vector: np.ndarray,
    *,
    true_vector: np.ndarray,
    mean_vector: np.ndarray,
    design_matrix: np.ndarray,
    targets: np.ndarray,
    feature_dim: int,
) -> LowRankEvalMetric:
    predictions = _predict_targets(
        coefficient_vector,
        design_matrix,
        feature_dim=feature_dim,
    )
    mean_rmse = math.sqrt(float(np.mean((np.asarray(mean_vector) - np.asarray(true_vector)) ** 2)))
    rmse = math.sqrt(float(np.mean((np.asarray(coefficient_vector) - np.asarray(true_vector)) ** 2)))
    relative_rmse = 0.0 if mean_rmse <= 1e-12 else rmse / mean_rmse
    target_metrics = [
        LowRankTargetMetric(
            target_name=target_name,
            log_loss=_binary_log_loss(targets[:, index], predictions[:, index]),
            brier=_brier_score(targets[:, index], predictions[:, index]),
        )
        for index, target_name in enumerate(TARGET_NAMES)
    ]
    return LowRankEvalMetric(
        coefficient_rmse=rmse,
        relative_coefficient_rmse=relative_rmse,
        mean_log_loss=float(np.mean([item.log_loss for item in target_metrics])),
        mean_brier=float(np.mean([item.brier for item in target_metrics])),
        target_metrics=target_metrics,
    )


def _aggregate_eval_metrics(
    metrics: list[LowRankEvalMetric],
    weights: list[float],
) -> LowRankEvalMetric:
    if not metrics:
        raise ValueError("cannot aggregate empty metric list")
    weight_array = np.asarray(weights, dtype=np.float64)
    if float(np.sum(weight_array)) <= 0.0:
        raise ValueError("weights must sum to a positive value")

    def _weighted(values: list[float]) -> float:
        return float(np.average(np.asarray(values, dtype=np.float64), weights=weight_array))

    target_metrics: list[LowRankTargetMetric] = []
    for target_name in TARGET_NAMES:
        target_logs = [
            next(item.log_loss for item in metric.target_metrics if item.target_name == target_name)
            for metric in metrics
        ]
        target_briers = [
            next(item.brier for item in metric.target_metrics if item.target_name == target_name)
            for metric in metrics
        ]
        target_metrics.append(
            LowRankTargetMetric(
                target_name=target_name,
                log_loss=_weighted(target_logs),
                brier=_weighted(target_briers),
            ),
        )
    return LowRankEvalMetric(
        coefficient_rmse=_weighted([metric.coefficient_rmse for metric in metrics]),
        relative_coefficient_rmse=_weighted([metric.relative_coefficient_rmse for metric in metrics]),
        mean_log_loss=_weighted([metric.mean_log_loss for metric in metrics]),
        mean_brier=_weighted([metric.mean_brier for metric in metrics]),
        target_metrics=target_metrics,
    )


def _capture_ratio(
    baseline_metric: float,
    oracle_metric: float,
    candidate_metric: float,
) -> float:
    oracle_gain = baseline_metric - oracle_metric
    candidate_gain = baseline_metric - candidate_metric
    if abs(oracle_gain) <= 1e-12:
        return 1.0 if abs(candidate_gain) <= 1e-12 else 0.0
    return float(candidate_gain / oracle_gain)


def _aggregate_rank_metric(
    rank: int,
    rank_evaluations: list[LowRankEvalMetric],
    mean_baseline: LowRankEvalMetric,
    oracle_full: LowRankEvalMetric,
    explained_variance_ratio: list[float],
    cumulative_explained_variance_ratio: list[float],
    weights: list[float],
) -> LowRankRankMetric:
    weight_array = np.asarray(weights, dtype=np.float64)
    evaluation = _aggregate_eval_metrics(rank_evaluations, weights)
    return LowRankRankMetric(
        rank=rank,
        explained_variance_ratio=float(np.average(np.asarray(explained_variance_ratio, dtype=np.float64), weights=weight_array)),
        cumulative_explained_variance_ratio=float(
            np.average(np.asarray(cumulative_explained_variance_ratio, dtype=np.float64), weights=weight_array),
        ),
        mean_baseline_gain=mean_baseline.mean_log_loss - evaluation.mean_log_loss,
        oracle_gap=evaluation.mean_log_loss - oracle_full.mean_log_loss,
        oracle_capture_ratio=_capture_ratio(
            mean_baseline.mean_log_loss,
            oracle_full.mean_log_loss,
            evaluation.mean_log_loss,
        ),
        mean_baseline_brier_gain=mean_baseline.mean_brier - evaluation.mean_brier,
        oracle_brier_gap=evaluation.mean_brier - oracle_full.mean_brier,
        oracle_brier_capture_ratio=_capture_ratio(
            mean_baseline.mean_brier,
            oracle_full.mean_brier,
            evaluation.mean_brier,
        ),
        evaluation=evaluation,
    )


def _singular_value_ratios(singular_values: np.ndarray, *, max_rank: int) -> tuple[np.ndarray, np.ndarray]:
    variance = np.asarray(singular_values, dtype=np.float64) ** 2
    variance_sum = float(np.sum(variance))
    if variance_sum <= 0.0:
        explained = np.zeros(max_rank, dtype=np.float64)
    else:
        explained = variance[:max_rank] / variance_sum
    return explained, np.cumsum(explained)


def _project_onto_basis(
    mean_vector: np.ndarray,
    basis: np.ndarray,
    coefficient_vector: np.ndarray,
) -> np.ndarray:
    centered = np.asarray(coefficient_vector, dtype=np.float64) - np.asarray(mean_vector, dtype=np.float64)
    coords = centered @ np.asarray(basis, dtype=np.float64).T
    return np.asarray(mean_vector, dtype=np.float64) + coords @ np.asarray(basis, dtype=np.float64)


def _low_rank_conclusion(
    mean_baseline: LowRankEvalMetric,
    oracle_full: LowRankEvalMetric,
    rank_metrics: list[LowRankRankMetric],
) -> str:
    oracle_gain = mean_baseline.mean_log_loss - oracle_full.mean_log_loss
    if oracle_gain <= 0.001:
        return "likely"
    for metric in rank_metrics:
        if (
            metric.rank <= 3
            and metric.oracle_capture_ratio >= 0.8
            and metric.cumulative_explained_variance_ratio >= 0.8
        ):
            return "likely"
    for metric in rank_metrics:
        if (
            metric.rank <= 5
            and metric.oracle_capture_ratio >= 0.6
            and metric.cumulative_explained_variance_ratio >= 0.6
        ):
            return "uncertain"
    return "unlikely"


def _render_report(result: RoundDynamicsLowRankAuditResult) -> str:
    lines = [
        f"round-dynamics-lowrank-audit {result.audit_name}",
        "",
        f"scope: {result.audit_scope}",
        f"projection_mode: {result.projection_mode}",
        f"rounds: {result.round_count}",
        f"coefficient_dim: {result.coefficient_dim}",
        f"regime_dim: {result.regime_dim}",
        f"max_rank: {result.max_rank}",
        f"singular_values: {result.singular_values.tolist()}",
        f"explained_variance_ratio: {result.explained_variance_ratio.tolist()}",
        f"cumulative_explained_variance_ratio: {result.cumulative_explained_variance_ratio.tolist()}",
        f"mean_baseline_log_loss: {result.mean_baseline.mean_log_loss:.6f}",
        f"oracle_full_log_loss: {result.oracle_full.mean_log_loss:.6f}",
        f"mean_baseline_brier: {result.mean_baseline.mean_brier:.6f}",
        f"oracle_full_brier: {result.oracle_full.mean_brier:.6f}",
        f"cross_round_low_rank: {result.cross_round_low_rank}",
        "",
        "notes:",
        "- leave-one-round-out over fitted semimechanistic terminal-law coefficient vectors",
        "- low-rank reconstructions use oracle projection of each held-out coefficient vector onto the training basis",
        "- this tests compressibility of cross-round dynamics, not live-time identifiability of the latent regime",
        "",
        "rank_metrics:",
    ]
    for metric in result.rank_metrics:
        lines.append(
            (
                f"- rank={metric.rank} "
                f"ll={metric.evaluation.mean_log_loss:.6f} "
                f"gain_vs_mean={metric.mean_baseline_gain:.6f} "
                f"gap_to_oracle={metric.oracle_gap:.6f} "
                f"capture={metric.oracle_capture_ratio:.4f} "
                f"cum_evr={metric.cumulative_explained_variance_ratio:.4f}"
            ),
        )
    lines.append("")
    lines.append("per_round:")
    for round_metric in result.rounds:
        rank1 = round_metric.rank_metrics[0]
        lines.append(
            (
                f"- round={round_metric.round_id} n={round_metric.sample_count} "
                f"mean_ll={round_metric.mean_baseline.mean_log_loss:.6f} "
                f"oracle_ll={round_metric.oracle_full.mean_log_loss:.6f} "
                f"rank1_ll={rank1.evaluation.mean_log_loss:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def run_round_dynamics_lowrank_audit(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    audit_name: str = "f1_round_dynamics_lowrank_oracle_v1",
    max_rank: int = 5,
) -> RoundDynamicsLowRankAuditResult:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if len(selected_round_ids) < 2:
        raise ValueError("round dynamics low-rank audit requires at least two replay-backed rounds")

    episodes = {round_id: build_round_episode(paths, round_id) for round_id in selected_round_ids}
    coefficient_rows: list[RoundSemimechanisticCoefficients] = []
    datasets_by_round: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    round_numbers: dict[str, int | None] = {}
    for round_id in selected_round_ids:
        episode = episodes[round_id]
        if episode.replay_run_count == 0:
            continue
        coefficient_rows.append(fit_round_semimechanistic_coefficients(episode))
        datasets_by_round[round_id] = _round_terminal_dataset(episode)
        round_numbers[round_id] = episode.metadata.round_number
    if len(coefficient_rows) < 2:
        raise ValueError("round dynamics low-rank audit requires at least two fitted replay-backed rounds")

    coefficient_by_round = {row.round_id: row for row in coefficient_rows}
    ordered_round_ids = [row.round_id for row in coefficient_rows]
    effective_max_rank = max(1, min(max_rank, len(coefficient_rows) - 1))
    full_manifold = factorize_round_coefficients(coefficient_rows, max_rank=effective_max_rank)
    explained_variance_ratio, cumulative_explained_variance_ratio = _singular_value_ratios(
        full_manifold.singular_values,
        max_rank=effective_max_rank,
    )
    feature_dim = int(len(coefficient_rows[0].feature_names))
    coefficient_dim = int(coefficient_rows[0].combined_vector().size)
    regime_dim = int(np.asarray(coefficient_rows[0].regime_vector, dtype=np.float64).size)

    round_metrics: list[LowRankRoundMetric] = []
    for held_out_round_id in ordered_round_ids:
        training_rows = [row for row in coefficient_rows if row.round_id != held_out_round_id]
        training_manifold = factorize_round_coefficients(training_rows, max_rank=effective_max_rank)
        fold_explained, fold_cumulative = _singular_value_ratios(
            training_manifold.singular_values,
            max_rank=effective_max_rank,
        )
        true_vector = coefficient_by_round[held_out_round_id].combined_vector().astype(np.float64)
        mean_vector = training_manifold.mean_vector.astype(np.float64)
        design_matrix, targets = datasets_by_round[held_out_round_id]
        mean_baseline = _evaluation_metric(
            mean_vector,
            true_vector=true_vector,
            mean_vector=mean_vector,
            design_matrix=design_matrix,
            targets=targets,
            feature_dim=feature_dim,
        )
        oracle_full = _evaluation_metric(
            true_vector,
            true_vector=true_vector,
            mean_vector=mean_vector,
            design_matrix=design_matrix,
            targets=targets,
            feature_dim=feature_dim,
        )
        rank_metrics: list[LowRankRankMetric] = []
        for rank in range(1, effective_max_rank + 1):
            reconstructed = _project_onto_basis(
                mean_vector,
                training_manifold.basis[:rank],
                true_vector,
            )
            evaluation = _evaluation_metric(
                reconstructed,
                true_vector=true_vector,
                mean_vector=mean_vector,
                design_matrix=design_matrix,
                targets=targets,
                feature_dim=feature_dim,
            )
            rank_metrics.append(
                LowRankRankMetric(
                    rank=rank,
                    explained_variance_ratio=float(fold_explained[rank - 1]),
                    cumulative_explained_variance_ratio=float(fold_cumulative[rank - 1]),
                    mean_baseline_gain=mean_baseline.mean_log_loss - evaluation.mean_log_loss,
                    oracle_gap=evaluation.mean_log_loss - oracle_full.mean_log_loss,
                    oracle_capture_ratio=_capture_ratio(
                        mean_baseline.mean_log_loss,
                        oracle_full.mean_log_loss,
                        evaluation.mean_log_loss,
                    ),
                    mean_baseline_brier_gain=mean_baseline.mean_brier - evaluation.mean_brier,
                    oracle_brier_gap=evaluation.mean_brier - oracle_full.mean_brier,
                    oracle_brier_capture_ratio=_capture_ratio(
                        mean_baseline.mean_brier,
                        oracle_full.mean_brier,
                        evaluation.mean_brier,
                    ),
                    evaluation=evaluation,
                ),
            )
        round_metrics.append(
            LowRankRoundMetric(
                round_id=held_out_round_id,
                round_number=round_numbers.get(held_out_round_id),
                sample_count=int(design_matrix.shape[0]),
                mean_baseline=mean_baseline,
                oracle_full=oracle_full,
                rank_metrics=rank_metrics,
            ),
        )

    weights = [float(item.sample_count) for item in round_metrics]
    aggregate_mean_baseline = _aggregate_eval_metrics([item.mean_baseline for item in round_metrics], weights)
    aggregate_oracle_full = _aggregate_eval_metrics([item.oracle_full for item in round_metrics], weights)
    aggregate_rank_metrics = [
        _aggregate_rank_metric(
            rank,
            [item.rank_metrics[rank - 1].evaluation for item in round_metrics],
            aggregate_mean_baseline,
            aggregate_oracle_full,
            [item.rank_metrics[rank - 1].explained_variance_ratio for item in round_metrics],
            [item.rank_metrics[rank - 1].cumulative_explained_variance_ratio for item in round_metrics],
            weights,
        )
        for rank in range(1, effective_max_rank + 1)
    ]
    conclusion = _low_rank_conclusion(
        aggregate_mean_baseline,
        aggregate_oracle_full,
        aggregate_rank_metrics,
    )

    artifact_dir = paths.artifacts_dir / "family1" / "lowrank" / audit_name
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "result.json"
    report_path = artifact_dir / "report.md"
    result = RoundDynamicsLowRankAuditResult(
        audit_name=audit_name,
        audit_scope="round_semimechanistic_terminal_logits",
        projection_mode="oracle_holdout_projection",
        round_ids=ordered_round_ids,
        round_count=len(ordered_round_ids),
        coefficient_dim=coefficient_dim,
        regime_dim=regime_dim,
        max_rank=effective_max_rank,
        singular_values=np.asarray(full_manifold.singular_values, dtype=np.float64),
        explained_variance_ratio=np.asarray(explained_variance_ratio, dtype=np.float64),
        cumulative_explained_variance_ratio=np.asarray(cumulative_explained_variance_ratio, dtype=np.float64),
        mean_baseline=aggregate_mean_baseline,
        oracle_full=aggregate_oracle_full,
        rank_metrics=aggregate_rank_metrics,
        rounds=round_metrics,
        cross_round_low_rank=conclusion,
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report(result), encoding="utf-8")
    return result
