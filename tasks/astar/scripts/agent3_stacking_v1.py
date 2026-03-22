"""Agent3: 2-stage stacking model.

Stage 1: Standard cellwise LGB (same as best model)
Stage 2: Takes Stage 1 predictions + spatially-smoothed Stage 1 predictions +
         original features as input, predicts refined probabilities.

The key insight: Stage 2 can learn spatial corrections because it sees both the
raw cellwise predictions AND smoothed versions at multiple scales. This lets it
learn when the raw prediction is right (static cells) and when spatial context
should override it (transition zones).
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np

from agent3_cellwise_live_lgb import build_map_features, build_viewport_evidence_features
from agent3_cellwise_live_lgb_v4 import build_cross_seed_evidence, build_settlement_proximity_from_evidence
from agent3_cellwise_live_lgb_v5 import build_activity_heatmap_features, _gaussian_smooth
from agent3_multiep_v1 import build_multi_episode_variance_features, load_cached_observations


def build_stacking_features(
    pred_map: np.ndarray,  # (H, W, 6) stage-1 prediction
    h: int, w: int,
) -> np.ndarray:
    """Build spatial context features from stage-1 predictions."""
    features = []

    # 1. Raw stage-1 predictions (6 features)
    features.append(pred_map)

    # 2. Spatially smoothed predictions at multiple scales
    for sigma in [1.0, 2.0, 4.0]:
        smoothed = np.zeros_like(pred_map)
        for cls in range(6):
            smoothed[:, :, cls] = _gaussian_smooth(pred_map[:, :, cls], sigma)
        smoothed = np.maximum(smoothed, 1e-8)
        smoothed /= smoothed.sum(axis=-1, keepdims=True)
        features.append(smoothed)

    # 3. Difference between raw and smoothed (spatial residuals)
    for sigma in [1.0, 2.0]:
        smoothed = np.zeros_like(pred_map)
        for cls in range(6):
            smoothed[:, :, cls] = _gaussian_smooth(pred_map[:, :, cls], sigma)
        smoothed = np.maximum(smoothed, 1e-8)
        smoothed /= smoothed.sum(axis=-1, keepdims=True)
        features.append(pred_map - smoothed)  # residual

    # 4. Local prediction entropy
    from astar.core.score import entropy_map
    ent = entropy_map(pred_map)
    features.append(ent[:, :, None])

    # 5. Smoothed entropy
    for sigma in [1.5, 3.0]:
        features.append(_gaussian_smooth(ent, sigma)[:, :, None])

    return np.concatenate(features, axis=-1)  # (H, W, features)


def run_stacking_benchmark(
    *,
    name: str = "stacking_v1",
    s1_n_estimators: int = 800,
    s1_max_depth: int = 10,
    s2_n_estimators: int = 400,
    s2_max_depth: int = 8,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    policy: str = "exploration",
    n_jobs_model: int = 32,
    episode_seeds: list[int] | None = None,
    train_episode_count: int = 3,
    eval_avg_count: int = 10,
) -> dict:
    import lightgbm as lgb
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    if episode_seeds is None:
        episode_seeds = list(range(0, 10000, 1000))

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"

    all_round_ids = discover_historical_eval_round_ids(paths)
    usable = [rid for rid in all_round_ids
              if all((cache_dir / f"{rid}__{policy}__budget=50__seed={es}.pkl").exists()
                     for es in episode_seeds)]
    all_round_ids = usable
    print(f"Stacking on {len(all_round_ids)} rounds")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = {es: load_cached_observations(cache_dir, rid, policy, 50, es)
                          for es in episode_seeds}

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        # ===== STAGE 1: Train standard cellwise model =====
        X1_parts, Y_parts, W_parts = [], [], []
        for round_id in train_rounds:
            rr = read_round_record(paths, round_id)
            rd = rr.round
            analyses = read_analysis_records(paths, round_id)
            h, w = rd.map_height, rd.map_width
            all_ep = [obs_cache[round_id][es] for es in episode_seeds]
            for ep_idx in range(min(train_episode_count, len(episode_seeds))):
                obs = obs_cache[round_id][episode_seeds[ep_idx]]
                for si, ana in sorted(analyses.items()):
                    ist = rd.initial_states[si]
                    grid = np.asarray(ist.grid, dtype=np.int64)
                    gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)
                    fp = [build_map_features(grid, ist.settlements),
                          build_viewport_evidence_features(obs, si, h, w),
                          build_cross_seed_evidence(obs, si, h, w),
                          build_settlement_proximity_from_evidence(obs, si, h, w),
                          build_activity_heatmap_features(obs, si, h, w),
                          build_multi_episode_variance_features(all_ep, si, h, w)]
                    c = np.concatenate(fp, axis=-1)
                    X1_parts.append(c.reshape(-1, c.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X1 = np.concatenate(X1_parts, axis=0)
        Y = np.concatenate(Y_parts, axis=0)
        W = np.concatenate(W_parts, axis=0)

        stage1_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=s1_n_estimators,
                max_depth=s1_max_depth, learning_rate=learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
            )
            m.fit(X1, Y[:, cls], sample_weight=W)
            stage1_models[cls] = m

        # ===== STAGE 2: Build stacking features from stage-1 predictions =====
        X2_parts, Y2_parts, W2_parts = [], [], []
        cell_idx = 0
        for round_id in train_rounds:
            rr = read_round_record(paths, round_id)
            rd = rr.round
            analyses = read_analysis_records(paths, round_id)
            h, w = rd.map_height, rd.map_width
            all_ep = [obs_cache[round_id][es] for es in episode_seeds]
            for ep_idx in range(min(train_episode_count, len(episode_seeds))):
                obs = obs_cache[round_id][episode_seeds[ep_idx]]
                for si, ana in sorted(analyses.items()):
                    ist = rd.initial_states[si]
                    grid = np.asarray(ist.grid, dtype=np.int64)
                    gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)

                    # Get stage-1 prediction for this seed
                    n_cells = h * w
                    x1_block = X1[cell_idx:cell_idx + n_cells]
                    cell_idx += n_cells

                    s1_probs = np.zeros((n_cells, CLASS_COUNT))
                    for cls in range(CLASS_COUNT):
                        s1_probs[:, cls] = np.clip(stage1_models[cls].predict(x1_block), 1e-8, 1.0)
                    s1_probs /= np.maximum(s1_probs.sum(axis=1, keepdims=True), 1e-10)
                    s1_pred = s1_probs.reshape(h, w, CLASS_COUNT)

                    # Build stacking features
                    stack_feats = build_stacking_features(s1_pred, h, w)
                    # Combine original features + stacking features
                    combined = np.concatenate([x1_block, stack_feats.reshape(-1, stack_feats.shape[-1])], axis=-1)
                    X2_parts.append(combined)
                    Y2_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W2_parts.append(np.maximum(ent.ravel(), 0.01))

        X2 = np.concatenate(X2_parts, axis=0)
        Y2 = np.concatenate(Y2_parts, axis=0)
        W2 = np.concatenate(W2_parts, axis=0)

        stage2_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=s2_n_estimators,
                max_depth=s2_max_depth, learning_rate=learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
            )
            m.fit(X2, Y2[:, cls], sample_weight=W2)
            stage2_models[cls] = m

        # ===== EVALUATE with averaging =====
        rr = read_round_record(paths, held_out_round)
        rd = rr.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_all = [obs_cache[held_out_round][es] for es in episode_seeds]
        seed_scores = []

        for si, ana in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            all_preds = []
            for ep_idx in range(min(eval_avg_count, len(episode_seeds))):
                eobs = obs_cache[held_out_round][episode_seeds[ep_idx]]
                fp = [build_map_features(grid, ist.settlements),
                      build_viewport_evidence_features(eobs, si, h, w),
                      build_cross_seed_evidence(eobs, si, h, w),
                      build_settlement_proximity_from_evidence(eobs, si, h, w),
                      build_activity_heatmap_features(eobs, si, h, w),
                      build_multi_episode_variance_features(eval_all, si, h, w)]
                c = np.concatenate(fp, axis=-1)
                X_e = c.reshape(-1, c.shape[-1])

                # Stage 1
                s1_probs = np.zeros((h * w, CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    s1_probs[:, cls] = np.clip(stage1_models[cls].predict(X_e), 1e-8, 1.0)
                s1_probs /= np.maximum(s1_probs.sum(axis=1, keepdims=True), 1e-10)
                s1_pred = s1_probs.reshape(h, w, CLASS_COUNT)

                # Stage 2
                stack_feats = build_stacking_features(s1_pred, h, w)
                X2_e = np.concatenate([X_e, stack_feats.reshape(-1, stack_feats.shape[-1])], axis=-1)
                s2_probs = np.zeros((h * w, CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    s2_probs[:, cls] = np.clip(stage2_models[cls].predict(X2_e), 1e-8, 1.0)
                s2_probs /= np.maximum(s2_probs.sum(axis=1, keepdims=True), 1e-10)
                all_preds.append(s2_probs)

            log_avg = np.mean([np.log(np.maximum(p, 1e-8)) for p in all_preds], axis=0)
            avg = np.exp(log_avg)
            avg /= avg.sum(axis=1, keepdims=True)
            avg = np.maximum(avg, probability_floor)
            avg /= avg.sum(axis=1, keepdims=True)
            pred = avg.reshape(h, w, CLASS_COUNT)

            bd = score_prediction(gt, pred)
            seed_scores.append(bd.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({
            "fold_idx": fold_idx, "held_out_round": held_out_round,
            "score": fold_score, "time_s": time.time() - fold_start,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r["score"] for r in fold_results]))
    total_time = time.time() - total_start
    print(f"\nSTACKING MEAN: {mean_score:.4f} (time={total_time:.0f}s)")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "total_time_s": total_time,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="stacking_v1")
    parser.add_argument("--n-jobs-model", type=int, default=64)
    args = parser.parse_args()
    run_stacking_benchmark(name=args.name, n_jobs_model=args.n_jobs_model)
