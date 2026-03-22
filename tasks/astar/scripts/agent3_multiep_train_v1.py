"""Agent3 multi-episode training + variance features.

Instead of just using variance as features, ALSO train on cells from multiple episodes.
Each training round generates multiple sets of observations, and each set produces
different viewport evidence features → different training examples for the same ground truth.

This gives the model more diverse training data and better generalization.
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


def run_multiep_train_benchmark(
    *,
    name: str = "multiep_train_v1",
    n_estimators: int = 800,
    max_depth: int = 10,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    policy: str = "exploration",
    n_jobs_model: int = 32,
    episode_seeds: list[int] = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],
    train_episode_count: int = 3,  # How many episodes to use for training data augmentation
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
    print(f"Multi-ep train on {len(all_round_ids)} rounds, {len(episode_seeds)} var eps, {train_episode_count} train eps")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = {}
        for es in episode_seeds:
            obs_cache[rid][es] = load_cached_observations(cache_dir, rid, policy, 50, es)

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        X_parts, Y_parts, W_parts = [], [], []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            h, w = round_detail.map_height, round_detail.map_width

            all_ep_obs = [obs_cache[round_id][es] for es in episode_seeds]

            # For each training episode, build features
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

        # Evaluate with primary episode
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_obs = obs_cache[held_out_round][episode_seeds[0]]
        eval_all = [obs_cache[held_out_round][es] for es in episode_seeds]
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
                build_multi_episode_variance_features(eval_all, seed_index, h, w),
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

            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({
            "fold_idx": fold_idx, "held_out_round": held_out_round,
            "score": fold_score, "time_s": time.time() - fold_start,
        })
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r['score'] for r in fold_results]))
    print(f"\nMULTI-EP TRAIN MEAN: {mean_score:.4f} ({train_episode_count} train eps)")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "train_episode_count": train_episode_count,
        "total_time_s": time.time() - total_start,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="multiep_train_3ep")
    parser.add_argument("--train-eps", type=int, default=3)
    parser.add_argument("--n-jobs-model", type=int, default=64)
    args = parser.parse_args()
    run_multiep_train_benchmark(name=args.name, train_episode_count=args.train_eps,
                                 n_jobs_model=args.n_jobs_model)
