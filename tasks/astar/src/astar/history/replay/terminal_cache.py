from __future__ import annotations

import json
from collections.abc import Iterable

import numpy as np

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, save_named_arrays


def load_seed_terminal_grid_cache(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> tuple[tuple[str, ...], np.ndarray] | None:
    cache_path = paths.replay_terminal_grid_path(round_id, seed_index)
    if not cache_path.exists():
        return None
    payload = load_named_arrays(cache_path)
    return (
        tuple(str(value) for value in payload["replay_run_ids"].tolist()),
        np.asarray(payload["terminal_grids"], dtype=np.int16),
    )


def build_seed_terminal_grid_cache(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> tuple[tuple[str, ...], np.ndarray]:
    replay_paths = sorted(paths.raw_replay_dir(round_id, seed_index).glob("*.json"))
    if not replay_paths:
        raise FileNotFoundError(
            f"no raw replay files for round {round_id} seed {seed_index}"
        )
    run_ids: list[str] = []
    terminal_grids: list[np.ndarray] = []
    for replay_path in replay_paths:
        payload = json.loads(replay_path.read_text(encoding="utf-8"))
        run_ids.append(str(payload["capture_id"]))
        terminal_grid = np.asarray(
            payload["response"]["frames"][-1]["grid"],
            dtype=np.int64,
        )
        terminal_grids.append(collapse_internal_grid(terminal_grid).astype(np.int16))
    stacked = np.stack(terminal_grids, axis=0)
    save_named_arrays(
        paths.replay_terminal_grid_path(round_id, seed_index),
        {
            "replay_run_ids": np.asarray(run_ids, dtype=np.str_),
            "terminal_grids": stacked.astype(np.int16),
        },
    )
    return tuple(run_ids), stacked


def load_or_build_seed_terminal_grid_cache(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> tuple[tuple[str, ...], np.ndarray] | None:
    cached = load_seed_terminal_grid_cache(paths, round_id, seed_index)
    if cached is not None:
        return cached
    replay_dir = paths.raw_replay_dir(round_id, seed_index)
    if not replay_dir.exists():
        return None
    replay_paths = tuple(replay_dir.glob("*.json"))
    if not replay_paths:
        return None
    return build_seed_terminal_grid_cache(paths, round_id, seed_index)


def empirical_terminal_probs_from_terminal_grids(
    replay_run_ids: tuple[str, ...],
    terminal_grids: np.ndarray,
    *,
    selected_run_ids: Iterable[str] | None = None,
) -> np.ndarray | None:
    if terminal_grids.size == 0:
        return None
    selected = terminal_grids
    if selected_run_ids is not None:
        run_id_set = {str(value) for value in selected_run_ids}
        if not run_id_set:
            return None
        keep_mask = np.asarray(
            [run_id in run_id_set for run_id in replay_run_ids],
            dtype=bool,
        )
        if not np.any(keep_mask):
            return None
        selected = terminal_grids[keep_mask]
    counts = np.zeros((*selected.shape[1:], CLASS_COUNT), dtype=np.float64)
    for class_index in range(CLASS_COUNT):
        counts[:, :, class_index] = np.mean(selected == class_index, axis=0)
    return counts
