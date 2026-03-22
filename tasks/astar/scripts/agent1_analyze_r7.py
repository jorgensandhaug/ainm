"""Analyze what makes R7 hard for the model.

Compare the model's prediction vs ground truth for R7 to understand:
1. Which cells have the largest errors?
2. What's the error pattern? (systematic bias or random?)
3. How does the error relate to observation coverage?
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

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


def analyze_r7():
    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    rids = discover_historical_eval_round_ids(paths)
    oracle = SyntheticActiveOracle(paths=paths)

    r7_rid = "36e581f1-73f8-453f-ab98-cbe3052b701b"
    train_ids = [r for r in rids if r != r7_rid]

    print("=== Analyzing R7 (36e581f1) ===\n")

    # Build predictor
    pred_obj = build_online_predictor(
        "ffam_ensemble_v50", paths=paths, historical_round_ids=train_ids,
        policy_name="exploration_r3_settle_heavy", samples_per_round=6,
    )
    policy_obj = build_interactive_policy("exploration_r3_settle_heavy")

    ep = run_online_episode(
        oracle, round_id=r7_rid,
        predictor=pred_obj, policy=policy_obj,
        budget=50, episode_seed=0,
    )
    obs_list = list(ep.belief.observations)
    base_preds = ep.prediction_bundle.predictions_by_seed

    rd = read_round_record(paths, r7_rid)
    analysis = read_analysis_records(paths, r7_rid)

    print(f"Observations: {len(obs_list)} total")
    seed_obs_counts = {}
    for obs in obs_list:
        seed_obs_counts[obs.seed_index] = seed_obs_counts.get(obs.seed_index, 0) + 1
    print(f"Observations per seed: {seed_obs_counts}\n")

    # Analyze seed 0 in detail
    si = 0
    gt = np.asarray(analysis[si].analysis.ground_truth, dtype=np.float64)
    pred = np.asarray(base_preds[si], dtype=np.float64)
    h, w = gt.shape[:2]

    # Overall score
    sc = score_prediction(gt, pred)
    print(f"Seed 0 score: {sc.score:.4f}, weighted_kl: {sc.weighted_kl:.4f}")

    # Per-cell KL divergence
    kl_per_cell = np.sum(gt * np.log(np.clip(gt / np.clip(pred, 1e-10, 1.0), 1e-10, 100.0)), axis=-1)
    gt_entropy = entropy_map(gt)

    # Weighted KL per cell
    weighted_kl = kl_per_cell * gt_entropy

    # Find worst cells
    flat_idx = np.argsort(weighted_kl.ravel())[::-1]
    print(f"\nTop 10 worst cells (by entropy-weighted KL):")
    for rank, idx in enumerate(flat_idx[:10]):
        y, x = idx // w, idx % w
        print(f"  ({y},{x}): wkl={weighted_kl[y,x]:.4f}, kl={kl_per_cell[y,x]:.4f}, "
              f"ent={gt_entropy[y,x]:.4f}")
        print(f"    GT:   {[f'{gt[y,x,c]:.3f}' for c in range(CLASS_COUNT)]}")
        print(f"    Pred: {[f'{pred[y,x,c]:.3f}' for c in range(CLASS_COUNT)]}")

    # Observation coverage
    obs_count = np.zeros((h, w), dtype=np.float64)
    for obs in obs_list:
        if obs.seed_index != si:
            continue
        vp = obs.viewport
        vy_end = min(vp.y + vp.h, h)
        vx_end = min(vp.x + vp.w, w)
        obs_count[vp.y:vy_end, vp.x:vx_end] += 1.0

    observed = obs_count > 0
    print(f"\nObservation coverage (seed 0): {observed.mean()*100:.1f}% of cells observed")
    print(f"  Avg obs count for observed cells: {obs_count[observed].mean():.2f}")

    # Error by observation status
    obs_wkl = weighted_kl[observed].mean() if np.any(observed) else 0
    unobs_wkl = weighted_kl[~observed].mean() if np.any(~observed) else 0
    print(f"\nAvg weighted KL:")
    print(f"  Observed cells:   {obs_wkl:.4f}")
    print(f"  Unobserved cells: {unobs_wkl:.4f}")

    # Error by terrain type
    ist = rd.round.initial_states[si]
    grid = np.asarray(ist.grid, dtype=np.int64)
    collapsed = collapse_internal_grid(grid)
    for c in range(CLASS_COUNT):
        mask = collapsed == c
        if mask.any():
            avg_wkl = weighted_kl[mask].mean()
            count = mask.sum()
            print(f"  {CLASS_NAMES[c]:15s}: wkl={avg_wkl:.4f} ({count} cells)")

    # Compare R7 to training rounds
    print(f"\n=== R7 vs Training Rounds ===")
    for rid in train_ids:
        rd_train = read_round_record(paths, rid)
        analysis_train = read_analysis_records(paths, rid)

        # Build prediction using all OTHER training rounds
        other_train = [r for r in train_ids if r != rid]
        pred_obj_t = build_online_predictor(
            "ffam_ensemble_v50", paths=paths, historical_round_ids=other_train,
            policy_name="exploration_r3_settle_heavy", samples_per_round=6,
        )
        ep_t = run_online_episode(
            oracle, round_id=rid,
            predictor=pred_obj_t, policy=policy_obj,
            budget=50, episode_seed=0,
        )
        preds_t = ep_t.prediction_bundle.predictions_by_seed
        scores_t = []
        for si_t, gt_t_analysis in sorted(analysis_train.items()):
            if si_t not in preds_t:
                continue
            gt_t = np.asarray(gt_t_analysis.analysis.ground_truth, dtype=np.float64)
            pred_t = np.asarray(preds_t[si_t], dtype=np.float64)
            scores_t.append(score_prediction(gt_t, pred_t).score)
        mean_score_t = float(np.mean(scores_t)) if scores_t else 0
        print(f"  R{rd_train.round.round_number} ({rid[:8]}): score={mean_score_t:.2f}")

    print(f"\n  R7 (36e581f1): score={sc.score:.2f}")


if __name__ == "__main__":
    analyze_r7()
