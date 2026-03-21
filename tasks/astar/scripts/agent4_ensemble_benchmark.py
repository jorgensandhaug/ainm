"""Ensemble of replay-LightGBM + ground-truth LightGBM + historical bucket prior.

Test if combining multiple prior-only predictors gives a stronger base.
Then combine with online evidence using the evidence LightGBM approach.

This tests the handoff's Phase H: ensemble and calibration.

Usage:
    uv run python scripts/agent4_ensemble_benchmark.py
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np


def run_ensemble_benchmark(
    *,
    name: str = "agent4_ensemble_priors_v1",
    max_replays_per_seed: int = 30,
    n_estimators: int = 500,
    max_depth_replay: int = 8,
    max_depth_gt: int = 6,
    probability_floor: float = 0.01,
    w_replay: float = 0.4,
    w_gt: float = 0.3,
    w_bucket: float = 0.3,
) -> None:
    """Ensemble of three prior-only predictors."""
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import (
        build_cellwise_features,
        load_replay_final_grids,
    )
    from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )
    print(f"Found {len(all_round_ids)} rounds")
    print(f"Weights: replay={w_replay}, gt={w_gt}, bucket={w_bucket}")

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    all_results: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # 1. Train replay-augmented LGB
        X_replay_parts: list[np.ndarray] = []
        Y_replay_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            replay_grids = load_replay_final_grids(
                replays_dir, round_id, max_replays_per_seed=max_replays_per_seed,
            )
            for seed_index in range(round_detail.seeds_count):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, initial_state.settlements)
                h, w, f = feat.shape
                X_flat = feat.reshape(-1, f)
                for rg in replay_grids.get(seed_index, []):
                    collapsed = collapse_internal_grid(rg)
                    Y_flat = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                    for cls in range(CLASS_COUNT):
                        Y_flat[:, cls] = (collapsed.ravel() == cls).astype(np.float64)
                    X_replay_parts.append(X_flat)
                    Y_replay_parts.append(Y_flat)

        X_replay = np.concatenate(X_replay_parts, axis=0)
        Y_replay = np.concatenate(Y_replay_parts, axis=0)

        replay_models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators,
                max_depth=max_depth_replay,
                learning_rate=0.03,
                min_child_samples=50,
                subsample=0.7,
                colsample_bytree=0.7,
                num_leaves=63,
                verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X_replay, Y_replay[:, cls])
            replay_models[cls] = m

        # 2. Train GT-based LGB
        from astar.core.score import entropy_map
        X_gt_parts: list[np.ndarray] = []
        Y_gt_parts: list[np.ndarray] = []
        W_gt_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            for seed_index, ar in sorted(analyses.items()):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                feat = build_cellwise_features(grid, initial_state.settlements)
                h, w, f = feat.shape
                X_gt_parts.append(feat.reshape(-1, f))
                Y_gt_parts.append(gt.reshape(-1, CLASS_COUNT))
                ent = entropy_map(gt)
                W_gt_parts.append(np.maximum(ent.ravel(), 0.01))

        X_gt = np.concatenate(X_gt_parts, axis=0)
        Y_gt = np.concatenate(Y_gt_parts, axis=0)
        W_gt = np.concatenate(W_gt_parts, axis=0)

        gt_models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=300,
                max_depth=max_depth_gt,
                learning_rate=0.05,
                min_child_samples=20,
                subsample=0.8,
                colsample_bytree=0.8,
                verbose=-1, n_jobs=4, random_state=42,
            )
            m.fit(X_gt, Y_gt[:, cls], sample_weight=W_gt)
            gt_models[cls] = m

        # 3. Fit historical bucket prior
        bucket_pred = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths, round_ids=train_rounds,
        )

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            feat = build_cellwise_features(grid, initial_state.settlements)
            X_eval = feat.reshape(-1, feat.shape[-1])

            # Replay LGB prediction
            p_replay = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                p_replay[:, cls] = np.clip(replay_models[cls].predict(X_eval), 0.001, 1.0)
            p_replay /= p_replay.sum(axis=1, keepdims=True)

            # GT LGB prediction
            p_gt = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                p_gt[:, cls] = np.clip(gt_models[cls].predict(X_eval), 0.001, 1.0)
            p_gt /= p_gt.sum(axis=1, keepdims=True)

            # Bucket prior prediction
            features_bundle = None  # bucket doesn't use features
            bucket_bundle = bucket_pred.build_prediction_bundle(round_detail, features_bundle)
            p_bucket = np.asarray(bucket_bundle.predictions_by_seed[seed_index], dtype=np.float64).reshape(-1, CLASS_COUNT)

            # Ensemble
            ensemble = w_replay * p_replay + w_gt * p_gt + w_bucket * p_bucket
            ensemble = np.maximum(ensemble, probability_floor)
            ensemble /= ensemble.sum(axis=1, keepdims=True)

            pred = ensemble.reshape(h, w, CLASS_COUNT)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)
            all_results.append({
                "round_id": held_out_round,
                "seed_index": seed_index,
                "score": breakdown.score,
                "weighted_kl": breakdown.weighted_kl,
            })

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time()-fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}")
    print(f"{'='*60}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "weights": {"replay": w_replay, "gt": w_gt, "bucket": w_bucket},
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_ensemble_priors_v1")
    parser.add_argument("--max-replays", type=int, default=30)
    parser.add_argument("--w-replay", type=float, default=0.4)
    parser.add_argument("--w-gt", type=float, default=0.3)
    parser.add_argument("--w-bucket", type=float, default=0.3)
    args = parser.parse_args()

    run_ensemble_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        w_replay=args.w_replay,
        w_gt=args.w_gt,
        w_bucket=args.w_bucket,
    )
