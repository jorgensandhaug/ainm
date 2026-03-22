"""Focused dynamic cell model with KL-optimized training.

RADICAL APPROACH: The scoring function uses entropy-weighted KL divergence.
Static cells (mountains, deep ocean) have ~0 entropy and don't affect score.
Dynamic cells (those that could become settlements/ports/ruins) dominate.

This model:
1. Identifies "dynamic potential" cells and focuses capacity there
2. Uses KL-divergence-aligned loss instead of MSE regression
3. Trains separate sub-models for different cell dynamics regimes
4. Uses log-probability parameterization (matches KL scoring space)
5. Uses heavier augmentation for high-entropy cells

Plus all previous innovations:
- Evidence features, cross-seed features
- LGB+CatBoost ensemble with geometric mean

Usage:
    uv run python scripts/agent4_focused_dynamic_model.py [--serve-ev N]
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np


def _build_dynamic_potential_features(grid_collapsed, nc=6):
    """Identify cells with high dynamic potential.

    Returns features indicating how likely a cell is to change class.
    """
    h, w = grid_collapsed.shape
    feats = []

    # Mountains (class 5) and deep ocean are static
    mountain = (grid_collapsed == 5).astype(np.float64)
    feats.append(1.0 - mountain)  # "could change" indicator

    # Initial settlement/port cells
    sett = (grid_collapsed == 1).astype(np.float64)
    port = (grid_collapsed == 2).astype(np.float64)
    feats.append(sett + port)  # Initial built-up

    # Empty cells near settlements (colonization candidates)
    from agent4_trajectory_features import _neighbor_sum_2d
    empty = (grid_collapsed == 0).astype(np.float64)
    for radius in [1, 2, 3]:
        near_sett = _neighbor_sum_2d(sett + port, radius)
        feats.append(empty * (near_sett > 0).astype(np.float64))

    # Forest cells (can be colonized or can overgrow ruins)
    forest = (grid_collapsed == 4).astype(np.float64)
    for radius in [1, 2]:
        near_sett_f = _neighbor_sum_2d(sett + port, radius)
        feats.append(forest * (near_sett_f > 0).astype(np.float64))

    return np.stack(feats, axis=-1)


def run_focused_benchmark(
    *,
    name="agent4_focused_v1",
    max_replays=58,
    serve_ev=15,
    augment_count=8,  # More augmentation for focused model
    floor=0.0003,
    n_estimators_lgb=1200,  # More trees since focused on fewer cells
    n_estimators_cat=800,
    use_crossseed=True,
    dynamic_weight_boost=3.0,  # Extra weight for dynamic cells
    min_gt_entropy=0.05,  # Only train on cells with meaningful entropy
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

    print(f"Running focused dynamic model: {name}")
    print(f"  Rounds: {len(all_round_ids)}, serve_ev={serve_ev}")
    print(f"  dynamic_weight_boost={dynamic_weight_boost}, min_gt_entropy={min_gt_entropy}")
    print(f"  augment_count={augment_count}, n_trees_lgb={n_estimators_lgb}")

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi + 1}/{len(all_round_ids)}: held out {hr[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []
        skipped_static = 0
        kept_dynamic = 0

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
                mf = build_cellwise_features(grid, ist.settlements)
                dpf = _build_dynamic_potential_features(collapsed)
                obs = _coverage_mask(h, w)

                items = replay_data.get(si, [])
                if not items:
                    continue

                # Compute ground truth entropy to identify dynamic cells
                ent = entropy_map(gt)
                dynamic_mask = ent.ravel() >= min_gt_entropy

                for _ in range(augment_count):
                    ev_level = min(rng.choice(evidence_levels), len(items))
                    ev_idx = rng.choice(len(items), ev_level, replace=False)
                    eg = [items[i][0] for i in ev_idx]
                    es = [items[i][1] for i in ev_idx]
                    ef = _build_evidence(eg, es, obs)

                    feature_parts = [mf, dpf, ef]

                    if use_crossseed:
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

                    combined = np.concatenate(feature_parts, axis=-1)
                    X_flat = combined.reshape(-1, combined.shape[-1])
                    Y_flat = gt.reshape(-1, CLASS_COUNT)
                    ent_flat = np.maximum(ent.ravel(), 0.01)

                    # Enhanced weights for dynamic cells
                    weights = ent_flat.copy()
                    weights[dynamic_mask] *= dynamic_weight_boost

                    X_parts.append(X_flat)
                    Y_parts.append(Y_flat)
                    W_parts.append(weights)

                    kept_dynamic += dynamic_mask.sum()
                    skipped_static += (~dynamic_mask).sum()

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")
        print(f"  Dynamic/static ratio: {kept_dynamic}/{skipped_static} ({100*kept_dynamic/(kept_dynamic+skipped_static):.1f}%)")

        # Train LightGBM with more trees
        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators_lgb,
                max_depth=8,
                learning_rate=0.015,  # Lower LR with more trees
                min_child_samples=20,  # Smaller min samples for finer splits
                subsample=0.7,
                colsample_bytree=0.6,  # More aggressive feature sampling
                num_leaves=127,  # More leaves
                verbose=-1,
                n_jobs=4,
                random_state=42,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

        # Train CatBoost with more iterations
        cat_models = {}
        for cls in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=n_estimators_cat,
                depth=7,  # Slightly deeper
                learning_rate=0.008,
                l2_leaf_reg=0.5,  # Less regularization
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
            dpf = _build_dynamic_potential_features(collapsed)
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

            feature_parts = [mf, dpf, ef]

            if use_crossseed:
                csf = _build_crossseed_features(replay_data, si, serve_ev, h, w)
                feature_parts.append(csf)

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
        print(f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time() - fold_start:.1f}s")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'=' * 60}")
    print(f"FOCUSED MODEL: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
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
    p.add_argument("--name", default="agent4_focused_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    p.add_argument("--no-crossseed", action="store_true")
    a = p.parse_args()
    run_focused_benchmark(
        name=a.name,
        serve_ev=a.serve_ev,
        use_crossseed=not a.no_crossseed,
    )
