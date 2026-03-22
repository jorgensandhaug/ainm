"""Quick parameter sweep for cross-seed model.

Tests: augmentation count, floor, number of trees, logit targets.

Usage:
    uv run python scripts/agent4_crossseed_sweep.py
"""
from __future__ import annotations
import json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data


def run_sweep():
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    all_ids = sorted(d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists())

    configs = [
        {"tag": "aug10", "aug": 10, "floor": 0.0003, "n_lgb": 800, "n_cat": 500},
        {"tag": "floor0001", "aug": 5, "floor": 0.0001, "n_lgb": 800, "n_cat": 500},
        {"tag": "big_lgb", "aug": 5, "floor": 0.0003, "n_lgb": 1200, "n_cat": 700},
        {"tag": "aug15_big", "aug": 15, "floor": 0.0003, "n_lgb": 1000, "n_cat": 600},
    ]

    serve_ev = 1
    max_replays = 58
    ev_levels = [1,2,3,5,10,15]

    for cfg in configs:
        tag = cfg["tag"]
        aug = cfg["aug"]
        floor = cfg["floor"]
        n_lgb = cfg["n_lgb"]
        n_cat = cfg["n_cat"]
        print(f"\n{'#'*60}")
        print(f"CONFIG: {tag} (aug={aug}, floor={floor}, lgb={n_lgb}, cat={n_cat})")
        print(f"{'#'*60}")

        rng = np.random.RandomState(42)
        fold_scores = []

        for hi, hr in enumerate(all_ids):
            train_rounds = [r for r in all_ids if r != hr]
            fold_start = time.time()

            X_parts, Y_parts, W_parts = [], [], []
            for rid in train_rounds:
                rd = read_round_record(paths, rid).round
                analyses = read_analysis_records(paths, rid)
                rdata = _load_replay_data(replays_dir, rid, max_per_seed=max_replays)
                for si, ar in sorted(analyses.items()):
                    ist = rd.initial_states[si]
                    grid = np.asarray(ist.grid, dtype=np.int64)
                    gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                    h, w = grid.shape
                    mf = build_cellwise_features(grid, ist.settlements)
                    obs = _coverage_mask(h, w)
                    items = rdata.get(si, [])
                    if not items: continue
                    for _ in range(aug):
                        ev = min(rng.choice(ev_levels), len(items))
                        idx = rng.choice(len(items), ev, replace=False)
                        eg = [items[i][0] for i in idx]
                        es = [items[i][1] for i in idx]
                        ef = _build_evidence(eg, es, obs)
                        cr = {}
                        for osi, oi in rdata.items():
                            if osi==si: continue
                            cev = min(ev, len(oi))
                            cidx = rng.choice(len(oi), cev, replace=False)
                            cr[osi] = [oi[i] for i in cidx]
                        csf = _build_crossseed_features(cr, si, ev, h, w)
                        combined = np.concatenate([mf, ef, csf], axis=-1)
                        X_parts.append(combined.reshape(-1, combined.shape[-1]))
                        Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                        ent = entropy_map(gt)
                        W_parts.append(np.maximum(ent.ravel(), 0.01))

            X=np.concatenate(X_parts); Y=np.concatenate(Y_parts); W=np.concatenate(W_parts)

            lgb_m, cat_m = {}, {}
            for cls in range(CLASS_COUNT):
                m = lgb.LGBMRegressor(objective="regression", n_estimators=n_lgb, max_depth=8,
                    learning_rate=0.02, min_child_samples=30, subsample=0.7,
                    colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=4, random_state=42)
                m.fit(X, Y[:,cls], sample_weight=W)
                lgb_m[cls] = m
                m2 = CatBoostRegressor(iterations=n_cat, depth=6, learning_rate=0.01,
                    l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=4)
                m2.fit(X, Y[:,cls], sample_weight=W)
                cat_m[cls] = m2

            rd = read_round_record(paths, hr).round
            analyses = read_analysis_records(paths, hr)
            ho = _load_replay_data(replays_dir, hr, max_per_seed=serve_ev)

            scores = []
            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)
                items = ho.get(si, [])
                if items:
                    ef = _build_evidence([it[0] for it in items[:serve_ev]],
                                        [it[1] for it in items[:serve_ev]], obs)
                else:
                    ef = _build_evidence([], None, np.zeros((h,w), dtype=bool))
                csf = _build_crossseed_features(ho, si, serve_ev, h, w)
                combined = np.concatenate([mf, ef, csf], axis=-1)
                Xe = combined.reshape(-1, combined.shape[-1])
                lp = np.zeros((h*w, CLASS_COUNT))
                cp = np.zeros((h*w, CLASS_COUNT))
                for c in range(CLASS_COUNT):
                    lp[:,c] = np.clip(lgb_m[c].predict(Xe), floor, 1)
                    cp[:,c] = np.clip(cat_m[c].predict(Xe), floor, 1)
                lp /= lp.sum(axis=1, keepdims=True)
                cp /= cp.sum(axis=1, keepdims=True)
                log_b = 0.5*np.log(np.maximum(lp,1e-10))+0.5*np.log(np.maximum(cp,1e-10))
                probs = np.exp(log_b)
                probs /= probs.sum(axis=1, keepdims=True)
                probs = np.maximum(probs, floor)
                probs /= probs.sum(axis=1, keepdims=True)
                bd = score_prediction(gt, probs.reshape(h,w,CLASS_COUNT))
                scores.append(bd.score)

            fold_scores.append(float(np.mean(scores)))
            print(f"  Fold {hi+1}: {fold_scores[-1]:.4f} ({time.time()-fold_start:.0f}s)")

        ms = float(np.mean(fold_scores))
        print(f"\n  >>> {tag}: score={ms:.4f} <<<")

    print("\n" + "="*60)
    print("COMPARISON: v1 crossseed baseline ev1 = 85.11")
    print("="*60)


if __name__ == "__main__":
    run_sweep()
