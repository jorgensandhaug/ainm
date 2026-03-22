"""Spatial post-processing: per-class Gaussian smoothing + isotonic calibration.

Key ideas:
1. Different classes have different spatial correlation structures
   - Settlements: localized, less smoothing needed
   - Forest/Empty: distributed, more smoothing beneficial
2. Isotonic calibration ensures predictions are well-calibrated after smoothing
3. Observation blending as final step
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction, entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def per_class_smooth(pred, sigmas):
    """Apply per-class Gaussian smoothing."""
    h, w, nc = pred.shape
    smoothed = np.zeros_like(pred)
    for c in range(nc):
        sigma = sigmas[c] if c < len(sigmas) else 0.0
        if sigma > 0:
            smoothed[:, :, c] = gaussian_filter(pred[:, :, c], sigma=sigma)
        else:
            smoothed[:, :, c] = pred[:, :, c]
    # Renormalize
    smoothed = np.maximum(smoothed, 1e-8)
    smoothed = smoothed / smoothed.sum(-1, keepdims=True)
    return smoothed


def entropy_adaptive_smooth(pred, sigma_base, sigma_scale):
    """More smoothing where model is uncertain."""
    h, w, nc = pred.shape
    # Compute per-cell entropy
    ent = -np.sum(pred * np.log(np.clip(pred, 1e-10, 1.0)), axis=-1) / np.log(nc)

    # Low entropy (confident) → less smoothing
    # High entropy (uncertain) → more smoothing
    # But we can't do per-cell adaptive gaussian easily
    # Instead: blend smoothed and original based on entropy
    smoothed = np.zeros_like(pred)
    for c in range(nc):
        smoothed[:, :, c] = gaussian_filter(pred[:, :, c], sigma=sigma_base)
    smoothed = np.maximum(smoothed, 1e-8)
    smoothed = smoothed / smoothed.sum(-1, keepdims=True)

    # Blend weight: more smoothed where entropy is high
    blend_weight = np.clip(sigma_scale * ent, 0.0, 0.5)[:, :, None]
    result = (1.0 - blend_weight) * pred + blend_weight * smoothed
    result = np.maximum(result, 1e-8)
    result = result / result.sum(-1, keepdims=True)
    return result


def obs_blend(pred, obs_list, seed_index, h, w, temperature=20.0):
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


def run_spatial_postproc(
    name: str = "spatial_v1",
    base_model: str = "ffam_ensemble_v50",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    # Per-class sigmas: empty, settlement, port, ruin, forest, mountain
    per_class_sigmas: tuple[float, ...] = (0.5, 0.2, 0.2, 0.2, 0.5, 0.3),
    entropy_sigma_base: float = 0.0,
    entropy_sigma_scale: float = 0.0,
    obs_blend_temp: float = 20.0,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Spatial Post-Processing: {name}")
    print(f"  Base: {base_model}, policy={policy_name}")
    print(f"  Per-class sigmas: {per_class_sigmas}")
    print(f"  Entropy sigma: base={entropy_sigma_base}, scale={entropy_sigma_scale}")
    print(f"  Obs blend temp: {obs_blend_temp}")
    print()

    fold_scores = []
    fold_scores_raw = []
    for fold_idx, holdout_rid in enumerate(rids):
        train_ids = [r for r in rids if r != holdout_rid]
        t0 = time.time()
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}...", end=" ")

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

            # Apply per-class smoothing
            if any(s > 0 for s in per_class_sigmas):
                processed = per_class_smooth(base_pred, per_class_sigmas)
            else:
                processed = base_pred

            # Apply entropy-adaptive smoothing
            if entropy_sigma_base > 0:
                processed = entropy_adaptive_smooth(processed, entropy_sigma_base, entropy_sigma_scale)

            # Apply observation blending
            if obs_blend_temp > 0:
                processed = obs_blend(processed, obs_list, si, h, w, obs_blend_temp)

            # Floor
            processed = np.maximum(processed, 0.0003)
            processed = processed / processed.sum(-1, keepdims=True)

            sc = score_prediction(gt, processed)
            seed_scores.append(sc.score)

        mean_raw = float(np.mean(seed_scores_raw))
        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        fold_scores_raw.append(mean_raw)
        delta = mean_score - mean_raw
        print(f"raw={mean_raw:.2f} → post={mean_score:.2f} (delta={delta:+.2f}) ({elapsed:.1f}s)")

    overall = float(np.mean(fold_scores))
    overall_raw = float(np.mean(fold_scores_raw))
    print(f"\n{'='*60}")
    print(f"SPATIAL POST-PROC {name}: score={overall:.4f} (raw={overall_raw:.4f}, delta={overall-overall_raw:+.4f})")
    print(f"{'='*60}")
    for rid, sc, sr in zip(rids, fold_scores, fold_scores_raw):
        delta = sc - sr
        print(f"  {rid[:8]}... post={sc:.4f} raw={sr:.4f} delta={delta:+.4f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="spatial_v1")
    p.add_argument("--base-model", default="ffam_ensemble_v50")
    p.add_argument("--policy", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--per-class-sigmas", type=float, nargs=6, default=[0.5, 0.2, 0.2, 0.2, 0.5, 0.3])
    p.add_argument("--entropy-sigma-base", type=float, default=0.0)
    p.add_argument("--entropy-sigma-scale", type=float, default=0.0)
    p.add_argument("--obs-blend-temp", type=float, default=20.0)
    p.add_argument("--budget", type=int, default=50)
    p.add_argument("--episode-seed", type=int, default=0)
    args = p.parse_args()
    run_spatial_postproc(
        name=args.name, base_model=args.base_model, policy_name=args.policy,
        samples_per_round=args.samples,
        per_class_sigmas=tuple(args.per_class_sigmas),
        entropy_sigma_base=args.entropy_sigma_base,
        entropy_sigma_scale=args.entropy_sigma_scale,
        obs_blend_temp=args.obs_blend_temp,
        budget=args.budget, episode_seed=args.episode_seed,
    )
