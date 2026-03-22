"""Agent3: Spatial post-processing of cellwise predictions.

The cellwise LGB predicts each cell independently, missing spatial correlations.
This script takes the best multi-ep avg predictions and applies spatial post-processing:
1. Gaussian smoothing of probability maps
2. Entropy-adaptive smoothing (more smoothing on high-entropy areas)
3. Cross-class spatial consistency enforcement

Hypothesis: spatial smoothing will reduce noise in predictions and improve
calibration at transition zones between different terrain types.
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


def spatial_smooth_prediction(pred: np.ndarray, sigma: float = 0.5,
                               entropy_adaptive: bool = True) -> np.ndarray:
    """Apply spatial Gaussian smoothing to prediction tensor (H,W,6).

    If entropy_adaptive: only smooth high-entropy (uncertain) areas.
    Low-entropy (deterministic) cells keep their predictions.
    """
    from astar.core.score import entropy_map

    h, w, c = pred.shape
    smoothed = np.zeros_like(pred)

    for cls in range(c):
        smoothed[:, :, cls] = _gaussian_smooth(pred[:, :, cls], sigma)

    # Renormalize
    smoothed = np.maximum(smoothed, 1e-8)
    smoothed /= smoothed.sum(axis=-1, keepdims=True)

    if entropy_adaptive:
        # Only blend smoothed predictions at high-entropy cells
        ent = entropy_map(pred)
        # Sigmoid blend: more smoothing where entropy is high
        alpha = 1.0 / (1.0 + np.exp(-5.0 * (ent - 0.3)))  # midpoint at entropy=0.3
        result = (1.0 - alpha[..., None]) * pred + alpha[..., None] * smoothed
        result = np.maximum(result, 1e-8)
        result /= result.sum(axis=-1, keepdims=True)
        return result

    return smoothed


def run_spatial_postprocess_benchmark(
    *,
    name: str = "spatial_postprocess",
    sigma: float = 0.5,
    entropy_adaptive: bool = True,
    n_estimators: int = 800,
    max_depth: int = 10,
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
    print(f"Spatial postprocess on {len(all_round_ids)} rounds, sigma={sigma}, adaptive={entropy_adaptive}")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = {es: load_cached_observations(cache_dir, rid, policy, 50, es)
                          for es in episode_seeds}

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []
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
                    X_parts.append(c.reshape(-1, c.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X = np.concatenate(X_parts, axis=0)
        Y = np.concatenate(Y_parts, axis=0)
        W = np.concatenate(W_parts, axis=0)

        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators,
                max_depth=max_depth, learning_rate=learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            models[cls] = m

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
                probs = np.zeros((h * w, CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    probs[:, cls] = np.clip(models[cls].predict(X_e), 1e-8, 1.0)
                probs /= np.maximum(probs.sum(axis=1, keepdims=True), 1e-10)
                all_preds.append(probs)

            log_avg = np.mean([np.log(np.maximum(p, 1e-8)) for p in all_preds], axis=0)
            avg = np.exp(log_avg)
            avg /= avg.sum(axis=1, keepdims=True)
            avg = np.maximum(avg, probability_floor)
            avg /= avg.sum(axis=1, keepdims=True)
            pred = avg.reshape(h, w, CLASS_COUNT)

            # Apply spatial post-processing
            pred = spatial_smooth_prediction(pred, sigma=sigma, entropy_adaptive=entropy_adaptive)
            pred = np.maximum(pred, probability_floor)
            pred /= pred.sum(axis=-1, keepdims=True)

            bd = score_prediction(gt, pred)
            seed_scores.append(bd.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({
            "fold_idx": fold_idx, "held_out_round": held_out_round,
            "score": fold_score, "time_s": time.time() - fold_start,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r["score"] for r in fold_results]))
    print(f"\nSPATIAL POSTPROCESS: {mean_score:.4f} (sigma={sigma})")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "sigma": sigma, "entropy_adaptive": entropy_adaptive,
        "total_time_s": time.time() - total_start,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="spatial_smooth")
    parser.add_argument("--sigma", type=float, default=0.5)
    parser.add_argument("--no-adaptive", action="store_true")
    parser.add_argument("--n-jobs-model", type=int, default=64)
    args = parser.parse_args()
    run_spatial_postprocess_benchmark(
        name=args.name, sigma=args.sigma,
        entropy_adaptive=not args.no_adaptive,
        n_jobs_model=args.n_jobs_model,
    )
