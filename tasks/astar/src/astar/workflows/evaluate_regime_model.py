from __future__ import annotations

import json
import time

from astar.history.episodes.build import build_round_episode
from astar.history.summaries.regime_validation import (
    estimate_behavioral_fingerprint_core_rounds,
    evaluate_regime_rank,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import EvaluateRegimeModelResult


def _render_report_markdown(result: EvaluateRegimeModelResult) -> str:
    lines = [
        "# Regime Model Evaluation",
        "",
        f"- summary_backend: {result.summary_backend}",
        f"- rounds: {result.round_count}",
        f"- summary_dim: {result.summary_dim}",
        f"- max_rank: {result.max_rank}",
        f"- bootstrap_samples: {result.bootstrap_samples}",
        f"- rng_seed: {result.rng_seed}",
        f"- elapsed_seconds: {result.elapsed_seconds:.3f}",
        f"- best_rank_by_reconstruction: {result.best_rank_by_reconstruction}",
        f"- best_rank_by_terminal_l1: {result.best_rank_by_terminal_l1}",
        "",
    ]
    for report in result.rank_reports:
        lines.extend(
            [
                f"## Rank {report.rank}",
                "",
                f"- cumulative_explained_variance: {report.cumulative_explained_variance}",
                f"- mean_reconstruction_rmse: {report.mean_reconstruction_rmse}",
                f"- mean_reconstruction_baseline_rmse: {report.mean_reconstruction_baseline_rmse}",
                "- mean_reconstruction_rmse_improvement: "
                + f"{report.mean_reconstruction_rmse_improvement}",
                f"- mean_coefficient_l2: {report.mean_coefficient_l2}",
                f"- mean_baseline_coefficient_l2: {report.mean_baseline_coefficient_l2}",
                f"- mean_coefficient_l2_improvement: {report.mean_coefficient_l2_improvement}",
                f"- mean_terminal_l1: {report.mean_terminal_l1}",
                f"- mean_baseline_terminal_l1: {report.mean_baseline_terminal_l1}",
                f"- mean_terminal_l1_improvement: {report.mean_terminal_l1_improvement}",
                "",
            ],
        )
    return "\n".join(lines).rstrip() + "\n"


def _best_rank_by_metric(
    result: EvaluateRegimeModelResult,
    attribute_name: str,
) -> int | None:
    best_rank: int | None = None
    best_value: float | None = None
    for report in result.rank_reports:
        value = getattr(report, attribute_name)
        if value is None:
            continue
        if best_value is None or value < best_value:
            best_value = float(value)
            best_rank = int(report.rank)
    return best_rank


def evaluate_regime_model(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 4,
    bootstrap_samples: int = 4,
    rng_seed: int = 0,
    name: str | None = None,
) -> EvaluateRegimeModelResult:
    started_at = time.perf_counter()
    replay_round_ids = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    selected_round_ids = round_ids or replay_round_ids
    episodes = [
        build_round_episode(paths, round_id)
        for round_id in selected_round_ids
    ]
    replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
    if len(replay_episodes) <= 1:
        raise ValueError("regime evaluation requires at least two replay-backed rounds")

    summary_names, round_estimates = estimate_behavioral_fingerprint_core_rounds(
        paths,
        episodes=replay_episodes,
        bootstrap_samples=bootstrap_samples,
        rng_seed=rng_seed,
    )
    round_episodes = {episode.metadata.round_id: episode for episode in replay_episodes}
    max_allowed_rank = max(1, min(max_rank, len(round_estimates) - 1))
    rank_reports = tuple(
        evaluate_regime_rank(
            summary_names,
            round_estimates,
            round_episodes,
            rank=rank,
        )
        for rank in range(1, max_allowed_rank + 1)
    )

    artifact_name = name or f"regime_model_evaluation__rounds={len(round_estimates)}"
    artifact_path = paths.artifacts_dir / "reports" / f"{artifact_name}.json"
    report_path = paths.artifacts_dir / "reports" / f"{artifact_name}.md"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    provisional = EvaluateRegimeModelResult(
        summary_backend="behavioral_fingerprint_core",
        round_ids=[item.round_id for item in round_estimates],
        round_count=len(round_estimates),
        summary_dim=len(summary_names),
        max_rank=max_allowed_rank,
        bootstrap_samples=bootstrap_samples,
        rng_seed=rng_seed,
        elapsed_seconds=float(time.perf_counter() - started_at),
        best_rank_by_reconstruction=None,
        best_rank_by_terminal_l1=None,
        artifact_path=artifact_path,
        report_path=report_path,
        rank_reports=rank_reports,
    )
    result = provisional.model_copy(
        update={
            "best_rank_by_reconstruction": _best_rank_by_metric(
                provisional,
                "mean_reconstruction_rmse",
            ),
            "best_rank_by_terminal_l1": _best_rank_by_metric(
                provisional,
                "mean_terminal_l1",
            ),
        },
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report_markdown(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="science_evaluation",
            spec_name=artifact_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


__all__ = ["evaluate_regime_model"]
