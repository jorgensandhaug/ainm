from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.history.datasets.base import DatasetRef
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import SeedEpisode
from astar.history.summaries.round_coefficients import seed_feature_dict, seed_feature_names
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable

_MEMORY_FEATURE_NAMES = ("occupied_recent", "ruin_recent", "port_recent")


def _memory_feature_names(*, include_memory_features: bool) -> list[str]:
    return list(_MEMORY_FEATURE_NAMES) if include_memory_features else []


def _empty_seed_transition_frame(
    feature_names: list[str],
    *,
    include_memory_features: bool,
) -> pl.DataFrame:
    payload: dict[str, np.ndarray] = {
        "step": np.asarray([], dtype=np.int32),
        "y": np.asarray([], dtype=np.int32),
        "x": np.asarray([], dtype=np.int32),
        "current_class": np.asarray([], dtype=np.int8),
        "count_total": np.asarray([], dtype=np.int32),
    }
    for class_index in range(CLASS_COUNT):
        payload[f"next_count_{class_index}"] = np.asarray([], dtype=np.int32)
    for feature_name in feature_names:
        payload[feature_name] = np.asarray([], dtype=np.float32)
    for feature_name in _memory_feature_names(include_memory_features=include_memory_features):
        payload[feature_name] = np.asarray([], dtype=np.float32)
    return pl.DataFrame(payload)


def _collapsed_memory_indicators(collapsed_grid: np.ndarray) -> np.ndarray:
    occupied = np.isin(collapsed_grid, (1, 2)).astype(np.float32, copy=False)
    ruin = (collapsed_grid == 3).astype(np.float32, copy=False)
    port = (collapsed_grid == 2).astype(np.float32, copy=False)
    return np.stack([occupied, ruin, port], axis=-1)


def _build_run_collapsed_grids_and_memory(
    seed_run,
    *,
    step_count: int,
    include_memory_features: bool,
    memory_decay: float,
) -> tuple[list[np.ndarray], np.ndarray | None]:
    collapsed_frames = [
        collapse_internal_grid(np.asarray(frame.grid, dtype=np.int64))
        for frame in seed_run.frames
    ]
    if not include_memory_features or step_count <= 0:
        return collapsed_frames, None

    height, width = collapsed_frames[0].shape
    memory_tensor = np.zeros(
        (step_count, height, width, len(_MEMORY_FEATURE_NAMES)),
        dtype=np.float32,
    )
    previous = _collapsed_memory_indicators(collapsed_frames[0])
    memory_tensor[0] = previous
    for step in range(1, step_count):
        current = _collapsed_memory_indicators(collapsed_frames[step])
        previous = (memory_decay * previous) + ((1.0 - memory_decay) * current)
        memory_tensor[step] = previous.astype(np.float32, copy=False)
    return collapsed_frames, memory_tensor


def _build_seed_transition_frame(
    round_id: str,
    round_number: int,
    seed: SeedEpisode,
    *,
    include_memory_features: bool,
    memory_decay: float,
) -> tuple[pl.DataFrame, int]:
    del round_id, round_number
    feature_names = seed_feature_names()
    if not seed.replay_runs:
        return _empty_seed_transition_frame(
            feature_names,
            include_memory_features=include_memory_features,
        ), 0

    first_run = seed.replay_runs[0]
    height, width = first_run.frames[0].grid.shape
    step_count = len(first_run.frames) - 1
    transition_counts = np.zeros(
        (step_count, height, width, CLASS_COUNT, CLASS_COUNT),
        dtype=np.int32,
    )
    memory_sums = (
        np.zeros(
            (step_count, height, width, CLASS_COUNT, len(_MEMORY_FEATURE_NAMES)),
            dtype=np.float32,
        )
        if include_memory_features
        else None
    )
    y_index, x_index = np.indices((height, width), dtype=np.int32)
    for run in seed.replay_runs:
        collapsed_frames, memory_tensor = _build_run_collapsed_grids_and_memory(
            run,
            step_count=step_count,
            include_memory_features=include_memory_features,
            memory_decay=memory_decay,
        )
        for step in range(step_count):
            current_grid = collapsed_frames[step]
            next_grid = collapsed_frames[step + 1]
            transition_counts[step, y_index, x_index, current_grid, next_grid] += 1
            if memory_sums is not None and memory_tensor is not None:
                for memory_index in range(len(_MEMORY_FEATURE_NAMES)):
                    np.add.at(
                        memory_sums[step, :, :, :, memory_index],
                        (y_index, x_index, current_grid),
                        memory_tensor[step, :, :, memory_index],
                    )

    feature_dict = seed_feature_dict(seed.initial_state)
    frames: list[pl.DataFrame] = []
    for current_class in range(CLASS_COUNT):
        class_counts = transition_counts[..., current_class, :]
        count_total = np.sum(class_counts, axis=-1)
        mask = count_total > 0
        if not np.any(mask):
            continue
        step_idx, y_idx, x_idx = np.nonzero(mask)
        payload: dict[str, np.ndarray] = {
            "step": step_idx.astype(np.int32, copy=False),
            "y": y_idx.astype(np.int32, copy=False),
            "x": x_idx.astype(np.int32, copy=False),
            "current_class": np.full(step_idx.shape, current_class, dtype=np.int8),
            "count_total": count_total[step_idx, y_idx, x_idx].astype(np.int32, copy=False),
        }
        for next_class in range(CLASS_COUNT):
            payload[f"next_count_{next_class}"] = class_counts[
                step_idx,
                y_idx,
                x_idx,
                next_class,
            ].astype(np.int32, copy=False)
        for feature_name in feature_names:
            payload[feature_name] = np.asarray(
                feature_dict[feature_name][y_idx, x_idx],
                dtype=np.float32,
            )
        if memory_sums is not None:
            memory_mean = (
                memory_sums[step_idx, y_idx, x_idx, current_class]
                / np.maximum(count_total[step_idx, y_idx, x_idx, None], 1)
            )
            for memory_index, feature_name in enumerate(_MEMORY_FEATURE_NAMES):
                payload[feature_name] = memory_mean[:, memory_index].astype(np.float32, copy=False)
        frames.append(pl.DataFrame(payload))
    if not frames:
        return _empty_seed_transition_frame(
            feature_names,
            include_memory_features=include_memory_features,
        ), step_count
    return pl.concat(frames, how="vertical"), step_count


def build_cell_transition_dataset(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    dataset_name: str = "smh_cell_transition_v1",
    include_memory_features: bool = False,
    memory_decay: float = 0.85,
) -> DatasetRef:
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "index.parquet"
    if summary_path.exists() and index_path.exists():
        payload = json.loads(summary_path.read_text(encoding="utf-8"))
        if (
            bool(payload.get("include_memory_features", False)) == include_memory_features
            and abs(float(payload.get("memory_decay", memory_decay)) - memory_decay) < 1e-12
        ):
            return DatasetRef(
                dataset_name=str(payload["dataset_name"]),
                dataset_kind=str(payload["dataset_kind"]),
                dataset_dir=dataset_dir,
                summary_path=summary_path,
                index_path=index_path,
                row_count=int(payload["row_count"]),
                round_count=int(payload["round_count"]),
            )

    selected_round_ids = round_ids or sorted(
        path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json")
    )
    dataset_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = dataset_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    index_rows: list[dict[str, object]] = []
    total_row_count = 0
    replay_seed_count = 0
    replay_run_count = 0
    max_steps = 0
    for round_id in selected_round_ids:
        episode = build_round_episode(paths, round_id)
        round_number = int(episode.metadata.round_number or -1)
        for seed in episode.seeds:
            if not seed.replay_runs:
                continue
            replay_seed_count += 1
            replay_run_count += len(seed.replay_runs)
            table, step_count = _build_seed_transition_frame(
                round_id,
                round_number,
                seed,
                include_memory_features=include_memory_features,
                memory_decay=memory_decay,
            )
            max_steps = max(max_steps, int(step_count))
            part_path = parts_dir / f"round_id={round_id}__seed_index={seed.seed_index}.parquet"
            table.write_parquet(part_path)
            total_row_count += table.height
            index_rows.append(
                {
                    "round_id": round_id,
                    "round_number": round_number,
                    "seed_index": seed.seed_index,
                    "replay_run_count": len(seed.replay_runs),
                    "max_steps": int(step_count),
                    "row_count": int(table.height),
                    "part_path": str(part_path.relative_to(dataset_dir)),
                },
            )

    index_table = pl.DataFrame(index_rows)
    index_table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "cell_transition",
        "row_count": int(total_row_count),
        "round_count": len(selected_round_ids),
        "replay_seed_count": replay_seed_count,
        "replay_run_count": replay_run_count,
        "part_count": len(index_rows),
        "max_steps": max_steps,
        "feature_names": seed_feature_names(),
        "memory_feature_names": _memory_feature_names(include_memory_features=include_memory_features),
        "include_memory_features": include_memory_features,
        "memory_decay": memory_decay,
        "index_path": str(index_path),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    CatalogDB(paths.catalog_path).try_log_event(
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
        dataset_kind="cell_transition",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=int(total_row_count),
        round_count=len(selected_round_ids),
    )


__all__ = ["build_cell_transition_dataset"]
