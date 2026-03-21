"""Wave 6 EDA: spatial autocorrelation, cycle sub-structure, faction dynamics,
edge effects, expansion barriers, density limits, cell cycling, per-round transitions.

Run: uv run python scripts/replay_eda_wave6.py [--max-runs-per-seed N]
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
# MM: Spatial Autocorrelation of Terminal State
# ---------------------------------------------------------------------------

def analysis_spatial_autocorrelation(data):
    header("MM. SPATIAL AUTOCORRELATION OF TERMINAL STATE")

    # For each run, compute: P(neighbor has same scored class) vs random baseline
    same_neighbor_rates = []
    random_baseline_rates = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            tg = collapse_internal_grid(run.frames[-1].grid)
            h, w = tg.shape

            same_count = 0
            total_pairs = 0
            for y in range(h):
                for x in range(w):
                    if x + 1 < w:
                        total_pairs += 1
                        if tg[y, x] == tg[y, x + 1]:
                            same_count += 1
                    if y + 1 < h:
                        total_pairs += 1
                        if tg[y, x] == tg[y + 1, x]:
                            same_count += 1

            same_rate = same_count / max(1, total_pairs)
            same_neighbor_rates.append(same_rate)

            # Random baseline: P(same) = sum(p_c^2) for class c
            flat = tg.ravel()
            counts = np.bincount(flat, minlength=CLASS_COUNT).astype(np.float64)
            probs = counts / counts.sum()
            random_rate = float(np.sum(probs ** 2))
            random_baseline_rates.append(random_rate)

    if same_neighbor_rates:
        obs = np.mean(same_neighbor_rates)
        rnd = np.mean(random_baseline_rates)
        print(f"P(adjacent cells have same terminal class):")
        print(f"  Observed:  {obs:.4f}")
        print(f"  Random:    {rnd:.4f}")
        print(f"  Ratio:     {obs/rnd:.3f}x")
        print(f"\n  (ratio > 1 means positive spatial autocorrelation = clustering)")

    # Also: spatial autocorrelation by class
    print(f"\nPer-class spatial clustering (observed adjacency / expected):")
    class_lifts = defaultdict(list)
    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs[:1]:  # 1 run per seed to save time
            tg = collapse_internal_grid(run.frames[-1].grid)
            h, w = tg.shape
            flat = tg.ravel()
            total = h * w
            for c in range(CLASS_COUNT):
                p_c = np.count_nonzero(flat == c) / total
                if p_c < 0.001:
                    continue
                mask = tg == c
                adj_same = 0
                adj_total = 0
                for y in range(h):
                    for x in range(w):
                        if not mask[y, x]:
                            continue
                        for dy, dx in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w:
                                adj_total += 1
                                if mask[ny, nx]:
                                    adj_same += 1
                obs_rate = adj_same / max(1, adj_total)
                lift = obs_rate / max(1e-9, p_c)
                class_lifts[c].append(lift)

    for c in range(CLASS_COUNT):
        if class_lifts[c]:
            print(f"  {CLASS_NAMES[c]:>10}: lift={np.mean(class_lifts[c]):.2f}x")


# ---------------------------------------------------------------------------
# NN: 4-Year Cycle Sub-Structure
# ---------------------------------------------------------------------------

def analysis_cycle_substructure(data):
    header("NN. 4-YEAR CYCLE SUB-STRUCTURE")

    # Within each 4-year cycle, what happens at each position?
    # Position 0 = cycle start, 1 = +1, 2 = +2, 3 = +3
    # The cycle appears to start at step 2 (first births), so: 2,3,4,5 | 6,7,8,9 | ...
    # Actually looking at the data: births spike at steps 2-3, 7, 11, 15...
    # So the cycle is: offset 3 (birth burst), then 3 quiet steps
    # Let's measure by step mod 4

    births_by_mod = defaultdict(list)
    collapses_by_mod = defaultdict(list)
    cell_changes_by_mod = defaultdict(list)
    port_gains_by_mod = defaultdict(list)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                mod = fi % 4
                prev = run.frames[fi]
                curr = run.frames[fi + 1]

                cell_changes_by_mod[mod].append(int(np.count_nonzero(prev.grid != curr.grid)))

                prev_idx = {(s.x, s.y): s for s in prev.settlements}
                curr_idx = {(s.x, s.y): s for s in curr.settlements}

                births = 0
                collapses = 0
                port_gains = 0
                for pos in set(prev_idx) | set(curr_idx):
                    p = prev_idx.get(pos)
                    c = curr_idx.get(pos)
                    pa = p is not None and p.alive
                    ca = c is not None and c.alive
                    if not pa and ca:
                        pc = int(prev.grid[pos[1], pos[0]])
                        if pc != 3:
                            births += 1
                    if pa and not ca:
                        collapses += 1
                    if pa and ca and not p.has_port and c.has_port:
                        port_gains += 1

                births_by_mod[mod].append(births)
                collapses_by_mod[mod].append(collapses)
                port_gains_by_mod[mod].append(port_gains)

    print("Events by step mod 4:\n")
    rows = []
    for mod in range(4):
        rows.append([
            f"mod {mod}",
            f"{np.mean(births_by_mod[mod]):.2f}",
            f"{np.mean(collapses_by_mod[mod]):.2f}",
            f"{np.mean(cell_changes_by_mod[mod]):.1f}",
            f"{np.mean(port_gains_by_mod[mod]):.3f}",
        ])
    table(["Position", "Births", "Collapses", "CellChanges", "PortGains"], rows)

    # Now try mod 4 with different offsets to find the true phase
    print("\nBirth rate by step mod 4 with offset:")
    for offset in range(4):
        births_at = []
        for mod in range(4):
            vals = []
            for runs in (sd for rd in data.values() for sd in rd.values()):
                for run in runs:
                    for fi in range(len(run.frames) - 1):
                        if (fi - offset) % 4 == mod:
                            prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                            curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                            b = 0
                            for pos, s in curr_idx.items():
                                if s.alive:
                                    p = prev_idx.get(pos)
                                    if p is None or not p.alive:
                                        pc = int(run.frames[fi].grid[pos[1], pos[0]])
                                        if pc != 3:
                                            b += 1
                            vals.append(b)
            births_at.append(np.mean(vals))
        print(f"  offset={offset}: {' '.join(f'{b:.2f}' for b in births_at)}")


# ---------------------------------------------------------------------------
# OO: Edge/Border Effects
# ---------------------------------------------------------------------------

def analysis_edge_effects(data):
    header("OO. EDGE / BORDER EFFECTS")

    # Compare change rates at map edges vs interior
    edge_changed = 0
    edge_total = 0
    interior_changed = 0
    interior_total = 0
    border_width = 3

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial = run.frames[0].grid
            terminal = run.frames[-1].grid
            h, w = initial.shape
            changed = initial != terminal

            # Only count land cells
            land = np.isin(initial, [0, 1, 2, 3, 4, 5, 11])

            edge_mask = np.zeros((h, w), dtype=bool)
            edge_mask[:border_width, :] = True
            edge_mask[-border_width:, :] = True
            edge_mask[:, :border_width] = True
            edge_mask[:, -border_width:] = True

            edge_land = edge_mask & land
            interior_land = ~edge_mask & land

            edge_changed += int(np.count_nonzero(changed & edge_land))
            edge_total += int(np.count_nonzero(edge_land))
            interior_changed += int(np.count_nonzero(changed & interior_land))
            interior_total += int(np.count_nonzero(interior_land))

    er = edge_changed / max(1, edge_total)
    ir = interior_changed / max(1, interior_total)
    print(f"Change rate comparison (border {border_width} cells):")
    print(f"  Edge cells:     {edge_total:7d} changed={edge_changed:6d} rate={er:.4f}")
    print(f"  Interior cells: {interior_total:7d} changed={interior_changed:6d} rate={ir:.4f}")
    print(f"  Ratio (edge/interior): {er/max(1e-9,ir):.3f}")

    # Also: are initial settlements placed near edges?
    edge_settlements = 0
    interior_settlements = 0
    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]
            h, w = run.frames[0].grid.shape
            for s in run.frames[0].settlements:
                if s.alive:
                    if s.y < border_width or s.y >= h - border_width or s.x < border_width or s.x >= w - border_width:
                        edge_settlements += 1
                    else:
                        interior_settlements += 1

    total_s = edge_settlements + interior_settlements
    print(f"\nInitial settlement placement:")
    print(f"  Near edge (within {border_width}): {edge_settlements}/{total_s} ({edge_settlements/max(1,total_s)*100:.1f}%)")
    print(f"  Interior: {interior_settlements}/{total_s} ({interior_settlements/max(1,total_s)*100:.1f}%)")

    # What fraction of cells are edge?
    # For a 40x40 grid with border 3: edge = 40*40 - 34*34 = 1600 - 1156 = 444
    edge_frac = 444 / 1600
    print(f"  (Edge cells are {edge_frac*100:.1f}% of total map)")


# ---------------------------------------------------------------------------
# PP: Mountains/Ocean as Expansion Barriers
# ---------------------------------------------------------------------------

def analysis_barriers(data):
    header("PP. MOUNTAINS & OCEAN AS EXPANSION BARRIERS")

    # Do mountains or ocean block settlement expansion?
    # For each cell, check if there's a mountain/ocean between it and the nearest initial settlement
    # Then compare build probability

    # Simplified: compare build rate for cells on same connected land component as settlements
    # vs cells separated by ocean

    built_same_component = 0
    total_same_component = 0
    built_other_component = 0
    total_other_component = 0

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]
            initial = run.frames[0].grid
            h, w = initial.shape
            terminal = collapse_internal_grid(run.frames[-1].grid)

            # Land components (connected by land adjacency)
            land = np.isin(initial, [0, 1, 2, 3, 4, 5, 11])
            component = np.full((h, w), -1, dtype=np.int32)
            comp_id = 0
            for y in range(h):
                for x in range(w):
                    if land[y, x] and component[y, x] < 0:
                        queue = [(y, x)]
                        component[y, x] = comp_id
                        idx = 0
                        while idx < len(queue):
                            cy, cx = queue[idx]
                            idx += 1
                            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                                ny, nx = cy + dy, cx + dx
                                if 0 <= ny < h and 0 <= nx < w and land[ny, nx] and component[ny, nx] < 0:
                                    component[ny, nx] = comp_id
                                    queue.append((ny, nx))
                        comp_id += 1

            # Find components that contain initial settlements
            settlement_components = set()
            for s in run.frames[0].settlements:
                if s.alive:
                    settlement_components.add(int(component[s.y, s.x]))

            # Compare build rates
            built = np.isin(terminal, [1, 2, 3])
            for y in range(h):
                for x in range(w):
                    if not land[y, x] or initial[y, x] == 5:  # skip ocean and mountain
                        continue
                    c = int(component[y, x])
                    if c in settlement_components:
                        total_same_component += 1
                        if built[y, x]:
                            built_same_component += 1
                    else:
                        total_other_component += 1
                        if built[y, x]:
                            built_other_component += 1

    sr = built_same_component / max(1, total_same_component)
    otr = built_other_component / max(1, total_other_component)
    print(f"Build rate by land connectivity to initial settlements:")
    print(f"  Same component: {built_same_component}/{total_same_component} = {sr:.4f}")
    print(f"  Disconnected:   {built_other_component}/{total_other_component} = {otr:.4f}")
    if otr > 0:
        print(f"  Ratio: {sr/otr:.1f}x more likely on connected land")
    else:
        print(f"  Disconnected land NEVER gets built on!")

    # Mountain blocking: do cells behind mountains (relative to settlements) get built less?
    behind_mountain = 0
    behind_mountain_total = 0
    not_behind = 0
    not_behind_total = 0

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]
            initial = run.frames[0].grid
            h, w = initial.shape
            terminal = collapse_internal_grid(run.frames[-1].grid)
            mountain = initial == 5

            init_pos = [(s.y, s.x) for s in run.frames[0].settlements if s.alive]
            if not init_pos:
                continue

            built = np.isin(terminal, [1, 2, 3])
            land_plains_forest = np.isin(initial, [4, 11])

            for y in range(h):
                for x in range(w):
                    if not land_plains_forest[y, x]:
                        continue

                    # Find nearest settlement
                    min_dist = float('inf')
                    nearest = None
                    for sy, sx in init_pos:
                        d = abs(y - sy) + abs(x - sx)
                        if d < min_dist:
                            min_dist = d
                            nearest = (sy, sx)

                    if nearest is None or min_dist > 8:
                        continue

                    # Check if mountain is between this cell and nearest settlement
                    sy, sx = nearest
                    has_mountain_between = False
                    # Simple: check cells on the line
                    steps = max(abs(y - sy), abs(x - sx))
                    if steps > 0:
                        for t in range(1, steps):
                            my = sy + int(round((y - sy) * t / steps))
                            mx = sx + int(round((x - sx) * t / steps))
                            if 0 <= my < h and 0 <= mx < w and mountain[my, mx]:
                                has_mountain_between = True
                                break

                    if has_mountain_between:
                        behind_mountain_total += 1
                        if built[y, x]:
                            behind_mountain += 1
                    else:
                        not_behind_total += 1
                        if built[y, x]:
                            not_behind += 1

    if behind_mountain_total > 0:
        bmr = behind_mountain / behind_mountain_total
        nbr = not_behind / max(1, not_behind_total)
        print(f"\nMountain blocking effect (cells within dist 8 of init settlement):")
        print(f"  Behind mountain: {behind_mountain}/{behind_mountain_total} = {bmr:.4f}")
        print(f"  Not blocked:     {not_behind}/{not_behind_total} = {nbr:.4f}")
        print(f"  Ratio: {nbr/max(1e-9, bmr):.2f}x more likely without mountain blocking")


# ---------------------------------------------------------------------------
# QQ: Settlement Density Limits
# ---------------------------------------------------------------------------

def analysis_density_limits(data):
    header("QQ. SETTLEMENT DENSITY LIMITS")

    # At year 50, what's the maximum settlement density in any 5x5 window?
    max_densities = []
    mean_densities = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            tg = collapse_internal_grid(run.frames[-1].grid)
            h, w = tg.shape
            built = np.isin(tg, [1, 2]).astype(np.float64)  # settlement + port (not ruin)

            # 5x5 window density
            max_d = 0.0
            densities = []
            for y in range(0, h - 4, 2):
                for x in range(0, w - 4, 2):
                    patch = built[y:y + 5, x:x + 5]
                    d = float(np.mean(patch))
                    densities.append(d)
                    max_d = max(max_d, d)
            max_densities.append(max_d)
            mean_densities.append(np.mean(densities))

    if max_densities:
        md = np.array(max_densities)
        print(f"Settlement+port density in 5x5 windows at year 50:")
        print(f"  Max density (mean across runs): {np.mean(md):.3f}")
        print(f"  Max density (absolute max): {np.max(md):.3f}")
        print(f"  Mean density: {np.mean(mean_densities):.3f}")
        print(f"\n  (density=1.0 would mean every cell is a settlement)")
        print(f"  (25 cells in 5x5, so 0.48 = 12 settlements in a 5x5 area)")

    # Minimum spacing between alive settlements at year 50
    min_spacings = []
    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            positions = [(s.y, s.x) for s in run.frames[-1].settlements if s.alive]
            if len(positions) < 2:
                continue
            for i, (y1, x1) in enumerate(positions):
                min_d = float('inf')
                for j, (y2, x2) in enumerate(positions):
                    if i != j:
                        d = abs(y1 - y2) + abs(x1 - x2)
                        min_d = min(min_d, d)
                if min_d < float('inf'):
                    min_spacings.append(min_d)

    if min_spacings:
        ms = np.array(min_spacings)
        print(f"\nMinimum spacing between settlements at year 50:")
        print(f"  Mean: {np.mean(ms):.2f}")
        print(f"  Min: {np.min(ms)} <-- can settlements be adjacent?")
        print(f"  Distribution:")
        for d in range(1, 6):
            n = np.count_nonzero(ms == d)
            print(f"    dist={d}: {n:6d} ({n/len(ms)*100:.1f}%)")


# ---------------------------------------------------------------------------
# RR: Cell Cycling (settlement->ruin->settlement->ruin)
# ---------------------------------------------------------------------------

def analysis_cell_cycling(data):
    header("RR. CELL CYCLING (repeated transitions)")

    # For each cell, count how many times it transitions across 50 steps
    transition_count_dist = defaultdict(int)
    max_transitions = 0
    cycle_examples = []

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            h, w = run.frames[0].grid.shape
            for y in range(h):
                for x in range(w):
                    changes = 0
                    for fi in range(len(run.frames) - 1):
                        if run.frames[fi].grid[y, x] != run.frames[fi + 1].grid[y, x]:
                            changes += 1
                    transition_count_dist[changes] += 1
                    if changes > max_transitions:
                        max_transitions = changes

    total_cells = sum(transition_count_dist.values())
    print(f"Number of transitions per cell across 50 steps:\n")
    rows = []
    cumulative = 0
    for n in range(max(transition_count_dist.keys()) + 1):
        count = transition_count_dist.get(n, 0)
        cumulative += count
        if count > 0 or n <= 10:
            rows.append([str(n), str(count), f"{count/total_cells*100:.2f}%", f"{cumulative/total_cells*100:.1f}%"])
    table(["Transitions", "Cells", "Share", "Cumulative"], rows)


# ---------------------------------------------------------------------------
# SS: Faction Consolidation Curve
# ---------------------------------------------------------------------------

def analysis_faction_curve(data):
    header("SS. FACTION CONSOLIDATION OVER TIME")

    max_steps = 51
    faction_counts_by_step = [[] for _ in range(max_steps)]
    gini_by_step = [[] for _ in range(max_steps)]

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames)):
                alive = [s for s in run.frames[fi].settlements if s.alive]
                owners = [s.owner_id for s in alive if s.owner_id is not None]
                unique_owners = len(set(owners))
                faction_counts_by_step[fi].append(unique_owners)

                # Gini of faction sizes
                if unique_owners > 1:
                    owner_counts = defaultdict(int)
                    for o in owners:
                        owner_counts[o] += 1
                    sizes = np.sort(np.array(list(owner_counts.values()), dtype=np.float64))
                    n = len(sizes)
                    index = np.arange(1, n + 1)
                    total = np.sum(sizes)
                    if total > 0:
                        gini = (2 * np.sum(index * sizes) - (n + 1) * total) / (n * total)
                    else:
                        gini = 0.0
                    gini_by_step[fi].append(gini)

    print("Faction count and size inequality over time:\n")
    rows = []
    for step in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]:
        if step < max_steps and faction_counts_by_step[step]:
            fc = np.array(faction_counts_by_step[step])
            gi = np.array(gini_by_step[step]) if gini_by_step[step] else np.array([0.0])
            rows.append([str(step), f"{np.mean(fc):.1f}", f"{np.std(fc):.1f}",
                        f"{np.mean(gi):.3f}"])
    table(["Year", "MeanFactions", "StdFactions", "GiniFacSize"], rows)


# ---------------------------------------------------------------------------
# TT: Per-Round Transition Probabilities (do they differ?)
# ---------------------------------------------------------------------------

def analysis_per_round_transitions(data):
    header("TT. PER-ROUND TRANSITION PROBABILITIES")

    # For each round, compute P(terminal scored class | initial=settlement)
    # to see if the hidden parameters shift these probabilities

    print("P(terminal class | initial=settlement), per round:\n")
    headers = ["Round"] + [CLASS_NAMES[c][:6] for c in range(CLASS_COUNT)]
    rows = []

    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        counts = np.zeros(CLASS_COUNT, dtype=np.int64)
        for seed_index, runs in seeds.items():
            for run in runs:
                initial = run.frames[0].grid
                terminal = collapse_internal_grid(run.frames[-1].grid)
                settlement_mask = initial == 1
                for c in range(CLASS_COUNT):
                    counts[c] += int(np.count_nonzero(settlement_mask & (terminal == c)))
        total = counts.sum()
        probs = counts / max(1, total)
        rows.append([round_id[:8] + ".."] + [f"{probs[c]:.3f}" for c in range(CLASS_COUNT)])
    table(headers, rows)

    # Same for initial=forest
    print("\nP(terminal class | initial=forest), per round:\n")
    rows = []
    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        counts = np.zeros(CLASS_COUNT, dtype=np.int64)
        for seed_index, runs in seeds.items():
            for run in runs:
                initial = run.frames[0].grid
                terminal = collapse_internal_grid(run.frames[-1].grid)
                forest_mask = initial == 4
                for c in range(CLASS_COUNT):
                    counts[c] += int(np.count_nonzero(forest_mask & (terminal == c)))
        total = counts.sum()
        probs = counts / max(1, total)
        rows.append([round_id[:8] + ".."] + [f"{probs[c]:.3f}" for c in range(CLASS_COUNT)])
    table(headers, rows)

    # Same for initial=plains
    print("\nP(terminal class | initial=plains), per round:\n")
    rows = []
    for round_id in sorted(data.keys()):
        seeds = data[round_id]
        counts = np.zeros(CLASS_COUNT, dtype=np.int64)
        for seed_index, runs in seeds.items():
            for run in runs:
                initial = run.frames[0].grid
                terminal = collapse_internal_grid(run.frames[-1].grid)
                plains_mask = initial == 11
                for c in range(CLASS_COUNT):
                    counts[c] += int(np.count_nonzero(plains_mask & (terminal == c)))
        total = counts.sum()
        probs = counts / max(1, total)
        rows.append([round_id[:8] + ".."] + [f"{probs[c]:.3f}" for c in range(CLASS_COUNT)])
    table(headers, rows)


# ---------------------------------------------------------------------------
# UU: Initial Stat Distribution Shape
# ---------------------------------------------------------------------------

def analysis_initial_stat_shape(data):
    header("UU. INITIAL SETTLEMENT STAT DISTRIBUTIONS")

    pops = []
    foods = []
    wealths = []
    defenses = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            run = runs[0]
            for s in run.frames[0].settlements:
                if s.alive:
                    if s.population is not None:
                        pops.append(s.population)
                    if s.food is not None:
                        foods.append(s.food)
                    if s.wealth is not None:
                        wealths.append(s.wealth)
                    if s.defense is not None:
                        defenses.append(s.defense)

    for name, vals in [("population", pops), ("food", foods), ("wealth", wealths), ("defense", defenses)]:
        arr = np.array(vals)
        pcts = np.percentile(arr, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        print(f"{name} (n={len(arr)}):")
        print(f"  min={arr.min():.4f}  max={arr.max():.4f}  mean={np.mean(arr):.4f}  std={np.std(arr):.4f}")
        print(f"  deciles: {' '.join(f'{p:.3f}' for p in pcts)}")

        # Check if it's uniform
        # For uniform U[a,b]: mean=(a+b)/2, std=(b-a)/sqrt(12)
        a, b = arr.min(), arr.max()
        expected_mean = (a + b) / 2
        expected_std = (b - a) / np.sqrt(12)
        print(f"  uniform test: expected_mean={expected_mean:.4f} (got {np.mean(arr):.4f}), "
              f"expected_std={expected_std:.4f} (got {np.std(arr):.4f})")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 6 replay EDA")
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
        ("MM", analysis_spatial_autocorrelation),
        ("NN", analysis_cycle_substructure),
        ("OO", analysis_edge_effects),
        ("PP", analysis_barriers),
        ("QQ", analysis_density_limits),
        ("RR", analysis_cell_cycling),
        ("SS", analysis_faction_curve),
        ("TT", analysis_per_round_transitions),
        ("UU", analysis_initial_stat_shape),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-6 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
