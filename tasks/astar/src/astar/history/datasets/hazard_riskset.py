from __future__ import annotations

import hashlib
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

SUPPORTED_HAZARD_EVENTS = (
    ReplayEventKind.BIRTH,
    ReplayEventKind.PORTIZATION,
    ReplayEventKind.COLLAPSE,
    ReplayEventKind.REBUILD,
    ReplayEventKind.RECLAIM_FOREST,
    ReplayEventKind.RECLAIM_EMPTY,
)


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


def _eligibility_and_labels(
    current_classes: np.ndarray,
    next_classes: np.ndarray,
    buildable: np.ndarray,
    *,
    event_type: ReplayEventKind,
) -> tuple[np.ndarray, np.ndarray]:
    if event_type == ReplayEventKind.BIRTH:
        eligible = buildable & ~np.isin(current_classes, (1, 2, 3, 5))
        labels = np.isin(next_classes, (1, 2))
        return eligible, labels
    if event_type == ReplayEventKind.PORTIZATION:
        eligible = current_classes == 1
        labels = next_classes == 2
        return eligible, labels
    if event_type == ReplayEventKind.COLLAPSE:
        eligible = np.isin(current_classes, (1, 2))
        labels = next_classes == 3
        return eligible, labels
    if event_type == ReplayEventKind.REBUILD:
        eligible = current_classes == 3
        labels = np.isin(next_classes, (1, 2))
        return eligible, labels
    if event_type == ReplayEventKind.RECLAIM_FOREST:
        eligible = current_classes == 3
        labels = next_classes == 4
        return eligible, labels
    if event_type == ReplayEventKind.RECLAIM_EMPTY:
        eligible = (current_classes == 3) & buildable
        labels = next_classes == 0
        return eligible, labels
    raise ValueError(f"unsupported hazard event type: {event_type}")


def _delta(before: float | None, after: float | None) -> float | None:
    if before is None or after is None:
        return None
    return float(after) - float(before)


def _negative_hash_score(
    round_id: str,
    replay_run_id: str,
    *,
    year_t: int,
    x: int,
    y: int,
    event_type: str,
) -> float:
    run_seed = hashlib.blake2b(
        f"{round_id}|{replay_run_id}|{event_type}".encode("utf-8"),
        digest_size=8,
    ).digest()
    base = int.from_bytes(run_seed, byteorder="big", signed=False)
    mixed = (
        base
        ^ (year_t * 0x9E3779B185EBCA87)
        ^ (x * 0xC2B2AE3D27D4EB4F)
        ^ (y * 0x165667B19E3779F9)
    ) & ((1 << 64) - 1)
    return float(mixed) / float(1 << 64)


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
    label: bool,
    sample_weight: float,
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
        "label": bool(label),
        "sample_weight": float(sample_weight),
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
        "before_has_port": before_has_port,
        "after_has_port": after_has_port,
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


def build_hazard_riskset_dataset(
    paths: WorkspacePaths,
    *,
    event_type: str,
    round_ids: list[str] | None = None,
    dataset_name: str | None = None,
    negative_ratio: float = 8.0,
) -> DatasetRef:
    event = ReplayEventKind(event_type)
    if event not in SUPPORTED_HAZARD_EVENTS:
        raise ValueError(f"unsupported hazard event for riskset dataset: {event_type}")
    if negative_ratio <= 0.0:
        raise ValueError("negative_ratio must be positive")

    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    resolved_dataset_name = dataset_name or f"hazard_riskset__event={event.value}__nr={negative_ratio:g}__v1"
    dataset_dir = paths.dataset_dir(resolved_dataset_name)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "riskset.parquet"
    summary_path = dataset_dir / "summary.json"

    positive_count = 0
    eligible_count = 0
    replay_run_count = 0
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        for seed in episode.seeds:
            static_grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
            buildable = buildable_mask(static_grid)
            for run in seed.replay_runs:
                replay_run_count += 1
                if len(run.frames) < 2:
                    continue
                collapsed_frames = [
                    np.asarray(collapse_internal_grid(frame.grid), dtype=np.int64)
                    for frame in run.frames
                ]
                for step in range(len(run.frames) - 1):
                    eligible, labels = _eligibility_and_labels(
                        collapsed_frames[step],
                        collapsed_frames[step + 1],
                        buildable,
                        event_type=event,
                    )
                    eligible_count += int(np.sum(eligible))
                    positive_count += int(np.sum(labels & eligible))

    negative_total = eligible_count - positive_count
    negative_keep_probability = 1.0
    if negative_total > 0:
        negative_keep_probability = min(1.0, (negative_ratio * positive_count) / float(negative_total))

    rows: list[dict[str, object]] = []
    sampled_negative_count = 0
    label_counts: Counter[str] = Counter()
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        for seed in episode.seeds:
            static_grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
            buildable = buildable_mask(static_grid)
            coast = coast_mask(static_grid)
            feature_dict = seed_feature_dict(seed.initial_state)
            settlement_proximity = np.asarray(feature_dict["settlement_proximity"], dtype=np.float64)
            maritime_access = np.asarray(feature_dict["maritime_access"], dtype=np.float64)
            frontier_score = np.asarray(feature_dict["frontier_score"], dtype=np.float64)
            forest_density = np.asarray(feature_dict["forest_density"], dtype=np.float64)
            mountain_density = np.asarray(feature_dict["mountain_density"], dtype=np.float64)

            for run in seed.replay_runs:
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
                    eligible, labels = _eligibility_and_labels(
                        current_classes,
                        next_classes,
                        buildable,
                        event_type=event,
                    )
                    for y, x in np.argwhere(eligible):
                        label = bool(labels[y, x])
                        if label:
                            label_counts["positive"] += 1
                            weight = 1.0
                        else:
                            score = _negative_hash_score(
                                round_id,
                                run.replay_run_id,
                                year_t=step,
                                x=int(x),
                                y=int(y),
                                event_type=event.value,
                            )
                            if score >= negative_keep_probability:
                                continue
                            sampled_negative_count += 1
                            label_counts["negative"] += 1
                            weight = 1.0 / negative_keep_probability
                        rows.append(
                            _row(
                                round_id=round_id,
                                round_number=int(episode.metadata.round_number or -1),
                                seed_index=seed.seed_index,
                                replay_run_id=run.replay_run_id,
                                year_t=step,
                                event_type=event.value,
                                x=int(x),
                                y=int(y),
                                current_class=int(current_classes[y, x]),
                                next_class=int(next_classes[y, x]),
                                label=label,
                                sample_weight=weight,
                                buildable=bool(buildable[y, x]),
                                coast=bool(coast[y, x]),
                                settlement_proximity=float(settlement_proximity[y, x]),
                                maritime_access=float(maritime_access[y, x]),
                                frontier_score=float(frontier_score[y, x]),
                                forest_density=float(forest_density[y, x]),
                                mountain_density=float(mountain_density[y, x]),
                                settlement_neighbors=int(settlement_neighbors_by_step[step][y, x]),
                                port_neighbors=int(port_neighbors_by_step[step][y, x]),
                                ruin_neighbors=int(ruin_neighbors_by_step[step][y, x]),
                                forest_neighbors=int(forest_neighbors_by_step[step][y, x]),
                                before_settlement=current_settlements.get((int(y), int(x))),
                                after_settlement=next_settlements.get((int(y), int(x))),
                            ),
                        )

    table = pl.DataFrame(rows, infer_schema_length=None)
    table.write_parquet(index_path)
    summary = {
        "dataset_name": resolved_dataset_name,
        "dataset_kind": "hazard_riskset",
        "event_type": event.value,
        "negative_ratio": negative_ratio,
        "negative_keep_probability": negative_keep_probability,
        "row_count": table.height,
        "round_count": len(selected_round_ids),
        "replay_run_count": replay_run_count,
        "eligible_count": eligible_count,
        "positive_count": positive_count,
        "negative_total": negative_total,
        "sampled_negative_count": sampled_negative_count,
        "sampled_positive_count": label_counts.get("positive", 0),
        "observed_positive_rate": 0.0 if table.height == 0 else label_counts.get("positive", 0) / float(table.height),
        "population_positive_rate": 0.0 if eligible_count == 0 else positive_count / float(eligible_count),
        "index_path": str(index_path),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="dataset_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=summary,
            spec_name=resolved_dataset_name,
        ),
    )
    return DatasetRef(
        dataset_name=resolved_dataset_name,
        dataset_kind="hazard_riskset",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=table.height,
        round_count=len(selected_round_ids),
    )
