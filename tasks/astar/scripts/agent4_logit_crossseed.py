"""GT-crossseed with logit-space targets.

Agent7 found logit parameterization is definitively better for KL scoring.
Instead of predicting P(class), predict log(P(class)/P(class_0)).

Usage:
    uv run python scripts/agent4_logit_crossseed.py [--serve-ev N]
"""
from __future__ import annotations
import json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data


def run_logit(*, name="agent4_logit_crossseed_ev1", max_replays=58, serve_ev=1,
              augment_count=5, floor=0.0003, n_lgb=800, n_cat=500):
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

                # Convert GT to logit-space: log(P(c)/P(0))
                gt_safe = np.maximum(gt, 1e-8)
                gt_logits = np.log(gt_safe) - np.log(gt_safe[:,:,0:1])  # relative to class 0

                for _ in range(augment_count):
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
                    # Use logit targets for classes 1-5 (class 0 is reference)
                    Y_parts.append(gt_logits.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X=np.concatenate(X_parts); Y=np.concatenate(Y_parts); W=np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train on logit targets (LGB only - CatBoost fails on constant class 0 logit)
        lgb_m = {}
        for cls in range(CLASS_COUNT):
            if cls == 0:
                # Class 0 logit is always 0 (reference), skip
                lgb_m[cls] = None
                continue
            m = lgb.LGBMRegressor(objective="regression", n_estimators=n_lgb, max_depth=8,
                learning_rate=0.02, min_child_samples=30, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42)
            m.fit(X, Y[:,cls], sample_weight=W)
            lgb_m[cls] = m

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

            # Predict logits then softmax
            logits = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                if lgb_m[c] is not None:
                    logits[:,c] = lgb_m[c].predict(Xe)
                # Class 0 stays at 0 (reference)
            avg_logits = logits

            # Softmax to get probabilities
            avg_logits -= avg_logits.max(axis=1, keepdims=True)  # numerical stability
            probs = np.exp(avg_logits)
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
    print(f"LOGIT-CROSSSEED: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
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
    p.add_argument("--name", default="agent4_logit_crossseed_ev1")
    p.add_argument("--serve-ev", type=int, default=1)
    a = p.parse_args()
    run_logit(name=a.name, serve_ev=a.serve_ev)
