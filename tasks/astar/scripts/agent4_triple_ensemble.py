"""Triple ensemble: LGB + CatBoost + ExtraTrees with cross-seed features.

More model diversity = less correlated errors = better ensemble.

Usage:
    uv run python scripts/agent4_triple_ensemble.py [--serve-ev N]
"""
from __future__ import annotations
import json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data


def run_triple(*, name="agent4_triple_ev1", max_replays=58, serve_ev=1,
               augment_count=5, floor=0.0003):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from sklearn.ensemble import ExtraTreesRegressor
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

    rng = np.random.RandomState(42)
    ev_levels = [1,2,3,5,10,15]
    fold_scores, fold_kls = [], []

    for hi, hr in enumerate(all_ids):
        train_rounds = [r for r in all_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_ids)}: held out {hr[:8]}... ===")
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
                for _ in range(augment_count):
                    ev = min(rng.choice(ev_levels), len(items))
                    idx = rng.choice(len(items), ev, replace=False)
                    eg = [items[i][0] for i in idx]; es = [items[i][1] for i in idx]
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
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        lgb_m, cat_m, et_m = {}, {}, {}
        for cls in range(CLASS_COUNT):
            print(f"  Class {cls}...", end=" ", flush=True)
            m1 = lgb.LGBMRegressor(objective="regression", n_estimators=800, max_depth=8,
                learning_rate=0.02, min_child_samples=30, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=4, random_state=42)
            m1.fit(X, Y[:,cls], sample_weight=W)
            lgb_m[cls] = m1
            m2 = CatBoostRegressor(iterations=500, depth=6, learning_rate=0.01,
                l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=4)
            m2.fit(X, Y[:,cls], sample_weight=W)
            cat_m[cls] = m2
            m3 = ExtraTreesRegressor(n_estimators=200, max_depth=12, min_samples_leaf=20,
                n_jobs=4, random_state=42)
            m3.fit(X, Y[:,cls], sample_weight=W)
            et_m[cls] = m3
            print("done")

        # Evaluate
        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        ho = _load_replay_data(replays_dir, hr, max_per_seed=serve_ev)

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
                ef = _build_evidence([it[0] for it in items[:serve_ev]],
                                    [it[1] for it in items[:serve_ev]], obs)
            else:
                ef = _build_evidence([], None, np.zeros((h,w), dtype=bool))
            csf = _build_crossseed_features(ho, si, serve_ev, h, w)
            combined = np.concatenate([mf, ef, csf], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            lp = np.zeros((h*w, CLASS_COUNT))
            cp = np.zeros((h*w, CLASS_COUNT))
            ep = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lp[:,c] = np.clip(lgb_m[c].predict(Xe), floor, 1)
                cp[:,c] = np.clip(cat_m[c].predict(Xe), floor, 1)
                ep[:,c] = np.clip(et_m[c].predict(Xe), floor, 1)
            lp /= lp.sum(axis=1, keepdims=True)
            cp /= cp.sum(axis=1, keepdims=True)
            ep /= ep.sum(axis=1, keepdims=True)

            # 3-way geometric mean
            log_b = (np.log(np.maximum(lp,1e-10)) + np.log(np.maximum(cp,1e-10)) + np.log(np.maximum(ep,1e-10))) / 3.0
            probs = np.exp(log_b)
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
    print(f"TRIPLE ENSEMBLE: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "serve_ev": serve_ev,
        "mean_score": ms, "mean_weighted_kl": mk,
        "per_fold": [{"round_id":r,"score":s,"kl":k}
                     for r,s,k in zip(all_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_triple_ev1")
    p.add_argument("--serve-ev", type=int, default=1)
    a = p.parse_args()
    run_triple(name=a.name, serve_ev=a.serve_ev)
