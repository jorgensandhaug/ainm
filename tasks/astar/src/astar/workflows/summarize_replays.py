from __future__ import annotations

import json
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import cast

import numpy as np

from astar.core.trajectory import ReplayRun
from astar.core.terrain import collapse_internal_grid
from astar.features.geometry import SeedFeatureBundle, compute_round_features
from astar.history.replay.frame_stats import ReplaySeedAggregate, summarize_replay_runs
from astar.history.replay.ingest import load_seed_replay_runs
from astar.history.replay.inspect import inspect_replay_source, inspect_round_replays
from astar.history.summaries.event_summary import (
    ReplayEventRoundSummary,
    ReplayEventSeedSummary,
    build_round_event_summary_from_seed_summaries,
    summarize_replay_event_bundle,
)
from astar.history.summaries.events import ReplayEventTableBundle, extract_replay_event_tables
from astar.history.summaries.hazards import (
    ReplayHazardRoundSummary,
    ReplayHazardSeedSummary,
    build_round_hazard_summary_from_seed_summaries,
    build_seed_hazard_summary_from_seed_features,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    ReplayMeasurementRoundSummary,
    ReplayMeasurementSeedSummary,
    build_replay_measurement_bundle,
    build_round_measurement_summary_from_seed_summaries,
    replay_measurement_payload,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record, save_named_arrays
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import InspectReplaysResult, SummarizeReplaysResult

SeedReplaySummaryResult = tuple[
    int,
    ReplaySeedAggregate,
    ReplayHazardSeedSummary,
    ReplayEventSeedSummary,
    ReplayMeasurementSeedSummary,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
    Path,
]


def _replay_summary_max_workers(replay_seed_count: int) -> int:
    configured = os.environ.get("ASTAR_REPLAY_SUMMARY_MAX_WORKERS")
    if configured is not None:
        parsed = int(configured)
        if parsed < 1:
            raise ValueError("ASTAR_REPLAY_SUMMARY_MAX_WORKERS must be >= 1")
        return min(replay_seed_count, parsed)

    # Replay summarization is memory-dominated; keep default fan-out conservative and
    # let explicit overrides widen parallelism for one-off offline jobs.
    cpu_bound = max(1, min(8, os.cpu_count() or 1))
    return min(replay_seed_count, min(cpu_bound, 2))


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
    event_summary: ReplayEventSeedSummary,
    measurement_summary: ReplayMeasurementSeedSummary,
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
        "event_summary_names": np.asarray(event_summary.summary_names, dtype=np.str_),
        "event_summary_vector": event_summary.summary_vector.astype(np.float64),
        "frame_transition_count": np.asarray(
            [measurement_summary.frame_transition_count],
            dtype=np.int64,
        ),
        "site_transition_count": np.asarray(
            [measurement_summary.site_transition_count],
            dtype=np.int64,
        ),
        "site_opportunity_count": np.asarray(
            [measurement_summary.site_opportunity_count],
            dtype=np.int64,
        ),
        "settlement_measurement_count": np.asarray(
            [measurement_summary.settlement_measurement_count],
            dtype=np.int64,
        ),
        "live_settlement_transition_count": np.asarray(
            [measurement_summary.live_settlement_transition_count],
            dtype=np.int64,
        ),
        "ruin_transition_count": np.asarray(
            [measurement_summary.ruin_transition_count],
            dtype=np.int64,
        ),
        "pairwise_candidate_count": np.asarray(
            [measurement_summary.pairwise_candidate_count],
            dtype=np.int64,
        ),
        "owner_year_count": np.asarray([measurement_summary.owner_year_count], dtype=np.int64),
        "year_shock_count": np.asarray([measurement_summary.year_shock_count], dtype=np.int64),
        "macro_trajectory_count": np.asarray(
            [measurement_summary.macro_trajectory_count],
            dtype=np.int64,
        ),
    }


def _seed_terminal_grid_payload(runs: list[ReplayRun]) -> dict[str, np.ndarray]:
    return {
        "replay_run_ids": np.asarray([run.replay_run_id for run in runs], dtype=np.str_),
        "terminal_grids": np.stack(
            [
                collapse_internal_grid(run.frames[-1].grid).astype(np.int16)
                for run in runs
            ],
            axis=0,
        ),
    }


def _bool_sum(bundle: ReplayEventTableBundle, frame_name: str, column_name: str) -> int:
    frame = getattr(bundle, frame_name)
    if column_name not in frame.columns:
        return 0
    return int(frame.get_column(column_name).sum())


def _event_summary_lines(summary: ReplayEventSeedSummary) -> list[str]:
    return [
        f"- cell_event_count: {summary.cell_event_count}",
        f"- settlement_transition_count: {summary.settlement_transition_count}",
        f"- build_events: {summary.build_event_count}",
        f"- ruin_events: {summary.ruin_event_count}",
        f"- matched_ruin_events: {summary.matched_ruin_event_count}",
        f"- site_ruin_events: {summary.site_ruin_event_count}",
        f"- rebuild_events: {summary.rebuild_event_count}",
        f"- ruin_to_forest_events: {summary.ruin_to_forest_event_count}",
        f"- births: {summary.birth_event_count}",
        f"- settlement_rebuilds: {summary.settlement_rebuild_event_count}",
        f"- collapses: {summary.collapse_event_count}",
        f"- collapse_to_ruin_events: {summary.collapse_to_ruin_event_count}",
        f"- port_gains: {summary.port_gain_event_count}",
        f"- port_losses: {summary.port_loss_event_count}",
        f"- owner_flips: {summary.owner_flip_event_count}",
    ]


def _measurement_payload(bundle: ReplayMeasurementBundle) -> dict[str, np.ndarray]:
    return replay_measurement_payload(bundle)


def _measurement_summary_lines(summary: ReplayMeasurementSeedSummary) -> list[str]:
    return [
        f"- frame_transition_count: {summary.frame_transition_count}",
        f"- site_transition_count: {summary.site_transition_count}",
        f"- site_opportunity_count: {summary.site_opportunity_count}",
        f"- settlement_measurement_count: {summary.settlement_measurement_count}",
        f"- live_settlement_transition_count: {summary.live_settlement_transition_count}",
        f"- ruin_transition_count: {summary.ruin_transition_count}",
        f"- pairwise_candidate_count: {summary.pairwise_candidate_count}",
        f"- owner_year_count: {summary.owner_year_count}",
        f"- year_shock_count: {summary.year_shock_count}",
        f"- macro_trajectory_count: {summary.macro_trajectory_count}",
    ]


def _round_summary_payload(
    hazard_summary: ReplayHazardRoundSummary,
    event_summary: ReplayEventRoundSummary,
    measurement_summary: ReplayMeasurementRoundSummary,
) -> dict[str, object]:
    return {
        "hazard_summary": to_jsonable(hazard_summary),
        "event_summary": to_jsonable(event_summary),
        "measurement_summary": to_jsonable(measurement_summary),
    }


def _from_jsonable_tree(value: object) -> object:
    if isinstance(value, dict):
        return {key: _from_jsonable_tree(item) for key, item in value.items()}
    if isinstance(value, list):
        if not value:
            return value
        converted = [_from_jsonable_tree(item) for item in value]
        if all(
            isinstance(item, (int, float, bool, np.integer, np.floating, np.bool_))
            for item in converted
        ):
            return np.asarray(converted)
        if all(isinstance(item, np.ndarray) for item in converted):
            return np.asarray(converted)
        if all(isinstance(item, (dict, str)) for item in converted):
            return converted
        return converted
    return value


def load_round_replay_summary(
    paths: WorkspacePaths,
    round_id: str,
) -> SummarizeReplaysResult | None:
    round_summary_path = paths.replay_artifact_dir(round_id) / "round_summary.json"
    report_path = paths.replay_artifact_dir(round_id) / "report.md"
    if not round_summary_path.exists() or not report_path.exists():
        return None
    payload = cast(
        dict[str, object],
        _from_jsonable_tree(json.loads(round_summary_path.read_text(encoding="utf-8"))),
    )
    hazard_summary = ReplayHazardRoundSummary.model_validate(payload["hazard_summary"])
    event_summary = ReplayEventRoundSummary.model_validate(payload["event_summary"])
    measurement_summary = ReplayMeasurementRoundSummary.model_validate(
        payload["measurement_summary"]
    )

    ordered_seed_indexes = [item.seed_index for item in hazard_summary.seed_summaries]
    summary_paths = [
        paths.replay_summary_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    cell_event_paths = [
        paths.replay_cell_event_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    settlement_event_paths = [
        paths.replay_settlement_event_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    site_transition_paths = [
        paths.replay_site_transition_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    site_opportunity_paths = [
        paths.replay_site_opportunity_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    settlement_measurement_paths = [
        paths.replay_settlement_measurement_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    live_settlement_transition_paths = [
        paths.replay_live_settlement_transition_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    ruin_transition_paths = [
        paths.replay_ruin_transition_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    pairwise_candidate_paths = [
        paths.replay_pairwise_candidate_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    owner_year_paths = [
        paths.replay_owner_year_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    year_shock_paths = [
        paths.replay_year_shock_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    macro_trajectory_paths = [
        paths.replay_macro_trajectory_path(round_id, seed_index)
        for seed_index in ordered_seed_indexes
    ]
    required_paths = (
        summary_paths
        + cell_event_paths
        + settlement_event_paths
        + site_transition_paths
        + site_opportunity_paths
        + settlement_measurement_paths
        + live_settlement_transition_paths
        + ruin_transition_paths
        + pairwise_candidate_paths
        + owner_year_paths
        + year_shock_paths
        + macro_trajectory_paths
    )
    if not all(path.exists() for path in required_paths):
        return None
    return SummarizeReplaysResult(
        round_id=round_id,
        round_number=hazard_summary.round_number,
        replay_run_count=hazard_summary.replay_run_count,
        replay_seed_count=hazard_summary.replay_seed_count,
        summary_paths=summary_paths,
        cell_event_paths=cell_event_paths,
        settlement_event_paths=settlement_event_paths,
        site_transition_paths=site_transition_paths,
        site_opportunity_paths=site_opportunity_paths,
        settlement_measurement_paths=settlement_measurement_paths,
        live_settlement_transition_paths=live_settlement_transition_paths,
        ruin_transition_paths=ruin_transition_paths,
        pairwise_candidate_paths=pairwise_candidate_paths,
        owner_year_paths=owner_year_paths,
        year_shock_paths=year_shock_paths,
        macro_trajectory_paths=macro_trajectory_paths,
        round_summary_path=round_summary_path,
        report_path=report_path,
        hazard_summary=hazard_summary,
        event_summary=event_summary,
        measurement_summary=measurement_summary,
    )


def _summarize_seed_replays(
    root_path: str,
    round_id: str,
    seed_index: int,
    initial_grid: np.ndarray,
    seed_feature_bundle: SeedFeatureBundle,
) -> SeedReplaySummaryResult:
    paths = WorkspacePaths.from_root(root_path)
    runs = load_seed_replay_runs(paths, round_id, seed_index)
    aggregate = summarize_replay_runs(runs)
    hazard_seed_summary = build_seed_hazard_summary_from_seed_features(
        runs,
        aggregate,
        seed_feature_bundle,
    )
    event_bundle = extract_replay_event_tables(runs)
    event_summary = summarize_replay_event_bundle(event_bundle)
    measurement_bundle = build_replay_measurement_bundle(
        initial_grid,
        seed_feature_bundle,
        runs,
    )
    measurement_summary = measurement_bundle.summary
    summary_path = save_named_arrays(
        paths.replay_summary_path(round_id, seed_index),
        _seed_summary_payload(aggregate, hazard_seed_summary, event_summary, measurement_summary),
    )
    save_named_arrays(
        paths.replay_terminal_grid_path(round_id, seed_index),
        _seed_terminal_grid_payload(runs),
    )
    cell_event_path = paths.replay_cell_event_path(round_id, seed_index)
    settlement_event_path = paths.replay_settlement_event_path(round_id, seed_index)
    site_transition_path = paths.replay_site_transition_path(round_id, seed_index)
    site_opportunity_path = paths.replay_site_opportunity_path(round_id, seed_index)
    settlement_measurement_path = paths.replay_settlement_measurement_path(
        round_id,
        seed_index,
    )
    live_settlement_transition_path = paths.replay_live_settlement_transition_path(
        round_id,
        seed_index,
    )
    ruin_transition_path = paths.replay_ruin_transition_path(round_id, seed_index)
    pairwise_candidate_path = paths.replay_pairwise_candidate_path(round_id, seed_index)
    owner_year_path = paths.replay_owner_year_path(round_id, seed_index)
    year_shock_path = paths.replay_year_shock_path(round_id, seed_index)
    macro_trajectory_path = paths.replay_macro_trajectory_path(round_id, seed_index)
    cell_event_path.parent.mkdir(parents=True, exist_ok=True)
    event_bundle.cell_events.write_parquet(cell_event_path)
    event_bundle.settlement_transitions.write_parquet(settlement_event_path)
    save_named_arrays(site_transition_path, _measurement_payload(measurement_bundle))
    measurement_bundle.site_opportunities.write_parquet(site_opportunity_path)
    measurement_bundle.settlement_measurements.write_parquet(settlement_measurement_path)
    measurement_bundle.live_settlement_transitions.write_parquet(live_settlement_transition_path)
    measurement_bundle.ruin_transitions.write_parquet(ruin_transition_path)
    measurement_bundle.pairwise_candidates.write_parquet(pairwise_candidate_path)
    measurement_bundle.owner_years.write_parquet(owner_year_path)
    measurement_bundle.year_shocks.write_parquet(year_shock_path)
    measurement_bundle.macro_trajectories.write_parquet(macro_trajectory_path)
    return (
        seed_index,
        aggregate,
        hazard_seed_summary,
        event_summary,
        measurement_summary,
        summary_path,
        cell_event_path,
        settlement_event_path,
        site_transition_path,
        site_opportunity_path,
        settlement_measurement_path,
        live_settlement_transition_path,
        ruin_transition_path,
        pairwise_candidate_path,
        owner_year_path,
        year_shock_path,
        macro_trajectory_path,
    )


def summarize_round_replays(
    paths: WorkspacePaths,
    round_id: str,
    *,
    reuse_existing: bool = False,
) -> SummarizeReplaysResult:
    if reuse_existing:
        cached = load_round_replay_summary(paths, round_id)
        if cached is not None:
            return cached
    round_record = read_round_record(paths, round_id)
    round_features = compute_round_features(round_record.round)
    replay_seed_indexes = [
        seed_index
        for seed_index in range(round_record.round.seeds_count)
        if paths.raw_replay_dir(round_id, seed_index).exists()
        and any(paths.raw_replay_dir(round_id, seed_index).glob("*.json"))
    ]
    if not replay_seed_indexes:
        msg = f"no replay runs found for round {round_id}"
        raise ValueError(msg)

    summary_paths: list[Path] = []
    cell_event_paths: list[Path] = []
    settlement_event_paths: list[Path] = []
    site_transition_paths: list[Path] = []
    site_opportunity_paths: list[Path] = []
    settlement_measurement_paths: list[Path] = []
    live_settlement_transition_paths: list[Path] = []
    ruin_transition_paths: list[Path] = []
    pairwise_candidate_paths: list[Path] = []
    owner_year_paths: list[Path] = []
    year_shock_paths: list[Path] = []
    macro_trajectory_paths: list[Path] = []
    aggregates_by_seed: dict[int, ReplaySeedAggregate] = {}
    hazard_summaries_by_seed: dict[int, ReplayHazardSeedSummary] = {}
    event_summaries_by_seed: dict[int, ReplayEventSeedSummary] = {}
    measurement_summaries_by_seed: dict[int, ReplayMeasurementSeedSummary] = {}
    cell_event_paths_by_seed: dict[int, Path] = {}
    settlement_event_paths_by_seed: dict[int, Path] = {}
    site_transition_paths_by_seed: dict[int, Path] = {}
    site_opportunity_paths_by_seed: dict[int, Path] = {}
    settlement_measurement_paths_by_seed: dict[int, Path] = {}
    live_settlement_transition_paths_by_seed: dict[int, Path] = {}
    ruin_transition_paths_by_seed: dict[int, Path] = {}
    pairwise_candidate_paths_by_seed: dict[int, Path] = {}
    owner_year_paths_by_seed: dict[int, Path] = {}
    year_shock_paths_by_seed: dict[int, Path] = {}
    macro_trajectory_paths_by_seed: dict[int, Path] = {}
    max_workers = _replay_summary_max_workers(len(replay_seed_indexes))
    worker_args = [
        (
            str(paths.root),
            round_id,
            seed_index,
            np.asarray(
                round_record.round.initial_states[seed_index].grid,
                dtype=np.int64,
            ),
            round_features.per_seed[seed_index],
        )
        for seed_index in replay_seed_indexes
    ]
    use_processes = (
        max_workers > 1
        and os.environ.get("PYTEST_CURRENT_TEST") is None
    )
    if use_processes:
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(_summarize_seed_replays, *args)
                for args in worker_args
            ]
            seed_results = sorted(
                [future.result() for future in futures],
                key=lambda item: item[0],
            )
    else:
        seed_results = sorted(
            [_summarize_seed_replays(*args) for args in worker_args],
            key=lambda item: item[0],
        )
    for (
        seed_index,
        aggregate,
        hazard_seed_summary,
        event_summary,
        measurement_summary,
        summary_path,
        cell_event_path,
        settlement_event_path,
        site_transition_path,
        site_opportunity_path,
        settlement_measurement_path,
        live_settlement_transition_path,
        ruin_transition_path,
        pairwise_candidate_path,
        owner_year_path,
        year_shock_path,
        macro_trajectory_path,
    ) in seed_results:
        summary_paths.append(summary_path)
        cell_event_paths.append(cell_event_path)
        settlement_event_paths.append(settlement_event_path)
        site_transition_paths.append(site_transition_path)
        site_opportunity_paths.append(site_opportunity_path)
        settlement_measurement_paths.append(settlement_measurement_path)
        live_settlement_transition_paths.append(live_settlement_transition_path)
        ruin_transition_paths.append(ruin_transition_path)
        pairwise_candidate_paths.append(pairwise_candidate_path)
        owner_year_paths.append(owner_year_path)
        year_shock_paths.append(year_shock_path)
        macro_trajectory_paths.append(macro_trajectory_path)
        aggregates_by_seed[seed_index] = aggregate
        hazard_summaries_by_seed[seed_index] = hazard_seed_summary
        event_summaries_by_seed[seed_index] = event_summary
        measurement_summaries_by_seed[seed_index] = measurement_summary
        cell_event_paths_by_seed[seed_index] = cell_event_path
        settlement_event_paths_by_seed[seed_index] = settlement_event_path
        site_transition_paths_by_seed[seed_index] = site_transition_path
        site_opportunity_paths_by_seed[seed_index] = site_opportunity_path
        settlement_measurement_paths_by_seed[seed_index] = settlement_measurement_path
        live_settlement_transition_paths_by_seed[seed_index] = live_settlement_transition_path
        ruin_transition_paths_by_seed[seed_index] = ruin_transition_path
        pairwise_candidate_paths_by_seed[seed_index] = pairwise_candidate_path
        owner_year_paths_by_seed[seed_index] = owner_year_path
        year_shock_paths_by_seed[seed_index] = year_shock_path
        macro_trajectory_paths_by_seed[seed_index] = macro_trajectory_path
    ordered_seed_indexes = sorted(replay_seed_indexes)
    hazard_summary = build_round_hazard_summary_from_seed_summaries(
        round_id,
        round_record.round.round_number,
        [hazard_summaries_by_seed[seed_index] for seed_index in ordered_seed_indexes],
        [aggregates_by_seed[seed_index] for seed_index in ordered_seed_indexes],
    )
    event_round_summary = build_round_event_summary_from_seed_summaries(
        round_id,
        round_record.round.round_number,
        [event_summaries_by_seed[seed_index] for seed_index in ordered_seed_indexes],
    )
    measurement_round_summary = build_round_measurement_summary_from_seed_summaries(
        round_id,
        round_record.round.round_number,
        [measurement_summaries_by_seed[seed_index] for seed_index in ordered_seed_indexes],
    )

    replay_artifact_dir = paths.replay_artifact_dir(round_id)
    replay_artifact_dir.mkdir(parents=True, exist_ok=True)
    round_summary_path = replay_artifact_dir / "round_summary.json"
    report_path = replay_artifact_dir / "report.md"
    round_summary_path.write_text(
        json.dumps(
            _round_summary_payload(hazard_summary, event_round_summary, measurement_round_summary),
            indent=2,
        ),
        encoding="utf-8",
    )
    report_lines = [
        f"# Replay Summary {round_record.round.round_number} {round_id}",
        "",
        f"replay_seed_count: {hazard_summary.replay_seed_count}",
        f"replay_run_count: {hazard_summary.replay_run_count}",
        f"coefficient_mean: {hazard_summary.coefficient_mean.tolist()}",
        f"event_summary_mean: {event_round_summary.summary_mean.tolist()}",
        (
            "measurement_counts: "
            f"frames={measurement_round_summary.frame_transition_count} "
            f"sites={measurement_round_summary.site_transition_count} "
            f"opportunities={measurement_round_summary.site_opportunity_count} "
            f"settlements={measurement_round_summary.settlement_measurement_count} "
            f"live={measurement_round_summary.live_settlement_transition_count} "
            f"ruins={measurement_round_summary.ruin_transition_count} "
            f"pairs={measurement_round_summary.pairwise_candidate_count} "
            f"owners={measurement_round_summary.owner_year_count} "
            f"years={measurement_round_summary.year_shock_count}"
            f" macro={measurement_round_summary.macro_trajectory_count}"
        ),
        "",
    ]
    for seed_summary, summary_path in zip(
        hazard_summary.seed_summaries, summary_paths, strict=True
    ):
        event_summary = event_summaries_by_seed[seed_summary.seed_index]
        measurement_summary = measurement_summaries_by_seed[seed_summary.seed_index]
        cell_event_path = cell_event_paths_by_seed[seed_summary.seed_index]
        settlement_event_path = settlement_event_paths_by_seed[seed_summary.seed_index]
        site_transition_path = site_transition_paths_by_seed[seed_summary.seed_index]
        site_opportunity_path = site_opportunity_paths_by_seed[seed_summary.seed_index]
        settlement_measurement_path = settlement_measurement_paths_by_seed[seed_summary.seed_index]
        live_settlement_transition_path = live_settlement_transition_paths_by_seed[
            seed_summary.seed_index
        ]
        ruin_transition_path = ruin_transition_paths_by_seed[seed_summary.seed_index]
        pairwise_candidate_path = pairwise_candidate_paths_by_seed[seed_summary.seed_index]
        owner_year_path = owner_year_paths_by_seed[seed_summary.seed_index]
        year_shock_path = year_shock_paths_by_seed[seed_summary.seed_index]
        macro_trajectory_path = macro_trajectory_paths_by_seed[seed_summary.seed_index]
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
                f"- cell_event_path: {cell_event_path}",
                f"- settlement_event_path: {settlement_event_path}",
                f"- site_transition_path: {site_transition_path}",
                f"- site_opportunity_path: {site_opportunity_path}",
                f"- settlement_measurement_path: {settlement_measurement_path}",
                f"- live_settlement_transition_path: {live_settlement_transition_path}",
                f"- ruin_transition_path: {ruin_transition_path}",
                f"- pairwise_candidate_path: {pairwise_candidate_path}",
                f"- owner_year_path: {owner_year_path}",
                f"- year_shock_path: {year_shock_path}",
                f"- macro_trajectory_path: {macro_trajectory_path}",
                f"- event_summary_vector: {event_summary.summary_vector.tolist()}",
                *_event_summary_lines(event_summary),
                *_measurement_summary_lines(measurement_summary),
                "",
            ],
        )
    report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    catalog = CatalogDB(paths.catalog_path)
    catalog.log_event(
        CatalogEvent(
            event_kind="replay_summary_built",
            round_id=round_id,
            status="ok",
            artifact_path=round_summary_path,
            payload_json=_round_summary_payload(
                hazard_summary,
                event_round_summary,
                measurement_round_summary,
            ),
        ),
    )

    return SummarizeReplaysResult(
        round_id=round_id,
        round_number=round_record.round.round_number,
        replay_run_count=hazard_summary.replay_run_count,
        replay_seed_count=hazard_summary.replay_seed_count,
        summary_paths=summary_paths,
        cell_event_paths=cell_event_paths,
        settlement_event_paths=settlement_event_paths,
        site_transition_paths=site_transition_paths,
        site_opportunity_paths=site_opportunity_paths,
        settlement_measurement_paths=settlement_measurement_paths,
        live_settlement_transition_paths=live_settlement_transition_paths,
        ruin_transition_paths=ruin_transition_paths,
        pairwise_candidate_paths=pairwise_candidate_paths,
        owner_year_paths=owner_year_paths,
        year_shock_paths=year_shock_paths,
        macro_trajectory_paths=macro_trajectory_paths,
        round_summary_path=round_summary_path,
        report_path=report_path,
        hazard_summary=hazard_summary,
        event_summary=event_round_summary,
        measurement_summary=measurement_round_summary,
    )
