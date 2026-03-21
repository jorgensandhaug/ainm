from __future__ import annotations

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.events import ReplayEventTableBundle

EVENT_SUMMARY_NAMES: tuple[str, ...] = (
    "cell_events_per_frame",
    "build_events_per_frame",
    "port_created_events_per_frame",
    "ruin_created_events_per_frame",
    "rebuild_events_per_frame",
    "ruin_to_forest_events_per_frame",
    "cleared_events_per_frame",
    "births_per_frame",
    "settlement_rebuilds_per_frame",
    "collapses_per_frame",
    "collapse_to_ruin_per_frame",
    "port_gains_per_frame",
    "port_losses_per_frame",
    "owner_flips_per_frame",
    "stat_changes_per_frame",
    "changed_settlement_share",
    "mean_population_delta",
    "mean_food_delta",
    "mean_wealth_delta",
    "mean_defense_delta",
    "mean_abs_population_delta",
    "mean_abs_food_delta",
    "mean_abs_wealth_delta",
    "mean_abs_defense_delta",
    "matched_ruin_created_events_per_frame",
    "site_ruin_created_events_per_frame",
)


def _bool_sum(bundle: ReplayEventTableBundle, frame_name: str, column_name: str) -> int:
    frame = getattr(bundle, frame_name)
    if column_name not in frame.columns:
        return 0
    return int(frame.get_column(column_name).sum())


def _mean_column(bundle: ReplayEventTableBundle, column_name: str, *, absolute: bool = False) -> float:
    frame = bundle.settlement_transitions
    if column_name not in frame.columns or frame.height == 0:
        return 0.0
    series = frame.get_column(column_name).drop_nulls().cast(float)
    if len(series) == 0:
        return 0.0
    if absolute:
        series = series.abs()
    return float(series.mean() or 0.0)


class ReplayEventSeedSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    frame_transition_count: int = Field(ge=0)
    cell_event_count: int = Field(ge=0)
    settlement_transition_count: int = Field(ge=0)
    build_event_count: int = Field(ge=0)
    port_created_event_count: int = Field(ge=0)
    ruin_event_count: int = Field(ge=0)
    matched_ruin_event_count: int = Field(ge=0)
    site_ruin_event_count: int = Field(ge=0)
    rebuild_event_count: int = Field(ge=0)
    ruin_to_forest_event_count: int = Field(ge=0)
    cleared_event_count: int = Field(ge=0)
    birth_event_count: int = Field(ge=0)
    settlement_rebuild_event_count: int = Field(ge=0)
    collapse_event_count: int = Field(ge=0)
    collapse_to_ruin_event_count: int = Field(ge=0)
    port_gain_event_count: int = Field(ge=0)
    port_loss_event_count: int = Field(ge=0)
    owner_flip_event_count: int = Field(ge=0)
    stat_change_event_count: int = Field(ge=0)
    summary_names: tuple[str, ...]
    summary_vector: np.ndarray


class ReplayEventRoundSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    replay_seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    summary_names: tuple[str, ...]
    summary_matrix: np.ndarray
    summary_mean: np.ndarray
    seed_summaries: list[ReplayEventSeedSummary]


def summarize_replay_event_bundle(bundle: ReplayEventTableBundle) -> ReplayEventSeedSummary:
    frame_denominator = float(max(1, bundle.frame_transition_count))
    settlement_denominator = float(max(1, bundle.settlement_transition_count))

    build_event_count = _bool_sum(bundle, "cell_events", "built_created")
    port_created_event_count = _bool_sum(bundle, "cell_events", "port_created")
    ruin_event_count = _bool_sum(bundle, "cell_events", "ruin_created")
    matched_ruin_event_count = int(
        bundle.cell_events.filter(pl.col("ruin_created") & pl.col("matched_collapse_to_ruin")).height
    )
    site_ruin_event_count = int(
        bundle.cell_events.filter(
            pl.col("ruin_created") & (~pl.col("matched_collapse_to_ruin"))
        ).height
    )
    rebuild_event_count = _bool_sum(bundle, "cell_events", "rebuilt_from_ruin")
    ruin_to_forest_event_count = _bool_sum(bundle, "cell_events", "reclaimed_by_forest")
    cleared_event_count = _bool_sum(bundle, "cell_events", "cleared_to_empty")
    birth_event_count = _bool_sum(bundle, "settlement_transitions", "birth")
    settlement_rebuild_event_count = _bool_sum(bundle, "settlement_transitions", "rebuild")
    collapse_event_count = _bool_sum(bundle, "settlement_transitions", "collapse")
    collapse_to_ruin_event_count = _bool_sum(bundle, "settlement_transitions", "collapse_to_ruin")
    port_gain_event_count = _bool_sum(bundle, "settlement_transitions", "port_gain")
    port_loss_event_count = _bool_sum(bundle, "settlement_transitions", "port_loss")
    owner_flip_event_count = _bool_sum(bundle, "settlement_transitions", "owner_flip")
    stat_change_event_count = _bool_sum(bundle, "settlement_transitions", "stat_change")
    changed_settlement_count = _bool_sum(bundle, "settlement_transitions", "changed")

    summary_vector = np.asarray(
        [
            bundle.cell_event_count / frame_denominator,
            build_event_count / frame_denominator,
            port_created_event_count / frame_denominator,
            ruin_event_count / frame_denominator,
            rebuild_event_count / frame_denominator,
            ruin_to_forest_event_count / frame_denominator,
            cleared_event_count / frame_denominator,
            birth_event_count / frame_denominator,
            settlement_rebuild_event_count / frame_denominator,
            collapse_event_count / frame_denominator,
            collapse_to_ruin_event_count / frame_denominator,
            port_gain_event_count / frame_denominator,
            port_loss_event_count / frame_denominator,
            owner_flip_event_count / frame_denominator,
            stat_change_event_count / frame_denominator,
            changed_settlement_count / settlement_denominator,
            _mean_column(bundle, "population_delta"),
            _mean_column(bundle, "food_delta"),
            _mean_column(bundle, "wealth_delta"),
            _mean_column(bundle, "defense_delta"),
            _mean_column(bundle, "population_delta", absolute=True),
            _mean_column(bundle, "food_delta", absolute=True),
            _mean_column(bundle, "wealth_delta", absolute=True),
            _mean_column(bundle, "defense_delta", absolute=True),
            matched_ruin_event_count / frame_denominator,
            site_ruin_event_count / frame_denominator,
        ],
        dtype=np.float64,
    )

    return ReplayEventSeedSummary(
        round_id=bundle.round_id,
        seed_index=bundle.seed_index,
        replay_run_count=bundle.replay_run_count,
        frame_transition_count=bundle.frame_transition_count,
        cell_event_count=bundle.cell_event_count,
        settlement_transition_count=bundle.settlement_transition_count,
        build_event_count=build_event_count,
        port_created_event_count=port_created_event_count,
        ruin_event_count=ruin_event_count,
        matched_ruin_event_count=matched_ruin_event_count,
        site_ruin_event_count=site_ruin_event_count,
        rebuild_event_count=rebuild_event_count,
        ruin_to_forest_event_count=ruin_to_forest_event_count,
        cleared_event_count=cleared_event_count,
        birth_event_count=birth_event_count,
        settlement_rebuild_event_count=settlement_rebuild_event_count,
        collapse_event_count=collapse_event_count,
        collapse_to_ruin_event_count=collapse_to_ruin_event_count,
        port_gain_event_count=port_gain_event_count,
        port_loss_event_count=port_loss_event_count,
        owner_flip_event_count=owner_flip_event_count,
        stat_change_event_count=stat_change_event_count,
        summary_names=EVENT_SUMMARY_NAMES,
        summary_vector=summary_vector,
    )


def build_round_event_summary(
    round_id: str,
    round_number: int,
    bundles: list[ReplayEventTableBundle],
) -> ReplayEventRoundSummary:
    if not bundles:
        raise ValueError("cannot build round event summary without replay event bundles")
    seed_summaries = [
        summarize_replay_event_bundle(bundle)
        for bundle in sorted(bundles, key=lambda item: item.seed_index)
    ]
    return build_round_event_summary_from_seed_summaries(
        round_id,
        round_number,
        seed_summaries,
    )


def build_round_event_summary_from_seed_summaries(
    round_id: str,
    round_number: int,
    seed_summaries: list[ReplayEventSeedSummary],
) -> ReplayEventRoundSummary:
    summary_matrix = np.stack([item.summary_vector for item in seed_summaries], axis=0)
    return ReplayEventRoundSummary(
        round_id=round_id,
        round_number=round_number,
        replay_seed_count=len(seed_summaries),
        replay_run_count=sum(item.replay_run_count for item in seed_summaries),
        summary_names=EVENT_SUMMARY_NAMES,
        summary_matrix=summary_matrix,
        summary_mean=np.mean(summary_matrix, axis=0),
        seed_summaries=seed_summaries,
    )


__all__ = [
    "EVENT_SUMMARY_NAMES",
    "ReplayEventRoundSummary",
    "ReplayEventSeedSummary",
    "build_round_event_summary",
    "build_round_event_summary_from_seed_summaries",
    "summarize_replay_event_bundle",
]
