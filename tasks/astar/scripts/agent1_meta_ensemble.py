"""Meta-ensemble: combine ffam_ensemble_v50 with hazard_posterior_v15.

Two fundamentally different architectures blended in log-odds space:
1. ffam_ensemble_v50: mode operator + kNN + residual MLP posterior (88.06)
2. hazard_posterior_v15: original coefficient particles + ridge student (~83.8)

The ensemble should benefit from uncorrelated errors.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction, entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def logodds_blend(pred_a: np.ndarray, pred_b: np.ndarray,
                  weight_a: float = 0.85, adaptive: bool = True,
                  adaptive_scale: float = 1.5) -> np.ndarray:
    """Blend two probability tensors in log-odds space."""
    floor = 1e-6
    log_a = np.log(np.clip(pred_a, floor, 1.0))
    log_b = np.log(np.clip(pred_b, floor, 1.0))

    if adaptive:
        # Higher entropy in pred_a => use more pred_b
        entropy_a = -np.sum(
            pred_a * np.log(np.clip(pred_a, 1e-10, 1.0)),
            axis=-1, keepdims=True,
        ) / np.log(6.0)
        effective_weight_a = np.clip(
            weight_a + (1.0 - weight_a) * (1.0 - adaptive_scale * entropy_a),
            0.3,  # Allow more diversity weight than ffam ensemble
            1.0,
        )
    else:
        effective_weight_a = weight_a

    blended_log = effective_weight_a * log_a + (1.0 - effective_weight_a) * log_b
    blended = np.exp(blended_log)
    blended = blended / np.sum(blended, axis=-1, keepdims=True)
    # Apply floor
    blended = np.maximum(blended, 0.0003)
    blended = blended / np.sum(blended, axis=-1, keepdims=True)
    return blended


def run_meta_ensemble(
    name: str = "meta_v1",
    model_a: str = "ffam_ensemble_v50",
    model_b: str = "hazard_posterior_v15_k5_r5_l32_m30_q2",
    policy_a: str = "exploration_r3_settle_heavy",
    policy_b: str = "exploration_r3",
    weight_a: float = 0.85,
    adaptive: bool = True,
    adaptive_scale: float = 1.5,
    samples_a: int = 6,
    samples_b: int = 1,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Meta-Ensemble: {name}")
    print(f"  Model A: {model_a} (policy={policy_a}, samples={samples_a})")
    print(f"  Model B: {model_b} (policy={policy_b}, samples={samples_b})")
    print(f"  Weight A: {weight_a}, adaptive={adaptive}, scale={adaptive_scale}")
    print(f"  Budget: {budget}, seed: {episode_seed}")
    print()

    fold_scores = []
    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}...")
        t0 = time.time()

        # Build predictor A (ffam_ensemble)
        pred_a = build_online_predictor(
            model_a, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_a, samples_per_round=samples_a,
        )
        policy_obj_a = build_interactive_policy(policy_a)

        # Run episode with predictor A
        ep_a = run_online_episode(
            oracle, round_id=holdout_rid,
            predictor=pred_a, policy=policy_obj_a,
            budget=budget, episode_seed=episode_seed,
        )

        # Build predictor B (hazard_posterior)
        pred_b = build_online_predictor(
            model_b, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_b, samples_per_round=samples_b,
        )
        policy_obj_b = build_interactive_policy(policy_b)

        # Run episode with predictor B
        ep_b = run_online_episode(
            oracle, round_id=holdout_rid,
            predictor=pred_b, policy=policy_obj_b,
            budget=budget, episode_seed=episode_seed,
        )

        # Blend predictions
        preds_a = ep_a.prediction_bundle.predictions_by_seed
        preds_b = ep_b.prediction_bundle.predictions_by_seed

        seed_scores = []
        for si, gt_analysis in sorted(analysis.items()):
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)

            pa = np.asarray(preds_a[si], dtype=np.float64) if si in preds_a else None
            pb = np.asarray(preds_b[si], dtype=np.float64) if si in preds_b else None

            if pa is not None and pb is not None:
                blended = logodds_blend(pa, pb, weight_a, adaptive, adaptive_scale)
            elif pa is not None:
                blended = pa
            else:
                blended = pb

            sc = score_prediction(gt, blended)
            seed_scores.append(sc.score)

        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        print(f"  Score: {mean_score:.4f} ({elapsed:.1f}s)")

    overall = float(np.mean(fold_scores))
    print(f"\n{'='*60}")
    print(f"META-ENSEMBLE {name}: score={overall:.4f}")
    print(f"{'='*60}")
    for rid, sc in zip(rids, fold_scores):
        print(f"  {rid[:8]}... score={sc:.4f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="meta_v1")
    p.add_argument("--model-a", default="ffam_ensemble_v50")
    p.add_argument("--model-b", default="hazard_posterior_v15_k5_r5_l32_m30_q2")
    p.add_argument("--policy-a", default="exploration_r3_settle_heavy")
    p.add_argument("--policy-b", default="exploration_r3")
    p.add_argument("--weight-a", type=float, default=0.85)
    p.add_argument("--adaptive", action="store_true", default=True)
    p.add_argument("--no-adaptive", dest="adaptive", action="store_false")
    p.add_argument("--adaptive-scale", type=float, default=1.5)
    p.add_argument("--samples-a", type=int, default=6)
    p.add_argument("--samples-b", type=int, default=1)
    p.add_argument("--budget", type=int, default=50)
    p.add_argument("--episode-seed", type=int, default=0)
    args = p.parse_args()
    run_meta_ensemble(**vars(args))
