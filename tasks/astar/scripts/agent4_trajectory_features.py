"""Trajectory-based features from full 50-year replay data.

RADICAL NEW APPROACH: Current models only use year-50 snapshots, throwing away
98% of replay data. This extracts rich per-cell trajectory features from the
full 50-year simulation history.

Key trajectory features per cell:
1. Transition timing: when did the cell first change? last change?
2. Volatility: how many state transitions occurred?
3. Midpoint state: class distribution at year 25
4. Growth pattern: trajectory of nearby settlement density
5. Per-round empirical transition matrices (encode hidden round params)
6. Settlement dynamics: population/wealth growth trajectories
7. Multi-timestep evidence: class distributions at years 10, 25, 40, 50

Usage:
    uv run python scripts/agent4_trajectory_features.py [--serve-ev N]
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np


def _neighbor_sum_2d(arr, radius):
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            sy, sx = slice(max(0, -dy), min(h, h - dy)), slice(max(0, -dx), min(w, w - dx))
            ty, tx = slice(max(0, dy), min(h, h + dy)), slice(max(0, dx), min(w, w + dx))
            out[ty, tx] += arr[sy, sx]
    return out


def _load_full_trajectories(replays_dir, round_id, seed_index, max_replays, nc=6):
    """Load full 50-year trajectories from replays for a specific seed."""
    from astar.core.terrain import collapse_internal_grid

    seed_dir = replays_dir / round_id / f"seed_index={seed_index}"
    if not seed_dir.exists():
        return None

    trajectories = []
    for rf in sorted(seed_dir.iterdir())[:max_replays]:
        try:
            with open(rf) as f:
                data = json.load(f)
            frames = data["response"]["frames"]
            if len(frames) < 51:
                continue

            # Extract collapsed grids at all timesteps
            grids = []
            for frame in frames:
                grid = np.asarray(frame["grid"], dtype=np.int64)
                collapsed = collapse_internal_grid(grid)
                grids.append(collapsed)

            # Extract settlement data at key timesteps
            sett_data = {}
            for t in [0, 10, 25, 40, 50]:
                if t < len(frames):
                    sett_data[t] = frames[t].get("settlements", [])

            trajectories.append({
                "grids": np.stack(grids),  # (51, H, W)
                "settlements": sett_data,
            })
        except Exception:
            continue

    return trajectories if trajectories else None


def _build_trajectory_features(
    trajectories: list[dict],
    initial_grid_collapsed: np.ndarray,
    nc: int = 6,
) -> np.ndarray:
    """Build rich trajectory features from full replay histories.

    Returns: (H, W, n_features) array of trajectory features.
    """
    h, w = initial_grid_collapsed.shape
    n_traj = len(trajectories)
    feats = []

    # All grids stacked: (n_traj, 51, H, W)
    all_grids = np.stack([t["grids"] for t in trajectories])  # (N, 51, H, W)

    # 1. Class distributions at multiple timesteps (years 10, 25, 40, 50)
    for t in [10, 25, 40, 50]:
        grids_at_t = all_grids[:, t, :, :]  # (N, H, W)
        for cls in range(nc):
            class_freq = (grids_at_t == cls).mean(axis=0)
            feats.append(class_freq)

    # 2. Per-cell transition count (volatility)
    # Count how many times class changes between consecutive years
    transitions = np.zeros((h, w), dtype=np.float64)
    for traj in trajectories:
        grids = traj["grids"]  # (51, H, W)
        changes = (grids[1:] != grids[:-1]).sum(axis=0)  # (H, W)
        transitions += changes
    transitions /= n_traj
    feats.append(transitions / 50.0)  # Normalize by max possible

    # 3. First transition year (when did cell first change from initial?)
    first_change = np.full((h, w), 50.0, dtype=np.float64)
    for traj in trajectories:
        grids = traj["grids"]  # (51, H, W)
        initial = grids[0]
        for t in range(1, 51):
            changed = (grids[t] != initial) & (first_change > t)
            # This is an approximation - average across trajectories
        # Better: compute average first-change-year
    # Recompute properly
    first_change_sum = np.zeros((h, w), dtype=np.float64)
    for traj in trajectories:
        grids = traj["grids"]
        initial = grids[0]
        fc = np.full((h, w), 50.0)
        for t in range(1, 51):
            newly_changed = (grids[t] != initial) & (fc >= 50.0)
            fc[newly_changed] = t
        first_change_sum += fc
    first_change = first_change_sum / n_traj
    feats.append(first_change / 50.0)

    # 4. Last transition year
    last_change_sum = np.zeros((h, w), dtype=np.float64)
    for traj in trajectories:
        grids = traj["grids"]
        lc = np.zeros((h, w))
        for t in range(1, 51):
            changed = grids[t] != grids[t - 1]
            lc[changed] = t
        last_change_sum += lc
    last_change = last_change_sum / n_traj
    feats.append(last_change / 50.0)

    # 5. Class change from initial to year-50 (delta features)
    for cls in range(nc):
        initial_freq = (initial_grid_collapsed == cls).astype(np.float64)
        final_freq = (all_grids[:, -1, :, :] == cls).mean(axis=0)
        feats.append(final_freq - initial_freq)

    # 6. Empirical transition matrix features
    # Per-cell: what class does it most commonly transition TO?
    # Aggregate across trajectories: count transitions between class pairs
    trans_matrix = np.zeros((h, w, nc, nc), dtype=np.float64)
    for traj in trajectories:
        grids = traj["grids"]
        for t in range(50):
            from_cls = grids[t]
            to_cls = grids[t + 1]
            for c1 in range(nc):
                for c2 in range(nc):
                    mask = (from_cls == c1) & (to_cls == c2)
                    trans_matrix[:, :, c1, c2] += mask

    # Normalize to probabilities (per source class)
    trans_sums = trans_matrix.sum(axis=-1, keepdims=True)
    trans_probs = np.where(trans_sums > 0, trans_matrix / trans_sums, 0)

    # Key transition probabilities as features
    # Self-transition (stability) per class
    for cls in range(nc):
        feats.append(trans_probs[:, :, cls, cls])

    # Settlement formation probability (from empty to settlement/port)
    feats.append(trans_probs[:, :, 0, 1])  # empty -> settlement
    feats.append(trans_probs[:, :, 0, 2])  # empty -> port
    feats.append(trans_probs[:, :, 1, 3])  # settlement -> ruin
    feats.append(trans_probs[:, :, 3, 1])  # ruin -> settlement (rebuild)
    feats.append(trans_probs[:, :, 3, 4])  # ruin -> forest (overgrowth)
    feats.append(trans_probs[:, :, 1, 2])  # settlement -> port

    # 7. Settlement density at different timepoints (neighborhood features)
    for t in [10, 25, 40, 50]:
        grids_at_t = all_grids[:, t, :, :]
        sett_density = ((grids_at_t == 1) | (grids_at_t == 2)).mean(axis=0).astype(np.float64)
        feats.append(sett_density)
        for radius in [2, 4]:
            ns = _neighbor_sum_2d(sett_density, radius)
            count = _neighbor_sum_2d(np.ones_like(sett_density), radius)
            feats.append(np.where(count > 0, ns / count, 0))

    # 8. Entropy of class at year 50 (from trajectories)
    final_grids = all_grids[:, -1, :, :]
    year50_entropy = np.zeros((h, w), dtype=np.float64)
    for cls in range(nc):
        p = (final_grids == cls).mean(axis=0).astype(np.float64)
        year50_entropy -= np.where(p > 0, p * np.log(p + 1e-10), 0)
    feats.append(year50_entropy)

    # 9. Alive settlement count trajectory (global feature replicated per cell)
    for t in [10, 25, 40, 50]:
        alive_counts = []
        for traj in trajectories:
            setts = traj["settlements"].get(t, [])
            alive = sum(1 for s in setts if s.get("alive", False))
            alive_counts.append(alive)
        mean_alive = np.mean(alive_counts) / 100.0 if alive_counts else 0.0
        feats.append(np.full((h, w), mean_alive))

    # 10. Population/wealth at year 50 (global settlement stats)
    pop_vals, wealth_vals, food_vals = [], [], []
    for traj in trajectories:
        for s in traj["settlements"].get(50, []):
            if s.get("alive", False):
                pop_vals.append(s.get("population", 0))
                wealth_vals.append(s.get("wealth", 0))
                food_vals.append(s.get("food", 0))

    global_sett_feats = [
        np.mean(pop_vals) / 5.0 if pop_vals else 0.0,
        np.std(pop_vals) / 3.0 if len(pop_vals) > 1 else 0.0,
        np.mean(wealth_vals) / 2.0 if wealth_vals else 0.0,
        np.mean(food_vals) / 2.0 if food_vals else 0.0,
    ]
    for v in global_sett_feats:
        feats.append(np.full((h, w), float(v)))

    return np.stack(feats, axis=-1)


def _build_crossseed_trajectory_features(
    replays_dir, round_id, current_seed, serve_ev, max_replays, h, w, nc=6,
):
    """Build trajectory features from other seeds' replays."""
    from astar.core.terrain import collapse_internal_grid

    feats = []
    all_pop, all_wealth, all_food = [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    n_other_seeds = 0

    # Multi-timestep class distributions from other seeds
    timestep_class_counts = {t: np.zeros(nc) for t in [10, 25, 40, 50]}
    timestep_total = {t: 0 for t in [10, 25, 40, 50]}

    for si in range(5):
        if si == current_seed:
            continue
        n_other_seeds += 1

        seed_dir = replays_dir / round_id / f"seed_index={si}"
        if not seed_dir.exists():
            continue

        for rf in sorted(seed_dir.iterdir())[:serve_ev]:
            try:
                with open(rf) as f:
                    data = json.load(f)
                frames = data["response"]["frames"]

                # Year 50 stats (original cross-seed features)
                grid50 = np.asarray(frames[-1]["grid"], dtype=np.int64)
                collapsed = collapse_internal_grid(grid50)
                for cls in range(nc):
                    class_counts[cls] += (collapsed == cls).sum()
                total_cells += collapsed.size

                for s in frames[-1].get("settlements", []):
                    if s.get("alive", False):
                        alive_total += 1
                        all_pop.append(float(s.get("population", 0)))
                        all_food.append(float(s.get("food", 0)))
                        all_wealth.append(float(s.get("wealth", 0)))
                        if s.get("has_port", False):
                            port_total += 1
                        owners.add(s.get("owner_id", 0))
                    else:
                        dead_total += 1

                # Multi-timestep class counts
                for t in [10, 25, 40, 50]:
                    if t < len(frames):
                        g = collapse_internal_grid(np.asarray(frames[t]["grid"], dtype=np.int64))
                        for cls in range(nc):
                            timestep_class_counts[t][cls] += (g == cls).sum()
                        timestep_total[t] += g.size

            except Exception:
                continue

    # Class distribution from other seeds at year 50
    if total_cells > 0:
        class_fracs = class_counts / total_cells
    else:
        class_fracs = np.ones(nc) / nc
    for cls in range(nc):
        feats.append(np.full((h, w), class_fracs[cls]))

    # Multi-timestep class distributions from other seeds
    for t in [10, 25, 40]:
        if timestep_total[t] > 0:
            tf = timestep_class_counts[t] / timestep_total[t]
        else:
            tf = np.ones(nc) / nc
        for cls in range(nc):
            feats.append(np.full((h, w), tf[cls]))

    # Settlement stats
    cross_feats = [
        np.mean(all_pop) / 5.0 if all_pop else 0.0,
        np.mean(all_food) / 2.0 if all_food else 0.0,
        np.mean(all_wealth) / 2.0 if all_wealth else 0.0,
        np.std(all_pop) / 3.0 if len(all_pop) > 1 else 0.0,
        alive_total / max(n_other_seeds, 1) / 60.0,
        dead_total / max(n_other_seeds, 1) / 60.0,
        port_total / max(alive_total, 1),
        len(owners) / 60.0,
        class_fracs[1] + class_fracs[2],  # build rate
        class_fracs[3],  # ruin fraction
    ]
    for v in cross_feats:
        feats.append(np.full((h, w), float(v)))

    return np.stack(feats, axis=-1)


def _coverage_mask(h, w):
    mask = np.zeros((h, w), dtype=bool)
    for vy in range(0, h, 15):
        for vx in range(0, w, 15):
            mask[vy:min(vy + 15, h), vx:min(vx + 15, w)] = True
    return mask


def run_trajectory_benchmark(
    *,
    name="agent4_trajectory_v1",
    max_replays=58,
    serve_ev=15,
    augment_count=5,
    floor=0.0003,
    n_estimators_lgb=800,
    n_estimators_cat=500,
    use_crossseed=True,
    use_trajectory=True,
):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from agent4_gt_evidence_model import _build_evidence

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name
        for d in analyses_dir.iterdir()
        if d.is_dir()
        and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    rng = np.random.RandomState(42)
    evidence_levels = [1, 2, 3, 5, 10, 15]
    fold_scores, fold_kls = [], []

    print(f"Running trajectory benchmark: {name}")
    print(f"  Rounds: {len(all_round_ids)}, serve_ev={serve_ev}")
    print(f"  trajectory={use_trajectory}, crossseed={use_crossseed}")

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi + 1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []

        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            analyses = read_analysis_records(paths, rid)

            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                collapsed_initial = collapse_internal_grid(grid)

                # Base map features
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)

                # Load trajectory data for this seed
                traj_data = None
                if use_trajectory:
                    traj_data = _load_full_trajectories(
                        replays_dir, rid, si, max_replays
                    )

                # Load replay data for evidence features
                seed_dir = replays_dir / rid / f"seed_index={si}"
                items = []
                if seed_dir.exists():
                    for rf in sorted(seed_dir.iterdir())[:max_replays]:
                        try:
                            with open(rf) as f:
                                data = json.load(f)
                            frames = data["response"]["frames"]
                            items.append(
                                (
                                    np.asarray(frames[-1]["grid"], dtype=np.int64),
                                    frames[-1].get("settlements", []),
                                )
                            )
                        except Exception:
                            continue

                if not items:
                    continue

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    feature_parts = [mf, ef]

                    # Trajectory features (augmented with subset of replays)
                    if traj_data is not None and use_trajectory:
                        traj_subset_idx = rng.choice(
                            len(traj_data),
                            min(ev_level * 3, len(traj_data)),
                            replace=False,
                        )
                        traj_subset = [traj_data[i] for i in traj_subset_idx]
                        tf = _build_trajectory_features(
                            traj_subset, collapsed_initial
                        )
                        feature_parts.append(tf)

                    # Cross-seed features
                    if use_crossseed:
                        csf = _build_crossseed_trajectory_features(
                            replays_dir, rid, si, ev_level, max_replays, h, w
                        )
                        feature_parts.append(csf)

                    combined = np.concatenate(feature_parts, axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train LightGBM
        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators_lgb,
                max_depth=8,
                learning_rate=0.02,
                min_child_samples=30,
                subsample=0.7,
                colsample_bytree=0.7,
                num_leaves=63,
                verbose=-1,
                n_jobs=4,
                random_state=42,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

        # Train CatBoost
        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=n_estimators_cat,
                depth=6,
                learning_rate=0.01,
                l2_leaf_reg=1.0,
                random_seed=42,
                verbose=0,
                thread_count=4,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            cat_models[cls] = m

        # Evaluate on held-out round
        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)

        scores, kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            collapsed_initial = collapse_internal_grid(grid)
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)

            # Load evidence from replays
            seed_dir = replays_dir / hr / f"seed_index={si}"
            items = []
            if seed_dir.exists():
                for rf in sorted(seed_dir.iterdir())[:serve_ev]:
                    try:
                        with open(rf) as f:
                            data = json.load(f)
                        frames = data["response"]["frames"]
                        items.append(
                            (
                                np.asarray(frames[-1]["grid"], dtype=np.int64),
                                frames[-1].get("settlements", []),
                            )
                        )
                    except Exception:
                        continue

            if items:
                ef = _build_evidence(
                    [it[0] for it in items],
                    [it[1] for it in items],
                    obs,
                )
            else:
                ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

            feature_parts = [mf, ef]

            # Trajectory features for held-out round
            if use_trajectory:
                traj_data = _load_full_trajectories(
                    replays_dir, hr, si, serve_ev
                )
                if traj_data is not None:
                    tf = _build_trajectory_features(traj_data, collapsed_initial)
                    feature_parts.append(tf)
                else:
                    # Fallback: zero trajectory features
                    # Need to match feature count from training
                    # Build dummy trajectory with a single replay
                    dummy = _load_full_trajectories(replays_dir, hr, si, 1)
                    if dummy:
                        tf = _build_trajectory_features(dummy, collapsed_initial)
                        feature_parts.append(np.zeros_like(tf))
                    else:
                        # Can't happen if we have replay data
                        pass

            if use_crossseed:
                csf = _build_crossseed_trajectory_features(
                    replays_dir, hr, si, serve_ev, serve_ev, h, w
                )
                feature_parts.append(csf)

            combined = np.concatenate(feature_parts, axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            # Ensemble predictions
            lgb_p = np.zeros((h * w, CLASS_COUNT))
            cat_p = np.zeros((h * w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:, c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
                cat_p[:, c] = np.clip(cat_models[c].predict(Xe), floor, 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)

            # Geometric mean ensemble
            log_blend = 0.5 * np.log(np.maximum(lgb_p, 1e-10)) + 0.5 * np.log(
                np.maximum(cat_p, 1e-10)
            )
            probs = np.exp(log_blend)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, floor)
            probs /= probs.sum(axis=1, keepdims=True)

            bd = score_prediction(gt, probs.reshape(h, w, CLASS_COUNT))
            scores.append(bd.score)
            kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs)
        fold_kls.append(fk)
        print(f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time() - fold_start:.1f}s")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'=' * 60}")
    print(f"TRAJECTORY MODEL: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'=' * 60}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(
        json.dumps(
            {
                "name": name,
                "serve_ev": serve_ev,
                "use_trajectory": use_trajectory,
                "use_crossseed": use_crossseed,
                "mean_score": ms,
                "mean_weighted_kl": mk,
                "per_fold": [
                    {"round_id": r, "score": s, "kl": k}
                    for r, s, k in zip(all_round_ids, fold_scores, fold_kls)
                ],
            },
            indent=2,
        )
    )
    return ms, mk


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_trajectory_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    p.add_argument("--no-crossseed", action="store_true")
    p.add_argument("--no-trajectory", action="store_true")
    a = p.parse_args()
    run_trajectory_benchmark(
        name=a.name,
        serve_ev=a.serve_ev,
        use_crossseed=not a.no_crossseed,
        use_trajectory=not a.no_trajectory,
    )
