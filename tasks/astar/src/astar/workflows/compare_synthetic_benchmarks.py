from __future__ import annotations

from pathlib import Path

import numpy as np

from astar.eval.competition import (
    PairedBenchmarkComparison,
    PairedBenchmarkEpisodeDelta,
    _bootstrap_ci,
    write_paired_benchmark_comparison,
)
from astar.eval.reports import render_paired_benchmark_comparison_report
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.workflows.results import SyntheticBenchmarkResult


def load_synthetic_benchmark_result(path: Path) -> SyntheticBenchmarkResult:
    return SyntheticBenchmarkResult.model_validate_json(path.read_text(encoding="utf-8"))


def compare_synthetic_benchmarks(
    baseline: SyntheticBenchmarkResult,
    candidate: SyntheticBenchmarkResult,
    *,
    n_bootstrap: int = 500,
    seed: int = 0,
    artifact_path: Path | None = None,
) -> PairedBenchmarkComparison:
    baseline_map = {
        (item.round_id, item.episode_seed): item
        for item in baseline.episodes
    }
    candidate_map = {
        (item.round_id, item.episode_seed): item
        for item in candidate.episodes
    }
    if set(baseline_map) != set(candidate_map):
        raise ValueError("benchmark episode keys do not match; cannot run paired comparison")
    deltas: list[PairedBenchmarkEpisodeDelta] = []
    score_deltas: list[float] = []
    kl_deltas: list[float] = []
    for key in sorted(baseline_map):
        baseline_episode = baseline_map[key]
        candidate_episode = candidate_map[key]
        score_delta = candidate_episode.mean_score - baseline_episode.mean_score
        kl_delta = candidate_episode.mean_weighted_kl - baseline_episode.mean_weighted_kl
        deltas.append(
            PairedBenchmarkEpisodeDelta(
                round_id=baseline_episode.round_id,
                round_number=baseline_episode.round_number,
                episode_seed=baseline_episode.episode_seed,
                baseline_score=baseline_episode.mean_score,
                candidate_score=candidate_episode.mean_score,
                score_delta=score_delta,
                baseline_weighted_kl=baseline_episode.mean_weighted_kl,
                candidate_weighted_kl=candidate_episode.mean_weighted_kl,
                weighted_kl_delta=kl_delta,
            ),
        )
        score_deltas.append(score_delta)
        kl_deltas.append(kl_delta)
    score_delta_array = np.asarray(score_deltas, dtype=np.float64)
    kl_delta_array = np.asarray(kl_deltas, dtype=np.float64)
    score_delta_ci_low, score_delta_ci_high = _bootstrap_ci(
        score_delta_array,
        n_bootstrap=n_bootstrap,
        seed=seed,
    )
    return PairedBenchmarkComparison(
        baseline_predictor_name=baseline.predictor_name,
        candidate_predictor_name=candidate.predictor_name,
        policy_name=candidate.policy_name,
        episode_count=len(deltas),
        mean_score_delta=float(np.mean(score_delta_array)),
        mean_weighted_kl_delta=float(np.mean(kl_delta_array)),
        win_rate=float(np.mean(score_delta_array > 0.0)),
        loss_rate=float(np.mean(score_delta_array < 0.0)),
        tie_rate=float(np.mean(score_delta_array == 0.0)),
        score_delta_ci_low=score_delta_ci_low,
        score_delta_ci_high=score_delta_ci_high,
        episodes=deltas,
        artifact_path=artifact_path,
    )


def compare_benchmark_artifacts(
    paths: WorkspacePaths,
    *,
    baseline_path: Path,
    candidate_path: Path,
    n_bootstrap: int = 500,
) -> PairedBenchmarkComparison:
    baseline = load_synthetic_benchmark_result(baseline_path)
    candidate = load_synthetic_benchmark_result(candidate_path)
    comparison_name = (
        f"baseline={baseline.predictor_name}__candidate={candidate.predictor_name}"
    )
    artifact_path = paths.comparison_result_path(comparison_name)
    result = compare_synthetic_benchmarks(
        baseline,
        candidate,
        n_bootstrap=n_bootstrap,
        artifact_path=artifact_path,
    )
    report_path = artifact_path.with_suffix(".md")
    result = result.model_copy(update={"report_path": report_path})
    write_paired_benchmark_comparison(artifact_path, result)
    report_path.write_text(render_paired_benchmark_comparison_report(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="synthetic_benchmark_comparison",
            spec_name=comparison_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "episode_count": result.episode_count,
                "mean_score_delta": result.mean_score_delta,
                "mean_weighted_kl_delta": result.mean_weighted_kl_delta,
                "win_rate": result.win_rate,
                "loss_rate": result.loss_rate,
            },
        ),
    )
    return result


__all__ = ["compare_benchmark_artifacts"]
