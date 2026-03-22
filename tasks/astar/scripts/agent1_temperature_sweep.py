"""Temperature scaling post-processing.

Simple approach: scale the log-probabilities by a temperature parameter.
temperature < 1 = soften (more uniform, less confident)
temperature > 1 = sharpen (more peaked, more confident)

The idea: the model might be overconfident for some rounds (R7)
and well-calibrated for others. A global temperature adjustment
could help if the average is slightly off.
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


def apply_temperature(pred, temperature):
    """Apply temperature scaling to probability predictions."""
    log_pred = np.log(np.clip(pred, 1e-8, 1.0))
    scaled = log_pred * temperature
    exp_scaled = np.exp(scaled)
    result = exp_scaled / np.maximum(exp_scaled.sum(-1, keepdims=True), 1e-8)
    result = np.maximum(result, 0.0003)
    result = result / result.sum(-1, keepdims=True)
    return result


def run_temperature_sweep(
    base_model: str = "ffam_ensemble_v50",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    temperatures: list[float] = None,
    budget: int = 50,
    episode_seed: int = 0,
):
    if temperatures is None:
        temperatures = [0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15]

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Temperature Sweep: {base_model}", flush=True)
    print(f"  Temperatures: {temperatures}", flush=True)
    print(flush=True)

    # Collect predictions for all folds first
    all_fold_data = []
    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        t0 = time.time()

        pred_obj = build_online_predictor(
            base_model, paths=paths, historical_round_ids=train_ids,
            policy_name=policy_name, samples_per_round=samples_per_round,
        )
        policy_obj = build_interactive_policy(policy_name)

        ep = run_online_episode(
            oracle, round_id=holdout_rid,
            predictor=pred_obj, policy=policy_obj,
            budget=budget, episode_seed=episode_seed,
        )
        base_preds = ep.prediction_bundle.predictions_by_seed

        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        fold_data = {
            'rid': holdout_rid,
            'round_number': rd.round.round_number,
            'seeds': [],
        }
        for si, gt_analysis in sorted(analysis.items()):
            if si not in base_preds:
                continue
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
            base_pred = np.asarray(base_preds[si], dtype=np.float64)
            fold_data['seeds'].append((si, gt, base_pred))

        elapsed = time.time() - t0
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}... ({elapsed:.1f}s)", flush=True)
        all_fold_data.append(fold_data)

    # Now sweep temperatures
    print(f"\n{'='*70}", flush=True)
    header = f"{'Temp':>6s}"
    for fd in all_fold_data:
        header += f"  R{fd['round_number']:2d}"
    header += "   Mean"
    print(header, flush=True)
    print("-" * 70, flush=True)

    for temp in temperatures:
        fold_scores = []
        for fd in all_fold_data:
            seed_scores = []
            for si, gt, base_pred in fd['seeds']:
                scaled = apply_temperature(base_pred, temp)
                sc = score_prediction(gt, scaled)
                seed_scores.append(sc.score)
            fold_scores.append(float(np.mean(seed_scores)))

        overall = float(np.mean(fold_scores))
        row = f"{temp:6.2f}"
        for fs in fold_scores:
            row += f"  {fs:5.2f}"
        row += f"  {overall:6.2f}"
        print(row, flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--base-model", default="ffam_ensemble_v50")
    p.add_argument("--policy", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--temps", type=float, nargs="+",
                   default=[0.80, 0.85, 0.90, 0.92, 0.95, 0.97, 1.00, 1.03, 1.05, 1.10, 1.15, 1.20])
    args = p.parse_args()
    run_temperature_sweep(
        base_model=args.base_model, policy_name=args.policy,
        samples_per_round=args.samples, temperatures=args.temps,
    )
