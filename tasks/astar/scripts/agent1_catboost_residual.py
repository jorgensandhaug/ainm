"""CatBoost residual corrector on top of ffam_mode predictions.

Instead of building predictions from scratch, use ffam_mode_v248 as a base
and train CatBoost to predict the RESIDUAL (error) in log-odds space.

Hypothesis: CatBoost can learn cell-level correction patterns that the
linear operator + MLP posterior misses, especially for OOD rounds.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction, entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid, buildable_mask, land_mask, mountain_mask, sea_mask
from astar.envs.synthetic import SyntheticActiveOracle
from astar.features.coasts import coast_mask
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def _neighbor_sum(arr, radius):
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


def build_cell_features(grid, settlements, obs_list, seed_index, base_pred, h, w):
    """Build rich per-cell features combining map info, observations, and base prediction."""
    collapsed = collapse_internal_grid(grid)
    features = []

    # Initial terrain one-hot
    for cls in range(CLASS_COUNT):
        features.append((collapsed == cls).astype(np.float64))

    # Terrain masks
    is_land = land_mask(grid).astype(np.float64)
    is_sea = sea_mask(grid).astype(np.float64)
    is_mountain = mountain_mask(grid).astype(np.float64)
    is_buildable = buildable_mask(grid).astype(np.float64)
    is_coast = coast_mask(grid).astype(np.float64)
    is_forest = (grid == 4).astype(np.float64)
    features.extend([is_land, is_sea, is_mountain, is_buildable, is_coast, is_forest])

    # Settlement features
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

    # Neighborhood features
    for radius in [1, 2, 3]:
        for arr in [is_forest, is_mountain, sett_map, port_map, is_coast, is_buildable]:
            features.append(_neighbor_sum(arr, radius))

    # Settlement distance
    sett_dist = np.ones((h, w), dtype=np.float64)
    for s in settlements:
        y = s.y if hasattr(s, 'y') else s['y']
        x = s.x if hasattr(s, 'x') else s['x']
        yy, xx = np.mgrid[0:h, 0:w]
        dist = np.sqrt((yy - y) ** 2 + (xx - x) ** 2) / max(h, w)
        sett_dist = np.minimum(sett_dist, dist)
    features.append(sett_dist)

    # Position features
    yy, xx = np.mgrid[0:h, 0:w]
    features.append(yy.astype(np.float64) / max(h - 1, 1))
    features.append(xx.astype(np.float64) / max(w - 1, 1))

    # Observation features
    obs_count = np.zeros((h, w), dtype=np.float64)
    obs_class_count = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
    obs_alive_count = np.zeros((h, w), dtype=np.float64)
    for obs in obs_list:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        gy_end = min(vp.y + vp.h, h)
        gx_end = min(vp.x + vp.w, w)
        obs_count[vp.y:gy_end, vp.x:gx_end] += 1.0
        collapsed_obs = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        for c in range(CLASS_COUNT):
            obs_class_count[vp.y:gy_end, vp.x:gx_end, c] += (
                collapsed_obs[:gy_end - vp.y, :gx_end - vp.x] == c
            ).astype(np.float64)

    features.append(obs_count)
    features.append((obs_count > 0).astype(np.float64))
    for c in range(CLASS_COUNT):
        features.append(obs_class_count[:, :, c] / np.maximum(obs_count, 1.0))

    # Cross-seed observation features
    cross_obs_count = np.zeros((h, w), dtype=np.float64)
    for obs in obs_list:
        if obs.seed_index == seed_index:
            continue
        vp = obs.viewport
        gy_end = min(vp.y + vp.h, h)
        gx_end = min(vp.x + vp.w, w)
        cross_obs_count[vp.y:gy_end, vp.x:gx_end] += 1.0
    features.append(cross_obs_count)

    # Base prediction (log-odds)
    log_pred = np.log(np.clip(base_pred, 1e-6, 1.0))
    for c in range(CLASS_COUNT):
        features.append(log_pred[:, :, c])

    # Base prediction entropy
    pred_entropy = -np.sum(base_pred * np.log(np.clip(base_pred, 1e-10, 1.0)), axis=-1)
    features.append(pred_entropy)

    # Base prediction confidence (max prob)
    features.append(np.max(base_pred, axis=-1))

    # Global features
    n_sett = len(settlements)
    n_port = sum(1 for s in settlements if (s.has_port if hasattr(s, 'has_port') else s.get('has_port', False)))
    for val in [n_sett / 60.0, n_port / 10.0, float(is_land.mean()), float(is_coast.mean())]:
        features.append(np.full((h, w), val, dtype=np.float64))

    return np.stack(features, axis=-1)


def obs_blend(pred, obs_list, seed_index, h, w, temperature=50.0):
    """Direct observation blending."""
    obs_count = np.zeros((h, w), dtype=np.float64)
    class_count = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
    for obs in obs_list:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0
        region = collapsed[:vy_end - vp.y, :vx_end - vp.x]
        for c in range(CLASS_COUNT):
            class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)

    total = obs_count[:, :, np.newaxis]
    emp = class_count / np.maximum(total, 1.0)
    observed = obs_count > 0
    if np.any(observed):
        emp[observed] = np.clip(emp[observed], 0.005 / CLASS_COUNT, 1.0)
        emp = emp / np.maximum(np.sum(emp, axis=-1, keepdims=True), 1e-8)
    bw = total / (total + temperature)
    refined = bw * emp + (1.0 - bw) * pred
    return np.asarray(refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8), dtype=np.float64)


def run_catboost_residual(
    name: str = "catboost_res_v1",
    base_model: str = "ffam_ensemble_v50",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    n_evidence_seeds: int = 2,
    iterations: int = 800,
    depth: int = 6,
    learning_rate: float = 0.02,
    l2_reg: float = 5.0,
    obs_blend_temp: float = 40.0,
    residual_weight: float = 0.3,
    budget: int = 50,
    episode_seed: int = 0,
):
    from catboost import CatBoostRegressor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"CatBoost Residual: {name}")
    print(f"  Base: {base_model}, policy={policy_name}")
    print(f"  CatBoost: iters={iterations}, depth={depth}, lr={learning_rate}, l2={l2_reg}")
    print(f"  Evidence seeds: {n_evidence_seeds}, residual_weight={residual_weight}")
    print()

    fold_scores = []
    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        t0 = time.time()
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}...")

        # Collect training data from training rounds
        X_train, Y_train, W_train = [], [], []
        policy_obj = build_interactive_policy(policy_name)

        for evidence_seed in range(n_evidence_seeds):
            for rid in train_ids:
                rd = read_round_record(paths, rid)
                analysis = read_analysis_records(paths, rid)
                other_train = [r for r in train_ids if r != rid]

                if len(other_train) < 2:
                    continue

                # Build predictor with LOO (exclude current training round)
                pred_obj = build_online_predictor(
                    base_model, paths=paths, historical_round_ids=other_train,
                    policy_name=policy_name, samples_per_round=samples_per_round,
                )

                # Run episode
                ep = run_online_episode(
                    oracle, round_id=rid,
                    predictor=pred_obj, policy=policy_obj,
                    budget=budget, episode_seed=evidence_seed * 1000,
                )
                obs_list = list(ep.belief.observations)
                base_preds = ep.prediction_bundle.predictions_by_seed

                for si, gt_analysis in sorted(analysis.items()):
                    if si not in base_preds:
                        continue
                    gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
                    base_pred = np.asarray(base_preds[si], dtype=np.float64)
                    ist = rd.round.initial_states[si]
                    h, w = gt.shape[:2]

                    feats = build_cell_features(
                        np.asarray(ist.grid, dtype=np.int64),
                        ist.settlements, obs_list, si, base_pred, h, w,
                    )

                    # Target: residual in log-odds space
                    log_gt = np.log(np.clip(gt, 1e-6, 1.0))
                    log_base = np.log(np.clip(base_pred, 1e-6, 1.0))
                    residual = log_gt - log_base  # What CatBoost should predict

                    # Weight by entropy (focus on uncertain cells)
                    ent_weights = np.maximum(entropy_map(gt).ravel(), 0.01)

                    X_train.append(feats.reshape(-1, feats.shape[-1]))
                    Y_train.append(residual.reshape(-1, CLASS_COUNT))
                    W_train.append(ent_weights)

        if not X_train:
            print("  No training data, skipping")
            fold_scores.append(0.0)
            continue

        X = np.concatenate(X_train)
        Y = np.concatenate(Y_train)
        W = np.concatenate(W_train)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        # Train one CatBoost per class
        models = {}
        for c in range(CLASS_COUNT):
            m = CatBoostRegressor(
                iterations=iterations, depth=depth, learning_rate=learning_rate,
                l2_leaf_reg=l2_reg, subsample=0.8, verbose=0,
                thread_count=32, random_seed=42,
            )
            m.fit(X, Y[:, c], sample_weight=W)
            models[c] = m

        # Evaluate on holdout
        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        pred_obj = build_online_predictor(
            base_model, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_name, samples_per_round=samples_per_round,
        )
        ep = run_online_episode(
            oracle, round_id=holdout_rid,
            predictor=pred_obj, policy=policy_obj,
            budget=budget, episode_seed=episode_seed,
        )
        obs_list = list(ep.belief.observations)
        base_preds = ep.prediction_bundle.predictions_by_seed

        seed_scores = []
        for si, gt_analysis in sorted(analysis.items()):
            if si not in base_preds:
                continue
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
            base_pred = np.asarray(base_preds[si], dtype=np.float64)
            ist = rd.round.initial_states[si]
            h, w = gt.shape[:2]

            feats = build_cell_features(
                np.asarray(ist.grid, dtype=np.int64),
                ist.settlements, obs_list, si, base_pred, h, w,
            )
            X_test = feats.reshape(-1, feats.shape[-1])

            # Predict residual
            pred_residual = np.zeros((h * w, CLASS_COUNT))
            for c in range(CLASS_COUNT):
                pred_residual[:, c] = models[c].predict(X_test)

            # Apply residual
            log_base = np.log(np.clip(base_pred, 1e-6, 1.0)).reshape(-1, CLASS_COUNT)
            corrected_log = log_base + residual_weight * pred_residual
            corrected = np.exp(corrected_log)
            corrected = corrected / np.maximum(corrected.sum(1, keepdims=True), 1e-10)
            corrected = corrected.reshape(h, w, CLASS_COUNT)

            # Observation blending
            corrected = obs_blend(corrected, obs_list, si, h, w, obs_blend_temp)

            # Floor
            corrected = np.maximum(corrected, 0.0003)
            corrected = corrected / corrected.sum(-1, keepdims=True)

            sc = score_prediction(gt, corrected)
            seed_scores.append(sc.score)

        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        print(f"  Score: {mean_score:.4f} ({elapsed:.1f}s)")

    overall = float(np.mean(fold_scores))
    print(f"\n{'='*60}")
    print(f"CATBOOST RESIDUAL {name}: score={overall:.4f}")
    print(f"{'='*60}")
    for rid, sc in zip(rids, fold_scores):
        print(f"  {rid[:8]}... score={sc:.4f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="catboost_res_v1")
    p.add_argument("--base-model", default="ffam_ensemble_v50")
    p.add_argument("--policy", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--n-evidence-seeds", type=int, default=2)
    p.add_argument("--iterations", type=int, default=800)
    p.add_argument("--depth", type=int, default=6)
    p.add_argument("--lr", type=float, default=0.02)
    p.add_argument("--l2", type=float, default=5.0)
    p.add_argument("--obs-blend-temp", type=float, default=40.0)
    p.add_argument("--residual-weight", type=float, default=0.3)
    p.add_argument("--budget", type=int, default=50)
    p.add_argument("--episode-seed", type=int, default=0)
    args = p.parse_args()
    run_catboost_residual(
        name=args.name, base_model=args.base_model, policy_name=args.policy,
        samples_per_round=args.samples, n_evidence_seeds=args.n_evidence_seeds,
        iterations=args.iterations, depth=args.depth, learning_rate=args.lr,
        l2_reg=args.l2, obs_blend_temp=args.obs_blend_temp,
        residual_weight=args.residual_weight, budget=args.budget,
        episode_seed=args.episode_seed,
    )
