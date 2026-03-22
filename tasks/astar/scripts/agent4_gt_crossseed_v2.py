"""GT-evidence with cross-seed + activity heatmap features v2.

Adds Agent3's key innovations on top of cross-seed features:
1. Activity heatmap features (multi-scale spatial patterns)
2. Settlement proximity from observed data
3. Build rate conditioning
4. Better augmentation with cross-seed variation

Usage:
    uv run python scripts/agent4_gt_crossseed_v2.py [--serve-ev N]
"""
from __future__ import annotations
import json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _coverage_mask


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


def _gaussian_blur(arr, sigma):
    """Simple Gaussian blur using box blur approximation."""
    if sigma < 0.5:
        return arr.copy()
    radius = max(1, int(round(sigma * 2)))
    h, w = arr.shape
    out = arr.copy()
    for _ in range(3):  # 3-pass box blur approximates Gaussian
        tmp = np.zeros_like(out)
        for dy in range(-radius, radius+1):
            sy = slice(max(0,-dy),min(h,h-dy))
            ty = slice(max(0,dy),min(h,h+dy))
            tmp[ty,:] += out[sy,:]
        out = tmp / (2*radius+1)
        tmp = np.zeros_like(out)
        for dx in range(-radius, radius+1):
            sx = slice(max(0,-dx),min(w,w-dx))
            tx = slice(max(0,dx),min(w,w+dx))
            tmp[:,tx] += out[:,sx]
        out = tmp / (2*radius+1)
    return out


def _build_evidence_v2(grids, settlements_list, mask, nc=6):
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

        # Settlement stats
        if settlements_list:
            ap,af,aw,ad = [],[],[],[]
            alive_c, dead_c, port_c = 0,0,0
            owners = set()
            for setts in settlements_list:
                for s in setts:
                    if s.get('alive',False):
                        alive_c+=1; ap.append(float(s.get('population',0)))
                        af.append(float(s.get('food',0))); aw.append(float(s.get('wealth',0)))
                        ad.append(float(s.get('defense',0)))
                        if s.get('has_port',False): port_c+=1
                        owners.add(s.get('owner_id',0))
                    else: dead_c+=1
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

        # NEW: Activity heatmap features
        # Settlement activity (class 1 = settlement)
        sett_activity = np.where(mask, cf[:,:,1], 0)
        port_activity = np.where(mask, cf[:,:,2], 0)
        ruin_activity = np.where(mask, cf[:,:,3], 0)
        total_activity = sett_activity + port_activity + ruin_activity

        for sigma in [1.5, 3.0, 5.0]:
            feats.append(_gaussian_blur(total_activity, sigma))
            feats.append(_gaussian_blur(sett_activity, sigma))
            feats.append(_gaussian_blur(ruin_activity, sigma))

        # Build rate (settlement + port as fraction of observed cells)
        build_rate = np.where(obs > 0, cf[:,:,1] + cf[:,:,2], 0)
        feats.append(np.full((h,w), float(np.sum(build_rate) / max(np.sum(obs), 1))))

        # NEW: Settlement proximity from observed data
        if settlements_list:
            sett_pos = np.zeros((h, w), dtype=np.float64)
            for setts in settlements_list:
                for s in setts:
                    if s.get('alive', False):
                        sy, sx = int(s.get('y',0)), int(s.get('x',0))
                        if 0 <= sy < h and 0 <= sx < w:
                            sett_pos[sy, sx] = 1.0
            # Distance-decayed settlement proximity
            for sigma in [2.0, 5.0]:
                feats.append(_gaussian_blur(sett_pos, sigma))
        else:
            feats.append(np.zeros((h,w)))
            feats.append(np.zeros((h,w)))
    else:
        n_ev = 2 + nc + 1 + 3*(1+nc) + 10 + 9 + 1 + 2
        for _ in range(n_ev): feats.append(np.zeros((h,w)))

    return np.stack(feats, axis=-1)


def _build_crossseed_v2(all_replay, cur_si, serve_ev, h, w, nc=6):
    from astar.core.terrain import collapse_internal_grid
    feats = []
    all_pop, all_food, all_wealth, all_def = [],[],[],[]
    alive_t, dead_t, port_t = 0,0,0
    owners = set()
    cc = np.zeros(nc)
    total_c = 0
    n_seeds = 0

    for si, items in all_replay.items():
        if si == cur_si: continue
        n_seeds += 1
        for grid, setts in items[:serve_ev]:
            c = collapse_internal_grid(grid)
            for cls in range(nc): cc[cls] += (c==cls).sum()
            total_c += c.size
            for s in setts:
                if s.get('alive',False):
                    alive_t+=1; all_pop.append(float(s.get('population',0)))
                    all_food.append(float(s.get('food',0))); all_wealth.append(float(s.get('wealth',0)))
                    all_def.append(float(s.get('defense',0)))
                    if s.get('has_port',False): port_t+=1
                    owners.add(s.get('owner_id',0))
                else: dead_t+=1

    cf = cc/max(total_c,1) if total_c>0 else np.ones(nc)/nc
    for cls in range(nc): feats.append(np.full((h,w), cf[cls]))

    cross = [
        np.mean(all_pop)/5 if all_pop else 0, np.mean(all_food)/2 if all_food else 0,
        np.mean(all_wealth)/2 if all_wealth else 0, np.mean(all_def) if all_def else 0,
        np.std(all_pop)/3 if len(all_pop)>1 else 0, np.std(all_food) if len(all_food)>1 else 0,
        alive_t/max(n_seeds,1)/60, dead_t/max(n_seeds,1)/60,
        port_t/max(alive_t,1), len(owners)/60,
        cf[1]+cf[2], cf[3], cf[1]+cf[2]+cf[3],
    ]
    for v in cross: feats.append(np.full((h,w), float(v)))
    return np.stack(feats, axis=-1)


def _load_replay(replays_dir, round_id, max_per_seed):
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


def run_v2(*, name="agent4_gt_crossseed_v2_ev1", max_replays=58, serve_ev=1,
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
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    rng = np.random.RandomState(42)
    ev_levels = [1,2,3,5,10,15]
    fold_scores, fold_kls = [], []

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []
        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            analyses = read_analysis_records(paths, rid)
            rdata = _load_replay(replays_dir, rid, max_per_seed=max_replays)
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
                    eg = [items[i][0] for i in idx]
                    es = [items[i][1] for i in idx]
                    ef = _build_evidence_v2(eg, es, obs)
                    cross_rdata = {}
                    for osi, oitems in rdata.items():
                        if osi==si: continue
                        cev = min(ev, len(oitems))
                        cidx = rng.choice(len(oitems), cev, replace=False)
                        cross_rdata[osi] = [oitems[i] for i in cidx]
                    csf = _build_crossseed_v2(cross_rdata, si, ev, h, w)
                    combined = np.concatenate([mf, ef, csf], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X=np.concatenate(X_parts); Y=np.concatenate(Y_parts); W=np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

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
        ho = _load_replay(replays_dir, hr, max_per_seed=serve_ev)

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
                ef = _build_evidence_v2([it[0] for it in items[:serve_ev]],
                                       [it[1] for it in items[:serve_ev]], obs)
            else:
                ef = _build_evidence_v2([], None, np.zeros((h,w), dtype=bool))
            csf = _build_crossseed_v2(ho, si, serve_ev, h, w)
            combined = np.concatenate([mf, ef, csf], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            lp = np.zeros((h*w, CLASS_COUNT))
            cp = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lp[:,c] = np.clip(lgb_m[c].predict(Xe), floor, 1)
                cp[:,c] = np.clip(cat_m[c].predict(Xe), floor, 1)
            lp /= lp.sum(axis=1, keepdims=True)
            cp /= cp.sum(axis=1, keepdims=True)
            log_b = 0.5*np.log(np.maximum(lp,1e-10)) + 0.5*np.log(np.maximum(cp,1e-10))
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
    print(f"GT-CROSSSEED-V2: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")
    for r,s,k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "serve_ev": serve_ev,
        "mean_score": ms, "mean_weighted_kl": mk,
        "per_fold": [{"round_id":r,"score":s,"kl":k}
                     for r,s,k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_gt_crossseed_v2_ev1")
    p.add_argument("--serve-ev", type=int, default=1)
    a = p.parse_args()
    run_v2(name=a.name, serve_ev=a.serve_ev)
