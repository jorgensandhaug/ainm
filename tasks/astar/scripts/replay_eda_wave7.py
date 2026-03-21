"""Wave 7 EDA: reverse-engineer mechanics -- food formula, growth model,
collapse conditions, port rules, population dynamics.

Run: uv run python scripts/replay_eda_wave7.py [--max-runs-per-seed N]
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
# VV: Collapse Threshold Analysis
# ---------------------------------------------------------------------------

def analysis_collapse_threshold(data):
    header("VV. COLLAPSE THRESHOLD ANALYSIS")

    # For settlements that collapse, what were their stats?
    # Bucket by each stat and compute collapse rate

    # Collect (pop, food, defense, did_collapse) tuples
    observations = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                for pos in prev_idx:
                    p = prev_idx[pos]
                    if not p.alive:
                        continue
                    c = curr_idx.get(pos)
                    collapsed = c is None or not c.alive
                    if p.population is not None and p.food is not None and p.defense is not None:
                        observations.append((p.population, p.food, p.defense, collapsed))

    if not observations:
        return

    obs = np.array(observations)
    pop = obs[:, 0]
    food = obs[:, 1]
    defense = obs[:, 2]
    collapsed = obs[:, 3].astype(bool)

    print(f"Total settlement-step observations: {len(obs)}")
    print(f"Overall collapse rate: {np.mean(collapsed):.4f}\n")

    # Collapse rate by population bucket
    print("Collapse rate by population bucket:")
    for low, high in [(0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 10.0)]:
        mask = (pop >= low) & (pop < high)
        if np.any(mask):
            rate = np.mean(collapsed[mask])
            n = np.sum(mask)
            print(f"  [{low:.1f}, {high:.1f}): n={n:7d}  collapse_rate={rate:.4f}")

    # Collapse rate by food bucket
    print("\nCollapse rate by food bucket:")
    for low, high in [(0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.9), (0.9, 1.01)]:
        mask = (food >= low) & (food < high)
        if np.any(mask):
            rate = np.mean(collapsed[mask])
            n = np.sum(mask)
            print(f"  [{low:.1f}, {high:.1f}): n={n:7d}  collapse_rate={rate:.4f}")

    # Collapse rate by defense bucket
    print("\nCollapse rate by defense bucket:")
    for low, high in [(0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.9), (0.9, 1.01)]:
        mask = (defense >= low) & (defense < high)
        if np.any(mask):
            rate = np.mean(collapsed[mask])
            n = np.sum(mask)
            print(f"  [{low:.1f}, {high:.1f}): n={n:7d}  collapse_rate={rate:.4f}")

    # Combined: low food AND low defense
    print("\nCollapse rate by food x defense interaction:")
    for food_thresh in [0.3, 0.5]:
        for def_thresh in [0.3, 0.5]:
            mask_low = (food < food_thresh) & (defense < def_thresh)
            mask_high = (food >= food_thresh) & (defense >= def_thresh)
            if np.any(mask_low) and np.any(mask_high):
                rate_low = np.mean(collapsed[mask_low])
                rate_high = np.mean(collapsed[mask_high])
                print(f"  food<{food_thresh} & def<{def_thresh}: {rate_low:.4f}  "
                      f"food>={food_thresh} & def>={def_thresh}: {rate_high:.4f}  "
                      f"ratio: {rate_low/max(1e-9, rate_high):.1f}x")


# ---------------------------------------------------------------------------
# WW: Population Growth Dynamics
# ---------------------------------------------------------------------------

def analysis_pop_growth(data):
    header("WW. POPULATION GROWTH DYNAMICS")

    # For alive->alive transitions, model pop_delta as function of current stats
    pop_deltas = []
    prev_pops = []
    prev_foods = []
    prev_defenses = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if p.alive and c.alive and p.population is not None and c.population is not None:
                        pop_deltas.append(c.population - p.population)
                        prev_pops.append(p.population)
                        prev_foods.append(p.food if p.food is not None else 0.0)
                        prev_defenses.append(p.defense if p.defense is not None else 0.0)

    if not pop_deltas:
        return

    pd = np.array(pop_deltas)
    pp = np.array(prev_pops)
    pf = np.array(prev_foods)

    print(f"Population delta statistics (n={len(pd)}):")
    print(f"  Mean: {np.mean(pd):.4f}")
    print(f"  Std: {np.std(pd):.4f}")
    print(f"  Min: {np.min(pd):.4f}")
    print(f"  Max: {np.max(pd):.4f}")

    # Pop delta by current population
    print("\nPop delta by current population:")
    for low, high in [(0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 10.0)]:
        mask = (pp >= low) & (pp < high)
        if np.any(mask):
            print(f"  pop [{low:.1f}, {high:.1f}): mean_delta={np.mean(pd[mask]):+.4f}  std={np.std(pd[mask]):.4f}")

    # Pop delta by food
    print("\nPop delta by current food:")
    for low, high in [(0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]:
        mask = (pf >= low) & (pf < high)
        if np.any(mask):
            print(f"  food [{low:.1f}, {high:.1f}): mean_delta={np.mean(pd[mask]):+.4f}  std={np.std(pd[mask]):.4f}")

    # Is there a food threshold for positive growth?
    print("\nFraction with positive pop growth by food level:")
    for threshold in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
        below = pd[pf < threshold]
        above = pd[pf >= threshold]
        if len(below) > 0 and len(above) > 0:
            frac_below = float(np.count_nonzero(below > 0)) / len(below)
            frac_above = float(np.count_nonzero(above > 0)) / len(above)
            print(f"  food<{threshold:.1f}: {frac_below:.3f}  food>={threshold:.1f}: {frac_above:.3f}")


# ---------------------------------------------------------------------------
# XX: Food Delta Decomposition
# ---------------------------------------------------------------------------

def analysis_food_delta(data):
    header("XX. FOOD DELTA DECOMPOSITION")

    # Try to understand what drives food changes
    food_deltas_data = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
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
                    y0, y1 = max(0, y - 1), min(h, y + 2)
                    x0, x1 = max(0, x - 1), min(w, x + 2)
                    patch = prev_frame.grid[y0:y1, x0:x1]

                    food_deltas_data.append({
                        "fd": c.food - p.food,
                        "prev_food": p.food,
                        "prev_pop": p.population if p.population else 0.0,
                        "has_port": 1 if p.has_port else 0,
                        "n_plains": int(np.count_nonzero(patch == 11)),
                        "n_forest": int(np.count_nonzero(patch == 4)),
                        "n_ocean": int(np.count_nonzero(patch == 10)),
                        "n_settlement": int(np.count_nonzero(np.isin(patch, [1, 2]))),
                        "n_mountain": int(np.count_nonzero(patch == 5)),
                        "step": fi,
                    })

    if not food_deltas_data:
        return

    fd_arr = np.array([d["fd"] for d in food_deltas_data])
    prev_food = np.array([d["prev_food"] for d in food_deltas_data])
    prev_pop = np.array([d["prev_pop"] for d in food_deltas_data])
    has_port = np.array([d["has_port"] for d in food_deltas_data])
    n_plains = np.array([d["n_plains"] for d in food_deltas_data])
    n_forest = np.array([d["n_forest"] for d in food_deltas_data])
    n_ocean = np.array([d["n_ocean"] for d in food_deltas_data])

    print(f"Food delta observations: {len(fd_arr)}\n")

    # Food delta by previous food level
    print("Mean food delta by previous food level:")
    for low, high in [(0, 0.1), (0.1, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.85), (0.85, 0.95), (0.95, 1.01)]:
        mask = (prev_food >= low) & (prev_food < high)
        if np.any(mask):
            print(f"  food [{low:.2f}, {high:.2f}): mean_delta={np.mean(fd_arr[mask]):+.4f}  n={np.sum(mask)}")

    # Does having a port affect food?
    print(f"\nFood delta by port status:")
    port_mask = has_port > 0
    print(f"  Has port:   mean_delta={np.mean(fd_arr[port_mask]):+.4f}  (n={np.sum(port_mask)})")
    print(f"  No port:    mean_delta={np.mean(fd_arr[~port_mask]):+.4f}  (n={np.sum(~port_mask)})")

    # Food delta by population level
    print(f"\nFood delta by population:")
    for low, high in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 5.0)]:
        mask = (prev_pop >= low) & (prev_pop < high)
        if np.any(mask):
            print(f"  pop [{low:.1f}, {high:.1f}): mean_delta={np.mean(fd_arr[mask]):+.4f}")

    # Approaching cap behavior
    print(f"\nFood approaching cap (food > 0.9):")
    near_cap = prev_food > 0.9
    if np.any(near_cap):
        print(f"  Mean delta: {np.mean(fd_arr[near_cap]):+.4f}")
        print(f"  Frac negative: {np.mean(fd_arr[near_cap] < 0):.3f}")
        print(f"  Frac zero: {np.mean(np.abs(fd_arr[near_cap]) < 0.001):.3f}")


# ---------------------------------------------------------------------------
# YY: Port Development Preconditions
# ---------------------------------------------------------------------------

def analysis_port_preconditions(data):
    header("YY. PORT DEVELOPMENT PRECONDITIONS")

    # When does a settlement become a port? What are the exact preconditions?
    port_gains = []
    non_port_observations = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
            ocean = initial_grid == 10

            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                h, w = run.frames[fi].grid.shape

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.has_port:
                        continue  # already a port

                    x, y = pos
                    is_coastal = False
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and ocean[ny, nx]:
                            is_coastal = True
                            break

                    gained_port = c.has_port and not p.has_port
                    entry = {
                        "pop": p.population if p.population else 0.0,
                        "food": p.food if p.food else 0.0,
                        "wealth": p.wealth if p.wealth else 0.0,
                        "defense": p.defense if p.defense else 0.0,
                        "coastal": is_coastal,
                        "step": fi,
                    }

                    if gained_port:
                        port_gains.append(entry)
                    elif is_coastal:
                        non_port_observations.append(entry)

    if not port_gains:
        return

    print(f"Port gain events: {len(port_gains)}")
    print(f"Coastal non-port observations: {len(non_port_observations)}\n")

    # Are ALL port gains coastal?
    non_coastal_ports = sum(1 for e in port_gains if not e["coastal"])
    print(f"Non-coastal port gains: {non_coastal_ports}")
    if non_coastal_ports == 0:
        print("  CONFIRMED: port gains are 100% coastal.\n")

    # Compare stats of port-gaining vs non-gaining coastal settlements
    for stat in ["pop", "food", "wealth", "defense"]:
        g = np.array([e[stat] for e in port_gains])
        n = np.array([e[stat] for e in non_port_observations])
        print(f"  {stat:>8}: port_gain={np.mean(g):.4f}  coastal_non={np.mean(n):.4f}  diff={np.mean(g)-np.mean(n):+.4f}")

    # Is there a hard food threshold?
    print(f"\nFood distribution of port-gaining settlements:")
    g_food = np.array([e["food"] for e in port_gains])
    pcts = np.percentile(g_food, [0, 5, 10, 25, 50, 75, 90, 95, 100])
    print(f"  min={pcts[0]:.4f}  p5={pcts[1]:.4f}  p10={pcts[2]:.4f}  p25={pcts[3]:.4f}  "
          f"p50={pcts[4]:.4f}  p75={pcts[5]:.4f}  p90={pcts[6]:.4f}")

    # Population distribution
    print(f"\nPopulation distribution of port-gaining settlements:")
    g_pop = np.array([e["pop"] for e in port_gains])
    pcts = np.percentile(g_pop, [0, 5, 10, 25, 50, 75, 90, 95, 100])
    print(f"  min={pcts[0]:.4f}  p5={pcts[1]:.4f}  p10={pcts[2]:.4f}  p25={pcts[3]:.4f}  "
          f"p50={pcts[4]:.4f}  p75={pcts[5]:.4f}  p90={pcts[6]:.4f}")

    # Port gain rate by food bucket for coastal settlements
    print(f"\nPort gain rate by food level (coastal only):")
    all_coastal = port_gains + non_port_observations
    for low, high in [(0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]:
        gains = sum(1 for e in port_gains if low <= e["food"] < high)
        total = sum(1 for e in all_coastal if low <= e["food"] < high)
        if total > 0:
            rate = gains / total
            print(f"  food [{low:.1f}, {high:.1f}): {gains}/{total} = {rate:.4f}")


# ---------------------------------------------------------------------------
# ZZ: Defense Dynamics
# ---------------------------------------------------------------------------

def analysis_defense_dynamics(data):
    header("ZZ. DEFENSE DYNAMICS")

    defense_deltas = []
    prev_defenses = []
    was_attacked = []  # had owner flip or collapse nearby

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                # Track who flipped
                flipped = set()
                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if p.alive and c.alive and p.owner_id is not None and c.owner_id is not None:
                        if p.owner_id != c.owner_id:
                            flipped.add(pos)

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.defense is None or c.defense is None:
                        continue

                    dd = c.defense - p.defense
                    defense_deltas.append(dd)
                    prev_defenses.append(p.defense)

                    # Was there nearby conflict?
                    x, y = pos
                    nearby_flip = any(
                        abs(fx - x) <= 2 and abs(fy - y) <= 2
                        for fx, fy in flipped
                    )
                    was_attacked.append(nearby_flip)

    if defense_deltas:
        dd = np.array(defense_deltas)
        pd_arr = np.array(prev_defenses)
        wa = np.array(was_attacked)

        print(f"Defense delta statistics (n={len(dd)}):")
        print(f"  Mean: {np.mean(dd):+.4f}")
        print(f"  Std: {np.std(dd):.4f}")

        print(f"\nDefense delta by previous defense level:")
        for low, high in [(0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]:
            mask = (pd_arr >= low) & (pd_arr < high)
            if np.any(mask):
                print(f"  def [{low:.1f}, {high:.1f}): mean_delta={np.mean(dd[mask]):+.4f}  "
                      f"frac_positive={np.mean(dd[mask] > 0):.3f}")

        print(f"\nDefense delta by nearby conflict:")
        print(f"  Nearby flip: mean_delta={np.mean(dd[wa]):+.4f}  (n={np.sum(wa)})")
        print(f"  No conflict: mean_delta={np.mean(dd[~wa]):+.4f}  (n={np.sum(~wa)})")

        # Defense at cap behavior
        near_cap = pd_arr >= 0.99
        if np.any(near_cap):
            print(f"\nDefense at cap (>=0.99):")
            print(f"  Mean delta: {np.mean(dd[near_cap]):+.6f}")
            print(f"  All zero: {np.all(np.abs(dd[near_cap]) < 0.001)}")


# ---------------------------------------------------------------------------
# AAA: Wealth Dynamics (why does it decay?)
# ---------------------------------------------------------------------------

def analysis_wealth_dynamics(data):
    header("AAA. WEALTH DYNAMICS (why does it decay?)")

    wealth_deltas = []
    prev_wealths = []
    has_ports = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.wealth is None or c.wealth is None:
                        continue
                    wealth_deltas.append(c.wealth - p.wealth)
                    prev_wealths.append(p.wealth)
                    has_ports.append(1 if p.has_port else 0)

    if wealth_deltas:
        wd = np.array(wealth_deltas)
        pw = np.array(prev_wealths)
        hp = np.array(has_ports).astype(bool)

        print(f"Wealth delta statistics (n={len(wd)}):")
        print(f"  Mean: {np.mean(wd):+.6f}")
        print(f"  Std: {np.std(wd):.6f}")

        print(f"\nWealth delta by previous wealth level:")
        for low, high in [(0, 0.01), (0.01, 0.05), (0.05, 0.1), (0.1, 0.2), (0.2, 0.5), (0.5, 2.0)]:
            mask = (pw >= low) & (pw < high)
            if np.any(mask):
                print(f"  wealth [{low:.2f}, {high:.2f}): mean_delta={np.mean(wd[mask]):+.6f}  "
                      f"frac_neg={np.mean(wd[mask] < 0):.3f}  n={np.sum(mask)}")

        print(f"\nWealth delta by port status:")
        print(f"  Has port:  mean_delta={np.mean(wd[hp]):+.6f}  (n={np.sum(hp)})")
        print(f"  No port:   mean_delta={np.mean(wd[~hp]):+.6f}  (n={np.sum(~hp)})")

        # Is wealth gain ever positive for non-port settlements?
        nonport_positive = np.count_nonzero(wd[~hp] > 0.001)
        print(f"\n  Non-port positive wealth gain: {nonport_positive}/{np.sum(~hp)} "
              f"({nonport_positive/max(1,np.sum(~hp))*100:.2f}%)")
        port_positive = np.count_nonzero(wd[hp] > 0.001)
        print(f"  Port positive wealth gain: {port_positive}/{np.sum(hp)} "
              f"({port_positive/max(1,np.sum(hp))*100:.2f}%)")


# ---------------------------------------------------------------------------
# BBB: Founding Distance from Parent (refined)
# ---------------------------------------------------------------------------

def analysis_founding_distance_refined(data):
    header("BBB. FOUNDING DISTANCE FROM PARENT (refined)")

    # For each birth, find the distance to nearest same-owner alive settlement
    distances = []
    parent_pops = []
    parent_foods = []

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

                    # Find nearest same-owner parent
                    x, y = pos
                    min_dist = float('inf')
                    parent = None
                    for ppos, ps in prev_alive.items():
                        if s.owner_id is not None and ps.owner_id == s.owner_id:
                            d = abs(ppos[0] - x) + abs(ppos[1] - y)
                            if d < min_dist:
                                min_dist = d
                                parent = ps

                    if parent is not None and min_dist < 100:
                        distances.append(min_dist)
                        if parent.population is not None:
                            parent_pops.append(parent.population)
                        if parent.food is not None:
                            parent_foods.append(parent.food)

    if distances:
        d = np.array(distances)
        print(f"Distance from same-owner parent to new settlement (n={len(d)}):")
        print(f"  Mean: {np.mean(d):.2f}")
        print(f"  Median: {np.median(d):.0f}")

        print(f"\nDistribution:")
        for dist in range(1, 8):
            n = np.count_nonzero(d == dist)
            print(f"    dist={dist}: {n:6d} ({n/len(d)*100:.1f}%)")
        n_far = np.count_nonzero(d > 7)
        print(f"    dist>7: {n_far:6d} ({n_far/len(d)*100:.1f}%)")

    if parent_pops:
        pp = np.array(parent_pops)
        pf = np.array(parent_foods)
        print(f"\nParent (same-owner) stats at founding:")
        print(f"  Population: mean={np.mean(pp):.3f}  p25={np.percentile(pp, 25):.3f}  p50={np.percentile(pp, 50):.3f}  p75={np.percentile(pp, 75):.3f}")
        print(f"  Food:       mean={np.mean(pf):.3f}  p25={np.percentile(pf, 25):.3f}  p50={np.percentile(pf, 50):.3f}  p75={np.percentile(pf, 75):.3f}")

        # Is there a minimum parent food for founding?
        print(f"\n  Min parent food at founding: {np.min(pf):.4f}")
        print(f"  P5 parent food: {np.percentile(pf, 5):.4f}")
        print(f"  P1 parent food: {np.percentile(pf, 1):.4f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 7 replay EDA")
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
        ("VV", analysis_collapse_threshold),
        ("WW", analysis_pop_growth),
        ("XX", analysis_food_delta),
        ("YY", analysis_port_preconditions),
        ("ZZ", analysis_defense_dynamics),
        ("AAA", analysis_wealth_dynamics),
        ("BBB", analysis_founding_distance_refined),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-7 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
