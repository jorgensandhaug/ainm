"""Agent3 CatBoost cellwise model with exploration policy + obs-blend.

Unified evaluation script for the expanded 17-round dataset.
Supports: CatBoost, LightGBM, exploration policy, obs-blend, ensemble.

This is the canonical benchmark script for the new data regime.

Best configs from previous 8-round dataset:
  - CatBoost + exploration + obs-blend: 86.34
  - CatBoost + obs-blend (coverage): 85.38
  - LGB v5_d8: 84.94
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

from agent3_cellwise_live_lgb import (
    build_map_features,
    build_viewport_evidence_features,
    _neighbor_sum_2d,
    _box_mean_fast,
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
    """Blend observed class frequencies into predictions (Agent1 technique)."""
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
        # Soft blend: pred^(1-alpha) * obs_freq^alpha where alpha = 1/temperature
        alpha = 1.0 / temperature
        blended[mask] = pred[mask] ** (1 - alpha) * np.maximum(obs_freq, 1e-8) ** alpha
        blended[mask] /= blended[mask].sum(axis=1, keepdims=True)
    return blended


def run_single_fold(
    fold_idx: int,
    held_out_round: str,
    train_rounds: list[str],
    all_config: dict,
) -> dict:
    """Run a single LOO fold. Designed for parallel execution."""
    import importlib
    # Reimport everything in subprocess
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.policy.interactive import build_interactive_policy
    from astar.envs.synthetic import SyntheticActiveOracle
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.online_episode import run_online_episode
    from astar.student.predictor.interactive import build_online_predictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    model_type = all_config.get("model_type", "catboost")
    n_estimators = all_config.get("n_estimators", 1500)
    max_depth = all_config.get("max_depth", 8)
    learning_rate = all_config.get("learning_rate", 0.01)
    probability_floor = all_config.get("probability_floor", 0.0001)
    budget = all_config.get("budget", 50)
    n_episodes = all_config.get("n_episodes", 1)
    policy_name = all_config.get("policy", "exploration")
    use_entropy_weights = all_config.get("use_entropy_weights", True)
    samples_per_round = all_config.get("samples_per_round", 2)
    blend_temp = all_config.get("blend_temperature", 50.0)
    use_blend = all_config.get("use_blend", True)
    base_model = all_config.get("base_model", "query_residual_v19")
    n_jobs_model = all_config.get("n_jobs_model", 4)

    fold_start = time.time()

    base_predictor = build_online_predictor(
        base_model, paths=paths,
        historical_round_ids=train_rounds,
        policy_name="coverage", samples_per_round=samples_per_round,
    )
    oracle = SyntheticActiveOracle(paths=paths)
    policy = build_interactive_policy(policy_name)

    X_parts, Y_parts, W_parts = [], [], []

    for round_id in train_rounds:
        round_record = read_round_record(paths, round_id)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, round_id)
        h, w = round_detail.map_height, round_detail.map_width

        for ep_seed in range(n_episodes):
            episode = run_online_episode(
                oracle, round_id=round_id, predictor=base_predictor,
                policy=policy, budget=budget, episode_seed=ep_seed * 1000,
            )
            observations = list(episode.belief.observations)

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

    eval_episode = run_online_episode(
        oracle, round_id=held_out_round, predictor=base_predictor,
        policy=policy, budget=budget, episode_seed=0,
    )
    eval_obs = list(eval_episode.belief.observations)
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

    return {
        "fold_idx": fold_idx,
        "held_out_round": held_out_round,
        "score": fold_score,
        "kl": fold_kl,
        "time_s": fold_time,
        "n_train_cells": X_train.shape[0],
        "n_features": X_train.shape[1],
        "seed_scores": seed_scores,
        "seed_kls": seed_kls,
    }


def run_benchmark(
    *,
    name: str = "agent3_catboost_v1_17rounds",
    model_type: str = "catboost",
    n_estimators: int = 1500,
    max_depth: int = 8,
    learning_rate: float = 0.01,
    probability_floor: float = 0.0001,
    budget: int = 50,
    n_episodes: int = 1,
    policy: str = "exploration",
    use_entropy_weights: bool = True,
    samples_per_round: int = 2,
    blend_temperature: float = 50.0,
    use_blend: bool = True,
    base_model: str = "geometry_prior",  # policy doesn't use predictor predictions, so this is equivalent
    parallel_folds: int = 4,
    n_jobs_model: int = 4,
) -> None:
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    all_round_ids = discover_historical_eval_round_ids(paths)

    # Filter to rounds with replay data (needed for SyntheticActiveOracle)
    usable = []
    for rid in all_round_ids:
        replay_dir = paths.root / "data" / "raw" / "replays" / rid
        if replay_dir.exists() and any(replay_dir.iterdir()):
            usable.append(rid)
        else:
            print(f"  SKIP {rid[:8]}... (no replays)")
    all_round_ids = usable
    print(f"Found {len(all_round_ids)} rounds with replays for LOO evaluation")

    config = {
        "model_type": model_type,
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "learning_rate": learning_rate,
        "probability_floor": probability_floor,
        "budget": budget,
        "n_episodes": n_episodes,
        "policy": policy,
        "use_entropy_weights": use_entropy_weights,
        "samples_per_round": samples_per_round,
        "blend_temperature": blend_temperature,
        "use_blend": use_blend,
        "base_model": base_model,
        "n_jobs_model": n_jobs_model,
    }

    print(f"Config: {json.dumps(config, indent=2)}")

    total_start = time.time()
    results = []

    if parallel_folds > 1:
        # Parallel fold execution
        from multiprocessing import get_context
        with ProcessPoolExecutor(max_workers=parallel_folds, mp_context=get_context("spawn")) as executor:
            futures = {}
            for i, held_out_round in enumerate(all_round_ids):
                train_rounds = [r for r in all_round_ids if r != held_out_round]
                future = executor.submit(run_single_fold, i, held_out_round, train_rounds, config)
                futures[future] = held_out_round

            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                    print(f"  Fold {result['fold_idx']+1}/{len(all_round_ids)}: "
                          f"{result['held_out_round'][:8]}... "
                          f"score={result['score']:.4f} kl={result['kl']:.6f} "
                          f"time={result['time_s']:.0f}s")
                except Exception as e:
                    print(f"  FOLD FAILED for {futures[future][:8]}...: {e}")
    else:
        # Sequential execution
        for i, held_out_round in enumerate(all_round_ids):
            train_rounds = [r for r in all_round_ids if r != held_out_round]
            print(f"\n=== Fold {i+1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
            result = run_single_fold(i, held_out_round, train_rounds, config)
            results.append(result)
            print(f"  score={result['score']:.4f} kl={result['kl']:.6f} time={result['time_s']:.0f}s")

    # Sort by fold_idx
    results.sort(key=lambda r: r["fold_idx"])

    fold_scores = [r["score"] for r in results]
    fold_kls = [r["kl"] for r in results]
    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    total_time = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.0f}s")
    print(f"{'='*60}")
    for r in results:
        print(f"  {r['held_out_round'][:8]}... score={r['score']:.4f} kl={r['kl']:.6f}")
    print(f"\nWorst round: {min(results, key=lambda r: r['score'])['held_out_round'][:8]}... "
          f"score={min(r['score'] for r in results):.4f}")
    print(f"Best round: {max(results, key=lambda r: r['score'])['held_out_round'][:8]}... "
          f"score={max(r['score'] for r in results):.4f}")
    print(f"Std: {float(np.std(fold_scores)):.4f}")

    # Save results
    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "config": config,
        "n_rounds": len(all_round_ids),
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "per_fold": results,
    }, indent=2, default=str))
    print(f"\nResults saved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cellwise CatBoost/LGB benchmark")
    parser.add_argument("--name", default="agent3_catboost_17rounds")
    parser.add_argument("--model-type", default="catboost", choices=["catboost", "lgb"])
    parser.add_argument("--n-estimators", type=int, default=1500)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.01)
    parser.add_argument("--probability-floor", type=float, default=0.0001)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--n-episodes", type=int, default=1)
    parser.add_argument("--policy", default="exploration")
    parser.add_argument("--no-entropy-weights", action="store_true")
    parser.add_argument("--samples-per-round", type=int, default=2)
    parser.add_argument("--blend-temperature", type=float, default=50.0)
    parser.add_argument("--no-blend", action="store_true")
    parser.add_argument("--base-model", default="query_residual_v19")
    parser.add_argument("--parallel-folds", type=int, default=4)
    parser.add_argument("--n-jobs-model", type=int, default=4)
    args = parser.parse_args()

    run_benchmark(
        name=args.name,
        model_type=args.model_type,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        probability_floor=args.probability_floor,
        budget=args.budget,
        n_episodes=args.n_episodes,
        policy=args.policy,
        use_entropy_weights=not args.no_entropy_weights,
        samples_per_round=args.samples_per_round,
        blend_temperature=args.blend_temperature,
        use_blend=not args.no_blend,
        base_model=args.base_model,
        parallel_folds=args.parallel_folds,
        n_jobs_model=args.n_jobs_model,
    )
