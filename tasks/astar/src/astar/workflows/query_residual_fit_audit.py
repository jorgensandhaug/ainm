from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.envs import CompetitionEvaluator, GroundTruthBundle
from astar.features.geometry import compute_round_features
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    _build_static_feature_stack,
    _derive_transcript_features_from_stats,
    _stats_from_observations,
)
from astar.student.predictor.query_residual_specs import (
    QueryResidualModelSpec,
    resolve_query_residual_model_spec,
)
from astar.workflows.query_residual_audit_common import delta_rmse_metrics, ground_truth_by_round
from astar.workflows.model_eval import discover_historical_eval_round_ids


class QueryResidualFitEpisodeMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    sample_index: int = Field(ge=0)
    query_count: int = Field(ge=0)
    evaluated_seed_count: int = Field(ge=1)
    regime_mae: float = Field(ge=0.0)
    regime_mse: float = Field(ge=0.0)
    raw_delta_rmse: float = Field(ge=0.0)
    served_delta_rmse: float = Field(ge=0.0)
    mean_score: float = Field(ge=0.0, le=100.0)
    mean_weighted_kl: float = Field(ge=0.0)


class QueryResidualFitRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    episode_count: int = Field(ge=1)
    evaluated_seed_count: int = Field(ge=1)
    mean_query_count: float = Field(ge=0.0)
    mean_regime_mae: float = Field(ge=0.0)
    mean_regime_mse: float = Field(ge=0.0)
    mean_raw_delta_rmse: float = Field(ge=0.0)
    mean_served_delta_rmse: float = Field(ge=0.0)
    mean_score: float = Field(ge=0.0, le=100.0)
    mean_weighted_kl: float = Field(ge=0.0)


class QueryResidualFitAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    model_name: str
    dataset_name: str
    policy_name: str
    budget: int = Field(ge=1)
    samples_per_round: int = Field(ge=1)
    round_ids: list[str]
    round_count: int = Field(ge=2)
    episode_count: int = Field(ge=1)
    evaluated_seed_count: int = Field(ge=1)
    aggregation_mode: str
    aggregate_regime_mae: float = Field(ge=0.0)
    aggregate_regime_mse: float = Field(ge=0.0)
    aggregate_raw_delta_rmse: float = Field(ge=0.0)
    aggregate_served_delta_rmse: float = Field(ge=0.0)
    aggregate_score: float = Field(ge=0.0, le=100.0)
    aggregate_weighted_kl: float = Field(ge=0.0)
    rounds: list[QueryResidualFitRoundMetric]
    episodes: list[QueryResidualFitEpisodeMetric]
    artifact_path: Path
    report_path: Path


def _render_report(result: QueryResidualFitAuditResult) -> str:
    lines = [
        f"query-residual-fit-audit {result.audit_name}",
        "",
        f"model: {result.model_name}",
        f"dataset: {result.dataset_name}",
        f"policy_name: {result.policy_name}",
        f"budget: {result.budget}",
        f"samples_per_round: {result.samples_per_round}",
        f"rounds: {result.round_count}",
        f"episodes: {result.episode_count}",
        f"evaluated_seed_count: {result.evaluated_seed_count}",
        f"aggregation_mode: {result.aggregation_mode}",
        f"aggregate_regime_mae: {result.aggregate_regime_mae:.6f}",
        f"aggregate_regime_mse: {result.aggregate_regime_mse:.6f}",
        f"aggregate_raw_delta_rmse: {result.aggregate_raw_delta_rmse:.6f}",
        f"aggregate_served_delta_rmse: {result.aggregate_served_delta_rmse:.6f}",
        f"aggregate_score: {result.aggregate_score:.6f}",
        f"aggregate_weighted_kl: {result.aggregate_weighted_kl:.6f}",
        "",
        "per_round:",
    ]
    for metric in result.rounds:
        lines.append(
            (
                f"- round={metric.round_id} round_number={metric.round_number} "
                f"episodes={metric.episode_count} seeds={metric.evaluated_seed_count} "
                f"mean_queries={metric.mean_query_count:.2f} "
                f"regime_mae={metric.mean_regime_mae:.6f} "
                f"raw_delta_rmse={metric.mean_raw_delta_rmse:.6f} "
                f"served_delta_rmse={metric.mean_served_delta_rmse:.6f} "
                f"score={metric.mean_score:.6f} weighted_kl={metric.mean_weighted_kl:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"

def _fit_predictor_from_spec(
    paths: WorkspacePaths,
    *,
    spec: QueryResidualModelSpec,
    round_ids: list[str],
    policy_name: str,
) -> QueryResidualPredictor:
    return QueryResidualPredictor.fit_from_workspace(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=spec.samples_per_round,
        cells_per_seed=spec.cells_per_seed,
        budget_prefixes=spec.budget_prefixes,
        ridge_lambda=spec.ridge_lambda,
        model_name=spec.model_name,
        probability_floor=spec.probability_floor,
        temperature=spec.temperature,
        prior_blend=spec.prior_blend,
        signal_scale=spec.signal_scale,
        min_delta_scale=spec.min_delta_scale,
        residual_class_scale=spec.residual_class_scale,
        teacher_blend=spec.teacher_blend,
        beta_min=spec.beta_min,
        beta_scale=spec.beta_scale,
        feature_variant=spec.feature_variant,
    )


def _delta_rmse_metrics(
    predictor: QueryResidualPredictor,
    round_detail: object,
    static_stacks: dict[int, np.ndarray],
    prior_bundle: object,
    truth_bundle: GroundTruthBundle,
    derived: object,
    inferred_regime: np.ndarray,
) -> tuple[float, float]:
    return delta_rmse_metrics(
        predictor,
        round_detail,
        static_stacks,
        prior_bundle,
        truth_bundle,
        derived,
        inferred_regime,
    )


def run_query_residual_fit_audit(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: list[str] | None = None,
    dataset_name: str = "f1_query_residual_fit_audit_coverage_b50_s2_v01",
    audit_name: str = "f1_query_residual_fit_audit_v01",
    policy_name: str = "coverage",
    samples_per_round: int = 2,
    budget: int = 50,
) -> QueryResidualFitAuditResult:
    spec = resolve_query_residual_model_spec(model_name.strip().lower())
    if spec is None:
        raise ValueError(f"query residual fit audit requires a query_residual model; got {model_name}")
    if samples_per_round <= 0:
        raise ValueError("samples_per_round must be positive")
    if budget <= 0:
        raise ValueError("budget must be positive")

    selected_round_ids = discover_historical_eval_round_ids(paths, round_ids)
    if len(selected_round_ids) < 2:
        raise ValueError("query residual fit audit requires at least two analyzed rounds")
    missing_replays = [
        round_id
        for round_id in selected_round_ids
        if not paths.raw_dir.joinpath("replays", round_id).is_dir()
    ]
    if missing_replays:
        raise ValueError(
            "query residual fit audit requires replay-backed rounds; "
            f"missing replay dirs for: {', '.join(missing_replays)}",
        )

    dataset = build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        round_ids=selected_round_ids,
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
        budget=budget,
    )
    if dataset.index_path is None:
        raise ValueError("query residual fit audit requires a dataset index")

    truth_by_round = ground_truth_by_round(paths, selected_round_ids)
    index_table = pl.read_parquet(dataset.index_path).sort(["round_id", "sample_index"])
    rows_by_round: dict[str, list[dict[str, object]]] = {round_id: [] for round_id in selected_round_ids}
    for row in index_table.iter_rows(named=True):
        rows_by_round[str(row["round_id"])].append(dict(row))
    if any(len(rows_by_round[round_id]) == 0 for round_id in selected_round_ids):
        missing_rounds = [round_id for round_id in selected_round_ids if len(rows_by_round[round_id]) == 0]
        raise ValueError(
            "query residual fit audit dataset is missing held-out episodes for rounds: "
            f"{', '.join(missing_rounds)}",
        )

    evaluator = CompetitionEvaluator()
    episode_metrics: list[QueryResidualFitEpisodeMetric] = []
    round_metrics: list[QueryResidualFitRoundMetric] = []

    for held_out_round_id in selected_round_ids:
        training_round_ids = [round_id for round_id in selected_round_ids if round_id != held_out_round_id]
        predictor = _fit_predictor_from_spec(
            paths,
            spec=spec,
            round_ids=training_round_ids,
            policy_name=policy_name,
        )
        round_detail = read_round_record(paths, held_out_round_id).round
        round_number = int(round_detail.round_number or -1)
        features = compute_round_features(round_detail)
        static_stacks = {
            seed_index: _build_static_feature_stack(round_detail, features, seed_index)
            for seed_index in truth_by_round[held_out_round_id].truths_by_seed
        }
        prior_bundle = predictor.base_predictor.build_prediction_bundle(round_detail, features)
        truth_bundle = truth_by_round[held_out_round_id]
        held_out_rows = rows_by_round[held_out_round_id]

        round_regime_mae: list[float] = []
        round_regime_mse: list[float] = []
        round_raw_delta_rmse: list[float] = []
        round_served_delta_rmse: list[float] = []
        round_scores: list[float] = []
        round_weighted_kls: list[float] = []
        round_query_counts: list[int] = []
        round_seed_count = 0

        for row in held_out_rows:
            artifact = load_synthetic_episode(
                resolve_synthetic_episode_path(
                    dataset.dataset_dir,
                    Path(str(row["episode_path"])),
                ),
            )
            observations = tuple(artifact.observations)
            derived = _derive_transcript_features_from_stats(
                round_detail,
                features,
                prior_bundle,
                _stats_from_observations(round_detail, observations),
                blur_sigmas=predictor.blur_sigmas,
            )
            inferred_regime = predictor._infer_regime_from_derived(derived)
            target_regime = np.asarray(artifact.regime_vector, dtype=np.float64)
            regime_error = inferred_regime - target_regime
            regime_mae = float(np.mean(np.abs(regime_error)))
            regime_mse = float(np.mean(regime_error * regime_error))
            raw_delta_rmse, served_delta_rmse = _delta_rmse_metrics(
                predictor,
                round_detail,
                static_stacks,
                prior_bundle,
                truth_bundle,
                derived,
                inferred_regime,
            )
            prediction_bundle = predictor._predict_from_derived(round_detail, features, derived)
            seed_scores = evaluator.score_prediction(prediction_bundle, truth_bundle)
            mean_score = float(np.mean([item.score for item in seed_scores.values()]))
            mean_weighted_kl = float(np.mean([item.weighted_kl for item in seed_scores.values()]))
            evaluated_seed_count = len(seed_scores)
            episode_metrics.append(
                QueryResidualFitEpisodeMetric(
                    round_id=held_out_round_id,
                    round_number=round_number,
                    sample_index=int(row["sample_index"]),
                    query_count=int(row["query_count"]),
                    evaluated_seed_count=evaluated_seed_count,
                    regime_mae=regime_mae,
                    regime_mse=regime_mse,
                    raw_delta_rmse=raw_delta_rmse,
                    served_delta_rmse=served_delta_rmse,
                    mean_score=mean_score,
                    mean_weighted_kl=mean_weighted_kl,
                ),
            )
            round_regime_mae.append(regime_mae)
            round_regime_mse.append(regime_mse)
            round_raw_delta_rmse.append(raw_delta_rmse)
            round_served_delta_rmse.append(served_delta_rmse)
            round_scores.append(mean_score)
            round_weighted_kls.append(mean_weighted_kl)
            round_query_counts.append(int(row["query_count"]))
            round_seed_count += evaluated_seed_count

        round_metrics.append(
            QueryResidualFitRoundMetric(
                round_id=held_out_round_id,
                round_number=round_number,
                episode_count=len(held_out_rows),
                evaluated_seed_count=round_seed_count,
                mean_query_count=float(np.mean(round_query_counts)),
                mean_regime_mae=float(np.mean(round_regime_mae)),
                mean_regime_mse=float(np.mean(round_regime_mse)),
                mean_raw_delta_rmse=float(np.mean(round_raw_delta_rmse)),
                mean_served_delta_rmse=float(np.mean(round_served_delta_rmse)),
                mean_score=float(np.mean(round_scores)),
                mean_weighted_kl=float(np.mean(round_weighted_kls)),
            ),
        )

    result = QueryResidualFitAuditResult(
        audit_name=audit_name,
        model_name=spec.model_name,
        dataset_name=dataset.dataset_name,
        policy_name=policy_name,
        budget=budget,
        samples_per_round=samples_per_round,
        round_ids=selected_round_ids,
        round_count=len(round_metrics),
        episode_count=len(episode_metrics),
        evaluated_seed_count=sum(item.evaluated_seed_count for item in episode_metrics),
        aggregation_mode="equal_round_mean_over_episode_mean",
        aggregate_regime_mae=float(np.mean([item.mean_regime_mae for item in round_metrics])),
        aggregate_regime_mse=float(np.mean([item.mean_regime_mse for item in round_metrics])),
        aggregate_raw_delta_rmse=float(np.mean([item.mean_raw_delta_rmse for item in round_metrics])),
        aggregate_served_delta_rmse=float(np.mean([item.mean_served_delta_rmse for item in round_metrics])),
        aggregate_score=float(np.mean([item.mean_score for item in round_metrics])),
        aggregate_weighted_kl=float(np.mean([item.mean_weighted_kl for item in round_metrics])),
        rounds=round_metrics,
        episodes=episode_metrics,
        artifact_path=paths.artifacts_dir / "family1" / "query_residual_fit_audit" / audit_name / "result.json",
        report_path=paths.artifacts_dir / "family1" / "query_residual_fit_audit" / audit_name / "report.md",
    )
    result.artifact_path.parent.mkdir(parents=True, exist_ok=True)
    result.artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    result.report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = ["QueryResidualFitAuditResult", "run_query_residual_fit_audit"]
