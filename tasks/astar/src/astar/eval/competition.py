from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.score import ScoreBreakdown


class CompetitionAggregate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    episode_count: int = Field(ge=0)
    mean_score: float
    mean_weighted_kl: float
    min_score: float
    max_score: float


class PairedBenchmarkEpisodeDelta(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    episode_seed: int = Field(ge=0)
    baseline_score: float
    candidate_score: float
    score_delta: float
    baseline_weighted_kl: float
    candidate_weighted_kl: float
    weighted_kl_delta: float


class PairedBenchmarkComparison(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    baseline_predictor_name: str
    candidate_predictor_name: str
    policy_name: str
    episode_count: int = Field(ge=0)
    mean_score_delta: float
    mean_weighted_kl_delta: float
    win_rate: float
    loss_rate: float
    tie_rate: float
    score_delta_ci_low: float
    score_delta_ci_high: float
    episodes: list[PairedBenchmarkEpisodeDelta]
    artifact_path: Path | None = None
    report_path: Path | None = None


def aggregate_seed_score_breakdowns(
    score_by_seed: dict[int, ScoreBreakdown],
) -> tuple[float, float]:
    mean_score = sum(item.score for item in score_by_seed.values()) / float(len(score_by_seed))
    mean_weighted_kl = sum(item.weighted_kl for item in score_by_seed.values()) / float(
        len(score_by_seed),
    )
    return (mean_score, mean_weighted_kl)


def aggregate_episode_metrics(
    mean_scores: list[float],
    mean_weighted_kls: list[float],
) -> CompetitionAggregate:
    if not mean_scores or not mean_weighted_kls:
        raise ValueError("at least one episode metric is required")
    return CompetitionAggregate(
        episode_count=len(mean_scores),
        mean_score=sum(mean_scores) / float(len(mean_scores)),
        mean_weighted_kl=sum(mean_weighted_kls) / float(len(mean_weighted_kls)),
        min_score=min(mean_scores),
        max_score=max(mean_scores),
    )


def _bootstrap_ci(values: np.ndarray, *, n_bootstrap: int, seed: int) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    means = np.empty(n_bootstrap, dtype=np.float64)
    for index in range(n_bootstrap):
        sample = rng.choice(values, size=len(values), replace=True)
        means[index] = float(np.mean(sample))
    low, high = np.percentile(means, [2.5, 97.5])
    return (float(low), float(high))


def write_paired_benchmark_comparison(path: Path, result: PairedBenchmarkComparison) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(result.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return path


__all__ = [
    "CompetitionAggregate",
    "PairedBenchmarkComparison",
    "PairedBenchmarkEpisodeDelta",
    "_bootstrap_ci",
    "aggregate_episode_metrics",
    "aggregate_seed_score_breakdowns",
    "write_paired_benchmark_comparison",
]
