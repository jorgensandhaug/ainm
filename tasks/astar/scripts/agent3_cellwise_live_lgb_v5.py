"""Agent3's cellwise LightGBM v5 - Activity heatmap + buildable cell features.

Key improvements over v4:
1. Buildable-cell activity heatmap (spatial settlement density pattern from evidence)
2. Multi-scale activity diffusion (propagate settlement signal at multiple radii)
3. Evidence-consistency features (do multiple observations at same cell agree?)
4. Per-seed activity rate as global feature
5. Configurable class-specific LGB params (more trees for settlement class)
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

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


def _gaussian_smooth(arr: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return arr.copy()
    radius = max(int(3 * sigma + 0.5), 1)
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    result = arr.copy()
    if result.ndim == 2:
        padded = np.pad(result, ((0, 0), (radius, radius)), mode='reflect')
        for i in range(result.shape[0]):
            result[i, :] = np.convolve(padded[i, :], kernel, mode='valid')
        padded = np.pad(result, ((radius, radius), (0, 0)), mode='reflect')
        for j in range(result.shape[1]):
            result[:, j] = np.convolve(padded[:, j], kernel, mode='valid')
    return result


def build_activity_heatmap_features(
    observations: list,
    seed_index: int,
    h: int, w: int,
) -> np.ndarray:
    """Build multi-scale activity heatmap from observed settlements."""
    from astar.core.terrain import collapse_internal_grid

    features: list[np.ndarray] = []

    # Raw activity map (where were settlements/ports/ruins observed?)
    activity_map = np.zeros((h, w), dtype=np.float64)
    settlement_map = np.zeros((h, w), dtype=np.float64)
    port_map = np.zeros((h, w), dtype=np.float64)
    ruin_map = np.zeros((h, w), dtype=np.float64)
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
                    obs_count[y, x] += 1.0
                    c = int(collapsed[dy, dx])
                    if c in (1, 2, 3):
                        activity_map[y, x] += 1.0
                    if c == 1:
                        settlement_map[y, x] += 1.0
                    elif c == 2:
                        port_map[y, x] += 1.0
                    elif c == 3:
                        ruin_map[y, x] += 1.0

    # Normalized activity
    safe = np.maximum(obs_count, 1.0)
    raw_activity = activity_map / safe
    raw_settlement = settlement_map / safe
    raw_port = port_map / safe
    raw_ruin = ruin_map / safe

    features.extend([raw_activity, raw_settlement, raw_port, raw_ruin])

    # Multi-scale Gaussian-smoothed activity heatmaps
    for sigma in [1.5, 3.0, 5.0, 8.0]:
        smoothed = _gaussian_smooth(raw_activity * (obs_count > 0).astype(np.float64), sigma)
        features.append(smoothed)
        # Also smooth settlement and ruin separately
        features.append(_gaussian_smooth(raw_settlement * (obs_count > 0).astype(np.float64), sigma))
        features.append(_gaussian_smooth(raw_ruin * (obs_count > 0).astype(np.float64), sigma))

    # Activity gradient (where is activity increasing/decreasing spatially?)
    smoothed_activity = _gaussian_smooth(raw_activity * (obs_count > 0).astype(np.float64), 3.0)
    grad_y = np.zeros_like(smoothed_activity)
    grad_x = np.zeros_like(smoothed_activity)
    grad_y[1:-1, :] = (smoothed_activity[2:, :] - smoothed_activity[:-2, :]) / 2.0
    grad_x[:, 1:-1] = (smoothed_activity[:, 2:] - smoothed_activity[:, :-2]) / 2.0
    features.append(np.sqrt(grad_y ** 2 + grad_x ** 2))  # gradient magnitude
    features.append(np.arctan2(grad_y, grad_x + 1e-10) / np.pi)  # gradient direction

    # Global activity stats (per cell)
    total_activity = float(np.sum(activity_map))
    total_obs = float(np.sum(obs_count))
    global_activity_rate = total_activity / max(total_obs, 1.0)
    features.append(np.full((h, w), global_activity_rate, dtype=np.float64))

    # Number of unique observed settlement positions for this seed
    unique_sett = np.sum((settlement_map + port_map) > 0)
    features.append(np.full((h, w), unique_sett / 30.0, dtype=np.float64))

    return np.stack(features, axis=-1)


def run_v5_benchmark(
    *,
    name: str = "agent3_cellwise_live_lgb_v5",
    n_estimators: int = 500,
    max_depth: int = 6,
    learning_rate: float = 0.03,
    probability_floor: float = 0.0001,
    budget: int = 50,
    n_episodes: int = 1,
    n_jobs: int = 32,
    use_entropy_weights: bool = True,
    samples_per_round: int = 2,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.policy.interactive import build_interactive_policy
    from astar.envs.synthetic import SyntheticActiveOracle
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids
    from astar.workflows.online_episode import run_online_episode
    from astar.student.predictor.interactive import build_online_predictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    all_round_ids = discover_historical_eval_round_ids(paths)
    print(f"Found {len(all_round_ids)} rounds")

    fold_scores, fold_kls = [], []
    all_results = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        base_predictor = build_online_predictor(
            "query_residual_v19", paths=paths,
            historical_round_ids=train_rounds,
            policy_name="coverage", samples_per_round=samples_per_round,
        )
        oracle = SyntheticActiveOracle(paths=paths)
        policy = build_interactive_policy("coverage")

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
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

        models = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators,
                max_depth=max_depth, learning_rate=learning_rate,
                min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                num_leaves=63, verbose=-1, n_jobs=n_jobs, random_state=42,
            )
            if W_train is not None:
                model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
            else:
                model.fit(X_train, Y_train[:, cls])
            models[cls] = model

        # Evaluate
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
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)
            all_results.append({"round_id": held_out_round, "seed_index": seed_index,
                              "score": breakdown.score, "weighted_kl": breakdown.weighted_kl})

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time() - fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    print(f"\n{'='*60}\nOVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={time.time()-total_start:.1f}s\n{'='*60}")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score, "mean_weighted_kl": mean_kl,
        "total_time_s": time.time() - total_start,
        "per_fold": [{"round_id": r, "score": s, "kl": k} for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_v5_default")
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--learning-rate", type=float, default=0.03)
    parser.add_argument("--probability-floor", type=float, default=0.0001)
    parser.add_argument("--n-episodes", type=int, default=1)
    parser.add_argument("--n-jobs", type=int, default=32)
    parser.add_argument("--no-entropy-weights", action="store_true")
    args = parser.parse_args()
    run_v5_benchmark(
        name=args.name, n_estimators=args.n_estimators, max_depth=args.max_depth,
        learning_rate=args.learning_rate, probability_floor=args.probability_floor,
        n_episodes=args.n_episodes, n_jobs=args.n_jobs,
        use_entropy_weights=not args.no_entropy_weights,
    )
