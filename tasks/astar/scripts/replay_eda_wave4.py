"""Wave 4 EDA: micro-mechanics, food model, network effects, ruin timing.

Run: uv run python scripts/replay_eda_wave4.py [--max-runs-per-seed N]
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.terrain import collapse_internal_grid, CLASS_COUNT
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
        sc = len(data[round_id])
        rc = sum(len(v) for v in data[round_id].values())
        print(f"  Loaded round {round_id[:8]}.. : {sc} seeds, {rc} runs")
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
# Analysis T: Food Production vs. Terrain Neighbors
# ---------------------------------------------------------------------------

def analysis_food_terrain(data):
    header("T. FOOD PRODUCTION VS TERRAIN NEIGHBORS")

    # For each alive settlement, compute food delta and count terrain types in 3x3 neighborhood
    terrain_counts = {code: [] for code in INTERNAL_CODE_NAMES}
    food_deltas_all = []

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
                    fd = c.food - p.food
                    food_deltas_all.append(fd)

                    x, y = pos
                    y0, y1 = max(0, y-1), min(h, y+2)
                    x0, x1 = max(0, x-1), min(w, x+2)
                    patch = prev_frame.grid[y0:y1, x0:x1]
                    for code in INTERNAL_CODE_NAMES:
                        terrain_counts[code].append(int(np.count_nonzero(patch == code)))

    # Compute correlation between each terrain neighbor count and food delta
    food_arr = np.array(food_deltas_all)
    print(f"Total settlement-step observations: {len(food_arr)}\n")
    print("Correlation between neighbor terrain count (3x3) and food delta:\n")

    rows = []
    for code in sorted(INTERNAL_CODE_NAMES.keys()):
        name = INTERNAL_CODE_NAMES[code]
        tc = np.array(terrain_counts[code], dtype=np.float64)
        if np.std(tc) < 1e-9:
            r = 0.0
        else:
            r = float(np.corrcoef(tc, food_arr)[0, 1])

        # Also: mean food delta when count > 0 vs count == 0
        has_terrain = tc > 0
        if np.any(has_terrain) and np.any(~has_terrain):
            mean_with = float(np.mean(food_arr[has_terrain]))
            mean_without = float(np.mean(food_arr[~has_terrain]))
        else:
            mean_with = mean_without = 0.0

        rows.append([str(code), name, f"{np.mean(tc):.2f}", f"{r:+.4f}", f"{mean_with:+.4f}", f"{mean_without:+.4f}"])
    table(["Code", "Name", "MeanCount", "Corr", "FoodDelta(has)", "FoodDelta(no)"], rows)


# ---------------------------------------------------------------------------
# Analysis U: Ruin Duration
# ---------------------------------------------------------------------------

def analysis_ruin_duration(data):
    header("U. RUIN DURATION (how long do ruins persist?)")

    ruin_durations = []
    ruin_outcomes = defaultdict(list)  # fate -> list of durations

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            h, w = run.frames[0].grid.shape
            # Track when each cell becomes a ruin and when it stops being a ruin
            ruin_start = np.full((h, w), -1, dtype=np.int32)

            for fi in range(len(run.frames)):
                grid = run.frames[fi].grid
                is_ruin = grid == 3

                # New ruins
                new_ruin = is_ruin & (ruin_start < 0)
                ruin_start[new_ruin] = fi

                # Ruins that ended
                ended = ~is_ruin & (ruin_start >= 0)
                if np.any(ended):
                    ends_y, ends_x = np.where(ended)
                    for y, x in zip(ends_y, ends_x):
                        duration = fi - ruin_start[y, x]
                        ruin_durations.append(duration)
                        next_code = int(grid[y, x])
                        if next_code in (1, 2):
                            ruin_outcomes["rebuild"].append(duration)
                        elif next_code == 4:
                            ruin_outcomes["forest"].append(duration)
                        else:
                            ruin_outcomes["decay"].append(duration)
                    ruin_start[ended] = -1

            # Ruins still active at end
            still_ruin = ruin_start >= 0
            if np.any(still_ruin):
                sr_y, sr_x = np.where(still_ruin)
                for y, x in zip(sr_y, sr_x):
                    duration = len(run.frames) - ruin_start[y, x]
                    ruin_durations.append(duration)
                    ruin_outcomes["still_ruin"].append(duration)

    if ruin_durations:
        rd = np.array(ruin_durations)
        print(f"Total ruin episodes: {len(rd)}")
        print(f"  Mean duration: {np.mean(rd):.2f} years")
        print(f"  Median duration: {np.median(rd):.0f}")
        print(f"  Std: {np.std(rd):.2f}")
        print(f"  Max: {np.max(rd)}")

        # Duration by outcome
        print(f"\nDuration by outcome:")
        for fate in ["rebuild", "forest", "decay", "still_ruin"]:
            if ruin_outcomes[fate]:
                vals = np.array(ruin_outcomes[fate])
                print(f"  {fate:>12}: n={len(vals):6d}  mean={np.mean(vals):.2f}  median={np.median(vals):.0f}")

        # Histogram
        bins = [1, 2, 3, 5, 10, 20, 50, 51]
        hist, _ = np.histogram(rd, bins=bins)
        print(f"\nDuration histogram:")
        for i in range(len(hist)):
            pct = hist[i] / len(rd) * 100
            print(f"    [{bins[i]:2d}-{bins[i+1]:2d}): {hist[i]:6d} ({pct:.1f}%)")


# ---------------------------------------------------------------------------
# Analysis V: Step 0 Immediate Collapses
# ---------------------------------------------------------------------------

def analysis_step0_collapses(data):
    header("V. STEP 0 IMMEDIATE COLLAPSES")

    # What happens at step 0? Some settlements collapse immediately.
    step0_alive_before = []
    step0_alive_after = []
    step0_collapsed_pop = []
    step0_collapsed_food = []
    step0_collapsed_defense = []
    step0_survived_pop = []
    step0_survived_food = []
    step0_survived_defense = []
    step0_cell_changes = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            f0 = run.frames[0]
            f1 = run.frames[1]
            alive_0 = {(s.x, s.y): s for s in f0.settlements if s.alive}
            alive_1 = {(s.x, s.y) for s in f1.settlements if s.alive}

            step0_alive_before.append(len(alive_0))
            step0_alive_after.append(len(alive_1))
            step0_cell_changes.append(int(np.count_nonzero(f0.grid != f1.grid)))

            for pos, s in alive_0.items():
                if pos not in alive_1:
                    # Collapsed at step 0
                    if s.population is not None:
                        step0_collapsed_pop.append(s.population)
                    if s.food is not None:
                        step0_collapsed_food.append(s.food)
                    if s.defense is not None:
                        step0_collapsed_defense.append(s.defense)
                else:
                    if s.population is not None:
                        step0_survived_pop.append(s.population)
                    if s.food is not None:
                        step0_survived_food.append(s.food)
                    if s.defense is not None:
                        step0_survived_defense.append(s.defense)

    print(f"Step 0 -> 1 statistics:")
    print(f"  Alive before: {np.mean(step0_alive_before):.1f} ± {np.std(step0_alive_before):.1f}")
    print(f"  Alive after:  {np.mean(step0_alive_after):.1f} ± {np.std(step0_alive_after):.1f}")
    print(f"  Mean collapses: {np.mean(step0_alive_before) - np.mean(step0_alive_after):.1f}")
    print(f"  Cell changes: {np.mean(step0_cell_changes):.1f}")

    if step0_collapsed_pop:
        print(f"\n  Step-0 collapsed vs survived settlements:")
        print(f"  Collapsed (n={len(step0_collapsed_pop)}):")
        print(f"    Pop: {np.mean(step0_collapsed_pop):.3f}  Food: {np.mean(step0_collapsed_food):.3f}  Def: {np.mean(step0_collapsed_defense):.3f}")
        print(f"  Survived (n={len(step0_survived_pop)}):")
        print(f"    Pop: {np.mean(step0_survived_pop):.3f}  Food: {np.mean(step0_survived_food):.3f}  Def: {np.mean(step0_survived_defense):.3f}")


# ---------------------------------------------------------------------------
# Analysis W: Population & Food Distributions (not just means)
# ---------------------------------------------------------------------------

def analysis_stat_distributions(data):
    header("W. SETTLEMENT STAT DISTRIBUTIONS (full shape, not just means)")

    # Collect distributions at key time points
    for year in [0, 25, 50]:
        pops = []
        foods = []
        wealths = []
        defenses = []
        for runs in (sd for rd in data.values() for sd in rd.values()):
            for run in runs:
                if year >= len(run.frames):
                    continue
                for s in run.frames[year].settlements:
                    if s.alive:
                        if s.population is not None:
                            pops.append(s.population)
                        if s.food is not None:
                            foods.append(s.food)
                        if s.wealth is not None:
                            wealths.append(s.wealth)
                        if s.defense is not None:
                            defenses.append(s.defense)

        print(f"Year {year} (n={len(pops)} alive settlements):")
        for name, vals in [("population", pops), ("food", foods), ("wealth", wealths), ("defense", defenses)]:
            arr = np.array(vals)
            pcts = np.percentile(arr, [5, 25, 50, 75, 95])
            print(f"  {name:>10}: p5={pcts[0]:.3f}  p25={pcts[1]:.3f}  p50={pcts[2]:.3f}  "
                  f"p75={pcts[3]:.3f}  p95={pcts[4]:.3f}  mean={np.mean(arr):.3f}")
        print()


# ---------------------------------------------------------------------------
# Analysis X: Longship & Tech Level
# ---------------------------------------------------------------------------

def analysis_longship_tech(data):
    header("X. LONGSHIP & TECH LEVEL ANALYSIS")

    # Check if these fields are populated in the data
    has_longship = 0
    has_tech = 0
    total = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for frame in run.frames:
                for s in frame.settlements:
                    total += 1
                    if hasattr(s, 'longship_count') and s.longship_count is not None:
                        has_longship += 1
                    if hasattr(s, 'tech_level') and s.tech_level is not None:
                        has_tech += 1

    print(f"Total settlement observations: {total}")
    print(f"  Has longship_count: {has_longship} ({has_longship/max(1,total)*100:.1f}%)")
    print(f"  Has tech_level: {has_tech} ({has_tech/max(1,total)*100:.1f}%)")

    if has_longship == 0 and has_tech == 0:
        print("\n  Neither longship_count nor tech_level are present in replay data.")
        print("  These fields may only be visible in the simulate API, not in replays.")


# ---------------------------------------------------------------------------
# Analysis Y: Transition Rates by Step (detailed temporal heatmap)
# ---------------------------------------------------------------------------

def analysis_transition_temporal(data):
    header("Y. TRANSITION RATES BY TIME PERIOD")

    # Split the 50 steps into 5 periods of 10
    periods = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50)]
    max_code = 12
    period_counts = {p: np.zeros((max_code, max_code), dtype=np.int64) for p in periods}

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev = run.frames[fi].grid
                curr = run.frames[fi + 1].grid
                changed = prev != curr
                if not np.any(changed):
                    continue
                for p_start, p_end in periods:
                    if p_start <= fi < p_end:
                        pv = prev[changed]
                        cv = curr[changed]
                        for p, c in zip(pv.ravel(), cv.ravel()):
                            period_counts[(p_start, p_end)][p, c] += 1
                        break

    # Show the top transitions for each period
    key_transitions = [
        (11, 1, "plains->settlement"),
        (4, 1, "forest->settlement"),
        (1, 3, "settlement->ruin"),
        (3, 1, "ruin->settlement"),
        (3, 11, "ruin->plains"),
        (3, 4, "ruin->forest"),
        (1, 2, "settlement->port"),
        (2, 3, "port->ruin"),
    ]

    print("Transition counts by time period:\n")
    headers = ["Transition"] + [f"Y{s}-{e}" for s, e in periods] + ["Total"]
    rows = []
    for from_code, to_code, name in key_transitions:
        row = [name]
        total = 0
        for p in periods:
            c = int(period_counts[p][from_code, to_code])
            row.append(str(c))
            total += c
        row.append(str(total))
        rows.append(row)
    table(headers, rows)


# ---------------------------------------------------------------------------
# Analysis Z: Entropy Spatial Patterns
# ---------------------------------------------------------------------------

def analysis_entropy_spatial(data):
    header("Z. WHERE IS ENTROPY CONCENTRATED?")

    # For each seed, compute per-cell entropy, then analyze by position
    entropy_by_distance = defaultdict(list)
    entropy_by_initial_code = defaultdict(list)

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            N = len(runs)

            # Compute initial settlement positions for distance calc
            init_pos = [(s.y, s.x) for s in runs[0].frames[0].settlements if s.alive]

            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)

            for y in range(h):
                for x in range(w):
                    values = terminal_grids[:, y, x]
                    counts = np.bincount(values, minlength=CLASS_COUNT).astype(np.float64)
                    probs = counts / N
                    probs = probs[probs > 0]
                    ent = -float(np.sum(probs * np.log2(probs)))

                    # Distance to nearest initial settlement
                    if init_pos:
                        min_dist = min(abs(y - sy) + abs(x - sx) for sy, sx in init_pos)
                    else:
                        min_dist = 99
                    entropy_by_distance[min(min_dist, 15)].append(ent)
                    entropy_by_initial_code[int(initial[y, x])].append(ent)

    print("Mean entropy by distance from nearest initial settlement:\n")
    rows = []
    for d in range(16):
        vals = entropy_by_distance.get(d, [])
        if vals:
            arr = np.array(vals)
            nz = float(np.count_nonzero(arr > 0)) / len(arr)
            rows.append([str(d), str(len(vals)), f"{np.mean(arr):.4f}", f"{np.median(arr):.4f}", f"{nz:.3f}"])
    table(["Dist", "Cells", "MeanEnt", "MedianEnt", "NonzeroFrac"], rows)

    # Entropy at distance 0 (initial settlement cells) broken down by scored class
    print("\nWhat class does the entropy come from at initial settlement cells?")
    # For distance 0 cells, compute per-class entropy contribution
    class_entropy = defaultdict(list)
    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue
            N = len(runs)
            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)
            init_pos = set((s.y, s.x) for s in runs[0].frames[0].settlements if s.alive)
            for y, x in init_pos:
                values = terminal_grids[:, y, x]
                counts = np.bincount(values, minlength=CLASS_COUNT).astype(np.float64)
                probs = counts / N
                # Per-class probability
                for c in range(CLASS_COUNT):
                    class_entropy[c].append(probs[c])

    if class_entropy:
        from astar.core.terrain import CLASS_NAMES
        print(f"\nMean class probability at initial settlement positions (terminal):")
        for c in range(CLASS_COUNT):
            vals = np.array(class_entropy[c])
            print(f"  {CLASS_NAMES[c]:>10}: mean_prob={np.mean(vals):.4f}  std={np.std(vals):.4f}")


# ---------------------------------------------------------------------------
# Analysis AA: Settlement Density vs. Change Rate
# ---------------------------------------------------------------------------

def analysis_density_change(data):
    header("AA. SETTLEMENT DENSITY VS CHANGE RATE")

    # For each seed, compute initial settlement density and total terminal changes
    densities = []
    change_rates = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            init_alive = sum(1 for s in runs[0].frames[0].settlements if s.alive)
            land_cells = int(np.count_nonzero(np.isin(initial, [0, 1, 2, 3, 4, 5, 11])))
            density = init_alive / max(1, land_cells)

            # Mean change rate across runs
            rates = []
            for run in runs:
                changed = collapse_internal_grid(run.frames[0].grid) != collapse_internal_grid(run.frames[-1].grid)
                rates.append(float(np.count_nonzero(changed)) / (h * w))
            densities.append(density)
            change_rates.append(np.mean(rates))

    if densities:
        d = np.array(densities)
        r = np.array(change_rates)
        corr = float(np.corrcoef(d, r)[0, 1])
        print(f"Correlation between initial settlement density and terminal change rate: r={corr:+.3f}")
        print(f"  (positive = denser maps change more)")

        # Bin by density quartiles
        for q_low, q_high in [(0, 25), (25, 50), (50, 75), (75, 100)]:
            low = np.percentile(d, q_low)
            high = np.percentile(d, q_high)
            mask = (d >= low) & (d <= high)
            if np.any(mask):
                print(f"  Density Q{q_low//25+1} [{low:.4f}-{high:.4f}]: "
                      f"mean_change_rate={np.mean(r[mask]):.4f}")


# ---------------------------------------------------------------------------
# Analysis BB: Do Same Cells Change in Same Ways Across Stochastic Runs?
# ---------------------------------------------------------------------------

def analysis_cell_consistency(data):
    header("BB. CELL-LEVEL CONSISTENCY ACROSS STOCHASTIC RUNS")

    # For each cell in each seed, look at what scored class it ends up as
    # across multiple stochastic runs. Compute the mode and the mode frequency.
    mode_freqs = []
    multi_class_cells = 0
    total_cells = 0
    mode_freq_by_type = defaultdict(list)

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            N = len(runs)

            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)

            for y in range(h):
                for x in range(w):
                    values = terminal_grids[:, y, x]
                    counts = np.bincount(values, minlength=CLASS_COUNT)
                    mode_freq = float(np.max(counts)) / N
                    mode_freqs.append(mode_freq)
                    total_cells += 1
                    if np.count_nonzero(counts > 0) > 1:
                        multi_class_cells += 1

                    init_code = int(initial[y, x])
                    mode_freq_by_type[init_code].append(mode_freq)

    if mode_freqs:
        mf = np.array(mode_freqs)
        print(f"Total cells analyzed: {total_cells}")
        print(f"Multi-class cells (>1 outcome): {multi_class_cells} ({multi_class_cells/total_cells*100:.1f}%)")
        print(f"\nMode frequency distribution (how often does the most common outcome occur?):")
        for threshold in [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]:
            frac = float(np.count_nonzero(mf >= threshold)) / len(mf)
            print(f"  Mode freq >= {threshold:.1f}: {frac*100:.1f}% of cells")

        print(f"\nMode frequency by initial terrain type:")
        for code in sorted(mode_freq_by_type.keys()):
            name = INTERNAL_CODE_NAMES.get(code, str(code))
            vals = np.array(mode_freq_by_type[code])
            print(f"  {name:>12}: mean_mode_freq={np.mean(vals):.3f}  median={np.median(vals):.3f}")


# ---------------------------------------------------------------------------
# Analysis CC: What Predicts Whether a Plains/Forest Cell Gets Built On?
# ---------------------------------------------------------------------------

def analysis_buildable_predictors(data):
    header("CC. WHAT PREDICTS WHETHER A CELL GETS BUILT ON?")

    # For each initially-plains or initially-forest cell, predict whether it has
    # a settlement/port/ruin at year 50.
    # Features: distance to nearest init settlement, distance to ocean, nearby forest density,
    # nearby mountain, position (y, x)

    built_dist_init = []
    unbuilt_dist_init = []
    built_dist_ocean = []
    unbuilt_dist_ocean = []
    built_forest_density = []
    unbuilt_forest_density = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]  # just use first run for features
            initial = run.frames[0].grid
            h, w = initial.shape
            terminal = collapse_internal_grid(run.frames[-1].grid)

            init_pos = [(s.y, s.x) for s in run.frames[0].settlements if s.alive]
            ocean_mask = initial == 10
            forest_mask = initial == 4

            for y in range(h):
                for x in range(w):
                    init_code = int(initial[y, x])
                    if init_code not in (4, 11):  # only plains and forest
                        continue

                    term_class = int(terminal[y, x])
                    built = term_class in (1, 2, 3)  # settlement, port, or ruin

                    # Distance to nearest initial settlement
                    if init_pos:
                        min_dist = min(abs(y - sy) + abs(x - sx) for sy, sx in init_pos)
                    else:
                        min_dist = 99

                    # Distance to ocean
                    ocean_ys, ocean_xs = np.where(ocean_mask)
                    if len(ocean_ys) > 0:
                        ocean_dist = min(abs(y - oy) + abs(x - ox) for oy, ox in zip(ocean_ys, ocean_xs))
                    else:
                        ocean_dist = 99

                    # Local forest density
                    y0, y1 = max(0, y-2), min(h, y+3)
                    x0, x1 = max(0, x-2), min(w, x+3)
                    patch = forest_mask[y0:y1, x0:x1]
                    forest_density = float(np.mean(patch))

                    if built:
                        built_dist_init.append(min_dist)
                        built_dist_ocean.append(ocean_dist)
                        built_forest_density.append(forest_density)
                    else:
                        unbuilt_dist_init.append(min_dist)
                        unbuilt_dist_ocean.append(ocean_dist)
                        unbuilt_forest_density.append(forest_density)

    if built_dist_init:
        print(f"Built cells at year 50: {len(built_dist_init)}")
        print(f"Unbuilt cells at year 50: {len(unbuilt_dist_init)}\n")

        for name, built_vals, unbuilt_vals in [
            ("dist_to_init_settlement", built_dist_init, unbuilt_dist_init),
            ("dist_to_ocean", built_dist_ocean, unbuilt_dist_ocean),
            ("local_forest_density", built_forest_density, unbuilt_forest_density),
        ]:
            b = np.array(built_vals, dtype=np.float64)
            u = np.array(unbuilt_vals, dtype=np.float64)
            diff = np.mean(b) - np.mean(u)
            pooled_std = np.sqrt((np.var(b) + np.var(u)) / 2)
            d = diff / max(1e-9, pooled_std)
            print(f"  {name:>25}: built={np.mean(b):.3f}  unbuilt={np.mean(u):.3f}  "
                  f"diff={diff:+.3f}  d={d:+.3f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 4 replay EDA")
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
        ("T", analysis_food_terrain),
        ("U", analysis_ruin_duration),
        ("V", analysis_step0_collapses),
        ("W", analysis_stat_distributions),
        ("X", analysis_longship_tech),
        ("Y", analysis_transition_temporal),
        ("Z", analysis_entropy_spatial),
        ("AA", analysis_density_change),
        ("BB", analysis_cell_consistency),
        ("CC", analysis_buildable_predictors),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-4 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
