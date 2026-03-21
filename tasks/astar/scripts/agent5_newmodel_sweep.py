#!/usr/bin/env python3
"""Sweep script for new cellknn/roundmatch models and hybrids with query_residual.

Usage:
    uv run python scripts/agent5_newmodel_sweep.py \
        --model greybox_cellknn \
        --policy coverage \
        --eval-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
        --eval-round-id c5cdf100-a876-4fb7-b5d8-757162c97989 \
        --eval-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb \
        --budget 50 \
        --episode-seed 0 \
        --samples-per-round 4 \
        --hybrid-weight 0.0 0.15 0.25 0.35 0.50 \
        --max-workers 3
"""

import argparse
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

# Ensure project root on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.core.prediction import PredictionBundle
from astar.core.score import score_prediction
from astar.features.geometry import compute_round_features
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset, load_synthetic_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import build_round_evidence_from_observations
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.interactive import build_online_predictor
from astar.student.predictor.query_residual import _stats_from_observations, _round_ids_with_analyses_and_replays
from astar.workflows.online_episode import run_online_episode


def evaluate_one_round(
    workspace_root: str,
    eval_round_id: str,
    model_name: str,
    policy_name: str,
    budget: int,
    episode_seed: int,
    samples_per_round: int,
    hybrid_weights: list[float],
):
    """Evaluate model on one held-out round, optionally as hybrid with query_residual."""
    paths = WorkspacePaths.from_root(workspace_root)
    all_round_ids = _round_ids_with_analyses_and_replays(paths)
    training_round_ids = [r for r in all_round_ids if r != eval_round_id]

    # Build the new model predictor
    new_predictor = build_online_predictor(
        model_name,
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )

    # Also build query_residual for hybrid blending
    qr_predictor = None
    if any(w < 1.0 for w in hybrid_weights):
        qr_predictor = build_online_predictor(
            "query_residual",
            paths=paths,
            historical_round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=1,
        )

    round_detail = read_round_record(paths, eval_round_id).round
    analyses = read_analysis_records(paths, eval_round_id)

    results = {}
    for weight in hybrid_weights:
        # Run online episode with the new model
        episode_result = run_online_episode(
            paths=paths,
            round_detail=round_detail,
            predictor=new_predictor,
            policy_name=policy_name,
            budget=budget,
            episode_seed=episode_seed,
        )

        if weight == 1.0 or qr_predictor is None:
            # Pure new model
            bundle = episode_result.prediction_bundle
        else:
            # Run QR with same episode
            qr_result = run_online_episode(
                paths=paths,
                round_detail=round_detail,
                predictor=qr_predictor,
                policy_name=policy_name,
                budget=budget,
                episode_seed=episode_seed,
            )
            # Blend predictions
            new_preds = episode_result.prediction_bundle.predictions_by_seed
            qr_preds = qr_result.prediction_bundle.predictions_by_seed
            blended = {}
            for seed_idx in new_preds:
                blended[seed_idx] = apply_probability_floor(
                    weight * np.asarray(new_preds[seed_idx]) + (1.0 - weight) * np.asarray(qr_preds[seed_idx]),
                    0.01,
                )
            bundle = PredictionBundle(
                round_id=eval_round_id,
                model_name=f"hybrid_{model_name}_qr_w{weight:.2f}",
                predictions_by_seed=blended,
            )

        # Score
        seed_scores = []
        for seed_index, analysis in analyses.items():
            gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            pred = np.asarray(bundle.predictions_by_seed[seed_index], dtype=np.float64)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)

        mean_score = float(np.mean(seed_scores))
        results[weight] = mean_score
        print(
            f"  round={eval_round_id[:8]}  weight={weight:.2f}  "
            f"mean_score={mean_score:.4f}",
            flush=True,
        )

    return eval_round_id, results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--policy", default="coverage")
    parser.add_argument("--eval-round-id", action="append", default=[])
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--episode-seed", type=int, default=0)
    parser.add_argument("--samples-per-round", type=int, default=4)
    parser.add_argument("--hybrid-weight", type=float, nargs="+", default=[1.0])
    parser.add_argument("--max-workers", type=int, default=1)
    args = parser.parse_args()

    workspace_root = str(Path.cwd())

    if not args.eval_round_id:
        # Default hard slice
        args.eval_round_id = [
            "36e581f1-73f8-453f-ab98-cbe3052b701b",
            "c5cdf100-a876-4fb7-b5d8-757162c97989",
            "f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb",
        ]

    print(f"Model: {args.model}", flush=True)
    print(f"Policy: {args.policy}", flush=True)
    print(f"Hybrid weights: {args.hybrid_weight}", flush=True)
    print(f"Eval rounds: {len(args.eval_round_id)}", flush=True)
    print("---", flush=True)

    all_results: dict[str, dict[float, float]] = {}

    if args.max_workers <= 1:
        for round_id in args.eval_round_id:
            rid, res = evaluate_one_round(
                workspace_root, round_id, args.model, args.policy,
                args.budget, args.episode_seed, args.samples_per_round,
                args.hybrid_weight,
            )
            all_results[rid] = res
    else:
        with ProcessPoolExecutor(max_workers=args.max_workers) as executor:
            futures = {
                executor.submit(
                    evaluate_one_round,
                    workspace_root, round_id, args.model, args.policy,
                    args.budget, args.episode_seed, args.samples_per_round,
                    args.hybrid_weight,
                ): round_id
                for round_id in args.eval_round_id
            }
            for future in as_completed(futures):
                rid, res = future.result()
                all_results[rid] = res

    # Summary
    print("\n=== SUMMARY ===", flush=True)
    for weight in args.hybrid_weight:
        scores = [all_results[r][weight] for r in args.eval_round_id if r in all_results]
        if scores:
            mean = float(np.mean(scores))
            print(f"  weight={weight:.2f}  mean_score={mean:.4f}", flush=True)


if __name__ == "__main__":
    main()
