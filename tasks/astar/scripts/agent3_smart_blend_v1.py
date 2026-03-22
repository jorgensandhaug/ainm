"""Agent3 smart blend: use multi-episode observation means directly.

Key insight: with 10 episodes, the MEAN of observed class frequencies at each cell
is already a good Monte Carlo estimate of the true probability. We can use this
as a direct blend with the model prediction, weighted by confidence.

Unlike the naive obs-blend (which just does freq^alpha), this:
1. Uses multi-episode MEAN frequencies (more accurate estimate)
2. Weights the blend by observation COUNT (more observations = more trust)
3. Uses the model prediction for unobserved cells
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np

from agent3_cellwise_live_lgb import (
    build_map_features,
    build_viewport_evidence_features,
)
from agent3_cellwise_live_lgb_v4 import (
    build_cross_seed_evidence,
    build_settlement_proximity_from_evidence,
)
from agent3_cellwise_live_lgb_v5 import (
    build_activity_heatmap_features,
)
from agent3_multiep_v1 import (
    build_multi_episode_variance_features,
    load_cached_observations,
)


def compute_multi_episode_freq_estimate(
    all_episode_obs: list[list],
    seed_index: int,
    h: int, w: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute Monte Carlo frequency estimate from multiple episodes.
    Returns (freq_estimate, obs_count) where freq_estimate is (h,w,6) and obs_count is (h,w)."""
    from astar.core.terrain import collapse_internal_grid

    total_freq = np.zeros((h, w, 6), dtype=np.float64)
    total_count = np.zeros((h, w), dtype=np.float64)

    for obs_list in all_episode_obs:
        for obs in obs_list:
            if obs.seed_index != seed_index:
                continue
            viewport = obs.viewport
            grid = np.asarray(obs.grid, dtype=np.int64)
            collapsed = collapse_internal_grid(grid)
            for dy in range(viewport.h):
                for dx in range(viewport.w):
                    y, x = viewport.y + dy, viewport.x + dx
                    if 0 <= y < h and 0 <= x < w:
                        c = int(collapsed[dy, dx])
                        if 0 <= c < 6:
                            total_freq[y, x, c] += 1.0
                            total_count[y, x] += 1.0

    safe = np.maximum(total_count, 1.0)[..., None]
    freq_est = total_freq / safe
    return freq_est, total_count


def run_smart_blend_benchmark(
    *,
    name: str = "smart_blend_v1",
    n_estimators: int = 800,
    max_depth: int = 10,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    policy: str = "exploration",
    n_jobs_model: int = 32,
    episode_seeds: list[int] = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],
    train_episode_count: int = 3,
    eval_avg_count: int = 10,
    blend_strength: float = 0.3,  # How much to trust MC freq estimate vs model
    blend_min_obs: int = 5,  # Minimum observations before blending
) -> dict:
    import lightgbm as lgb
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"

    all_round_ids = discover_historical_eval_round_ids(paths)
    usable = [rid for rid in all_round_ids
              if all((cache_dir / f"{rid}__{policy}__budget=50__seed={es}.pkl").exists()
                     for es in episode_seeds)]
    all_round_ids = usable
    print(f"Smart blend on {len(all_round_ids)} rounds, blend={blend_strength}, min_obs={blend_min_obs}")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = {es: load_cached_observations(cache_dir, rid, policy, 50, es)
                          for es in episode_seeds}

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        # Training (same as multi-ep train)
        X_parts, Y_parts, W_parts = [], [], []
        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            h, w = round_detail.map_height, round_detail.map_width
            all_ep_obs = [obs_cache[round_id][es] for es in episode_seeds]

            for ep_idx in range(min(train_episode_count, len(episode_seeds))):
                obs = obs_cache[round_id][episode_seeds[ep_idx]]
                for seed_index, analysis in sorted(analyses.items()):
                    initial_state = round_detail.initial_states[seed_index]
                    grid = np.asarray(initial_state.grid, dtype=np.int64)
                    gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
                    feat_parts = [
                        build_map_features(grid, initial_state.settlements),
                        build_viewport_evidence_features(obs, seed_index, h, w),
                        build_cross_seed_evidence(obs, seed_index, h, w),
                        build_settlement_proximity_from_evidence(obs, seed_index, h, w),
                        build_activity_heatmap_features(obs, seed_index, h, w),
                        build_multi_episode_variance_features(all_ep_obs, seed_index, h, w),
                    ]
                    combined = np.concatenate(feat_parts, axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        W_train = np.concatenate(W_parts, axis=0)

        models = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators,
                max_depth=max_depth, learning_rate=learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
            )
            model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
            models[cls] = model

        # Evaluate with prediction averaging + smart blend
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_all = [obs_cache[held_out_round][es] for es in episode_seeds]
        seed_scores = []

        for seed_index, analysis in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            # Model predictions (averaged across episodes)
            all_preds = []
            for ep_idx in range(min(eval_avg_count, len(episode_seeds))):
                eval_obs = obs_cache[held_out_round][episode_seeds[ep_idx]]
                feat_parts = [
                    build_map_features(grid, initial_state.settlements),
                    build_viewport_evidence_features(eval_obs, seed_index, h, w),
                    build_cross_seed_evidence(eval_obs, seed_index, h, w),
                    build_settlement_proximity_from_evidence(eval_obs, seed_index, h, w),
                    build_activity_heatmap_features(eval_obs, seed_index, h, w),
                    build_multi_episode_variance_features(eval_all, seed_index, h, w),
                ]
                combined = np.concatenate(feat_parts, axis=-1)
                X_eval = combined.reshape(-1, combined.shape[-1])
                probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                for cls in range(CLASS_COUNT):
                    probs[:, cls] = np.clip(models[cls].predict(X_eval), 1e-8, 1.0)
                probs /= np.maximum(probs.sum(axis=1, keepdims=True), 1e-10)
                all_preds.append(probs)

            log_avg = np.mean([np.log(p) for p in all_preds], axis=0)
            model_pred = np.exp(log_avg)
            model_pred /= model_pred.sum(axis=1, keepdims=True)

            # Monte Carlo frequency estimate from all episodes
            freq_est, obs_count = compute_multi_episode_freq_estimate(
                eval_all, seed_index, h, w)
            freq_flat = freq_est.reshape(-1, CLASS_COUNT)
            count_flat = obs_count.ravel()

            # Smart blend: at observed cells with enough observations, blend in MC estimate
            blend_mask = count_flat >= blend_min_obs
            alpha = np.zeros(len(count_flat))
            alpha[blend_mask] = blend_strength * np.minimum(count_flat[blend_mask] / (blend_min_obs * 2), 1.0)

            # Geometric blend in log space
            freq_safe = np.maximum(freq_flat, 1e-8)
            freq_safe /= freq_safe.sum(axis=1, keepdims=True)
            blended = np.exp(
                (1 - alpha[:, None]) * np.log(model_pred) +
                alpha[:, None] * np.log(freq_safe)
            )
            blended /= blended.sum(axis=1, keepdims=True)
            blended = np.maximum(blended, probability_floor)
            blended /= blended.sum(axis=1, keepdims=True)

            pred = blended.reshape(h, w, CLASS_COUNT)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({
            "fold_idx": fold_idx, "held_out_round": held_out_round,
            "score": fold_score, "time_s": time.time() - fold_start,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r['score'] for r in fold_results]))
    print(f"\nSMART BLEND MEAN: {mean_score:.4f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "blend_strength": blend_strength,
        "blend_min_obs": blend_min_obs,
        "total_time_s": time.time() - total_start,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="smart_blend")
    parser.add_argument("--blend-strength", type=float, default=0.3)
    parser.add_argument("--blend-min-obs", type=int, default=5)
    parser.add_argument("--n-jobs-model", type=int, default=64)
    args = parser.parse_args()
    run_smart_blend_benchmark(
        name=args.name, blend_strength=args.blend_strength,
        blend_min_obs=args.blend_min_obs, n_jobs_model=args.n_jobs_model,
    )
