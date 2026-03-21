from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.replay.frame_stats import ReplaySeedAggregate, summarize_replay_runs
from astar.history.replay.ingest import ingest_replays, load_seed_replay_runs
from astar.history.replay.inspect import inspect_replay_source, inspect_round_replays
from astar.history.summaries.hazards import (
    ReplayHazardSeedSummary,
    build_round_hazard_summary,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record, save_named_arrays
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import InspectReplaysResult, SummarizeReplaysResult


def inspect_replays(
    paths: WorkspacePaths,
    round_id: str | None = None,
) -> InspectReplaysResult:
    inspection = inspect_replay_source(paths, round_id=round_id)
    round_inspection = None
    if round_id is not None:
        round_inspection = inspect_round_replays(paths, round_id)
    return InspectReplaysResult(inspection=inspection, round_inspection=round_inspection)


def _seed_summary_payload(
    aggregate: ReplaySeedAggregate,
    hazard_summary: ReplayHazardSeedSummary,
) -> dict[str, np.ndarray]:
    return {
        "replay_run_count": np.asarray([aggregate.replay_run_count], dtype=np.int64),
        "mean_terminal_probs": aggregate.mean_terminal_probs.astype(np.float64),
        "first_built_step": aggregate.first_built_step.astype(np.int64),
        "first_port_step": aggregate.first_port_step.astype(np.int64),
        "first_ruin_step": aggregate.first_ruin_step.astype(np.int64),
        "owner_flip_counts": aggregate.owner_flip_counts.astype(np.int64),
        "survival_curve_mean": aggregate.survival_curve_mean.astype(np.float64),
        "port_curve_mean": aggregate.port_curve_mean.astype(np.float64),
        "ruin_curve_mean": aggregate.ruin_curve_mean.astype(np.float64),
        "build_hazard_by_step": hazard_summary.build_hazard_by_step.astype(np.float64),
        "port_hazard_by_step": hazard_summary.port_hazard_by_step.astype(np.float64),
        "ruin_hazard_by_step": hazard_summary.ruin_hazard_by_step.astype(np.float64),
        "build_hit_rate": hazard_summary.build_hit_rate.astype(np.float64),
        "port_hit_rate": hazard_summary.port_hit_rate.astype(np.float64),
        "ruin_hit_rate": hazard_summary.ruin_hit_rate.astype(np.float64),
        "coefficient_vector": hazard_summary.coefficient_vector.astype(np.float64),
    }


def summarize_round_replays(
    paths: WorkspacePaths,
    round_id: str,
) -> SummarizeReplaysResult:
    round_record = read_round_record(paths, round_id)
    ingest_replays(paths, round_id=round_id)
    round_features = compute_round_features(round_record.round)

    runs_by_seed = {
        seed_index: load_seed_replay_runs(paths, round_id, seed_index)
        for seed_index in range(round_record.round.seeds_count)
    }
    aggregates = sorted(
        [summarize_replay_runs(runs) for runs in runs_by_seed.values() if runs],
        key=lambda item: item.seed_index,
    )
    if not aggregates:
        msg = f"no replay runs found for round {round_id}"
        raise ValueError(msg)

    hazard_summary = build_round_hazard_summary(
        round_id=round_id,
        round_number=round_record.round.round_number,
        runs_by_seed={seed_index: runs for seed_index, runs in runs_by_seed.items() if runs},
        aggregates=aggregates,
        round_features=round_features,
    )

    summary_paths: list[Path] = []
    for seed_summary, aggregate in zip(hazard_summary.seed_summaries, aggregates, strict=True):
        summary_path = save_named_arrays(
            paths.replay_summary_path(round_id, seed_summary.seed_index),
            _seed_summary_payload(aggregate, seed_summary),
        )
        summary_paths.append(summary_path)

    replay_artifact_dir = paths.replay_artifact_dir(round_id)
    replay_artifact_dir.mkdir(parents=True, exist_ok=True)
    round_summary_path = replay_artifact_dir / "round_summary.json"
    report_path = replay_artifact_dir / "report.md"
    round_summary_path.write_text(
        json.dumps(to_jsonable(hazard_summary), indent=2),
        encoding="utf-8",
    )
    report_lines = [
        f"# Replay Summary {round_record.round.round_number} {round_id}",
        "",
        f"replay_seed_count: {hazard_summary.replay_seed_count}",
        f"replay_run_count: {hazard_summary.replay_run_count}",
        f"coefficient_mean: {hazard_summary.coefficient_mean.tolist()}",
        "",
    ]
    for seed_summary, summary_path in zip(
        hazard_summary.seed_summaries, summary_paths, strict=True
    ):
        report_lines.extend(
            [
                f"seed {seed_summary.seed_index}",
                f"- replay_run_count: {seed_summary.replay_run_count}",
                f"- built_hit_rate_mean: {seed_summary.built_hit_rate_mean:.4f}",
                f"- coastal_built_hit_rate_mean: {seed_summary.coastal_built_hit_rate_mean:.4f}",
                f"- inland_built_hit_rate_mean: {seed_summary.inland_built_hit_rate_mean:.4f}",
                f"- port_hit_rate_mean: {seed_summary.port_hit_rate_mean:.4f}",
                f"- ruin_hit_rate_mean: {seed_summary.ruin_hit_rate_mean:.4f}",
                f"- owner_flip_mean: {seed_summary.owner_flip_mean:.4f}",
                f"- summary_path: {summary_path}",
                "",
            ],
        )
    report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    catalog = CatalogDB(paths.catalog_path)
    catalog.try_log_event(
        CatalogEvent(
            event_kind="replay_summary_built",
            round_id=round_id,
            status="ok",
            artifact_path=round_summary_path,
            payload_json=to_jsonable(hazard_summary),
        ),
    )

    return SummarizeReplaysResult(
        round_id=round_id,
        round_number=round_record.round.round_number,
        replay_run_count=hazard_summary.replay_run_count,
        replay_seed_count=hazard_summary.replay_seed_count,
        summary_paths=summary_paths,
        round_summary_path=round_summary_path,
        report_path=report_path,
        hazard_summary=hazard_summary,
    )
