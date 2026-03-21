from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.core.world_state import InitialWorldState, SettlementFullState, WorldFrame
from astar.features.reachability import multi_source_distance
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients import seed_feature_dict, seed_feature_names


def _local_mean(values: np.ndarray) -> np.ndarray:
    height, width = values.shape
    result = np.zeros((height, width), dtype=np.float64)
    for y in range(height):
        y0 = max(0, y - 1)
        y1 = min(height, y + 2)
        for x in range(width):
            x0 = max(0, x - 1)
            x1 = min(width, x + 2)
            result[y, x] = float(np.mean(values[y0:y1, x0:x1]))
    return result


def local_class_ratio_stack(class_grid: np.ndarray) -> tuple[list[str], np.ndarray]:
    names = [f"local_ratio_{CLASS_NAMES[class_index]}" for class_index in range(CLASS_COUNT)]
    stack = np.stack(
        [
            _local_mean((class_grid == class_index).astype(np.float64))
            for class_index in range(CLASS_COUNT)
        ],
        axis=0,
    ).astype(np.float64)
    return names, stack


def dynamic_graph_feature_names() -> list[str]:
    return [
        "graph_influence_settlement",
        "graph_influence_port",
        "graph_influence_occupied",
        "graph_influence_ruin",
    ]


def phase_feature_names() -> list[str]:
    return [
        "phase_basis_b0",
        "phase_basis_b1",
        "phase_basis_b2",
        "phase_basis_b3",
    ]


def global_class_ratio_feature_names() -> list[str]:
    return [f"global_ratio_{CLASS_NAMES[class_index]}" for class_index in range(CLASS_COUNT)]


def _inverse_distance_influence(
    class_grid: np.ndarray,
    *,
    target_classes: set[int],
) -> np.ndarray:
    source_coords = np.argwhere(np.isin(class_grid, tuple(sorted(target_classes))))
    if source_coords.size == 0:
        return np.zeros(class_grid.shape, dtype=np.float64)
    distances = multi_source_distance(
        np.ones(class_grid.shape, dtype=bool),
        [(int(y), int(x)) for y, x in source_coords],
    )
    influence = np.zeros(class_grid.shape, dtype=np.float64)
    finite = distances >= 0
    influence[finite] = 1.0 / (1.0 + distances[finite].astype(np.float64))
    return influence


def dynamic_graph_feature_stack(class_grid: np.ndarray) -> tuple[list[str], np.ndarray]:
    names = dynamic_graph_feature_names()
    stack = np.stack(
        [
            _inverse_distance_influence(class_grid, target_classes={1}),
            _inverse_distance_influence(class_grid, target_classes={2}),
            _inverse_distance_influence(class_grid, target_classes={1, 2}),
            _inverse_distance_influence(class_grid, target_classes={3}),
        ],
        axis=0,
    ).astype(np.float64)
    return names, stack


def phase_feature_stack(
    *,
    step: int,
    horizon: int,
    shape: tuple[int, int],
) -> tuple[list[str], np.ndarray]:
    names = phase_feature_names()
    if horizon <= 1:
        t_value = 0.0
    else:
        t_value = float(step) / float(max(horizon - 1, 1))
    one_minus_t = 1.0 - t_value
    basis = np.asarray(
        [
            one_minus_t**3,
            3.0 * t_value * (one_minus_t**2),
            3.0 * (t_value**2) * one_minus_t,
            t_value**3,
        ],
        dtype=np.float64,
    )
    stack = np.repeat(basis[:, None, None], shape[0], axis=1)
    stack = np.repeat(stack, shape[1], axis=2)
    return names, stack


def global_class_ratio_feature_stack(class_grid: np.ndarray) -> tuple[list[str], np.ndarray]:
    names = global_class_ratio_feature_names()
    ratios = np.asarray(
        [
            float(np.mean(class_grid == class_index))
            for class_index in range(CLASS_COUNT)
        ],
        dtype=np.float64,
    )
    stack = np.repeat(ratios[:, None, None], class_grid.shape[0], axis=1)
    stack = np.repeat(stack, class_grid.shape[1], axis=2)
    return names, stack


def transition_feature_names(
    *,
    include_graph_features: bool = False,
    include_phase_features: bool = False,
    include_global_features: bool = False,
) -> list[str]:
    names = (
        seed_feature_names()
        + [f"current_class_{CLASS_NAMES[class_index]}" for class_index in range(CLASS_COUNT)]
        + [f"local_ratio_{CLASS_NAMES[class_index]}" for class_index in range(CLASS_COUNT)]
    )
    if include_graph_features:
        names += dynamic_graph_feature_names()
    if include_phase_features:
        names += phase_feature_names()
    if include_global_features:
        names += global_class_ratio_feature_names()
    return names


def build_transition_feature_stack(
    initial_state: InitialWorldState,
    current_class_grid: np.ndarray,
    *,
    include_graph_features: bool = False,
    include_phase_features: bool = False,
    include_global_features: bool = False,
    step: int | None = None,
    horizon: int | None = None,
) -> tuple[list[str], np.ndarray]:
    static_features = seed_feature_dict(initial_state)
    static_names = seed_feature_names()
    static_stack = np.stack([static_features[name] for name in static_names], axis=0).astype(np.float64)
    current_class_stack = np.stack(
        [
            (current_class_grid == class_index).astype(np.float64)
            for class_index in range(CLASS_COUNT)
        ],
        axis=0,
    ).astype(np.float64)
    local_ratio_names, local_ratio_stack = local_class_ratio_stack(current_class_grid)
    stacks = [static_stack, current_class_stack, local_ratio_stack]
    names = static_names + [f"current_class_{CLASS_NAMES[class_index]}" for class_index in range(CLASS_COUNT)] + local_ratio_names
    if include_graph_features:
        graph_names, graph_stack = dynamic_graph_feature_stack(current_class_grid)
        names += graph_names
        stacks.append(graph_stack)
    if include_phase_features:
        if step is None or horizon is None:
            raise ValueError("phase features require step and horizon")
        phase_names, phase_stack = phase_feature_stack(
            step=step,
            horizon=horizon,
            shape=current_class_grid.shape,
        )
        names += phase_names
        stacks.append(phase_stack)
    if include_global_features:
        global_names, global_stack = global_class_ratio_feature_stack(current_class_grid)
        names += global_names
        stacks.append(global_stack)
    return names, np.concatenate(stacks, axis=0)


def describe_cell_transition(current_class: int, next_class: int) -> str:
    if current_class == next_class:
        return "stay"
    if current_class in {0, 4} and next_class in {1, 2}:
        return "birth"
    if current_class == 1 and next_class == 2:
        return "settlement_to_port"
    if current_class in {1, 2} and next_class == 3:
        return "collapse_to_ruin"
    if current_class == 3 and next_class in {1, 2}:
        return "ruin_to_rebuild"
    if current_class == 3 and next_class == 4:
        return "ruin_to_forest"
    if current_class == 3 and next_class == 0:
        return "ruin_to_open"
    return f"{CLASS_NAMES[current_class]}_to_{CLASS_NAMES[next_class]}"


def _settlement_by_coord(settlements: Sequence[SettlementFullState]) -> dict[tuple[int, int], SettlementFullState]:
    return {(item.x, item.y): item for item in settlements}


def extract_cell_transition_rows(episode: RoundEpisode) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    round_number = int(episode.metadata.round_number or -1)
    for seed in episode.seeds:
        for run in seed.replay_runs:
            for step in range(len(run.frames) - 1):
                current_frame = run.frames[step]
                next_frame = run.frames[step + 1]
                current_grid = collapse_internal_grid(np.asarray(current_frame.grid, dtype=np.int64))
                next_grid = collapse_internal_grid(np.asarray(next_frame.grid, dtype=np.int64))
                height, width = current_grid.shape
                for y in range(height):
                    for x in range(width):
                        current_class = int(current_grid[y, x])
                        next_class = int(next_grid[y, x])
                        rows.append(
                            {
                                "round_id": episode.metadata.round_id,
                                "round_number": round_number,
                                "seed_index": seed.seed_index,
                                "replay_run_id": run.replay_run_id,
                                "step": step,
                                "x": x,
                                "y": y,
                                "current_class": current_class,
                                "next_class": next_class,
                                "transition_name": describe_cell_transition(current_class, next_class),
                                "is_birth": int(current_class in {0, 4} and next_class in {1, 2}),
                                "is_port_gain": int(current_class == 1 and next_class == 2),
                                "is_collapse_to_ruin": int(current_class in {1, 2} and next_class == 3),
                                "is_ruin_rebuild": int(current_class == 3 and next_class in {1, 2}),
                                "is_ruin_to_forest": int(current_class == 3 and next_class == 4),
                                "is_ruin_to_open": int(current_class == 3 and next_class == 0),
                            },
                        )
    return rows


def extract_settlement_event_rows(episode: RoundEpisode) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    round_number = int(episode.metadata.round_number or -1)
    for seed in episode.seeds:
        for run in seed.replay_runs:
            for step in range(len(run.frames) - 1):
                current_frame = run.frames[step]
                next_frame = run.frames[step + 1]
                current_grid = collapse_internal_grid(np.asarray(current_frame.grid, dtype=np.int64))
                next_grid = collapse_internal_grid(np.asarray(next_frame.grid, dtype=np.int64))
                current_by_coord = _settlement_by_coord(current_frame.settlements)
                next_by_coord = _settlement_by_coord(next_frame.settlements)
                all_coords = sorted(set(current_by_coord) | set(next_by_coord))
                for x, y in all_coords:
                    current = current_by_coord.get((x, y))
                    nxt = next_by_coord.get((x, y))
                    current_alive = bool(current.alive) if current is not None else False
                    next_alive = bool(nxt.alive) if nxt is not None else False
                    rows.append(
                        {
                            "round_id": episode.metadata.round_id,
                            "round_number": round_number,
                            "seed_index": seed.seed_index,
                            "replay_run_id": run.replay_run_id,
                            "step": step,
                            "x": x,
                            "y": y,
                            "current_class": int(current_grid[y, x]),
                            "next_class": int(next_grid[y, x]),
                            "current_alive": int(current_alive),
                            "next_alive": int(next_alive),
                            "is_birth": int((current is None) and (nxt is not None)),
                            "is_death": int((current is not None) and (nxt is None or not next_alive)),
                            "is_port_gain": int(
                                current is not None
                                and nxt is not None
                                and (not bool(current.has_port))
                                and bool(nxt.has_port)
                            ),
                            "is_owner_switch": int(
                                current is not None
                                and nxt is not None
                                and current.owner_id is not None
                                and nxt.owner_id is not None
                                and int(current.owner_id) != int(nxt.owner_id)
                            ),
                            "delta_population": (
                                float(nxt.population) - float(current.population)
                                if current is not None
                                and nxt is not None
                                and current.population is not None
                                and nxt.population is not None
                                else None
                            ),
                            "delta_food": (
                                float(nxt.food) - float(current.food)
                                if current is not None
                                and nxt is not None
                                and current.food is not None
                                and nxt.food is not None
                                else None
                            ),
                            "delta_wealth": (
                                float(nxt.wealth) - float(current.wealth)
                                if current is not None
                                and nxt is not None
                                and current.wealth is not None
                                and nxt.wealth is not None
                                else None
                            ),
                            "delta_defense": (
                                float(nxt.defense) - float(current.defense)
                                if current is not None
                                and nxt is not None
                                and current.defense is not None
                                and nxt.defense is not None
                                else None
                            ),
                        },
                    )
    return rows


def extract_graph_snapshot_rows(episode: RoundEpisode) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    round_number = int(episode.metadata.round_number or -1)
    for seed in episode.seeds:
        for run in seed.replay_runs:
            for frame in run.frames:
                alive = [item for item in frame.settlements if item.alive]
                for left_index in range(len(alive)):
                    for right_index in range(left_index + 1, len(alive)):
                        left = alive[left_index]
                        right = alive[right_index]
                        dx = int(right.x - left.x)
                        dy = int(right.y - left.y)
                        rows.append(
                            {
                                "round_id": episode.metadata.round_id,
                                "round_number": round_number,
                                "seed_index": seed.seed_index,
                                "replay_run_id": run.replay_run_id,
                                "step": frame.t,
                                "src_x": left.x,
                                "src_y": left.y,
                                "dst_x": right.x,
                                "dst_y": right.y,
                                "manhattan_distance": int(abs(dx) + abs(dy)),
                                "euclidean_distance": float(math.hypot(dx, dy)),
                                "same_owner": int(
                                    left.owner_id is not None
                                    and right.owner_id is not None
                                    and int(left.owner_id) == int(right.owner_id)
                                ),
                                "both_ports": int(bool(left.has_port) and bool(right.has_port)),
                            },
                        )
    return rows


__all__ = [
    "build_transition_feature_stack",
    "describe_cell_transition",
    "dynamic_graph_feature_names",
    "dynamic_graph_feature_stack",
    "extract_cell_transition_rows",
    "extract_graph_snapshot_rows",
    "extract_settlement_event_rows",
    "local_class_ratio_stack",
    "transition_feature_names",
]
