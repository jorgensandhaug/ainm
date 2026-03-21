"""Evidence LGB with settlement statistics as global features.

Adds round-level features derived from observed settlements:
mean population, food, wealth, defense across all observed settlements.
These features carry round-law information that helps distinguish
different round dynamics.

Usage:
    uv run python scripts/agent4_evidence_with_settlements.py
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


def _build_evidence_with_global(
    replay_grids, replay_settlements_list, observed_mask, nc=6,
):
    from astar.core.terrain import collapse_internal_grid
    h, w = observed_mask.shape
    features = []
    obs = observed_mask.astype(np.float64)
    features.append(obs)
    features.append(np.full((h,w), float(len(replay_grids))/20.0))

    if replay_grids:
        n = len(replay_grids)
        cf = np.zeros((h,w,nc))
        for g in replay_grids:
            c = collapse_internal_grid(g)
            for cls in range(nc):
                cf[:,:,cls] += (c==cls).astype(float)
        cf /= n
        for cls in range(nc):
            features.append(np.where(observed_mask, cf[:,:,cls], 0))
        ent = np.zeros((h,w))
        for cls in range(nc):
            f = cf[:,:,cls]
            ent -= np.where(f>0, f*np.log(f+1e-10), 0)
        features.append(np.where(observed_mask, ent, 0))
        for r in [1,2,3]:
            no = _neighbor_sum_2d(obs, r)
            features.append(no)
            for cls in range(nc):
                cm = np.where(observed_mask, cf[:,:,cls], 0)
                ns = _neighbor_sum_2d(cm, r)
                features.append(np.where(no>0, ns/no, 0))

        # Global settlement statistics — THE KEY NEW FEATURES
        if replay_settlements_list:
            all_pop, all_food, all_wealth, all_def = [], [], [], []
            alive_count, dead_count, port_count = 0, 0, 0
            n_owners = set()
            for setts in replay_settlements_list:
                for s in setts:
                    if s.get('alive', False):
                        alive_count += 1
                        all_pop.append(float(s.get('population', 0)))
                        all_food.append(float(s.get('food', 0)))
                        all_wealth.append(float(s.get('wealth', 0)))
                        all_def.append(float(s.get('defense', 0)))
                        if s.get('has_port', False):
                            port_count += 1
                        n_owners.add(s.get('owner_id', 0))
                    else:
                        dead_count += 1

            n_rep = len(replay_settlements_list)
            global_feats = [
                np.mean(all_pop)/5.0 if all_pop else 0.0,
                np.mean(all_food)/2.0 if all_food else 0.0,
                np.mean(all_wealth)/2.0 if all_wealth else 0.0,
                np.mean(all_def) if all_def else 0.0,
                np.std(all_pop)/3.0 if len(all_pop)>1 else 0.0,
                np.std(all_food)/1.0 if len(all_food)>1 else 0.0,
                alive_count / max(n_rep, 1) / 60.0,
                dead_count / max(n_rep, 1) / 60.0,
                port_count / max(alive_count, 1),
                len(n_owners) / 60.0,
            ]
            for v in global_feats:
                features.append(np.full((h,w), v))
        else:
            for _ in range(10):
                features.append(np.zeros((h,w)))
    else:
        n_ev = 2 + nc + 1 + 3*(1+nc) + 10
        for _ in range(n_ev):
            features.append(np.zeros((h,w)))

    return np.stack(features, axis=-1)


def _load_replay_grids_and_settlements(replays_dir, round_id, max_per_seed):
    result = {}
    rd = replays_dir / round_id
    if not rd.exists(): return result
    for sd in sorted(rd.iterdir()):
        if not sd.is_dir() or not sd.name.startswith("seed_index="): continue
        si = int(sd.name.split("=")[1])
        items = []
        for rf in sorted(sd.iterdir())[:max_per_seed]:
            try:
                with open(rf) as f:
                    data = json.load(f)
                frames = data["response"]["frames"]
                grid = np.asarray(frames[-1]["grid"], dtype=np.int64)
                setts = frames[-1].get("settlements", [])
                items.append((grid, setts))
            except (KeyError, IndexError, json.JSONDecodeError): continue
        if items: result[si] = items
    return result


def _coverage_mask(h, w):
    mask = np.zeros((h,w), dtype=bool)
    for vy in range(0,h,15):
        for vx in range(0,w,15):
            mask[vy:min(vy+15,h), vx:min(vx+15,w)] = True
    return mask


def run_benchmark(
    *, name="agent4_evidence_sett_v1",
    max_replays=58, serve_ev=1, n_estimators=800, max_depth=8, floor=0.0003,
):
    import lightgbm as lgb
    from astar.core.score import score_prediction
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
    evidence_levels = [1, 3, 5, 10, 15]
    fold_scores, fold_kls = [], []
    total_start = time.time()

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts = [], []
        for rid in train_rounds:
            rd = read_round_record(paths, rid).round
            rdata = _load_replay_grids_and_settlements(replays_dir, rid, max_per_seed=max_replays)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)
                items = rdata.get(si, [])
                if len(items) < 2: continue
                used = 0
                while used + 2 <= len(items):
                    ev = min(rng.choice(evidence_levels), len(items)-used-1)
                    if ev < 1: break
                    eg = [items[used+j][0] for j in range(ev)]
                    es = [items[used+j][1] for j in range(ev)]
                    tg = items[used+ev][0]
                    used += ev + 1
                    ef = _build_evidence_with_global(eg, es, obs)
                    combined = np.concatenate([mf, ef], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    tc = collapse_internal_grid(tg)
                    yf = np.zeros((h*w, CLASS_COUNT))
                    for c in range(CLASS_COUNT):
                        yf[:,c] = (tc.ravel()==c).astype(float)
                    Y_parts.append(yf)

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators, max_depth=max_depth,
                learning_rate=0.02, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:,cls])
            models[cls] = m

        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        ho = _load_replay_grids_and_settlements(replays_dir, hr, max_per_seed=serve_ev)

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
                ef = _build_evidence_with_global(eg, es, obs)
            else:
                ef = _build_evidence_with_global([], None, np.zeros((h,w), dtype=bool))
            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            probs = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                probs[:,c] = np.clip(models[c].predict(Xe), 0, 1)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, floor)
            probs /= probs.sum(axis=1, keepdims=True)
            bd = score_prediction(gt, probs.reshape(h,w,CLASS_COUNT))
            scores.append(bd.score)
            kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs)
        fold_kls.append(fk)
        print(f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time()-fold_start:.1f}s")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'='*60}")
    print(f"EVIDENCE+SETTLEMENTS: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")
    print(f"\nComparison:")
    print(f"  Evidence+sett ev={serve_ev}:  {ms:.4f}")
    print(f"  Mixed train ev=1:     72.35")
    print(f"  query_residual_v11:   79.39")

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
    p.add_argument("--name", default="agent4_evidence_sett_ev1_v1")
    p.add_argument("--serve-ev", type=int, default=1)
    a = p.parse_args()
    run_benchmark(name=a.name, serve_ev=a.serve_ev)
