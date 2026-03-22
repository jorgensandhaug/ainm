"""Multi-sample ensemble: average predictions across different samples_per_round.

The ffam_mode model uses synthetic episodes to train its MLP posterior.
Different samples_per_round values give different training data distributions.
By ensembling predictions from multiple sample counts, we get a more robust
estimate that doesn't overfit to a particular synthetic data generation.

This is a WITHIN-ARCHITECTURE ensemble that doesn't require different model families.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction
from astar.core.terrain import CLASS_COUNT
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def geometric_mean_blend(predictions, weights=None):
    """Geometric mean blend of probability predictions (log-odds average)."""
    n = len(predictions)
    if weights is None:
        weights = [1.0 / n] * n
    log_sum = np.zeros_like(predictions[0])
    for pred, w in zip(predictions, weights):
        log_sum += w * np.log(np.clip(pred, 1e-6, 1.0))
    blended = np.exp(log_sum)
    blended = blended / np.maximum(blended.sum(-1, keepdims=True), 1e-8)
    blended = np.maximum(blended, 0.0003)
    blended = blended / blended.sum(-1, keepdims=True)
    return blended


def run_multi_sample_ensemble(
    name: str = "multi_sample_v1",
    base_model: str = "ffam_mode_v248",
    policy_name: str = "exploration_r3_settle_heavy",
    sample_counts: list[int] = None,
    budget: int = 50,
    episode_seed: int = 0,
):
    if sample_counts is None:
        sample_counts = [2, 4, 6, 8]

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Multi-Sample Ensemble: {name}", flush=True)
    print(f"  Base: {base_model}, policy={policy_name}", flush=True)
    print(f"  Sample counts: {sample_counts}", flush=True)
    print(flush=True)

    fold_scores = []
    fold_scores_individual = {s: [] for s in sample_counts}

    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        t0 = time.time()
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}...", flush=True)

        # Run each sample count
        all_predictions = {}
        for s in sample_counts:
            pred_obj = build_online_predictor(
                base_model, paths=paths, historical_round_ids=train_ids,
                policy_name=policy_name, samples_per_round=s,
            )
            policy_obj = build_interactive_policy(policy_name)
            ep = run_online_episode(
                oracle, round_id=holdout_rid,
                predictor=pred_obj, policy=policy_obj,
                budget=budget, episode_seed=episode_seed,
            )
            all_predictions[s] = ep.prediction_bundle.predictions_by_seed

        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        seed_scores = []
        for si, gt_analysis in sorted(analysis.items()):
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)

            # Individual scores
            for s in sample_counts:
                if si in all_predictions[s]:
                    p = np.asarray(all_predictions[s][si], dtype=np.float64)
                    fold_scores_individual[s].append(score_prediction(gt, p).score)

            # Geometric mean ensemble
            preds_to_blend = []
            for s in sample_counts:
                if si in all_predictions[s]:
                    preds_to_blend.append(np.asarray(all_predictions[s][si], dtype=np.float64))

            if len(preds_to_blend) == len(sample_counts):
                blended = geometric_mean_blend(preds_to_blend)
                sc = score_prediction(gt, blended)
                seed_scores.append(sc.score)

        mean_score = float(np.mean(seed_scores)) if seed_scores else 0
        elapsed = time.time() - t0
        fold_scores.append(mean_score)

        # Print individual scores
        individual_str = ", ".join(
            f"s{s}={float(np.mean(fold_scores_individual[s][-len(seed_scores):])):.2f}"
            for s in sample_counts
        )
        print(f"  Blend={mean_score:.2f}, {individual_str} ({elapsed:.1f}s)", flush=True)

    overall = float(np.mean(fold_scores))
    print(f"\n{'='*60}", flush=True)
    print(f"MULTI-SAMPLE {name}: score={overall:.4f}", flush=True)
    for s in sample_counts:
        individual_mean = float(np.mean(fold_scores_individual[s])) if fold_scores_individual[s] else 0
        print(f"  s={s}: {individual_mean:.4f}", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="multi_sample_v1")
    p.add_argument("--base-model", default="ffam_mode_v248")
    p.add_argument("--policy-name", default="exploration_r3_settle_heavy")
    p.add_argument("--sample-counts", type=int, nargs="+", default=[2, 4, 6, 8])
    args = p.parse_args()
    run_multi_sample_ensemble(
        name=args.name, base_model=args.base_model,
        policy_name=args.policy_name, sample_counts=args.sample_counts,
    )
