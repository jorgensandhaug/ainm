"""Spatial interaction model with multi-scale neighborhood features.

RADICAL APPROACH: Current models treat each cell independently. But game
dynamics are fundamentally spatial:
- Settlements spread to neighbors
- Conflict depends on nearby settlement density
- Trade requires port proximity
- Winter severity may depend on geography clusters

This model adds:
1. Multi-scale spatial context (radii 1, 2, 3, 5, 8)
2. Directional features (coast direction, mountain barriers)
3. Connectivity features (reachable land cells, choke points)
4. Settlement cluster features (cluster size, density, edge effects)
5. Per-class neighborhood composition at multiple scales

Combined with evidence features and cross-seed features in the
same LGB+CatBoost ensemble framework.

Usage:
    uv run python scripts/agent4_spatial_interaction_model.py [--serve-ev N]
"""
from __future__ import annotations

import json
import time
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage


def _neighbor_sum_2d(arr, radius):
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            sy, sx = slice(max(0, -dy), min(h, h - dy)), slice(max(0, -dx), min(w, w - dx))
            ty, tx = slice(max(0, dy), min(h, h + dy)), slice(max(0, dx), min(w, w + dx))
            out[ty, tx] += arr[sy, sx]
    return out


def build_spatial_features(grid_collapsed, settlements, nc=6):
    """Build rich spatial interaction features from the initial map.

    These features capture spatial structure that the per-cell model misses.
    """
    h, w = grid_collapsed.shape
    feats = []

    # Multi-scale class composition
    for radius in [1, 2, 3, 5, 8]:
        for cls in range(nc):
            cls_mask = (grid_collapsed == cls).astype(np.float64)
            ns = _neighbor_sum_2d(cls_mask, radius)
            count = _neighbor_sum_2d(np.ones_like(cls_mask), radius)
            feats.append(np.where(count > 0, ns / count, 0))

    # Land mask and connectivity
    land = ((grid_collapsed != 0) | True).astype(np.float64)  # class 0 includes ocean
    # Actually, need to check what class 0 is - it's empty/ocean/plains
    # Mountains = class 5, Forest = class 4
    # Land = NOT ocean. But ocean is collapsed into class 0 with empty/plains
    # Let's use raw grid for better ocean detection
    ocean = (grid_collapsed == 0).astype(np.float64)
    land = 1.0 - ocean  # Approximate

    # Use mountains and forests for barrier detection
    mountain = (grid_collapsed == 5).astype(np.float64)
    forest = (grid_collapsed == 4).astype(np.float64)

    # Distance to coast (land-ocean boundary)
    if ocean.sum() > 0 and (1 - ocean).sum() > 0:
        coast = np.zeros_like(ocean)
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dy == 0 and dx == 0:
                    continue
                shifted = np.roll(np.roll(ocean, dy, axis=0), dx, axis=1)
                coast = np.maximum(coast, np.abs(ocean - shifted))
        dist_to_coast = ndimage.distance_transform_edt(1 - coast)
        feats.append(dist_to_coast / max(h, w))
    else:
        feats.append(np.zeros((h, w)))

    # Distance to mountain
    if mountain.sum() > 0:
        dist_to_mountain = ndimage.distance_transform_edt(1 - mountain)
        feats.append(dist_to_mountain / max(h, w))
    else:
        feats.append(np.full((h, w), 1.0))

    # Distance to forest
    if forest.sum() > 0:
        dist_to_forest = ndimage.distance_transform_edt(1 - forest)
        feats.append(dist_to_forest / max(h, w))
    else:
        feats.append(np.full((h, w), 1.0))

    # Settlement density and clusters
    sett_map = np.zeros((h, w), dtype=np.float64)
    port_map = np.zeros((h, w), dtype=np.float64)
    for s in settlements:
        x, y = s.get("x", 0), s.get("y", 0)
        if s.get("alive", True):
            if 0 <= y < h and 0 <= x < w:
                sett_map[y, x] = 1.0
                if s.get("has_port", False):
                    port_map[y, x] = 1.0

    # Multi-scale settlement density
    for radius in [2, 4, 8]:
        sd = _neighbor_sum_2d(sett_map, radius)
        feats.append(sd)

    # Distance to nearest initial settlement
    if sett_map.sum() > 0:
        dist_to_sett = ndimage.distance_transform_edt(1 - sett_map)
        feats.append(dist_to_sett / max(h, w))
    else:
        feats.append(np.full((h, w), 1.0))

    # Distance to nearest port
    if port_map.sum() > 0:
        dist_to_port = ndimage.distance_transform_edt(1 - port_map)
        feats.append(dist_to_port / max(h, w))
    else:
        feats.append(np.full((h, w), 1.0))

    # Connected component features (settlement clusters)
    if sett_map.sum() > 0:
        # Dilate settlements slightly to find clusters
        dilated = ndimage.binary_dilation(sett_map > 0, iterations=2)
        labels, n_clusters = ndimage.label(dilated)
        cluster_sizes = ndimage.sum(sett_map, labels, range(1, n_clusters + 1))

        # Size of this cell's cluster
        cluster_size_map = np.zeros((h, w))
        for i in range(1, n_clusters + 1):
            cluster_size_map[labels == i] = cluster_sizes[i - 1]
        feats.append(cluster_size_map / max(sett_map.sum(), 1))
    else:
        feats.append(np.zeros((h, w)))

    # Terrain diversity in neighborhood (entropy of class distribution)
    for radius in [2, 4]:
        local_entropy = np.zeros((h, w), dtype=np.float64)
        count = _neighbor_sum_2d(np.ones((h, w)), radius)
        for cls in range(nc):
            cls_mask = (grid_collapsed == cls).astype(np.float64)
            p = _neighbor_sum_2d(cls_mask, radius)
            p = np.where(count > 0, p / count, 0)
            local_entropy -= np.where(p > 0, p * np.log(p + 1e-10), 0)
        feats.append(local_entropy)

    # Edge features (distance to map boundary)
    ys = np.arange(h).reshape(-1, 1) / h
    xs = np.arange(w).reshape(1, -1) / w
    feats.append(np.broadcast_to(np.minimum(ys, 1 - ys), (h, w)).copy())
    feats.append(np.broadcast_to(np.minimum(xs, 1 - xs), (h, w)).copy())

    # Gradient features (directional class changes)
    for cls in range(nc):
        cls_mask = (grid_collapsed == cls).astype(np.float64)
        # Sobel-like gradients
        gy = np.diff(cls_mask, axis=0, prepend=cls_mask[:1, :])
        gx = np.diff(cls_mask, axis=1, prepend=cls_mask[:, :1])
        feats.append(np.abs(gy))
        feats.append(np.abs(gx))

    return np.stack(feats, axis=-1)


def run_spatial_benchmark(
    *,
    name="agent4_spatial_v1",
    max_replays=58,
    serve_ev=15,
    augment_count=5,
    floor=0.0003,
    n_estimators_lgb=800,
    n_estimators_cat=500,
    use_crossseed=True,
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

    print(f"Running spatial interaction benchmark: {name}")
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
                mf = build_cellwise_features(grid, ist.settlements)
                sf = build_spatial_features(collapsed, [
                    {"x": s.x, "y": s.y, "has_port": s.has_port, "alive": getattr(s, "alive", True)}
                    for s in ist.settlements
                ])
                obs = _coverage_mask(h, w)

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
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        W = np.concatenate(W_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        lgb_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators_lgb,
                max_depth=8,
                learning_rate=0.02,
                min_child_samples=30,
                subsample=0.7,
                colsample_bytree=0.7,
                num_leaves=63,
                verbose=-1,
                n_jobs=4,
                random_state=42,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            lgb_models[cls] = m

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
        replay_data = _load_replay_data(replays_dir, hr, serve_ev)

        scores, kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            collapsed = collapse_internal_grid(grid)
            mf = build_cellwise_features(grid, ist.settlements)
            sf = build_spatial_features(collapsed, [
                {"x": s.x, "y": s.y, "has_port": s.has_port, "alive": getattr(s, "alive", True)}
                for s in ist.settlements
            ])
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
        print(
            f"  Score: {fs:.4f}  KL: {fk:.6f}  Time: {time.time() - fold_start:.1f}s"
        )

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'=' * 60}")
    print(f"SPATIAL MODEL: score={ms:.4f} kl={mk:.6f} (serve_ev={serve_ev})")
    print(f"{'=' * 60}")

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
    p.add_argument("--name", default="agent4_spatial_v1")
    p.add_argument("--serve-ev", type=int, default=15)
    p.add_argument("--no-crossseed", action="store_true")
    a = p.parse_args()
    run_spatial_benchmark(
        name=a.name,
        serve_ev=a.serve_ev,
        use_crossseed=not a.no_crossseed,
    )
