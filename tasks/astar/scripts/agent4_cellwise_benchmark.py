"""Quick LOO benchmark for the new cellwise LightGBM predictor family.

Usage:
    uv run python scripts/agent4_cellwise_benchmark.py [--jobs N] [--name NAME]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import sys


def run_loo_benchmark(
    *,
    jobs: int = 1,
    name: str = "agent4_cellwise_lgb_loo_v1",
    n_estimators: int = 300,
    max_depth: int = 6,
    learning_rate: float = 0.05,
    temperature: float = 1.0,
    probability_floor: float = 0.01,
    use_entropy_weights: bool = True,
) -> None:
    from astar.core.score import score_prediction
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import CellwiseLGBPredictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)

    # Find all analyzed rounds
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
    )
    print(f"Found {len(all_round_ids)} analyzed rounds")

    results: list[dict] = []
    fold_scores: list[float] = []
    fold_kls: list[float] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        print(f"  Training on {len(train_rounds)} rounds")

        fold_start = time.time()

        # Train
        predictor = CellwiseLGBPredictor.fit_from_workspace(
            paths,
            round_ids=train_rounds,
            probability_floor=probability_floor,
            temperature=temperature,
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            use_entropy_weights=use_entropy_weights,
        )

        # Evaluate on held-out round
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)

            pred = predictor.predict_seed(grid, initial_state.settlements)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)

            results.append({
                "round_id": held_out_round,
                "seed_index": seed_index,
                "score": breakdown.score,
                "weighted_kl": breakdown.weighted_kl,
            })

        fold_mean_score = float(np.mean(seed_scores))
        fold_mean_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_mean_score)
        fold_kls.append(fold_mean_kl)
        fold_time = time.time() - fold_start

        print(f"  Score: {fold_mean_score:.4f}  KL: {fold_mean_kl:.6f}  Time: {fold_time:.1f}s")

    total_time = time.time() - total_start
    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'='*60}")

    # Per-round breakdown
    print(f"\nPer-round scores:")
    for round_id, score, kl in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {round_id[:8]}... score={score:.4f} kl={kl:.6f}")

    # Save results
    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "name": name,
        "model": "gbx_cellwise_lgb_v1",
        "mode": "prior_only",
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "learning_rate": learning_rate,
        "temperature": temperature,
        "probability_floor": probability_floor,
        "use_entropy_weights": use_entropy_weights,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "rounds": len(all_round_ids),
        "seeds": len(results),
        "per_fold": [
            {"round_id": r, "score": s, "kl": k}
            for r, s, k in zip(all_round_ids, fold_scores, fold_kls)
        ],
        "per_seed": results,
    }
    (output_dir / "results.json").write_text(json.dumps(summary, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


def run_hyperparameter_sweep(
    *,
    jobs: int = 1,
    base_name: str = "agent4_cellwise_lgb_sweep",
) -> None:
    """Run a grid of hyperparameter settings in sequence."""
    configs = [
        # Baseline
        {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "tag": "base"},
        # More trees
        {"n_estimators": 500, "max_depth": 6, "learning_rate": 0.05, "tag": "500trees"},
        # Deeper trees
        {"n_estimators": 300, "max_depth": 8, "learning_rate": 0.05, "tag": "deep8"},
        # Shallower trees, more iterations
        {"n_estimators": 500, "max_depth": 4, "learning_rate": 0.03, "tag": "shallow"},
        # Large ensemble
        {"n_estimators": 800, "max_depth": 5, "learning_rate": 0.03, "tag": "large"},
        # Temperature sweep
        {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "temperature": 0.9, "tag": "temp09"},
        {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "temperature": 1.1, "tag": "temp11"},
        # No entropy weighting
        {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "use_entropy_weights": False, "tag": "noweight"},
    ]

    all_results = []
    for cfg in configs:
        tag = cfg.pop("tag")
        run_name = f"{base_name}_{tag}"
        print(f"\n{'#'*60}")
        print(f"# Running: {run_name}")
        print(f"# Config: {cfg}")
        print(f"{'#'*60}")
        try:
            run_loo_benchmark(jobs=jobs, name=run_name, **cfg)
            # Read back results
            from astar.infra.artifacts.paths import WorkspacePaths
            paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
            result_path = paths.root / "data" / "artifacts" / "runs" / run_name / "results.json"
            if result_path.exists():
                result = json.loads(result_path.read_text())
                all_results.append({
                    "tag": tag,
                    "score": result["mean_score"],
                    "kl": result["mean_weighted_kl"],
                    **cfg,
                })
        except Exception as e:
            print(f"  FAILED: {e}")
            all_results.append({"tag": tag, "score": 0, "kl": 999, "error": str(e)})

    # Print summary
    print(f"\n{'='*60}")
    print("SWEEP SUMMARY")
    print(f"{'='*60}")
    all_results.sort(key=lambda x: -x.get("score", 0))
    for r in all_results:
        print(f"  {r.get('tag', '?'):12s}: score={r.get('score', 0):.4f} kl={r.get('kl', 999):.6f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--name", type=str, default="agent4_cellwise_lgb_loo_v1")
    parser.add_argument("--sweep", action="store_true", help="Run hyperparameter sweep")
    parser.add_argument("--n-estimators", type=int, default=300)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()

    if args.sweep:
        run_hyperparameter_sweep(jobs=args.jobs)
    else:
        run_loo_benchmark(
            jobs=args.jobs,
            name=args.name,
            n_estimators=args.n_estimators,
            max_depth=args.max_depth,
            learning_rate=args.learning_rate,
            temperature=args.temperature,
        )
