from __future__ import annotations

import json
from collections import Counter

import numpy as np
import polars as pl

from astar.core.events import ReplayEventKind
from astar.core.terrain import buildable_mask, collapse_internal_grid
from astar.core.world_state import SettlementFullState, WorldFrame
from astar.features.coasts import coast_mask
from astar.history.datasets.base import DatasetRef
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import seed_feature_dict
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable


def _neighbor_count(mask: np.ndarray) -> np.ndarray:
    mask_array = np.asarray(mask, dtype=np.int64)
    height, width = mask_array.shape
    padded = np.pad(mask_array, 1, mode="constant", constant_values=0)
    out = np.zeros((height, width), dtype=np.int64)
    for dy in range(3):
        for dx in range(3):
            out += padded[dy : dy + height, dx : dx + width]
    return out


def _settlement_map(frame: WorldFrame) -> dict[tuple[int, int], SettlementFullState]:
    return {(item.y, item.x): item for item in frame.settlements}


def _delta(before: float | None, after: float | None) -> float | None:
    if before is None or after is None:
        return None
    return float(after) - float(before)


def _row(
    *,
    round_id: str,
    round_number: int,
    seed_index: int,
    replay_run_id: str,
    year_t: int,
    event_type: str,
    x: int,
    y: int,
    current_class: int,
    next_class: int,
    buildable: bool,
    coast: bool,
    settlement_proximity: float,
    maritime_access: float,
    frontier_score: float,
    forest_density: float,
    mountain_density: float,
    settlement_neighbors: int,
    port_neighbors: int,
    ruin_neighbors: int,
    forest_neighbors: int,
    before_settlement: SettlementFullState | None,
    after_settlement: SettlementFullState | None,
) -> dict[str, object]:
    before_population = None if before_settlement is None else before_settlement.population
    after_population = None if after_settlement is None else after_settlement.population
    before_food = None if before_settlement is None else before_settlement.food
    after_food = None if after_settlement is None else after_settlement.food
    before_wealth = None if before_settlement is None else before_settlement.wealth
    after_wealth = None if after_settlement is None else after_settlement.wealth
    before_defense = None if before_settlement is None else before_settlement.defense
    after_defense = None if after_settlement is None else after_settlement.defense
    before_owner = None if before_settlement is None else before_settlement.owner_id
    after_owner = None if after_settlement is None else after_settlement.owner_id
    before_has_port = None if before_settlement is None else before_settlement.has_port
    after_has_port = None if after_settlement is None else after_settlement.has_port
    before_alive = None if before_settlement is None else before_settlement.alive
    after_alive = None if after_settlement is None else after_settlement.alive
    return {
        "round_id": round_id,
        "round_number": round_number,
        "seed_index": seed_index,
        "replay_run_id": replay_run_id,
        "year_t": year_t,
        "event_type": event_type,
        "x": x,
        "y": y,
        "current_class": current_class,
        "next_class": next_class,
        "buildable": buildable,
        "coast": coast,
        "settlement_proximity": settlement_proximity,
        "maritime_access": maritime_access,
        "frontier_score": frontier_score,
        "forest_density": forest_density,
        "mountain_density": mountain_density,
        "settlement_neighbors": settlement_neighbors,
        "port_neighbors": port_neighbors,
        "ruin_neighbors": ruin_neighbors,
        "forest_neighbors": forest_neighbors,
        "before_owner_id": before_owner,
        "after_owner_id": after_owner,
        "owner_changed": before_owner is not None and after_owner is not None and before_owner != after_owner,
        "before_has_port": before_has_port,
        "after_has_port": after_has_port,
        "before_alive": before_alive,
        "after_alive": after_alive,
        "population_before": before_population,
        "population_after": after_population,
        "population_delta": _delta(before_population, after_population),
        "food_before": before_food,
        "food_after": after_food,
        "food_delta": _delta(before_food, after_food),
        "wealth_before": before_wealth,
        "wealth_after": after_wealth,
        "wealth_delta": _delta(before_wealth, after_wealth),
        "defense_before": before_defense,
        "defense_after": after_defense,
        "defense_delta": _delta(before_defense, after_defense),
    }


def build_replay_event_ledger_dataset(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "replay_event_ledger_v1",
) -> DatasetRef:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "events.parquet"
    summary_path = dataset_dir / "summary.json"

    rows: list[dict[str, object]] = []
    replay_run_count = 0
    event_counts: Counter[str] = Counter()
    invariant_counts: Counter[str] = Counter()
    per_round_event_counts: dict[str, Counter[str]] = {}

    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        per_round_counter: Counter[str] = Counter()
        for seed in episode.seeds:
            static_grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
            static_classes = np.asarray(collapse_internal_grid(static_grid), dtype=np.int64)
            buildable = buildable_mask(static_grid)
            coast = coast_mask(static_grid)
            feature_dict = seed_feature_dict(seed.initial_state)
            settlement_proximity = np.asarray(feature_dict["settlement_proximity"], dtype=np.float64)
            maritime_access = np.asarray(feature_dict["maritime_access"], dtype=np.float64)
            frontier_score = np.asarray(feature_dict["frontier_score"], dtype=np.float64)
            forest_density = np.asarray(feature_dict["forest_density"], dtype=np.float64)
            mountain_density = np.asarray(feature_dict["mountain_density"], dtype=np.float64)

            for run in seed.replay_runs:
                replay_run_count += 1
                if len(run.frames) < 2:
                    continue
                collapsed_frames = [
                    np.asarray(collapse_internal_grid(frame.grid), dtype=np.int64)
                    for frame in run.frames
                ]
                settlement_neighbors_by_step = [_neighbor_count(frame == 1) for frame in collapsed_frames]
                port_neighbors_by_step = [_neighbor_count(frame == 2) for frame in collapsed_frames]
                ruin_neighbors_by_step = [_neighbor_count(frame == 3) for frame in collapsed_frames]
                forest_neighbors_by_step = [_neighbor_count(frame == 4) for frame in collapsed_frames]

                for step in range(len(run.frames) - 1):
                    current_frame = run.frames[step]
                    next_frame = run.frames[step + 1]
                    current_classes = collapsed_frames[step]
                    next_classes = collapsed_frames[step + 1]
                    current_settlements = _settlement_map(current_frame)
                    next_settlements = _settlement_map(next_frame)
                    change_coords = {tuple(index) for index in np.argwhere(current_classes != next_classes)}
                    settlement_coords = set(current_settlements) | set(next_settlements)
                    candidate_coords = change_coords | settlement_coords

                    for y, x in sorted(candidate_coords):
                        current_class = int(current_classes[y, x])
                        next_class = int(next_classes[y, x])
                        before_settlement = current_settlements.get((y, x))
                        after_settlement = next_settlements.get((y, x))
                        static_is_buildable = bool(buildable[y, x])
                        static_is_coast = bool(coast[y, x])
                        if next_class == 2 and not static_is_coast:
                            invariant_counts["port_noncoastal_next_count"] += 1
                        if next_class in (1, 2, 3) and not static_is_buildable:
                            invariant_counts["structural_nonbuildable_next_count"] += 1
                        if int(static_classes[y, x]) == 5 and next_class != 5:
                            invariant_counts["mountain_transition_count"] += 1
                        if (
                            before_settlement is not None
                            and after_settlement is not None
                            and before_settlement.owner_id is not None
                            and after_settlement.owner_id is not None
                            and before_settlement.owner_id != after_settlement.owner_id
                            and not (current_class in (1, 2) and next_class in (1, 2))
                        ):
                            invariant_counts["owner_switch_without_settlement_persistence_count"] += 1

                        common = {
                            "round_id": round_id,
                            "round_number": int(episode.metadata.round_number or -1),
                            "seed_index": seed.seed_index,
                            "replay_run_id": run.replay_run_id,
                            "year_t": step,
                            "x": x,
                            "y": y,
                            "current_class": current_class,
                            "next_class": next_class,
                            "buildable": static_is_buildable,
                            "coast": static_is_coast,
                            "settlement_proximity": float(settlement_proximity[y, x]),
                            "maritime_access": float(maritime_access[y, x]),
                            "frontier_score": float(frontier_score[y, x]),
                            "forest_density": float(forest_density[y, x]),
                            "mountain_density": float(mountain_density[y, x]),
                            "settlement_neighbors": int(settlement_neighbors_by_step[step][y, x]),
                            "port_neighbors": int(port_neighbors_by_step[step][y, x]),
                            "ruin_neighbors": int(ruin_neighbors_by_step[step][y, x]),
                            "forest_neighbors": int(forest_neighbors_by_step[step][y, x]),
                            "before_settlement": before_settlement,
                            "after_settlement": after_settlement,
                        }

                        emitted: list[str] = []
                        if before_settlement is not None or after_settlement is not None:
                            emitted.append(ReplayEventKind.SETTLEMENT_DELTA)
                        if current_class not in (1, 2, 3) and next_class in (1, 2):
                            emitted.append(ReplayEventKind.BIRTH)
                        if current_class == 1 and next_class == 2:
                            emitted.append(ReplayEventKind.PORTIZATION)
                        if current_class in (1, 2) and next_class == 3:
                            emitted.append(ReplayEventKind.COLLAPSE)
                        if current_class == 3 and next_class in (1, 2):
                            emitted.append(ReplayEventKind.REBUILD)
                        if current_class == 3 and next_class == 4:
                            emitted.append(ReplayEventKind.RECLAIM_FOREST)
                        if current_class == 3 and next_class == 0 and static_is_buildable:
                            emitted.append(ReplayEventKind.RECLAIM_EMPTY)
                        if (
                            before_settlement is not None
                            and after_settlement is not None
                            and before_settlement.owner_id is not None
                            and after_settlement.owner_id is not None
                            and before_settlement.owner_id != after_settlement.owner_id
                            and current_class in (1, 2)
                            and next_class in (1, 2)
                        ):
                            emitted.append(ReplayEventKind.OWNER_SWITCH)

                        for event_type in emitted:
                            rows.append(_row(event_type=str(event_type), **common))
                            event_counts[str(event_type)] += 1
                            per_round_counter[str(event_type)] += 1

        per_round_event_counts[round_id] = per_round_counter

    table = pl.DataFrame(rows, infer_schema_length=None)
    table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "replay_event_ledger",
        "row_count": table.height,
        "round_count": len(selected_round_ids),
        "replay_run_count": replay_run_count,
        "index_path": str(index_path),
        "event_counts": dict(event_counts),
        "per_round_event_counts": {round_id: dict(counter) for round_id, counter in per_round_event_counts.items()},
        "invariant_counts": dict(invariant_counts),
        "distinct_event_type_count": len(event_counts),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="dataset_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=summary,
            spec_name=dataset_name,
        ),
    )
    return DatasetRef(
        dataset_name=dataset_name,
        dataset_kind="replay_event_ledger",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=table.height,
        round_count=len(selected_round_ids),
    )
