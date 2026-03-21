"""GT-evidence model with cross-seed features.

KEY INSIGHT FROM AGENT3: All 5 seeds share the same hidden round parameters.
Observations from OTHER seeds carry powerful round-law information.

Cross-seed features: aggregate observed class frequencies, settlement stats,
and build rates across all seeds for this round. These features tell the
model about the round's dynamics (e.g., "settlements are thriving everywhere"
or "mass collapse across all seeds").

Usage:
    uv run python scripts/agent4_gt_crossseed.py [--serve-ev N]
"""
from __future__ import annotations
import json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask


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


def _build_crossseed_features(
    all_seeds_replay_data: dict[int, list[tuple]],
    current_seed: int,
    serve_ev: int,
    h: int, w: int,
    nc: int = 6,
) -> np.ndarray:
    """Build global features from OTHER seeds' observations."""
    from astar.core.terrain import collapse_internal_grid

    feats = []

    # Aggregate stats from other seeds
    all_pop, all_food, all_wealth, all_def = [], [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    n_other_seeds = 0

    for si, items in all_seeds_replay_data.items():
        if si == current_seed:
            continue
        n_other_seeds += 1
        for grid, setts in items[:serve_ev]:
            collapsed = collapse_internal_grid(grid)
            for cls in range(nc):
                class_counts[cls] += (collapsed == cls).sum()
            total_cells += collapsed.size

            for s in setts:
                if s.get('alive', False):
                    alive_total += 1
                    all_pop.append(float(s.get('population', 0)))
                    all_food.append(float(s.get('food', 0)))
                    all_wealth.append(float(s.get('wealth', 0)))
                    all_def.append(float(s.get('defense', 0)))
                    if s.get('has_port', False): port_total += 1
                    owners.add(s.get('owner_id', 0))
                else:
                    dead_total += 1

    # Global cross-seed features (replicated per cell)
    if total_cells > 0:
        class_fracs = class_counts / total_cells
    else:
        class_fracs = np.ones(nc) / nc

    # Class distribution from other seeds
    for cls in range(nc):
        feats.append(np.full((h, w), class_fracs[cls]))

    # Settlement statistics from other seeds
    cross_feats = [
        np.mean(all_pop) / 5.0 if all_pop else 0.0,
        np.mean(all_food) / 2.0 if all_food else 0.0,
        np.mean(all_wealth) / 2.0 if all_wealth else 0.0,
        np.mean(all_def) if all_def else 0.0,
        np.std(all_pop) / 3.0 if len(all_pop) > 1 else 0.0,
        np.std(all_food) if len(all_food) > 1 else 0.0,
        alive_total / max(n_other_seeds, 1) / 60.0,
        dead_total / max(n_other_seeds, 1) / 60.0,
        port_total / max(alive_total, 1),
        len(owners) / 60.0,
        # Build rate (settlement + port fraction)
        class_fracs[1] + class_fracs[2],
        # Ruin fraction
        class_fracs[3],
        # Dynamic fraction (anything not empty/mountain/forest)
        class_fracs[1] + class_fracs[2] + class_fracs[3],
    ]
    for v in cross_feats:
        feats.append(np.full((h, w), float(v)))

    return np.stack(feats, axis=-1)


def run_crossseed(
    *, name="agent4_gt_crossseed_ev1_v1",
    max_replays=58, serve_ev=1, augment_count=5, floor=0.0003,
    n_estimators_lgb=800, n_estimators_cat=500,
):
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
    evidence_levels = [1, 2, 3, 5, 10, 15]
    fold_scores, fold_kls = [], []

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        # Build training data with cross-seed features
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

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    # Cross-seed features (use same evidence level for consistency)
                    # Build cross-seed data from other seeds at same evidence level
                    cross_replay = {}
                    for other_si, other_items in replay_data.items():
                        if other_si == si: continue
                        cross_ev = min(ev_level, len(other_items))
                        cross_idx = rng.choice(len(other_items), cross_ev, replace=False)
                        cross_replay[other_si] = [other_items[i] for i in cross_idx]

                    csf = _build_crossseed_features(cross_replay, si, ev_level, h, w)
                    combined = np.concatenate([mf, ef, csf], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts); Y = np.concatenate(Y_parts); W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train LightGBM
        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators_lgb, max_depth=8,
                learning_rate=0.02, min_child_samples=30, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=4, random_state=42)
            m.fit(X, Y[:,cls], sample_weight=W)
            lgb_models[cls] = m

        # Train CatBoost
        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=n_estimators_cat, depth=6, learning_rate=0.01,
                l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=4)
            m.fit(X, Y[:,cls], sample_weight=W)
            cat_models[cls] = m

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

            csf = _build_crossseed_features(ho, si, serve_ev, h, w)
            combined = np.concatenate([mf, ef, csf], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            # Ensemble predictions
            lgb_p = np.zeros((h*w, CLASS_COUNT))
            cat_p = np.zeros((h*w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:,c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
                cat_p[:,c] = np.clip(cat_models[c].predict(Xe), floor, 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)

            # Geometric mean ensemble
            log_blend = 0.5 * np.log(np.maximum(lgb_p, 1e-10)) + 0.5 * np.log(np.maximum(cat_p, 1e-10))
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
    print(f"GT-CROSSSEED ENSEMBLE: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")
    print(f"\nPer-round:")
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
    p.add_argument("--name", default="agent4_gt_crossseed_ev1_v1")
    p.add_argument("--serve-ev", type=int, default=1)
    a = p.parse_args()
    run_crossseed(name=a.name, serve_ev=a.serve_ev)
