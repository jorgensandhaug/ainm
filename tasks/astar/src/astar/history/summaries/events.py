from __future__ import annotations

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.core.types import BoolArray, IntArray
from astar.core.world_state import SettlementFullState
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays

BUILT_CODES = (1, 2, 3)
EMPTY_CODES = (0, 10, 11)

CELL_EVENT_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "y": pl.Int64,
    "x": pl.Int64,
    "prev_code": pl.Int64,
    "next_code": pl.Int64,
    "event_kind": pl.String,
    "changed": pl.Boolean,
    "built_created": pl.Boolean,
    "port_created": pl.Boolean,
    "ruin_created": pl.Boolean,
    "forest_created": pl.Boolean,
    "rebuilt_from_ruin": pl.Boolean,
    "reclaimed_by_forest": pl.Boolean,
    "cleared_to_empty": pl.Boolean,
    "matched_collapse_to_ruin": pl.Boolean,
    "matched_settlement_rebuild": pl.Boolean,
}

SETTLEMENT_TRANSITION_SCHEMA: dict[str, pl.DataType] = {
    "replay_run_id": pl.String,
    "round_id": pl.String,
    "seed_index": pl.Int64,
    "step": pl.Int64,
    "y": pl.Int64,
    "x": pl.Int64,
    "prev_present": pl.Boolean,
    "next_present": pl.Boolean,
    "prev_alive": pl.Boolean,
    "next_alive": pl.Boolean,
    "prev_has_port": pl.Boolean,
    "next_has_port": pl.Boolean,
    "prev_owner_id": pl.Int64,
    "next_owner_id": pl.Int64,
    "prev_grid_code": pl.Int64,
    "next_grid_code": pl.Int64,
    "birth": pl.Boolean,
    "rebuild": pl.Boolean,
    "collapse": pl.Boolean,
    "collapse_to_ruin": pl.Boolean,
    "port_gain": pl.Boolean,
    "port_loss": pl.Boolean,
    "owner_flip": pl.Boolean,
    "stat_change": pl.Boolean,
    "changed": pl.Boolean,
    "transition_kind": pl.String,
    "population_delta": pl.Float64,
    "food_delta": pl.Float64,
    "wealth_delta": pl.Float64,
    "defense_delta": pl.Float64,
}


class ReplayEventTensorBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    replay_run_id: str
    round_id: str
    seed_index: int = Field(ge=0)
    built_mask_by_step: BoolArray
    port_mask_by_step: BoolArray
    ruin_mask_by_step: BoolArray
    alive_count_by_step: IntArray
    port_count_by_step: IntArray
    ruin_count_by_step: IntArray


class ReplayEventTableBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    frame_transition_count: int = Field(ge=0)
    cell_events: pl.DataFrame
    settlement_transitions: pl.DataFrame

    @property
    def cell_event_count(self) -> int:
        return int(self.cell_events.height)

    @property
    def settlement_transition_count(self) -> int:
        return int(self.settlement_transitions.height)


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


def _read_parquet_or_empty(path, schema: dict[str, pl.DataType]) -> pl.DataFrame:
    if path.exists():
        return pl.read_parquet(path)
    return pl.DataFrame(schema=schema)


def _build_frame(
    rows: list[dict[str, object]],
    schema: dict[str, pl.DataType],
) -> pl.DataFrame:
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


def _is_nonzero(value: float | None) -> bool:
    return value is not None and abs(value) > 1e-9


def _cell_event_kind(previous_code: int, current_code: int) -> str:
    if previous_code == current_code:
        return "unchanged"
    if previous_code == 3 and current_code in (1, 2):
        return "rebuild"
    if previous_code == 3 and current_code == 4:
        return "ruin_to_forest"
    if previous_code not in BUILT_CODES and current_code in (1, 2):
        return "build"
    if previous_code in BUILT_CODES and current_code == 2 and previous_code != 2:
        return "port_gain"
    if previous_code != 3 and current_code == 3:
        return "ruin"
    if previous_code != 4 and current_code == 4:
        return "forest_gain"
    if previous_code in BUILT_CODES and current_code in EMPTY_CODES:
        return "clear"
    return "change"


def _settlement_transition_kind(
    *,
    birth: bool,
    rebuild: bool,
    collapse_to_ruin: bool,
    collapse: bool,
    port_gain: bool,
    port_loss: bool,
    owner_flip: bool,
    stat_change: bool,
) -> str:
    if birth:
        return "birth"
    if rebuild:
        return "rebuild"
    if collapse_to_ruin:
        return "collapse_to_ruin"
    if collapse:
        return "collapse"
    if port_gain:
        return "port_gain"
    if port_loss:
        return "port_loss"
    if owner_flip:
        return "owner_flip"
    if stat_change:
        return "stat_change"
    return "steady"


def _settlement_index(
    frame_settlements: tuple[SettlementFullState, ...],
) -> dict[tuple[int, int], SettlementFullState]:
    return {(settlement.x, settlement.y): settlement for settlement in frame_settlements}


def extract_replay_event_tensors(run: ReplayRun) -> ReplayEventTensorBundle:
    built_masks: list[np.ndarray] = []
    port_masks: list[np.ndarray] = []
    ruin_masks: list[np.ndarray] = []
    alive_counts: list[int] = []
    port_counts: list[int] = []
    ruin_counts: list[int] = []

    for frame in run.frames:
        built_mask = np.isin(frame.grid, BUILT_CODES)
        port_mask = frame.grid == 2
        ruin_mask = frame.grid == 3
        built_masks.append(built_mask.astype(np.bool_))
        port_masks.append(port_mask.astype(np.bool_))
        ruin_masks.append(ruin_mask.astype(np.bool_))
        alive_counts.append(sum(1 for settlement in frame.settlements if settlement.alive))
        port_counts.append(sum(1 for settlement in frame.settlements if settlement.has_port))
        ruin_counts.append(int(np.count_nonzero(ruin_mask)))

    return ReplayEventTensorBundle(
        replay_run_id=run.replay_run_id,
        round_id=run.round_id,
        seed_index=run.seed_index,
        built_mask_by_step=np.stack(built_masks, axis=0),
        port_mask_by_step=np.stack(port_masks, axis=0),
        ruin_mask_by_step=np.stack(ruin_masks, axis=0),
        alive_count_by_step=np.asarray(alive_counts, dtype=np.int64),
        port_count_by_step=np.asarray(port_counts, dtype=np.int64),
        ruin_count_by_step=np.asarray(ruin_counts, dtype=np.int64),
    )


def extract_replay_event_tables(runs: list[ReplayRun]) -> ReplayEventTableBundle:
    if not runs:
        raise ValueError("cannot extract replay event tables for empty replay list")

    cell_rows: list[dict[str, object]] = []
    settlement_rows: list[dict[str, object]] = []
    frame_transition_count = 0

    for run in runs:
        frame_transition_count += max(0, len(run.frames) - 1)
        for frame_index in range(len(run.frames) - 1):
            previous_frame = run.frames[frame_index]
            current_frame = run.frames[frame_index + 1]
            previous_index = _settlement_index(previous_frame.settlements)
            current_index = _settlement_index(current_frame.settlements)
            positions = sorted(
                set(previous_index) | set(current_index),
                key=lambda item: (item[1], item[0]),
            )
            collapse_to_ruin_positions: set[tuple[int, int]] = set()
            rebuild_positions: set[tuple[int, int]] = set()
            for x, y in positions:
                previous = previous_index.get((x, y))
                current = current_index.get((x, y))

                previous_present = previous is not None
                current_present = current is not None
                previous_alive = bool(previous.alive) if previous is not None else False
                current_alive = bool(current.alive) if current is not None else False
                previous_has_port = bool(previous.has_port) if previous is not None else False
                current_has_port = bool(current.has_port) if current is not None else False
                previous_owner_id = previous.owner_id if previous is not None else None
                current_owner_id = current.owner_id if current is not None else None
                previous_code = int(previous_frame.grid[y, x])
                current_code = int(current_frame.grid[y, x])

                birth = (not previous_alive) and current_alive and previous_code != 3
                rebuild = (not previous_alive) and current_alive and previous_code == 3
                collapse = previous_alive and (not current_alive)
                collapse_to_ruin = collapse and current_code == 3
                if collapse_to_ruin:
                    collapse_to_ruin_positions.add((x, y))
                if rebuild:
                    rebuild_positions.add((x, y))
                port_gain = (
                    previous_alive
                    and current_alive
                    and current_has_port
                    and not previous_has_port
                )
                port_loss = (
                    previous_alive
                    and current_alive
                    and previous_has_port
                    and not current_has_port
                )
                owner_flip = (
                    previous_alive
                    and current_alive
                    and previous_owner_id is not None
                    and current_owner_id is not None
                    and previous_owner_id != current_owner_id
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
                stat_change = previous_alive and current_alive and any(
                    _is_nonzero(delta)
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
                        previous_present != current_present,
                        previous_code != current_code,
                    ],
                )

                settlement_rows.append(
                    {
                        "replay_run_id": run.replay_run_id,
                        "round_id": run.round_id,
                        "seed_index": run.seed_index,
                        "step": frame_index,
                        "y": y,
                        "x": x,
                        "prev_present": previous_present,
                        "next_present": current_present,
                        "prev_alive": previous_alive,
                        "next_alive": current_alive,
                        "prev_has_port": previous_has_port,
                        "next_has_port": current_has_port,
                        "prev_owner_id": previous_owner_id,
                        "next_owner_id": current_owner_id,
                        "prev_grid_code": previous_code,
                        "next_grid_code": current_code,
                        "birth": birth,
                        "rebuild": rebuild,
                        "collapse": collapse,
                        "collapse_to_ruin": collapse_to_ruin,
                        "port_gain": port_gain,
                        "port_loss": port_loss,
                        "owner_flip": owner_flip,
                        "stat_change": stat_change,
                        "changed": changed,
                        "transition_kind": _settlement_transition_kind(
                            birth=birth,
                            rebuild=rebuild,
                            collapse_to_ruin=collapse_to_ruin,
                            collapse=collapse,
                            port_gain=port_gain,
                            port_loss=port_loss,
                            owner_flip=owner_flip,
                            stat_change=stat_change,
                        ),
                        "population_delta": population_delta,
                        "food_delta": food_delta,
                        "wealth_delta": wealth_delta,
                        "defense_delta": defense_delta,
                    },
                )

            changed_y, changed_x = np.nonzero(previous_frame.grid != current_frame.grid)
            for y, x in zip(changed_y.tolist(), changed_x.tolist(), strict=True):
                previous_code = int(previous_frame.grid[y, x])
                current_code = int(current_frame.grid[y, x])
                event_kind = _cell_event_kind(previous_code, current_code)
                cell_rows.append(
                    {
                        "replay_run_id": run.replay_run_id,
                        "round_id": run.round_id,
                        "seed_index": run.seed_index,
                        "step": frame_index,
                        "y": y,
                        "x": x,
                        "prev_code": previous_code,
                        "next_code": current_code,
                        "event_kind": event_kind,
                        "changed": previous_code != current_code,
                        "built_created": event_kind == "build",
                        "port_created": previous_code != 2 and current_code == 2,
                        "ruin_created": previous_code != 3 and current_code == 3,
                        "forest_created": previous_code != 4 and current_code == 4,
                        "rebuilt_from_ruin": previous_code == 3 and current_code in (1, 2),
                        "reclaimed_by_forest": previous_code == 3 and current_code == 4,
                        "cleared_to_empty": (
                            previous_code in BUILT_CODES and current_code in EMPTY_CODES
                        ),
                        "matched_collapse_to_ruin": (x, y) in collapse_to_ruin_positions,
                        "matched_settlement_rebuild": (x, y) in rebuild_positions,
                    },
                )

    first_run = runs[0]
    return ReplayEventTableBundle(
        round_id=first_run.round_id,
        seed_index=first_run.seed_index,
        replay_run_count=len(runs),
        frame_transition_count=frame_transition_count,
        cell_events=_build_frame(cell_rows, CELL_EVENT_SCHEMA),
        settlement_transitions=_build_frame(settlement_rows, SETTLEMENT_TRANSITION_SCHEMA),
    )


def load_replay_event_tables(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> ReplayEventTableBundle | None:
    cell_event_path = paths.replay_cell_event_path(round_id, seed_index)
    settlement_event_path = paths.replay_settlement_event_path(round_id, seed_index)
    if not cell_event_path.exists() or not settlement_event_path.exists():
        return None

    summary_payload = {}
    replay_summary_path = paths.replay_summary_path(round_id, seed_index)
    if replay_summary_path.exists():
        summary_payload = load_named_arrays(replay_summary_path)

    replay_run_count = _payload_scalar(summary_payload, "replay_run_count", default=0)
    if replay_run_count <= 0:
        replay_run_count = len(list(paths.raw_replay_dir(round_id, seed_index).glob("*.json")))
    frame_transition_count = _payload_scalar(
        summary_payload,
        "frame_transition_count",
        default=0,
    )
    cell_events = _read_parquet_or_empty(cell_event_path, CELL_EVENT_SCHEMA)
    settlement_transitions = _read_parquet_or_empty(
        settlement_event_path,
        SETTLEMENT_TRANSITION_SCHEMA,
    )
    return ReplayEventTableBundle(
        round_id=round_id,
        seed_index=seed_index,
        replay_run_count=replay_run_count,
        frame_transition_count=frame_transition_count,
        cell_events=cell_events,
        settlement_transitions=settlement_transitions,
    )


__all__ = [
    "ReplayEventTableBundle",
    "ReplayEventTensorBundle",
    "extract_replay_event_tables",
    "extract_replay_event_tensors",
    "load_replay_event_tables",
]
