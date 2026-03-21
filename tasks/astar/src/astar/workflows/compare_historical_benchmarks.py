from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from astar.eval.competition import _bootstrap_ci
from astar.eval.reports import render_historical_benchmark_comparison_report
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import (
    HistoricalBenchmarkComparison,
    HistoricalBenchmarkResult,
    HistoricalBenchmarkSeedDelta,
)


def load_historical_benchmark_result(path: Path) -> HistoricalBenchmarkResult:
    return HistoricalBenchmarkResult.model_validate_json(path.read_text(encoding="utf-8"))


def compare_historical_benchmarks(
    baseline: HistoricalBenchmarkResult,
    candidate: HistoricalBenchmarkResult,
    *,
    n_bootstrap: int = 500,
    seed: int = 0,
    artifact_path: Path | None = None,
) -> HistoricalBenchmarkComparison:
    if baseline.mode != candidate.mode:
        raise ValueError("historical benchmark modes do not match; cannot run paired comparison")
    if baseline.policy_name != candidate.policy_name:
        raise ValueError("historical benchmark policies do not match; cannot run paired comparison")
    if baseline.budget != candidate.budget:
        raise ValueError("historical benchmark budgets do not match; cannot run paired comparison")
    if baseline.episode_seeds != candidate.episode_seeds:
        raise ValueError("historical benchmark episode seeds do not match; cannot run paired comparison")
    baseline_map = {
        (item.round_id, item.seed_index, item.episode_seed): item
        for round_result in baseline.rounds
        for item in round_result.seed_results
    }
    candidate_map = {
        (item.round_id, item.seed_index, item.episode_seed): item
        for round_result in candidate.rounds
        for item in round_result.seed_results
    }
    if set(baseline_map) != set(candidate_map):
        raise ValueError("historical benchmark seed keys do not match; cannot run paired comparison")
    deltas: list[HistoricalBenchmarkSeedDelta] = []
    score_deltas: list[float] = []
    kl_deltas: list[float] = []
    for key in sorted(baseline_map):
        baseline_seed = baseline_map[key]
        candidate_seed = candidate_map[key]
        score_delta = candidate_seed.score - baseline_seed.score
        kl_delta = candidate_seed.weighted_kl - baseline_seed.weighted_kl
        deltas.append(
            HistoricalBenchmarkSeedDelta(
                round_id=baseline_seed.round_id,
                round_number=baseline_seed.round_number,
                seed_index=baseline_seed.seed_index,
                episode_seed=baseline_seed.episode_seed,
                baseline_score=baseline_seed.score,
                candidate_score=candidate_seed.score,
                score_delta=score_delta,
                baseline_weighted_kl=baseline_seed.weighted_kl,
                candidate_weighted_kl=candidate_seed.weighted_kl,
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
    return HistoricalBenchmarkComparison(
        baseline_model_name=baseline.model_name,
        candidate_model_name=candidate.model_name,
        mode=candidate.mode,
        policy_name=candidate.policy_name,
        budget=candidate.budget,
        episode_seeds=candidate.episode_seeds,
        episode_seed=candidate.episode_seed,
        seed_count=len(deltas),
        mean_score_delta=float(np.mean(score_delta_array)),
        mean_weighted_kl_delta=float(np.mean(kl_delta_array)),
        win_rate=float(np.mean(score_delta_array > 0.0)),
        loss_rate=float(np.mean(score_delta_array < 0.0)),
        tie_rate=float(np.mean(score_delta_array == 0.0)),
        score_delta_ci_low=score_delta_ci_low,
        score_delta_ci_high=score_delta_ci_high,
        seeds=deltas,
        artifact_path=artifact_path,
    )


def compare_historical_benchmark_artifacts(
    paths: WorkspacePaths,
    *,
    baseline_path: Path,
    candidate_path: Path,
    n_bootstrap: int = 500,
) -> HistoricalBenchmarkComparison:
    baseline = load_historical_benchmark_result(baseline_path)
    candidate = load_historical_benchmark_result(candidate_path)
    same_model_names = baseline.model_name == candidate.model_name
    run_suffix = (
        f"__baseline_run={baseline.benchmark_name}__candidate_run={candidate.benchmark_name}"
        if same_model_names
        else ""
    )
    comparison_name = (
        f"historical__mode={candidate.mode}"
        f"{'' if candidate.policy_name is None else f'__policy={candidate.policy_name}__budget={candidate.budget}__episode_seeds={'n-a' if candidate.episode_seeds is None else '-'.join(str(item) for item in candidate.episode_seeds)}'}"
        f"__baseline={baseline.model_name}__candidate={candidate.model_name}"
        f"{run_suffix}"
    )
    artifact_path = paths.comparison_result_path(comparison_name)
    result = compare_historical_benchmarks(
        baseline,
        candidate,
        n_bootstrap=n_bootstrap,
        artifact_path=artifact_path,
    )
    report_path = artifact_path.with_suffix(".md")
    result = result.model_copy(update={"report_path": report_path})
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    report_path.write_text(
        render_historical_benchmark_comparison_report(result),
        encoding="utf-8",
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="historical_benchmark_comparison",
            spec_name=comparison_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "seed_count": result.seed_count,
                "mean_score_delta": result.mean_score_delta,
                "mean_weighted_kl_delta": result.mean_weighted_kl_delta,
                "win_rate": result.win_rate,
                "loss_rate": result.loss_rate,
            },
        ),
    )
    return result


__all__ = ["compare_historical_benchmark_artifacts"]
