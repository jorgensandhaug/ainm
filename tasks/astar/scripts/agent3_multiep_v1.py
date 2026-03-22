"""Agent3 multi-episode LGB: uses variance across multiple episodes as features.

Each episode uses a different RNG seed, so the replay oracle returns different
stochastic replays. The variance in observed class frequencies across episodes
captures round-specific uncertainty that a single episode can't.

Hypothesis: multi-episode variance features will help on moderate-entropy rounds
(like 795bfb1f) where single-episode observations aren't distinctive enough.
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


def build_multi_episode_variance_features(
    all_episode_obs: list[list],
    seed_index: int,
    h: int, w: int,
) -> np.ndarray:
    """Build variance features from multiple episodes."""
    from astar.core.terrain import collapse_internal_grid

    n_eps = len(all_episode_obs)
    if n_eps <= 1:
        # Return zeros if only 1 episode
        return np.zeros((h, w, 12), dtype=np.float64)

    # For each episode, compute class frequency maps
    class_freq_maps = []  # shape: (n_eps, h, w, 6)
    build_rate_maps = []  # shape: (n_eps, h, w)

    for observations in all_episode_obs:
        freq = np.zeros((h, w, 6), dtype=np.float64)
        obs_count = np.zeros((h, w), dtype=np.float64)

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
                            freq[y, x, c] += 1.0
                            obs_count[y, x] += 1.0

        safe = np.maximum(obs_count, 1.0)[..., None]
        class_freq_maps.append(freq / safe)

        # Build rate per cell
        build_map = np.zeros((h, w), dtype=np.float64)
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
                        if c in (1, 2, 3):
                            build_map[y, x] += 1.0
        safe_count = np.maximum(obs_count, 1.0)
        build_rate_maps.append(build_map / safe_count)

    freq_stack = np.stack(class_freq_maps, axis=0)  # (n_eps, h, w, 6)
    build_stack = np.stack(build_rate_maps, axis=0)  # (n_eps, h, w)

    features = []

    # 1. Mean class frequency across episodes (6 features)
    mean_freq = freq_stack.mean(axis=0)  # (h, w, 6)
    features.append(mean_freq)

    # 2. Std of class frequency across episodes (key variance features, 6 features but compress to 3)
    std_freq = freq_stack.std(axis=0)  # (h, w, 6)
    # Settlement variance, empty variance, active (sett+port+ruin) variance
    features.append(std_freq[:, :, 1:2])  # settlement std
    features.append(std_freq[:, :, 0:1])  # empty std
    features.append(np.sum(std_freq[:, :, 1:4], axis=-1, keepdims=True))  # active std

    # 3. Build rate variance (1 feature)
    build_std = build_stack.std(axis=0)
    features.append(build_std[:, :, None])

    # 4. Max-min range of settlement frequency (1 feature)
    sett_range = freq_stack[:, :, :, 1].max(axis=0) - freq_stack[:, :, :, 1].min(axis=0)
    features.append(sett_range[:, :, None])

    return np.concatenate(features, axis=-1)


def load_cached_observations(cache_dir: Path, round_id: str, policy_name: str,
                              budget: int = 50, episode_seed: int = 0) -> list:
    cache_key = f"{round_id}__{policy_name}__budget={budget}__seed={episode_seed}"
    cache_path = cache_dir / f"{cache_key}.pkl"
    with open(cache_path, "rb") as f:
        return pickle.load(f)


def run_multiep_benchmark(
    *,
    name: str = "agent3_multiep_v1",
    n_estimators: int = 800,
    max_depth: int = 10,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    budget: int = 50,
    policy: str = "exploration",
    n_jobs_model: int = 32,
    episode_seeds: list[int] = [0, 1000, 2000, 3000, 4000],
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
    # Filter to rounds with all episode seeds cached
    usable = []
    for rid in all_round_ids:
        all_cached = all(
            (cache_dir / f"{rid}__{policy}__budget={budget}__seed={es}.pkl").exists()
            for es in episode_seeds
        )
        if all_cached:
            usable.append(rid)
    all_round_ids = usable
    print(f"Multi-episode eval on {len(all_round_ids)} rounds, {len(episode_seeds)} episodes each")

    # Load all episodes
    obs_cache = {}  # {round_id: {seed: observations}}
    for rid in all_round_ids:
        obs_cache[rid] = {}
        for es in episode_seeds:
            obs_cache[rid][es] = load_cached_observations(cache_dir, rid, policy, budget, es)

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

            # Use first episode as primary
            primary_obs = obs_cache[round_id][episode_seeds[0]]
            # Collect all episodes for variance features
            all_ep_obs = [obs_cache[round_id][es] for es in episode_seeds]

            for seed_index, analysis in sorted(analyses.items()):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)

                feat_parts = [
                    build_map_features(grid, initial_state.settlements),
                    build_viewport_evidence_features(primary_obs, seed_index, h, w),
                    build_cross_seed_evidence(primary_obs, seed_index, h, w),
                    build_settlement_proximity_from_evidence(primary_obs, seed_index, h, w),
                    build_activity_heatmap_features(primary_obs, seed_index, h, w),
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

        # Train LGB
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

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_primary_obs = obs_cache[held_out_round][episode_seeds[0]]
        eval_all_obs = [obs_cache[held_out_round][es] for es in episode_seeds]
        seed_scores = []

        for seed_index, analysis in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            feat_parts = [
                build_map_features(grid, initial_state.settlements),
                build_viewport_evidence_features(eval_primary_obs, seed_index, h, w),
                build_cross_seed_evidence(eval_primary_obs, seed_index, h, w),
                build_settlement_proximity_from_evidence(eval_primary_obs, seed_index, h, w),
                build_activity_heatmap_features(eval_primary_obs, seed_index, h, w),
                build_multi_episode_variance_features(eval_all_obs, seed_index, h, w),
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
    total_time = time.time() - total_start
    print(f"\nMULTI-EP MEAN: {mean_score:.4f} (time={total_time:.0f}s)")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score,
        "n_episode_seeds": len(episode_seeds),
        "n_features": int(X_train.shape[1]),
        "total_time_s": total_time,
        "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="multiep_5ep_d10")
    parser.add_argument("--n-jobs-model", type=int, default=64)
    args = parser.parse_args()
    run_multiep_benchmark(name=args.name, n_jobs_model=args.n_jobs_model)
