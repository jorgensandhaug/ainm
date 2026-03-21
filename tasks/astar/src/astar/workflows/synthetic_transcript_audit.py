from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.envs import CompetitionEvaluator, GroundTruthBundle, build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids


class SyntheticTranscriptEpisodeMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    sample_index: int = Field(ge=0)
    query_count: int = Field(ge=0)
    evaluated_seed_count: int = Field(ge=1)
    mean_score: float = Field(ge=0.0, le=100.0)
    mean_weighted_kl: float = Field(ge=0.0)


class SyntheticTranscriptRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    episode_count: int = Field(ge=1)
    evaluated_seed_count: int = Field(ge=1)
    mean_query_count: float = Field(ge=0.0)
    mean_score: float = Field(ge=0.0, le=100.0)
    mean_weighted_kl: float = Field(ge=0.0)
    episode_score_std: float = Field(ge=0.0)
    episode_weighted_kl_std: float = Field(ge=0.0)


class SyntheticTranscriptAuditResult(BaseModel):
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
    aggregate_score: float = Field(ge=0.0, le=100.0)
    aggregate_weighted_kl: float = Field(ge=0.0)
    rounds: list[SyntheticTranscriptRoundMetric]
    episodes: list[SyntheticTranscriptEpisodeMetric]
    artifact_path: Path
    report_path: Path


def _render_report(result: SyntheticTranscriptAuditResult) -> str:
    lines = [
        f"synthetic-transcript-audit {result.audit_name}",
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
                f"mean_queries={metric.mean_query_count:.2f} score={metric.mean_score:.6f} "
                f"weighted_kl={metric.mean_weighted_kl:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def _ground_truth_by_round(
    paths: WorkspacePaths,
    round_ids: list[str],
) -> dict[str, GroundTruthBundle]:
    bundles: dict[str, GroundTruthBundle] = {}
    for round_id in round_ids:
        analyses = read_analysis_records(paths, round_id)
        if not analyses:
            raise ValueError(f"round {round_id} has no saved analyses")
        bundles[round_id] = GroundTruthBundle(
            round_id=round_id,
            truths_by_seed={
                seed_index: np.asarray(record.analysis.ground_truth, dtype=np.float64)
                for seed_index, record in sorted(analyses.items())
            },
        )
    return bundles


def run_synthetic_transcript_audit(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: list[str] | None = None,
    dataset_name: str = "f1_synthetic_transcript_audit_coverage_b50_s2_v01",
    audit_name: str = "f1_synthetic_transcript_audit_v01",
    policy_name: str = "coverage",
    samples_per_round: int = 2,
    budget: int = 50,
) -> SyntheticTranscriptAuditResult:
    if samples_per_round <= 0:
        raise ValueError("samples_per_round must be positive")
    if budget <= 0:
        raise ValueError("budget must be positive")

    selected_round_ids = discover_historical_eval_round_ids(paths, round_ids)
    if len(selected_round_ids) < 2:
        raise ValueError("synthetic transcript audit requires at least two analyzed rounds")
    missing_replays = [
        round_id
        for round_id in selected_round_ids
        if not paths.raw_dir.joinpath("replays", round_id).is_dir()
    ]
    if missing_replays:
        raise ValueError(
            "synthetic transcript audit requires replay-backed rounds; "
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
        raise ValueError("synthetic transcript audit requires a dataset index")

    round_context_by_id = {
        round_id: build_round_context_from_detail(read_round_record(paths, round_id).round)
        for round_id in selected_round_ids
    }
    truth_by_round = _ground_truth_by_round(paths, selected_round_ids)
    index_table = pl.read_parquet(dataset.index_path).sort(["round_id", "sample_index"])
    rows_by_round: dict[str, list[dict[str, object]]] = {round_id: [] for round_id in selected_round_ids}
    for row in index_table.iter_rows(named=True):
        rows_by_round[str(row["round_id"])].append(dict(row))

    if any(len(rows_by_round[round_id]) == 0 for round_id in selected_round_ids):
        missing_rounds = [round_id for round_id in selected_round_ids if len(rows_by_round[round_id]) == 0]
        raise ValueError(
            "synthetic transcript dataset is missing held-out episodes for rounds: "
            f"{', '.join(missing_rounds)}",
        )

    evaluator = CompetitionEvaluator()
    episode_metrics: list[SyntheticTranscriptEpisodeMetric] = []
    round_metrics: list[SyntheticTranscriptRoundMetric] = []

    for held_out_round_id in selected_round_ids:
        predictor = build_online_predictor(
            model_name,
            paths=paths,
            historical_round_ids=[round_id for round_id in selected_round_ids if round_id != held_out_round_id],
            policy_name=policy_name,
        )
        round_context = round_context_by_id[held_out_round_id]
        truth_bundle = truth_by_round[held_out_round_id]
        held_out_rows = rows_by_round[held_out_round_id]

        round_episode_scores: list[float] = []
        round_episode_weighted_kls: list[float] = []
        round_query_counts: list[int] = []
        round_seed_count = 0
        round_number = int(round_context.round_number or -1)

        for row in held_out_rows:
            artifact = load_synthetic_episode(
                resolve_synthetic_episode_path(
                    dataset.dataset_dir,
                    Path(str(row["episode_path"])),
                ),
            )
            belief = predictor.init_belief(round_context)
            for observation in artifact.observations:
                belief = predictor.update(belief, observation)
            prediction_bundle = predictor.predict(belief)
            seed_scores = evaluator.score_prediction(prediction_bundle, truth_bundle)
            mean_score = float(np.mean([item.score for item in seed_scores.values()]))
            mean_weighted_kl = float(np.mean([item.weighted_kl for item in seed_scores.values()]))
            evaluated_seed_count = len(seed_scores)
            episode_metrics.append(
                SyntheticTranscriptEpisodeMetric(
                    round_id=held_out_round_id,
                    round_number=round_number,
                    sample_index=int(row["sample_index"]),
                    query_count=int(row["query_count"]),
                    evaluated_seed_count=evaluated_seed_count,
                    mean_score=mean_score,
                    mean_weighted_kl=mean_weighted_kl,
                ),
            )
            round_episode_scores.append(mean_score)
            round_episode_weighted_kls.append(mean_weighted_kl)
            round_query_counts.append(int(row["query_count"]))
            round_seed_count += evaluated_seed_count

        round_metrics.append(
            SyntheticTranscriptRoundMetric(
                round_id=held_out_round_id,
                round_number=round_number,
                episode_count=len(held_out_rows),
                evaluated_seed_count=round_seed_count,
                mean_query_count=float(np.mean(round_query_counts)),
                mean_score=float(np.mean(round_episode_scores)),
                mean_weighted_kl=float(np.mean(round_episode_weighted_kls)),
                episode_score_std=float(np.std(round_episode_scores)),
                episode_weighted_kl_std=float(np.std(round_episode_weighted_kls)),
            ),
        )

    result = SyntheticTranscriptAuditResult(
        audit_name=audit_name,
        model_name=model_name.strip().lower(),
        dataset_name=dataset.dataset_name,
        policy_name=policy_name,
        budget=budget,
        samples_per_round=samples_per_round,
        round_ids=selected_round_ids,
        round_count=len(round_metrics),
        episode_count=len(episode_metrics),
        evaluated_seed_count=sum(item.evaluated_seed_count for item in episode_metrics),
        aggregation_mode="equal_round_mean_over_episode_mean",
        aggregate_score=float(np.mean([item.mean_score for item in round_metrics])),
        aggregate_weighted_kl=float(np.mean([item.mean_weighted_kl for item in round_metrics])),
        rounds=round_metrics,
        episodes=episode_metrics,
        artifact_path=paths.artifacts_dir / "family1" / "surrogate_audit" / audit_name / "result.json",
        report_path=paths.artifacts_dir / "family1" / "surrogate_audit" / audit_name / "report.md",
    )
    result.artifact_path.parent.mkdir(parents=True, exist_ok=True)
    result.artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    result.report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = [
    "SyntheticTranscriptAuditResult",
    "SyntheticTranscriptEpisodeMetric",
    "SyntheticTranscriptRoundMetric",
    "run_synthetic_transcript_audit",
]
