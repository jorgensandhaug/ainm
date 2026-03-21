"""Replay-augmented cellwise LightGBM benchmark.

Trains on individual replay year-50 outcomes (3.8M cells) instead of just
ground truth probability distributions (64K cells). This is a 59x data increase.

Each replay gives one stochastic outcome per cell. Training on these one-hot
outcomes allows the tree model to implicitly learn the probability distribution
by averaging over many replays with different random seeds.

Usage:
    uv run python scripts/agent4_cellwise_replay_benchmark.py [--name NAME]
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np


def _load_replay_final_grids(
    replays_dir: Path,
    round_id: str,
    max_replays_per_seed: int = 100,
) -> dict[int, list[np.ndarray]]:
    from astar.student.predictor.gbx_cellwise import load_replay_final_grids
    return load_replay_final_grids(replays_dir, round_id, max_replays_per_seed)


def _collapse_replay_grid(grid: np.ndarray) -> np.ndarray:
    """Collapse internal codes to 6 scored classes."""
    from astar.core.terrain import collapse_internal_grid
    return collapse_internal_grid(grid)


def run_replay_augmented_benchmark(
    *,
    name: str = "agent4_cellwise_replay_lgb_v1",
    n_estimators: int = 500,
    max_depth: int = 8,
    learning_rate: float = 0.03,
    min_child_samples: int = 50,
    subsample: float = 0.7,
    colsample_bytree: float = 0.7,
    num_leaves: int = 63,
    max_replays_per_seed: int = 50,
    probability_floor: float = 0.01,
    temperature: float = 1.0,
) -> None:
    import lightgbm as lgb
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    # Find analyzed rounds with replays
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )
    print(f"Found {len(all_round_ids)} rounds with both analyses and replays")

    results: list[dict] = []
    fold_scores: list[float] = []
    fold_kls: list[float] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")

        fold_start = time.time()

        # Build training data from replay outcomes
        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []

        total_replay_count = 0
        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round

            # Load replays for this round
            replay_grids = _load_replay_final_grids(
                replays_dir, round_id, max_replays_per_seed=max_replays_per_seed,
            )

            for seed_index in range(round_detail.seeds_count):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, initial_state.settlements)
                h, w, f = feat.shape
                X_flat = feat.reshape(-1, f)

                seed_replays = replay_grids.get(seed_index, [])
                for replay_grid in seed_replays:
                    collapsed = collapse_internal_grid(replay_grid)
                    # Convert to one-hot
                    y_onehot = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                    for cls in range(CLASS_COUNT):
                        y_onehot[:, cls] = (collapsed.ravel() == cls).astype(np.float64)

                    X_parts.append(X_flat)
                    Y_parts.append(y_onehot)
                    total_replay_count += 1

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {total_replay_count} replays, {X_train.shape[0]} cells, {X_train.shape[1]} features")

        # Train per-class regressors
        models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                min_child_samples=min_child_samples,
                subsample=subsample,
                colsample_bytree=colsample_bytree,
                num_leaves=num_leaves,
                verbose=-1,
                n_jobs=8,
                random_state=42,
            )
            model.fit(X_train, Y_train[:, cls])
            models[cls] = model

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

            feat = build_cellwise_features(grid, initial_state.settlements)
            h, w, f = feat.shape
            X_eval = feat.reshape(-1, f)

            probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                pred = models[cls].predict(X_eval)
                probs[:, cls] = np.clip(pred, 0.0, 1.0)

            if temperature != 1.0:
                log_probs = np.log(np.maximum(probs, 1e-10))
                log_probs /= temperature
                probs = np.exp(log_probs)

            # Normalize
            row_sums = probs.sum(axis=1, keepdims=True)
            probs = probs / np.maximum(row_sums, 1e-10)
            probs = np.maximum(probs, probability_floor)
            row_sums = probs.sum(axis=1, keepdims=True)
            probs = probs / row_sums

            pred_tensor = probs.reshape(h, w, CLASS_COUNT)
            breakdown = score_prediction(gt, pred_tensor)
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

    print(f"\nPer-round scores:")
    for round_id, score, kl in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {round_id[:8]}... score={score:.4f} kl={kl:.6f}")

    # Compare against baselines
    print(f"\n{'='*60}")
    print("COMPARISON:")
    print(f"  Replay LightGBM (prior-only): score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  GT-only LightGBM (prior-only): score=66.50 kl=0.1499")
    print(f"  Historical bucket (prior-only): score=66.32 kl=0.1416")
    print(f"  query_residual_v11 (online):    score=79.39 kl=0.0780")
    print(f"{'='*60}")

    # Save results
    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "name": name,
        "model": "gbx_cellwise_replay_lgb_v1",
        "mode": "prior_only",
        "data_source": "replay_year50",
        "max_replays_per_seed": max_replays_per_seed,
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "learning_rate": learning_rate,
        "temperature": temperature,
        "probability_floor": probability_floor,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "total_replay_count": total_replay_count,
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", type=str, default="agent4_cellwise_replay_lgb_v1")
    parser.add_argument("--max-replays", type=int, default=50)
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.03)
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()

    run_replay_augmented_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        temperature=args.temperature,
    )
