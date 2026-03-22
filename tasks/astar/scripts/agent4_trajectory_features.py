"""GT-crossseed with trajectory-derived features from full 51-frame replays.

KEY NEW IDEA: Use temporal dynamics from replay trajectories, not just
the year-50 endpoint. Track growth rates, volatility, transition timing.

Usage:
    uv run python scripts/agent4_trajectory_features.py [--serve-ev N]
"""
from __future__ import annotations
import json, time, sys, os
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features

# Suppress sklearn warnings
os.environ["PYTHONWARNINGS"] = "ignore::UserWarning"
import warnings
warnings.filterwarnings("ignore", category=UserWarning)


def _load_replay_trajectories(replays_dir, round_id, max_per_seed):
    """Load full trajectories (all frames) from replays."""
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
                grids = [np.asarray(fr["grid"], dtype=np.int64) for fr in frames]
                setts = [fr.get("settlements", []) for fr in frames]
                items.append((grids, setts))
            except: continue
        if items: result[si] = items
    return result


def _build_trajectory_features(trajectories, serve_ev, h, w, nc=6):
    """Build per-cell temporal dynamics features from replay trajectories."""
    from astar.core.terrain import collapse_internal_grid

    feats = []
    if not trajectories:
        # ~30 trajectory features
        for _ in range(30): feats.append(np.zeros((h, w)))
        return np.stack(feats, axis=-1)

    n = min(len(trajectories), serve_ev)
    trajs = trajectories[:n]

    # For each trajectory, compute temporal statistics
    # Average over trajectories
    all_change_rates = []
    all_settle_growth = []
    all_final_grids = []

    for grids, setts in trajs:
        collapsed = [collapse_internal_grid(g) for g in grids]

        # Change rate at different time windows
        changes = []
        for t in range(len(collapsed) - 1):
            changes.append((collapsed[t] != collapsed[t+1]).astype(float))

        if len(changes) >= 50:
            # Early, mid, late change rates
            early = np.mean(changes[:15], axis=0)
            mid = np.mean(changes[15:35], axis=0)
            late = np.mean(changes[35:], axis=0)
        elif len(changes) > 0:
            third = max(1, len(changes)//3)
            early = np.mean(changes[:third], axis=0) if changes[:third] else np.zeros((h,w))
            mid = np.mean(changes[third:2*third], axis=0) if changes[third:2*third] else np.zeros((h,w))
            late = np.mean(changes[2*third:], axis=0) if changes[2*third:] else np.zeros((h,w))
        else:
            early = mid = late = np.zeros((h, w))

        all_change_rates.append((early, mid, late))

        # Settlement growth tracking
        if len(collapsed) >= 2:
            sett_start = (collapsed[0] == 1).astype(float) + (collapsed[0] == 2).astype(float)
            sett_end = (collapsed[-1] == 1).astype(float) + (collapsed[-1] == 2).astype(float)
            all_settle_growth.append(sett_end - sett_start)

        all_final_grids.append(collapsed[-1] if collapsed else np.zeros((h,w), dtype=int))

    # Average trajectory features
    if all_change_rates:
        avg_early = np.mean([cr[0] for cr in all_change_rates], axis=0)
        avg_mid = np.mean([cr[1] for cr in all_change_rates], axis=0)
        avg_late = np.mean([cr[2] for cr in all_change_rates], axis=0)
    else:
        avg_early = avg_mid = avg_late = np.zeros((h, w))

    feats.extend([avg_early, avg_mid, avg_late])

    # Total change rate
    feats.append(avg_early + avg_mid + avg_late)

    # Change acceleration (late - early)
    feats.append(avg_late - avg_early)

    # Settlement growth
    if all_settle_growth:
        avg_growth = np.mean(all_settle_growth, axis=0)
    else:
        avg_growth = np.zeros((h, w))
    feats.append(avg_growth)

    # Global trajectory stats (replicated per cell)
    total_early_change = float(np.mean(avg_early))
    total_late_change = float(np.mean(avg_late))
    growth_rate = float(np.mean(avg_growth))
    volatility = float(np.std(avg_early + avg_mid + avg_late))

    for v in [total_early_change, total_late_change, growth_rate, volatility]:
        feats.append(np.full((h, w), v))

    # Cross-trajectory variance (if multiple trajectories)
    if len(all_final_grids) > 1:
        final_stack = np.array(all_final_grids)
        for cls in range(nc):
            cls_freq = np.mean(final_stack == cls, axis=0)
            cls_var = np.var((final_stack == cls).astype(float), axis=0)
            feats.extend([cls_freq, cls_var])
    else:
        for cls in range(nc):
            if all_final_grids:
                feats.append((all_final_grids[0] == cls).astype(float))
            else:
                feats.append(np.zeros((h, w)))
            feats.append(np.zeros((h, w)))

    # Settlement alive/dead tracking from final frame
    if trajs and trajs[0][1]:
        final_setts = trajs[0][1][-1] if trajs[0][1] else []
        alive_count = sum(1 for s in final_setts if s.get('alive', False))
        dead_count = sum(1 for s in final_setts if not s.get('alive', False))
        feats.append(np.full((h, w), alive_count / max(alive_count + dead_count, 1)))
        feats.append(np.full((h, w), dead_count / max(alive_count + dead_count, 1)))
    else:
        feats.extend([np.zeros((h,w)), np.zeros((h,w))])

    return np.stack(feats, axis=-1)


def _load_replay_year50(replays_dir, round_id, max_per_seed):
    """Load just year-50 grids and settlements (for evidence features)."""
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


def run_traj(*, name="agent4_traj_ev15", max_replays=58, serve_ev=15,
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
            rdata = _load_replay_year50(replays_dir, rid, max_per_seed=max_replays)
            tdata = _load_replay_trajectories(replays_dir, rid, max_per_seed=max_replays)

            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs = _coverage_mask(h, w)
                items = rdata.get(si, [])
                trajs = tdata.get(si, [])
                if not items: continue

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

                    # Trajectory features from same evidence selection
                    traj_ev = min(ev, len(trajs))
                    if traj_ev > 0:
                        tidx = rng.choice(len(trajs), traj_ev, replace=False)
                        sel_trajs = [trajs[i] for i in tidx]
                    else:
                        sel_trajs = []
                    tf = _build_trajectory_features(sel_trajs, ev, h, w)

                    combined = np.concatenate([mf, ef, csf, tf], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X=np.concatenate(X_parts); Y=np.concatenate(Y_parts); W=np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        lgb_m, cat_m, et_m = {}, {}, {}
        for cls in range(CLASS_COUNT):
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

        rd = read_round_record(paths, hr).round
        analyses = read_analysis_records(paths, hr)
        ho = _load_replay_year50(replays_dir, hr, max_per_seed=serve_ev)
        ho_traj = _load_replay_trajectories(replays_dir, hr, max_per_seed=serve_ev)

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
            tf = _build_trajectory_features(ho_traj.get(si, []), serve_ev, h, w)

            combined = np.concatenate([mf, ef, csf, tf], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            all_p = []
            for models in [lgb_m, cat_m, et_m]:
                p = np.zeros((h*w, CLASS_COUNT))
                for c in range(CLASS_COUNT):
                    p[:,c] = np.clip(models[c].predict(Xe), floor, 1)
                p /= p.sum(axis=1, keepdims=True)
                all_p.append(p)
            log_s = sum(np.log(np.maximum(p, 1e-10)) for p in all_p) / 3.0
            probs = np.exp(log_s)
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
    print(f"TRAJECTORY: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
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
    p.add_argument("--name", default="agent4_traj_ev15")
    p.add_argument("--serve-ev", type=int, default=15)
    a = p.parse_args()
    run_traj(name=a.name, serve_ev=a.serve_ev)
