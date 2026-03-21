"""Wave 12 EDA: food formula per-seed validation, early-step regime estimation,
terminal probability prediction from regime coefficients.

Run: uv run python scripts/replay_eda_wave12.py [--max-runs-per-seed N]
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


def fit_food_formula(runs, step_range=None):
    """Fit food_delta ~ intercept + food + pop + plains + forest."""
    X_list = []
    y_list = []
    for run in runs:
        for fi in range(len(run.frames) - 1):
            if step_range and not (step_range[0] <= fi < step_range[1]):
                continue
            prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
            curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
            h, w = run.frames[fi].grid.shape
            for pos in set(prev_idx) & set(curr_idx):
                p, c = prev_idx[pos], curr_idx[pos]
                if not (p.alive and c.alive) or p.food is None or c.food is None or p.population is None:
                    continue
                x, y = pos
                n_plains = n_forest = 0
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

    if len(X_list) < 20:
        return None, None, 0
    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    y_pred = X @ beta
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r2 = 1 - ss_res / max(1e-9, ss_tot)
    return beta, r2, len(y)


# ---------------------------------------------------------------------------
# BBBB: Per-Seed Food Formula (within-round consistency)
# ---------------------------------------------------------------------------

def analysis_per_seed_food(data):
    header("BBBB. PER-SEED FOOD FORMULA (within-round consistency)")

    print("Verifying that food formula coefficients are consistent across seeds within each round:\n")

    for round_id in sorted(data.keys()):
        print(f"Round {round_id[:8]}..:")
        seed_betas = []
        for seed_index in sorted(data[round_id].keys()):
            runs = data[round_id][seed_index]
            beta, r2, n = fit_food_formula(runs)
            if beta is not None:
                seed_betas.append(beta)
                print(f"  Seed {seed_index} (n={n:5d}, R²={r2:.3f}): "
                      f"int={beta[0]:+.3f} food={beta[1]:+.3f} pop={beta[2]:+.3f} "
                      f"pln={beta[3]:+.3f} for={beta[4]:+.3f}")

        if len(seed_betas) >= 2:
            betas = np.array(seed_betas)
            cv_per_coef = np.std(betas, axis=0) / (np.abs(np.mean(betas, axis=0)) + 1e-9)
            names = ["intercept", "food", "pop", "plains", "forest"]
            print(f"  Cross-seed CV: {' '.join(f'{names[i]}={cv_per_coef[i]:.3f}' for i in range(5))}")
        print()


# ---------------------------------------------------------------------------
# CCCC: Early-Step Regime Estimation
# ---------------------------------------------------------------------------

def analysis_early_regime(data):
    header("CCCC. EARLY-STEP REGIME ESTIMATION")

    print("Can we estimate the regime from only the first 10 steps?\n")

    for round_id in sorted(data.keys()):
        all_runs = [r for sd in data[round_id].values() for r in sd]
        if not all_runs:
            continue

        # Fit from first 10 steps
        beta_early, r2_early, n_early = fit_food_formula(all_runs, step_range=(0, 10))
        # Fit from all steps (ground truth)
        beta_full, r2_full, n_full = fit_food_formula(all_runs)

        if beta_early is not None and beta_full is not None:
            # Cosine similarity between coefficient vectors
            cos_sim = float(np.dot(beta_early, beta_full) / (np.linalg.norm(beta_early) * np.linalg.norm(beta_full) + 1e-9))

            print(f"  {round_id[:8]}..:")
            print(f"    Early (steps 0-9, n={n_early:5d}): int={beta_early[0]:+.3f} food={beta_early[1]:+.3f} pop={beta_early[2]:+.3f}")
            print(f"    Full  (all steps, n={n_full:5d}):  int={beta_full[0]:+.3f} food={beta_full[1]:+.3f} pop={beta_full[2]:+.3f}")
            print(f"    Cosine similarity: {cos_sim:.4f}")
            print()


# ---------------------------------------------------------------------------
# DDDD: Regime Fingerprint -> Terminal State Prediction
# ---------------------------------------------------------------------------

def analysis_regime_terminal_prediction(data):
    header("DDDD. REGIME FINGERPRINT -> TERMINAL STATE")

    # For each round, compute regime features and terminal class distribution
    # Then see if regime features predict terminal distribution
    regime_features = []
    terminal_dists = []

    for round_id in sorted(data.keys()):
        all_runs = [r for sd in data[round_id].values() for r in sd]
        if not all_runs:
            continue

        beta, r2, n = fit_food_formula(all_runs)
        if beta is None:
            continue

        # Terminal class distribution (scored classes)
        counts = np.zeros(CLASS_COUNT, dtype=np.float64)
        total_cells = 0
        for run in all_runs:
            tg = collapse_internal_grid(run.frames[-1].grid)
            for c in range(CLASS_COUNT):
                counts[c] += np.count_nonzero(tg == c)
            total_cells += tg.size
        probs = counts / max(1, total_cells)

        # Regime features: food formula coefficients + collapse rate + founding rate
        collapse_count = 0
        alive_count = 0
        birth_count = 0
        for run in all_runs:
            for fi in range(len(run.frames) - 1):
                prev_idx = {(s.x, s.y): s for s in run.frames[fi].settlements}
                curr_idx = {(s.x, s.y): s for s in run.frames[fi + 1].settlements}
                for pos in prev_idx:
                    p = prev_idx[pos]
                    if p.alive:
                        alive_count += 1
                        c = curr_idx.get(pos)
                        if c is None or not c.alive:
                            collapse_count += 1
                for pos, s in curr_idx.items():
                    if s.alive:
                        prev_s = prev_idx.get(pos)
                        if prev_s is None or not prev_s.alive:
                            pc = int(run.frames[fi].grid[pos[1], pos[0]])
                            if pc != 3:
                                birth_count += 1

        collapse_rate = collapse_count / max(1, alive_count)
        founding_rate = birth_count / max(1, alive_count)

        regime_features.append(np.concatenate([beta, [collapse_rate, founding_rate]]))
        terminal_dists.append(probs)

    if len(regime_features) < 3:
        print("Not enough rounds for regression")
        return

    R = np.array(regime_features)
    T = np.array(terminal_dists)

    # Correlate each regime feature with each terminal class probability
    regime_names = ["food_intercept", "food_reversion", "food_pop_cost", "food_plains", "food_forest",
                    "collapse_rate", "founding_rate"]

    print("Correlation between regime features and terminal class probabilities:\n")
    print(f"{'Feature':>20}  " + "  ".join(f"{CLASS_NAMES[c][:6]:>8}" for c in range(CLASS_COUNT)))
    print("-" * 80)

    for i, name in enumerate(regime_names):
        corrs = []
        for c in range(CLASS_COUNT):
            if np.std(R[:, i]) > 1e-9 and np.std(T[:, c]) > 1e-9:
                r = float(np.corrcoef(R[:, i], T[:, c])[0, 1])
            else:
                r = 0.0
            corrs.append(r)
        print(f"{name:>20}  " + "  ".join(f"{r:+8.3f}" for r in corrs))


# ---------------------------------------------------------------------------
# EEEE: What Determines Terminal Cell Class? (cell-level regression)
# ---------------------------------------------------------------------------

def analysis_cell_terminal_regression(data):
    header("EEEE. CELL-LEVEL TERMINAL CLASS PREDICTION")

    # For each cell, predict P(settlement at year 50) from initial features
    # Features: initial terrain, distance to settlement, distance to coast, nearby forest density

    X_list = []
    y_list = []

    for round_id, seeds in data.items():
        for seed_index, runs in seeds.items():
            initial = runs[0].frames[0].grid
            h, w = initial.shape
            ocean = initial == 10
            forest = initial == 4
            init_pos = [(s.y, s.x) for s in runs[0].frames[0].settlements if s.alive]

            # BFS distance from ocean
            coast_dist = np.full((h, w), 99, dtype=np.int32)
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
                    if 0 <= ny < h and 0 <= nx < w and coast_dist[ny, nx] > coast_dist[cy, cx] + 1:
                        coast_dist[ny, nx] = coast_dist[cy, cx] + 1
                        queue.append((ny, nx))

            for run in runs:
                tg = collapse_internal_grid(run.frames[-1].grid)
                for y in range(h):
                    for x in range(w):
                        ic = int(initial[y, x])
                        if ic in (5, 10):  # skip mountain/ocean
                            continue

                        # Features
                        is_settlement = 1 if ic == 1 else 0
                        is_port = 1 if ic == 2 else 0
                        is_forest = 1 if ic == 4 else 0
                        is_plains = 1 if ic == 11 else 0

                        if init_pos:
                            dist_settl = min(abs(y - sy) + abs(x - sx) for sy, sx in init_pos)
                        else:
                            dist_settl = 99
                        cd = int(coast_dist[y, x])

                        # Local forest density (3x3)
                        y0, y1 = max(0, y - 1), min(h, y + 2)
                        x0, x1 = max(0, x - 1), min(w, x + 2)
                        fd = float(np.mean(forest[y0:y1, x0:x1]))

                        is_built = 1 if int(tg[y, x]) in (1, 2) else 0  # settlement or port

                        X_list.append([1.0, is_settlement, is_port, is_forest, is_plains,
                                       dist_settl, min(cd, 15), fd])
                        y_list.append(float(is_built))

                        if len(X_list) >= 500000:
                            break
                    if len(X_list) >= 500000:
                        break
                if len(X_list) >= 500000:
                    break
            if len(X_list) >= 500000:
                break
        if len(X_list) >= 500000:
            break

    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)

    try:
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        y_pred = X @ beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - ss_res / ss_tot

        names = ["intercept", "is_settlement", "is_port", "is_forest", "is_plains",
                 "dist_settlement", "coast_dist", "forest_density"]
        print(f"P(settlement+port at year 50) ~ initial features (n={len(y)})")
        print(f"Base rate: {np.mean(y):.4f}")
        print(f"R-squared: {r2:.4f}\n")
        for name, coef in zip(names, beta):
            print(f"  {name:>18}: {coef:+.6f}")
    except Exception as e:
        print(f"Regression failed: {e}")


# ---------------------------------------------------------------------------
# FFFF: Growth Curve Shape (logistic fit attempt)
# ---------------------------------------------------------------------------

def analysis_growth_curve(data):
    header("FFFF. GROWTH CURVE SHAPE (per round)")

    for round_id in sorted(data.keys()):
        all_runs = [r for sd in data[round_id].values() for r in sd]
        if not all_runs:
            continue

        alive_curves = np.array([
            [sum(1 for s in run.frames[fi].settlements if s.alive) for fi in range(len(run.frames))]
            for run in all_runs
        ], dtype=np.float64)

        mean_curve = np.mean(alive_curves, axis=0)

        # Compute growth rates between checkpoints
        checkpoints = [0, 10, 20, 30, 40, 50]
        growth_rates = []
        for i in range(len(checkpoints) - 1):
            t0, t1 = checkpoints[i], checkpoints[i + 1]
            if mean_curve[t0] > 0:
                rate = (mean_curve[t1] / mean_curve[t0]) ** (1.0 / (t1 - t0)) - 1
                growth_rates.append(rate)
            else:
                growth_rates.append(0.0)

        # Try logistic fit: N(t) = K / (1 + (K/N0 - 1) * exp(-r*t))
        N0 = mean_curve[0]
        Nf = mean_curve[-1]
        if N0 > 0 and Nf > N0:
            # Estimate K (carrying capacity) as 2*Nf - N0 (rough)
            K = 2 * Nf
            # Estimate r from midpoint
            mid = mean_curve[25]
            if mid > N0 and mid < K:
                r_est = np.log((K / N0 - 1) * N0 / (K - N0)) / 25  # rough
            else:
                r_est = 0.0
        else:
            K = Nf
            r_est = 0.0

        print(f"  {round_id[:8]}.. : N0={N0:.0f}  N50={Nf:.0f}  ratio={Nf/max(1,N0):.2f}  "
              f"K_est={K:.0f}  growth_rates={' '.join(f'{r:.4f}' for r in growth_rates)}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wave 12 replay EDA")
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
        ("BBBB", analysis_per_seed_food),
        ("CCCC", analysis_early_regime),
        ("DDDD", analysis_regime_terminal_prediction),
        ("EEEE", analysis_cell_terminal_regression),
        ("FFFF", analysis_growth_curve),
    ]

    for label, fn in analyses:
        t1 = time.time()
        fn(data)
        print(f"\n  [Analysis {label} took {time.time() - t1:.1f}s]")

    print(f"\n{'='*72}")
    print(f"  Total wave-12 EDA time: {time.time() - t0:.1f}s")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
