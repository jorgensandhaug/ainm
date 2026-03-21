"""Wave 11 EDA: population regression, defense formula, collapse logistic model,
port loss conditions, wealth flow, per-round food formula.

Run: uv run python scripts/replay_eda_wave11.py [--max-runs-per-seed N]
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
# VVV: Population Growth Regression
# ---------------------------------------------------------------------------

def analysis_pop_regression(data):
    header("VVV. POPULATION GROWTH REGRESSION")

    X_list = []
    y_list = []
    count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.population is None or c.population is None or p.food is None or p.defense is None:
                        continue

                    X_list.append([1.0, p.population, p.food, p.defense,
                                   p.population * p.food, p.population ** 2])
                    y_list.append(c.population - p.population)
                    count += 1
                    if count >= 500000:
                        break
                if count >= 500000:
                    break
            if count >= 500000:
                break
        if count >= 500000:
            break

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)

    try:
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        y_pred = X @ beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - ss_res / ss_tot

        names = ["intercept", "pop", "food", "defense", "pop*food", "pop^2"]
        print(f"Linear regression: pop_delta ~ features (n={len(y)})")
        print(f"R-squared: {r2:.4f}\n")
        for name, coef in zip(names, beta):
            print(f"  {name:>12}: {coef:+.6f}")
    except Exception as e:
        print(f"Regression failed: {e}")


# ---------------------------------------------------------------------------
# WWW: Defense Gain Regression
# ---------------------------------------------------------------------------

def analysis_defense_regression(data):
    header("WWW. DEFENSE GAIN REGRESSION")

    X_list = []
    y_list = []
    count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                for pos in set(prev_idx) & set(curr_idx):
                    p, c = prev_idx[pos], curr_idx[pos]
                    if not (p.alive and c.alive):
                        continue
                    if p.defense is None or c.defense is None or p.population is None or p.food is None:
                        continue

                    X_list.append([1.0, p.defense, p.population, p.food,
                                   p.defense ** 2, p.defense * p.population])
                    y_list.append(c.defense - p.defense)
                    count += 1
                    if count >= 500000:
                        break
                if count >= 500000:
                    break
            if count >= 500000:
                break
        if count >= 500000:
            break

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)

    try:
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        y_pred = X @ beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - ss_res / ss_tot

        names = ["intercept", "defense", "pop", "food", "defense^2", "defense*pop"]
        print(f"Linear regression: defense_delta ~ features (n={len(y)})")
        print(f"R-squared: {r2:.4f}\n")
        for name, coef in zip(names, beta):
            print(f"  {name:>15}: {coef:+.6f}")
    except Exception as e:
        print(f"Regression failed: {e}")


# ---------------------------------------------------------------------------
# XXX: Collapse Probability Model
# ---------------------------------------------------------------------------

def analysis_collapse_model(data):
    header("XXX. COLLAPSE PROBABILITY MODEL")

    X_list = []
    y_list = []
    count = 0

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                h, w = run.frames[fi].grid.shape

                for pos in prev_idx:
                    p = prev_idx[pos]
                    if not p.alive:
                        continue
                    if p.population is None or p.food is None or p.defense is None:
                        continue
                    c = curr_idx.get(pos)
                    collapsed = c is None or not c.alive

                    x, y = pos
                    # Count nearby enemy/friendly
                    n_friendly = 0
                    n_enemy = 0
                    for s2 in run.frames[fi].settlements:
                        if s2.alive and (s2.x, s2.y) != pos:
                            d = abs(s2.x - x) + abs(s2.y - y)
                            if d <= 3:
                                if s2.owner_id is not None and p.owner_id is not None and s2.owner_id == p.owner_id:
                                    n_friendly += 1
                                elif s2.owner_id is not None and p.owner_id is not None:
                                    n_enemy += 1

                    X_list.append([1.0, p.population, p.food, p.defense,
                                   n_friendly, n_enemy, p.food * p.defense])
                    y_list.append(1.0 if collapsed else 0.0)
                    count += 1
                    if count >= 300000:
                        break
                if count >= 300000:
                    break
            if count >= 300000:
                break
        if count >= 300000:
            break

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)

    try:
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        y_pred = X @ beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - ss_res / ss_tot

        names = ["intercept", "pop", "food", "defense", "n_friendly", "n_enemy", "food*defense"]
        print(f"Linear probability model: P(collapse) ~ features (n={len(y)})")
        print(f"Base rate: {np.mean(y):.4f}")
        print(f"R-squared: {r2:.4f}\n")
        for name, coef in zip(names, beta):
            print(f"  {name:>15}: {coef:+.6f}")

        # Predicted vs actual in buckets
        print(f"\nCalibration check:")
        for bucket in [(0, 0.05), (0.05, 0.10), (0.10, 0.15), (0.15, 0.20), (0.20, 0.40)]:
            mask = (y_pred >= bucket[0]) & (y_pred < bucket[1])
            if np.any(mask):
                actual = np.mean(y[mask])
                predicted = np.mean(y_pred[mask])
                n = np.sum(mask)
                print(f"  pred [{bucket[0]:.2f}, {bucket[1]:.2f}): actual={actual:.4f}  pred={predicted:.4f}  n={n}")
    except Exception as e:
        print(f"Regression failed: {e}")


# ---------------------------------------------------------------------------
# YYY: Port Loss Conditions
# ---------------------------------------------------------------------------

def analysis_port_loss(data):
    header("YYY. PORT LOSS CONDITIONS")

    # When does a port lose its port status (becomes settlement or collapses)?
    port_lost_pop = []
    port_lost_food = []
    port_lost_defense = []
    port_kept_pop = []
    port_kept_food = []
    port_kept_defense = []
    port_to_what = defaultdict(int)

    for runs in (sd for rd in data.values() for sd in rd.values()):
        for run in runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}

                for pos in prev_idx:
                    p = prev_idx[pos]
                    if not p.alive or not p.has_port:
                        continue
                    c = curr_idx.get(pos)

                    if c is not None and c.alive and c.has_port:
                        # Kept port
                        if p.population is not None:
                            port_kept_pop.append(p.population)
                            port_kept_food.append(p.food)
                            port_kept_defense.append(p.defense)
                    else:
                        # Lost port
                        if p.population is not None:
                            port_lost_pop.append(p.population)
                            port_lost_food.append(p.food)
                            port_lost_defense.append(p.defense)

                        next_code = int(run.frames[fi + 1].grid[pos[1], pos[0]])
                        from astar.core.terrain import INTERNAL_TO_SCORED
                        code_name = {0: "empty", 1: "settlement", 2: "port", 3: "ruin",
                                     4: "forest", 5: "mountain", 10: "ocean", 11: "plains"}
                        port_to_what[code_name.get(next_code, str(next_code))] += 1

    total_port = len(port_lost_pop) + len(port_kept_pop)
    print(f"Port observations: {total_port}")
    print(f"  Kept: {len(port_kept_pop)} ({len(port_kept_pop)/max(1,total_port)*100:.1f}%)")
    print(f"  Lost: {len(port_lost_pop)} ({len(port_lost_pop)/max(1,total_port)*100:.1f}%)\n")

    if port_lost_pop:
        print(f"Stats of ports before loss vs kept:")
        for name, lost, kept in [
            ("population", port_lost_pop, port_kept_pop),
            ("food", port_lost_food, port_kept_food),
            ("defense", port_lost_defense, port_kept_defense),
        ]:
            l = np.array(lost)
            k = np.array(kept)
            print(f"  {name:>10}: lost_mean={np.mean(l):.3f}  kept_mean={np.mean(k):.3f}")

    if port_to_what:
        print(f"\nPort loss transitions:")
        for code, count in sorted(port_to_what.items(), key=lambda x: -x[1]):
            print(f"  -> {code}: {count}")


# ---------------------------------------------------------------------------
# ZZZ: Per-Round Food Formula Coefficients
# ---------------------------------------------------------------------------

def analysis_per_round_food(data):
    header("ZZZ. PER-ROUND FOOD FORMULA COEFFICIENTS")

    for round_id in sorted(data.keys()):
        X_list = []
        y_list = []
        count = 0

        for seed_index, runs in data[round_id].items():
            for run in runs:
                for fi in range(len(run.frames) - 1):
                    prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                    curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                    h, w = run.frames[fi].grid.shape

                    for pos in set(prev_idx) & set(curr_idx):
                        p, c = prev_idx[pos], curr_idx[pos]
                        if not (p.alive and c.alive):
                            continue
                        if p.food is None or c.food is None or p.population is None:
                            continue

                        x, y = pos
                        n_plains = 0
                        n_forest = 0
                        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w:
                                code = int(run.frames[fi].grid[ny, nx])
                                if code == 11:
                                    n_plains += 1
                                elif code == 4:
                                    n_forest += 1

                        X_list.append([1.0, p.food, p.population, n_plains, n_forest])
                        y_list.append(c.food - p.food)
                        count += 1

        if count < 100:
            continue

        X = np.array(X_list, dtype=np.float64)
        y = np.array(y_list, dtype=np.float64)

        try:
            beta = np.linalg.lstsq(X, y, rcond=None)[0]
            y_pred = X @ beta
            ss_res = np.sum((y - y_pred) ** 2)
            ss_tot = np.sum((y - np.mean(y)) ** 2)
            r2 = 1 - ss_res / ss_tot

            print(f"  {round_id[:8]}.. (n={count:6d}, R²={r2:.3f}): "
                  f"intercept={beta[0]:+.3f}  food={beta[1]:+.3f}  pop={beta[2]:+.3f}  "
                  f"plains={beta[3]:+.3f}  forest={beta[4]:+.3f}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# AAAA: Settlement Founding: Which Cells Get Chosen?
# ---------------------------------------------------------------------------

def analysis_founding_cell_choice(data):
    header("AAAA. FOUNDING CELL CHOICE (which specific cell gets the new settlement?)")

    # When a settlement is founded, compare the chosen cell to non-chosen neighbors
    chosen_plains_neighbors = []
    chosen_forest_neighbors = []
    unchosen_plains_neighbors = []
    unchosen_forest_neighbors = []

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
                        continue
                    if prev_code not in (4, 11):
                        continue

                    x, y = pos
                    # This is the chosen cell -- count its neighbors
                    n_p = 0
                    n_f = 0
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            nc = int(prev_frame.grid[ny, nx])
                            if nc == 11:
                                n_p += 1
                            elif nc == 4:
                                n_f += 1
                    chosen_plains_neighbors.append(n_p)
                    chosen_forest_neighbors.append(n_f)

                    # Now find unchosen alternatives nearby
                    for dy in range(-2, 3):
                        for dx in range(-2, 3):
                            if dy == 0 and dx == 0:
                                continue
                            ay, ax = y + dy, x + dx
                            if 0 <= ay < h and 0 <= ax < w:
                                ac = int(prev_frame.grid[ay, ax])
                                if ac not in (4, 11):
                                    continue
                                # Is this cell NOT a new settlement?
                                if (ax, ay) not in curr_idx or not curr_idx[(ax, ay)].alive:
                                    n_p2 = 0
                                    n_f2 = 0
                                    for dy2, dx2 in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                                        ny2, nx2 = ay + dy2, ax + dx2
                                        if 0 <= ny2 < h and 0 <= nx2 < w:
                                            nc2 = int(prev_frame.grid[ny2, nx2])
                                            if nc2 == 11:
                                                n_p2 += 1
                                            elif nc2 == 4:
                                                n_f2 += 1
                                    unchosen_plains_neighbors.append(n_p2)
                                    unchosen_forest_neighbors.append(n_f2)

    if chosen_plains_neighbors:
        cp = np.mean(chosen_plains_neighbors)
        cf = np.mean(chosen_forest_neighbors)
        up = np.mean(unchosen_plains_neighbors) if unchosen_plains_neighbors else 0
        uf = np.mean(unchosen_forest_neighbors) if unchosen_forest_neighbors else 0
        print(f"Terrain neighbors of chosen vs unchosen founding cells:")
        print(f"  Plains neighbors: chosen={cp:.3f}  unchosen={up:.3f}")
        print(f"  Forest neighbors: chosen={cf:.3f}  unchosen={uf:.3f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 11 replay EDA")
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
        ("VVV", analysis_pop_regression),
        ("WWW", analysis_defense_regression),
        ("XXX", analysis_collapse_model),
        ("YYY", analysis_port_loss),
        ("ZZZ", analysis_per_round_food),
        ("AAAA", analysis_founding_cell_choice),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-11 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
