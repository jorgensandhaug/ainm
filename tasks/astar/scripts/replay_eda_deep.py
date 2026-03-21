"""Deep-dive EDA: follow-up analyses building on initial findings.

Run: uv run python scripts/replay_eda_deep.py [--max-runs-per-seed N]
"""

from __future__ import annotations

import argparse
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
# Analysis A: Birth Cycle Periodicity
# ---------------------------------------------------------------------------

def analysis_birth_cycle(data):
    header("A. BIRTH CYCLE PERIODICITY ANALYSIS")

    # Per-round birth series
    for round_id in sorted(data.keys()):
        births_by_step = np.zeros(50, dtype=np.float64)
        run_count = 0
        for seeds in data[round_id].values():
            for run in seeds:
                run_count += 1
                for step in range(min(len(run.frames) - 1, 50)):
                    prev_idx = {(s.x, s.y): s for s in run.frames[step].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[step + 1].settlements}
                    for pos in curr_idx:
                        c = curr_idx[pos]
                        p = prev_idx.get(pos)
                        if c.alive and (p is None or not p.alive):
                            prev_code = int(run.frames[step].grid[pos[1], pos[0]])
                            if prev_code != 3:  # birth, not rebuild
                                births_by_step[step] += 1
        if run_count > 0:
            births_by_step /= run_count

        # Compute autocorrelation
        centered = births_by_step - np.mean(births_by_step)
        norm = np.sum(centered ** 2)
        if norm > 0:
            autocorr = np.correlate(centered, centered, mode='full')
            autocorr = autocorr[len(autocorr)//2:] / norm  # positive lags only
        else:
            autocorr = np.zeros(50)

        print(f"Round {round_id[:8]}.. (n={run_count}):")
        print(f"  Birth rate mean: {np.mean(births_by_step):.2f}/step")
        # Find peak autocorrelation lag (excluding lag 0)
        if len(autocorr) > 1:
            peak_lag = np.argmax(autocorr[1:min(20, len(autocorr))]) + 1
            peak_val = autocorr[peak_lag]
            print(f"  Peak autocorrelation lag: {peak_lag} (r={peak_val:.3f})")
        # Show birth pattern
        birth_str = " ".join(f"{b:.1f}" for b in births_by_step[:20])
        print(f"  First 20 steps: {birth_str}")
        print()


# ---------------------------------------------------------------------------
# Analysis B: Per-Round Regime Fingerprint
# ---------------------------------------------------------------------------

def analysis_regime_fingerprint(data):
    header("B. PER-ROUND REGIME FINGERPRINT")

    print("Regime dimensions estimated from replay data:\n")
    rows = []
    for round_id in sorted(data.keys()):
        all_runs = [r for sd in data[round_id].values() for r in sd]
        if not all_runs:
            continue

        # Expansion: final alive count / initial alive count
        expansion_ratios = []
        # Maritime: port fraction at year 50
        maritime_scores = []
        # Conflict: owner flips per settlement-year
        conflict_scores = []
        # Winter: collapse rate (collapses / alive-settlement-years)
        winter_scores = []
        # Reclamation: ruin->forest / total ruin transitions
        reclaim_num = 0
        reclaim_denom = 0

        for run in all_runs:
            init_alive = sum(1 for s in run.frames[0].settlements if s.alive)
            final_alive = sum(1 for s in run.frames[-1].settlements if s.alive)
            expansion_ratios.append(final_alive / max(1, init_alive))

            final_ports = sum(1 for s in run.frames[-1].settlements if s.has_port)
            maritime_scores.append(final_ports / max(1, final_alive))

            flips = 0
            collapses = 0
            total_alive_years = 0
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                alive_prev = [s for s in run.frames[fi].settlements if s.alive]
                total_alive_years += len(alive_prev)
                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if p.alive and c.alive and p.owner_id != c.owner_id and p.owner_id is not None and c.owner_id is not None:
                        flips += 1
                    if p.alive and not c.alive:
                        collapses += 1

                # Ruin transitions
                prev_g = run.frames[fi].grid
                curr_g = run.frames[fi + 1].grid
                ruin_cells = prev_g == 3
                if np.any(ruin_cells):
                    curr_at_ruin = curr_g[ruin_cells]
                    changed_from_ruin = curr_at_ruin != 3
                    reclaim_denom += int(np.count_nonzero(changed_from_ruin))
                    reclaim_num += int(np.count_nonzero(curr_at_ruin == 4))

            conflict_scores.append(flips / max(1, total_alive_years) * 100)
            winter_scores.append(collapses / max(1, total_alive_years) * 100)

        reclaim_rate = reclaim_num / max(1, reclaim_denom)

        rows.append([
            round_id[:8] + "..",
            f"{np.mean(expansion_ratios):.2f}",
            f"{np.mean(maritime_scores):.3f}",
            f"{np.mean(conflict_scores):.3f}",
            f"{np.mean(winter_scores):.2f}",
            f"{reclaim_rate:.3f}",
        ])

    table(["Round", "Expansion", "Maritime", "Conflict%", "Winter%", "Reclaim"], rows)


# ---------------------------------------------------------------------------
# Analysis C: Settlement Survival Predictors
# ---------------------------------------------------------------------------

def analysis_survival_predictors(data):
    header("C. SETTLEMENT SURVIVAL PREDICTORS")

    # For each settlement alive at year 10, predict survival to year 50
    survived_stats = {"pop": [], "food": [], "wealth": [], "defense": [], "has_port": [], "coast": []}
    died_stats = {"pop": [], "food": [], "wealth": [], "defense": [], "has_port": [], "coast": []}

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            if len(run.frames) < 51:
                continue
            initial_grid = run.frames[0].grid
            ocean = initial_grid == 10

            # Identify settlements alive at year 10
            frame10 = run.frames[10]
            frame50 = run.frames[50]
            alive_at_50 = {(s.x, s.y) for s in frame50.settlements if s.alive}

            for s in frame10.settlements:
                if not s.alive:
                    continue
                pos = (s.x, s.y)
                # Check if still alive at 50
                survived = pos in alive_at_50
                target = survived_stats if survived else died_stats

                if s.population is not None:
                    target["pop"].append(s.population)
                if s.food is not None:
                    target["food"].append(s.food)
                if s.wealth is not None:
                    target["wealth"].append(s.wealth)
                if s.defense is not None:
                    target["defense"].append(s.defense)
                target["has_port"].append(1.0 if s.has_port else 0.0)

                # Is coastal?
                y, x = s.y, s.x
                is_coast = False
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < ocean.shape[0] and 0 <= nx < ocean.shape[1] and ocean[ny, nx]:
                        is_coast = True
                        break
                target["coast"].append(1.0 if is_coast else 0.0)

    print("Settlement stats at year 10 -> survival to year 50:\n")
    print(f"  Survived: {len(survived_stats['pop'])} settlements")
    print(f"  Died:     {len(died_stats['pop'])} settlements\n")

    for stat in ["pop", "food", "wealth", "defense", "has_port", "coast"]:
        s_vals = np.array(survived_stats[stat]) if survived_stats[stat] else np.array([0.0])
        d_vals = np.array(died_stats[stat]) if died_stats[stat] else np.array([0.0])
        diff = np.mean(s_vals) - np.mean(d_vals)
        # Effect size (Cohen's d)
        pooled_std = np.sqrt((np.var(s_vals) + np.var(d_vals)) / 2)
        cohen_d = diff / max(1e-9, pooled_std)
        print(f"  {stat:>8}: survived={np.mean(s_vals):.3f}  died={np.mean(d_vals):.3f}  "
              f"diff={diff:+.3f}  d={cohen_d:+.3f}")


# ---------------------------------------------------------------------------
# Analysis D: Expansion Wavefront
# ---------------------------------------------------------------------------

def analysis_expansion_wavefront(data):
    header("D. EXPANSION WAVEFRONT ANALYSIS")

    # For each run, compute: at each distance from initial settlement cluster,
    # what fraction of land cells are occupied at year 50?
    max_dist = 20
    occupied_by_dist = np.zeros(max_dist, dtype=np.float64)
    total_by_dist = np.zeros(max_dist, dtype=np.float64)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial = run.frames[0].grid
            h, w = initial.shape
            land = np.isin(initial, [0, 1, 2, 3, 4, 5, 11])
            mountain = initial == 5

            # Settlement positions at t=0
            init_pos = [(s.y, s.x) for s in run.frames[0].settlements if s.alive]
            if not init_pos:
                continue

            # BFS distance from initial settlements
            dist = np.full((h, w), -1, dtype=np.int32)
            queue = list(init_pos)
            for y, x in queue:
                dist[y, x] = 0
            idx = 0
            while idx < len(queue):
                y, x = queue[idx]
                idx += 1
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and dist[ny, nx] < 0 and land[ny, nx]:
                        dist[ny, nx] = dist[y, x] + 1
                        queue.append((ny, nx))

            # Terminal state
            terminal = run.frames[-1].grid
            occupied_terminal = np.isin(terminal, [1, 2, 3])  # settlement, port, ruin

            for d in range(max_dist):
                ring = (dist == d) & land & ~mountain
                total_by_dist[d] += int(np.count_nonzero(ring))
                occupied_by_dist[d] += int(np.count_nonzero(ring & occupied_terminal))

    print("Occupation rate by land distance from initial settlements:\n")
    rows = []
    for d in range(max_dist):
        rate = occupied_by_dist[d] / max(1, total_by_dist[d])
        bar = "#" * int(rate * 50)
        rows.append([str(d), f"{total_by_dist[d]:.0f}", f"{occupied_by_dist[d]:.0f}", f"{rate:.4f}", bar])
    table(["Dist", "LandCells", "Occupied", "Rate", ""], rows)


# ---------------------------------------------------------------------------
# Analysis E: Stochastic Variance by Terrain Type
# ---------------------------------------------------------------------------

def analysis_stochastic_by_terrain(data):
    header("E. STOCHASTIC VARIANCE BY INITIAL TERRAIN TYPE")

    # For each initial terrain type, compute the per-cell entropy across stochastic runs
    entropy_by_type = defaultdict(list)

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            if len(runs) < 3:
                continue

            initial = runs[0].frames[0].grid
            h, w = initial.shape
            N = len(runs)

            # Collect terminal scored grids
            terminal_grids = np.stack([
                collapse_internal_grid(run.frames[-1].grid) for run in runs
            ], axis=0)

            # Per-cell entropy
            for y in range(h):
                for x in range(w):
                    init_code = int(initial[y, x])
                    values = terminal_grids[:, y, x]
                    counts = np.bincount(values, minlength=CLASS_COUNT).astype(np.float64)
                    probs = counts / N
                    probs = probs[probs > 0]
                    ent = -float(np.sum(probs * np.log2(probs)))
                    entropy_by_type[init_code].append(ent)

    print("Mean terminal entropy (bits) by initial terrain:\n")
    rows = []
    for code in sorted(entropy_by_type.keys()):
        vals = np.array(entropy_by_type[code])
        name = INTERNAL_CODE_NAMES.get(code, str(code))
        nonzero_frac = float(np.count_nonzero(vals > 0)) / max(1, len(vals))
        rows.append([
            str(code), name,
            str(len(vals)),
            f"{np.mean(vals):.4f}",
            f"{np.median(vals):.4f}",
            f"{np.std(vals):.4f}",
            f"{nonzero_frac:.3f}",
        ])
    table(["Code", "Name", "Cells", "MeanEnt", "MedianEnt", "StdEnt", "NonzeroFrac"], rows)


# ---------------------------------------------------------------------------
# Analysis F: Settlement Stat Trajectories by Outcome
# ---------------------------------------------------------------------------

def analysis_stat_trajectories(data):
    header("F. SETTLEMENT STAT TRAJECTORIES BY OUTCOME")

    # Track stats of settlements that survive full game vs those that collapse
    # Sample: track settlements alive at year 5, follow them
    checkpoints = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

    # Bucket: settlements alive at year 5 that survive to year 50 vs not
    survivor_pop = {t: [] for t in checkpoints}
    survivor_food = {t: [] for t in checkpoints}
    doomed_pop = {t: [] for t in checkpoints}
    doomed_food = {t: [] for t in checkpoints}

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            if len(run.frames) < 51:
                continue
            alive_at_5 = {(s.x, s.y) for s in run.frames[5].settlements if s.alive}
            alive_at_50 = {(s.x, s.y) for s in run.frames[50].settlements if s.alive}
            survivors = alive_at_5 & alive_at_50
            doomed = alive_at_5 - alive_at_50

            for t in checkpoints:
                frame = run.frames[t]
                idx = {(s.x, s.y): s for s in frame.settlements}
                for pos in survivors:
                    s = idx.get(pos)
                    if s and s.alive and s.population is not None:
                        survivor_pop[t].append(s.population)
                        survivor_food[t].append(s.food)
                for pos in doomed:
                    s = idx.get(pos)
                    if s and s.alive and s.population is not None:
                        doomed_pop[t].append(s.population)
                        doomed_food[t].append(s.food)

    print("Mean population/food trajectory for settlements alive at year 5:\n")
    rows = []
    for t in checkpoints:
        sp = np.mean(survivor_pop[t]) if survivor_pop[t] else 0.0
        sf = np.mean(survivor_food[t]) if survivor_food[t] else 0.0
        dp = np.mean(doomed_pop[t]) if doomed_pop[t] else 0.0
        df_ = np.mean(doomed_food[t]) if doomed_food[t] else 0.0
        sn = len(survivor_pop[t])
        dn = len(doomed_pop[t])
        rows.append([
            str(t),
            f"{sn}", f"{sp:.3f}", f"{sf:.3f}",
            f"{dn}", f"{dp:.3f}", f"{df_:.3f}",
        ])
    table(["Year", "SurvN", "SurvPop", "SurvFood", "DoomN", "DoomPop", "DoomFood"], rows)


# ---------------------------------------------------------------------------
# Analysis G: Port Acquisition Predictors
# ---------------------------------------------------------------------------

def analysis_port_predictors(data):
    header("G. PORT ACQUISITION PREDICTORS")

    # At year 10, compare settlements that will gain a port by year 50 vs not
    gained_port = {"pop": [], "food": [], "wealth": [], "defense": [], "coast": []}
    no_port = {"pop": [], "food": [], "wealth": [], "defense": [], "coast": []}

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            if len(run.frames) < 51:
                continue
            initial_grid = run.frames[0].grid
            ocean = initial_grid == 10

            # Track which positions ever have a port
            ever_port = set()
            for frame in run.frames:
                for s in frame.settlements:
                    if s.has_port:
                        ever_port.add((s.x, s.y))

            # At year 10, alive non-port settlements
            for s in run.frames[10].settlements:
                if not s.alive or s.has_port:
                    continue
                pos = (s.x, s.y)

                is_coast = False
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = s.y + dy, s.x + dx
                    if 0 <= ny < ocean.shape[0] and 0 <= nx < ocean.shape[1] and ocean[ny, nx]:
                        is_coast = True
                        break

                target = gained_port if pos in ever_port else no_port
                if s.population is not None:
                    target["pop"].append(s.population)
                if s.food is not None:
                    target["food"].append(s.food)
                if s.wealth is not None:
                    target["wealth"].append(s.wealth)
                if s.defense is not None:
                    target["defense"].append(s.defense)
                target["coast"].append(1.0 if is_coast else 0.0)

    print(f"Non-port settlements at year 10 that gain a port later:\n")
    print(f"  Gained port: {len(gained_port['pop'])}")
    print(f"  Never port:  {len(no_port['pop'])}\n")

    for stat in ["pop", "food", "wealth", "defense", "coast"]:
        g = np.array(gained_port[stat]) if gained_port[stat] else np.array([0.0])
        n = np.array(no_port[stat]) if no_port[stat] else np.array([0.0])
        diff = np.mean(g) - np.mean(n)
        pooled_std = np.sqrt((np.var(g) + np.var(n)) / 2)
        cohen_d = diff / max(1e-9, pooled_std)
        print(f"  {stat:>8}: port={np.mean(g):.3f}  no_port={np.mean(n):.3f}  "
              f"diff={diff:+.3f}  d={cohen_d:+.3f}")


# ---------------------------------------------------------------------------
# Analysis H: Ruin Fate Predictors
# ---------------------------------------------------------------------------

def analysis_ruin_fate(data):
    header("H. RUIN FATE PREDICTORS (what determines rebuild vs forest vs decay)")

    # For each ruin cell, look at local context and track what it becomes
    fates = {"rebuild": defaultdict(list), "forest": defaultdict(list), "decay": defaultdict(list)}

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
            for fi in range(len(run.frames) - 1):
                prev_g = run.frames[fi].grid
                curr_g = run.frames[fi + 1].grid
                h, w = prev_g.shape

                ruin_y, ruin_x = np.where(prev_g == 3)
                for y, x in zip(ruin_y, ruin_x):
                    next_code = int(curr_g[y, x])
                    if next_code == 3:
                        continue  # still ruin, skip

                    if next_code in (1, 2):
                        fate = "rebuild"
                    elif next_code == 4:
                        fate = "forest"
                    else:
                        fate = "decay"

                    # Local context features
                    y0, y1 = max(0, y-1), min(h, y+2)
                    x0, x1 = max(0, x-1), min(w, x+2)
                    patch = prev_g[y0:y1, x0:x1]

                    # Nearby alive settlements
                    nearby_alive = 0
                    for s in run.frames[fi].settlements:
                        if s.alive and abs(s.y - y) <= 2 and abs(s.x - x) <= 2:
                            nearby_alive += 1

                    fates[fate]["nearby_alive"].append(nearby_alive)
                    fates[fate]["nearby_forest"].append(int(np.count_nonzero(patch == 4)))
                    fates[fate]["nearby_settlement"].append(int(np.count_nonzero(np.isin(patch, [1, 2]))))
                    fates[fate]["step"].append(fi)

    print("Ruin transition context (mean values):\n")
    rows = []
    for fate in ["rebuild", "forest", "decay"]:
        d = fates[fate]
        if not d["step"]:
            continue
        rows.append([
            fate,
            str(len(d["step"])),
            f"{np.mean(d['nearby_alive']):.2f}",
            f"{np.mean(d['nearby_forest']):.2f}",
            f"{np.mean(d['nearby_settlement']):.2f}",
            f"{np.mean(d['step']):.1f}",
        ])
    table(["Fate", "Count", "NearbyAlive", "NearbyForest", "NearbySettl", "MeanStep"], rows)

    print("\nInterpretation:")
    print("  - Rebuild requires nearby alive settlements (neighbors support rebuilding)")
    print("  - Forest reclamation happens when NO settlements are nearby")
    print("  - Decay to plains is the fallback when neither condition is met")


# ---------------------------------------------------------------------------
# Analysis I: Initial Conditions -> Final State Correlation
# ---------------------------------------------------------------------------

def analysis_initial_final_correlation(data):
    header("I. INITIAL CONDITIONS -> FINAL STATE CORRELATION")

    # Per run: initial settlement count, initial port count, initial forest count
    # vs final alive, final ports, final ruins, final forests
    init_alive = []
    init_ports = []
    init_forest = []
    final_alive = []
    final_ports = []
    final_ruins = []
    final_forest = []
    round_labels = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            for run in runs:
                ia = sum(1 for s in run.frames[0].settlements if s.alive)
                ip = sum(1 for s in run.frames[0].settlements if s.has_port)
                ig = run.frames[0].grid
                ifc = int(np.count_nonzero(ig == 4))
                tg = run.frames[-1].grid
                fa = sum(1 for s in run.frames[-1].settlements if s.alive)
                fp = sum(1 for s in run.frames[-1].settlements if s.has_port)
                fr = int(np.count_nonzero(tg == 3))
                ff = int(np.count_nonzero(tg == 4))

                init_alive.append(ia)
                init_ports.append(ip)
                init_forest.append(ifc)
                final_alive.append(fa)
                final_ports.append(fp)
                final_ruins.append(fr)
                final_forest.append(ff)
                round_labels.append(round_id[:8])

    init_alive = np.array(init_alive, dtype=np.float64)
    init_ports = np.array(init_ports, dtype=np.float64)
    init_forest = np.array(init_forest, dtype=np.float64)
    final_alive = np.array(final_alive, dtype=np.float64)
    final_ports = np.array(final_ports, dtype=np.float64)
    final_ruins = np.array(final_ruins, dtype=np.float64)
    final_forest = np.array(final_forest, dtype=np.float64)

    def corr(a, b):
        if np.std(a) < 1e-9 or np.std(b) < 1e-9:
            return 0.0
        return float(np.corrcoef(a, b)[0, 1])

    print("Pearson correlations between initial and final state:\n")
    initials = [("init_alive", init_alive), ("init_ports", init_ports), ("init_forest", init_forest)]
    finals = [("final_alive", final_alive), ("final_ports", final_ports), ("final_ruins", final_ruins), ("final_forest", final_forest)]

    rows = []
    for iname, ivals in initials:
        for fname, fvals in finals:
            r = corr(ivals, fvals)
            rows.append([iname, fname, f"{r:+.3f}"])
    table(["Initial", "Final", "r"], rows)

    print("\nNote: These are OVERALL correlations mixing all rounds.")
    print("Since rounds have different hidden params, the round effect dominates.")
    print("Within-round correlations (same hidden params, different seeds/sims):")

    # Within-round correlations
    within_rows = []
    for round_id in sorted(data.keys()):
        round_mask = np.array([l == round_id[:8] for l in round_labels])
        if np.sum(round_mask) < 5:
            continue
        r = corr(init_alive[round_mask], final_alive[round_mask])
        rp = corr(init_ports[round_mask], final_ports[round_mask])
        rf = corr(init_forest[round_mask], final_forest[round_mask])
        within_rows.append([round_id[:8] + "..", f"{r:+.3f}", f"{rp:+.3f}", f"{rf:+.3f}"])
    table(["Round", "initA->finA", "initP->finP", "initF->finF"], within_rows)


# ---------------------------------------------------------------------------
# Analysis J: When Do Settlements Die? (Hazard Curve)
# ---------------------------------------------------------------------------

def analysis_settlement_hazard(data):
    header("J. SETTLEMENT HAZARD CURVE (conditional death probability by age)")

    max_age = 50
    alive_at_age = np.zeros(max_age + 1, dtype=np.int64)
    died_at_age = np.zeros(max_age + 1, dtype=np.int64)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            # Track birth and death of each settlement span
            position_alive = defaultdict(list)
            for fi, frame in enumerate(run.frames):
                alive_set = {(s.x, s.y) for s in frame.settlements if s.alive}
                for pos in alive_set:
                    position_alive[pos].append(fi)

            for pos, frames_alive in position_alive.items():
                # Find contiguous spans
                spans = []
                start = frames_alive[0]
                for i in range(1, len(frames_alive)):
                    if frames_alive[i] != frames_alive[i-1] + 1:
                        spans.append((start, frames_alive[i-1]))
                        start = frames_alive[i]
                spans.append((start, frames_alive[-1]))

                for span_start, span_end in spans:
                    lifespan = span_end - span_start + 1
                    died = span_end < len(run.frames) - 1  # didn't survive to end
                    for age in range(min(lifespan, max_age + 1)):
                        alive_at_age[age] += 1
                    if died and lifespan <= max_age:
                        died_at_age[lifespan - 1] += 1  # died at this age

    print("Conditional hazard rate (P(die at age | survived to age)):\n")
    rows = []
    for age in range(0, max_age, 2):  # every 2 years for readability
        hazard = died_at_age[age] / max(1, alive_at_age[age])
        bar = "#" * int(hazard * 100)
        rows.append([str(age), str(alive_at_age[age]), str(died_at_age[age]), f"{hazard:.4f}", bar])
    table(["Age", "AtRisk", "Died", "Hazard", ""], rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Deep-dive replay EDA")
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
        ("A", analysis_birth_cycle),
        ("B", analysis_regime_fingerprint),
        ("C", analysis_survival_predictors),
        ("D", analysis_expansion_wavefront),
        ("E", analysis_stochastic_by_terrain),
        ("F", analysis_stat_trajectories),
        ("G", analysis_port_predictors),
        ("H", analysis_ruin_fate),
        ("I", analysis_initial_final_correlation),
        ("J", analysis_settlement_hazard),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total deep EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
