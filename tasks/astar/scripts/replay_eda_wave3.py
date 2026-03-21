"""Third-wave EDA: map generation, micro-mechanics, cross-seed patterns.

Run: uv run python scripts/replay_eda_wave3.py [--max-runs-per-seed N]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.terrain import (
    CLASS_COUNT,
    CLASS_NAMES,
    INTERNAL_TO_SCORED,
    collapse_internal_grid,
)
from astar.core.trajectory import ReplayRun
from astar.core.world_state import SettlementFullState
from astar.infra.artifacts.paths import WorkspacePaths

INTERNAL_CODE_NAMES = {
    0: "empty", 1: "settlement", 2: "port", 3: "ruin",
    4: "forest", 5: "mountain", 10: "ocean", 11: "plains",
}


def discover_rounds(paths: WorkspacePaths) -> list[str]:
    replay_root = paths.raw_dir / "replays"
    if not replay_root.exists():
        return []
    round_ids = []
    for d in sorted(replay_root.iterdir()):
        if d.is_dir():
            seed_dirs = list(d.glob("seed_index=*"))
            json_count = sum(1 for sd in seed_dirs for _ in sd.glob("*.json"))
            if json_count > 5:
                round_ids.append(d.name)
    return round_ids


def load_runs_for_seed(paths, round_id, seed_index, max_runs):
    from astar.history.replay.ingest import load_seed_replay_runs
    runs = load_seed_replay_runs(paths, round_id, seed_index)
    if len(runs) > max_runs:
        rng = np.random.default_rng(seed=42 + seed_index)
        indices = rng.choice(len(runs), size=max_runs, replace=False)
        runs = [runs[i] for i in sorted(indices)]
    return runs


def load_all_runs(paths, round_ids, max_runs_per_seed):
    data = {}
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


def header(title):
    print(f"\n{'='*72}")
    print(f"  {title}")
    print(f"{'='*72}\n")


def table(headers, rows):
    widths = [len(h) for h in headers]
    str_rows = []
    for row in rows:
        sr = []
        for i, cell in enumerate(row):
            s = f"{cell:.4f}" if isinstance(cell, float) else str(cell)
            sr.append(s)
            widths[i] = max(widths[i], len(s))
        str_rows.append(sr)
    hline = "  ".join(h.rjust(w) for h, w in zip(headers, widths))
    print(hline)
    print("-" * len(hline))
    for sr in str_rows:
        print("  ".join(s.rjust(w) for s, w in zip(sr, widths)))


# ---------------------------------------------------------------------------
# Analysis K: Map Generation Statistics
# ---------------------------------------------------------------------------

def analysis_map_generation(data):
    header("K. MAP GENERATION STATISTICS")

    # Analyze initial grid composition across all seeds
    terrain_fracs = defaultdict(list)
    map_sizes = []
    mountain_chain_lengths = []
    forest_cluster_sizes = []
    fjord_depths = []
    settlement_counts = []
    port_counts = []
    settlement_spacings = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]
            grid = run.frames[0].grid
            h, w = grid.shape
            map_sizes.append((h, w))

            total = h * w
            for code in INTERNAL_CODE_NAMES:
                terrain_fracs[code].append(int(np.count_nonzero(grid == code)) / total)

            # Settlement statistics
            alive = [s for s in run.frames[0].settlements if s.alive]
            settlement_counts.append(len(alive))
            port_counts.append(sum(1 for s in alive if s.has_port))

            # Settlement spacing (min distance to nearest neighbor)
            positions = [(s.y, s.x) for s in alive]
            for i, (y1, x1) in enumerate(positions):
                min_dist = float('inf')
                for j, (y2, x2) in enumerate(positions):
                    if i != j:
                        d = abs(y1 - y2) + abs(x1 - x2)
                        min_dist = min(min_dist, d)
                if min_dist < float('inf'):
                    settlement_spacings.append(min_dist)

            # Mountain chain analysis: connected components of mountains
            mountain = grid == 5
            if np.any(mountain):
                visited = np.zeros_like(mountain)
                for y in range(h):
                    for x in range(w):
                        if mountain[y, x] and not visited[y, x]:
                            # BFS
                            queue = [(y, x)]
                            visited[y, x] = True
                            size = 0
                            idx = 0
                            while idx < len(queue):
                                cy, cx = queue[idx]
                                idx += 1
                                size += 1
                                for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                                    ny, nx = cy+dy, cx+dx
                                    if 0<=ny<h and 0<=nx<w and mountain[ny,nx] and not visited[ny,nx]:
                                        visited[ny,nx] = True
                                        queue.append((ny,nx))
                            mountain_chain_lengths.append(size)

            # Forest cluster analysis
            forest = grid == 4
            if np.any(forest):
                visited = np.zeros_like(forest)
                for y in range(h):
                    for x in range(w):
                        if forest[y, x] and not visited[y, x]:
                            queue = [(y, x)]
                            visited[y, x] = True
                            size = 0
                            idx = 0
                            while idx < len(queue):
                                cy, cx = queue[idx]
                                idx += 1
                                size += 1
                                for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                                    ny, nx = cy+dy, cx+dx
                                    if 0<=ny<h and 0<=nx<w and forest[ny,nx] and not visited[ny,nx]:
                                        visited[ny,nx] = True
                                        queue.append((ny,nx))
                            forest_cluster_sizes.append(size)

            # Fjord depth: how far ocean penetrates inland from edges
            ocean = grid == 10
            # Ocean cells not on the border
            interior_ocean = ocean.copy()
            interior_ocean[0, :] = False
            interior_ocean[-1, :] = False
            interior_ocean[:, 0] = False
            interior_ocean[:, -1] = False
            # BFS distance from border ocean to interior ocean
            if np.any(interior_ocean):
                border_ocean = ocean.copy()
                border_ocean[1:-1, 1:-1] = False
                dist = np.full((h, w), -1, dtype=np.int32)
                queue = []
                for y in range(h):
                    for x in range(w):
                        if border_ocean[y, x]:
                            dist[y, x] = 0
                            queue.append((y, x))
                idx = 0
                while idx < len(queue):
                    cy, cx = queue[idx]
                    idx += 1
                    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                        ny, nx = cy+dy, cx+dx
                        if 0<=ny<h and 0<=nx<w and dist[ny,nx]<0 and ocean[ny,nx]:
                            dist[ny,nx] = dist[cy,cx] + 1
                            queue.append((ny,nx))
                max_fjord = int(np.max(dist[ocean]))
                fjord_depths.append(max_fjord)

    # Report
    print("Map size: all maps are", set(map_sizes))

    print("\nTerrain composition (fraction of 40x40 = 1600 cells):")
    rows = []
    for code in sorted(terrain_fracs.keys()):
        vals = terrain_fracs[code]
        name = INTERNAL_CODE_NAMES.get(code, str(code))
        rows.append([str(code), name, f"{np.mean(vals):.4f}", f"{np.std(vals):.4f}",
                     f"{np.min(vals):.4f}", f"{np.max(vals):.4f}"])
    table(["Code", "Name", "Mean", "Std", "Min", "Max"], rows)

    print(f"\nSettlement count at t=0: mean={np.mean(settlement_counts):.1f}, "
          f"std={np.std(settlement_counts):.1f}, range=[{min(settlement_counts)}, {max(settlement_counts)}]")
    print(f"Port count at t=0: mean={np.mean(port_counts):.1f}, "
          f"std={np.std(port_counts):.1f}, range=[{min(port_counts)}, {max(port_counts)}]")

    if settlement_spacings:
        ss = np.array(settlement_spacings)
        print(f"\nNearest-neighbor settlement spacing:")
        print(f"  Mean: {np.mean(ss):.2f}, Median: {np.median(ss):.1f}, Std: {np.std(ss):.2f}")
        print(f"  Min: {np.min(ss)}, Max: {np.max(ss)}")

    if mountain_chain_lengths:
        mc = np.array(mountain_chain_lengths)
        print(f"\nMountain chain sizes (connected components):")
        print(f"  Count: {len(mc)}, Mean: {np.mean(mc):.1f}, Median: {np.median(mc):.0f}")
        print(f"  Max: {np.max(mc)}, Std: {np.std(mc):.1f}")
        # Histogram
        bins = [1, 2, 5, 10, 20, 50, 100, 500]
        hist, _ = np.histogram(mc, bins=bins)
        for i in range(len(hist)):
            print(f"    [{bins[i]:3d}-{bins[i+1]:3d}): {hist[i]:4d}")

    if forest_cluster_sizes:
        fc = np.array(forest_cluster_sizes)
        print(f"\nForest cluster sizes:")
        print(f"  Count: {len(fc)}, Mean: {np.mean(fc):.1f}, Median: {np.median(fc):.0f}")
        print(f"  Max: {np.max(fc)}, Std: {np.std(fc):.1f}")

    if fjord_depths:
        fd = np.array(fjord_depths)
        print(f"\nFjord depth (max ocean penetration from border):")
        print(f"  Mean: {np.mean(fd):.1f}, Std: {np.std(fd):.1f}")
        print(f"  Min: {np.min(fd)}, Max: {np.max(fd)}")


# ---------------------------------------------------------------------------
# Analysis L: Cross-Seed Consistency Within Rounds
# ---------------------------------------------------------------------------

def analysis_cross_seed(data):
    header("L. CROSS-SEED CONSISTENCY WITHIN ROUNDS")

    print("Do seeds within the same round behave similarly?\n")

    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        if len(seeds) < 2:
            continue

        # Per-seed: mean alive at 50, mean cell changes, terminal class distribution
        seed_alive = {}
        seed_changes = {}
        seed_terminal_dist = {}

        for seed_index, runs in seeds.items():
            alives = [sum(1 for s in r.frames[-1].settlements if s.alive) for r in runs]
            changes = []
            terminal_hists = []
            for r in runs:
                c = sum(
                    int(np.count_nonzero(r.frames[fi].grid != r.frames[fi+1].grid))
                    for fi in range(len(r.frames)-1)
                )
                changes.append(c)
                tg = collapse_internal_grid(r.frames[-1].grid)
                hist = np.bincount(tg.ravel(), minlength=CLASS_COUNT).astype(np.float64)
                terminal_hists.append(hist / hist.sum())

            seed_alive[seed_index] = (np.mean(alives), np.std(alives))
            seed_changes[seed_index] = (np.mean(changes), np.std(changes))
            seed_terminal_dist[seed_index] = np.mean(terminal_hists, axis=0)

        print(f"Round {round_id[:8]}..:")
        for si in sorted(seed_alive.keys()):
            ma, sa = seed_alive[si]
            mc, sc = seed_changes[si]
            td = seed_terminal_dist[si]
            td_str = " ".join(f"{CLASS_NAMES[i][:4]}={td[i]:.3f}" for i in range(CLASS_COUNT))
            print(f"  Seed {si}: alive@50={ma:6.1f}±{sa:5.1f}  changes={mc:7.1f}±{sc:6.1f}  [{td_str}]")

        # Cross-seed coefficient of variation for alive@50
        means = [seed_alive[si][0] for si in sorted(seed_alive.keys())]
        overall_mean = np.mean(means)
        cross_seed_std = np.std(means)
        cv = cross_seed_std / max(1e-9, overall_mean)
        print(f"  Cross-seed CV(alive@50): {cv:.3f}")
        print()


# ---------------------------------------------------------------------------
# Analysis M: Settlement Founding Rules
# ---------------------------------------------------------------------------

def analysis_founding_rules(data):
    header("M. SETTLEMENT FOUNDING RULES")

    # When a new settlement is born, what is the terrain context?
    founding_prev_code = defaultdict(int)
    founding_nearby_alive = []
    founding_nearby_same_owner = []
    founding_terrain_context = defaultdict(int)
    founding_food_of_parent = []
    founding_pop_of_parent = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                prev_alive = {(s.x, s.y): s for s in prev_frame.settlements if s.alive}

                for pos, s in curr_idx.items():
                    if not s.alive:
                        continue
                    prev_s = prev_idx.get(pos)
                    if prev_s is not None and prev_s.alive:
                        continue  # not a birth
                    prev_code = int(prev_frame.grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue  # rebuild, not founding

                    founding_prev_code[prev_code] += 1

                    # Nearest alive settlement
                    x, y = pos
                    min_dist = float('inf')
                    nearest_parent = None
                    same_owner_count = 0
                    alive_count = 0
                    for ppos, ps in prev_alive.items():
                        d = abs(ppos[0] - x) + abs(ppos[1] - y)
                        if d < min_dist:
                            min_dist = d
                            nearest_parent = ps
                        if d <= 3:
                            alive_count += 1
                            if s.owner_id is not None and ps.owner_id == s.owner_id:
                                same_owner_count += 1

                    founding_nearby_alive.append(alive_count)
                    founding_nearby_same_owner.append(same_owner_count)

                    if nearest_parent is not None:
                        if nearest_parent.food is not None:
                            founding_food_of_parent.append(nearest_parent.food)
                        if nearest_parent.population is not None:
                            founding_pop_of_parent.append(nearest_parent.population)

                    # 3x3 terrain context
                    h, w = prev_frame.grid.shape
                    y0, y1 = max(0, y-1), min(h, y+2)
                    x0, x1 = max(0, x-1), min(w, x+2)
                    patch = prev_frame.grid[y0:y1, x0:x1]
                    for code in INTERNAL_CODE_NAMES:
                        if np.any(patch == code):
                            founding_terrain_context[code] += 1

    print("Terrain at founding location (previous step code):")
    total_foundings = sum(founding_prev_code.values())
    rows = []
    for code in sorted(founding_prev_code.keys()):
        name = INTERNAL_CODE_NAMES.get(code, str(code))
        count = founding_prev_code[code]
        rows.append([str(code), name, str(count), f"{count/total_foundings*100:.1f}%"])
    table(["Code", "Name", "Count", "Share"], rows)

    print(f"\nTotal founding events: {total_foundings}")

    if founding_nearby_alive:
        na = np.array(founding_nearby_alive)
        print(f"\nNearby alive settlements (within 3 cells) at founding:")
        print(f"  Mean: {np.mean(na):.2f}, Median: {np.median(na):.0f}")
        print(f"  Min: {np.min(na)}, Max: {np.max(na)}")
        # Distribution
        for count in range(min(8, int(np.max(na)) + 1)):
            n = np.count_nonzero(na == count)
            print(f"    {count} neighbors: {n:6d} ({n/len(na)*100:.1f}%)")

    if founding_nearby_same_owner:
        so = np.array(founding_nearby_same_owner)
        print(f"\nNearby same-owner settlements at founding:")
        print(f"  Mean: {np.mean(so):.2f}")
        # Fraction with at least 1 same-owner neighbor
        has_same = np.count_nonzero(so > 0)
        print(f"  Has same-owner neighbor: {has_same}/{len(so)} ({has_same/len(so)*100:.1f}%)")

    if founding_pop_of_parent:
        pp = np.array(founding_pop_of_parent)
        pf = np.array(founding_food_of_parent)
        print(f"\nNearest parent settlement stats at time of founding:")
        print(f"  Population: mean={np.mean(pp):.3f}, median={np.median(pp):.3f}")
        print(f"  Food:       mean={np.mean(pf):.3f}, median={np.median(pf):.3f}")

    print(f"\n3x3 terrain context at founding (fraction of foundings with each type nearby):")
    rows = []
    for code in sorted(founding_terrain_context.keys()):
        name = INTERNAL_CODE_NAMES.get(code, str(code))
        count = founding_terrain_context[code]
        rows.append([str(code), name, str(count), f"{count/total_foundings*100:.1f}%"])
    table(["Code", "Name", "Count", "FracOfFoundings"], rows)


# ---------------------------------------------------------------------------
# Analysis N: Trade & Port Mechanics
# ---------------------------------------------------------------------------

def analysis_port_mechanics(data):
    header("N. PORT & TRADE MECHANICS")

    # Port development: when do ports appear? What are the settlement stats right before port gain?
    port_gain_steps = []
    pre_port_pop = []
    pre_port_food = []
    pre_port_wealth = []
    pre_port_defense = []
    port_survival_after = []  # how long does the port survive after gaining port status?

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if p.alive and c.alive and not p.has_port and c.has_port:
                        port_gain_steps.append(fi)
                        if p.population is not None:
                            pre_port_pop.append(p.population)
                        if p.food is not None:
                            pre_port_food.append(p.food)
                        if p.wealth is not None:
                            pre_port_wealth.append(p.wealth)
                        if p.defense is not None:
                            pre_port_defense.append(p.defense)

                        # Track how long port survives
                        survived = 0
                        for future_fi in range(fi + 1, len(run.frames)):
                            future_s = None
                            for fs in run.frames[future_fi].settlements:
                                if (fs.x, fs.y) == pos:
                                    future_s = fs
                                    break
                            if future_s is not None and future_s.alive and future_s.has_port:
                                survived += 1
                            else:
                                break
                        port_survival_after.append(survived)

    if port_gain_steps:
        pgs = np.array(port_gain_steps)
        print(f"Port gain events: {len(pgs)}")
        print(f"\nPort gain timing:")
        print(f"  Mean step: {np.mean(pgs):.1f}, Median: {np.median(pgs):.0f}")
        print(f"  Earliest: step {np.min(pgs)}, Latest: step {np.max(pgs)}")

        # Distribution by decade
        for decade_start in range(0, 50, 10):
            count = np.count_nonzero((pgs >= decade_start) & (pgs < decade_start + 10))
            print(f"    Steps {decade_start:2d}-{decade_start+9}: {count:4d} ({count/len(pgs)*100:.1f}%)")

    if pre_port_pop:
        print(f"\nSettlement stats just before gaining port:")
        print(f"  Population: mean={np.mean(pre_port_pop):.3f}, median={np.median(pre_port_pop):.3f}")
        print(f"  Food:       mean={np.mean(pre_port_food):.3f}, median={np.median(pre_port_food):.3f}")
        print(f"  Wealth:     mean={np.mean(pre_port_wealth):.3f}, median={np.median(pre_port_wealth):.3f}")
        print(f"  Defense:    mean={np.mean(pre_port_defense):.3f}, median={np.median(pre_port_defense):.3f}")

    if port_survival_after:
        ps = np.array(port_survival_after)
        print(f"\nPort survival after acquisition:")
        print(f"  Mean: {np.mean(ps):.1f} years, Median: {np.median(ps):.0f}")
        print(f"  Max: {np.max(ps)}")
        # Fraction surviving 10+ years after port gain
        long_lived = np.count_nonzero(ps >= 10)
        print(f"  Surviving 10+ years as port: {long_lived}/{len(ps)} ({long_lived/len(ps)*100:.1f}%)")


# ---------------------------------------------------------------------------
# Analysis O: Population Carrying Capacity
# ---------------------------------------------------------------------------

def analysis_carrying_capacity(data):
    header("O. POPULATION CARRYING CAPACITY")

    # Does the world have a carrying capacity? Track total population over time
    total_pop_curves = []
    total_food_curves = []
    pop_per_settlement = []  # at each step, mean pop of alive settlements

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            pop_curve = []
            food_curve = []
            for frame in run.frames:
                total_pop = sum(s.population for s in frame.settlements if s.alive and s.population is not None)
                total_food = sum(s.food for s in frame.settlements if s.alive and s.food is not None)
                pop_curve.append(total_pop)
                food_curve.append(total_food)
            total_pop_curves.append(pop_curve)
            total_food_curves.append(food_curve)

    if total_pop_curves:
        pop_arr = np.array(total_pop_curves, dtype=np.float64)
        food_arr = np.array(total_food_curves, dtype=np.float64)

        print("Total population over time:")
        for step in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]:
            if step < pop_arr.shape[1]:
                print(f"  Year {step:2d}: pop={np.mean(pop_arr[:, step]):7.1f}±{np.std(pop_arr[:, step]):6.1f}  "
                      f"food={np.mean(food_arr[:, step]):7.1f}±{np.std(food_arr[:, step]):6.1f}")

        # Population growth rate
        print("\nPopulation growth rate (multiplicative, per 5 years):")
        for step in range(5, 51, 5):
            if step < pop_arr.shape[1]:
                prev = pop_arr[:, step-5]
                curr = pop_arr[:, step]
                # Avoid division by zero
                valid = prev > 0
                if np.any(valid):
                    ratios = curr[valid] / prev[valid]
                    print(f"  Year {step-5:2d}->{step:2d}: mean={np.mean(ratios):.3f}, median={np.median(ratios):.3f}")

        # Food per capita
        print("\nFood per capita (total food / total population):")
        for step in [0, 10, 20, 30, 40, 50]:
            if step < pop_arr.shape[1]:
                valid = pop_arr[:, step] > 0
                if np.any(valid):
                    fpc = food_arr[valid, step] / pop_arr[valid, step]
                    print(f"  Year {step:2d}: mean={np.mean(fpc):.3f}")


# ---------------------------------------------------------------------------
# Analysis P: Conflict Deep Dive
# ---------------------------------------------------------------------------

def analysis_conflict_deep(data):
    header("P. CONFLICT DEEP DIVE")

    # When owner flips happen, what are the attacker/defender stats?
    attacker_pop = []
    defender_pop = []
    attacker_food = []
    defender_food = []
    attacker_defense = []
    defender_defense = []
    flip_distances = []
    flip_steps = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                prev_alive = {(s.x, s.y): s for s in prev_frame.settlements if s.alive}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.owner_id is None or c.owner_id is None:
                        continue
                    if p.owner_id == c.owner_id:
                        continue

                    # This is an owner flip: find the "attacker" -- nearest same-owner settlement as the new owner
                    new_owner = c.owner_id
                    min_dist = float('inf')
                    attacker = None
                    for apos, a in prev_alive.items():
                        if a.owner_id == new_owner and apos != pos:
                            d = abs(apos[0] - pos[0]) + abs(apos[1] - pos[1])
                            if d < min_dist:
                                min_dist = d
                                attacker = a

                    if p.population is not None:
                        defender_pop.append(p.population)
                    if p.food is not None:
                        defender_food.append(p.food)
                    if p.defense is not None:
                        defender_defense.append(p.defense)

                    if attacker is not None:
                        if attacker.population is not None:
                            attacker_pop.append(attacker.population)
                        if attacker.food is not None:
                            attacker_food.append(attacker.food)
                        if attacker.defense is not None:
                            attacker_defense.append(attacker.defense)
                        flip_distances.append(min_dist)

                    flip_steps.append(fi)

    if flip_steps:
        fs = np.array(flip_steps)
        print(f"Total owner flips: {len(fs)}")
        print(f"\nFlip timing: mean step={np.mean(fs):.1f}, median={np.median(fs):.0f}")

    if attacker_pop and defender_pop:
        print(f"\nAttacker vs Defender stats at time of conquest:")
        print(f"  Population: attacker={np.mean(attacker_pop):.3f}  defender={np.mean(defender_pop):.3f}")
        print(f"  Food:       attacker={np.mean(attacker_food):.3f}  defender={np.mean(defender_food):.3f}")
        print(f"  Defense:    attacker={np.mean(attacker_defense):.3f}  defender={np.mean(defender_defense):.3f}")

    if flip_distances:
        fd = np.array(flip_distances)
        print(f"\nConquest distance (attacker to target):")
        print(f"  Mean: {np.mean(fd):.2f}, Median: {np.median(fd):.0f}")
        print(f"  Max: {np.max(fd)}")
        # Distribution
        for d in range(1, min(8, int(np.max(fd)) + 1)):
            n = np.count_nonzero(fd == d)
            print(f"    Distance {d}: {n:5d} ({n/len(fd)*100:.1f}%)")


# ---------------------------------------------------------------------------
# Analysis Q: Phase-Level Transition Timing
# ---------------------------------------------------------------------------

def analysis_phase_timing(data):
    header("Q. WITHIN-STEP PHASE ANALYSIS")

    # We can't see within-step phases, but we CAN look at what co-occurs within a single step.
    # For each step transition, classify what happened:
    # - pure growth (births, no collapses)
    # - pure collapse (collapses, no births)
    # - mixed (both births and collapses)
    # - quiet (neither)

    step_types = defaultdict(int)
    # Also: do births and collapses happen at the same positions? (sequential phases?)
    birth_collapse_overlap = 0
    total_steps_with_both = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                births = set()
                collapses = set()
                port_gains = set()
                owner_flips = set()

                for pos in set(prev_idx) | set(curr_idx):
                    p = prev_idx.get(pos)
                    c = curr_idx.get(pos)
                    pa = p is not None and p.alive
                    ca = c is not None and c.alive
                    prev_code = int(run.frames[fi].grid[pos[1], pos[0]])

                    if not pa and ca and prev_code != 3:
                        births.add(pos)
                    if pa and not ca:
                        collapses.add(pos)
                    if pa and ca:
                        if not p.has_port and c.has_port:
                            port_gains.add(pos)
                        if p.owner_id is not None and c.owner_id is not None and p.owner_id != c.owner_id:
                            owner_flips.add(pos)

                has_births = len(births) > 0
                has_collapses = len(collapses) > 0
                has_flips = len(owner_flips) > 0

                if has_births and has_collapses:
                    step_types["mixed"] += 1
                    total_steps_with_both += 1
                    # Check overlap
                    if births & collapses:
                        birth_collapse_overlap += 1
                elif has_births:
                    step_types["pure_growth"] += 1
                elif has_collapses:
                    step_types["pure_collapse"] += 1
                else:
                    step_types["quiet"] += 1

    total = sum(step_types.values())
    print("Step classifications:")
    for kind in ["pure_growth", "pure_collapse", "mixed", "quiet"]:
        count = step_types[kind]
        print(f"  {kind:>15}: {count:6d} ({count/total*100:.1f}%)")

    print(f"\nSteps with both births AND collapses: {total_steps_with_both}")
    print(f"  Of those, steps where same position had birth AND collapse: {birth_collapse_overlap}")
    print(f"  (This would indicate sequential phases within one step)")


# ---------------------------------------------------------------------------
# Analysis R: Settlement Owner at Birth
# ---------------------------------------------------------------------------

def analysis_birth_ownership(data):
    header("R. SETTLEMENT BIRTH OWNERSHIP PATTERNS")

    # When a new settlement is born, what is its owner_id?
    # Is it always the same as the nearest settlement?
    same_as_nearest = 0
    different_from_nearest = 0
    new_owner = 0  # owner_id not seen before
    birth_count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                prev_alive = {(s.x, s.y): s for s in run.frames[fi].settlements if s.alive}

                for pos, s in curr_idx.items():
                    if not s.alive:
                        continue
                    prev_s = prev_idx.get(pos)
                    if prev_s is not None and prev_s.alive:
                        continue
                    prev_code = int(run.frames[fi].grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue

                    birth_count += 1
                    if s.owner_id is None:
                        continue

                    # Find nearest alive settlement
                    min_dist = float('inf')
                    nearest = None
                    for ppos, ps in prev_alive.items():
                        d = abs(ppos[0] - pos[0]) + abs(ppos[1] - pos[1])
                        if d < min_dist:
                            min_dist = d
                            nearest = ps

                    if nearest is not None:
                        if nearest.owner_id == s.owner_id:
                            same_as_nearest += 1
                        else:
                            different_from_nearest += 1

    total_with_nearest = same_as_nearest + different_from_nearest
    print(f"Total births: {birth_count}")
    print(f"Same owner as nearest settlement: {same_as_nearest}/{total_with_nearest} ({same_as_nearest/max(1,total_with_nearest)*100:.1f}%)")
    print(f"Different owner from nearest: {different_from_nearest}/{total_with_nearest} ({different_from_nearest/max(1,total_with_nearest)*100:.1f}%)")


# ---------------------------------------------------------------------------
# Analysis S: Grid Code Co-occurrence Patterns
# ---------------------------------------------------------------------------

def analysis_code_adjacency(data):
    header("S. TERRAIN ADJACENCY PATTERNS AT T=0")

    # What terrains tend to be adjacent to each other?
    adj_counts = np.zeros((12, 12), dtype=np.int64)

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            grid = runs[0].frames[0].grid
            h, w = grid.shape
            for y in range(h):
                for x in range(w):
                    code = int(grid[y, x])
                    for dy, dx in [(0, 1), (1, 0)]:  # right and down only to avoid double-counting
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            neighbor = int(grid[ny, nx])
                            adj_counts[code, neighbor] += 1
                            adj_counts[neighbor, code] += 1

    codes_present = sorted(set(c for c in INTERNAL_CODE_NAMES if adj_counts[c].sum() > 0))

    # Compute lift (observed / expected under independence)
    row_sums = adj_counts.sum(axis=1).astype(np.float64)
    total = adj_counts.sum()

    print("Adjacency lift (obs/expected, >1 = attracted, <1 = repelled):\n")
    header_str = "         " + "  ".join(f"{INTERNAL_CODE_NAMES.get(c, str(c)):>6}" for c in codes_present)
    print(header_str)
    for c1 in codes_present:
        row_str = f"{INTERNAL_CODE_NAMES.get(c1, str(c1)):>8} "
        for c2 in codes_present:
            expected = row_sums[c1] * row_sums[c2] / max(1, total)
            lift = adj_counts[c1, c2] / max(1e-9, expected)
            if lift > 1.5:
                row_str += f" {lift:5.2f}*"
            elif lift < 0.5:
                row_str += f" {lift:5.2f}!"
            else:
                row_str += f" {lift:5.2f} "
        print(row_str)

    print("\n  * = strongly attracted (lift > 1.5)")
    print("  ! = strongly repelled (lift < 0.5)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Third-wave replay EDA")
    parser.add_argument("--max-runs-per-seed", type=int, default=8)
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    paths = WorkspacePaths.from_root(project_root)

    print("Discovering rounds...")
    round_ids = discover_rounds(paths)
    print(f"Found {len(round_ids)} rounds\n")

    print(f"Loading up to {args.max_runs_per_seed} runs per seed...")
    t0 = time.time()
    data = load_all_runs(paths, round_ids, args.max_runs_per_seed)
    total_runs = sum(len(r) for rd in data.values() for r in rd.values())
    print(f"\nLoaded {total_runs} runs in {time.time() - t0:.1f}s\n")

    analyses = [
        ("K", analysis_map_generation),
        ("L", analysis_cross_seed),
        ("M", analysis_founding_rules),
        ("N", analysis_port_mechanics),
        ("O", analysis_carrying_capacity),
        ("P", analysis_conflict_deep),
        ("Q", analysis_phase_timing),
        ("R", analysis_birth_ownership),
        ("S", analysis_code_adjacency),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-3 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
