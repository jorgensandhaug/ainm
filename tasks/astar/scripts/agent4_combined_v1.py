"""Combined model: trajectory + crossseed + spatial + evidence features.

Combines all the best approaches:
1. Base map features (terrain, neighbors, positions)
2. Evidence features from replay snapshots
3. Cross-seed features from other seeds
4. Trajectory features from full 50-year replay histories
5. Spatial interaction features (multi-scale, connectivity)

Usage:
    uv run python scripts/agent4_combined_v1.py [--serve-ev N]
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np


def run_combined_benchmark(
    *,
    name="agent4_combined_v1",
    max_replays=58,
    serve_ev=15,
    augment_count=5,
    floor=0.0003,
    n_estimators_lgb=1000,
    n_estimators_cat=600,
):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from agent4_gt_evidence_model import _build_evidence, _coverage_mask
    from agent4_gt_crossseed import _build_crossseed_features, _load_replay_data
    from agent4_trajectory_features import (
        _load_full_trajectories,
        _build_trajectory_features,
        _build_crossseed_trajectory_features,
    )
    from agent4_spatial_interaction_model import build_spatial_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name
        for d in analyses_dir.iterdir()
        if d.is_dir()
        and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    rng = np.random.RandomState(42)
    evidence_levels = [1, 2, 3, 5, 10, 15]
    fold_scores, fold_kls = [], []

    print(f"Running COMBINED model: {name}")
    print(f"  Rounds: {len(all_round_ids)}, serve_ev={serve_ev}")

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi + 1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

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

                # Base map features
                mf = build_cellwise_features(grid, ist.settlements)

                # Spatial features (static, computed once)
                sf = build_spatial_features(
                    collapsed,
                    [
                        {
                            "x": s.x,
                            "y": s.y,
                            "has_port": s.has_port,
                            "alive": getattr(s, "alive", True),
                        }
                        for s in ist.settlements
                    ],
                )

                obs = _coverage_mask(h, w)

                # Load trajectory data
                traj_data = _load_full_trajectories(
                    replays_dir, rid, si, max_replays
                )

                items = replay_data.get(si, [])
                if not items:
                    continue

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    feature_parts = [mf, sf, ef]

                    # Trajectory features (subset)
                    if traj_data is not None:
                        traj_n = min(ev_level * 3, len(traj_data))
                        traj_idx = rng.choice(len(traj_data), traj_n, replace=False)
                        traj_subset = [traj_data[i] for i in traj_idx]
                        tf = _build_trajectory_features(traj_subset, collapsed)
                        feature_parts.append(tf)

                    # Cross-seed evidence features
                    cross_replay = {}
                    for other_si, other_items in replay_data.items():
                        if other_si == si:
                            continue
                        cross_ev = min(ev_level, len(other_items))
                        cross_idx = rng.choice(
                            len(other_items), cross_ev, replace=False
                        )
                        cross_replay[other_si] = [
                            other_items[i] for i in cross_idx
                        ]
                    csf = _build_crossseed_features(
                        cross_replay, si, ev_level, h, w
                    )
                    feature_parts.append(csf)

                    # Cross-seed trajectory features
                    cstf = _build_crossseed_trajectory_features(
                        replays_dir, rid, si, ev_level, max_replays, h, w
                    )
                    feature_parts.append(cstf)

                    combined = np.concatenate(feature_parts, axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train LGB
        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators_lgb,
                max_depth=8,
                learning_rate=0.02,
                min_child_samples=30,
                subsample=0.7,
                colsample_bytree=0.5,  # Lower because more features
                num_leaves=63,
                verbose=-1,
                n_jobs=4,
                random_state=42,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

        # Train CatBoost
        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=n_estimators_cat,
                depth=6,
                learning_rate=0.01,
                l2_leaf_reg=1.0,
                random_seed=42,
                verbose=0,
                thread_count=4,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            cat_models[cls] = m

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
            sf = build_spatial_features(
                collapsed,
                [
                    {
                        "x": s.x,
                        "y": s.y,
                        "has_port": s.has_port,
                        "alive": getattr(s, "alive", True),
                    }
                    for s in ist.settlements
                ],
            )
            obs = _coverage_mask(h, w)

            items = replay_data.get(si, [])
            if items:
                ef = _build_evidence(
                    [it[0] for it in items[:serve_ev]],
                    [it[1] for it in items[:serve_ev]],
                    obs,
                )
            else:
                ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

            feature_parts = [mf, sf, ef]

            # Trajectory
            traj_data = _load_full_trajectories(
                replays_dir, hr, si, serve_ev
            )
            if traj_data is not None:
                tf = _build_trajectory_features(traj_data, collapsed)
                feature_parts.append(tf)

            # Cross-seed
            csf = _build_crossseed_features(replay_data, si, serve_ev, h, w)
            feature_parts.append(csf)

            # Cross-seed trajectory
            cstf = _build_crossseed_trajectory_features(
                replays_dir, hr, si, serve_ev, serve_ev, h, w
            )
            feature_parts.append(cstf)

            combined = np.concatenate(feature_parts, axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])

            lgb_p = np.zeros((h * w, CLASS_COUNT))
            cat_p = np.zeros((h * w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                lgb_p[:, c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
                cat_p[:, c] = np.clip(cat_models[c].predict(Xe), floor, 1)
            lgb_p /= lgb_p.sum(axis=1, keepdims=True)
            cat_p /= cat_p.sum(axis=1, keepdims=True)

            log_blend = 0.5 * np.log(np.maximum(lgb_p, 1e-10)) + 0.5 * np.log(
                np.maximum(cat_p, 1e-10)
            )
            probs = np.exp(log_blend)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, floor)
            probs /= probs.sum(axis=1, keepdims=True)

            bd = score_prediction(gt, probs.reshape(h, w, CLASS_COUNT))
            scores.append(bd.score)
            kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs)
        fold_kls.append(fk)
        print(
            f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time() - fold_start:.1f}s"
        )

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'=' * 60}")
    print(f"COMBINED MODEL: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'=' * 60}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(
        json.dumps(
            {
                "name": name,
                "serve_ev": serve_ev,
                "mean_score": ms,
                "mean_weighted_kl": mk,
                "per_fold": [
                    {"round_id": r, "score": s, "kl": k}
                    for r, s, k in zip(all_round_ids, fold_scores, fold_kls)
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_combined_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    a = p.parse_args()
    run_combined_benchmark(name=a.name, serve_ev=a.serve_ev)
