"""Comprehensive exploratory data analysis of all replay data.

Run: uv run python scripts/replay_eda.py [--max-runs-per-seed N]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.terrain import (
    CLASS_COUNT,
    CLASS_NAMES,
    INTERNAL_TO_SCORED,
    collapse_internal_grid,
)
from astar.core.trajectory import ReplayRun
from astar.core.world_state import SettlementFullState, WorldFrame
from astar.infra.artifacts.paths import WorkspacePaths

INTERNAL_CODE_NAMES = {
    0: "empty",
    1: "settlement",
    2: "port",
    3: "ruin",
    4: "forest",
    5: "mountain",
    10: "ocean",
    11: "plains",
}

ALL_INTERNAL_CODES = sorted(INTERNAL_CODE_NAMES.keys())


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def discover_rounds(paths: WorkspacePaths) -> list[str]:
    replay_root = paths.raw_dir / "replays"
    if not replay_root.exists():
        return []
    round_ids = []
    for d in sorted(replay_root.iterdir()):
        if d.is_dir():
            seed_dirs = list(d.glob("seed_index=*"))
            json_count = sum(1 for sd in seed_dirs for _ in sd.glob("*.json"))
            if json_count > 5:  # skip test rounds
                round_ids.append(d.name)
    return round_ids


def load_runs_for_seed(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    max_runs: int,
) -> list[ReplayRun]:
    from astar.history.replay.ingest import load_seed_replay_runs

    runs = load_seed_replay_runs(paths, round_id, seed_index)
    if len(runs) > max_runs:
        rng = np.random.default_rng(seed=42 + seed_index)
        indices = rng.choice(len(runs), size=max_runs, replace=False)
        runs = [runs[i] for i in sorted(indices)]
    return runs


def load_all_runs(
    paths: WorkspacePaths,
    round_ids: list[str],
    max_runs_per_seed: int,
) -> dict[str, dict[int, list[ReplayRun]]]:
    """Returns {round_id: {seed_index: [ReplayRun, ...]}}."""
    data: dict[str, dict[int, list[ReplayRun]]] = {}
    for round_id in round_ids:
        data[round_id] = {}
        for seed_index in range(5):
            replay_dir = paths.raw_replay_dir(round_id, seed_index)
            if not replay_dir.exists():
                continue
            runs = load_runs_for_seed(paths, round_id, seed_index, max_runs_per_seed)
            if runs:
                data[round_id][seed_index] = runs
        seed_count = len(data[round_id])
        run_count = sum(len(v) for v in data[round_id].values())
        print(f"  Loaded round {round_id[:8]}.. : {seed_count} seeds, {run_count} runs")
    return data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def all_runs_flat(data: dict[str, dict[int, list[ReplayRun]]]) -> list[ReplayRun]:
    return [run for rd in data.values() for sd in rd.values() for run in sd]


def header(title: str) -> None:
    print(f"\n{'='*72}")
    print(f"  {title}")
    print(f"{'='*72}\n")


def table(headers: list[str], rows: list[list], fmt: str | None = None) -> None:
    widths = [len(h) for h in headers]
    str_rows = []
    for row in rows:
        sr = []
        for i, cell in enumerate(row):
            if isinstance(cell, float):
                s = f"{cell:.4f}" if fmt is None else f"{cell:{fmt}}"
            else:
                s = str(cell)
            sr.append(s)
            widths[i] = max(widths[i], len(s))
        str_rows.append(sr)
    hline = "  ".join(h.rjust(w) for h, w in zip(headers, widths))
    print(hline)
    print("-" * len(hline))
    for sr in str_rows:
        print("  ".join(s.rjust(w) for s, w in zip(sr, widths)))


# ---------------------------------------------------------------------------
# Analysis 1: Terrain Stability
# ---------------------------------------------------------------------------


def analysis_terrain_stability(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("1. TERRAIN STABILITY CENSUS")

    # Track per initial-code: total cells, cells that ever changed
    total_by_code: dict[int, int] = defaultdict(int)
    changed_by_code: dict[int, int] = defaultdict(int)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
            for code in ALL_INTERNAL_CODES:
                mask = initial_grid == code
                count = int(np.count_nonzero(mask))
                total_by_code[code] += count

                # Check if any frame has a different code at these positions
                ever_changed = np.zeros_like(mask)
                for frame in run.frames[1:]:
                    ever_changed |= (frame.grid != initial_grid) & mask
                changed_by_code[code] += int(np.count_nonzero(ever_changed))

    rows = []
    for code in ALL_INTERNAL_CODES:
        total = total_by_code[code]
        changed = changed_by_code[code]
        rate = changed / max(1, total)
        rows.append([
            str(code),
            INTERNAL_CODE_NAMES.get(code, "?"),
            str(total),
            str(changed),
            f"{rate:.6f}",
            f"{rate*100:.4f}%",
        ])
    table(["Code", "Name", "TotalCells", "Changed", "ChangeRate", "Pct"], rows)


# ---------------------------------------------------------------------------
# Analysis 2: Transition Matrix
# ---------------------------------------------------------------------------


def analysis_transition_matrix(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("2. FULL TRANSITION MATRIX")

    max_code = max(ALL_INTERNAL_CODES) + 1
    counts = np.zeros((max_code, max_code), dtype=np.int64)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for i in range(len(run.frames) - 1):
                prev = run.frames[i].grid
                curr = run.frames[i + 1].grid
                # Only count cells that changed
                changed = prev != curr
                if not np.any(changed):
                    continue
                prev_codes = prev[changed]
                curr_codes = curr[changed]
                for p, c in zip(prev_codes.ravel(), curr_codes.ravel()):
                    counts[p, c] += 1

    print("Nonzero transitions (from -> to : count):")
    transitions = []
    for p in ALL_INTERNAL_CODES:
        for c in ALL_INTERNAL_CODES:
            if counts[p, c] > 0:
                transitions.append((counts[p, c], p, c))
    transitions.sort(reverse=True)
    rows = []
    for cnt, p, c in transitions:
        pname = INTERNAL_CODE_NAMES.get(p, str(p))
        cname = INTERNAL_CODE_NAMES.get(c, str(c))
        rows.append([f"{p}({pname})", f"{c}({cname})", str(cnt)])
    table(["From", "To", "Count"], rows)

    # Conditional probabilities for codes that actually change
    print("\nConditional P(next | prev) for cells that changed:")
    for p in ALL_INTERNAL_CODES:
        row_sum = sum(counts[p, c] for c in ALL_INTERNAL_CODES)
        if row_sum == 0:
            continue
        pname = INTERNAL_CODE_NAMES.get(p, str(p))
        targets = []
        for c in ALL_INTERNAL_CODES:
            if counts[p, c] > 0:
                prob = counts[p, c] / row_sum
                cname = INTERNAL_CODE_NAMES.get(c, str(c))
                targets.append(f"{cname}={prob:.3f}")
        print(f"  {pname:>10}: {', '.join(targets)}")


# ---------------------------------------------------------------------------
# Analysis 3: Temporal Dynamics
# ---------------------------------------------------------------------------


def analysis_temporal_dynamics(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("3. TEMPORAL DYNAMICS")

    max_steps = 50
    cell_changes = np.zeros(max_steps, dtype=np.int64)
    births = np.zeros(max_steps, dtype=np.int64)
    collapses = np.zeros(max_steps, dtype=np.int64)
    port_gains = np.zeros(max_steps, dtype=np.int64)
    owner_flips = np.zeros(max_steps, dtype=np.int64)
    pop_deltas = [[] for _ in range(max_steps)]
    food_deltas = [[] for _ in range(max_steps)]
    run_count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            run_count += 1
            for step in range(min(len(run.frames) - 1, max_steps)):
                prev_frame = run.frames[step]
                curr_frame = run.frames[step + 1]

                cell_changes[step] += int(np.count_nonzero(prev_frame.grid != curr_frame.grid))

                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                positions = set(prev_idx) | set(curr_idx)

                for pos in positions:
                    prev_s = prev_idx.get(pos)
                    curr_s = curr_idx.get(pos)
                    pa = prev_s is not None and prev_s.alive
                    ca = curr_s is not None and curr_s.alive

                    if not pa and ca and int(prev_frame.grid[pos[1], pos[0]]) != 3:
                        births[step] += 1
                    if pa and not ca:
                        collapses[step] += 1
                    if pa and ca:
                        if not prev_s.has_port and curr_s.has_port:
                            port_gains[step] += 1
                        if (prev_s.owner_id is not None and curr_s.owner_id is not None
                                and prev_s.owner_id != curr_s.owner_id):
                            owner_flips[step] += 1
                        if prev_s.population is not None and curr_s.population is not None:
                            pop_deltas[step].append(curr_s.population - prev_s.population)
                        if prev_s.food is not None and curr_s.food is not None:
                            food_deltas[step].append(curr_s.food - prev_s.food)

    print(f"Total runs analyzed: {run_count}\n")
    rows = []
    for step in range(max_steps):
        mean_pop = np.mean(pop_deltas[step]) if pop_deltas[step] else 0.0
        mean_food = np.mean(food_deltas[step]) if food_deltas[step] else 0.0
        rows.append([
            str(step),
            f"{cell_changes[step] / max(1, run_count):.1f}",
            f"{births[step] / max(1, run_count):.2f}",
            f"{collapses[step] / max(1, run_count):.2f}",
            f"{port_gains[step] / max(1, run_count):.2f}",
            f"{owner_flips[step] / max(1, run_count):.2f}",
            f"{mean_pop:.3f}",
            f"{mean_food:.3f}",
        ])
    table(
        ["Step", "CellChg/run", "Births/r", "Collapse/r", "PortGain/r", "OwnerFlip/r", "MeanPopD", "MeanFoodD"],
        rows,
    )


# ---------------------------------------------------------------------------
# Analysis 4: Settlement Lifecycle
# ---------------------------------------------------------------------------


def analysis_settlement_lifecycle(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("4. SETTLEMENT LIFECYCLE STATISTICS")

    lifespans: list[int] = []
    collapse_pop: list[float] = []
    collapse_food: list[float] = []
    collapse_defense: list[float] = []
    alive_counts_by_step: list[list[int]] = []
    port_at_step: list[list[int]] = []
    birth_distances: list[float] = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_positions = {
                (s.x, s.y) for s in run.frames[0].settlements if s.alive
            }

            # Track alive counts
            alive_curve = []
            port_curve = []
            for frame in run.frames:
                alive_curve.append(sum(1 for s in frame.settlements if s.alive))
                port_curve.append(sum(1 for s in frame.settlements if s.has_port))
            alive_counts_by_step.append(alive_curve)
            port_at_step.append(port_curve)

            # Track individual settlement lifespans
            # For each position, track when it was first alive and when it collapsed
            position_alive: dict[tuple[int, int], list[bool]] = defaultdict(lambda: [False] * len(run.frames))
            for fi, frame in enumerate(run.frames):
                for s in frame.settlements:
                    position_alive[(s.x, s.y)][fi] = s.alive

            for pos, alive_seq in position_alive.items():
                # Find contiguous alive spans
                in_span = False
                span_start = 0
                for i, a in enumerate(alive_seq):
                    if a and not in_span:
                        in_span = True
                        span_start = i
                    elif not a and in_span:
                        in_span = False
                        lifespan = i - span_start
                        lifespans.append(lifespan)

                        # Get stats at collapse
                        frame = run.frames[i - 1]
                        for s in frame.settlements:
                            if (s.x, s.y) == pos and s.alive:
                                if s.population is not None:
                                    collapse_pop.append(s.population)
                                if s.food is not None:
                                    collapse_food.append(s.food)
                                if s.defense is not None:
                                    collapse_defense.append(s.defense)
                if in_span:
                    lifespans.append(len(alive_seq) - span_start)

            # Birth distances from initial settlements
            for fi in range(1, len(run.frames)):
                for s in run.frames[fi].settlements:
                    if s.alive:
                        pos = (s.x, s.y)
                        prev_frame = run.frames[fi - 1]
                        was_alive_before = any(
                            ps.x == s.x and ps.y == s.y and ps.alive
                            for ps in prev_frame.settlements
                        )
                        if not was_alive_before:
                            # This is a birth
                            min_dist = min(
                                (abs(s.x - ix) + abs(s.y - iy))
                                for ix, iy in initial_positions
                            ) if initial_positions else 0
                            birth_distances.append(min_dist)

    # Report
    if lifespans:
        ls = np.array(lifespans)
        print(f"Settlement lifespan distribution (in years):")
        print(f"  Count:  {len(ls)}")
        print(f"  Mean:   {np.mean(ls):.1f}")
        print(f"  Median: {np.median(ls):.1f}")
        print(f"  Std:    {np.std(ls):.1f}")
        print(f"  Min:    {np.min(ls)}")
        print(f"  Max:    {np.max(ls)}")
        # Histogram
        bins = [1, 5, 10, 20, 30, 40, 50, 51]
        hist, _ = np.histogram(ls, bins=bins)
        print(f"  Histogram:")
        for i in range(len(hist)):
            print(f"    [{bins[i]:2d}-{bins[i+1]:2d}): {hist[i]:6d}  {'#' * min(60, hist[i] // max(1, max(hist) // 60))}")

    if collapse_pop:
        print(f"\nSettlement stats at time of collapse:")
        print(f"  Population: mean={np.mean(collapse_pop):.2f}, median={np.median(collapse_pop):.2f}")
        print(f"  Food:       mean={np.mean(collapse_food):.2f}, median={np.median(collapse_food):.2f}")
        print(f"  Defense:    mean={np.mean(collapse_defense):.2f}, median={np.median(collapse_defense):.2f}")

    if alive_counts_by_step:
        alive_arr = np.array(alive_counts_by_step, dtype=np.float64)
        print(f"\nAlive settlement count over time (mean across {len(alive_arr)} runs):")
        for step in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]:
            if step < alive_arr.shape[1]:
                print(f"  Year {step:2d}: mean={np.mean(alive_arr[:, step]):.1f}, "
                      f"std={np.std(alive_arr[:, step]):.1f}, "
                      f"min={np.min(alive_arr[:, step]):.0f}, max={np.max(alive_arr[:, step]):.0f}")

    if port_at_step:
        port_arr = np.array(port_at_step, dtype=np.float64)
        print(f"\nPort count over time:")
        for step in [0, 10, 20, 30, 40, 50]:
            if step < port_arr.shape[1]:
                print(f"  Year {step:2d}: mean={np.mean(port_arr[:, step]):.1f}, std={np.std(port_arr[:, step]):.1f}")

    if birth_distances:
        bd = np.array(birth_distances)
        print(f"\nNew settlement birth distance from nearest initial settlement:")
        print(f"  Mean: {np.mean(bd):.2f}, Median: {np.median(bd):.1f}, Max: {np.max(bd)}")


# ---------------------------------------------------------------------------
# Analysis 5: Spatial Change Patterns
# ---------------------------------------------------------------------------


def analysis_spatial_patterns(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("5. SPATIAL CHANGE PATTERNS")

    # Aggregate stats by initial terrain neighborhood properties
    coastal_changes = 0
    coastal_total = 0
    inland_changes = 0
    inland_total = 0
    near_mountain_changes = 0
    near_mountain_total = 0
    far_mountain_changes = 0
    far_mountain_total = 0
    near_settlement_changes = 0
    near_settlement_total = 0
    far_settlement_changes = 0
    far_settlement_total = 0

    change_count_sum = None
    cell_count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial = run.frames[0].grid
            terminal = run.frames[-1].grid
            h, w = initial.shape

            changed = initial != terminal
            if change_count_sum is None:
                change_count_sum = np.zeros((h, w), dtype=np.float64)

            # Count total changes across all steps
            step_changes = np.zeros((h, w), dtype=np.int64)
            for fi in range(len(run.frames) - 1):
                step_changes += (run.frames[fi].grid != run.frames[fi + 1].grid).astype(np.int64)
            change_count_sum += step_changes
            cell_count += 1

            # Coastal analysis
            ocean = initial == 10
            # A cell is coastal if it's land and adjacent to ocean
            land = np.isin(initial, [0, 1, 2, 3, 4, 5, 11])
            coastal = np.zeros_like(land)
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                shifted = np.roll(np.roll(ocean, dy, axis=0), dx, axis=1)
                coastal |= (land & shifted)
            coastal_land = coastal & land
            inland_land = land & ~coastal

            coastal_changes += int(np.count_nonzero(changed & coastal_land))
            coastal_total += int(np.count_nonzero(coastal_land))
            inland_changes += int(np.count_nonzero(changed & inland_land))
            inland_total += int(np.count_nonzero(inland_land))

            # Near mountain analysis
            mountain = initial == 5
            near_mountain = np.zeros_like(mountain)
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    near_mountain |= np.roll(np.roll(mountain, dy, axis=0), dx, axis=1)
            near_mountain_land = near_mountain & land & ~mountain
            far_mountain_land = ~near_mountain & land

            near_mountain_changes += int(np.count_nonzero(changed & near_mountain_land))
            near_mountain_total += int(np.count_nonzero(near_mountain_land))
            far_mountain_changes += int(np.count_nonzero(changed & far_mountain_land))
            far_mountain_total += int(np.count_nonzero(far_mountain_land))

            # Near initial settlement
            settlement_pos = initial == 1
            near_settlement = np.zeros_like(settlement_pos)
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    near_settlement |= np.roll(np.roll(settlement_pos, dy, axis=0), dx, axis=1)
            near_settlement_land = near_settlement & land & ~settlement_pos
            far_settlement_land = ~near_settlement & land & ~settlement_pos

            near_settlement_changes += int(np.count_nonzero(changed & near_settlement_land))
            near_settlement_total += int(np.count_nonzero(near_settlement_land))
            far_settlement_changes += int(np.count_nonzero(changed & far_settlement_land))
            far_settlement_total += int(np.count_nonzero(far_settlement_land))

    print("Change rate by spatial context (initial->terminal):")
    rows = [
        ["Coastal land", str(coastal_total), str(coastal_changes), f"{coastal_changes/max(1,coastal_total):.4f}"],
        ["Inland land", str(inland_total), str(inland_changes), f"{inland_changes/max(1,inland_total):.4f}"],
        ["Near mountain (<3)", str(near_mountain_total), str(near_mountain_changes), f"{near_mountain_changes/max(1,near_mountain_total):.4f}"],
        ["Far from mountain", str(far_mountain_total), str(far_mountain_changes), f"{far_mountain_changes/max(1,far_mountain_total):.4f}"],
        ["Near init settlement (<4)", str(near_settlement_total), str(near_settlement_changes), f"{near_settlement_changes/max(1,near_settlement_total):.4f}"],
        ["Far from init settlement", str(far_settlement_total), str(far_settlement_changes), f"{far_settlement_changes/max(1,far_settlement_total):.4f}"],
    ]
    table(["Context", "TotalCells", "ChangedCells", "ChangeRate"], rows)

    if change_count_sum is not None and cell_count > 0:
        mean_changes = change_count_sum / cell_count
        print(f"\nPer-cell mean change count across 50 steps:")
        print(f"  Overall mean: {np.mean(mean_changes):.4f}")
        print(f"  Max cell:     {np.max(mean_changes):.2f}")
        nonzero = mean_changes[mean_changes > 0]
        if len(nonzero) > 0:
            print(f"  Mean (nonzero cells): {np.mean(nonzero):.4f}")
            print(f"  Cells that ever change: {len(nonzero)} / {mean_changes.size} ({len(nonzero)/mean_changes.size*100:.1f}%)")


# ---------------------------------------------------------------------------
# Analysis 6: Stochastic Variance
# ---------------------------------------------------------------------------


def analysis_stochastic_variance(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("6. STOCHASTIC VARIANCE (same seed, different sim_seed)")

    seed_entropies: list[float] = []
    seed_alive_stds: list[float] = []
    deterministic_fracs: list[float] = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue

            h, w = runs[0].frames[0].grid.shape
            # Collect terminal grids (scored class)
            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)  # (N, H, W)

            # Per-cell entropy
            N = len(runs)
            entropies = np.zeros((h, w))
            for y in range(h):
                for x in range(w):
                    values = terminal_grids[:, y, x]
                    counts = np.bincount(values, minlength=CLASS_COUNT).astype(np.float64)
                    probs = counts / N
                    probs = probs[probs > 0]
                    entropies[y, x] = -np.sum(probs * np.log2(probs))

            mean_entropy = float(np.mean(entropies))
            seed_entropies.append(mean_entropy)

            deterministic = np.sum(entropies == 0.0)
            deterministic_fracs.append(float(deterministic) / (h * w))

            # Alive count variance
            alive_counts = [
                sum(1 for s in run.frames[-1].settlements if s.alive)
                for run in runs
            ]
            seed_alive_stds.append(float(np.std(alive_counts)))

    if seed_entropies:
        print(f"Across {len(seed_entropies)} seed groups (>= 3 runs each):")
        print(f"\nTerminal grid entropy (bits per cell):")
        print(f"  Mean:   {np.mean(seed_entropies):.4f}")
        print(f"  Std:    {np.std(seed_entropies):.4f}")
        print(f"  Min:    {np.min(seed_entropies):.4f}")
        print(f"  Max:    {np.max(seed_entropies):.4f}")
        print(f"\nFraction of deterministic cells (entropy=0):")
        print(f"  Mean:   {np.mean(deterministic_fracs):.4f}")
        print(f"  Min:    {np.min(deterministic_fracs):.4f}")
        print(f"  Max:    {np.max(deterministic_fracs):.4f}")
        print(f"\nAlive settlement count at year 50 (std across sim seeds):")
        print(f"  Mean std: {np.mean(seed_alive_stds):.2f}")
        print(f"  Max std:  {np.max(seed_alive_stds):.2f}")


# ---------------------------------------------------------------------------
# Analysis 7: Cross-Round Comparison
# ---------------------------------------------------------------------------


def analysis_cross_round(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("7. CROSS-ROUND COMPARISON")

    rows = []
    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        all_runs = [run for sd in seeds.values() for run in sd]
        if not all_runs:
            continue

        total_cell_changes = 0
        total_steps = 0
        terminal_settlements = []
        terminal_ports = []
        terminal_ruins = []
        terminal_forests = []
        alive_at_50 = []

        for run in all_runs:
            for fi in range(len(run.frames) - 1):
                total_cell_changes += int(np.count_nonzero(
                    run.frames[fi].grid != run.frames[fi + 1].grid
                ))
                total_steps += 1
            tg = run.frames[-1].grid
            terminal_settlements.append(int(np.count_nonzero(tg == 1)))
            terminal_ports.append(int(np.count_nonzero(tg == 2)))
            terminal_ruins.append(int(np.count_nonzero(tg == 3)))
            terminal_forests.append(int(np.count_nonzero(tg == 4)))
            alive_at_50.append(sum(1 for s in run.frames[-1].settlements if s.alive))

        chg_per_step = total_cell_changes / max(1, total_steps)
        rows.append([
            round_id[:8] + "..",
            str(len(all_runs)),
            f"{chg_per_step:.1f}",
            f"{np.mean(alive_at_50):.1f}",
            f"{np.mean(terminal_settlements):.1f}",
            f"{np.mean(terminal_ports):.1f}",
            f"{np.mean(terminal_ruins):.1f}",
            f"{np.mean(terminal_forests):.1f}",
        ])

    table(
        ["Round", "Runs", "ChgPerStep", "Alive@50", "Settl@50", "Ports@50", "Ruins@50", "Forest@50"],
        rows,
    )


# ---------------------------------------------------------------------------
# Analysis 8: Settlement Economics
# ---------------------------------------------------------------------------


def analysis_settlement_economics(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("8. SETTLEMENT ECONOMIC ANALYSIS")

    # Collect stats at various time points
    time_points = [0, 10, 25, 50]
    stats_by_time: dict[int, dict[str, list[float]]] = {
        t: {"pop": [], "food": [], "wealth": [], "defense": []}
        for t in time_points
    }
    # Stats at collapse vs surviving
    survivors_pop = []
    survivors_food = []
    collapse_pop = []
    collapse_food = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for t in time_points:
                if t < len(run.frames):
                    for s in run.frames[t].settlements:
                        if s.alive:
                            if s.population is not None:
                                stats_by_time[t]["pop"].append(s.population)
                            if s.food is not None:
                                stats_by_time[t]["food"].append(s.food)
                            if s.wealth is not None:
                                stats_by_time[t]["wealth"].append(s.wealth)
                            if s.defense is not None:
                                stats_by_time[t]["defense"].append(s.defense)

            # Compare survivors vs collapsed at year 49
            if len(run.frames) > 49:
                prev_idx = {(s.x, s.y): s for s in run.frames[49].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[50].settlements}
                for pos, s in prev_idx.items():
                    if s.alive and s.population is not None and s.food is not None:
                        c = curr_idx.get(pos)
                        if c is not None and c.alive:
                            survivors_pop.append(s.population)
                            survivors_food.append(s.food)
                        elif c is None or not c.alive:
                            collapse_pop.append(s.population)
                            collapse_food.append(s.food)

    for t in time_points:
        d = stats_by_time[t]
        print(f"\nYear {t} alive settlement stats:")
        for stat_name in ["pop", "food", "wealth", "defense"]:
            vals = d[stat_name]
            if vals:
                arr = np.array(vals)
                print(f"  {stat_name:>7}: mean={np.mean(arr):8.2f}  std={np.std(arr):8.2f}  "
                      f"median={np.median(arr):8.2f}  min={np.min(arr):8.2f}  max={np.max(arr):8.2f}")

    if survivors_pop and collapse_pop:
        print(f"\nYear 49 stats: survivors vs next-step-collapsed:")
        print(f"  Survivors   (n={len(survivors_pop):5d}): pop={np.mean(survivors_pop):.2f}, food={np.mean(survivors_food):.2f}")
        print(f"  Collapsed   (n={len(collapse_pop):5d}): pop={np.mean(collapse_pop):.2f}, food={np.mean(collapse_food):.2f}")

    # Wealth inequality (Gini coefficient at year 50)
    gini_values = []
    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            wealths = [s.wealth for s in run.frames[-1].settlements if s.alive and s.wealth is not None]
            if len(wealths) > 2:
                arr = np.sort(np.array(wealths))
                n = len(arr)
                index = np.arange(1, n + 1)
                gini = (2 * np.sum(index * arr) - (n + 1) * np.sum(arr)) / (n * np.sum(arr)) if np.sum(arr) > 0 else 0
                gini_values.append(gini)
    if gini_values:
        print(f"\nWealth Gini coefficient at year 50:")
        print(f"  Mean: {np.mean(gini_values):.4f}, Std: {np.std(gini_values):.4f}")


# ---------------------------------------------------------------------------
# Analysis 9: Faction/Owner Analysis
# ---------------------------------------------------------------------------


def analysis_faction_dynamics(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("9. FACTION / OWNER ANALYSIS")

    faction_counts_at_start: list[int] = []
    faction_counts_at_end: list[int] = []
    max_faction_share_end: list[float] = []
    owner_flips_per_run: list[int] = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            # Count distinct factions at start and end
            start_owners = {s.owner_id for s in run.frames[0].settlements if s.alive and s.owner_id is not None}
            end_owners = {s.owner_id for s in run.frames[-1].settlements if s.alive and s.owner_id is not None}
            faction_counts_at_start.append(len(start_owners))
            faction_counts_at_end.append(len(end_owners))

            # Max faction share at end
            if end_owners:
                owner_counts: dict[int, int] = defaultdict(int)
                total = 0
                for s in run.frames[-1].settlements:
                    if s.alive and s.owner_id is not None:
                        owner_counts[s.owner_id] += 1
                        total += 1
                if total > 0:
                    max_share = max(owner_counts.values()) / total
                    max_faction_share_end.append(max_share)

            # Count owner flips
            flip_count = 0
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if (p.alive and c.alive and p.owner_id is not None
                            and c.owner_id is not None and p.owner_id != c.owner_id):
                        flip_count += 1
            owner_flips_per_run.append(flip_count)

    if faction_counts_at_start:
        print(f"Distinct factions at start: mean={np.mean(faction_counts_at_start):.1f}, "
              f"std={np.std(faction_counts_at_start):.1f}")
        print(f"Distinct factions at end:   mean={np.mean(faction_counts_at_end):.1f}, "
              f"std={np.std(faction_counts_at_end):.1f}")
    if max_faction_share_end:
        print(f"\nLargest faction share at year 50:")
        print(f"  Mean: {np.mean(max_faction_share_end):.3f}")
        print(f"  Std:  {np.std(max_faction_share_end):.3f}")
        print(f"  Max:  {np.max(max_faction_share_end):.3f}")
    if owner_flips_per_run:
        print(f"\nOwner flips per run:")
        print(f"  Mean: {np.mean(owner_flips_per_run):.1f}")
        print(f"  Std:  {np.std(owner_flips_per_run):.1f}")
        print(f"  Max:  {max(owner_flips_per_run)}")


# ---------------------------------------------------------------------------
# Analysis 10: Forest Dynamics
# ---------------------------------------------------------------------------


def analysis_forest_dynamics(data: dict[str, dict[int, list[ReplayRun]]]) -> None:
    header("10. FOREST DYNAMICS DEEP DIVE")

    ruin_to_forest = 0
    ruin_to_settlement = 0  # rebuild
    ruin_to_empty = 0
    ruin_to_other = 0
    forest_disappeared = 0
    forest_stable = 0
    forest_appeared_from: dict[int, int] = defaultdict(int)
    ruin_to_forest_steps: list[int] = []
    forest_counts_by_step: list[list[int]] = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            fc = []
            for frame in run.frames:
                fc.append(int(np.count_nonzero(frame.grid == 4)))
            forest_counts_by_step.append(fc)

            for fi in range(len(run.frames) - 1):
                prev = run.frames[fi].grid
                curr = run.frames[fi + 1].grid

                # Ruin transitions
                ruin_cells = prev == 3
                if np.any(ruin_cells):
                    curr_at_ruin = curr[ruin_cells]
                    ruin_to_forest += int(np.count_nonzero(curr_at_ruin == 4))
                    ruin_to_settlement += int(np.count_nonzero((curr_at_ruin == 1) | (curr_at_ruin == 2)))
                    ruin_to_empty += int(np.count_nonzero(np.isin(curr_at_ruin, [0, 11])))
                    ruin_to_other += int(np.count_nonzero(curr_at_ruin == 3))  # stayed ruin (not counted)
                    # Track step of ruin->forest
                    ruin_became_forest = ruin_cells & (curr == 4)
                    if np.any(ruin_became_forest):
                        ruin_to_forest_steps.extend([fi] * int(np.count_nonzero(ruin_became_forest)))

                # Forest disappearance
                forest_cells = prev == 4
                if np.any(forest_cells):
                    curr_at_forest = curr[forest_cells]
                    forest_stable += int(np.count_nonzero(curr_at_forest == 4))
                    forest_disappeared += int(np.count_nonzero(curr_at_forest != 4))

                # Forest appearance
                new_forest = (prev != 4) & (curr == 4)
                if np.any(new_forest):
                    prev_codes = prev[new_forest]
                    for code in prev_codes.ravel():
                        forest_appeared_from[int(code)] += 1

    print("Ruin transition outcomes:")
    ruin_total = ruin_to_forest + ruin_to_settlement + ruin_to_empty
    if ruin_total > 0:
        print(f"  Ruin -> Forest:     {ruin_to_forest:7d} ({ruin_to_forest/ruin_total*100:.1f}%)")
        print(f"  Ruin -> Settlement: {ruin_to_settlement:7d} ({ruin_to_settlement/ruin_total*100:.1f}%)")
        print(f"  Ruin -> Empty:      {ruin_to_empty:7d} ({ruin_to_empty/ruin_total*100:.1f}%)")
    else:
        print("  No ruin transitions observed")

    print(f"\nForest stability per step:")
    forest_total = forest_stable + forest_disappeared
    if forest_total > 0:
        print(f"  Stable:      {forest_stable:7d} ({forest_stable/forest_total*100:.2f}%)")
        print(f"  Disappeared: {forest_disappeared:7d} ({forest_disappeared/forest_total*100:.2f}%)")

    if forest_appeared_from:
        print(f"\nNew forest appeared from:")
        for code in sorted(forest_appeared_from.keys()):
            name = INTERNAL_CODE_NAMES.get(code, str(code))
            print(f"  {name:>12}: {forest_appeared_from[code]}")

    if ruin_to_forest_steps:
        arr = np.array(ruin_to_forest_steps)
        print(f"\nRuin -> Forest timing:")
        print(f"  Mean step: {np.mean(arr):.1f}")
        print(f"  Earliest:  step {np.min(arr)}")
        print(f"  Latest:    step {np.max(arr)}")

    if forest_counts_by_step:
        fc_arr = np.array(forest_counts_by_step, dtype=np.float64)
        print(f"\nForest cell count over time (mean across {len(fc_arr)} runs):")
        for step in [0, 10, 20, 30, 40, 50]:
            if step < fc_arr.shape[1]:
                print(f"  Year {step:2d}: mean={np.mean(fc_arr[:, step]):.1f}, std={np.std(fc_arr[:, step]):.1f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Comprehensive replay EDA")
    parser.add_argument("--max-runs-per-seed", type=int, default=10,
                        help="Max replay runs to sample per seed (default: 10)")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    paths = WorkspacePaths.from_root(project_root)

    print("Discovering rounds with replay data...")
    round_ids = discover_rounds(paths)
    print(f"Found {len(round_ids)} rounds with replay data\n")

    print(f"Loading up to {args.max_runs_per_seed} runs per seed...")
    t0 = time.time()
    data = load_all_runs(paths, round_ids, args.max_runs_per_seed)
    total_runs = sum(len(r) for rd in data.values() for r in rd.values())
    print(f"\nLoaded {total_runs} runs in {time.time() - t0:.1f}s")

    # Run all analyses
    t0 = time.time()
    analysis_terrain_stability(data)
    print(f"\n  [Analysis 1 took {time.time() - t0:.1f}s]")

    t1 = time.time()
    analysis_transition_matrix(data)
    print(f"\n  [Analysis 2 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_temporal_dynamics(data)
    print(f"\n  [Analysis 3 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_settlement_lifecycle(data)
    print(f"\n  [Analysis 4 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_spatial_patterns(data)
    print(f"\n  [Analysis 5 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_stochastic_variance(data)
    print(f"\n  [Analysis 6 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_cross_round(data)
    print(f"\n  [Analysis 7 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_settlement_economics(data)
    print(f"\n  [Analysis 8 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_faction_dynamics(data)
    print(f"\n  [Analysis 9 took {time.time() - t1:.1f}s]")

    t1 = time.time()
    analysis_forest_dynamics(data)
    print(f"\n  [Analysis 10 took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
