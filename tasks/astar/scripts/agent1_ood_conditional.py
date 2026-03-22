"""OOD-conditional observation blending.

Key insight: obs blending helps R7 (+0.95) but hurts R1 (-0.96).
If we can DETECT at test time whether the round is OOD, we can
apply blending only when it helps.

Detection method: compute round-level observation-prediction disagreement.
High disagreement across the round → OOD → apply obs blending.
Low disagreement → in-distribution → keep model prediction.
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


def compute_round_disagreement(preds_by_seed, obs_list, rd, h, w):
    """Compute average observation-model disagreement across all seeds."""
    total_kl = 0.0
    n_cells = 0

    for si in preds_by_seed:
        pred = np.asarray(preds_by_seed[si], dtype=np.float64)
        obs_count = np.zeros((h, w), dtype=np.float64)
        class_count = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)

        for obs in obs_list:
            if obs.seed_index != si:
                continue
            vp = obs.viewport
            collapsed = collapse_internal_grid(np.asarray(obs.grid, dtype=np.int64))
            vy_end = min(vp.y + vp.h, h)
            vx_end = min(vp.x + vp.w, w)
            obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0
            region = collapsed[:vy_end - vp.y, :vx_end - vp.x]
            for c in range(CLASS_COUNT):
                class_count[vp.y:vy_end, vp.x:vx_end, c] += (region == c).astype(np.float64)

        # Compute empirical distribution
        total = obs_count[:, :, np.newaxis]
        emp = class_count / np.maximum(total, 1.0)
        observed = obs_count > 0

        if np.any(observed):
            emp[observed] = np.clip(emp[observed], 0.01 / CLASS_COUNT, 1.0)
            emp = emp / np.maximum(np.sum(emp, axis=-1, keepdims=True), 1e-8)

            # KL(empirical || model) for observed cells
            pred_obs = pred[observed]
            emp_obs = emp[observed]
            kl = np.sum(
                emp_obs * np.log(np.clip(emp_obs / np.clip(pred_obs, 1e-10, 1.0), 1e-10, 100.0)),
                axis=-1
            )
            total_kl += np.sum(kl)
            n_cells += int(np.sum(observed))

    return total_kl / max(n_cells, 1)


def obs_blend(pred, obs_list, seed_index, h, w, temperature):
    """Standard observation blending."""
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


def run_ood_conditional(
    name: str = "ood_v1",
    base_model: str = "ffam_ensemble_v75",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    ood_threshold: float = 0.15,
    obs_temperature: float = 15.0,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"OOD-Conditional Blend: {name}", flush=True)
    print(f"  Base: {base_model}, policy={policy_name}", flush=True)
    print(f"  OOD threshold={ood_threshold}, obs_temp={obs_temperature}", flush=True)
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
        h = rd.round.map_height
        w = rd.round.map_width

        # Compute round-level disagreement
        disagreement = compute_round_disagreement(base_preds, obs_list, rd, h, w)
        is_ood = disagreement > ood_threshold

        seed_scores = []
        seed_scores_raw = []
        for si, gt_analysis in sorted(analysis.items()):
            if si not in base_preds:
                continue
            gt = np.asarray(gt_analysis.analysis.ground_truth, dtype=np.float64)
            base_pred = np.asarray(base_preds[si], dtype=np.float64)

            sc_raw = score_prediction(gt, base_pred)
            seed_scores_raw.append(sc_raw.score)

            if is_ood:
                blended = obs_blend(base_pred, obs_list, si, h, w, obs_temperature)
                blended = np.maximum(blended, 0.0003)
                blended = blended / blended.sum(-1, keepdims=True)
                sc = score_prediction(gt, blended)
            else:
                sc = sc_raw

            seed_scores.append(sc.score)

        mean_raw = float(np.mean(seed_scores_raw))
        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        fold_scores_raw.append(mean_raw)
        delta = mean_score - mean_raw
        ood_str = "OOD" if is_ood else "ID"
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}... [{ood_str} disagree={disagreement:.3f}] raw={mean_raw:.2f} → {mean_score:.2f} (delta={delta:+.2f}) ({elapsed:.1f}s)", flush=True)

    overall = float(np.mean(fold_scores))
    overall_raw = float(np.mean(fold_scores_raw))
    print(f"\n{'='*60}", flush=True)
    print(f"OOD CONDITIONAL {name}: score={overall:.4f} (raw={overall_raw:.4f}, delta={overall-overall_raw:+.4f})", flush=True)
    print(f"{'='*60}", flush=True)
    for rid, sc, sr in zip(rids, fold_scores, fold_scores_raw):
        delta = sc - sr
        print(f"  {rid[:8]}... {sc:.4f} (raw={sr:.4f}, delta={delta:+.4f})", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="ood_v1")
    p.add_argument("--base-model", default="ffam_ensemble_v75")
    p.add_argument("--policy-name", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--ood-threshold", type=float, default=0.15)
    p.add_argument("--obs-temp", type=float, default=15.0)
    args = p.parse_args()
    run_ood_conditional(
        name=args.name, base_model=args.base_model,
        policy_name=args.policy_name,
        samples_per_round=args.samples,
        ood_threshold=args.ood_threshold,
        obs_temperature=args.obs_temp,
    )
