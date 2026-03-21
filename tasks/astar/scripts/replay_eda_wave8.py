"""Wave 8 EDA: ruin fate conditions, winter food loss, founding probability,
trade range, step-0 mechanics.

Run: uv run python scripts/replay_eda_wave8.py [--max-runs-per-seed N]
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
# CCC: Ruin Fate by Detailed Context
# ---------------------------------------------------------------------------

def analysis_ruin_fate_detailed(data):
    header("CCC. RUIN -> FOREST vs RUIN -> PLAINS (detailed conditions)")

    # What differentiates ruin->forest from ruin->plains?
    # Features: nearby forest count, nearby alive count, nearby same/diff owner,
    # distance to nearest alive, distance to nearest forest, initial terrain at position

    forest_feats = defaultdict(list)
    plains_feats = defaultdict(list)
    rebuild_feats = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
            for fi in range(len(run.frames) - 1):
                prev_g = run.frames[fi].grid
                curr_g = run.frames[fi + 1].grid
                h, w = prev_g.shape

                ruin_mask = prev_g == 3
                if not np.any(ruin_mask):
                    continue

                alive_positions = [(s.y, s.x) for s in run.frames[fi].settlements if s.alive]

                ruin_ys, ruin_xs = np.where(ruin_mask)
                for ry, rx in zip(ruin_ys, ruin_xs):
                    next_code = int(curr_g[ry, rx])
                    if next_code == 3:
                        continue

                    if next_code == 4:
                        target = forest_feats
                    elif next_code in (0, 11):
                        target = plains_feats
                    elif next_code in (1, 2):
                        target = rebuild_feats
                    else:
                        continue

                    # 5x5 neighborhood
                    y0, y1 = max(0, ry - 2), min(h, ry + 3)
                    x0, x1 = max(0, rx - 2), min(w, rx + 3)
                    patch = prev_g[y0:y1, x0:x1]
                    init_patch = initial_grid[y0:y1, x0:x1]

                    target["nearby_forest_5x5"].append(int(np.count_nonzero(patch == 4)))
                    target["nearby_settlement_5x5"].append(int(np.count_nonzero(np.isin(patch, [1, 2]))))
                    target["nearby_ruin_5x5"].append(int(np.count_nonzero(patch == 3)) - 1)
                    target["nearby_plains_5x5"].append(int(np.count_nonzero(patch == 11)))
                    target["initial_was_forest"].append(1 if int(initial_grid[ry, rx]) == 4 else 0)
                    target["initial_forest_5x5"].append(int(np.count_nonzero(init_patch == 4)))

                    if alive_positions:
                        min_dist = min(abs(ry - ay) + abs(rx - ax) for ay, ax in alive_positions)
                    else:
                        min_dist = 99
                    target["dist_to_alive"].append(min_dist)
                    target["step"].append(fi)

    print("Ruin fate context comparison (mean values):\n")
    features = ["nearby_forest_5x5", "nearby_settlement_5x5", "nearby_ruin_5x5",
                "nearby_plains_5x5", "initial_was_forest", "initial_forest_5x5",
                "dist_to_alive", "step"]

    for feat in features:
        f_val = np.mean(forest_feats[feat]) if forest_feats[feat] else 0.0
        p_val = np.mean(plains_feats[feat]) if plains_feats[feat] else 0.0
        r_val = np.mean(rebuild_feats[feat]) if rebuild_feats[feat] else 0.0
        print(f"  {feat:>25}: forest={f_val:.3f}  plains={p_val:.3f}  rebuild={r_val:.3f}")

    # Key question: is initial_was_forest the driver?
    if forest_feats["initial_was_forest"] and plains_feats["initial_was_forest"]:
        f_was = np.mean(forest_feats["initial_was_forest"])
        p_was = np.mean(plains_feats["initial_was_forest"])
        print(f"\n  KEY: Was this cell initially forest?")
        print(f"    ruin->forest: {f_was:.3f}  ruin->plains: {p_was:.3f}")
        print(f"    (if ~1.0 vs ~0.0, initial terrain determines ruin fate)")


# ---------------------------------------------------------------------------
# DDD: Step 0 Detailed Mechanics
# ---------------------------------------------------------------------------

def analysis_step0_detail(data):
    header("DDD. STEP 0 DETAILED MECHANICS")

    # What exactly happens at step 0?
    # Are there births at step 0? Port gains? Owner flips?
    step0_births = 0
    step0_collapses = 0
    step0_port_gains = 0
    step0_owner_flips = 0
    step0_cell_changes_by_type = defaultdict(int)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            f0 = run.frames[0]
            f1 = run.frames[1]
            prev_idx = {(s.x, s.y): s for s in f0.settlements}
            curr_idx = {(s.x, s.y): s for s in f1.settlements}

            for pos in set(prev_idx) | set(curr_idx):
                p = prev_idx.get(pos)
                c = curr_idx.get(pos)
                pa = p is not None and p.alive
                ca = c is not None and c.alive

                if not pa and ca:
                    step0_births += 1
                if pa and not ca:
                    step0_collapses += 1
                if pa and ca:
                    if not p.has_port and c.has_port:
                        step0_port_gains += 1
                    if p.owner_id != c.owner_id and p.owner_id is not None and c.owner_id is not None:
                        step0_owner_flips += 1

            # Cell changes
            changed = f0.grid != f1.grid
            if np.any(changed):
                ch_y, ch_x = np.where(changed)
                for y, x in zip(ch_y, ch_x):
                    pc = int(f0.grid[y, x])
                    cc = int(f1.grid[y, x])
                    pn = INTERNAL_CODE_NAMES.get(pc, str(pc))
                    cn = INTERNAL_CODE_NAMES.get(cc, str(cc))
                    step0_cell_changes_by_type[f"{pn}->{cn}"] += 1

    n_runs = sum(len(r) for rd in data.values() for r in rd.values())
    print(f"Step 0 events (per run, n={n_runs}):")
    print(f"  Births:      {step0_births / n_runs:.3f}")
    print(f"  Collapses:   {step0_collapses / n_runs:.3f}")
    print(f"  Port gains:  {step0_port_gains / n_runs:.3f}")
    print(f"  Owner flips: {step0_owner_flips / n_runs:.3f}")

    print(f"\nCell change types at step 0:")
    for transition, count in sorted(step0_cell_changes_by_type.items(), key=lambda x: -x[1]):
        print(f"  {transition}: {count} ({count/n_runs:.3f}/run)")


# ---------------------------------------------------------------------------
# EEE: Founding Probability Model
# ---------------------------------------------------------------------------

def analysis_founding_probability(data):
    header("EEE. FOUNDING PROBABILITY MODEL")

    # For each alive settlement at each step, does it found a new settlement?
    # Features: pop, food, wealth, defense, has_port, step_mod_4, nearby_empty_land

    founded_feats = defaultdict(list)
    not_founded_feats = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                h, w = prev_frame.grid.shape
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                prev_alive = {(s.x, s.y): s for s in prev_frame.settlements if s.alive}

                # Find births and their parent (nearest same-owner)
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

                    # Find nearest same-owner parent
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

                # For each alive settlement, record whether it was a parent
                for pos, s in prev_alive.items():
                    if s.population is None or s.food is None:
                        continue

                    was_parent = pos in birth_parents
                    target = founded_feats if was_parent else not_founded_feats

                    target["pop"].append(s.population)
                    target["food"].append(s.food)
                    target["defense"].append(s.defense if s.defense else 0.0)
                    target["has_port"].append(1 if s.has_port else 0)
                    target["step_mod_4"].append(fi % 4)

                    # Count nearby empty land
                    x, y = pos
                    empty_count = 0
                    for dy in range(-2, 3):
                        for dx in range(-2, 3):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w:
                                code = int(prev_frame.grid[ny, nx])
                                if code in (4, 11):  # forest or plains
                                    empty_count += 1
                    target["nearby_empty"].append(empty_count)

    if not founded_feats["pop"]:
        return

    n_parents = len(founded_feats["pop"])
    n_non = len(not_founded_feats["pop"])
    base_rate = n_parents / (n_parents + n_non)
    print(f"Parent settlements: {n_parents}  Non-parents: {n_non}  Base rate: {base_rate:.4f}\n")

    for feat in ["pop", "food", "defense", "has_port", "nearby_empty"]:
        f = np.mean(founded_feats[feat])
        n = np.mean(not_founded_feats[feat])
        print(f"  {feat:>15}: parent={f:.3f}  non_parent={n:.3f}  diff={f-n:+.3f}")

    # Founding rate by step mod 4
    print(f"\nFounding rate by step mod 4:")
    for mod in range(4):
        parents_mod = sum(1 for m in founded_feats["step_mod_4"] if m == mod)
        non_mod = sum(1 for m in not_founded_feats["step_mod_4"] if m == mod)
        rate = parents_mod / max(1, parents_mod + non_mod)
        print(f"  mod {mod}: {rate:.4f} ({parents_mod}/{parents_mod+non_mod})")

    # Founding rate by population bucket
    print(f"\nFounding rate by parent population:")
    all_pops = np.array(founded_feats["pop"] + not_founded_feats["pop"])
    all_labels = np.array([1] * n_parents + [0] * n_non)
    for low, high in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 10.0)]:
        mask = (all_pops >= low) & (all_pops < high)
        if np.any(mask):
            rate = np.mean(all_labels[mask])
            print(f"  pop [{low:.1f}, {high:.1f}): rate={rate:.4f}  n={np.sum(mask)}")

    # Founding rate by food bucket
    print(f"\nFounding rate by parent food:")
    all_foods = np.array(founded_feats["food"] + not_founded_feats["food"])
    for low, high in [(0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.9), (0.9, 1.01)]:
        mask = (all_foods >= low) & (all_foods < high)
        if np.any(mask):
            rate = np.mean(all_labels[mask])
            print(f"  food [{low:.1f}, {high:.1f}): rate={rate:.4f}  n={np.sum(mask)}")


# ---------------------------------------------------------------------------
# FFF: Per-Round Collapse Rate
# ---------------------------------------------------------------------------

def analysis_per_round_collapse(data):
    header("FFF. PER-ROUND COLLAPSE RATE")

    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        total = 0
        collapsed = 0
        for seed_index, runs in seeds.items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    for pos in prev_idx:
                        p = prev_idx[pos]
                        if p.alive:
                            total += 1
                            c = curr_idx.get(pos)
                            if c is None or not c.alive:
                                collapsed += 1
        rate = collapsed / max(1, total)
        print(f"  {round_id[:8]}.. : collapse_rate={rate:.4f}  ({collapsed}/{total})")


# ---------------------------------------------------------------------------
# GGG: What Makes Settlements Gain Defense?
# ---------------------------------------------------------------------------

def analysis_defense_gain(data):
    header("GGG. DEFENSE GAIN MECHANICS")

    # When defense increases, what are the conditions?
    gained_feats = defaultdict(list)
    no_gain_feats = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.defense is None or c.defense is None:
                        continue

                    dd = c.defense - p.defense
                    gained = dd > 0.001
                    target = gained_feats if gained else no_gain_feats

                    target["pop"].append(p.population if p.population else 0)
                    target["food"].append(p.food if p.food else 0)
                    target["wealth"].append(p.wealth if p.wealth else 0)
                    target["defense"].append(p.defense)
                    target["has_port"].append(1 if p.has_port else 0)

    if gained_feats["pop"]:
        total = len(gained_feats["pop"]) + len(no_gain_feats["pop"])
        rate = len(gained_feats["pop"]) / total
        print(f"Defense gain rate: {rate:.4f}\n")

        for feat in ["pop", "food", "wealth", "defense", "has_port"]:
            g = np.mean(gained_feats[feat])
            n = np.mean(no_gain_feats[feat])
            print(f"  {feat:>8}: gained={g:.4f}  no_gain={n:.4f}  diff={g-n:+.4f}")


# ---------------------------------------------------------------------------
# HHH: Terminal State Probabilities per Cell Position
# ---------------------------------------------------------------------------

def analysis_position_terminal(data):
    header("HHH. TERMINAL STATE BY POSITION (corner/edge/center)")

    # Compare terminal class distribution at corners, edges, center
    corner_counts = np.zeros(CLASS_COUNT, dtype=np.int64)
    edge_counts = np.zeros(CLASS_COUNT, dtype=np.int64)
    center_counts = np.zeros(CLASS_COUNT, dtype=np.int64)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            tg = collapse_internal_grid(run.frames[-1].grid)
            h, w = tg.shape

            for y in range(h):
                for x in range(w):
                    tc = int(tg[y, x])
                    is_corner = (y < 3 or y >= h - 3) and (x < 3 or x >= w - 3)
                    is_edge = not is_corner and (y < 3 or y >= h - 3 or x < 3 or x >= w - 3)

                    if is_corner:
                        corner_counts[tc] += 1
                    elif is_edge:
                        edge_counts[tc] += 1
                    else:
                        center_counts[tc] += 1

    print("Terminal class distribution by position:\n")
    for label, counts in [("Corner", corner_counts), ("Edge", edge_counts), ("Center", center_counts)]:
        total = counts.sum()
        probs = counts / max(1, total)
        prob_str = "  ".join(f"{CLASS_NAMES[c][:5]}={probs[c]:.3f}" for c in range(CLASS_COUNT))
        print(f"  {label:>8}: {prob_str}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 8 replay EDA")
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
        ("CCC", analysis_ruin_fate_detailed),
        ("DDD", analysis_step0_detail),
        ("EEE", analysis_founding_probability),
        ("FFF", analysis_per_round_collapse),
        ("GGG", analysis_defense_gain),
        ("HHH", analysis_position_terminal),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-8 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
