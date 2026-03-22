"""Per-round empirical transition matrix model.

RADICAL APPROACH: The hidden round parameters directly determine transition
dynamics. Instead of using year-50 snapshots as features, estimate the
per-round empirical transition matrices from replay trajectories and use
those as both features and for direct forward-simulation-based prediction.

Two approaches combined:
1. "Transition feature" model: Use per-round transition matrix entries as
   features alongside map features in a GBM
2. "Forward simulation" model: Use estimated transition matrices to run
   simple Markov chain forward from initial state

Usage:
    uv run python scripts/agent4_transition_matrix_model.py [--serve-ev N]
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


def estimate_transition_matrices(replays_dir, round_id, seed_index, max_replays, nc=6):
    """Estimate per-cell and global transition matrices from replay trajectories."""
    from astar.core.terrain import collapse_internal_grid

    seed_dir = replays_dir / round_id / f"seed_index={seed_index}"
    if not seed_dir.exists():
        return None

    # Global transition counts
    global_trans = np.zeros((nc, nc), dtype=np.float64)
    # Neighborhood-conditioned transition counts
    # For each cell, condition on its neighbor composition
    h, w = None, None
    cell_trans = None
    n_replays = 0

    for rf in sorted(seed_dir.iterdir())[:max_replays]:
        try:
            with open(rf) as f:
                data = json.load(f)
            frames = data["response"]["frames"]
            if len(frames) < 51:
                continue

            n_replays += 1
            grids = [collapse_internal_grid(np.asarray(f["grid"], dtype=np.int64)) for f in frames]

            if h is None:
                h, w = grids[0].shape
                cell_trans = np.zeros((h, w, nc, nc), dtype=np.float64)

            for t in range(50):
                g0 = grids[t]
                g1 = grids[t + 1]
                for c1 in range(nc):
                    for c2 in range(nc):
                        mask = (g0 == c1) & (g1 == c2)
                        global_trans[c1, c2] += mask.sum()
                        cell_trans[:, :, c1, c2] += mask

        except Exception:
            continue

    if n_replays == 0 or cell_trans is None:
        return None

    # Normalize to probabilities
    global_sums = global_trans.sum(axis=1, keepdims=True)
    global_probs = np.where(global_sums > 0, global_trans / global_sums, 1.0 / nc)

    cell_sums = cell_trans.sum(axis=-1, keepdims=True)
    cell_probs = np.where(cell_sums > 0, cell_trans / cell_sums, 0)

    return {
        "global_trans": global_probs,     # (nc, nc)
        "cell_trans": cell_probs,         # (h, w, nc, nc)
        "n_replays": n_replays,
        "h": h,
        "w": w,
    }


def markov_forward_predict(initial_grid_collapsed, trans_data, nc=6, n_steps=50):
    """Run forward Markov chain prediction from initial state using transition matrices.

    Returns per-cell probability distribution at year 50.
    """
    h, w = initial_grid_collapsed.shape

    # Use cell-specific transition probabilities
    cell_probs = trans_data["cell_trans"]  # (h, w, nc, nc)

    # Initialize probability distribution (one-hot from initial state)
    prob = np.zeros((h, w, nc), dtype=np.float64)
    for cls in range(nc):
        prob[:, :, cls] = (initial_grid_collapsed == cls).astype(np.float64)

    # Run forward n_steps
    for _ in range(n_steps):
        new_prob = np.zeros_like(prob)
        for c_from in range(nc):
            for c_to in range(nc):
                new_prob[:, :, c_to] += prob[:, :, c_from] * cell_probs[:, :, c_from, c_to]
        # Renormalize
        total = new_prob.sum(axis=-1, keepdims=True)
        prob = np.where(total > 0, new_prob / total, 1.0 / nc)

    return prob


def build_transition_features(trans_data, initial_grid_collapsed, nc=6):
    """Build features from estimated transition matrices."""
    h, w = initial_grid_collapsed.shape
    feats = []

    global_t = trans_data["global_trans"]  # (nc, nc)
    cell_t = trans_data["cell_trans"]      # (h, w, nc, nc)

    # Global transition matrix entries (flattened, replicated per cell)
    for c1 in range(nc):
        for c2 in range(nc):
            feats.append(np.full((h, w), global_t[c1, c2]))

    # Cell-specific transition probabilities for THIS cell's initial class
    for cls in range(nc):
        mask = (initial_grid_collapsed == cls).astype(np.float64)
        for c_to in range(nc):
            feats.append(mask * cell_t[:, :, cls, c_to])

    # Cell stability (self-transition probability)
    for cls in range(nc):
        feats.append(cell_t[:, :, cls, cls])

    # Key dynamic rates
    feats.append(cell_t[:, :, 0, 1])  # colonization rate
    feats.append(cell_t[:, :, 0, 2])  # port formation from empty
    feats.append(cell_t[:, :, 1, 3])  # collapse rate
    feats.append(cell_t[:, :, 3, 1])  # rebuild rate
    feats.append(cell_t[:, :, 3, 4])  # overgrowth rate
    feats.append(cell_t[:, :, 1, 2])  # port upgrade rate

    # Markov chain forward prediction (the key feature!)
    markov_pred = markov_forward_predict(initial_grid_collapsed, trans_data, nc)
    for cls in range(nc):
        feats.append(markov_pred[:, :, cls])

    # Entropy of Markov prediction
    ent = np.zeros((h, w), dtype=np.float64)
    for cls in range(nc):
        p = markov_pred[:, :, cls]
        ent -= np.where(p > 0, p * np.log(p + 1e-10), 0)
    feats.append(ent)

    return np.stack(feats, axis=-1)


def run_transition_benchmark(
    *,
    name="agent4_transition_v1",
    max_replays=58,
    serve_ev=15,
    augment_count=5,
    floor=0.0003,
    n_estimators_lgb=800,
    n_estimators_cat=500,
    use_crossseed=True,
    use_markov_direct=True,
):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from agent4_gt_evidence_model import _build_evidence, _coverage_mask
    from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data

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
    markov_scores, markov_kls = [], []

    print(f"Running transition matrix benchmark: {name}")
    print(f"  Rounds: {len(all_round_ids)}, serve_ev={serve_ev}")

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
                collapsed = collapse_internal_grid(grid)
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)

                # Estimate transition matrices from ALL replays for this seed
                trans_data = estimate_transition_matrices(
                    replays_dir, rid, si, max_replays
                )
                if trans_data is None:
                    continue

                # Load year-50 replay data for evidence features
                replay_data = _load_replay_data(replays_dir, rid, max_replays)
                items = replay_data.get(si, [])
                if not items:
                    continue

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    # Transition features
                    tf = build_transition_features(trans_data, collapsed)

                    feature_parts = [mf, ef, tf]

                    if use_crossseed:
                        cross_replay = {}
                        for other_si, other_items in replay_data.items():
                            if other_si == si:
                                continue
                            cross_ev = min(ev_level, len(other_items))
                            cross_idx = rng.choice(len(other_items), cross_ev, replace=False)
                            cross_replay[other_si] = [other_items[i] for i in cross_idx]
                        csf = _build_crossseed_features(cross_replay, si, ev_level, h, w)
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

        # Train models
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

        # Evaluate
        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        replay_data = _load_replay_data(replays_dir, hr, max_replays)

        scores, kls = [], []
        m_scores, m_kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            collapsed = collapse_internal_grid(grid)
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)

            items = replay_data.get(si, [])
            if items:
                ef = _build_evidence(
                    [it[0] for it in items[:serve_ev]],
                    [it[1] for it in items[:serve_ev]],
                    obs,
                )
            else:
                ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

            trans_data = estimate_transition_matrices(
                replays_dir, hr, si, serve_ev
            )
            if trans_data is None:
                continue

            tf = build_transition_features(trans_data, collapsed)
            feature_parts = [mf, ef, tf]

            if use_crossseed:
                csf = _build_crossseed_features(replay_data, si, serve_ev, h, w)
                feature_parts.append(csf)

            combined = np.concatenate(feature_parts, axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            lgb_p = np.zeros((h * w, CLASS_COUNT))
            cat_p = np.zeros((h * w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:, c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
                cat_p[:, c] = np.clip(cat_models[c].predict(Xe), floor, 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)

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

            # Also evaluate direct Markov prediction
            if use_markov_direct:
                markov_pred = markov_forward_predict(collapsed, trans_data)
                markov_pred = np.maximum(markov_pred, floor)
                markov_pred /= markov_pred.sum(axis=-1, keepdims=True)
                bd_m = score_prediction(gt, markov_pred)
                m_scores.append(bd_m.score)
                m_kls.append(bd_m.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs)
        fold_kls.append(fk)
        print(f"  GBM Score: {fs:.4f}  KL: {fk:.6f}")

        if m_scores:
            ms_m, mk_m = float(np.mean(m_scores)), float(np.mean(m_kls))
            markov_scores.append(ms_m)
            markov_kls.append(mk_m)
            print(f"  Markov Score: {ms_m:.4f}  KL: {mk_m:.6f}")

        print(f"  Time: {time.time() - fold_start:.1f}s")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'=' * 60}")
    print(f"TRANSITION MODEL: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    if markov_scores:
        ms_m, mk_m = float(np.mean(markov_scores)), float(np.mean(markov_kls))
        print(f"MARKOV DIRECT:    score={ms_m:.4f} kl={mk_m:.6f}")
    print(f"{'=' * 60}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(
        json.dumps(
            {
                "name": name,
                "serve_ev": serve_ev,
                "mean_score": ms,
                "mean_weighted_kl": mk,
                "markov_mean_score": float(np.mean(markov_scores)) if markov_scores else None,
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
    p.add_argument("--name", default="agent4_transition_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    p.add_argument("--no-crossseed", action="store_true")
    a = p.parse_args()
    run_transition_benchmark(
        name=a.name,
        serve_ev=a.serve_ev,
        use_crossseed=not a.no_crossseed,
    )
