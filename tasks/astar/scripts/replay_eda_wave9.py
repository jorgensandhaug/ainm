"""Wave 9 EDA: per-round ruin reclamation, population threshold, founding preferences,
food production reverse engineering, settlement interaction range.

Run: uv run python scripts/replay_eda_wave9.py [--max-runs-per-seed N]
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.terrain import collapse_internal_grid, CLASS_COUNT, CLASS_NAMES
from astar.core.trajectory import ReplayRun
from astar.infra.artifacts.paths import WorkspacePaths

INTERNAL_CODE_NAMES = {
    0: "empty", 1: "settlement", 2: "port", 3: "ruin",
    4: "forest", 5: "mountain", 10: "ocean", 11: "plains",
}


def discover_rounds(paths):
    replay_root = paths.raw_dir / "replays"
    if not replay_root.exists():
        return []
    return sorted([
        d.name for d in replay_root.iterdir()
        if d.is_dir() and sum(1 for sd in d.glob("seed_index=*") for _ in sd.glob("*.json")) > 5
    ])


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
        for si in range(5):
            if paths.raw_replay_dir(round_id, si).exists():
                runs = load_runs_for_seed(paths, round_id, si, max_runs_per_seed)
                if runs:
                    data[round_id][si] = runs
        sc = len(data[round_id])
        rc = sum(len(v) for v in data[round_id].values())
        print(f"  {round_id[:8]}.. : {sc} seeds, {rc} runs")
    return data


def header(title):
    print(f"\n{'='*72}")
    print(f"  {title}")
    print(f"{'='*72}\n")


# ---------------------------------------------------------------------------
# III: Per-Round Ruin Reclamation Rate
# ---------------------------------------------------------------------------

def analysis_per_round_reclamation(data):
    header("III. PER-ROUND RUIN RECLAMATION RATE")

    for round_id in sorted(data.keys()):
        ruin_to_forest = 0
        ruin_to_settlement = 0
        ruin_to_plains = 0
        ruin_total = 0

        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_g = run.frames[fi].grid
                    curr_g = run.frames[fi + 1].grid
                    ruin_mask = prev_g == 3
                    if not np.any(ruin_mask):
                        continue
                    curr_at_ruin = curr_g[ruin_mask]
                    changed = curr_at_ruin != 3
                    ruin_total += int(np.count_nonzero(changed))
                    ruin_to_forest += int(np.count_nonzero(curr_at_ruin == 4))
                    ruin_to_settlement += int(np.count_nonzero(np.isin(curr_at_ruin, [1, 2])))
                    ruin_to_plains += int(np.count_nonzero(np.isin(curr_at_ruin, [0, 11])))

        if ruin_total > 0:
            f_rate = ruin_to_forest / ruin_total
            s_rate = ruin_to_settlement / ruin_total
            p_rate = ruin_to_plains / ruin_total
            print(f"  {round_id[:8]}.. : rebuild={s_rate:.3f}  forest={f_rate:.3f}  plains={p_rate:.3f}  (n={ruin_total})")


# ---------------------------------------------------------------------------
# JJJ: Population Threshold for Founding (fine-grained)
# ---------------------------------------------------------------------------

def analysis_founding_threshold_fine(data):
    header("JJJ. FOUNDING THRESHOLD (fine-grained population)")

    # Fine-grained founding rate by population
    pop_bins = np.arange(0.0, 3.5, 0.1)
    counts_parent = np.zeros(len(pop_bins) - 1, dtype=np.int64)
    counts_total = np.zeros(len(pop_bins) - 1, dtype=np.int64)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                if fi % 4 != 3:  # only look at birth-burst steps
                    continue
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                prev_alive = {(s.x, s.y): s for s in prev_frame.settlements if s.alive}

                birth_parents = set()
                for pos, s in curr_idx.items():
                    if not s.alive:
                        continue
                    prev_s = prev_idx.get(pos)
                    if prev_s is not None and prev_s.alive:
                        continue
                    prev_code = int(prev_frame.grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue
                    min_dist = float('inf')
                    parent_pos = None
                    for ppos, ps in prev_alive.items():
                        if s.owner_id is not None and ps.owner_id == s.owner_id:
                            d = abs(ppos[0] - pos[0]) + abs(ppos[1] - pos[1])
                            if d < min_dist:
                                min_dist = d
                                parent_pos = ppos
                    if parent_pos is not None:
                        birth_parents.add(parent_pos)

                for pos, s in prev_alive.items():
                    if s.population is None:
                        continue
                    bin_idx = np.searchsorted(pop_bins, s.population, side='right') - 1
                    if 0 <= bin_idx < len(counts_total):
                        counts_total[bin_idx] += 1
                        if pos in birth_parents:
                            counts_parent[bin_idx] += 1

    print("Founding rate at mod-3 steps by fine population bucket:\n")
    for i in range(len(pop_bins) - 1):
        if counts_total[i] > 100:
            rate = counts_parent[i] / counts_total[i]
            bar = "#" * int(rate * 100)
            print(f"  [{pop_bins[i]:.1f}, {pop_bins[i+1]:.1f}): {rate:.4f}  n={counts_total[i]:6d}  {bar}")


# ---------------------------------------------------------------------------
# KKK: Food Production Terrain Model
# ---------------------------------------------------------------------------

def analysis_food_terrain_model(data):
    header("KKK. FOOD PRODUCTION BY EXACT NEIGHBOR COUNT")

    # For each settlement step, compute exact 4-neighbor terrain counts
    # and correlate with food delta. Use 4-connected neighbors only (not 3x3).
    neighbor_combos = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                h, w = prev_frame.grid.shape

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.food is None or c.food is None:
                        continue

                    x, y = pos
                    # 4-connected neighbors
                    neighbors = []
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            neighbors.append(int(prev_frame.grid[ny, nx]))

                    # Count by type
                    n_plains = sum(1 for n in neighbors if n == 11)
                    n_forest = sum(1 for n in neighbors if n == 4)
                    n_ocean = sum(1 for n in neighbors if n == 10)
                    n_mountain = sum(1 for n in neighbors if n == 5)
                    n_settlement = sum(1 for n in neighbors if n in (1, 2))

                    key = (n_plains, n_forest, n_ocean, n_mountain, n_settlement)
                    fd = c.food - p.food
                    neighbor_combos[key].append(fd)

    # Find the most common combos and their mean food delta
    sorted_combos = sorted(neighbor_combos.items(), key=lambda x: -len(x[1]))
    print("Top neighbor configurations and their mean food delta:\n")
    print(f"{'Plains':>7} {'Forest':>7} {'Ocean':>7} {'Mount':>7} {'Settl':>7} | {'N':>7} {'MeanFD':>8} {'StdFD':>8}")
    print("-" * 75)
    for key, vals in sorted_combos[:25]:
        n_p, n_f, n_o, n_m, n_s = key
        arr = np.array(vals)
        print(f"{n_p:7d} {n_f:7d} {n_o:7d} {n_m:7d} {n_s:7d} | {len(vals):7d} {np.mean(arr):+8.4f} {np.std(arr):8.4f}")

    # Marginal effect of each terrain type
    print("\nMarginal effect (mean food delta by neighbor count):")
    for terrain_name, terrain_idx in [("plains", 0), ("forest", 1), ("ocean", 2), ("mountain", 3), ("settlement", 4)]:
        by_count = defaultdict(list)
        for key, vals in neighbor_combos.items():
            by_count[key[terrain_idx]].extend(vals)
        print(f"\n  {terrain_name}:")
        for count in sorted(by_count.keys()):
            arr = np.array(by_count[count])
            print(f"    count={count}: mean_fd={np.mean(arr):+.4f}  n={len(arr)}")


# ---------------------------------------------------------------------------
# LLL: Settlement Interaction Range (conflict + trade)
# ---------------------------------------------------------------------------

def analysis_interaction_range(data):
    header("LLL. SETTLEMENT INTERACTION RANGE")

    # At what distance do owner flips happen? At what distance do port-port
    # pairs affect each other?

    # Owner flip distance (already done in P, but let's get finer bins)
    flip_dists = []
    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                prev_alive = {(s.x, s.y): s for s in run.frames[fi].settlements if s.alive}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.owner_id is None or c.owner_id is None or p.owner_id == c.owner_id:
                        continue

                    new_owner = c.owner_id
                    min_dist = float('inf')
                    for apos, a in prev_alive.items():
                        if a.owner_id == new_owner and apos != pos:
                            d = abs(apos[0] - pos[0]) + abs(apos[1] - pos[1])
                            min_dist = min(min_dist, d)
                    if min_dist < 100:
                        flip_dists.append(min_dist)

    if flip_dists:
        fd = np.array(flip_dists)
        print(f"Owner flip distance distribution (n={len(fd)}):")
        for d in range(1, 10):
            n = np.count_nonzero(fd == d)
            pct = n / len(fd) * 100
            bar = "#" * int(pct * 2)
            print(f"  dist={d}: {n:5d} ({pct:5.1f}%) {bar}")
        n_far = np.count_nonzero(fd >= 10)
        print(f"  dist>=10: {n_far:5d} ({n_far/len(fd)*100:.1f}%)")

    # Port-port proximity: does having another port nearby affect food/wealth?
    port_nearby_wealth = []
    port_alone_wealth = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                ports = [(s.x, s.y, s) for s in run.frames[fi].settlements if s.alive and s.has_port]

                for x, y, s in ports:
                    c = curr_idx.get((x, y))
                    if c is None or not c.alive or s.wealth is None or c.wealth is None:
                        continue
                    wd = c.wealth - s.wealth

                    has_nearby_port = False
                    for px, py, ps in ports:
                        if (px, py) != (x, y):
                            d = abs(px - x) + abs(py - y)
                            if d <= 8:
                                has_nearby_port = True
                                break

                    if has_nearby_port:
                        port_nearby_wealth.append(wd)
                    else:
                        port_alone_wealth.append(wd)

    if port_nearby_wealth and port_alone_wealth:
        print(f"\nPort-port trade proximity effect:")
        print(f"  Port with nearby port (<=8): wealth_delta={np.mean(port_nearby_wealth):+.6f}  n={len(port_nearby_wealth)}")
        print(f"  Port alone:                  wealth_delta={np.mean(port_alone_wealth):+.6f}  n={len(port_alone_wealth)}")


# ---------------------------------------------------------------------------
# MMM: Per-Round Founding Rate
# ---------------------------------------------------------------------------

def analysis_per_round_founding(data):
    header("MMM. PER-ROUND FOUNDING RATE")

    for round_id in sorted(data.keys()):
        birth_count = 0
        alive_steps = 0
        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    alive_steps += sum(1 for s in run.frames[fi].settlements if s.alive)

                    for pos, s in curr_idx.items():
                        if s.alive:
                            prev_s = prev_idx.get(pos)
                            if prev_s is None or not prev_s.alive:
                                prev_code = int(run.frames[fi].grid[pos[1], pos[0]])
                                if prev_code != 3:
                                    birth_count += 1

        rate = birth_count / max(1, alive_steps)
        print(f"  {round_id[:8]}.. : founding_rate={rate:.4f}  births={birth_count}  alive_steps={alive_steps}")


# ---------------------------------------------------------------------------
# NNN: Rebuild Owner Analysis (deeper)
# ---------------------------------------------------------------------------

def analysis_rebuild_owner_deep(data):
    header("NNN. REBUILD OWNERSHIP (deeper)")

    # When a ruin is rebuilt, who rebuilds it?
    # Same as original owner, nearest alive, or random?
    rebuilt_by_nearest = 0
    rebuilt_not_nearest = 0
    rebuilt_by_original = 0
    rebuilt_not_original = 0
    total_rebuilds = 0

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
                    prev_code = int(prev_frame.grid[pos[1], pos[0]])
                    if prev_code != 3:
                        continue
                    if s.owner_id is None:
                        continue

                    total_rebuilds += 1

                    # Who was the original owner? Check the frame before ruin
                    if fi >= 1:
                        pre_ruin_frame = run.frames[fi - 1]
                        pre_idx = {(ss.x, ss.y): ss for ss in pre_ruin_frame.settlements}
                        pre_s = pre_idx.get(pos)
                        if pre_s is not None and pre_s.owner_id is not None:
                            if pre_s.owner_id == s.owner_id:
                                rebuilt_by_original += 1
                            else:
                                rebuilt_not_original += 1

                    # Who is the nearest alive settlement?
                    x, y = pos
                    min_dist = float('inf')
                    nearest = None
                    for ppos, ps in prev_alive.items():
                        d = abs(ppos[0] - x) + abs(ppos[1] - y)
                        if d < min_dist:
                            min_dist = d
                            nearest = ps
                    if nearest is not None and nearest.owner_id is not None:
                        if nearest.owner_id == s.owner_id:
                            rebuilt_by_nearest += 1
                        else:
                            rebuilt_not_nearest += 1

    print(f"Total rebuilds with owner info: {total_rebuilds}")
    t1 = rebuilt_by_original + rebuilt_not_original
    if t1 > 0:
        print(f"\nRebuilt by original (pre-collapse) owner: {rebuilt_by_original}/{t1} ({rebuilt_by_original/t1*100:.1f}%)")
    t2 = rebuilt_by_nearest + rebuilt_not_nearest
    if t2 > 0:
        print(f"Rebuilt by nearest alive settlement's owner: {rebuilt_by_nearest}/{t2} ({rebuilt_by_nearest/t2*100:.1f}%)")


# ---------------------------------------------------------------------------
# OOO: Stochastic Variance of Settlement Count Over Time
# ---------------------------------------------------------------------------

def analysis_alive_variance_trajectory(data):
    header("OOO. ALIVE COUNT VARIANCE TRAJECTORY (within seed)")

    # For each seed, plot the mean and std of alive count over time
    # across stochastic runs
    for round_id in sorted(data.keys())[:3]:  # just 3 rounds
        print(f"Round {round_id[:8]}..:")
        for seed_index in sorted(data[round_id].keys())[:2]:  # 2 seeds
            runs = data[round_id][seed_index]
            if len(runs) < 3:
                continue
            alive_curves = np.array([
                [sum(1 for s in run.frames[fi].settlements if s.alive) for fi in range(len(run.frames))]
                for run in runs
            ], dtype=np.float64)

            print(f"  Seed {seed_index} (n={len(runs)}):")
            for step in [0, 5, 10, 20, 30, 40, 50]:
                if step < alive_curves.shape[1]:
                    m = np.mean(alive_curves[:, step])
                    s = np.std(alive_curves[:, step])
                    cv = s / max(1e-9, m)
                    print(f"    Year {step:2d}: mean={m:6.1f}  std={s:5.1f}  CV={cv:.3f}")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 9 replay EDA")
    parser.add_argument("--max-runs-per-seed", type=int, default=8)
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    paths = WorkspacePaths.from_root(project_root)

    print("Discovering rounds...")
    round_ids = discover_rounds(paths)
    print(f"Found {len(round_ids)} rounds\n")

    t0 = time.time()
    data = load_all_runs(paths, round_ids, args.max_runs_per_seed)
    total_runs = sum(len(r) for rd in data.values() for r in rd.values())
    print(f"\nLoaded {total_runs} runs in {time.time() - t0:.1f}s\n")

    analyses = [
        ("III", analysis_per_round_reclamation),
        ("JJJ", analysis_founding_threshold_fine),
        ("KKK", analysis_food_terrain_model),
        ("LLL", analysis_interaction_range),
        ("MMM", analysis_per_round_founding),
        ("NNN", analysis_rebuild_owner_deep),
        ("OOO", analysis_alive_variance_trajectory),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-9 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
