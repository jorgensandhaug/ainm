"""Agent3's cellwise LightGBM for LIVE play.

This model uses VIEWPORT QUERY OBSERVATIONS as evidence (not replays).
Training simulates the exact same evidence available during live rounds:
- 50 viewport queries via coverage policy
- Partial map coverage (~30-50%)
- Settlement stats from observed viewports

This is the ONLY version that can be used for actual live predictions.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np


def _neighbor_sum_2d(arr: np.ndarray, radius: int) -> np.ndarray:
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            sy = slice(max(0, -dy), min(h, h - dy))
            sx = slice(max(0, -dx), min(w, w - dx))
            ty = slice(max(0, dy), min(h, h + dy))
            tx = slice(max(0, dx), min(w, w + dx))
            out[ty, tx] += arr[sy, sx]
    return out


def _box_mean_fast(arr: np.ndarray, radius: int) -> np.ndarray:
    h, w = arr.shape
    padded = np.pad(arr.astype(np.float64), radius, mode='constant', constant_values=0)
    integral = np.cumsum(np.cumsum(padded, axis=0), axis=1)
    y1, x1 = radius * 2, radius * 2
    result = np.zeros((h, w), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            py, px = y + y1, x + x1
            result[y, x] = (
                integral[py, px] - integral[y, px] - integral[py, x] + integral[y, x]
            )
    ones = np.ones((h, w), dtype=np.float64)
    padded_ones = np.pad(ones, radius, mode='constant', constant_values=0)
    count_integral = np.cumsum(np.cumsum(padded_ones, axis=0), axis=1)
    counts = np.zeros((h, w), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            py, px = y + y1, x + x1
            counts[y, x] = (
                count_integral[py, px] - count_integral[y, px] - count_integral[py, x] + count_integral[y, x]
            )
    return result / np.maximum(counts, 1.0)


def build_map_features(grid: np.ndarray, settlements: list) -> np.ndarray:
    """Build per-cell map features (H, W, F)."""
    from astar.core.terrain import CLASS_COUNT, buildable_mask, collapse_internal_grid, land_mask, mountain_mask, sea_mask
    from astar.features.coasts import coast_mask

    h, w = grid.shape
    collapsed = collapse_internal_grid(grid)
    features: list[np.ndarray] = []

    for cls in range(CLASS_COUNT):
        features.append((collapsed == cls).astype(np.float64))

    is_land = land_mask(grid).astype(np.float64)
    is_sea = sea_mask(grid).astype(np.float64)
    is_mountain = mountain_mask(grid).astype(np.float64)
    is_buildable = buildable_mask(grid).astype(np.float64)
    is_coast = coast_mask(grid).astype(np.float64)
    is_forest = (grid == 4).astype(np.float64)
    features.extend([is_land, is_sea, is_mountain, is_buildable, is_coast, is_forest])

    sett_map = np.zeros((h, w), dtype=np.float64)
    port_map = np.zeros((h, w), dtype=np.float64)
    for s in settlements:
        y = s.y if hasattr(s, 'y') else s['y']
        x = s.x if hasattr(s, 'x') else s['x']
        sett_map[y, x] = 1.0
        hp = s.has_port if hasattr(s, 'has_port') else s.get('has_port', False)
        if hp:
            port_map[y, x] = 1.0
    features.extend([sett_map, port_map])

    for radius in [1, 2, 3, 5]:
        for arr in [is_forest, is_mountain, sett_map, port_map, is_coast, is_buildable, is_land]:
            features.append(_neighbor_sum_2d(arr, radius))

    # Simple Euclidean distance to nearest settlement
    sett_dist = np.ones((h, w), dtype=np.float64)
    for s in settlements:
        y = s.y if hasattr(s, 'y') else s['y']
        x = s.x if hasattr(s, 'x') else s['x']
        yy, xx = np.mgrid[0:h, 0:w]
        dist = np.sqrt((yy - y) ** 2 + (xx - x) ** 2) / max(h, w)
        sett_dist = np.minimum(sett_dist, dist)
    features.append(sett_dist)

    n_sett = len(settlements)
    n_port = sum(1 for s in settlements if (s.has_port if hasattr(s, 'has_port') else s.get('has_port', False)))
    for val in [n_sett / 60.0, n_port / 10.0, float(is_land.mean()), float(is_forest.mean()),
                float(is_coast.mean()), float(is_mountain.mean())]:
        features.append(np.full((h, w), val, dtype=np.float64))

    yy, xx = np.mgrid[0:h, 0:w]
    features.append(yy.astype(np.float64) / max(h - 1, 1))
    features.append(xx.astype(np.float64) / max(w - 1, 1))
    features.append(np.sqrt(((yy - h / 2.0) ** 2 + (xx - w / 2.0) ** 2)) / (h / 2.0))

    for radius in [1, 2]:
        local_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(CLASS_COUNT):
            cls_frac = _box_mean_fast((collapsed == cls).astype(np.float64), radius)
            local_entropy -= np.where(cls_frac > 0, cls_frac * np.log(cls_frac + 1e-10), 0)
        features.append(local_entropy)

    for radius in [4, 7]:
        features.append(_box_mean_fast(sett_map, radius))

    return np.stack(features, axis=-1)


def build_viewport_evidence_features(
    observations: list,
    seed_index: int,
    h: int, w: int,
    num_classes: int = 6,
) -> np.ndarray:
    """Build evidence features from viewport query observations for one seed.

    This uses the EXACT same information available during live play.
    """
    from astar.core.terrain import collapse_internal_grid

    features: list[np.ndarray] = []

    # Observed cells mask and class counts
    obs_count = np.zeros((h, w), dtype=np.float64)
    class_sum = np.zeros((h, w, num_classes), dtype=np.float64)

    # Settlement stats from viewports
    sett_pop = np.zeros((h, w), dtype=np.float64)
    sett_food = np.zeros((h, w), dtype=np.float64)
    sett_wealth = np.zeros((h, w), dtype=np.float64)
    sett_defense = np.zeros((h, w), dtype=np.float64)
    sett_alive = np.zeros((h, w), dtype=np.float64)
    sett_port = np.zeros((h, w), dtype=np.float64)
    sett_count = np.zeros((h, w), dtype=np.float64)

    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        viewport = obs.viewport
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)

        for dy in range(viewport.h):
            for dx in range(viewport.w):
                y = viewport.y + dy
                x = viewport.x + dx
                if 0 <= y < h and 0 <= x < w:
                    obs_count[y, x] += 1.0
                    c = int(collapsed[dy, dx])
                    if 0 <= c < num_classes:
                        class_sum[y, x, c] += 1.0

        for s in obs.settlements:
            sy, sx = s.y, s.x
            if 0 <= sy < h and 0 <= sx < w:
                sett_count[sy, sx] += 1.0
                sett_pop[sy, sx] += s.population
                sett_food[sy, sx] += s.food
                sett_wealth[sy, sx] += s.wealth
                sett_defense[sy, sx] += s.defense
                sett_alive[sy, sx] += float(s.alive)
                sett_port[sy, sx] += float(s.has_port)

    # Observation mask
    observed = (obs_count > 0).astype(np.float64)
    features.append(observed)

    # Class frequencies at observed cells
    safe_count = np.maximum(obs_count, 1.0)
    for c in range(num_classes):
        features.append(np.where(obs_count > 0, class_sum[:, :, c] / safe_count, 0.0))

    # Observation entropy
    obs_freq = class_sum / safe_count[:, :, np.newaxis]
    obs_entropy = -np.sum(
        np.where(obs_freq > 0, obs_freq * np.log(obs_freq + 1e-10), 0.0), axis=-1
    )
    features.append(np.where(obs_count > 0, obs_entropy, 0.0))

    # Neighborhood evidence at multiple scales
    for radius in [1, 2, 3]:
        nbr_obs = _neighbor_sum_2d(observed, radius)
        features.append(nbr_obs)
        for c in range(num_classes):
            cls_map = np.where(obs_count > 0, class_sum[:, :, c] / safe_count, 0.0)
            nbr_sum = _neighbor_sum_2d(cls_map, radius)
            features.append(np.where(nbr_obs > 0, nbr_sum / nbr_obs, 0.0))

    # Settlement features
    safe_sett = np.maximum(sett_count, 1.0)
    features.append(np.where(obs_count > 0, sett_count, 0.0))
    features.append(np.where(sett_count > 0, sett_pop / safe_sett / 5.0, 0.0))
    features.append(np.where(sett_count > 0, sett_food / safe_sett / 2.0, 0.0))
    features.append(np.where(sett_count > 0, sett_wealth / safe_sett / 2.0, 0.0))
    features.append(np.where(sett_count > 0, sett_defense / safe_sett, 0.0))
    features.append(np.where(sett_count > 0, sett_alive / safe_sett, 0.0))
    features.append(np.where(sett_count > 0, sett_port / safe_sett, 0.0))

    for radius in [2, 4]:
        features.append(_neighbor_sum_2d(np.where(sett_count > 0, sett_pop / safe_sett, 0.0), radius))
        features.append(_neighbor_sum_2d(np.where(sett_count > 0, sett_alive / safe_sett, 0.0), radius))

    # Global observation summary (replicated per cell)
    total_queries = sum(1 for obs in observations if obs.seed_index == seed_index)
    total_obs_cells = float(np.sum(obs_count > 0))
    total_built = float(np.sum(class_sum[:, :, 1] + class_sum[:, :, 2] + class_sum[:, :, 3]))
    total_obs = float(np.sum(obs_count))
    build_rate = total_built / max(total_obs, 1.0)
    coverage_frac = total_obs_cells / max(h * w, 1.0)

    features.append(np.full((h, w), total_queries / 50.0, dtype=np.float64))
    features.append(np.full((h, w), build_rate, dtype=np.float64))
    features.append(np.full((h, w), coverage_frac, dtype=np.float64))

    return np.stack(features, axis=-1)


def run_live_lgb_benchmark(
    *,
    name: str = "agent3_cellwise_live_lgb",
    n_estimators: int = 800,
    max_depth: int = 8,
    learning_rate: float = 0.02,
    probability_floor: float = 0.003,
    budget: int = 50,
    policy_name: str = "coverage",
    episode_seed: int = 0,
    samples_per_round: int = 2,
    n_jobs: int = 16,
    barren_calibration: bool = False,
    barren_threshold: float = 0.03,
    barren_settlement_scale: float = 0.3,
    barren_ruin_scale: float = 0.2,
    barren_forest_boost: float = 1.15,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT
    from astar.policy.interactive import build_interactive_policy
    from astar.envs.conversion import round_context_to_live_inference_context
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids
    from astar.workflows.online_episode import run_online_episode
    from astar.student.predictor.interactive import build_online_predictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)

    all_round_ids = discover_historical_eval_round_ids(paths)
    print(f"Found {len(all_round_ids)} rounds")

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    all_results: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Step 1: Generate training data
        # For each training round, run the online episode to get viewport observations
        # Then use those observations as evidence features + ground truth as target
        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)

            # Build a simple base predictor for running the online episode
            base_predictor = build_online_predictor(
                "query_residual_v19",
                paths=paths,
                historical_round_ids=train_rounds,
                policy_name=policy_name,
                samples_per_round=samples_per_round,
            )

            from astar.envs.synthetic import SyntheticActiveOracle
            oracle = SyntheticActiveOracle(paths=paths)

            policy = build_interactive_policy(policy_name)

            # Run online episode to get viewport observations
            episode_run = run_online_episode(
                oracle,
                round_id=round_id,
                predictor=base_predictor,
                policy=policy,
                budget=budget,
                episode_seed=episode_seed,
            )

            observations = list(episode_run.belief.observations)

            for seed_index, analysis_record in sorted(analyses.items()):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape

                map_feat = build_map_features(grid, initial_state.settlements)
                ev_feat = build_viewport_evidence_features(observations, seed_index, h, w)
                combined = np.concatenate([map_feat, ev_feat], axis=-1)

                X_parts.append(combined.reshape(-1, combined.shape[-1]))
                Y_parts.append(gt.reshape(-1, CLASS_COUNT))

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

        # Step 2: Train LightGBM per class
        models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                min_child_samples=50,
                subsample=0.7,
                colsample_bytree=0.7,
                num_leaves=63,
                verbose=-1,
                n_jobs=n_jobs,
                random_state=42,
            )
            model.fit(X_train, Y_train[:, cls])
            models[cls] = model

        # Step 3: Evaluate on held-out round
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        # Run online episode on held-out round
        eval_predictor = build_online_predictor(
            "query_residual_v19",
            paths=paths,
            historical_round_ids=train_rounds,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        from astar.envs.synthetic import SyntheticActiveOracle
        eval_oracle = SyntheticActiveOracle(paths=paths)

        policy = build_interactive_policy(policy_name)
        eval_episode = run_online_episode(
            eval_oracle,
            round_id=held_out_round,
            predictor=eval_predictor,
            policy=policy,
            budget=budget,
            episode_seed=episode_seed,
        )

        eval_observations = list(eval_episode.belief.observations)

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            map_feat = build_map_features(grid, initial_state.settlements)
            ev_feat = build_viewport_evidence_features(eval_observations, seed_index, h, w)
            combined = np.concatenate([map_feat, ev_feat], axis=-1)
            X_eval = combined.reshape(-1, combined.shape[-1])

            probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                probs[:, cls] = np.clip(models[cls].predict(X_eval), 0.0, 1.0)

            row_sums = probs.sum(axis=1, keepdims=True)
            probs = probs / np.maximum(row_sums, 1e-10)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)

            pred = probs.reshape(h, w, CLASS_COUNT)

            # Apply barren calibration if enabled
            if barren_calibration:
                build_rate = float(np.mean(pred[:, :, 1] + pred[:, :, 2] + pred[:, :, 3]))
                if build_rate < barren_threshold:
                    pred = pred.copy()
                    pred[:, :, 1] *= barren_settlement_scale
                    pred[:, :, 2] *= barren_settlement_scale
                    pred[:, :, 3] *= barren_ruin_scale
                    pred[:, :, 4] *= barren_forest_boost
                    pred[:, :, 0] = np.maximum(
                        1.0 - pred[:, :, 1] - pred[:, :, 2] - pred[:, :, 3] - pred[:, :, 4] - pred[:, :, 5],
                        0.01,
                    )
                    pred = np.clip(pred, 1e-8, None)
                    pred /= pred.sum(axis=-1, keepdims=True)

            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)
            all_results.append({
                "round_id": held_out_round,
                "seed_index": seed_index,
                "score": breakdown.score,
                "weighted_kl": breakdown.weighted_kl,
            })

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time() - fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    total_time = time.time() - total_start

    print(f"\n{'=' * 60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'=' * 60}")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")
    print(f"\nCOMPARISON:")
    print(f"  This live LGB:                   score={mean_score:.4f}")
    print(f"  adaptive_ensemble_v17 (live):     score=79.98")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "config": {
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "probability_floor": probability_floor,
            "budget": budget,
            "policy_name": policy_name,
        },
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_cellwise_live_lgb_v1")
    parser.add_argument("--n-estimators", type=int, default=800)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--probability-floor", type=float, default=0.003)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--n-jobs", type=int, default=16)
    parser.add_argument("--barren-calibration", action="store_true")
    parser.add_argument("--barren-threshold", type=float, default=0.03)
    parser.add_argument("--barren-settlement-scale", type=float, default=0.3)
    parser.add_argument("--barren-ruin-scale", type=float, default=0.2)
    parser.add_argument("--barren-forest-boost", type=float, default=1.15)
    args = parser.parse_args()

    run_live_lgb_benchmark(
        name=args.name,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        probability_floor=args.probability_floor,
        budget=args.budget,
        n_jobs=args.n_jobs,
        barren_calibration=args.barren_calibration,
        barren_threshold=args.barren_threshold,
        barren_settlement_scale=args.barren_settlement_scale,
        barren_ruin_scale=args.barren_ruin_scale,
        barren_forest_boost=args.barren_forest_boost,
    )
