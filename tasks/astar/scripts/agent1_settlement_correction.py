"""Settlement-aware correction for OOD rounds.

R7 analysis shows the model systematically underestimates settlements.
This script applies a targeted correction: when observations show
settlements but the model doesn't predict them, boost settlement probability.

Unlike general obs blending which hurts in-distribution rounds, this
correction is specific to the settlement class and only activates
when there's a clear disagreement.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.score import score_prediction
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


# Settlement class index
SETTLEMENT_IDX = CLASS_NAMES.index("settlement")
PORT_IDX = CLASS_NAMES.index("port")
EMPTY_IDX = CLASS_NAMES.index("empty")
FOREST_IDX = CLASS_NAMES.index("forest")


def settlement_correction(pred, obs_list, seed_index, h, w,
                          boost_threshold=0.15, boost_strength=0.4,
                          min_obs_count=1):
    """Correct settlement underestimation when observations disagree.

    For each cell:
    - Compute empirical settlement frequency from observations
    - If empirical settlement > boost_threshold but model settlement < empirical:
      Blend toward observations with strength boost_strength
    - Only apply when observation count >= min_obs_count
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

    emp = class_count / np.maximum(obs_count[:, :, np.newaxis], 1.0)
    result = pred.copy()

    # Find cells where correction should apply
    enough_obs = obs_count >= min_obs_count

    # Settlement correction: boost when obs shows settlement but model doesn't
    sett_empirical = emp[:, :, SETTLEMENT_IDX]
    sett_model = pred[:, :, SETTLEMENT_IDX]
    needs_sett_boost = enough_obs & (sett_empirical > boost_threshold) & (sett_model < sett_empirical)

    # Port correction: similar
    port_empirical = emp[:, :, PORT_IDX]
    port_model = pred[:, :, PORT_IDX]
    needs_port_boost = enough_obs & (port_empirical > boost_threshold) & (port_model < port_empirical)

    # Apply corrections in log-odds space
    if np.any(needs_sett_boost) or np.any(needs_port_boost):
        log_pred = np.log(np.clip(result, 1e-6, 1.0))
        log_emp = np.log(np.clip(emp, 1e-6, 1.0))

        # For settlement-needing cells
        if np.any(needs_sett_boost):
            blend_weight = boost_strength * np.clip(
                (sett_empirical - sett_model) / np.maximum(sett_empirical, 0.01),
                0.0, 1.0
            )
            for c in range(CLASS_COUNT):
                update = needs_sett_boost & (blend_weight > 0)
                if np.any(update):
                    log_pred[update, c] = (
                        (1.0 - blend_weight[update]) * log_pred[update, c]
                        + blend_weight[update] * log_emp[update, c]
                    )

        # For port-needing cells
        if np.any(needs_port_boost):
            blend_weight = boost_strength * np.clip(
                (port_empirical - port_model) / np.maximum(port_empirical, 0.01),
                0.0, 1.0
            )
            for c in range(CLASS_COUNT):
                update = needs_port_boost & (blend_weight > 0) & ~needs_sett_boost
                if np.any(update):
                    log_pred[update, c] = (
                        (1.0 - blend_weight[update]) * log_pred[update, c]
                        + blend_weight[update] * log_emp[update, c]
                    )

        result = np.exp(log_pred)
        result = result / np.maximum(result.sum(-1, keepdims=True), 1e-8)

    # Floor
    result = np.maximum(result, 0.0003)
    result = result / result.sum(-1, keepdims=True)
    return result


def run_settlement_correction(
    name: str = "sett_corr_v1",
    base_model: str = "ffam_ensemble_v50",
    policy_name: str = "exploration_r3_settle_heavy",
    samples_per_round: int = 6,
    boost_threshold: float = 0.15,
    boost_strength: float = 0.4,
    min_obs_count: int = 1,
    budget: int = 50,
    episode_seed: int = 0,
):
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    print(f"Settlement Correction: {name}", flush=True)
    print(f"  Base: {base_model}, policy={policy_name}", flush=True)
    print(f"  threshold={boost_threshold}, strength={boost_strength}, min_obs={min_obs_count}", flush=True)
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

            corrected = settlement_correction(
                base_pred, obs_list, si, h, w,
                boost_threshold=boost_threshold,
                boost_strength=boost_strength,
                min_obs_count=min_obs_count,
            )
            sc = score_prediction(gt, corrected)
            seed_scores.append(sc.score)

        mean_raw = float(np.mean(seed_scores_raw))
        mean_score = float(np.mean(seed_scores))
        elapsed = time.time() - t0
        fold_scores.append(mean_score)
        fold_scores_raw.append(mean_raw)
        delta = mean_score - mean_raw
        print(f"Fold {fold_idx+1}/8: {holdout_rid[:8]}... raw={mean_raw:.2f} → corr={mean_score:.2f} (delta={delta:+.2f}) ({elapsed:.1f}s)", flush=True)

    overall = float(np.mean(fold_scores))
    overall_raw = float(np.mean(fold_scores_raw))
    print(f"\n{'='*60}", flush=True)
    print(f"SETTLEMENT CORRECTION {name}: score={overall:.4f} (raw={overall_raw:.4f}, delta={overall-overall_raw:+.4f})", flush=True)
    print(f"{'='*60}", flush=True)
    for rid, sc, sr in zip(rids, fold_scores, fold_scores_raw):
        delta = sc - sr
        print(f"  {rid[:8]}... corr={sc:.4f} raw={sr:.4f} delta={delta:+.4f}", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="sett_corr_v1")
    p.add_argument("--base-model", default="ffam_ensemble_v50")
    p.add_argument("--policy", default="exploration_r3_settle_heavy")
    p.add_argument("--samples", type=int, default=6)
    p.add_argument("--boost-threshold", type=float, default=0.15)
    p.add_argument("--boost-strength", type=float, default=0.4)
    p.add_argument("--min-obs-count", type=int, default=1)
    p.add_argument("--budget", type=int, default=50)
    p.add_argument("--episode-seed", type=int, default=0)
    args = p.parse_args()
    run_settlement_correction(
        name=args.name, base_model=args.base_model, policy_name=args.policy,
        samples_per_round=args.samples, boost_threshold=args.boost_threshold,
        boost_strength=args.boost_strength, min_obs_count=args.min_obs_count,
        budget=args.budget, episode_seed=args.episode_seed,
    )
