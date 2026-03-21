"""Wave 5 EDA: ruin verification, stat bounds, per-round entropy, deep patterns.

Run: uv run python scripts/replay_eda_wave5.py [--max-runs-per-seed N]
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


def table(headers, rows):
    widths = [len(h) for h in headers]
    str_rows = []
    for row in rows:
        s = [f"{c:.4f}" if isinstance(c, float) else str(c) for c in row]
        for i, v in enumerate(s):
            widths[i] = max(widths[i], len(v))
        str_rows.append(s)
    print("  ".join(h.rjust(w) for h, w in zip(headers, widths)))
    print("-" * sum(widths) + "-" * (2 * (len(widths) - 1)))
    for sr in str_rows:
        print("  ".join(s.rjust(w) for s, w in zip(sr, widths)))


# ---------------------------------------------------------------------------
# DD: Ruin Duration Double-Check with Grid Inspection
# ---------------------------------------------------------------------------

def analysis_ruin_verify(data):
    header("DD. RUIN DURATION VERIFICATION (grid-level)")

    # Track at the grid level: for any cell that is code 3 at step t,
    # is it still code 3 at step t+1?
    ruin_persisted = 0
    ruin_transitioned = 0
    ruin_at_terminal = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                ruin_mask = run.frames[fi].grid == 3
                if not np.any(ruin_mask):
                    continue
                next_grid = run.frames[fi + 1].grid
                still_ruin = np.count_nonzero(ruin_mask & (next_grid == 3))
                transitioned = np.count_nonzero(ruin_mask & (next_grid != 3))
                ruin_persisted += int(still_ruin)
                ruin_transitioned += int(transitioned)

            # Ruin count at terminal frame
            ruin_at_terminal += int(np.count_nonzero(run.frames[-1].grid == 3))

    total = ruin_persisted + ruin_transitioned
    print(f"Total ruin cell-steps observed: {total}")
    print(f"  Persisted to next step: {ruin_persisted} ({ruin_persisted/max(1,total)*100:.2f}%)")
    print(f"  Transitioned: {ruin_transitioned} ({ruin_transitioned/max(1,total)*100:.2f}%)")
    print(f"\nRuin cells at terminal frame (year 50): {ruin_at_terminal}")
    print(f"  (these are ruins that appeared at step 49->50 and had no next step to transition)")

    if ruin_persisted > 0:
        print(f"\n  WARNING: {ruin_persisted} ruin cells persisted -- finding specific cases:")
        count = 0
        for rd in data.values():
            for sd in rd.values():
                for run in sd:
                    for fi in range(len(run.frames) - 1):
                        ruin_mask = run.frames[fi].grid == 3
                        next_grid = run.frames[fi + 1].grid
                        still = ruin_mask & (next_grid == 3)
                        if np.any(still):
                            ys, xs = np.where(still)
                            for y, x in zip(ys[:3], xs[:3]):
                                print(f"    Round={run.round_id[:8]} seed={run.seed_index} "
                                      f"step={fi} ({y},{x}): code3->code3")
                                count += 1
                            if count >= 10:
                                return
    else:
        print(f"\n  CONFIRMED: ruins NEVER persist beyond 1 step.")


# ---------------------------------------------------------------------------
# EE: Settlement Stat Bounds
# ---------------------------------------------------------------------------

def analysis_stat_bounds(data):
    header("EE. SETTLEMENT STAT BOUNDS (absolute min/max)")

    pop_min, pop_max = float('inf'), float('-inf')
    food_min, food_max = float('inf'), float('-inf')
    wealth_min, wealth_max = float('inf'), float('-inf')
    defense_min, defense_max = float('inf'), float('-inf')

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for frame in run.frames:
                for s in frame.settlements:
                    if not s.alive:
                        continue
                    if s.population is not None:
                        pop_min = min(pop_min, s.population)
                        pop_max = max(pop_max, s.population)
                    if s.food is not None:
                        food_min = min(food_min, s.food)
                        food_max = max(food_max, s.food)
                    if s.wealth is not None:
                        wealth_min = min(wealth_min, s.wealth)
                        wealth_max = max(wealth_max, s.wealth)
                    if s.defense is not None:
                        defense_min = min(defense_min, s.defense)
                        defense_max = max(defense_max, s.defense)

    print(f"Absolute stat bounds across all alive settlements in all frames:\n")
    rows = [
        ["population", f"{pop_min:.6f}", f"{pop_max:.6f}"],
        ["food", f"{food_min:.6f}", f"{food_max:.6f}"],
        ["wealth", f"{wealth_min:.6f}", f"{wealth_max:.6f}"],
        ["defense", f"{defense_min:.6f}", f"{defense_max:.6f}"],
    ]
    table(["Stat", "Min", "Max"], rows)

    print(f"\nLikely caps: food=[0,1], defense=[0,1], wealth=[0,?], population=[0,?]")


# ---------------------------------------------------------------------------
# FF: Per-Round Entropy Analysis
# ---------------------------------------------------------------------------

def analysis_per_round_entropy(data):
    header("FF. PER-ROUND STOCHASTIC ENTROPY")

    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        round_entropies = []
        round_det_fracs = []

        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue
            N = len(runs)
            h, w = runs[0].frames[0].grid.shape
            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)

            for y in range(h):
                for x in range(w):
                    counts = np.bincount(terminal_grids[:, y, x], minlength=CLASS_COUNT).astype(np.float64)
                    probs = counts / N
                    probs = probs[probs > 0]
                    ent = -float(np.sum(probs * np.log2(probs)))
                    round_entropies.append(ent)
                    if ent == 0:
                        round_det_fracs.append(1.0)
                    else:
                        round_det_fracs.append(0.0)

        if round_entropies:
            ea = np.array(round_entropies)
            df = np.mean(round_det_fracs)
            print(f"  {round_id[:8]}.. : mean_ent={np.mean(ea):.4f}  "
                  f"det_frac={df:.3f}  p95_ent={np.percentile(ea, 95):.4f}")


# ---------------------------------------------------------------------------
# GG: Initial Port Behavior
# ---------------------------------------------------------------------------

def analysis_initial_ports(data):
    header("GG. INITIAL PORT BEHAVIOR")

    initial_port_survived = 0
    initial_port_total = 0
    port_still_port = 0
    port_became_ruin = 0
    port_became_other = 0
    initial_port_lifespan = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_ports = {(s.x, s.y) for s in run.frames[0].settlements if s.has_port and s.alive}
            initial_port_total += len(initial_ports)

            for pos in initial_ports:
                # Track lifespan as a port
                lifespan = 0
                for fi in range(len(run.frames)):
                    found = False
                    for s in run.frames[fi].settlements:
                        if (s.x, s.y) == pos and s.alive and s.has_port:
                            found = True
                            break
                    if found:
                        lifespan += 1
                    else:
                        break
                initial_port_lifespan.append(lifespan)

                # Check terminal
                terminal_code = int(run.frames[-1].grid[pos[1], pos[0]])
                if terminal_code == 2:
                    port_still_port += 1
                    initial_port_survived += 1
                elif terminal_code == 1:
                    initial_port_survived += 1  # still alive but lost port
                elif terminal_code == 3:
                    port_became_ruin += 1

    print(f"Initial ports (at t=0): {initial_port_total}")
    print(f"  Still a port at t=50: {port_still_port} ({port_still_port/max(1,initial_port_total)*100:.1f}%)")
    print(f"  Alive at t=50 (port or settlement): {initial_port_survived} ({initial_port_survived/max(1,initial_port_total)*100:.1f}%)")

    if initial_port_lifespan:
        ls = np.array(initial_port_lifespan)
        print(f"\nInitial port lifespan (as port):")
        print(f"  Mean: {np.mean(ls):.1f}, Median: {np.median(ls):.0f}")
        print(f"  Min: {np.min(ls)}, Max: {np.max(ls)}")


# ---------------------------------------------------------------------------
# HH: Plains vs Forest - do settlements on forest vs plains behave differently?
# ---------------------------------------------------------------------------

def analysis_terrain_settlement_fate(data):
    header("HH. SETTLEMENT FATE BY FOUNDING TERRAIN")

    # Track settlements founded on plains vs forest and see if they survive differently
    plains_births = 0
    plains_survived_5 = 0
    forest_births = 0
    forest_survived_5 = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
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
                    prev_code = int(run.frames[fi].grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue  # rebuild

                    is_plains = prev_code == 11
                    is_forest = prev_code == 4

                    if not is_plains and not is_forest:
                        continue

                    # Check if still alive 5 steps later
                    survived = False
                    check_step = min(fi + 6, len(run.frames) - 1)
                    for s2 in run.frames[check_step].settlements:
                        if (s2.x, s2.y) == pos and s2.alive:
                            survived = True
                            break

                    if is_plains:
                        plains_births += 1
                        if survived:
                            plains_survived_5 += 1
                    else:
                        forest_births += 1
                        if survived:
                            forest_survived_5 += 1

    print(f"Settlements founded on plains: {plains_births}")
    print(f"  Survived 5+ years: {plains_survived_5} ({plains_survived_5/max(1,plains_births)*100:.1f}%)")
    print(f"Settlements founded on forest: {forest_births}")
    print(f"  Survived 5+ years: {forest_survived_5} ({forest_survived_5/max(1,forest_births)*100:.1f}%)")


# ---------------------------------------------------------------------------
# II: Terminal Class Distribution Conditioned on Initial Class
# ---------------------------------------------------------------------------

def analysis_terminal_given_initial(data):
    header("II. TERMINAL CLASS DISTRIBUTION | INITIAL CLASS")

    # For each initial internal code, compute P(terminal scored class)
    transition_counts = defaultdict(lambda: np.zeros(CLASS_COUNT, dtype=np.int64))

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            for run in runs:
                initial = run.frames[0].grid
                terminal = collapse_internal_grid(run.frames[-1].grid)
                h, w = initial.shape
                for y in range(h):
                    for x in range(w):
                        ic = int(initial[y, x])
                        tc = int(terminal[y, x])
                        transition_counts[ic][tc] += 1

    print("P(terminal scored class | initial internal code):\n")
    for ic in sorted(transition_counts.keys()):
        counts = transition_counts[ic]
        total = counts.sum()
        probs = counts / max(1, total)
        name = INTERNAL_CODE_NAMES.get(ic, str(ic))
        prob_str = "  ".join(f"{CLASS_NAMES[c][:5]}={probs[c]:.4f}" for c in range(CLASS_COUNT))
        print(f"  {name:>10} (n={total:7d}): {prob_str}")


# ---------------------------------------------------------------------------
# JJ: Do Multiple Collapses Happen at the Same Step?
# ---------------------------------------------------------------------------

def analysis_collapse_clustering(data):
    header("JJ. COLLAPSE CLUSTERING (do mass die-offs happen?)")

    collapses_per_step = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                collapse_count = 0
                for pos in prev_idx:
                    p = prev_idx[pos]
                    c = curr_idx.get(pos)
                    if p.alive and (c is None or not c.alive):
                        collapse_count += 1
                collapses_per_step.append(collapse_count)

    if collapses_per_step:
        cs = np.array(collapses_per_step)
        print(f"Collapses per step distribution:")
        print(f"  Mean: {np.mean(cs):.2f}, Std: {np.std(cs):.2f}")
        print(f"  Max: {np.max(cs)}")
        print(f"  P(0 collapses): {np.count_nonzero(cs == 0)/len(cs)*100:.1f}%")
        print(f"  P(>=5 collapses): {np.count_nonzero(cs >= 5)/len(cs)*100:.1f}%")
        print(f"  P(>=10 collapses): {np.count_nonzero(cs >= 10)/len(cs)*100:.1f}%")
        print(f"  P(>=20 collapses): {np.count_nonzero(cs >= 20)/len(cs)*100:.1f}%")

        # Are collapses correlated across consecutive steps?
        if len(cs) > 1:
            # Reshape into runs of 50
            autocorr_lag1s = []
            for i in range(0, len(cs) - 50, 50):
                run_cs = cs[i:i+50].astype(np.float64)
                if np.std(run_cs) > 0:
                    autocorr_lag1s.append(float(np.corrcoef(run_cs[:-1], run_cs[1:])[0, 1]))
            if autocorr_lag1s:
                print(f"\nLag-1 autocorrelation of collapse count: {np.mean(autocorr_lag1s):.3f}")
                print(f"  (positive = cascading collapses, negative = alternating)")


# ---------------------------------------------------------------------------
# KK: Settlement Stats at New Births
# ---------------------------------------------------------------------------

def analysis_birth_stats(data):
    header("KK. NEWBORN SETTLEMENT STATS")

    newborn_pop = []
    newborn_food = []
    newborn_wealth = []
    newborn_defense = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
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
                    prev_code = int(run.frames[fi].grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue  # rebuild, not birth

                    if s.population is not None:
                        newborn_pop.append(s.population)
                    if s.food is not None:
                        newborn_food.append(s.food)
                    if s.wealth is not None:
                        newborn_wealth.append(s.wealth)
                    if s.defense is not None:
                        newborn_defense.append(s.defense)

    if newborn_pop:
        print(f"Newborn settlement stats (n={len(newborn_pop)}):\n")
        for name, vals in [("population", newborn_pop), ("food", newborn_food),
                           ("wealth", newborn_wealth), ("defense", newborn_defense)]:
            arr = np.array(vals)
            pcts = np.percentile(arr, [5, 25, 50, 75, 95])
            print(f"  {name:>10}: mean={np.mean(arr):.4f}  std={np.std(arr):.4f}  "
                  f"p5={pcts[0]:.4f}  p50={pcts[2]:.4f}  p95={pcts[4]:.4f}")
            # Check if values are constant or variable
            unique = np.unique(np.round(arr, 6))
            if len(unique) <= 10:
                print(f"             unique values: {unique}")


# ---------------------------------------------------------------------------
# LL: Rebuild Stats (ruin -> settlement)
# ---------------------------------------------------------------------------

def analysis_rebuild_stats(data):
    header("LL. REBUILT SETTLEMENT STATS (ruin -> settlement)")

    rebuilt_pop = []
    rebuilt_food = []
    rebuilt_defense = []
    rebuilt_owner_same_as_prev = 0
    rebuilt_owner_diff = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}

                for pos, s in curr_idx.items():
                    if not s.alive:
                        continue
                    prev_code = int(prev_frame.grid[pos[1], pos[0]])
                    if prev_code != 3:
                        continue  # not a rebuild

                    if s.population is not None:
                        rebuilt_pop.append(s.population)
                    if s.food is not None:
                        rebuilt_food.append(s.food)
                    if s.defense is not None:
                        rebuilt_defense.append(s.defense)

                    # Check if owner matches what was there before the ruin
                    # Look back 2 frames for the pre-collapse settlement
                    if fi >= 1:
                        pre_ruin_frame = run.frames[fi - 1]
                        pre_idx = {(ss.x, ss.y): ss for ss in pre_ruin_frame.settlements}
                        pre_s = pre_idx.get(pos)
                        if pre_s is not None and pre_s.owner_id is not None and s.owner_id is not None:
                            if pre_s.owner_id == s.owner_id:
                                rebuilt_owner_same_as_prev += 1
                            else:
                                rebuilt_owner_diff += 1

    if rebuilt_pop:
        print(f"Rebuilt settlements (n={len(rebuilt_pop)}):\n")
        for name, vals in [("population", rebuilt_pop), ("food", rebuilt_food), ("defense", rebuilt_defense)]:
            arr = np.array(vals)
            print(f"  {name:>10}: mean={np.mean(arr):.4f}  std={np.std(arr):.4f}  "
                  f"min={np.min(arr):.4f}  max={np.max(arr):.4f}")

    total_owner = rebuilt_owner_same_as_prev + rebuilt_owner_diff
    if total_owner > 0:
        print(f"\nRebuilt by same owner as pre-collapse: {rebuilt_owner_same_as_prev}/{total_owner} "
              f"({rebuilt_owner_same_as_prev/total_owner*100:.1f}%)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 5 replay EDA")
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
        ("DD", analysis_ruin_verify),
        ("EE", analysis_stat_bounds),
        ("FF", analysis_per_round_entropy),
        ("GG", analysis_initial_ports),
        ("HH", analysis_terrain_settlement_fate),
        ("II", analysis_terminal_given_initial),
        ("JJ", analysis_collapse_clustering),
        ("KK", analysis_birth_stats),
        ("LL", analysis_rebuild_stats),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-5 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
