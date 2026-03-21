"""Wave 13 EDA: per-round newborn stats, conquest model, stochastic cell correlations,
most variable cells analysis, settlement density at different time horizons.

Run: uv run python scripts/replay_eda_wave13.py [--max-runs-per-seed N]
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
# GGGG: Per-Round Newborn Stats
# ---------------------------------------------------------------------------

def analysis_per_round_newborn(data):
    header("GGGG. PER-ROUND NEWBORN STATS (do starting stats vary by round?)")

    for round_id in sorted(data.keys()):
        newborn_pop = []
        newborn_food = []
        newborn_defense = []

        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    for pos, s in curr_idx.items():
                        if not s.alive:
                            continue
                        prev_s = prev_idx.get(pos)
                        if prev_s is not None and prev_s.alive:
                            continue
                        pc = int(run.frames[fi].grid[pos[1], pos[0]])
                        if pc == 3:
                            continue  # rebuild
                        if s.population is not None:
                            newborn_pop.append(s.population)
                        if s.food is not None:
                            newborn_food.append(s.food)
                        if s.defense is not None:
                            newborn_defense.append(s.defense)

        if newborn_pop:
            pp = np.array(newborn_pop)
            pf = np.array(newborn_food)
            pd = np.array(newborn_defense)
            print(f"  {round_id[:8]}.. (n={len(pp):5d}): "
                  f"pop={np.mean(pp):.4f}±{np.std(pp):.4f}  "
                  f"food={np.mean(pf):.4f}±{np.std(pf):.4f}  "
                  f"def={np.mean(pd):.4f}±{np.std(pd):.4f}  "
                  f"def_unique={sorted(set(np.round(pd, 4)))}")


# ---------------------------------------------------------------------------
# HHHH: Conquest Probability Model
# ---------------------------------------------------------------------------

def analysis_conquest_model(data):
    header("HHHH. CONQUEST PROBABILITY MODEL")

    # For each pair of adjacent settlements (different owner), does conquest happen?
    conquered_feats = defaultdict(list)
    not_conquered_feats = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(min(len(run.frames) - 1, 50)):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                prev_alive = {(s.x, s.y): s for s in run.frames[fi].settlements if s.alive}

                for pos in prev_idx:
                    p = prev_idx[pos]
                    if not p.alive or p.owner_id is None:
                        continue
                    c = curr_idx.get(pos)
                    if c is None or not c.alive:
                        continue
                    if c.owner_id is None:
                        continue

                    flipped = p.owner_id != c.owner_id

                    # Find nearest enemy
                    x, y = pos
                    min_enemy_dist = float('inf')
                    nearest_enemy = None
                    for epos, enemy in prev_alive.items():
                        if enemy.owner_id is not None and enemy.owner_id != p.owner_id:
                            d = abs(epos[0] - x) + abs(epos[1] - y)
                            if d < min_enemy_dist:
                                min_enemy_dist = d
                                nearest_enemy = enemy

                    if nearest_enemy is None or min_enemy_dist > 5:
                        continue  # no nearby enemy

                    target = conquered_feats if flipped else not_conquered_feats
                    target["defender_pop"].append(p.population if p.population else 0)
                    target["defender_food"].append(p.food if p.food else 0)
                    target["defender_defense"].append(p.defense if p.defense else 0)
                    target["enemy_pop"].append(nearest_enemy.population if nearest_enemy.population else 0)
                    target["enemy_defense"].append(nearest_enemy.defense if nearest_enemy.defense else 0)
                    target["distance"].append(min_enemy_dist)
                    target["pop_ratio"].append(
                        (nearest_enemy.population or 0.01) / max(0.01, p.population or 0.01)
                    )
                    target["defense_ratio"].append(
                        (nearest_enemy.defense or 0.01) / max(0.01, p.defense or 0.01)
                    )

    n_con = len(conquered_feats["defender_pop"])
    n_not = len(not_conquered_feats["defender_pop"])
    base_rate = n_con / max(1, n_con + n_not)
    print(f"Settlements with enemy within 5 cells: conquered={n_con} not={n_not} rate={base_rate:.4f}\n")

    for feat in ["defender_pop", "defender_food", "defender_defense",
                  "enemy_pop", "enemy_defense", "distance", "pop_ratio", "defense_ratio"]:
        c = np.mean(conquered_feats[feat]) if conquered_feats[feat] else 0
        n = np.mean(not_conquered_feats[feat]) if not_conquered_feats[feat] else 0
        print(f"  {feat:>18}: conquered={c:.4f}  not_conquered={n:.4f}  diff={c-n:+.4f}")

    # Conquest rate by pop ratio
    print(f"\nConquest rate by pop ratio (enemy/defender):")
    all_ratios = np.array(conquered_feats["pop_ratio"] + not_conquered_feats["pop_ratio"])
    all_labels = np.array([1.0] * n_con + [0.0] * n_not)
    for low, high in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 100.0)]:
        mask = (all_ratios >= low) & (all_ratios < high)
        if np.any(mask):
            rate = np.mean(all_labels[mask])
            n = np.sum(mask)
            print(f"  ratio [{low:.1f}, {high:.1f}): rate={rate:.4f}  n={n}")

    # Conquest rate by defense ratio
    print(f"\nConquest rate by defense ratio (enemy/defender):")
    all_def_ratios = np.array(conquered_feats["defense_ratio"] + not_conquered_feats["defense_ratio"])
    for low, high in [(0, 0.5), (0.5, 1.0), (1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 100.0)]:
        mask = (all_def_ratios >= low) & (all_def_ratios < high)
        if np.any(mask):
            rate = np.mean(all_labels[mask])
            n = np.sum(mask)
            print(f"  ratio [{low:.1f}, {high:.1f}): rate={rate:.4f}  n={n}")


# ---------------------------------------------------------------------------
# IIII: Which Cells Are Most Variable?
# ---------------------------------------------------------------------------

def analysis_most_variable_cells(data):
    header("IIII. WHICH CELLS ARE MOST VARIABLE ACROSS STOCHASTIC RUNS?")

    # For each seed, find the cells with highest entropy
    # and characterize their initial properties
    high_ent_codes = defaultdict(int)
    low_ent_codes = defaultdict(int)
    high_ent_dist = []
    low_ent_dist = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            N = len(runs)
            init_pos = [(s.y, s.x) for s in runs[0].frames[0].settlements if s.alive]

            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)

            entropies = np.zeros((h, w))
            for y in range(h):
                for x in range(w):
                    counts = np.bincount(terminal_grids[:, y, x], minlength=CLASS_COUNT).astype(np.float64)
                    probs = counts / N
                    probs = probs[probs > 0]
                    entropies[y, x] = -float(np.sum(probs * np.log2(probs)))

            # Top 5% entropy cells
            threshold = np.percentile(entropies[entropies > 0], 95) if np.any(entropies > 0) else 1.0
            low_threshold = np.percentile(entropies[entropies > 0], 25) if np.any(entropies > 0) else 0.0

            for y in range(h):
                for x in range(w):
                    if entropies[y, x] >= threshold:
                        high_ent_codes[int(initial[y, x])] += 1
                        if init_pos:
                            high_ent_dist.append(min(abs(y - sy) + abs(x - sx) for sy, sx in init_pos))
                    elif 0 < entropies[y, x] <= low_threshold:
                        low_ent_codes[int(initial[y, x])] += 1
                        if init_pos:
                            low_ent_dist.append(min(abs(y - sy) + abs(x - sx) for sy, sx in init_pos))

    print("Initial terrain of high-entropy (top 5%) cells:")
    code_names = {0: "empty", 1: "settlement", 2: "port", 3: "ruin",
                  4: "forest", 5: "mountain", 10: "ocean", 11: "plains"}
    total_high = sum(high_ent_codes.values())
    for code in sorted(high_ent_codes.keys()):
        name = code_names.get(code, str(code))
        count = high_ent_codes[code]
        print(f"  {name:>12}: {count:5d} ({count/max(1,total_high)*100:.1f}%)")

    print(f"\nInitial terrain of low-entropy (bottom 25% of nonzero) cells:")
    total_low = sum(low_ent_codes.values())
    for code in sorted(low_ent_codes.keys()):
        name = code_names.get(code, str(code))
        count = low_ent_codes[code]
        print(f"  {name:>12}: {count:5d} ({count/max(1,total_low)*100:.1f}%)")

    if high_ent_dist:
        print(f"\nDistance to nearest initial settlement:")
        print(f"  High entropy: mean={np.mean(high_ent_dist):.2f}  median={np.median(high_ent_dist):.0f}")
        print(f"  Low entropy:  mean={np.mean(low_ent_dist):.2f}  median={np.median(low_ent_dist):.0f}")


# ---------------------------------------------------------------------------
# JJJJ: Settlement Alive Count at Key Horizons Per Round
# ---------------------------------------------------------------------------

def analysis_alive_horizons(data):
    header("JJJJ. SETTLEMENT ALIVE COUNT AT KEY TIME HORIZONS")

    horizons = [10, 20, 30, 40, 50]
    print(f"{'Round':>12}  " + "  ".join(f"{'Y' + str(h):>8}" for h in horizons))
    print("-" * 60)

    for round_id in sorted(data.keys()):
        all_runs = [r for sd in data[round_id].values() for r in sd]
        if not all_runs:
            continue

        means = []
        for h in horizons:
            alive = [
                sum(1 for s in run.frames[h].settlements if s.alive)
                for run in all_runs if h < len(run.frames)
            ]
            means.append(np.mean(alive) if alive else 0)

        print(f"{round_id[:12]:>12}  " + "  ".join(f"{m:8.1f}" for m in means))


# ---------------------------------------------------------------------------
# KKKK: Per-Round Ruin->Forest vs Decay Rate (is reclamation a hidden param?)
# ---------------------------------------------------------------------------

def analysis_reclamation_param(data):
    header("KKKK. IS FOREST RECLAMATION RATE A HIDDEN PARAMETER?")

    # Compute ruin->forest / (ruin->forest + ruin->plains) per round
    # (excluding rebuilds to focus on the forest/plains split)

    for round_id in sorted(data.keys()):
        r_to_f = 0
        r_to_p = 0

        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_g = run.frames[fi].grid
                    curr_g = run.frames[fi + 1].grid
                    ruin_mask = prev_g == 3
                    if not np.any(ruin_mask):
                        continue
                    curr_at_ruin = curr_g[ruin_mask]
                    r_to_f += int(np.count_nonzero(curr_at_ruin == 4))
                    r_to_p += int(np.count_nonzero(np.isin(curr_at_ruin, [0, 11])))

        total = r_to_f + r_to_p
        if total > 0:
            forest_share = r_to_f / total
            print(f"  {round_id[:8]}.. : forest/(forest+plains)={forest_share:.3f}  "
                  f"(forest={r_to_f}, plains={r_to_p}, total={total})")


# ---------------------------------------------------------------------------
# LLLL: Food at Birth by Round (is newborn food a hidden param?)
# ---------------------------------------------------------------------------

def analysis_birth_food_by_round(data):
    header("LLLL. NEWBORN FOOD BY ROUND (is starting food regime-dependent?)")

    for round_id in sorted(data.keys()):
        foods = []
        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    for pos, s in curr_idx.items():
                        if not s.alive:
                            continue
                        prev_s = prev_idx.get(pos)
                        if prev_s is not None and prev_s.alive:
                            continue
                        pc = int(run.frames[fi].grid[pos[1], pos[0]])
                        if pc == 3:
                            continue
                        if s.food is not None:
                            foods.append(s.food)

        if foods:
            arr = np.array(foods)
            pcts = np.percentile(arr, [5, 25, 50, 75, 95])
            print(f"  {round_id[:8]}.. (n={len(arr):5d}): "
                  f"mean={np.mean(arr):.4f}  std={np.std(arr):.4f}  "
                  f"p5={pcts[0]:.4f}  p50={pcts[2]:.4f}  p95={pcts[4]:.4f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 13 replay EDA")
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
        ("GGGG", analysis_per_round_newborn),
        ("HHHH", analysis_conquest_model),
        ("IIII", analysis_most_variable_cells),
        ("JJJJ", analysis_alive_horizons),
        ("KKKK", analysis_reclamation_param),
        ("LLLL", analysis_birth_food_by_round),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-13 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
