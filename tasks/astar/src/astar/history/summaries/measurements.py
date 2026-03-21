from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid, land_mask, sea_mask
from astar.core.trajectory import ReplayRun
from astar.core.world_state import SettlementFullState
from astar.features.coasts import coast_mask
from astar.features.geometry import SeedFeatureBundle, compute_round_features
from astar.features.reachability import multi_source_distance
from astar.history.replay.ingest import load_seed_replay_runs
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_round_record, save_named_arrays

MAX_LAND_NEIGHBORS = 2
MAX_SEA_NEIGHBORS = 2

SETTLEMENT_MEASUREMENT_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "y": pl.Int64,
    "x": pl.Int64,
    "prev_grid_code": pl.Int64,
    "next_grid_code": pl.Int64,
    "prev_alive": pl.Boolean,
    "next_alive": pl.Boolean,
    "prev_has_port": pl.Boolean,
    "next_has_port": pl.Boolean,
    "prev_owner_id": pl.Int64,
    "next_owner_id": pl.Int64,
    "birth": pl.Boolean,
    "rebuild": pl.Boolean,
    "collapse": pl.Boolean,
    "collapse_to_ruin": pl.Boolean,
    "port_gain": pl.Boolean,
    "port_loss": pl.Boolean,
    "owner_flip": pl.Boolean,
    "changed": pl.Boolean,
    "transition_kind": pl.String,
    "prev_population": pl.Float64,
    "prev_food": pl.Float64,
    "prev_wealth": pl.Float64,
    "prev_defense": pl.Float64,
    "population_delta": pl.Float64,
    "food_delta": pl.Float64,
    "wealth_delta": pl.Float64,
    "defense_delta": pl.Float64,
    "buildable": pl.Float64,
    "coast": pl.Float64,
    "coast_distance": pl.Float64,
    "coast_distance_steps": pl.Int64,
    "coast_distance_unreachable": pl.Boolean,
    "forest_density": pl.Float64,
    "mountain_density": pl.Float64,
    "land_distance_to_settlement_steps": pl.Int64,
    "land_distance_to_settlement_unreachable": pl.Boolean,
    "settlement_proximity": pl.Float64,
    "sea_distance_to_port_steps": pl.Int64,
    "sea_distance_to_port_unreachable": pl.Boolean,
    "maritime_access": pl.Float64,
    "settlement_basin_gap_steps": pl.Int64,
    "settlement_basin_gap_unreachable": pl.Boolean,
    "frontier_score": pl.Float64,
    "nearby_live_count": pl.Int64,
    "nearby_same_owner_count": pl.Int64,
    "nearby_other_owner_count": pl.Int64,
    "nearby_port_count": pl.Int64,
    "nearby_ruin_count": pl.Int64,
}

SITE_OPPORTUNITY_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "y": pl.Int64,
    "x": pl.Int64,
    "prev_grid_code": pl.Int64,
    "next_grid_code": pl.Int64,
    "prev_alive": pl.Boolean,
    "next_alive": pl.Boolean,
    "prev_has_port": pl.Boolean,
    "next_has_port": pl.Boolean,
    "prev_owner_id": pl.Int64,
    "next_owner_id": pl.Int64,
    "prev_ruin": pl.Boolean,
    "buildable": pl.Float64,
    "coast": pl.Float64,
    "coast_distance_steps": pl.Int64,
    "coast_distance_unreachable": pl.Boolean,
    "forest_density": pl.Float64,
    "mountain_density": pl.Float64,
    "land_distance_to_settlement_steps": pl.Int64,
    "land_distance_to_settlement_unreachable": pl.Boolean,
    "settlement_proximity": pl.Float64,
    "sea_distance_to_port_steps": pl.Int64,
    "sea_distance_to_port_unreachable": pl.Boolean,
    "maritime_access": pl.Float64,
    "settlement_basin_gap_steps": pl.Int64,
    "settlement_basin_gap_unreachable": pl.Boolean,
    "frontier_score": pl.Float64,
    "nearby_live_count": pl.Int64,
    "nearby_same_owner_count": pl.Int64,
    "nearby_other_owner_count": pl.Int64,
    "nearby_port_count": pl.Int64,
    "nearby_ruin_count": pl.Int64,
    "birth": pl.Boolean,
    "rebuild": pl.Boolean,
    "site_ruin_created": pl.Boolean,
    "rebuild_port": pl.Boolean,
    "ruin_to_forest": pl.Boolean,
    "ruin_to_empty": pl.Boolean,
    "remain_nonlive": pl.Boolean,
}

LIVE_SETTLEMENT_TRANSITION_SCHEMA: dict[str, pl.DataType] = dict(SETTLEMENT_MEASUREMENT_SCHEMA)

RUIN_TRANSITION_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "y": pl.Int64,
    "x": pl.Int64,
    "ruin_age": pl.Int64,
    "next_grid_code": pl.Int64,
    "buildable": pl.Float64,
    "coast": pl.Float64,
    "coast_distance_steps": pl.Int64,
    "coast_distance_unreachable": pl.Boolean,
    "forest_density": pl.Float64,
    "mountain_density": pl.Float64,
    "land_distance_to_settlement_steps": pl.Int64,
    "land_distance_to_settlement_unreachable": pl.Boolean,
    "settlement_proximity": pl.Float64,
    "sea_distance_to_port_steps": pl.Int64,
    "sea_distance_to_port_unreachable": pl.Boolean,
    "maritime_access": pl.Float64,
    "settlement_basin_gap_steps": pl.Int64,
    "settlement_basin_gap_unreachable": pl.Boolean,
    "frontier_score": pl.Float64,
    "nearby_live_count": pl.Int64,
    "nearby_same_owner_count": pl.Int64,
    "nearby_other_owner_count": pl.Int64,
    "nearby_port_count": pl.Int64,
    "nearby_ruin_count": pl.Int64,
    "remain_ruin": pl.Boolean,
    "rebuild_settlement": pl.Boolean,
    "rebuild_port": pl.Boolean,
    "reclaim_forest": pl.Boolean,
    "fade_empty": pl.Boolean,
    "changed": pl.Boolean,
}

PAIRWISE_CANDIDATE_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "pair_rank": pl.Int64,
    "src_y": pl.Int64,
    "src_x": pl.Int64,
    "dst_y": pl.Int64,
    "dst_x": pl.Int64,
    "land_distance": pl.Int64,
    "sea_distance": pl.Int64,
    "same_owner": pl.Boolean,
    "src_has_port": pl.Boolean,
    "dst_has_port": pl.Boolean,
    "maritime_pair": pl.Boolean,
    "src_population": pl.Float64,
    "src_food": pl.Float64,
    "src_wealth": pl.Float64,
    "src_defense": pl.Float64,
    "dst_population": pl.Float64,
    "dst_food": pl.Float64,
    "dst_wealth": pl.Float64,
    "dst_defense": pl.Float64,
    "dst_population_delta": pl.Float64,
    "dst_food_delta": pl.Float64,
    "dst_wealth_delta": pl.Float64,
    "dst_defense_delta": pl.Float64,
    "dst_owner_flip_next": pl.Boolean,
    "dst_collapse_next": pl.Boolean,
    "dst_port_gain_next": pl.Boolean,
}

OWNER_YEAR_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "owner_id": pl.Int64,
    "settlement_count": pl.Int64,
    "port_count": pl.Int64,
    "coastal_settlement_count": pl.Int64,
    "frontier_settlement_count": pl.Int64,
    "total_population": pl.Float64,
    "total_food": pl.Float64,
    "total_wealth": pl.Float64,
    "total_defense": pl.Float64,
    "mean_frontier_score": pl.Float64,
    "mean_maritime_access": pl.Float64,
    "mean_settlement_proximity": pl.Float64,
    "next_settlement_count": pl.Int64,
    "next_port_count": pl.Int64,
    "settlement_delta": pl.Int64,
    "port_delta": pl.Int64,
    "population_delta": pl.Float64,
    "food_delta": pl.Float64,
    "wealth_delta": pl.Float64,
    "defense_delta": pl.Float64,
}

YEAR_SHOCK_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "live_count": pl.Int64,
    "next_live_count": pl.Int64,
    "birth_count": pl.Int64,
    "rebuild_count": pl.Int64,
    "collapse_count": pl.Int64,
    "collapse_to_ruin_count": pl.Int64,
    "site_ruin_created_count": pl.Int64,
    "owner_flip_count": pl.Int64,
    "port_gain_count": pl.Int64,
    "port_loss_count": pl.Int64,
    "changed_settlement_share": pl.Float64,
    "collapse_rate": pl.Float64,
    "site_ruin_created_rate": pl.Float64,
    "negative_food_share": pl.Float64,
    "mean_population_delta": pl.Float64,
    "mean_food_delta": pl.Float64,
    "mean_wealth_delta": pl.Float64,
    "mean_defense_delta": pl.Float64,
    "sum_population_delta": pl.Float64,
    "sum_food_delta": pl.Float64,
    "sum_wealth_delta": pl.Float64,
    "sum_defense_delta": pl.Float64,
    "food_delta_std": pl.Float64,
    "wealth_delta_std": pl.Float64,
}

MACRO_TRAJECTORY_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "live_count": pl.Int64,
    "port_count": pl.Int64,
    "ruin_count": pl.Int64,
    "built_cell_count": pl.Int64,
    "owner_count": pl.Int64,
    "total_population": pl.Float64,
    "total_food": pl.Float64,
    "total_wealth": pl.Float64,
    "total_defense": pl.Float64,
    "coastal_live_share": pl.Float64,
    "frontier_live_share": pl.Float64,
    "mean_frontier_score": pl.Float64,
    "mean_maritime_access": pl.Float64,
    "next_live_count": pl.Int64,
    "next_port_count": pl.Int64,
    "next_ruin_count": pl.Int64,
    "next_owner_count": pl.Int64,
    "live_delta": pl.Int64,
    "port_delta": pl.Int64,
    "ruin_delta": pl.Int64,
    "owner_delta": pl.Int64,
}


class ReplayMeasurementSeedSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    frame_transition_count: int = Field(ge=0)
    site_transition_count: int = Field(ge=0)
    site_opportunity_count: int = Field(ge=0)
    settlement_measurement_count: int = Field(ge=0)
    live_settlement_transition_count: int = Field(ge=0)
    ruin_transition_count: int = Field(ge=0)
    pairwise_candidate_count: int = Field(ge=0)
    owner_year_count: int = Field(ge=0)
    year_shock_count: int = Field(ge=0)
    macro_trajectory_count: int = Field(ge=0)


class ReplayMeasurementRoundSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    replay_seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    frame_transition_count: int = Field(ge=0)
    site_transition_count: int = Field(ge=0)
    site_opportunity_count: int = Field(ge=0)
    settlement_measurement_count: int = Field(ge=0)
    live_settlement_transition_count: int = Field(ge=0)
    ruin_transition_count: int = Field(ge=0)
    pairwise_candidate_count: int = Field(ge=0)
    owner_year_count: int = Field(ge=0)
    year_shock_count: int = Field(ge=0)
    macro_trajectory_count: int = Field(ge=0)
    seed_summaries: list[ReplayMeasurementSeedSummary]


class ReplayMeasurementBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    frame_transition_count: int = Field(ge=0)
    site_transition_counts_by_step: np.ndarray
    site_opportunities: pl.DataFrame
    settlement_measurements: pl.DataFrame
    live_settlement_transitions: pl.DataFrame
    ruin_transitions: pl.DataFrame
    pairwise_candidates: pl.DataFrame
    owner_years: pl.DataFrame
    year_shocks: pl.DataFrame
    macro_trajectories: pl.DataFrame
    summary: ReplayMeasurementSeedSummary


def _payload_scalar(
    payload: dict[str, np.ndarray],
    name: str,
    default: int,
) -> int:
    if name not in payload:
        return default
    values = np.asarray(payload[name]).reshape(-1)
    if values.size == 0:
        return default
    return int(values[0])


def _read_parquet_or_empty(
    path,
    schema: dict[str, pl.DataType],
) -> pl.DataFrame:
    if path.exists():
        return pl.read_parquet(path)
    return pl.DataFrame(schema=schema)


def _read_parquet_projection(
    path,
    schema: dict[str, pl.DataType],
    *,
    columns: tuple[str, ...] | None = None,
    row_count_hint: int | None = None,
    max_rows: int | None = None,
    sample_seed: int = 0,
    derived_columns: dict[str, pl.Expr] | None = None,
) -> pl.DataFrame:
    selected_columns = tuple(columns or tuple(schema))
    selected_schema = {name: schema[name] for name in selected_columns}
    if not path.exists():
        return pl.DataFrame(schema=selected_schema)

    available_columns = set(pl.read_parquet_schema(path))

    def _default_expr(name: str, dtype: pl.DataType) -> pl.Expr:
        if derived_columns is not None and name in derived_columns:
            return derived_columns[name].cast(dtype).alias(name)
        if dtype == pl.Boolean:
            return pl.lit(False).cast(dtype).alias(name)
        if dtype in {
            pl.Int8,
            pl.Int16,
            pl.Int32,
            pl.Int64,
            pl.UInt8,
            pl.UInt16,
            pl.UInt32,
            pl.UInt64,
        }:
            return pl.lit(0).cast(dtype).alias(name)
        if dtype in {pl.Float32, pl.Float64}:
            return pl.lit(0.0).cast(dtype).alias(name)
        if dtype == pl.String:
            return pl.lit("").cast(dtype).alias(name)
        return pl.lit(None).cast(dtype).alias(name)

    frame = pl.scan_parquet(path, low_memory=True)
    if (
        max_rows is not None
        and max_rows > 0
        and row_count_hint is not None
        and row_count_hint > max_rows
    ):
        stride = max(1, math.ceil(float(row_count_hint) / float(max_rows)))
        offset = int(sample_seed % stride)
        frame = frame.with_row_index("__row_idx").filter((pl.col("__row_idx") % stride) == offset)
    return frame.select(
        [
            (
                pl.col(name).cast(dtype).alias(name)
                if name in available_columns
                else _default_expr(name, dtype)
            )
            for name, dtype in selected_schema.items()
        ]
    ).collect()


def replay_measurement_payload(bundle: ReplayMeasurementBundle) -> dict[str, np.ndarray]:
    step_count = bundle.site_transition_counts_by_step.shape[0]
    return {
        "step_index": np.arange(step_count, dtype=np.int64),
        "replay_run_count": np.asarray([bundle.replay_run_count], dtype=np.int64),
        "frame_transition_count": np.asarray([bundle.frame_transition_count], dtype=np.int64),
        "site_transition_counts_by_step": bundle.site_transition_counts_by_step.astype(np.int32),
        "site_transition_count": np.asarray([bundle.summary.site_transition_count], dtype=np.int64),
        "site_opportunity_count": np.asarray(
            [bundle.summary.site_opportunity_count],
            dtype=np.int64,
        ),
        "settlement_measurement_count": np.asarray(
            [bundle.summary.settlement_measurement_count],
            dtype=np.int64,
        ),
        "live_settlement_transition_count": np.asarray(
            [bundle.summary.live_settlement_transition_count],
            dtype=np.int64,
        ),
        "ruin_transition_count": np.asarray([bundle.summary.ruin_transition_count], dtype=np.int64),
        "pairwise_candidate_count": np.asarray(
            [bundle.summary.pairwise_candidate_count],
            dtype=np.int64,
        ),
        "owner_year_count": np.asarray([bundle.summary.owner_year_count], dtype=np.int64),
        "year_shock_count": np.asarray([bundle.summary.year_shock_count], dtype=np.int64),
        "macro_trajectory_count": np.asarray(
            [bundle.summary.macro_trajectory_count],
            dtype=np.int64,
        ),
    }


def _column_buffers(schema: dict[str, pl.DataType]) -> dict[str, list[object]]:
    return {name: [] for name in schema}


def _append_row(
    columns: dict[str, list[object]],
    row: dict[str, object],
    schema: dict[str, pl.DataType],
) -> None:
    for name in schema:
        columns[name].append(row.get(name))


def _build_frame(
    rows: list[dict[str, object]] | dict[str, list[object]],
    schema: dict[str, pl.DataType],
) -> pl.DataFrame:
    if isinstance(rows, dict):
        if not rows:
            return pl.DataFrame(schema=schema)
        first_column = next(iter(rows.values()), [])
        if len(first_column) == 0:
            return pl.DataFrame(schema=schema)
        frame = pl.DataFrame(
            rows,
            schema=schema,
            strict=False,
        )
    else:
        if not rows:
            return pl.DataFrame(schema=schema)
        frame = pl.from_dicts(
            rows,
            schema=schema,
            strict=False,
            infer_schema_length=None,
        )
    return frame.select([pl.col(name).cast(dtype).alias(name) for name, dtype in schema.items()])


def _optional_delta(previous: float | None, current: float | None) -> float | None:
    if previous is None or current is None:
        return None
    return float(current - previous)


def _mean_or_zero(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(np.mean(np.asarray(values, dtype=np.float64)))


def _sum_or_zero(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(np.sum(np.asarray(values, dtype=np.float64)))


def _std_or_zero(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    return float(np.std(np.asarray(values, dtype=np.float64)))


def _settlement_index(
    settlements: tuple[SettlementFullState, ...],
) -> dict[tuple[int, int], SettlementFullState]:
    return {(item.x, item.y): item for item in settlements}


def _restore_distance_steps(
    feature_bundle: SeedFeatureBundle,
    name: str,
) -> tuple[np.ndarray, np.ndarray]:
    steps = np.rint(feature_bundle.feature(f"{name}_steps")).astype(np.int64)
    unreachable = feature_bundle.feature(f"{name}_unreachable") > 0.5
    raw_steps = np.where(unreachable, -1, steps)
    return raw_steps, unreachable


def _unique_positions(runs: list[ReplayRun]) -> list[tuple[int, int]]:
    positions: set[tuple[int, int]] = set()
    for run in runs:
        for frame in run.frames:
            for settlement in frame.settlements:
                positions.add((settlement.y, settlement.x))
    return sorted(positions)


def _distance_cache(
    initial_grid: np.ndarray,
    runs: list[ReplayRun],
) -> dict[tuple[int, int], tuple[np.ndarray, np.ndarray]]:
    positions = _unique_positions(runs)
    land = land_mask(initial_grid)
    sea_or_coast = sea_mask(initial_grid) | coast_mask(initial_grid)
    cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
    for y, x in positions:
        cache[(y, x)] = (
            multi_source_distance(land, [(y, x)]),
            multi_source_distance(sea_or_coast, [(y, x)]),
        )
    return cache


def _build_local_context_maps(
    previous_frame_grid: np.ndarray,
    previous_alive_settlements: list[SettlementFullState],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[int, np.ndarray]]:
    height, width = previous_frame_grid.shape
    nearby_live_counts = np.zeros((height, width), dtype=np.int16)
    nearby_port_counts = np.zeros((height, width), dtype=np.int16)
    nearby_ruin_counts = np.zeros((height, width), dtype=np.int16)
    nearby_same_owner_counts: dict[int, np.ndarray] = {}

    for settlement in previous_alive_settlements:
        y0 = max(0, settlement.y - 1)
        y1 = min(height, settlement.y + 2)
        x0 = max(0, settlement.x - 1)
        x1 = min(width, settlement.x + 2)
        nearby_live_counts[y0:y1, x0:x1] += 1
        if settlement.has_port:
            nearby_port_counts[y0:y1, x0:x1] += 1
        if settlement.owner_id is not None:
            owner_counts = nearby_same_owner_counts.setdefault(
                settlement.owner_id,
                np.zeros((height, width), dtype=np.int16),
            )
            owner_counts[y0:y1, x0:x1] += 1

    for y, x in np.argwhere(previous_frame_grid == 3):
        y0 = max(0, y - 1)
        y1 = min(height, y + 2)
        x0 = max(0, x - 1)
        x1 = min(width, x + 2)
        nearby_ruin_counts[y0:y1, x0:x1] += 1

    return (
        nearby_live_counts,
        nearby_port_counts,
        nearby_ruin_counts,
        nearby_same_owner_counts,
    )


def _local_context(
    nearby_live_counts: np.ndarray,
    nearby_port_counts: np.ndarray,
    nearby_ruin_counts: np.ndarray,
    nearby_same_owner_counts: dict[int, np.ndarray],
    *,
    x: int,
    y: int,
    owner_id: int | None,
    exclude_self: bool,
    self_has_port: bool,
) -> tuple[int, int, int, int, int]:
    nearby_live_count = int(nearby_live_counts[y, x])
    nearby_port_count = int(nearby_port_counts[y, x])
    nearby_same_owner_count = (
        int(nearby_same_owner_counts[owner_id][y, x])
        if owner_id is not None and owner_id in nearby_same_owner_counts
        else 0
    )
    if exclude_self:
        nearby_live_count -= 1
        if self_has_port:
            nearby_port_count -= 1
        if owner_id is not None:
            nearby_same_owner_count -= 1
    nearby_other_owner_count = max(0, nearby_live_count - nearby_same_owner_count)
    nearby_ruin_count = int(nearby_ruin_counts[y, x])
    return (
        nearby_live_count,
        nearby_same_owner_count,
        nearby_other_owner_count,
        nearby_port_count,
        nearby_ruin_count,
    )


def _select_pairwise_targets(
    previous_alive_settlements: list[SettlementFullState],
    distance_cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]],
    *,
    source: SettlementFullState,
) -> list[tuple[int, SettlementFullState, int, int]]:
    candidates: list[tuple[SettlementFullState, int, int]] = []
    land_distances, sea_distances = distance_cache[(source.y, source.x)]
    for destination in previous_alive_settlements:
        if destination.x == source.x and destination.y == source.y:
            continue
        land_distance = int(land_distances[destination.y, destination.x])
        sea_distance = int(sea_distances[destination.y, destination.x])
        if land_distance < 0 and sea_distance < 0:
            continue
        candidates.append((destination, land_distance, sea_distance))

    land_ranked = sorted(
        [item for item in candidates if item[1] >= 0],
        key=lambda item: (item[1], item[0].y, item[0].x),
    )[:MAX_LAND_NEIGHBORS]
    sea_ranked = sorted(
        [item for item in candidates if item[2] >= 0],
        key=lambda item: (item[2], item[0].y, item[0].x),
    )[:MAX_SEA_NEIGHBORS]

    selected: dict[tuple[int, int], tuple[SettlementFullState, int, int]] = {}
    for destination, land_distance, sea_distance in (*land_ranked, *sea_ranked):
        selected[(destination.y, destination.x)] = (destination, land_distance, sea_distance)

    ordered = sorted(
        selected.values(),
        key=lambda item: (
            min(
                value for value in (item[1], item[2]) if value >= 0
            ),
            item[0].y,
            item[0].x,
        ),
    )
    return [
        (rank, destination, land_distance, sea_distance)
        for rank, (destination, land_distance, sea_distance) in enumerate(ordered, start=1)
    ]


def build_replay_measurement_bundle(
    initial_grid: np.ndarray,
    feature_bundle: SeedFeatureBundle,
    runs: list[ReplayRun],
) -> ReplayMeasurementBundle:
    if not runs:
        raise ValueError("cannot build replay measurements for empty replay list")

    first_run = runs[0]
    step_count = len(first_run.frames) - 1
    height, width = first_run.frames[0].grid.shape
    site_transition_counts = np.zeros(
        (step_count, height, width, CLASS_COUNT, CLASS_COUNT),
        dtype=np.int32,
    )
    site_opportunity_rows = _column_buffers(SITE_OPPORTUNITY_SCHEMA)
    settlement_rows = _column_buffers(SETTLEMENT_MEASUREMENT_SCHEMA)
    ruin_rows = _column_buffers(RUIN_TRANSITION_SCHEMA)
    pairwise_rows = _column_buffers(PAIRWISE_CANDIDATE_SCHEMA)
    owner_year_rows = _column_buffers(OWNER_YEAR_SCHEMA)
    year_shock_rows = _column_buffers(YEAR_SHOCK_SCHEMA)
    macro_rows = _column_buffers(MACRO_TRAJECTORY_SCHEMA)
    distance_cache = _distance_cache(initial_grid, runs)
    flattened_indexes = np.arange(height * width, dtype=np.int64)
    buildable = feature_bundle.feature("buildable")
    coast = feature_bundle.feature("coast")
    coast_distance = feature_bundle.feature("coast_distance")
    coast_distance_steps, coast_distance_unreachable = _restore_distance_steps(
        feature_bundle,
        "coast_distance",
    )
    forest_density = feature_bundle.feature("forest_density")
    mountain_density = feature_bundle.feature("mountain_density")
    land_distance_steps, land_distance_unreachable = _restore_distance_steps(
        feature_bundle,
        "land_distance_to_settlement",
    )
    settlement_proximity = feature_bundle.feature("settlement_proximity")
    sea_distance_steps, sea_distance_unreachable = _restore_distance_steps(
        feature_bundle,
        "sea_distance_to_port",
    )
    maritime_access = feature_bundle.feature("maritime_access")
    basin_gap_steps, basin_gap_unreachable = _restore_distance_steps(
        feature_bundle,
        "settlement_basin_gap",
    )
    frontier_score = feature_bundle.feature("frontier_score")

    for run in runs:
        ruin_age = np.where(run.frames[0].grid == 3, 0, -1).astype(np.int64)
        for step in range(len(run.frames) - 1):
            previous_frame = run.frames[step]
            current_frame = run.frames[step + 1]

            previous_scored = collapse_internal_grid(previous_frame.grid)
            current_scored = collapse_internal_grid(current_frame.grid)
            cube_flat = site_transition_counts[step].reshape(
                height * width,
                CLASS_COUNT,
                CLASS_COUNT,
            )
            np.add.at(
                cube_flat,
                (flattened_indexes, previous_scored.reshape(-1), current_scored.reshape(-1)),
                1,
            )

            previous_index = _settlement_index(previous_frame.settlements)
            current_index = _settlement_index(current_frame.settlements)
            previous_alive = [item for item in previous_frame.settlements if item.alive]
            current_alive = [item for item in current_frame.settlements if item.alive]
            (
                nearby_live_counts,
                nearby_port_counts,
                nearby_ruin_counts,
                nearby_same_owner_counts,
            ) = _build_local_context_maps(previous_frame.grid, previous_alive)
            previous_owner_groups: dict[int, list[SettlementFullState]] = {}
            current_owner_groups: dict[int, list[SettlementFullState]] = {}
            for settlement in previous_alive:
                if settlement.owner_id is None:
                    continue
                previous_owner_groups.setdefault(settlement.owner_id, []).append(settlement)
            for settlement in current_alive:
                if settlement.owner_id is None:
                    continue
                current_owner_groups.setdefault(settlement.owner_id, []).append(settlement)

            birth_count = 0
            rebuild_count = 0
            collapse_count = 0
            collapse_to_ruin_count = 0
            site_ruin_created_count = 0
            site_opportunity_count = 0
            owner_flip_count = 0
            port_gain_count = 0
            port_loss_count = 0
            changed_count = 0
            population_deltas: list[float] = []
            food_deltas: list[float] = []
            wealth_deltas: list[float] = []
            defense_deltas: list[float] = []
            negative_food_count = 0

            positions = sorted(
                set(previous_index) | set(current_index),
                key=lambda item: (item[1], item[0]),
            )
            for x, y in positions:
                previous = previous_index.get((x, y))
                current = current_index.get((x, y))
                prev_alive = bool(previous.alive) if previous is not None else False
                next_alive = bool(current.alive) if current is not None else False
                prev_has_port = bool(previous.has_port) if previous is not None else False
                next_has_port = bool(current.has_port) if current is not None else False
                prev_owner_id = previous.owner_id if previous is not None else None
                next_owner_id = current.owner_id if current is not None else None
                prev_grid_code = int(previous_frame.grid[y, x])
                next_grid_code = int(current_frame.grid[y, x])

                birth = (not prev_alive) and next_alive and prev_grid_code != 3
                rebuild = (not prev_alive) and next_alive and prev_grid_code == 3
                collapse = prev_alive and (not next_alive)
                collapse_to_ruin = collapse and next_grid_code == 3
                port_gain = prev_alive and next_alive and next_has_port and not prev_has_port
                port_loss = prev_alive and next_alive and prev_has_port and not next_has_port
                owner_flip = (
                    prev_alive
                    and next_alive
                    and prev_owner_id is not None
                    and next_owner_id is not None
                    and prev_owner_id != next_owner_id
                )
                population_delta = _optional_delta(
                    previous.population if previous is not None else None,
                    current.population if current is not None else None,
                )
                food_delta = _optional_delta(
                    previous.food if previous is not None else None,
                    current.food if current is not None else None,
                )
                wealth_delta = _optional_delta(
                    previous.wealth if previous is not None else None,
                    current.wealth if current is not None else None,
                )
                defense_delta = _optional_delta(
                    previous.defense if previous is not None else None,
                    current.defense if current is not None else None,
                )
                stat_change = prev_alive and next_alive and any(
                    delta is not None and abs(delta) > 1e-9
                    for delta in (population_delta, food_delta, wealth_delta, defense_delta)
                )
                changed = any(
                    [
                        birth,
                        rebuild,
                        collapse,
                        port_gain,
                        port_loss,
                        owner_flip,
                        stat_change,
                        prev_grid_code != next_grid_code,
                    ],
                )

                (
                    nearby_live_count,
                    nearby_same_owner_count,
                    nearby_other_owner_count,
                    nearby_port_count,
                    nearby_ruin_count,
                ) = _local_context(
                    nearby_live_counts,
                    nearby_port_counts,
                    nearby_ruin_counts,
                    nearby_same_owner_counts,
                    x=x,
                    y=y,
                    owner_id=prev_owner_id,
                    exclude_self=prev_alive,
                    self_has_port=prev_has_port,
                )

                settlement_row = {
                    "replay_run_id": run.replay_run_id,
                    "round_id": run.round_id,
                    "seed_index": run.seed_index,
                    "step": step,
                    "y": y,
                    "x": x,
                    "prev_grid_code": prev_grid_code,
                    "next_grid_code": next_grid_code,
                    "prev_alive": prev_alive,
                    "next_alive": next_alive,
                    "prev_has_port": prev_has_port,
                    "next_has_port": next_has_port,
                    "prev_owner_id": prev_owner_id,
                    "next_owner_id": next_owner_id,
                    "birth": birth,
                    "rebuild": rebuild,
                    "collapse": collapse,
                    "collapse_to_ruin": collapse_to_ruin,
                    "port_gain": port_gain,
                    "port_loss": port_loss,
                    "owner_flip": owner_flip,
                    "changed": changed,
                    "transition_kind": (
                        "birth"
                        if birth
                        else "rebuild"
                        if rebuild
                        else "collapse_to_ruin"
                        if collapse_to_ruin
                        else "collapse"
                        if collapse
                        else "port_gain"
                        if port_gain
                        else "port_loss"
                        if port_loss
                        else "owner_flip"
                        if owner_flip
                        else "stat_change"
                        if stat_change
                        else "steady"
                    ),
                    "prev_population": previous.population if previous is not None else None,
                    "prev_food": previous.food if previous is not None else None,
                    "prev_wealth": previous.wealth if previous is not None else None,
                    "prev_defense": previous.defense if previous is not None else None,
                    "population_delta": population_delta,
                    "food_delta": food_delta,
                    "wealth_delta": wealth_delta,
                    "defense_delta": defense_delta,
                    "buildable": float(buildable[y, x]),
                    "coast": float(coast[y, x]),
                    "coast_distance": float(coast_distance[y, x]),
                    "coast_distance_steps": int(coast_distance_steps[y, x]),
                    "coast_distance_unreachable": bool(coast_distance_unreachable[y, x]),
                    "forest_density": float(forest_density[y, x]),
                    "mountain_density": float(mountain_density[y, x]),
                    "land_distance_to_settlement_steps": int(land_distance_steps[y, x]),
                    "land_distance_to_settlement_unreachable": bool(
                        land_distance_unreachable[y, x]
                    ),
                    "settlement_proximity": float(settlement_proximity[y, x]),
                    "sea_distance_to_port_steps": int(sea_distance_steps[y, x]),
                    "sea_distance_to_port_unreachable": bool(sea_distance_unreachable[y, x]),
                    "maritime_access": float(maritime_access[y, x]),
                    "settlement_basin_gap_steps": int(basin_gap_steps[y, x]),
                    "settlement_basin_gap_unreachable": bool(basin_gap_unreachable[y, x]),
                    "frontier_score": float(frontier_score[y, x]),
                    "nearby_live_count": nearby_live_count,
                    "nearby_same_owner_count": nearby_same_owner_count,
                    "nearby_other_owner_count": nearby_other_owner_count,
                    "nearby_port_count": nearby_port_count,
                    "nearby_ruin_count": nearby_ruin_count,
                }
                _append_row(
                    settlement_rows,
                    settlement_row,
                    SETTLEMENT_MEASUREMENT_SCHEMA,
                )
                birth_count += int(birth)
                rebuild_count += int(rebuild)
                collapse_count += int(collapse)
                collapse_to_ruin_count += int(collapse_to_ruin)
                owner_flip_count += int(owner_flip)
                port_gain_count += int(port_gain)
                port_loss_count += int(port_loss)
                changed_count += int(changed)
                if population_delta is not None:
                    population_deltas.append(population_delta)
                if food_delta is not None:
                    food_deltas.append(food_delta)
                    if food_delta < 0.0:
                        negative_food_count += 1
                if wealth_delta is not None:
                    wealth_deltas.append(wealth_delta)
                if defense_delta is not None:
                    defense_deltas.append(defense_delta)

            for y in range(height):
                for x in range(width):
                    previous = previous_index.get((x, y))
                    current = current_index.get((x, y))
                    prev_alive = bool(previous.alive) if previous is not None else False
                    if prev_alive:
                        continue
                    prev_grid_code = int(previous_frame.grid[y, x])
                    if not (bool(buildable[y, x] > 0.5) or prev_grid_code == 3):
                        continue
                    next_alive = bool(current.alive) if current is not None else False
                    prev_has_port = bool(previous.has_port) if previous is not None else False
                    next_has_port = bool(current.has_port) if current is not None else False
                    prev_owner_id = previous.owner_id if previous is not None else None
                    next_owner_id = current.owner_id if current is not None else None
                    next_grid_code = int(current_frame.grid[y, x])
                    (
                        nearby_live_count,
                        nearby_same_owner_count,
                        nearby_other_owner_count,
                        nearby_port_count,
                        nearby_ruin_count,
                    ) = _local_context(
                        nearby_live_counts,
                        nearby_port_counts,
                        nearby_ruin_counts,
                        nearby_same_owner_counts,
                        x=x,
                        y=y,
                        owner_id=prev_owner_id,
                        exclude_self=False,
                        self_has_port=False,
                    )
                    birth = (not prev_alive) and next_alive and prev_grid_code != 3
                    rebuild = (not prev_alive) and next_alive and prev_grid_code == 3
                    site_ruin_created = bool((prev_grid_code != 3) and (next_grid_code == 3))
                    rebuild_port = bool(rebuild and next_has_port)
                    ruin_to_forest = bool((prev_grid_code == 3) and (next_grid_code == 4))
                    ruin_to_empty = bool((prev_grid_code == 3) and (next_grid_code in (0, 10, 11)))
                    site_opportunity_count += 1
                    _append_row(
                        site_opportunity_rows,
                        {
                            "replay_run_id": run.replay_run_id,
                            "round_id": run.round_id,
                            "seed_index": run.seed_index,
                            "step": step,
                            "y": y,
                            "x": x,
                            "prev_grid_code": prev_grid_code,
                            "next_grid_code": next_grid_code,
                            "prev_alive": prev_alive,
                            "next_alive": next_alive,
                            "prev_has_port": prev_has_port,
                            "next_has_port": next_has_port,
                            "prev_owner_id": prev_owner_id,
                            "next_owner_id": next_owner_id,
                            "prev_ruin": bool(prev_grid_code == 3),
                            "buildable": float(buildable[y, x]),
                            "coast": float(coast[y, x]),
                            "coast_distance_steps": int(coast_distance_steps[y, x]),
                            "coast_distance_unreachable": bool(coast_distance_unreachable[y, x]),
                            "forest_density": float(forest_density[y, x]),
                            "mountain_density": float(mountain_density[y, x]),
                            "land_distance_to_settlement_steps": int(land_distance_steps[y, x]),
                            "land_distance_to_settlement_unreachable": bool(
                                land_distance_unreachable[y, x]
                            ),
                            "settlement_proximity": float(settlement_proximity[y, x]),
                            "sea_distance_to_port_steps": int(sea_distance_steps[y, x]),
                            "sea_distance_to_port_unreachable": bool(
                                sea_distance_unreachable[y, x]
                            ),
                            "maritime_access": float(maritime_access[y, x]),
                            "settlement_basin_gap_steps": int(basin_gap_steps[y, x]),
                            "settlement_basin_gap_unreachable": bool(
                                basin_gap_unreachable[y, x]
                            ),
                            "frontier_score": float(frontier_score[y, x]),
                            "nearby_live_count": nearby_live_count,
                            "nearby_same_owner_count": nearby_same_owner_count,
                            "nearby_other_owner_count": nearby_other_owner_count,
                            "nearby_port_count": nearby_port_count,
                            "nearby_ruin_count": nearby_ruin_count,
                            "birth": birth,
                            "rebuild": rebuild,
                            "site_ruin_created": site_ruin_created,
                            "rebuild_port": rebuild_port,
                            "ruin_to_forest": ruin_to_forest,
                            "ruin_to_empty": ruin_to_empty,
                            "remain_nonlive": bool(not next_alive),
                        },
                        SITE_OPPORTUNITY_SCHEMA,
                    )
                    site_ruin_created_count += int(site_ruin_created)
                    if prev_grid_code != 3:
                        continue
                    _append_row(
                        ruin_rows,
                        {
                            "replay_run_id": run.replay_run_id,
                            "round_id": run.round_id,
                            "seed_index": run.seed_index,
                            "step": step,
                            "y": y,
                            "x": x,
                            "ruin_age": int(ruin_age[y, x]),
                            "next_grid_code": next_grid_code,
                            "buildable": float(buildable[y, x]),
                            "coast": float(coast[y, x]),
                            "coast_distance_steps": int(coast_distance_steps[y, x]),
                            "coast_distance_unreachable": bool(coast_distance_unreachable[y, x]),
                            "forest_density": float(forest_density[y, x]),
                            "mountain_density": float(mountain_density[y, x]),
                            "land_distance_to_settlement_steps": int(land_distance_steps[y, x]),
                            "land_distance_to_settlement_unreachable": bool(
                                land_distance_unreachable[y, x]
                            ),
                            "settlement_proximity": float(settlement_proximity[y, x]),
                            "sea_distance_to_port_steps": int(sea_distance_steps[y, x]),
                            "sea_distance_to_port_unreachable": bool(
                                sea_distance_unreachable[y, x]
                            ),
                            "maritime_access": float(maritime_access[y, x]),
                            "settlement_basin_gap_steps": int(basin_gap_steps[y, x]),
                            "settlement_basin_gap_unreachable": bool(
                                basin_gap_unreachable[y, x]
                            ),
                            "frontier_score": float(frontier_score[y, x]),
                            "nearby_live_count": nearby_live_count,
                            "nearby_same_owner_count": nearby_same_owner_count,
                            "nearby_other_owner_count": nearby_other_owner_count,
                            "nearby_port_count": nearby_port_count,
                            "nearby_ruin_count": nearby_ruin_count,
                            "remain_ruin": bool((not next_alive) and (next_grid_code == 3)),
                            "rebuild_settlement": bool(rebuild and not next_has_port),
                            "rebuild_port": rebuild_port,
                            "reclaim_forest": ruin_to_forest,
                            "fade_empty": ruin_to_empty,
                            "changed": bool(next_grid_code != 3),
                        },
                        RUIN_TRANSITION_SCHEMA,
                    )

            for source in previous_alive:
                for pair_rank, destination, land_distance, sea_distance in _select_pairwise_targets(
                    previous_alive,
                    distance_cache,
                    source=source,
                ):
                    current_destination = current_index.get((destination.x, destination.y))
                    dst_alive_next = (
                        bool(current_destination.alive)
                        if current_destination is not None
                        else False
                    )
                    dst_has_port_next = (
                        bool(current_destination.has_port)
                        if current_destination is not None
                        else False
                    )
                    dst_owner_id_next = (
                        current_destination.owner_id if current_destination is not None else None
                    )
                    dst_population_delta = _optional_delta(
                        destination.population,
                        current_destination.population if current_destination is not None else None,
                    )
                    dst_food_delta = _optional_delta(
                        destination.food,
                        current_destination.food if current_destination is not None else None,
                    )
                    dst_wealth_delta = _optional_delta(
                        destination.wealth,
                        current_destination.wealth if current_destination is not None else None,
                    )
                    dst_defense_delta = _optional_delta(
                        destination.defense,
                        current_destination.defense if current_destination is not None else None,
                    )
                    _append_row(
                        pairwise_rows,
                        {
                            "replay_run_id": run.replay_run_id,
                            "round_id": run.round_id,
                            "seed_index": run.seed_index,
                            "step": step,
                            "pair_rank": pair_rank,
                            "src_y": source.y,
                            "src_x": source.x,
                            "dst_y": destination.y,
                            "dst_x": destination.x,
                            "land_distance": land_distance,
                            "sea_distance": sea_distance,
                            "same_owner": (
                                source.owner_id is not None
                                and destination.owner_id is not None
                                and source.owner_id == destination.owner_id
                            ),
                            "src_has_port": bool(source.has_port),
                            "dst_has_port": bool(destination.has_port),
                            "maritime_pair": bool(
                                source.has_port and destination.has_port and sea_distance >= 0
                            ),
                            "src_population": source.population,
                            "src_food": source.food,
                            "src_wealth": source.wealth,
                            "src_defense": source.defense,
                            "dst_population": destination.population,
                            "dst_food": destination.food,
                            "dst_wealth": destination.wealth,
                            "dst_defense": destination.defense,
                            "dst_population_delta": dst_population_delta,
                            "dst_food_delta": dst_food_delta,
                            "dst_wealth_delta": dst_wealth_delta,
                            "dst_defense_delta": dst_defense_delta,
                            "dst_owner_flip_next": (
                                destination.owner_id is not None
                                and dst_owner_id_next is not None
                                and destination.owner_id != dst_owner_id_next
                                and dst_alive_next
                            ),
                            "dst_collapse_next": bool(destination.alive and not dst_alive_next),
                            "dst_port_gain_next": bool(
                                (not destination.has_port) and dst_has_port_next
                            ),
                        },
                        PAIRWISE_CANDIDATE_SCHEMA,
                    )

            for owner_id in sorted(set(previous_owner_groups) | set(current_owner_groups)):
                owner_settlements = previous_owner_groups.get(owner_id, [])
                next_owner_settlements = current_owner_groups.get(owner_id, [])
                coastal_count = 0
                frontier_count = 0
                total_population = 0.0
                total_food = 0.0
                total_wealth = 0.0
                total_defense = 0.0
                owner_frontier_scores: list[float] = []
                owner_maritime_scores: list[float] = []
                owner_settlement_scores: list[float] = []
                for settlement in owner_settlements:
                    if coast[settlement.y, settlement.x] > 0.5:
                        coastal_count += 1
                    (
                        _nearby_live_count,
                        _nearby_same_owner_count,
                        nearby_other_owner_count,
                        _nearby_port_count,
                        _nearby_ruin_count,
                    ) = _local_context(
                        nearby_live_counts,
                        nearby_port_counts,
                        nearby_ruin_counts,
                        nearby_same_owner_counts,
                        x=settlement.x,
                        y=settlement.y,
                        owner_id=owner_id,
                        exclude_self=True,
                        self_has_port=bool(settlement.has_port),
                    )
                    if nearby_other_owner_count > 0:
                        frontier_count += 1
                    owner_frontier_scores.append(float(frontier_score[settlement.y, settlement.x]))
                    owner_maritime_scores.append(float(maritime_access[settlement.y, settlement.x]))
                    owner_settlement_scores.append(
                        float(settlement_proximity[settlement.y, settlement.x])
                    )
                    total_population += float(settlement.population)
                    total_food += float(settlement.food)
                    total_wealth += float(settlement.wealth)
                    total_defense += float(settlement.defense)

                next_total_population = sum(
                    float(item.population) for item in next_owner_settlements
                )
                next_total_food = sum(float(item.food) for item in next_owner_settlements)
                next_total_wealth = sum(float(item.wealth) for item in next_owner_settlements)
                next_total_defense = sum(float(item.defense) for item in next_owner_settlements)
                _append_row(
                    owner_year_rows,
                    {
                        "replay_run_id": run.replay_run_id,
                        "round_id": run.round_id,
                        "seed_index": run.seed_index,
                        "step": step,
                        "owner_id": owner_id,
                        "settlement_count": len(owner_settlements),
                        "port_count": sum(1 for item in owner_settlements if item.has_port),
                        "coastal_settlement_count": coastal_count,
                        "frontier_settlement_count": frontier_count,
                        "total_population": total_population,
                        "total_food": total_food,
                        "total_wealth": total_wealth,
                        "total_defense": total_defense,
                        "mean_frontier_score": _mean_or_zero(owner_frontier_scores),
                        "mean_maritime_access": _mean_or_zero(owner_maritime_scores),
                        "mean_settlement_proximity": _mean_or_zero(owner_settlement_scores),
                        "next_settlement_count": len(next_owner_settlements),
                        "next_port_count": sum(
                            1 for item in next_owner_settlements if item.has_port
                        ),
                        "settlement_delta": len(next_owner_settlements) - len(owner_settlements),
                        "port_delta": sum(1 for item in next_owner_settlements if item.has_port)
                        - sum(1 for item in owner_settlements if item.has_port),
                        "population_delta": next_total_population - total_population,
                        "food_delta": next_total_food - total_food,
                        "wealth_delta": next_total_wealth - total_wealth,
                        "defense_delta": next_total_defense - total_defense,
                    },
                    OWNER_YEAR_SCHEMA,
                )

            coastal_live_count = 0
            frontier_live_count = 0
            macro_frontier_scores: list[float] = []
            macro_maritime_scores: list[float] = []
            for settlement in previous_alive:
                if coast[settlement.y, settlement.x] > 0.5:
                    coastal_live_count += 1
                (
                    _nearby_live_count,
                    _nearby_same_owner_count,
                    nearby_other_owner_count,
                    _nearby_port_count,
                    _nearby_ruin_count,
                ) = _local_context(
                    nearby_live_counts,
                    nearby_port_counts,
                    nearby_ruin_counts,
                    nearby_same_owner_counts,
                    x=settlement.x,
                    y=settlement.y,
                    owner_id=settlement.owner_id,
                    exclude_self=True,
                    self_has_port=bool(settlement.has_port),
                )
                if nearby_other_owner_count > 0:
                    frontier_live_count += 1
                macro_frontier_scores.append(float(frontier_score[settlement.y, settlement.x]))
                macro_maritime_scores.append(float(maritime_access[settlement.y, settlement.x]))

            next_ruin_count = int(np.count_nonzero(current_frame.grid == 3))
            _append_row(
                macro_rows,
                {
                    "replay_run_id": run.replay_run_id,
                    "round_id": run.round_id,
                    "seed_index": run.seed_index,
                    "step": step,
                    "live_count": len(previous_alive),
                    "port_count": sum(1 for item in previous_alive if item.has_port),
                    "ruin_count": int(np.count_nonzero(previous_frame.grid == 3)),
                    "built_cell_count": int(np.count_nonzero(np.isin(previous_scored, (1, 2, 3)))),
                    "owner_count": len(previous_owner_groups),
                    "total_population": sum(float(item.population) for item in previous_alive),
                    "total_food": sum(float(item.food) for item in previous_alive),
                    "total_wealth": sum(float(item.wealth) for item in previous_alive),
                    "total_defense": sum(float(item.defense) for item in previous_alive),
                    "coastal_live_share": float(coastal_live_count)
                    / float(max(1, len(previous_alive))),
                    "frontier_live_share": float(frontier_live_count)
                    / float(max(1, len(previous_alive))),
                    "mean_frontier_score": _mean_or_zero(macro_frontier_scores),
                    "mean_maritime_access": _mean_or_zero(macro_maritime_scores),
                    "next_live_count": len(current_alive),
                    "next_port_count": sum(1 for item in current_alive if item.has_port),
                    "next_ruin_count": next_ruin_count,
                    "next_owner_count": len(current_owner_groups),
                    "live_delta": len(current_alive) - len(previous_alive),
                    "port_delta": sum(1 for item in current_alive if item.has_port)
                    - sum(1 for item in previous_alive if item.has_port),
                    "ruin_delta": next_ruin_count - int(np.count_nonzero(previous_frame.grid == 3)),
                    "owner_delta": len(current_owner_groups) - len(previous_owner_groups),
                },
                MACRO_TRAJECTORY_SCHEMA,
            )

            _append_row(
                year_shock_rows,
                {
                    "replay_run_id": run.replay_run_id,
                    "round_id": run.round_id,
                    "seed_index": run.seed_index,
                    "step": step,
                    "live_count": len(previous_alive),
                    "next_live_count": sum(1 for item in current_frame.settlements if item.alive),
                    "birth_count": birth_count,
                    "rebuild_count": rebuild_count,
                    "collapse_count": collapse_count,
                    "collapse_to_ruin_count": collapse_to_ruin_count,
                    "site_ruin_created_count": site_ruin_created_count,
                    "owner_flip_count": owner_flip_count,
                    "port_gain_count": port_gain_count,
                    "port_loss_count": port_loss_count,
                    "changed_settlement_share": (
                        float(changed_count) / float(max(1, len(positions)))
                    ),
                    "collapse_rate": float(collapse_count) / float(max(1, len(previous_alive))),
                    "site_ruin_created_rate": float(site_ruin_created_count)
                    / float(max(1, site_opportunity_count)),
                    "negative_food_share": float(negative_food_count)
                    / float(max(1, len(food_deltas))),
                    "mean_population_delta": _mean_or_zero(population_deltas),
                    "mean_food_delta": _mean_or_zero(food_deltas),
                    "mean_wealth_delta": _mean_or_zero(wealth_deltas),
                    "mean_defense_delta": _mean_or_zero(defense_deltas),
                    "sum_population_delta": _sum_or_zero(population_deltas),
                    "sum_food_delta": _sum_or_zero(food_deltas),
                    "sum_wealth_delta": _sum_or_zero(wealth_deltas),
                    "sum_defense_delta": _sum_or_zero(defense_deltas),
                    "food_delta_std": _std_or_zero(food_deltas),
                    "wealth_delta_std": _std_or_zero(wealth_deltas),
                },
                YEAR_SHOCK_SCHEMA,
            )
            ruin_age = np.where(
                current_frame.grid == 3,
                np.where(previous_frame.grid == 3, ruin_age + 1, 0),
                -1,
            ).astype(np.int64)

    site_opportunities = _build_frame(site_opportunity_rows, SITE_OPPORTUNITY_SCHEMA)
    settlement_measurements = _build_frame(settlement_rows, SETTLEMENT_MEASUREMENT_SCHEMA)
    live_settlement_transitions = settlement_measurements.filter(
        pl.col("prev_alive"),
    ).select(
        [
            pl.col(name).cast(dtype).alias(name)
            for name, dtype in LIVE_SETTLEMENT_TRANSITION_SCHEMA.items()
        ],
    )
    ruin_transitions = _build_frame(ruin_rows, RUIN_TRANSITION_SCHEMA)
    pairwise_candidates = _build_frame(pairwise_rows, PAIRWISE_CANDIDATE_SCHEMA)
    owner_years = _build_frame(owner_year_rows, OWNER_YEAR_SCHEMA)
    year_shocks = _build_frame(year_shock_rows, YEAR_SHOCK_SCHEMA)
    macro_trajectories = _build_frame(macro_rows, MACRO_TRAJECTORY_SCHEMA)
    frame_transition_count = sum(max(0, len(run.frames) - 1) for run in runs)
    summary = ReplayMeasurementSeedSummary(
        round_id=first_run.round_id,
        seed_index=first_run.seed_index,
        replay_run_count=len(runs),
        frame_transition_count=frame_transition_count,
        site_transition_count=int(site_transition_counts.sum()),
        site_opportunity_count=int(site_opportunities.height),
        settlement_measurement_count=int(settlement_measurements.height),
        live_settlement_transition_count=int(live_settlement_transitions.height),
        ruin_transition_count=int(ruin_transitions.height),
        pairwise_candidate_count=int(pairwise_candidates.height),
        owner_year_count=int(owner_years.height),
        year_shock_count=int(year_shocks.height),
        macro_trajectory_count=int(macro_trajectories.height),
    )
    return ReplayMeasurementBundle(
        round_id=first_run.round_id,
        seed_index=first_run.seed_index,
        replay_run_count=len(runs),
        frame_transition_count=frame_transition_count,
        site_transition_counts_by_step=site_transition_counts,
        site_opportunities=site_opportunities,
        settlement_measurements=settlement_measurements,
        live_settlement_transitions=live_settlement_transitions,
        ruin_transitions=ruin_transitions,
        pairwise_candidates=pairwise_candidates,
        owner_years=owner_years,
        year_shocks=year_shocks,
        macro_trajectories=macro_trajectories,
        summary=summary,
    )


def build_round_measurement_summary(
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
) -> ReplayMeasurementRoundSummary:
    if not bundles:
        raise ValueError(
            "cannot build round measurement summary without replay measurement bundles"
        )
    ordered = sorted(bundles, key=lambda item: item.seed_index)
    seed_summaries = [item.summary for item in ordered]
    return build_round_measurement_summary_from_seed_summaries(
        round_id,
        round_number,
        seed_summaries,
    )


def build_round_measurement_summary_from_seed_summaries(
    round_id: str,
    round_number: int,
    seed_summaries: list[ReplayMeasurementSeedSummary],
) -> ReplayMeasurementRoundSummary:
    return ReplayMeasurementRoundSummary(
        round_id=round_id,
        round_number=round_number,
        replay_seed_count=len(seed_summaries),
        replay_run_count=sum(item.replay_run_count for item in seed_summaries),
        frame_transition_count=sum(item.frame_transition_count for item in seed_summaries),
        site_transition_count=sum(item.site_transition_count for item in seed_summaries),
        site_opportunity_count=sum(item.site_opportunity_count for item in seed_summaries),
        settlement_measurement_count=sum(
            item.settlement_measurement_count for item in seed_summaries
        ),
        live_settlement_transition_count=sum(
            item.live_settlement_transition_count for item in seed_summaries
        ),
        ruin_transition_count=sum(item.ruin_transition_count for item in seed_summaries),
        pairwise_candidate_count=sum(item.pairwise_candidate_count for item in seed_summaries),
        owner_year_count=sum(item.owner_year_count for item in seed_summaries),
        year_shock_count=sum(item.year_shock_count for item in seed_summaries),
        macro_trajectory_count=sum(item.macro_trajectory_count for item in seed_summaries),
        seed_summaries=seed_summaries,
    )


def load_replay_measurement_bundle(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> ReplayMeasurementBundle | None:
    site_transition_path = paths.replay_site_transition_path(round_id, seed_index)
    if not site_transition_path.exists():
        return None

    site_payload = load_named_arrays(site_transition_path)
    summary_payload = {}
    replay_summary_path = paths.replay_summary_path(round_id, seed_index)
    if replay_summary_path.exists():
        summary_payload = load_named_arrays(replay_summary_path)

    site_transition_counts_by_step = np.asarray(
        site_payload["site_transition_counts_by_step"],
        dtype=np.int32,
    )
    replay_run_count = _payload_scalar(
        site_payload,
        "replay_run_count",
        default=_payload_scalar(
            summary_payload,
            "replay_run_count",
            default=0,
        ),
    )
    if replay_run_count <= 0:
        replay_run_count = len(list(paths.raw_replay_dir(round_id, seed_index).glob("*.json")))
    frame_transition_count = _payload_scalar(
        site_payload,
        "frame_transition_count",
        default=0,
    )
    if frame_transition_count <= 0:
        frame_transition_count = _payload_scalar(
            summary_payload,
            "frame_transition_count",
            default=site_transition_counts_by_step.shape[0] * max(1, replay_run_count),
        )
    site_opportunities = _read_parquet_or_empty(
        paths.replay_site_opportunity_path(round_id, seed_index),
        SITE_OPPORTUNITY_SCHEMA,
    )
    settlement_measurements = _read_parquet_or_empty(
        paths.replay_settlement_measurement_path(round_id, seed_index),
        SETTLEMENT_MEASUREMENT_SCHEMA,
    )
    live_settlement_transitions = _read_parquet_or_empty(
        paths.replay_live_settlement_transition_path(round_id, seed_index),
        LIVE_SETTLEMENT_TRANSITION_SCHEMA,
    )
    ruin_transitions = _read_parquet_or_empty(
        paths.replay_ruin_transition_path(round_id, seed_index),
        RUIN_TRANSITION_SCHEMA,
    )
    pairwise_candidates = _read_parquet_or_empty(
        paths.replay_pairwise_candidate_path(round_id, seed_index),
        PAIRWISE_CANDIDATE_SCHEMA,
    )
    owner_years = _read_parquet_or_empty(
        paths.replay_owner_year_path(round_id, seed_index),
        OWNER_YEAR_SCHEMA,
    )
    year_shocks = _read_parquet_or_empty(
        paths.replay_year_shock_path(round_id, seed_index),
        YEAR_SHOCK_SCHEMA,
    )
    macro_trajectories = _read_parquet_or_empty(
        paths.replay_macro_trajectory_path(round_id, seed_index),
        MACRO_TRAJECTORY_SCHEMA,
    )

    summary = ReplayMeasurementSeedSummary(
        round_id=round_id,
        seed_index=seed_index,
        replay_run_count=replay_run_count,
        frame_transition_count=frame_transition_count,
        site_transition_count=_payload_scalar(
            site_payload,
            "site_transition_count",
            default=int(site_transition_counts_by_step.sum()),
        ),
        site_opportunity_count=_payload_scalar(
            site_payload,
            "site_opportunity_count",
            default=_payload_scalar(
                summary_payload,
                "site_opportunity_count",
                default=int(site_opportunities.height),
            ),
        ),
        settlement_measurement_count=_payload_scalar(
            site_payload,
            "settlement_measurement_count",
            default=_payload_scalar(
                summary_payload,
                "settlement_measurement_count",
                default=int(settlement_measurements.height),
            ),
        ),
        live_settlement_transition_count=_payload_scalar(
            site_payload,
            "live_settlement_transition_count",
            default=_payload_scalar(
                summary_payload,
                "live_settlement_transition_count",
                default=int(live_settlement_transitions.height),
            ),
        ),
        ruin_transition_count=_payload_scalar(
            site_payload,
            "ruin_transition_count",
            default=_payload_scalar(
                summary_payload,
                "ruin_transition_count",
                default=int(ruin_transitions.height),
            ),
        ),
        pairwise_candidate_count=_payload_scalar(
            site_payload,
            "pairwise_candidate_count",
            default=_payload_scalar(
                summary_payload,
                "pairwise_candidate_count",
                default=int(pairwise_candidates.height),
            ),
        ),
        owner_year_count=_payload_scalar(
            site_payload,
            "owner_year_count",
            default=_payload_scalar(
                summary_payload,
                "owner_year_count",
                default=int(owner_years.height),
            ),
        ),
        year_shock_count=_payload_scalar(
            site_payload,
            "year_shock_count",
            default=_payload_scalar(
                summary_payload,
                "year_shock_count",
                default=int(year_shocks.height),
            ),
        ),
        macro_trajectory_count=_payload_scalar(
            site_payload,
            "macro_trajectory_count",
            default=_payload_scalar(
                summary_payload,
                "macro_trajectory_count",
                default=int(macro_trajectories.height),
            ),
        ),
    )
    return ReplayMeasurementBundle(
        round_id=round_id,
        seed_index=seed_index,
        replay_run_count=replay_run_count,
        frame_transition_count=frame_transition_count,
        site_transition_counts_by_step=site_transition_counts_by_step,
        site_opportunities=site_opportunities,
        settlement_measurements=settlement_measurements,
        live_settlement_transitions=live_settlement_transitions,
        ruin_transitions=ruin_transitions,
        pairwise_candidates=pairwise_candidates,
        owner_years=owner_years,
        year_shocks=year_shocks,
        macro_trajectories=macro_trajectories,
        summary=summary,
    )


def load_replay_measurement_bundle_projected(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    *,
    site_opportunity_columns: tuple[str, ...] = (),
    settlement_measurement_columns: tuple[str, ...] = (),
    pairwise_candidate_columns: tuple[str, ...] = (),
    ruin_transition_columns: tuple[str, ...] = (),
    owner_year_columns: tuple[str, ...] = (),
    year_shock_columns: tuple[str, ...] = (),
    macro_trajectory_columns: tuple[str, ...] = (),
    site_opportunity_max_rows: int | None = None,
    settlement_measurement_max_rows: int | None = None,
    pairwise_candidate_max_rows: int | None = None,
    ruin_transition_max_rows: int | None = None,
    owner_year_max_rows: int | None = None,
    year_shock_max_rows: int | None = None,
    macro_trajectory_max_rows: int | None = None,
    sampling_seed: int = 0,
) -> ReplayMeasurementBundle | None:
    site_transition_path = paths.replay_site_transition_path(round_id, seed_index)
    if not site_transition_path.exists():
        return None

    site_payload = load_named_arrays(site_transition_path)
    summary_payload = {}
    replay_summary_path = paths.replay_summary_path(round_id, seed_index)
    if replay_summary_path.exists():
        summary_payload = load_named_arrays(replay_summary_path)

    site_transition_counts_by_step = np.asarray(
        site_payload["site_transition_counts_by_step"],
        dtype=np.int32,
    )
    replay_run_count = _payload_scalar(
        site_payload,
        "replay_run_count",
        default=_payload_scalar(summary_payload, "replay_run_count", default=0),
    )
    if replay_run_count <= 0:
        replay_run_count = len(list(paths.raw_replay_dir(round_id, seed_index).glob("*.json")))
    frame_transition_count = _payload_scalar(
        site_payload,
        "frame_transition_count",
        default=_payload_scalar(
            summary_payload,
            "frame_transition_count",
            default=site_transition_counts_by_step.shape[0] * max(1, replay_run_count),
        ),
    )
    site_opportunity_count = _payload_scalar(
        site_payload,
        "site_opportunity_count",
        default=_payload_scalar(summary_payload, "site_opportunity_count", default=0),
    )
    settlement_measurement_count = _payload_scalar(
        site_payload,
        "settlement_measurement_count",
        default=_payload_scalar(summary_payload, "settlement_measurement_count", default=0),
    )
    pairwise_candidate_count = _payload_scalar(
        site_payload,
        "pairwise_candidate_count",
        default=_payload_scalar(summary_payload, "pairwise_candidate_count", default=0),
    )
    ruin_transition_count = _payload_scalar(
        site_payload,
        "ruin_transition_count",
        default=_payload_scalar(summary_payload, "ruin_transition_count", default=0),
    )
    owner_year_count = _payload_scalar(
        site_payload,
        "owner_year_count",
        default=_payload_scalar(summary_payload, "owner_year_count", default=0),
    )
    year_shock_count = _payload_scalar(
        site_payload,
        "year_shock_count",
        default=_payload_scalar(summary_payload, "year_shock_count", default=0),
    )
    macro_trajectory_count = _payload_scalar(
        site_payload,
        "macro_trajectory_count",
        default=_payload_scalar(summary_payload, "macro_trajectory_count", default=0),
    )

    site_opportunities = _read_parquet_projection(
        paths.replay_site_opportunity_path(round_id, seed_index),
        SITE_OPPORTUNITY_SCHEMA,
        columns=site_opportunity_columns or tuple(SITE_OPPORTUNITY_SCHEMA),
        row_count_hint=site_opportunity_count,
        max_rows=site_opportunity_max_rows,
        sample_seed=sampling_seed + 1,
        derived_columns={
            "site_ruin_created": (pl.col("prev_grid_code") != 3) & (pl.col("next_grid_code") == 3),
        },
    )
    settlement_measurements = _read_parquet_projection(
        paths.replay_settlement_measurement_path(round_id, seed_index),
        SETTLEMENT_MEASUREMENT_SCHEMA,
        columns=settlement_measurement_columns or tuple(SETTLEMENT_MEASUREMENT_SCHEMA),
        row_count_hint=settlement_measurement_count,
        max_rows=settlement_measurement_max_rows,
        sample_seed=sampling_seed + 2,
    )
    pairwise_candidates = _read_parquet_projection(
        paths.replay_pairwise_candidate_path(round_id, seed_index),
        PAIRWISE_CANDIDATE_SCHEMA,
        columns=pairwise_candidate_columns or tuple(PAIRWISE_CANDIDATE_SCHEMA),
        row_count_hint=pairwise_candidate_count,
        max_rows=pairwise_candidate_max_rows,
        sample_seed=sampling_seed + 3,
    )
    ruin_transitions = _read_parquet_projection(
        paths.replay_ruin_transition_path(round_id, seed_index),
        RUIN_TRANSITION_SCHEMA,
        columns=ruin_transition_columns or tuple(RUIN_TRANSITION_SCHEMA),
        row_count_hint=ruin_transition_count,
        max_rows=ruin_transition_max_rows,
        sample_seed=sampling_seed + 4,
    )
    owner_years = _read_parquet_projection(
        paths.replay_owner_year_path(round_id, seed_index),
        OWNER_YEAR_SCHEMA,
        columns=owner_year_columns or tuple(OWNER_YEAR_SCHEMA),
        row_count_hint=owner_year_count,
        max_rows=owner_year_max_rows,
        sample_seed=sampling_seed + 5,
    )
    year_shocks = _read_parquet_projection(
        paths.replay_year_shock_path(round_id, seed_index),
        YEAR_SHOCK_SCHEMA,
        columns=year_shock_columns or tuple(YEAR_SHOCK_SCHEMA),
        row_count_hint=year_shock_count,
        max_rows=year_shock_max_rows,
        sample_seed=sampling_seed + 6,
    )
    macro_trajectories = _read_parquet_projection(
        paths.replay_macro_trajectory_path(round_id, seed_index),
        MACRO_TRAJECTORY_SCHEMA,
        columns=macro_trajectory_columns or tuple(MACRO_TRAJECTORY_SCHEMA),
        row_count_hint=macro_trajectory_count,
        max_rows=macro_trajectory_max_rows,
        sample_seed=sampling_seed + 7,
    )

    summary = ReplayMeasurementSeedSummary(
        round_id=round_id,
        seed_index=seed_index,
        replay_run_count=replay_run_count,
        frame_transition_count=frame_transition_count,
        site_transition_count=_payload_scalar(
            site_payload,
            "site_transition_count",
            default=int(site_transition_counts_by_step.sum()),
        ),
        site_opportunity_count=site_opportunity_count or int(site_opportunities.height),
        settlement_measurement_count=(
            settlement_measurement_count or int(settlement_measurements.height)
        ),
        live_settlement_transition_count=_payload_scalar(
            site_payload,
            "live_settlement_transition_count",
            default=_payload_scalar(summary_payload, "live_settlement_transition_count", default=0),
        ),
        ruin_transition_count=_payload_scalar(
            site_payload,
            "ruin_transition_count",
            default=ruin_transition_count or int(ruin_transitions.height),
        ),
        pairwise_candidate_count=pairwise_candidate_count or int(pairwise_candidates.height),
        owner_year_count=_payload_scalar(
            site_payload,
            "owner_year_count",
            default=owner_year_count or int(owner_years.height),
        ),
        year_shock_count=year_shock_count or int(year_shocks.height),
        macro_trajectory_count=_payload_scalar(
            site_payload,
            "macro_trajectory_count",
            default=macro_trajectory_count or int(macro_trajectories.height),
        ),
    )
    return ReplayMeasurementBundle(
        round_id=round_id,
        seed_index=seed_index,
        replay_run_count=replay_run_count,
        frame_transition_count=frame_transition_count,
        site_transition_counts_by_step=site_transition_counts_by_step,
        site_opportunities=site_opportunities,
        settlement_measurements=settlement_measurements,
        live_settlement_transitions=pl.DataFrame(schema=LIVE_SETTLEMENT_TRANSITION_SCHEMA),
        ruin_transitions=ruin_transitions,
        pairwise_candidates=pairwise_candidates,
        owner_years=owner_years,
        year_shocks=year_shocks,
        macro_trajectories=macro_trajectories,
        summary=summary,
    )


def write_replay_measurement_bundle(
    paths: WorkspacePaths,
    bundle: ReplayMeasurementBundle,
) -> dict[str, Path]:
    round_id = bundle.round_id
    seed_index = bundle.seed_index
    site_transition_path = save_named_arrays(
        paths.replay_site_transition_path(round_id, seed_index),
        replay_measurement_payload(bundle),
    )
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
    bundle.site_opportunities.write_parquet(site_opportunity_path)
    bundle.settlement_measurements.write_parquet(settlement_measurement_path)
    bundle.live_settlement_transitions.write_parquet(live_settlement_transition_path)
    bundle.ruin_transitions.write_parquet(ruin_transition_path)
    bundle.pairwise_candidates.write_parquet(pairwise_candidate_path)
    bundle.owner_years.write_parquet(owner_year_path)
    bundle.year_shocks.write_parquet(year_shock_path)
    bundle.macro_trajectories.write_parquet(macro_trajectory_path)
    return {
        "site_transition_path": site_transition_path,
        "site_opportunity_path": site_opportunity_path,
        "settlement_measurement_path": settlement_measurement_path,
        "live_settlement_transition_path": live_settlement_transition_path,
        "ruin_transition_path": ruin_transition_path,
        "pairwise_candidate_path": pairwise_candidate_path,
        "owner_year_path": owner_year_path,
        "year_shock_path": year_shock_path,
        "macro_trajectory_path": macro_trajectory_path,
    }


def materialize_round_replay_measurements(
    paths: WorkspacePaths,
    round_id: str,
) -> list[ReplayMeasurementBundle]:
    round_record = read_round_record(paths, round_id)
    round_features = compute_round_features(round_record.round)
    bundles: list[ReplayMeasurementBundle] = []
    for seed_index in range(round_record.round.seeds_count):
        runs = load_seed_replay_runs(paths, round_id, seed_index)
        if not runs:
            continue
        bundle = build_replay_measurement_bundle(
            np.asarray(round_record.round.initial_states[seed_index].grid, dtype=np.int64),
            round_features.per_seed[seed_index],
            runs,
        )
        write_replay_measurement_bundle(paths, bundle)
        bundles.append(bundle)
    return bundles


__all__ = [
    "ReplayMeasurementBundle",
    "ReplayMeasurementRoundSummary",
    "ReplayMeasurementSeedSummary",
    "build_replay_measurement_bundle",
    "build_round_measurement_summary",
    "load_replay_measurement_bundle",
    "load_replay_measurement_bundle_projected",
    "materialize_round_replay_measurements",
    "replay_measurement_payload",
    "write_replay_measurement_bundle",
]
