"""Disagreement-aware observation blending.

Key insight: observation blending helps when model is wrong (R7 OOD)
but hurts when model is right (R1). Use the DISAGREEMENT between
model prediction and direct observations to decide blending strength.

High disagreement → trust observations more (model probably wrong)
Low disagreement → keep model (model probably right)
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def disagreement_blend(pred, obs_list, seed_index, h, w,
                       base_temp=20.0, disagree_temp=8.0, disagree_threshold=0.3):
    """Blend with temperature that depends on observation-model disagreement.

    For each cell:
    - Compute empirical class frequency from observations
    - Compute KL(empirical || model) as disagreement measure
    - If disagreement > threshold: use lower temperature (trust obs more)
    - If disagreement <= threshold: use higher temperature (trust model more)
    """
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

    if not np.any(observed):
        return pred

    # Smooth empirical to avoid extreme frequencies
    emp[observed] = np.clip(emp[observed], 0.01 / CLASS_COUNT, 1.0)
    emp = emp / np.maximum(np.sum(emp, axis=-1, keepdims=True), 1e-8)

    # Compute per-cell disagreement: symmetric KL
    pred_clipped = np.clip(pred, 1e-8, 1.0)
    kl_fwd = np.sum(emp * np.log(emp / pred_clipped + 1e-10), axis=-1)
    kl_rev = np.sum(pred_clipped * np.log(pred_clipped / (emp + 1e-10) + 1e-10), axis=-1)
    disagreement = (kl_fwd + kl_rev) / 2.0  # Symmetric KL

    # Per-cell temperature: lower when disagreement is high
    # temperature = base_temp when agreement, disagree_temp when disagreement
    alpha = np.clip(disagreement / disagree_threshold, 0.0, 1.0)
    temperature = base_temp * (1.0 - alpha) + disagree_temp * alpha

    # Apply blending
    bw = obs_count / (obs_count + temperature)
    bw = bw[:, :, np.newaxis]
    refined = bw * emp + (1.0 - bw) * pred
    return np.asarray(
        refined / np.maximum(np.sum(refined, axis=-1, keepdims=True), 1e-8),
        dtype=np.float64,
    )


def run_disagreement_blend(
    name: str = "disagree_v1",
    base_model: str = "ffam_ensemble_v50",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    base_temp: float = 30.0,
    disagree_temp: float = 8.0,
    disagree_threshold: float = 0.3,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Disagreement Blend: {name}")
    print(f"  Base: {base_model}, policy={policy_name}")
    print(f"  base_temp={base_temp}, disagree_temp={disagree_temp}, threshold={disagree_threshold}")
    print(flush=True)

    fold_scores = []
    fold_scores_raw = []
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
        obs_list = list(ep.belief.observations)
        base_preds = ep.prediction_bundle.predictions_by_seed

        rd = read_round_record(paths, holdout_rid)
        analysis = read_analysis_records(paths, holdout_rid)

        seed_scores = []
        seed_scores_raw = []
        for si, gt_analysis in sorted(analysis.items()):
            if si not in base_preds:
                continue
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
            base_pred = np.asarray(base_preds[si], dtype=np.float64)
            h, w = gt.shape[:2]

            sc_raw = score_prediction(gt, base_pred)
            seed_scores_raw.append(sc_raw.score)

            blended = disagreement_blend(
                base_pred, obs_list, si, h, w,
                base_temp=base_temp, disagree_temp=disagree_temp,
                disagree_threshold=disagree_threshold,
            )
            blended = np.maximum(blended, 0.0003)
            blended = blended / blended.sum(-1, keepdims=True)

            sc = score_prediction(gt, blended)
            seed_scores.append(sc.score)

        mean_raw = float(np.mean(seed_scores_raw))
        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        fold_scores_raw.append(mean_raw)
        delta = mean_score - mean_raw
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}... raw={mean_raw:.2f} → blend={mean_score:.2f} (delta={delta:+.2f}) ({elapsed:.1f}s)", flush=True)

    overall = float(np.mean(fold_scores))
    overall_raw = float(np.mean(fold_scores_raw))
    print(f"\n{'='*60}")
    print(f"DISAGREEMENT BLEND {name}: score={overall:.4f} (raw={overall_raw:.4f}, delta={overall-overall_raw:+.4f})")
    print(f"{'='*60}")
    for rid, sc, sr in zip(rids, fold_scores, fold_scores_raw):
        delta = sc - sr
        print(f"  {rid[:8]}... blend={sc:.4f} raw={sr:.4f} delta={delta:+.4f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="disagree_v1")
    p.add_argument("--base-model", default="ffam_ensemble_v50")
    p.add_argument("--policy", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--base-temp", type=float, default=30.0)
    p.add_argument("--disagree-temp", type=float, default=8.0)
    p.add_argument("--disagree-threshold", type=float, default=0.3)
    p.add_argument("--budget", type=int, default=50)
    p.add_argument("--episode-seed", type=int, default=0)
    args = p.parse_args()
    run_disagreement_blend(
        name=args.name, base_model=args.base_model, policy_name=args.policy,
        samples_per_round=args.samples, base_temp=args.base_temp,
        disagree_temp=args.disagree_temp, disagree_threshold=args.disagree_threshold,
        budget=args.budget, episode_seed=args.episode_seed,
    )
