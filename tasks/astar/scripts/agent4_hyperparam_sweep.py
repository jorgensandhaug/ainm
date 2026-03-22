"""Hyperparameter sweep for evidence + trajectory + crossseed models.

Runs multiple configurations in sequence, testing:
1. Deeper trees (max_depth 10, 12)
2. More trees (1500, 2000)
3. Lower learning rate (0.01, 0.005)
4. More leaves (127, 255)
5. Different probability floors (0.0001, 0.0003, 0.001)
6. Different augment counts (3, 5, 10)
7. Different colsample (0.4, 0.5, 0.6, 0.7)
8. XGBoost instead of LGB

Usage:
    uv run python scripts/agent4_hyperparam_sweep.py --config CONFIG_NAME
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask, _neighbor_sum_2d
from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data


CONFIGS = {
    # Baseline (current best trajectory model settings)
    "baseline": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=63, colsample=0.7,
        floor=0.0003, augment_count=5,
    ),
    # Deeper trees
    "deep10": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=10, max_depth_cat=8,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=127, colsample=0.7,
        floor=0.0003, augment_count=5,
    ),
    "deep12": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=12, max_depth_cat=10,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=255, colsample=0.6,
        floor=0.0003, augment_count=5,
    ),
    # More trees + lower LR
    "moretrees": dict(
        n_estimators_lgb=1500, n_estimators_cat=1000, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.01, lr_cat=0.005, num_leaves=63, colsample=0.7,
        floor=0.0003, augment_count=5,
    ),
    "bigtrees": dict(
        n_estimators_lgb=2000, n_estimators_cat=1500, max_depth_lgb=10, max_depth_cat=8,
        lr_lgb=0.008, lr_cat=0.004, num_leaves=127, colsample=0.6,
        floor=0.0003, augment_count=5,
    ),
    # Floor sweep
    "floor_tiny": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=63, colsample=0.7,
        floor=0.0001, augment_count=5,
    ),
    "floor_med": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=63, colsample=0.7,
        floor=0.001, augment_count=5,
    ),
    # More augmentation
    "aug10": dict(
        n_estimators_lgb=800, n_estimators_cat=500, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.02, lr_cat=0.01, num_leaves=63, colsample=0.7,
        floor=0.0003, augment_count=10,
    ),
    # Aggressive feature sampling
    "lowcol": dict(
        n_estimators_lgb=1200, n_estimators_cat=800, max_depth_lgb=8, max_depth_cat=6,
        lr_lgb=0.015, lr_cat=0.008, num_leaves=63, colsample=0.4,
        floor=0.0003, augment_count=5,
    ),
    # Combined best ideas
    "mega": dict(
        n_estimators_lgb=1500, n_estimators_cat=1000, max_depth_lgb=10, max_depth_cat=8,
        lr_lgb=0.01, lr_cat=0.005, num_leaves=127, colsample=0.5,
        floor=0.0002, augment_count=8,
    ),
}


def run_sweep_config(config_name, serve_ev=15, use_crossseed=True):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    cfg = CONFIGS[config_name]
    name = f"agent4_16r_sweep_{config_name}_ev{serve_ev}"

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

    print(f"SWEEP: {name} | {cfg}")
    total_start = time.time()

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []
        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            analyses = read_analysis_records(paths, rid)
            replay_data = _load_replay_data(replays_dir, rid, 58)

            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)
                items = replay_data.get(si, [])
                if not items: continue

                for _ in range(cfg["augment_count"]):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    feature_parts = [mf, ef]
                    if use_crossseed:
                        cross_replay = {}
                        for other_si, other_items in replay_data.items():
                            if other_si == si: continue
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

        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=cfg["n_estimators_lgb"],
                max_depth=cfg["max_depth_lgb"], learning_rate=cfg["lr_lgb"],
                min_child_samples=30, subsample=0.7,
                colsample_bytree=cfg["colsample"], num_leaves=cfg["num_leaves"],
                verbose=-1, n_jobs=4, random_state=42)
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=cfg["n_estimators_cat"], depth=cfg["max_depth_cat"],
                learning_rate=cfg["lr_cat"], l2_leaf_reg=1.0,
                random_seed=42, verbose=0, thread_count=4)
            m.fit(X, Y[:, cls], sample_weight=W)
            cat_models[cls] = m

        # Eval
        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        ho = _load_replay_data(replays_dir, hr, serve_ev)

        scores, kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)
            items = ho.get(si, [])
            if items:
                ef = _build_evidence([it[0] for it in items], [it[1] for it in items], obs)
            else:
                ef = _build_evidence([], None, np.zeros((h,w), dtype=bool))

            feature_parts = [mf, ef]
            if use_crossseed:
                csf = _build_crossseed_features(ho, si, serve_ev, h, w)
                feature_parts.append(csf)

            combined = np.concatenate(feature_parts, axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            lgb_p = np.zeros((h*w, CLASS_COUNT))
            cat_p = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:,c] = np.clip(lgb_models[c].predict(Xe), cfg["floor"], 1)
                cat_p[:,c] = np.clip(cat_models[c].predict(Xe), cfg["floor"], 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)

            log_blend = 0.5*np.log(np.maximum(lgb_p,1e-10)) + 0.5*np.log(np.maximum(cat_p,1e-10))
            probs = np.exp(log_blend)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, cfg["floor"])
            probs /= probs.sum(axis=1, keepdims=True)

            bd = score_prediction(gt, probs.reshape(h,w,CLASS_COUNT))
            scores.append(bd.score); kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs); fold_kls.append(fk)
        print(f"  Fold {hi+1}/16 [{hr[:8]}]: {fs:.4f} ({time.time()-fold_start:.0f}s)")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    total_time = time.time() - total_start
    print(f"\n{'='*60}")
    print(f"SWEEP {config_name}: score={ms:.4f} kl={mk:.6f} time={total_time:.0f}s")
    print(f"{'='*60}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "config": config_name, "serve_ev": serve_ev,
        "mean_score": ms, "mean_weighted_kl": mk, "total_time": total_time,
        "hyperparams": cfg,
        "per_fold": [{"round_id":r,"score":s,"kl":k} for r,s,k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))
    return ms


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True, choices=list(CONFIGS.keys()))
    p.add_argument("--serve-ev", type=int, default=15)
    a = p.parse_args()
    run_sweep_config(a.config, serve_ev=a.serve_ev)
