"""Ground-truth-targeted evidence model.

RADICAL IDEA: Instead of training on individual replay outcomes (one-hot),
train directly on ground truth probability distributions. The model
learns to predict the OPTIMAL answer, not just individual samples.

Evidence features from replays provide the observation-dependent signal.
Ground truth provides the perfect target.

With 7 training rounds × 5 seeds = 35 ground truth tensors per fold,
we have 56K cells with PERFECT targets. To get more training data,
we vary the evidence used for each ground truth target.

Usage:
    uv run python scripts/agent4_gt_evidence_model.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def _neighbor_sum_2d(arr, radius):
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius+1):
        for dx in range(-radius, radius+1):
            if dy==0 and dx==0: continue
            sy,sx = slice(max(0,-dy),min(h,h-dy)), slice(max(0,-dx),min(w,w-dx))
            ty,tx = slice(max(0,dy),min(h,h+dy)), slice(max(0,dx),min(w,w+dx))
            out[ty,tx] += arr[sy,sx]
    return out


def _build_evidence(grids, settlements_list, mask, nc=6):
    from astar.core.terrain import collapse_internal_grid
    h, w = mask.shape
    feats = []
    obs = mask.astype(np.float64)
    feats.append(obs)
    feats.append(np.full((h,w), float(len(grids))/20.0))
    if grids:
        n = len(grids)
        cf = np.zeros((h,w,nc))
        for g in grids:
            c = collapse_internal_grid(g)
            for cls in range(nc): cf[:,:,cls] += (c==cls).astype(float)
        cf /= n
        for cls in range(nc): feats.append(np.where(mask, cf[:,:,cls], 0))
        ent = np.zeros((h,w))
        for cls in range(nc):
            f = cf[:,:,cls]
            ent -= np.where(f>0, f*np.log(f+1e-10), 0)
        feats.append(np.where(mask, ent, 0))
        for r in [1,2,3]:
            no = _neighbor_sum_2d(obs, r)
            feats.append(no)
            for cls in range(nc):
                cm = np.where(mask, cf[:,:,cls], 0)
                ns = _neighbor_sum_2d(cm, r)
                feats.append(np.where(no>0, ns/no, 0))
        # Global settlement stats
        if settlements_list:
            ap,af,aw,ad = [],[],[],[]
            alive_c, dead_c, port_c = 0,0,0
            owners = set()
            for setts in settlements_list:
                for s in setts:
                    if s.get('alive', False):
                        alive_c += 1
                        ap.append(float(s.get('population',0)))
                        af.append(float(s.get('food',0)))
                        aw.append(float(s.get('wealth',0)))
                        ad.append(float(s.get('defense',0)))
                        if s.get('has_port',False): port_c += 1
                        owners.add(s.get('owner_id',0))
                    else: dead_c += 1
            gf = [
                np.mean(ap)/5 if ap else 0, np.mean(af)/2 if af else 0,
                np.mean(aw)/2 if aw else 0, np.mean(ad) if ad else 0,
                np.std(ap)/3 if len(ap)>1 else 0, np.std(af) if len(af)>1 else 0,
                alive_c/max(len(settlements_list),1)/60, dead_c/max(len(settlements_list),1)/60,
                port_c/max(alive_c,1), len(owners)/60,
            ]
            for v in gf: feats.append(np.full((h,w), v))
        else:
            for _ in range(10): feats.append(np.zeros((h,w)))
    else:
        n_ev = 2 + nc + 1 + 3*(1+nc) + 10
        for _ in range(n_ev): feats.append(np.zeros((h,w)))
    return np.stack(feats, axis=-1)


def _load_replay_data(replays_dir, round_id, max_per_seed):
    result = {}
    rd = replays_dir / round_id
    if not rd.exists(): return result
    for sd in sorted(rd.iterdir()):
        if not sd.is_dir() or not sd.name.startswith("seed_index="): continue
        si = int(sd.name.split("=")[1])
        items = []
        for rf in sorted(sd.iterdir())[:max_per_seed]:
            try:
                with open(rf) as f: data = json.load(f)
                frames = data["response"]["frames"]
                items.append((np.asarray(frames[-1]["grid"], dtype=np.int64), frames[-1].get("settlements",[])))
            except: continue
        if items: result[si] = items
    return result


def _coverage_mask(h, w):
    mask = np.zeros((h,w), dtype=bool)
    for vy in range(0,h,15):
        for vx in range(0,w,15):
            mask[vy:min(vy+15,h), vx:min(vx+15,w)] = True
    return mask


def run_gt_evidence_benchmark(
    *, name="agent4_gt_evidence_v1",
    max_replays=58, serve_ev=1, n_estimators=800, max_depth=8,
    floor=0.01, augment_count=5,
):
    import lightgbm as lgb
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT
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
    total_start = time.time()

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []

        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            analyses = read_analysis_records(paths, rid)
            replay_data = _load_replay_data(replays_dir, rid, max_per_seed=max_replays)

            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)

                items = replay_data.get(si, [])
                if not items: continue

                # Create augmented training examples by varying evidence
                for aug_idx in range(augment_count):
                    ev_level = rng.choice(evidence_levels)
                    ev_level = min(ev_level, len(items))
                    ev_indices = rng.choice(len(items), ev_level, replace=False)
                    ev_grids = [items[i][0] for i in ev_indices]
                    ev_setts = [items[i][1] for i in ev_indices]

                    ef = _build_evidence(ev_grids, ev_setts, obs)
                    combined = np.concatenate([mf, ef], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))

                    # Entropy weighting — focus on uncertain cells
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators, max_depth=max_depth,
                learning_rate=0.02, min_child_samples=30, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:,cls], sample_weight=W)
            models[cls] = m

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
                eg = [it[0] for it in items[:serve_ev]]
                es = [it[1] for it in items[:serve_ev]]
                ef = _build_evidence(eg, es, obs)
            else:
                ef = _build_evidence([], None, np.zeros((h,w), dtype=bool))
            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            probs = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                probs[:,c] = np.clip(models[c].predict(Xe), 0, 1)
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
    print(f"GT-EVIDENCE: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev}, aug={augment_count})")
    print(f"{'='*60}")
    print(f"Per-round:")
    for r,s,k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "serve_ev": serve_ev, "augment_count": augment_count,
        "mean_score": ms, "mean_weighted_kl": mk,
        "per_fold": [{"round_id":r,"score":s,"kl":k}
                     for r,s,k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_gt_evidence_ev1_v1")
    p.add_argument("--serve-ev", type=int, default=1)
    p.add_argument("--augment-count", type=int, default=5)
    a = p.parse_args()
    run_gt_evidence_benchmark(name=a.name, serve_ev=a.serve_ev, augment_count=a.augment_count)
