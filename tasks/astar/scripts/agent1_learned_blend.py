"""Learned per-cell ensemble blending using a small neural network.

Instead of fixed ensemble weights, learn cell-specific weights based on:
- Initial terrain features
- Observation features (how much was observed, what was seen)
- Base model predictions (entropy, confidence)

The blending network takes features and outputs a weight in [0, 1] for each cell,
determining how much to trust the primary model vs the diversity source.
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


def build_blend_features(grid, obs_list, seed_index, pred_a, pred_b, h, w):
    """Build features for learning per-cell blend weights."""
    collapsed = collapse_internal_grid(grid)
    features = []

    # Terrain features
    for cls in range(CLASS_COUNT):
        features.append((collapsed == cls).astype(np.float64))
    features.append(land_mask(grid).astype(np.float64))
    features.append(sea_mask(grid).astype(np.float64))
    features.append(mountain_mask(grid).astype(np.float64))
    features.append(buildable_mask(grid).astype(np.float64))
    features.append(coast_mask(grid).astype(np.float64))

    # Observation features
    obs_count = np.zeros((h, w), dtype=np.float64)
    for obs in obs_list:
        if obs.seed_index != seed_index:
            continue
        vp = obs.viewport
        gy_end = min(vp.y + vp.h, h)
        gx_end = min(vp.x + vp.w, w)
        obs_count[vp.y:gy_end, vp.x:gx_end] += 1.0
    features.append(obs_count)
    features.append((obs_count > 0).astype(np.float64))

    # Prediction features
    for c in range(CLASS_COUNT):
        features.append(pred_a[:, :, c])
        features.append(pred_b[:, :, c])

    # Entropy of each prediction
    ent_a = -np.sum(pred_a * np.log(np.clip(pred_a, 1e-10, 1.0)), axis=-1)
    ent_b = -np.sum(pred_b * np.log(np.clip(pred_b, 1e-10, 1.0)), axis=-1)
    features.append(ent_a)
    features.append(ent_b)

    # Agreement between predictions (KL divergence)
    kl_ab = np.sum(pred_a * np.log(np.clip(pred_a / np.clip(pred_b, 1e-10, 1.0), 1e-10, 100.0)), axis=-1)
    features.append(kl_ab)

    # Max probability
    features.append(np.max(pred_a, axis=-1))
    features.append(np.max(pred_b, axis=-1))

    return np.stack(features, axis=-1)


def logodds_blend_weighted(pred_a, pred_b, weights):
    """Blend in log-odds space with per-cell weights."""
    floor = 1e-6
    log_a = np.log(np.clip(pred_a, floor, 1.0))
    log_b = np.log(np.clip(pred_b, floor, 1.0))
    w = weights[:, :, np.newaxis] if weights.ndim == 2 else weights
    blended_log = w * log_a + (1.0 - w) * log_b
    blended = np.exp(blended_log)
    blended = blended / np.sum(blended, axis=-1, keepdims=True)
    return blended


def find_optimal_weights_ridge(X, pred_a_flat, pred_b_flat, gt_flat, weights_flat):
    """Find optimal per-cell blend weights using ridge regression.

    Instead of neural network, use ridge regression to predict the optimal
    weight based on cell features. The optimal weight for each cell minimizes
    the weighted KL divergence between the blended prediction and ground truth.
    """
    from sklearn.linear_model import Ridge

    # For each cell, find the optimal weight by grid search
    n_cells = X.shape[0]
    optimal_weights = np.zeros(n_cells)

    # Grid search optimal weight for each cell (vectorized)
    alphas = np.linspace(0.5, 1.0, 11)  # Search from 0.5 to 1.0
    best_kls = np.full(n_cells, np.inf)

    for alpha in alphas:
        log_a = np.log(np.clip(pred_a_flat, 1e-6, 1.0))
        log_b = np.log(np.clip(pred_b_flat, 1e-6, 1.0))
        blended_log = alpha * log_a + (1.0 - alpha) * log_b
        blended = np.exp(blended_log)
        blended = blended / np.sum(blended, axis=-1, keepdims=True)
        blended = np.maximum(blended, 0.0003)
        blended = blended / np.sum(blended, axis=-1, keepdims=True)

        kl = np.sum(gt_flat * np.log(np.clip(gt_flat / np.clip(blended, 1e-10, 1.0), 1e-10, 100.0)), axis=-1)
        better = kl < best_kls
        optimal_weights[better] = alpha
        best_kls[better] = kl[better]

    # Learn to predict optimal weights from features
    model = Ridge(alpha=10.0)
    model.fit(X, optimal_weights, sample_weight=weights_flat)
    return model


def run_learned_blend(
    name: str = "learned_v1",
    model_a: str = "ffam_ensemble_v50",
    model_b: str = "hazard_posterior_v15_k5_r5_l32_m30_q2",
    policy_a: str = "exploration_r3_settle_heavy",
    policy_b: str = "regime_probe",
    samples_a: int = 6,
    samples_b: int = 1,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Learned Blend: {name}")
    print(f"  Model A: {model_a} (policy={policy_a})")
    print(f"  Model B: {model_b} (policy={policy_b})")
    print()

    fold_scores = []
    fold_scores_a = []
    fold_scores_b = []

    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        t0 = time.time()
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}...")

        # Collect training data from OTHER training rounds
        X_train, pred_a_train, pred_b_train, gt_train, w_train = [], [], [], [], []

        for rid in train_ids:
            other_train = [r for r in train_ids if r != rid]
            if len(other_train) < 2:
                continue

            rd = read_round_record(paths, rid)
            analysis = read_analysis_records(paths, rid)

            pred_obj_a = build_online_predictor(
                model_a, paths=paths, historical_round_ids=other_train,
                policy_name=policy_a, samples_per_round=samples_a,
            )
            pred_obj_b = build_online_predictor(
                model_b, paths=paths, historical_round_ids=other_train,
                policy_name=policy_b, samples_per_round=samples_b,
            )

            policy_obj_a = build_interactive_policy(policy_a)
            policy_obj_b = build_interactive_policy(policy_b)

            ep_a = run_online_episode(oracle, round_id=rid, predictor=pred_obj_a, policy=policy_obj_a, budget=budget, episode_seed=0)
            ep_b = run_online_episode(oracle, round_id=rid, predictor=pred_obj_b, policy=policy_obj_b, budget=budget, episode_seed=0)

            obs_a = list(ep_a.belief.observations)
            preds_a = ep_a.prediction_bundle.predictions_by_seed
            preds_b = ep_b.prediction_bundle.predictions_by_seed

            for si, gt_analysis in sorted(analysis.items()):
                if si not in preds_a or si not in preds_b:
                    continue
                gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
                pa = np.asarray(preds_a[si], dtype=np.float64)
                pb = np.asarray(preds_b[si], dtype=np.float64)
                ist = rd.round.initial_states[si]
                h, w = gt.shape[:2]

                feats = build_blend_features(
                    np.asarray(ist.grid, dtype=np.int64),
                    obs_a, si, pa, pb, h, w,
                )
                ent_weights = np.maximum(entropy_map(gt).ravel(), 0.01)

                X_train.append(feats.reshape(-1, feats.shape[-1]))
                pred_a_train.append(pa.reshape(-1, CLASS_COUNT))
                pred_b_train.append(pb.reshape(-1, CLASS_COUNT))
                gt_train.append(gt.reshape(-1, CLASS_COUNT))
                w_train.append(ent_weights)

        if not X_train:
            print("  No training data")
            fold_scores.append(0.0)
            fold_scores_a.append(0.0)
            fold_scores_b.append(0.0)
            continue

        X = np.concatenate(X_train)
        pa_all = np.concatenate(pred_a_train)
        pb_all = np.concatenate(pred_b_train)
        gt_all = np.concatenate(gt_train)
        w_all = np.concatenate(w_train)

        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")
        blend_model = find_optimal_weights_ridge(X, pa_all, pb_all, gt_all, w_all)

        # Evaluate on holdout
        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        pred_obj_a = build_online_predictor(
            model_a, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_a, samples_per_round=samples_a,
        )
        pred_obj_b = build_online_predictor(
            model_b, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_b, samples_per_round=samples_b,
        )
        policy_obj_a = build_interactive_policy(policy_a)
        policy_obj_b = build_interactive_policy(policy_b)

        ep_a = run_online_episode(oracle, round_id=holdout_rid, predictor=pred_obj_a, policy=policy_obj_a, budget=budget, episode_seed=episode_seed)
        ep_b = run_online_episode(oracle, round_id=holdout_rid, predictor=pred_obj_b, policy=policy_obj_b, budget=budget, episode_seed=episode_seed)

        obs_a = list(ep_a.belief.observations)
        preds_a = ep_a.prediction_bundle.predictions_by_seed
        preds_b = ep_b.prediction_bundle.predictions_by_seed

        seed_scores = []
        seed_scores_a = []
        seed_scores_b = []
        for si, gt_analysis in sorted(analysis.items()):
            if si not in preds_a or si not in preds_b:
                continue
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
            pa = np.asarray(preds_a[si], dtype=np.float64)
            pb = np.asarray(preds_b[si], dtype=np.float64)
            ist = rd.round.initial_states[si]
            h, w = gt.shape[:2]

            feats = build_blend_features(
                np.asarray(ist.grid, dtype=np.int64),
                obs_a, si, pa, pb, h, w,
            )
            X_test = feats.reshape(-1, feats.shape[-1])

            # Predict per-cell weights
            raw_weights = blend_model.predict(X_test)
            weights = np.clip(raw_weights, 0.5, 1.0).reshape(h, w)

            # Blend
            blended = logodds_blend_weighted(pa, pb, weights)
            blended = np.maximum(blended, 0.0003)
            blended = blended / blended.sum(-1, keepdims=True)

            seed_scores.append(score_prediction(gt, blended).score)
            seed_scores_a.append(score_prediction(gt, pa).score)
            seed_scores_b.append(score_prediction(gt, pb).score)

        mean_score = float(np.mean(seed_scores))
        mean_a = float(np.mean(seed_scores_a))
        mean_b = float(np.mean(seed_scores_b))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        fold_scores_a.append(mean_a)
        fold_scores_b.append(mean_b)
        print(f"  A={mean_a:.2f}  B={mean_b:.2f}  Blend={mean_score:.2f} ({elapsed:.1f}s)")

    overall = float(np.mean(fold_scores))
    overall_a = float(np.mean(fold_scores_a))
    overall_b = float(np.mean(fold_scores_b))
    print(f"\n{'='*60}")
    print(f"LEARNED BLEND {name}: score={overall:.4f} (A={overall_a:.4f}, B={overall_b:.4f})")
    print(f"{'='*60}")
    for rid, sc, sa, sb in zip(rids, fold_scores, fold_scores_a, fold_scores_b):
        print(f"  {rid[:8]}... blend={sc:.4f} A={sa:.4f} B={sb:.4f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="learned_v1")
    p.add_argument("--model-a", default="ffam_ensemble_v50")
    p.add_argument("--model-b", default="hazard_posterior_v15_k5_r5_l32_m30_q2")
    p.add_argument("--policy-a", default="exploration_r3_settle_heavy")
    p.add_argument("--policy-b", default="regime_probe")
    p.add_argument("--samples-a", type=int, default=6)
    p.add_argument("--samples-b", type=int, default=1)
    args = p.parse_args()
    run_learned_blend(**vars(args))
