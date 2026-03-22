"""Agent3 ensemble: geometric mean of LGB + CatBoost predictions.

Previous data: ensemble gave 86.34 vs solo CatBoost 86.32 (+0.02).
New data baseline: LGB=86.96, CatBoost=86.41.
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


def load_cached_observations(cache_dir: Path, round_id: str, policy_name: str,
                              budget: int = 50, episode_seed: int = 0) -> list:
    cache_key = f"{round_id}__{policy_name}__budget={budget}__seed={episode_seed}"
    cache_path = cache_dir / f"{cache_key}.pkl"
    with open(cache_path, "rb") as f:
        return pickle.load(f)


def run_ensemble_benchmark(
    *,
    name: str = "agent3_ensemble_v1",
    lgb_weight: float = 0.7,
    lgb_n_estimators: int = 800,
    lgb_max_depth: int = 8,
    lgb_learning_rate: float = 0.02,
    cb_n_estimators: int = 1500,
    cb_max_depth: int = 8,
    cb_learning_rate: float = 0.01,
    probability_floor: float = 0.0001,
    budget: int = 50,
    policy: str = "exploration",
    n_jobs_model: int = 32,
) -> dict:
    import lightgbm as lgb_mod
    from catboost import CatBoostRegressor
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"

    all_round_ids = discover_historical_eval_round_ids(paths)
    usable = [rid for rid in all_round_ids
              if (cache_dir / f"{rid}__{policy}__budget={budget}__seed=0.pkl").exists()]
    all_round_ids = usable
    print(f"Ensemble on {len(all_round_ids)} rounds, LGB weight={lgb_weight}")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = load_cached_observations(cache_dir, rid, policy, budget)

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        # Build training data
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
                ent = entropy_map(gt)
                W_parts.append(np.maximum(ent.ravel(), 0.01))

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        W_train = np.concatenate(W_parts, axis=0)

        # Train both model types
        lgb_models, cb_models = {}, {}
        for cls in range(CLASS_COUNT):
            # LGB
            m = lgb_mod.LGBMRegressor(
                objective="regression", n_estimators=lgb_n_estimators,
                max_depth=lgb_max_depth, learning_rate=lgb_learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42,
            )
            m.fit(X_train, Y_train[:, cls], sample_weight=W_train)
            lgb_models[cls] = m
            # CatBoost
            m2 = CatBoostRegressor(
                iterations=cb_n_estimators, depth=cb_max_depth,
                learning_rate=cb_learning_rate, verbose=0,
                random_seed=42, thread_count=n_jobs_model,
                l2_leaf_reg=3.0, subsample=0.7,
            )
            m2.fit(X_train, Y_train[:, cls], sample_weight=W_train)
            cb_models[cls] = m2

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_obs = obs_cache[held_out_round]
        seed_scores = []

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

            # Get both predictions
            lgb_probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            cb_probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                lgb_probs[:, cls] = np.clip(lgb_models[cls].predict(X_eval), 1e-8, 1.0)
                cb_probs[:, cls] = np.clip(cb_models[cls].predict(X_eval), 1e-8, 1.0)

            # Normalize each
            for p in [lgb_probs, cb_probs]:
                p /= np.maximum(p.sum(axis=1, keepdims=True), 1e-10)
                np.clip(p, 1e-8, 1.0, out=p)

            # Geometric mean ensemble
            log_ensemble = lgb_weight * np.log(lgb_probs) + (1 - lgb_weight) * np.log(cb_probs)
            probs = np.exp(log_ensemble)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)

            pred = probs.reshape(h, w, CLASS_COUNT)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({
            "fold_idx": fold_idx, "held_out_round": held_out_round,
            "score": fold_score, "time_s": time.time() - fold_start,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r['score'] for r in fold_results]))
    print(f"\nENSEMBLE MEAN: {mean_score:.4f} (lgb_w={lgb_weight})")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "lgb_weight": lgb_weight,
        "total_time_s": time.time() - total_start,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="ensemble_lgbcb")
    parser.add_argument("--lgb-weight", type=float, default=0.7)
    parser.add_argument("--policy", default="exploration")
    parser.add_argument("--n-jobs-model", type=int, default=32)
    args = parser.parse_args()
    run_ensemble_benchmark(name=args.name, lgb_weight=args.lgb_weight,
                           policy=args.policy, n_jobs_model=args.n_jobs_model)
