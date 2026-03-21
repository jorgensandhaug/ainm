from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl

from astar.features.geometry import compute_round_features
from astar.history.replay.frame_stats import ReplaySeedAggregate, summarize_replay_runs
from astar.history.replay.ingest import load_seed_replay_runs
from astar.history.replay.inspect import inspect_replay_source, inspect_round_replays
from astar.history.summaries.event_summary import (
    ReplayEventRoundSummary,
    ReplayEventSeedSummary,
    build_round_event_summary,
    summarize_replay_event_bundle,
)
from astar.history.summaries.events import ReplayEventTableBundle, extract_replay_event_tables
from astar.history.summaries.hazards import (
    ReplayHazardRoundSummary,
    ReplayHazardSeedSummary,
    build_round_hazard_summary,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    ReplayMeasurementRoundSummary,
    ReplayMeasurementSeedSummary,
    build_replay_measurement_bundle,
    build_round_measurement_summary,
    replay_measurement_payload,
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


def _bool_sum(bundle: ReplayEventTableBundle, frame_name: str, column_name: str) -> int:
    frame = getattr(bundle, frame_name)
    if column_name not in frame.columns:
        return 0
    return int(frame.get_column(column_name).sum())


def _event_summary_lines(bundle: ReplayEventTableBundle) -> list[str]:
    unmatched_ruin_events = int(
        bundle.cell_events.filter(
            pl.col("ruin_created") & (~pl.col("matched_collapse_to_ruin"))
        ).height
    )
    unmatched_rebuild_events = int(
        bundle.cell_events.filter(
            pl.col("rebuilt_from_ruin") & (~pl.col("matched_settlement_rebuild"))
        ).height
    )
    return [
        f"- cell_event_count: {bundle.cell_event_count}",
        f"- settlement_transition_count: {bundle.settlement_transition_count}",
        f"- build_events: {_bool_sum(bundle, 'cell_events', 'built_created')}",
        f"- ruin_events: {_bool_sum(bundle, 'cell_events', 'ruin_created')}",
        f"- rebuild_events: {_bool_sum(bundle, 'cell_events', 'rebuilt_from_ruin')}",
        f"- ruin_to_forest_events: {_bool_sum(bundle, 'cell_events', 'reclaimed_by_forest')}",
        f"- births: {_bool_sum(bundle, 'settlement_transitions', 'birth')}",
        f"- settlement_rebuilds: {_bool_sum(bundle, 'settlement_transitions', 'rebuild')}",
        f"- collapses: {_bool_sum(bundle, 'settlement_transitions', 'collapse')}",
        f"- unmatched_ruin_events: {unmatched_ruin_events}",
        f"- unmatched_rebuild_events: {unmatched_rebuild_events}",
        f"- port_gains: {_bool_sum(bundle, 'settlement_transitions', 'port_gain')}",
        f"- port_losses: {_bool_sum(bundle, 'settlement_transitions', 'port_loss')}",
        f"- owner_flips: {_bool_sum(bundle, 'settlement_transitions', 'owner_flip')}",
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


def summarize_round_replays(
    paths: WorkspacePaths,
    round_id: str,
) -> SummarizeReplaysResult:
    round_record = read_round_record(paths, round_id)
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
    event_bundles_by_seed: dict[int, ReplayEventTableBundle] = {}
    event_summaries_by_seed: dict[int, ReplayEventSeedSummary] = {}
    measurement_bundles_by_seed: dict[int, ReplayMeasurementBundle] = {}
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
    for seed_summary, aggregate in zip(hazard_summary.seed_summaries, aggregates, strict=True):
        event_bundle = extract_replay_event_tables(runs_by_seed[seed_summary.seed_index])
        event_summary = summarize_replay_event_bundle(event_bundle)
        measurement_bundle = build_replay_measurement_bundle(
            np.asarray(
                round_record.round.initial_states[seed_summary.seed_index].grid,
                dtype=np.int64,
            ),
            round_features.per_seed[seed_summary.seed_index],
            runs_by_seed[seed_summary.seed_index],
        )
        measurement_summary = measurement_bundle.summary
        summary_path = save_named_arrays(
            paths.replay_summary_path(round_id, seed_summary.seed_index),
            _seed_summary_payload(aggregate, seed_summary, event_summary, measurement_summary),
        )
        cell_event_path = paths.replay_cell_event_path(round_id, seed_summary.seed_index)
        settlement_event_path = paths.replay_settlement_event_path(
            round_id,
            seed_summary.seed_index,
        )
        site_transition_path = paths.replay_site_transition_path(round_id, seed_summary.seed_index)
        site_opportunity_path = paths.replay_site_opportunity_path(
            round_id,
            seed_summary.seed_index,
        )
        settlement_measurement_path = paths.replay_settlement_measurement_path(
            round_id,
            seed_summary.seed_index,
        )
        live_settlement_transition_path = paths.replay_live_settlement_transition_path(
            round_id,
            seed_summary.seed_index,
        )
        ruin_transition_path = paths.replay_ruin_transition_path(
            round_id,
            seed_summary.seed_index,
        )
        pairwise_candidate_path = paths.replay_pairwise_candidate_path(
            round_id,
            seed_summary.seed_index,
        )
        owner_year_path = paths.replay_owner_year_path(
            round_id,
            seed_summary.seed_index,
        )
        year_shock_path = paths.replay_year_shock_path(round_id, seed_summary.seed_index)
        macro_trajectory_path = paths.replay_macro_trajectory_path(
            round_id,
            seed_summary.seed_index,
        )
        cell_event_path.parent.mkdir(parents=True, exist_ok=True)
        event_bundle.cell_events.write_parquet(cell_event_path)
        event_bundle.settlement_transitions.write_parquet(settlement_event_path)
        save_named_arrays(site_transition_path, _measurement_payload(measurement_bundle))
        measurement_bundle.site_opportunities.write_parquet(site_opportunity_path)
        measurement_bundle.settlement_measurements.write_parquet(settlement_measurement_path)
        measurement_bundle.live_settlement_transitions.write_parquet(
            live_settlement_transition_path
        )
        measurement_bundle.ruin_transitions.write_parquet(ruin_transition_path)
        measurement_bundle.pairwise_candidates.write_parquet(pairwise_candidate_path)
        measurement_bundle.owner_years.write_parquet(owner_year_path)
        measurement_bundle.year_shocks.write_parquet(year_shock_path)
        measurement_bundle.macro_trajectories.write_parquet(macro_trajectory_path)
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
        event_bundles_by_seed[seed_summary.seed_index] = event_bundle
        event_summaries_by_seed[seed_summary.seed_index] = event_summary
        measurement_bundles_by_seed[seed_summary.seed_index] = measurement_bundle
        measurement_summaries_by_seed[seed_summary.seed_index] = measurement_summary
        cell_event_paths_by_seed[seed_summary.seed_index] = cell_event_path
        settlement_event_paths_by_seed[seed_summary.seed_index] = settlement_event_path
        site_transition_paths_by_seed[seed_summary.seed_index] = site_transition_path
        site_opportunity_paths_by_seed[seed_summary.seed_index] = site_opportunity_path
        settlement_measurement_paths_by_seed[seed_summary.seed_index] = settlement_measurement_path
        live_settlement_transition_paths_by_seed[
            seed_summary.seed_index
        ] = live_settlement_transition_path
        ruin_transition_paths_by_seed[seed_summary.seed_index] = ruin_transition_path
        pairwise_candidate_paths_by_seed[seed_summary.seed_index] = pairwise_candidate_path
        owner_year_paths_by_seed[seed_summary.seed_index] = owner_year_path
        year_shock_paths_by_seed[seed_summary.seed_index] = year_shock_path
        macro_trajectory_paths_by_seed[seed_summary.seed_index] = macro_trajectory_path
    event_round_summary = build_round_event_summary(
        round_id,
        round_record.round.round_number,
        list(event_bundles_by_seed.values()),
    )
    measurement_round_summary = build_round_measurement_summary(
        round_id,
        round_record.round.round_number,
        list(measurement_bundles_by_seed.values()),
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
        event_bundle = event_bundles_by_seed[seed_summary.seed_index]
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
                *_event_summary_lines(event_bundle),
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
