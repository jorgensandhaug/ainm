"""Agent3 CatBoost cellwise model with cached episode observations.

Uses pre-computed episode observations from precompute_episodes.py.
This makes LOO evaluation fast since we don't reload replays for each fold.

Supports: CatBoost, LightGBM, obs-blend.
"""
from __future__ import annotations

import argparse
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


def obs_blend(pred: np.ndarray, observations: list, seed_index: int,
              h: int, w: int, temperature: float = 50.0) -> np.ndarray:
    """Blend observed class frequencies into predictions."""
    from astar.core.terrain import collapse_internal_grid
    obs_counts = np.zeros((h, w, 6), dtype=np.float64)
    obs_total = np.zeros((h, w), dtype=np.float64)

    for obs in observations:
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
                        obs_counts[y, x, c] += 1.0
                        obs_total[y, x] += 1.0

    blended = pred.copy()
    mask = obs_total > 0
    if mask.any():
        obs_freq = obs_counts[mask] / obs_total[mask, None]
        alpha = 1.0 / temperature
        blended[mask] = pred[mask] ** (1 - alpha) * np.maximum(obs_freq, 1e-8) ** alpha
        blended[mask] /= blended[mask].sum(axis=1, keepdims=True)
    return blended


def load_cached_observations(cache_dir: Path, round_id: str, policy_name: str,
                              budget: int = 50, episode_seed: int = 0) -> list:
    """Load pre-computed observations from cache."""
    cache_key = f"{round_id}__{policy_name}__budget={budget}__seed={episode_seed}"
    cache_path = cache_dir / f"{cache_key}.pkl"
    if not cache_path.exists():
        raise FileNotFoundError(f"No cached episode: {cache_path}")
    with open(cache_path, "rb") as f:
        return pickle.load(f)


def run_benchmark(
    *,
    name: str = "agent3_catboost_v2_16rounds",
    model_type: str = "catboost",
    n_estimators: int = 1500,
    max_depth: int = 8,
    learning_rate: float = 0.01,
    probability_floor: float = 0.0001,
    budget: int = 50,
    policy: str = "exploration",
    use_entropy_weights: bool = True,
    blend_temperature: float = 50.0,
    use_blend: bool = True,
    n_jobs_model: int = 32,
    episode_seed: int = 0,
) -> dict:
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"

    all_round_ids = discover_historical_eval_round_ids(paths)

    # Filter to rounds with cached episodes
    usable = []
    for rid in all_round_ids:
        cache_key = f"{rid}__{policy}__budget={budget}__seed={episode_seed}"
        if (cache_dir / f"{cache_key}.pkl").exists():
            usable.append(rid)
        else:
            print(f"  SKIP {rid[:8]}... (no cached episode for {policy})")
    all_round_ids = usable
    print(f"Evaluating on {len(all_round_ids)} rounds with LOO")
    print(f"Config: {model_type}, {n_estimators} iters, d{max_depth}, lr={learning_rate}, "
          f"policy={policy}, blend={'t='+str(blend_temperature) if use_blend else 'off'}")

    total_start = time.time()
    fold_results = []

    # Load ALL observations at start (they're small, just lists of obs objects)
    print("Loading cached observations...")
    t0 = time.time()
    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = load_cached_observations(cache_dir, rid, policy, budget, episode_seed)
    print(f"  Loaded {len(obs_cache)} episodes in {time.time()-t0:.1f}s")

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        # Build training data from cached observations
        X_parts, Y_parts, W_parts = [], [], []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            h, w = round_detail.map_height, round_detail.map_width
            observations = obs_cache[round_id]

            for seed_index, analysis in sorted(analyses.items()):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)

                feat_parts = [
                    build_map_features(grid, initial_state.settlements),
                    build_viewport_evidence_features(observations, seed_index, h, w),
                    build_cross_seed_evidence(observations, seed_index, h, w),
                    build_settlement_proximity_from_evidence(observations, seed_index, h, w),
                    build_activity_heatmap_features(observations, seed_index, h, w),
                ]

                combined = np.concatenate(feat_parts, axis=-1)
                X_parts.append(combined.reshape(-1, combined.shape[-1]))
                Y_parts.append(gt.reshape(-1, CLASS_COUNT))

                if use_entropy_weights:
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        W_train = np.concatenate(W_parts, axis=0) if use_entropy_weights else None

        # Train model
        models = {}
        if model_type == "catboost":
            from catboost import CatBoostRegressor
            for cls in range(CLASS_COUNT):
                model = CatBoostRegressor(
                    iterations=n_estimators, depth=max_depth,
                    learning_rate=learning_rate, verbose=0,
                    random_seed=42, thread_count=n_jobs_model,
                    l2_leaf_reg=3.0, subsample=0.7,
                )
                if W_train is not None:
                    model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
                else:
                    model.fit(X_train, Y_train[:, cls])
                models[cls] = model
        elif model_type == "lgb":
            import lightgbm as lgb
            for cls in range(CLASS_COUNT):
                model = lgb.LGBMRegressor(
                    objective="regression", n_estimators=n_estimators,
                    max_depth=max_depth, learning_rate=learning_rate,
                    min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                    num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
                )
                if W_train is not None:
                    model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
                else:
                    model.fit(X_train, Y_train[:, cls])
                models[cls] = model

        # Evaluate on held-out round
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_obs = obs_cache[held_out_round]
        seed_scores, seed_kls = [], []

        for seed_index, analysis in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            feat_parts = [
                build_map_features(grid, initial_state.settlements),
                build_viewport_evidence_features(eval_obs, seed_index, h, w),
                build_cross_seed_evidence(eval_obs, seed_index, h, w),
                build_settlement_proximity_from_evidence(eval_obs, seed_index, h, w),
                build_activity_heatmap_features(eval_obs, seed_index, h, w),
            ]

            combined = np.concatenate(feat_parts, axis=-1)
            X_eval = combined.reshape(-1, combined.shape[-1])

            probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                probs[:, cls] = np.clip(models[cls].predict(X_eval), 0.0, 1.0)

            probs /= np.maximum(probs.sum(axis=1, keepdims=True), 1e-10)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)

            pred = probs.reshape(h, w, CLASS_COUNT)

            if use_blend:
                pred = obs_blend(pred, eval_obs, seed_index, h, w, temperature=blend_temp)
                pred = np.maximum(pred, probability_floor)
                pred /= pred.sum(axis=-1, keepdims=True)

            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_time = time.time() - fold_start
        fold_results.append({
            "fold_idx": fold_idx,
            "held_out_round": held_out_round,
            "score": fold_score,
            "kl": fold_kl,
            "time_s": fold_time,
            "n_train_cells": X_train.shape[0],
            "n_features": X_train.shape[1],
            "seed_scores": seed_scores,
            "seed_kls": seed_kls,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: "
              f"{held_out_round[:8]}... "
              f"score={fold_score:.4f} kl={fold_kl:.6f} "
              f"time={fold_time:.0f}s  "
              f"({X_train.shape[0]} cells, {X_train.shape[1]} features)")

    fold_scores = [r["score"] for r in fold_results]
    fold_kls = [r["kl"] for r in fold_results]
    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    total_time = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.0f}s")
    print(f"{'='*60}")
    for r in fold_results:
        print(f"  {r['held_out_round'][:8]}... score={r['score']:.4f} kl={r['kl']:.6f}")
    worst = min(fold_results, key=lambda r: r['score'])
    best = max(fold_results, key=lambda r: r['score'])
    print(f"\nWorst: {worst['held_out_round'][:8]}... score={worst['score']:.4f}")
    print(f"Best:  {best['held_out_round'][:8]}... score={best['score']:.4f}")
    print(f"Std:   {float(np.std(fold_scores)):.4f}")

    # Save results
    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    result_data = {
        "name": name,
        "config": {
            "model_type": model_type, "n_estimators": n_estimators,
            "max_depth": max_depth, "learning_rate": learning_rate,
            "probability_floor": probability_floor, "budget": budget,
            "policy": policy, "use_entropy_weights": use_entropy_weights,
            "blend_temperature": blend_temperature, "use_blend": use_blend,
            "n_jobs_model": n_jobs_model,
        },
        "n_rounds": len(all_round_ids),
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "std_score": float(np.std(fold_scores)),
        "total_time_s": total_time,
        "per_fold": fold_results,
    }
    (output_dir / "results.json").write_text(json.dumps(result_data, indent=2, default=str))
    print(f"\nResults saved to {output_dir / 'results.json'}")
    return result_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cellwise CatBoost/LGB benchmark (cached episodes)")
    parser.add_argument("--name", default="agent3_catboost_v2")
    parser.add_argument("--model-type", default="catboost", choices=["catboost", "lgb"])
    parser.add_argument("--n-estimators", type=int, default=1500)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.01)
    parser.add_argument("--probability-floor", type=float, default=0.0001)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--policy", default="exploration")
    parser.add_argument("--no-entropy-weights", action="store_true")
    parser.add_argument("--blend-temperature", type=float, default=50.0)
    parser.add_argument("--no-blend", action="store_true")
    parser.add_argument("--n-jobs-model", type=int, default=32)
    args = parser.parse_args()

    run_benchmark(
        name=args.name,
        model_type=args.model_type,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        probability_floor=args.probability_floor,
        budget=args.budget,
        policy=args.policy,
        use_entropy_weights=not args.no_entropy_weights,
        blend_temperature=args.blend_temperature,
        use_blend=not args.no_blend,
        n_jobs_model=args.n_jobs_model,
    )
