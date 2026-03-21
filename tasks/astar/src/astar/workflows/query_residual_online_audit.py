from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.envs import CompetitionEvaluator
from astar.envs.historical import HistoricalReplayOracle
from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import round_regime_summary_vector
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import RoundPredictorAdapter, build_online_predictor
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    _build_static_feature_stack,
    _derive_transcript_features_from_stats,
    _stats_from_observations,
)
from astar.student.predictor.query_residual_specs import resolve_query_residual_model_spec
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode
from astar.workflows.query_residual_audit_common import delta_rmse_metrics, ground_truth_by_round


class QueryResidualOnlineRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    episode_seed: int = Field(ge=0)
    query_count: int = Field(ge=0)
    evaluated_seed_count: int = Field(ge=1)
    regime_mae: float = Field(ge=0.0)
    regime_mse: float = Field(ge=0.0)
    raw_delta_rmse: float = Field(ge=0.0)
    served_delta_rmse: float = Field(ge=0.0)
    mean_score: float = Field(ge=0.0, le=100.0)
    mean_weighted_kl: float = Field(ge=0.0)


class QueryResidualOnlineAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    model_name: str
    policy_name: str
    budget: int = Field(ge=1)
    episode_seed: int = Field(ge=0)
    round_ids: list[str]
    round_count: int = Field(ge=2)
    evaluated_seed_count: int = Field(ge=1)
    aggregation_mode: str
    aggregate_regime_mae: float = Field(ge=0.0)
    aggregate_regime_mse: float = Field(ge=0.0)
    aggregate_raw_delta_rmse: float = Field(ge=0.0)
    aggregate_served_delta_rmse: float = Field(ge=0.0)
    aggregate_score: float = Field(ge=0.0, le=100.0)
    aggregate_weighted_kl: float = Field(ge=0.0)
    rounds: list[QueryResidualOnlineRoundMetric]
    artifact_path: Path
    report_path: Path


def _render_report(result: QueryResidualOnlineAuditResult) -> str:
    lines = [
        f"query-residual-online-audit {result.audit_name}",
        "",
        f"model: {result.model_name}",
        f"policy_name: {result.policy_name}",
        f"budget: {result.budget}",
        f"episode_seed: {result.episode_seed}",
        f"rounds: {result.round_count}",
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
                f"seed={metric.episode_seed} queries={metric.query_count} "
                f"seeds={metric.evaluated_seed_count} regime_mae={metric.regime_mae:.6f} "
                f"raw_delta_rmse={metric.raw_delta_rmse:.6f} "
                f"served_delta_rmse={metric.served_delta_rmse:.6f} "
                f"score={metric.mean_score:.6f} weighted_kl={metric.mean_weighted_kl:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def run_query_residual_online_audit(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: list[str] | None = None,
    audit_name: str = "f1_query_residual_online_audit_v01",
    policy_name: str = "coverage",
    budget: int = 50,
    episode_seed: int = 0,
) -> QueryResidualOnlineAuditResult:
    spec = resolve_query_residual_model_spec(model_name.strip().lower())
    if spec is None:
        raise ValueError(f"query residual online audit requires a query_residual model; got {model_name}")
    if budget <= 0:
        raise ValueError("budget must be positive")

    selected_round_ids = discover_historical_eval_round_ids(paths, round_ids)
    if len(selected_round_ids) < 2:
        raise ValueError("query residual online audit requires at least two analyzed rounds")
    missing_replays = [
        round_id
        for round_id in selected_round_ids
        if not paths.raw_dir.joinpath("replays", round_id).is_dir()
    ]
    if missing_replays:
        raise ValueError(
            "query residual online audit requires replay-backed rounds; "
            f"missing replay dirs for: {', '.join(missing_replays)}",
        )

    truth_by_round = ground_truth_by_round(paths, selected_round_ids)
    target_regime_by_round = {
        round_id: np.asarray(
            round_regime_summary_vector(build_round_episode(paths, round_id)),
            dtype=np.float64,
        )
        for round_id in selected_round_ids
    }
    evaluator = CompetitionEvaluator()
    oracle = HistoricalReplayOracle(paths=paths)
    policy = build_interactive_policy(policy_name)
    round_metrics: list[QueryResidualOnlineRoundMetric] = []

    for held_out_round_id in selected_round_ids:
        training_round_ids = [round_id for round_id in selected_round_ids if round_id != held_out_round_id]
        predictor = build_online_predictor(
            model_name,
            paths=paths,
            historical_round_ids=training_round_ids,
            policy_name=policy_name,
        )
        if not isinstance(predictor, RoundPredictorAdapter) or not isinstance(
            predictor.predictor,
            QueryResidualPredictor,
        ):
            raise TypeError("query residual online audit expected a RoundPredictorAdapter<QueryResidualPredictor>")
        query_predictor = predictor.predictor
        online_episode = run_online_episode(
            oracle,
            round_id=held_out_round_id,
            predictor=predictor,
            policy=policy,
            budget=budget,
            episode_seed=episode_seed,
        )
        round_detail = read_round_record(paths, held_out_round_id).round
        round_number = int(round_detail.round_number or -1)
        features = compute_round_features(round_detail)
        truth_bundle = truth_by_round[held_out_round_id]
        static_stacks = {
            seed_index: _build_static_feature_stack(round_detail, features, seed_index)
            for seed_index in truth_bundle.truths_by_seed
        }
        prior_bundle = query_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        observations = tuple(online_episode.belief.observations)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            prior_bundle,
            _stats_from_observations(round_detail, observations),
            blur_sigmas=query_predictor.blur_sigmas,
        )
        inferred_regime = query_predictor._infer_regime_from_derived(derived)
        target_regime = target_regime_by_round[held_out_round_id]
        regime_error = inferred_regime - target_regime
        raw_delta_rmse, served_delta_rmse = delta_rmse_metrics(
            query_predictor,
            round_detail,
            static_stacks,
            prior_bundle,
            truth_bundle,
            derived,
            inferred_regime,
        )
        seed_scores = evaluator.score_prediction(online_episode.prediction_bundle, truth_bundle)
        round_metrics.append(
            QueryResidualOnlineRoundMetric(
                round_id=held_out_round_id,
                round_number=round_number,
                episode_seed=episode_seed,
                query_count=online_episode.executed_queries,
                evaluated_seed_count=len(seed_scores),
                regime_mae=float(np.mean(np.abs(regime_error))),
                regime_mse=float(np.mean(regime_error * regime_error)),
                raw_delta_rmse=raw_delta_rmse,
                served_delta_rmse=served_delta_rmse,
                mean_score=float(np.mean([item.score for item in seed_scores.values()])),
                mean_weighted_kl=float(np.mean([item.weighted_kl for item in seed_scores.values()])),
            ),
        )

    result = QueryResidualOnlineAuditResult(
        audit_name=audit_name,
        model_name=spec.model_name,
        policy_name=policy.name,
        budget=budget,
        episode_seed=episode_seed,
        round_ids=selected_round_ids,
        round_count=len(round_metrics),
        evaluated_seed_count=sum(item.evaluated_seed_count for item in round_metrics),
        aggregation_mode="equal_round_mean_over_exact_online_episode",
        aggregate_regime_mae=float(np.mean([item.regime_mae for item in round_metrics])),
        aggregate_regime_mse=float(np.mean([item.regime_mse for item in round_metrics])),
        aggregate_raw_delta_rmse=float(np.mean([item.raw_delta_rmse for item in round_metrics])),
        aggregate_served_delta_rmse=float(np.mean([item.served_delta_rmse for item in round_metrics])),
        aggregate_score=float(np.mean([item.mean_score for item in round_metrics])),
        aggregate_weighted_kl=float(np.mean([item.mean_weighted_kl for item in round_metrics])),
        rounds=round_metrics,
        artifact_path=paths.artifacts_dir / "family1" / "query_residual_online_audit" / audit_name / "result.json",
        report_path=paths.artifacts_dir / "family1" / "query_residual_online_audit" / audit_name / "report.md",
    )
    result.artifact_path.parent.mkdir(parents=True, exist_ok=True)
    result.artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    result.report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = ["QueryResidualOnlineAuditResult", "QueryResidualOnlineRoundMetric", "run_query_residual_online_audit"]
