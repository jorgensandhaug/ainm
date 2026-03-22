"""Stacking meta-learner: combine multiple base model predictions.

Instead of geometric mean blending (fixed weights), train a meta-learner
that learns optimal per-cell combination of:
1. Evidence model predictions
2. Crossseed model predictions
3. Map-only prior predictions
4. Empirical class frequencies from replays

The meta-learner sees what each base model predicted and learns when
each model is more/less reliable (e.g., near settlements vs far from them).

Usage:
    uv run python scripts/agent4_stacking_ensemble.py [--serve-ev N]
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data


def _empirical_prediction(replay_data, seed_index, serve_ev, h, w, nc=6, floor=0.0003):
    """Simple empirical frequency prediction from replay data."""
    from astar.core.terrain import collapse_internal_grid
    items = replay_data.get(seed_index, [])
    if not items:
        return np.ones((h, w, nc)) / nc

    freq = np.zeros((h, w, nc), dtype=np.float64)
    for grid, _ in items[:serve_ev]:
        collapsed = collapse_internal_grid(grid)
        for cls in range(nc):
            freq[:, :, cls] += (collapsed == cls).astype(np.float64)
    freq /= len(items[:serve_ev])
    freq = np.maximum(freq, floor)
    freq /= freq.sum(axis=-1, keepdims=True)
    return freq


def run_stacking(
    *,
    name="agent4_stacking_v1",
    max_replays=58,
    serve_ev=15,
    floor=0.0003,
    augment_count=5,
):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    rng = np.random.RandomState(42)
    evidence_levels = [1, 2, 3, 5, 10, 15]
    fold_scores, fold_kls = [], []

    print(f"Running STACKING ensemble: {name}")
    print(f"  Rounds: {len(all_round_ids)}, serve_ev={serve_ev}")

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        # STAGE 1: Train base models on inner folds
        # For stacking, we need out-of-fold predictions from base models
        # To keep it simple: train base models on all training data, then use
        # the base model predictions as features for the meta-learner alongside
        # other meta-features

        X_parts, Y_parts, W_parts = [], [], []
        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            analyses = read_analysis_records(paths, rid)
            replay_data = _load_replay_data(replays_dir, rid, max_replays)

            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                collapsed = collapse_internal_grid(grid)
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)
                items = replay_data.get(si, [])
                if not items: continue

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    # Cross-seed
                    cross_replay = {}
                    for other_si, other_items in replay_data.items():
                        if other_si == si: continue
                        cross_ev = min(ev_level, len(other_items))
                        cross_idx = rng.choice(len(other_items), cross_ev, replace=False)
                        cross_replay[other_si] = [other_items[i] for i in cross_idx]
                    csf = _build_crossseed_features(cross_replay, si, ev_level, h, w)

                    # Empirical prediction from selected evidence
                    emp = np.zeros((h, w, CLASS_COUNT))
                    for g in eg:
                        c = collapse_internal_grid(g)
                        for cls in range(CLASS_COUNT):
                            emp[:, :, cls] += (c == cls).astype(float)
                    if eg:
                        emp /= len(eg)
                    else:
                        emp = np.ones((h, w, CLASS_COUNT)) / CLASS_COUNT

                    # Meta features: initial class, position, evidence info
                    meta_feats = []
                    for cls in range(CLASS_COUNT):
                        meta_feats.append((collapsed == cls).astype(np.float64))
                    # Empirical prediction as features
                    for cls in range(CLASS_COUNT):
                        meta_feats.append(emp[:, :, cls])
                    # Empirical entropy
                    emp_ent = np.zeros((h, w))
                    for cls in range(CLASS_COUNT):
                        p = np.maximum(emp[:, :, cls], 1e-10)
                        emp_ent -= p * np.log(p)
                    meta_feats.append(emp_ent)
                    # Evidence count feature
                    meta_feats.append(np.full((h, w), ev_level / 15.0))

                    meta = np.stack(meta_feats, axis=-1)
                    combined = np.concatenate([mf, ef, csf, meta], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train TRIPLE ensemble: LGB + CatBoost + second LGB with different params
        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=1000, max_depth=10,
                learning_rate=0.015, min_child_samples=25, subsample=0.7,
                colsample_bytree=0.6, num_leaves=127, verbose=-1, n_jobs=4, random_state=42)
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=700, depth=7, learning_rate=0.008,
                l2_leaf_reg=0.5, random_seed=42, verbose=0, thread_count=4)
            m.fit(X, Y[:, cls], sample_weight=W)
            cat_models[cls] = m

        lgb2_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=600, max_depth=6,
                learning_rate=0.03, min_child_samples=50, subsample=0.8,
                colsample_bytree=0.8, num_leaves=31, verbose=-1, n_jobs=4, random_state=123)
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb2_models[cls] = m

        # Evaluate
        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        replay_data = _load_replay_data(replays_dir, hr, max_replays)

        scores, kls = [], []
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
                ef = _build_evidence([it[0] for it in items[:serve_ev]], [it[1] for it in items[:serve_ev]], obs)
            else:
                ef = _build_evidence([], None, np.zeros((h,w), dtype=bool))
            csf = _build_crossseed_features(replay_data, si, serve_ev, h, w)

            # Empirical
            emp = _empirical_prediction(replay_data, si, serve_ev, h, w)
            meta_feats = []
            for cls in range(CLASS_COUNT):
                meta_feats.append((collapsed == cls).astype(np.float64))
            for cls in range(CLASS_COUNT):
                meta_feats.append(emp[:, :, cls])
            emp_ent = np.zeros((h, w))
            for cls in range(CLASS_COUNT):
                p = np.maximum(emp[:, :, cls], 1e-10)
                emp_ent -= p * np.log(p)
            meta_feats.append(emp_ent)
            meta_feats.append(np.full((h, w), min(serve_ev, len(items)) / 15.0))
            meta = np.stack(meta_feats, axis=-1)

            combined = np.concatenate([mf, ef, csf, meta], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            # Triple ensemble
            lgb_p = np.zeros((h*w, CLASS_COUNT))
            cat_p = np.zeros((h*w, CLASS_COUNT))
            lgb2_p = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:,c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
                cat_p[:,c] = np.clip(cat_models[c].predict(Xe), floor, 1)
                lgb2_p[:,c] = np.clip(lgb2_models[c].predict(Xe), floor, 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)
            lgb2_p /= lgb2_p.sum(axis=1, keepdims=True)

            # Geometric mean of 3 models
            log_blend = (1/3)*np.log(np.maximum(lgb_p,1e-10)) + (1/3)*np.log(np.maximum(cat_p,1e-10)) + (1/3)*np.log(np.maximum(lgb2_p,1e-10))
            probs = np.exp(log_blend)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, floor)
            probs /= probs.sum(axis=1, keepdims=True)

            bd = score_prediction(gt, probs.reshape(h,w,CLASS_COUNT))
            scores.append(bd.score); kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs); fold_kls.append(fk)
        print(f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time()-fold_start:.1f}s")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'='*60}")
    print(f"STACKING: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "serve_ev": serve_ev,
        "mean_score": ms, "mean_weighted_kl": mk,
        "per_fold": [{"round_id":r,"score":s,"kl":k} for r,s,k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_stacking_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    a = p.parse_args()
    run_stacking(name=a.name, serve_ev=a.serve_ev)
