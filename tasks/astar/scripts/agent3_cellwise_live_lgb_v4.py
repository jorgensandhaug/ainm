"""Agent3's cellwise LightGBM v4 - entropy-weighted + cross-seed + settlement features.

Key improvements over v3:
1. Entropy-weighted training (sample_weight = ground truth entropy)
2. Cross-seed evidence aggregation (what other seeds observed)
3. Settlement proximity from evidence (distance to observed settlements)
4. Evidence-derived activity rate features
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
)


def build_cross_seed_evidence(
    observations: list,
    current_seed: int,
    h: int, w: int,
    num_classes: int = 6,
) -> np.ndarray:
    """Aggregate evidence from OTHER seeds."""
    from astar.core.terrain import collapse_internal_grid

    features: list[np.ndarray] = []
    other_class_sums = np.zeros((h, w, num_classes), dtype=np.float64)
    other_obs_count = np.zeros((h, w), dtype=np.float64)
    other_sett_pop = np.zeros((h, w), dtype=np.float64)
    other_sett_count = np.zeros((h, w), dtype=np.float64)

    for obs in observations:
        if obs.seed_index == current_seed:
            continue
        viewport = obs.viewport
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)
        for dy in range(viewport.h):
            for dx in range(viewport.w):
                y, x = viewport.y + dy, viewport.x + dx
                if 0 <= y < h and 0 <= x < w:
                    other_obs_count[y, x] += 1.0
                    c = int(collapsed[dy, dx])
                    if 0 <= c < num_classes:
                        other_class_sums[y, x, c] += 1.0
        for s in obs.settlements:
            if 0 <= s.y < h and 0 <= s.x < w:
                other_sett_count[s.y, s.x] += 1.0
                other_sett_pop[s.y, s.x] += s.population

    # Cross-seed observed mask
    has_other = (other_obs_count > 0).astype(np.float64)
    features.append(has_other)

    # Cross-seed class frequencies
    safe = np.maximum(other_obs_count, 1.0)
    for c in range(num_classes):
        features.append(np.where(other_obs_count > 0, other_class_sums[:, :, c] / safe, 0.0))

    # Cross-seed build rate
    build_sum = other_class_sums[:, :, 1] + other_class_sums[:, :, 2] + other_class_sums[:, :, 3]
    features.append(np.where(other_obs_count > 0, build_sum / safe, 0.0))

    # Cross-seed settlement info
    safe_sett = np.maximum(other_sett_count, 1.0)
    features.append(np.where(other_sett_count > 0, other_sett_count, 0.0))
    features.append(np.where(other_sett_count > 0, other_sett_pop / safe_sett / 5.0, 0.0))

    # Neighborhood propagation of cross-seed evidence
    for radius in [2, 4]:
        nbr = _neighbor_sum_2d(has_other, radius)
        features.append(nbr)
        build_map = np.where(other_obs_count > 0, build_sum / safe, 0.0)
        features.append(_neighbor_sum_2d(build_map, radius))

    return np.stack(features, axis=-1)


def build_settlement_proximity_from_evidence(
    observations: list,
    seed_index: int,
    h: int, w: int,
) -> np.ndarray:
    """Distance-based features from observed settlement locations."""
    features: list[np.ndarray] = []

    # Collect settlement positions from this seed's observations
    sett_positions = []
    port_positions = []
    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        for s in obs.settlements:
            if s.alive:
                sett_positions.append((s.y, s.x))
                if s.has_port:
                    port_positions.append((s.y, s.x))

    yy, xx = np.mgrid[0:h, 0:w]

    # Distance to nearest observed settlement
    if sett_positions:
        min_dist = np.full((h, w), 100.0, dtype=np.float64)
        for sy, sx in sett_positions:
            dist = np.sqrt((yy - sy) ** 2.0 + (xx - sx) ** 2.0)
            min_dist = np.minimum(min_dist, dist)
        features.append(min_dist / max(h, w))
        features.append(np.exp(-min_dist / 5.0))  # Gaussian proximity
    else:
        features.append(np.ones((h, w), dtype=np.float64))
        features.append(np.zeros((h, w), dtype=np.float64))

    # Distance to nearest observed port
    if port_positions:
        min_dist = np.full((h, w), 100.0, dtype=np.float64)
        for sy, sx in port_positions:
            dist = np.sqrt((yy - sy) ** 2.0 + (xx - sx) ** 2.0)
            min_dist = np.minimum(min_dist, dist)
        features.append(min_dist / max(h, w))
    else:
        features.append(np.ones((h, w), dtype=np.float64))

    # Settlement density from observations
    sett_density = np.zeros((h, w), dtype=np.float64)
    for sy, sx in sett_positions:
        if 0 <= sy < h and 0 <= sx < w:
            sett_density[sy, sx] = 1.0
    features.append(_neighbor_sum_2d(sett_density, 3))
    features.append(_neighbor_sum_2d(sett_density, 6))

    # Number of observed settlements and ports (global)
    features.append(np.full((h, w), len(sett_positions) / 30.0, dtype=np.float64))
    features.append(np.full((h, w), len(port_positions) / 10.0, dtype=np.float64))

    return np.stack(features, axis=-1)


def run_v4_benchmark(
    *,
    name: str = "agent3_cellwise_live_lgb_v4",
    n_estimators: int = 500,
    max_depth: int = 6,
    learning_rate: float = 0.03,
    probability_floor: float = 0.0005,
    budget: int = 50,
    n_episodes: int = 2,
    n_jobs: int = 32,
    use_entropy_weights: bool = True,
    use_cross_seed: bool = True,
    use_settlement_proximity: bool = True,
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
                    ]
                    if use_cross_seed:
                        feat_parts.append(build_cross_seed_evidence(observations, seed_index, h, w))
                    if use_settlement_proximity:
                        feat_parts.append(build_settlement_proximity_from_evidence(observations, seed_index, h, w))

                    combined = np.concatenate(feat_parts, axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))

                    if use_entropy_weights:
                        ent = entropy_map(gt)
                        W_parts.append(np.maximum(ent.ravel(), 0.01))
                    else:
                        W_parts.append(np.ones(h * w, dtype=np.float64))

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
            ]
            if use_cross_seed:
                feat_parts.append(build_cross_seed_evidence(eval_obs, seed_index, h, w))
            if use_settlement_proximity:
                feat_parts.append(build_settlement_proximity_from_evidence(eval_obs, seed_index, h, w))

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
        "config": {"n_estimators": n_estimators, "max_depth": max_depth,
                   "n_episodes": n_episodes, "use_entropy_weights": use_entropy_weights,
                   "use_cross_seed": use_cross_seed, "use_settlement_proximity": use_settlement_proximity,
                   "probability_floor": probability_floor},
        "per_fold": [{"round_id": r, "score": s, "kl": k} for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_v4_default")
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--learning-rate", type=float, default=0.03)
    parser.add_argument("--probability-floor", type=float, default=0.0005)
    parser.add_argument("--n-episodes", type=int, default=2)
    parser.add_argument("--n-jobs", type=int, default=32)
    parser.add_argument("--no-entropy-weights", action="store_true")
    parser.add_argument("--no-cross-seed", action="store_true")
    parser.add_argument("--no-settlement-proximity", action="store_true")
    args = parser.parse_args()
    run_v4_benchmark(
        name=args.name, n_estimators=args.n_estimators, max_depth=args.max_depth,
        learning_rate=args.learning_rate, probability_floor=args.probability_floor,
        n_episodes=args.n_episodes, n_jobs=args.n_jobs,
        use_entropy_weights=not args.no_entropy_weights,
        use_cross_seed=not args.no_cross_seed,
        use_settlement_proximity=not args.no_settlement_proximity,
    )
