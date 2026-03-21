"""Per-cell Markov transition teacher from full replay trajectories.

KEY RADICAL IDEA: Learn the actual dynamics from replay data.
For each cell, learn P(next_class | current_class, local_features, year).
Then Monte Carlo rollout from the initial map to get year-50 distributions.

This uses ALL 51 frames from each replay, not just the final year.
With 2366 replays × 50 transitions × 1600 cells = 189M transition examples.

Usage:
    uv run python scripts/agent4_markov_teacher.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def _neighbor_class_counts(grid_collapsed: np.ndarray, num_classes: int = 6) -> np.ndarray:
    """Count of each class in 8-connected neighborhood. Returns (H, W, num_classes)."""
    h, w = grid_collapsed.shape
    counts = np.zeros((h, w, num_classes), dtype=np.float64)
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            sy = slice(max(0, -dy), min(h, h - dy))
            sx = slice(max(0, -dx), min(w, w - dx))
            ty = slice(max(0, dy), min(h, h + dy))
            tx = slice(max(0, dx), min(w, w + dx))
            for cls in range(num_classes):
                counts[ty, tx, cls] += (grid_collapsed[sy, sx] == cls).astype(np.float64)
    return counts


def _build_transition_features(
    grid_collapsed: np.ndarray,
    initial_collapsed: np.ndarray,
    year: int,
    settlements: list[dict] | None = None,
) -> np.ndarray:
    """Build per-cell features for transition prediction.

    Returns (H*W, F) feature matrix.
    """
    from astar.core.terrain import CLASS_COUNT

    h, w = grid_collapsed.shape
    features = []

    # 1. Current class one-hot (6)
    for cls in range(CLASS_COUNT):
        features.append((grid_collapsed == cls).astype(np.float64).ravel())

    # 2. Initial class one-hot (6)
    for cls in range(CLASS_COUNT):
        features.append((initial_collapsed == cls).astype(np.float64).ravel())

    # 3. Neighbor class counts (6)
    nbr = _neighbor_class_counts(grid_collapsed)
    for cls in range(CLASS_COUNT):
        features.append(nbr[:, :, cls].ravel())

    # 4. Initial neighbor class counts (6)
    init_nbr = _neighbor_class_counts(initial_collapsed)
    for cls in range(CLASS_COUNT):
        features.append(init_nbr[:, :, cls].ravel())

    # 5. Year features (3)
    features.append(np.full(h * w, year / 50.0))
    features.append(np.full(h * w, (year / 50.0) ** 2))
    features.append(np.full(h * w, np.sin(year * np.pi / 25.0)))

    # 6. Wider neighborhood (radius 2) class counts (6)
    nbr2 = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if abs(dy) <= 1 and abs(dx) <= 1:
                continue
            sy = slice(max(0, -dy), min(h, h - dy))
            sx = slice(max(0, -dx), min(w, w - dx))
            ty = slice(max(0, dy), min(h, h + dy))
            tx = slice(max(0, dx), min(w, w + dx))
            for cls in range(CLASS_COUNT):
                nbr2[ty, tx, cls] += (grid_collapsed[sy, sx] == cls).astype(np.float64)
    for cls in range(CLASS_COUNT):
        features.append(nbr2[:, :, cls].ravel())

    # 7. Position features (4)
    yy, xx = np.mgrid[0:h, 0:w]
    features.append((yy.ravel() / max(h-1, 1)).astype(np.float64))
    features.append((xx.ravel() / max(w-1, 1)).astype(np.float64))
    # Edge distance
    edge = np.minimum(np.minimum(yy, h-1-yy), np.minimum(xx, w-1-xx)).astype(np.float64) / max(min(h,w)/2, 1)
    features.append(edge.ravel())
    # Is sea neighbor (for port prediction)
    from astar.core.terrain import sea_mask
    # We need the original internal grid for sea_mask, but we only have collapsed
    # Use class 0 as proxy for sea (ocean, plains, empty are all class 0)
    # Approximate: cells at map edge are likely sea-adjacent
    features.append((edge <= 0.05).astype(np.float64).ravel())

    # 8. Settlement statistics from replay frame (if available)
    if settlements:
        pop_map = np.zeros(h * w, dtype=np.float64)
        food_map = np.zeros(h * w, dtype=np.float64)
        wealth_map = np.zeros(h * w, dtype=np.float64)
        alive_map = np.zeros(h * w, dtype=np.float64)
        for s in settlements:
            idx = int(s.get('y', 0)) * w + int(s.get('x', 0))
            if 0 <= idx < h * w:
                pop_map[idx] = float(s.get('population', 0)) / 5.0
                food_map[idx] = float(s.get('food', 0)) / 2.0
                wealth_map[idx] = float(s.get('wealth', 0)) / 2.0
                alive_map[idx] = float(s.get('alive', False))
        features.extend([pop_map, food_map, wealth_map, alive_map])
    else:
        for _ in range(4):
            features.append(np.zeros(h * w, dtype=np.float64))

    return np.column_stack(features)


def run_markov_benchmark(
    *,
    name: str = "agent4_markov_teacher_v1",
    max_replays_per_seed: int = 30,
    n_estimators: int = 300,
    max_depth: int = 6,
    learning_rate: float = 0.05,
    n_rollouts: int = 50,
    subsample_years: int = 5,
    probability_floor: float = 0.01,
) -> None:
    """Train per-cell transition model and evaluate via Monte Carlo rollout."""
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import load_replay_final_grids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"

    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    fold_scores, fold_kls = [], []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Collect transition training data from full replay trajectories
        X_parts, y_parts = [], []
        n_transitions = 0

        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            round_dir = replays_dir / round_id

            for seed_dir in sorted(round_dir.iterdir()):
                if not seed_dir.is_dir() or not seed_dir.name.startswith("seed_index="):
                    continue
                seed_index = int(seed_dir.name.split("=")[1])

                initial_state = rd.initial_states[seed_index]
                initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
                initial_collapsed = collapse_internal_grid(initial_grid)

                replay_files = sorted(seed_dir.iterdir())[:max_replays_per_seed]

                for rf in replay_files:
                    try:
                        with open(rf) as fh:
                            data = json.load(fh)
                        frames = data["response"]["frames"]
                    except (KeyError, json.JSONDecodeError):
                        continue

                    grids = [np.asarray(fr["grid"], dtype=np.int64) for fr in frames]
                    settlements_by_year = [fr.get("settlements", []) for fr in frames]
                    collapsed = [collapse_internal_grid(g) for g in grids]

                    # Subsample years to keep training tractable
                    years = list(range(0, len(collapsed) - 1, subsample_years))
                    if (len(collapsed) - 2) not in years:
                        years.append(len(collapsed) - 2)

                    for t in years:
                        feat = _build_transition_features(
                            collapsed[t], initial_collapsed, t,
                            settlements=settlements_by_year[t],
                        )
                        next_cls = collapsed[t + 1].ravel()

                        # Only include cells that COULD change (skip mountains and deep ocean)
                        # Actually include all cells for proper probability calibration
                        X_parts.append(feat)
                        y_parts.append(next_cls)
                        n_transitions += feat.shape[0]

        X_train = np.concatenate(X_parts, axis=0)
        y_train = np.concatenate(y_parts, axis=0)
        n_features = X_train.shape[1]
        print(f"  Training: {X_train.shape[0]} transitions, {n_features} features")

        # Train multiclass transition model
        model = lgb.LGBMClassifier(
            objective="multiclass",
            num_class=CLASS_COUNT,
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            min_child_samples=100,
            subsample=0.7,
            colsample_bytree=0.7,
            num_leaves=31,
            verbose=-1,
            n_jobs=16,
            random_state=42,
        )
        model.fit(X_train, y_train)
        train_time = time.time() - fold_start
        print(f"  Model trained in {train_time:.1f}s")

        # Evaluate via Monte Carlo rollout on held-out round
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)

        seed_scores, seed_kls = [], []

        for seed_index, ar in sorted(analyses.items()):
            initial_state = rd.initial_states[seed_index]
            initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
            initial_collapsed = collapse_internal_grid(initial_grid)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = initial_grid.shape

            # Monte Carlo rollout
            class_counts = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)

            for rollout_idx in range(n_rollouts):
                current = initial_collapsed.copy()

                for year in range(50):
                    feat = _build_transition_features(
                        current, initial_collapsed, year,
                    )

                    # Get transition probabilities
                    trans_probs = model.predict_proba(feat)  # (H*W, 6)

                    # Sample next state
                    rng = np.random.RandomState(rollout_idx * 50 + year)
                    cumulative = np.cumsum(trans_probs, axis=1)
                    uniform = rng.random(feat.shape[0])
                    next_cls = np.zeros(feat.shape[0], dtype=np.int64)
                    for cls in range(CLASS_COUNT):
                        next_cls = np.where(
                            (uniform <= cumulative[:, cls]) & (next_cls == 0) & (cls > 0),
                            cls, next_cls,
                        )
                    # Fix: use argmax of cumulative > uniform
                    next_cls = (cumulative > uniform[:, None]).argmax(axis=1)

                    current = next_cls.reshape(h, w)

                # Accumulate final state
                for cls in range(CLASS_COUNT):
                    class_counts[:, :, cls] += (current == cls).astype(np.float64)

            # Average to get probabilities
            probs = class_counts / n_rollouts
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=-1, keepdims=True)

            bd = score_prediction(gt, probs)
            seed_scores.append(bd.score)
            seed_kls.append(bd.weighted_kl)
            print(f"    Seed {seed_index}: score={bd.score:.2f} kl={bd.weighted_kl:.4f}")

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Fold score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time()-fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    total_time = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"MARKOV TEACHER: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'='*60}")
    print(f"  n_rollouts={n_rollouts}, subsample_years={subsample_years}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "model": "markov_transition_teacher",
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "n_rollouts": n_rollouts,
        "subsample_years": subsample_years,
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "total_time_s": total_time,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_markov_teacher_v1")
    parser.add_argument("--max-replays", type=int, default=20)
    parser.add_argument("--n-rollouts", type=int, default=30)
    parser.add_argument("--subsample-years", type=int, default=5)
    parser.add_argument("--n-estimators", type=int, default=200)
    parser.add_argument("--max-depth", type=int, default=6)
    args = parser.parse_args()

    run_markov_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        n_rollouts=args.n_rollouts,
        subsample_years=args.subsample_years,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
    )
