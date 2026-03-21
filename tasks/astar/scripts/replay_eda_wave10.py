"""Wave 10 EDA: sea conquest, founding patterns, food regression,
initial vs founded survival, settlement geography.

Run: uv run python scripts/replay_eda_wave10.py [--max-runs-per-seed N]
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
# PPP: Sea Conquest (longship proxy)
# ---------------------------------------------------------------------------

def analysis_sea_conquest(data):
    header("PPP. SEA CONQUEST (longship proxy)")

    # Do owner flips ever happen between settlements not connected by land?
    # This would indicate longship-based conquest.
    land_flips = 0
    sea_flips = 0
    port_attacker_flips = 0
    non_port_attacker_flips = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_grid = run.frames[0].grid
            land = np.isin(initial_grid, [0, 1, 2, 3, 4, 5, 11])
            h, w = initial_grid.shape

            # Compute land connectivity
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

                    # Find nearest attacker (same owner as new)
                    new_owner = c.owner_id
                    min_dist = float('inf')
                    attacker = None
                    attacker_pos = None
                    for apos, a in prev_alive.items():
                        if a.owner_id == new_owner and apos != pos:
                            d = abs(apos[0] - pos[0]) + abs(apos[1] - pos[1])
                            if d < min_dist:
                                min_dist = d
                                attacker = a
                                attacker_pos = apos

                    if attacker_pos is not None:
                        # Check if on same land component
                        target_comp = component[pos[1], pos[0]]
                        attacker_comp = component[attacker_pos[1], attacker_pos[0]]
                        if target_comp == attacker_comp and target_comp >= 0:
                            land_flips += 1
                        else:
                            sea_flips += 1

                        if attacker.has_port:
                            port_attacker_flips += 1
                        else:
                            non_port_attacker_flips += 1

    total = land_flips + sea_flips
    print(f"Owner flips by connectivity:")
    print(f"  Same land component: {land_flips}/{total} ({land_flips/max(1,total)*100:.1f}%)")
    print(f"  Different component (sea): {sea_flips}/{total} ({sea_flips/max(1,total)*100:.1f}%)")

    total_att = port_attacker_flips + non_port_attacker_flips
    print(f"\nAttacker port status:")
    print(f"  Attacker has port: {port_attacker_flips}/{total_att} ({port_attacker_flips/max(1,total_att)*100:.1f}%)")
    print(f"  Attacker no port:  {non_port_attacker_flips}/{total_att} ({non_port_attacker_flips/max(1,total_att)*100:.1f}%)")


# ---------------------------------------------------------------------------
# QQQ: Initial vs Founded Settlement Survival
# ---------------------------------------------------------------------------

def analysis_initial_vs_founded_survival(data):
    header("QQQ. INITIAL vs FOUNDED SETTLEMENT SURVIVAL")

    initial_survived = 0
    initial_total = 0
    founded_survived = 0
    founded_total = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            initial_positions = {(s.x, s.y) for s in run.frames[0].settlements if s.alive}
            alive_at_50 = {(s.x, s.y) for s in run.frames[-1].settlements if s.alive}

            # Track which positions were founded (not initial)
            founded_positions = set()
            for fi in range(1, len(run.frames)):
                for s in run.frames[fi].settlements:
                    if s.alive and (s.x, s.y) not in initial_positions:
                        founded_positions.add((s.x, s.y))

            for pos in initial_positions:
                initial_total += 1
                if pos in alive_at_50:
                    initial_survived += 1

            for pos in founded_positions:
                founded_total += 1
                if pos in alive_at_50:
                    founded_survived += 1

    ir = initial_survived / max(1, initial_total)
    fr = founded_survived / max(1, founded_total)
    print(f"Initial settlement survival to year 50:")
    print(f"  {initial_survived}/{initial_total} = {ir:.4f}")
    print(f"\nFounded settlement survival to year 50:")
    print(f"  {founded_survived}/{founded_total} = {fr:.4f}")
    print(f"\n  (note: founded includes those founded at any year, many near end of game)")


# ---------------------------------------------------------------------------
# RRR: Do Settlements Fill Gaps?
# ---------------------------------------------------------------------------

def analysis_founding_pattern(data):
    header("RRR. FOUNDING PATTERNS (do settlements fill gaps?)")

    # When a new settlement is founded, how many of its 4-neighbors are already settlements?
    neighbor_count_dist = defaultdict(int)
    total_foundings = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_frame = run.frames[fi]
                curr_frame = run.frames[fi + 1]
                prev_idx = {(s.x, s.y): s for s in prev_frame.settlements}
                curr_idx = {(s.x, s.y): s for s in curr_frame.settlements}
                h, w = prev_frame.grid.shape

                for pos, s in curr_idx.items():
                    if not s.alive:
                        continue
                    prev_s = prev_idx.get(pos)
                    if prev_s is not None and prev_s.alive:
                        continue
                    prev_code = int(prev_frame.grid[pos[1], pos[0]])
                    if prev_code == 3:
                        continue  # rebuild

                    x, y = pos
                    # Count settlement/port neighbors
                    n_settl = 0
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            code = int(prev_frame.grid[ny, nx])
                            if code in (1, 2):
                                n_settl += 1
                    neighbor_count_dist[n_settl] += 1
                    total_foundings += 1

    print(f"Settlement neighbors at founding position (4-connected):")
    print(f"  Total foundings: {total_foundings}\n")
    for n in range(5):
        count = neighbor_count_dist.get(n, 0)
        pct = count / max(1, total_foundings) * 100
        print(f"    {n} settlement neighbors: {count:6d} ({pct:.1f}%)")


# ---------------------------------------------------------------------------
# SSS: Food Production Regression
# ---------------------------------------------------------------------------

def analysis_food_regression(data):
    header("SSS. FOOD PRODUCTION REGRESSION")

    # Simple linear regression: food_delta ~ prev_food + prev_pop + n_plains + n_forest + n_settlement + n_ocean
    X_list = []
    y_list = []

    sample_count = 0
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
                    if p.food is None or c.food is None or p.population is None:
                        continue

                    x, y = pos
                    n_plains = 0
                    n_forest = 0
                    n_settlement = 0
                    n_ocean = 0
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            code = int(prev_frame.grid[ny, nx])
                            if code == 11:
                                n_plains += 1
                            elif code == 4:
                                n_forest += 1
                            elif code in (1, 2):
                                n_settlement += 1
                            elif code == 10:
                                n_ocean += 1

                    X_list.append([1.0, p.food, p.population, n_plains, n_forest, n_settlement, n_ocean])
                    y_list.append(c.food - p.food)
                    sample_count += 1

                    if sample_count >= 500000:
                        break
                if sample_count >= 500000:
                    break
            if sample_count >= 500000:
                break
        if sample_count >= 500000:
            break

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)

    # OLS regression
    try:
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        y_pred = X @ beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - ss_res / ss_tot

        feature_names = ["intercept", "prev_food", "prev_pop", "n_plains", "n_forest", "n_settlement", "n_ocean"]
        print(f"Linear regression: food_delta ~ features (n={len(y)})")
        print(f"R-squared: {r_squared:.4f}\n")
        for name, coef in zip(feature_names, beta):
            print(f"  {name:>15}: {coef:+.6f}")
    except Exception as e:
        print(f"Regression failed: {e}")


# ---------------------------------------------------------------------------
# TTT: Terminal State Probability by Distance to Coast
# ---------------------------------------------------------------------------

def analysis_terminal_by_coast_distance(data):
    header("TTT. TERMINAL STATE BY DISTANCE TO COAST")

    by_dist = defaultdict(lambda: np.zeros(CLASS_COUNT, dtype=np.int64))

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            ocean = initial == 10

            # BFS distance from ocean
            coast_dist = np.full((h, w), -1, dtype=np.int32)
            queue = []
            for y in range(h):
                for x in range(w):
                    if ocean[y, x]:
                        coast_dist[y, x] = 0
                        queue.append((y, x))
            idx = 0
            while idx < len(queue):
                cy, cx = queue[idx]
                idx += 1
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and coast_dist[ny, nx] < 0:
                        coast_dist[ny, nx] = coast_dist[cy, cx] + 1
                        queue.append((ny, nx))

            for run in runs:
                tg = collapse_internal_grid(run.frames[-1].grid)
                for y in range(h):
                    for x in range(w):
                        d = min(int(coast_dist[y, x]), 15)
                        tc = int(tg[y, x])
                        by_dist[d][tc] += 1

    print("Terminal class probability by distance from coast:\n")
    print(f"{'Dist':>5}  {'empty':>7}  {'settl':>7}  {'port':>7}  {'ruin':>7}  {'forest':>7}  {'mount':>7}  {'N':>7}")
    print("-" * 70)
    for d in range(16):
        counts = by_dist[d]
        total = counts.sum()
        if total > 0:
            probs = counts / total
            print(f"{d:5d}  {probs[0]:7.4f}  {probs[1]:7.4f}  {probs[2]:7.4f}  "
                  f"{probs[3]:7.4f}  {probs[4]:7.4f}  {probs[5]:7.4f}  {total:7d}")


# ---------------------------------------------------------------------------
# UUU: Do All Rounds Have Same Cycle Phase?
# ---------------------------------------------------------------------------

def analysis_cycle_phase_by_round(data):
    header("UUU. CYCLE PHASE CONSISTENCY ACROSS ROUNDS")

    # Check if births peak at the same mod-4 step in every round
    for round_id in sorted(data.keys()):
        births_by_step = np.zeros(50, dtype=np.float64)
        n_runs = 0
        for seed_index, runs in data[round_id].items():
            for run in runs:
                n_runs += 1
                for fi in range(min(len(run.frames) - 1, 50)):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    for pos, s in curr_idx.items():
                        if s.alive:
                            prev_s = prev_idx.get(pos)
                            if prev_s is None or not prev_s.alive:
                                pc = int(run.frames[fi].grid[pos[1], pos[0]])
                                if pc != 3:
                                    births_by_step[fi] += 1
        births_by_step /= max(1, n_runs)

        # Find first major birth spike
        first_spike = -1
        for i in range(2, 20):
            if births_by_step[i] > 2 * np.mean(births_by_step[:20]):
                first_spike = i
                break

        # Find all spike steps
        threshold = np.mean(births_by_step) * 1.5
        spikes = [i for i in range(50) if births_by_step[i] > threshold]
        spike_mods = [s % 4 for s in spikes]

        print(f"  {round_id[:8]}.. : first_spike=step {first_spike}  "
              f"spikes_mod4={sorted(set(spike_mods))}  "
              f"first_5_births: {' '.join(f'{births_by_step[i]:.1f}' for i in range(5))}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 10 replay EDA")
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
        ("PPP", analysis_sea_conquest),
        ("QQQ", analysis_initial_vs_founded_survival),
        ("RRR", analysis_founding_pattern),
        ("SSS", analysis_food_regression),
        ("TTT", analysis_terminal_by_coast_distance),
        ("UUU", analysis_cycle_phase_by_round),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-10 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
