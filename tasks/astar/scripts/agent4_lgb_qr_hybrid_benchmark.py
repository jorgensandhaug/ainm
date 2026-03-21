"""Hybrid LightGBM prior + query_residual online correction.

Replace the historical bucket prior in query_residual with a replay-trained
LightGBM prior. Then use the same online evidence blending mechanism
(exact observed counts with shrinkage) that made query_residual strong.

This tests whether a better prior improves the online model.

Usage:
    uv run python scripts/agent4_lgb_qr_hybrid_benchmark.py
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np


def run_hybrid_benchmark(
    *,
    name: str = "agent4_lgb_qr_hybrid_v1",
    max_replays_per_seed: int = 30,
    n_estimators: int = 500,
    max_depth: int = 8,
    learning_rate: float = 0.03,
    probability_floor: float = 0.01,
    beta_min: float = 6.0,
    beta_scale: float = 24.0,
    temperature: float = 1.0,
) -> None:
    import lightgbm as lgb
    from astar.core.score import entropy_map, score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import (
        build_cellwise_features,
        load_replay_final_grids,
    )

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )
    print(f"Found {len(all_round_ids)} rounds")

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    all_results: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Build replay-augmented per-class regressors
        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []

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
                    X_parts.append(X_flat)
                    Y_parts.append(Y_flat)

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells")

        models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                min_child_samples=50,
                subsample=0.7,
                colsample_bytree=0.7,
                num_leaves=63,
                verbose=-1,
                n_jobs=8,
                random_state=42,
            )
            model.fit(X_train, Y_train[:, cls])
            models[cls] = model

        # Evaluate with online evidence blending (query_residual style)
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        held_out_replays = load_replay_final_grids(
            replays_dir, held_out_round, max_replays_per_seed=1,
        )

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            # LightGBM prior
            feat = build_cellwise_features(grid, initial_state.settlements)
            X_eval = feat.reshape(-1, feat.shape[-1])
            prior = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                prior[:, cls] = np.clip(models[cls].predict(X_eval), 0.001, 1.0)
            row_sums = prior.sum(axis=1, keepdims=True)
            prior = prior / np.maximum(row_sums, 1e-10)
            prior = prior.reshape(h, w, CLASS_COUNT)

            # Simulate online evidence: observe most cells via replay
            seed_replays = held_out_replays.get(seed_index, [])
            if seed_replays:
                obs_grid = seed_replays[0]
                obs_collapsed = collapse_internal_grid(obs_grid)
                obs_mask = np.ones((h, w), dtype=bool)  # coverage policy observes ~all cells

                # query_residual-style blending:
                # For each observed cell, blend exact observed class with prior
                # using Beta-distribution shrinkage
                final_pred = prior.copy()
                for y in range(h):
                    for x in range(w):
                        if obs_mask[y, x]:
                            obs_cls = int(obs_collapsed[y, x])
                            # Observed frequency: 1 observation
                            obs_freq = np.zeros(CLASS_COUNT, dtype=np.float64)
                            obs_freq[obs_cls] = 1.0

                            # Beta-distribution shrinkage toward prior
                            # effective_count = beta_min + beta_scale * prior_entropy
                            cell_entropy = 0.0
                            for c in range(CLASS_COUNT):
                                if prior[y, x, c] > 0:
                                    cell_entropy -= prior[y, x, c] * np.log(prior[y, x, c])
                            effective_count = beta_min + beta_scale * cell_entropy

                            # Posterior: weighted average of prior and observation
                            # weight_obs = 1 / (1 + effective_count)
                            weight_obs = 1.0 / (1.0 + effective_count)
                            blended = (1.0 - weight_obs) * prior[y, x] + weight_obs * obs_freq
                            final_pred[y, x] = blended
            else:
                final_pred = prior

            # Temperature
            if temperature != 1.0:
                log_p = np.log(np.maximum(final_pred, 1e-10))
                log_p /= temperature
                final_pred = np.exp(log_p)
                final_pred /= final_pred.sum(axis=-1, keepdims=True)

            # Floor
            final_pred = np.maximum(final_pred, probability_floor)
            final_pred /= final_pred.sum(axis=-1, keepdims=True)

            breakdown = score_prediction(gt, final_pred)
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
    total_time = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'='*60}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")
    print(f"\nCOMPARISON:")
    print(f"  LGB+QR hybrid (online):          score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  Replay LGB (prior-only):         score=66.74  kl=0.150")
    print(f"  query_residual_v11 (online):     score=79.39  kl=0.078")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "beta_min": beta_min,
        "beta_scale": beta_scale,
        "temperature": temperature,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_lgb_qr_hybrid_v1")
    parser.add_argument("--max-replays", type=int, default=30)
    parser.add_argument("--beta-min", type=float, default=6.0)
    parser.add_argument("--beta-scale", type=float, default=24.0)
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()

    run_hybrid_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        beta_min=args.beta_min,
        beta_scale=args.beta_scale,
        temperature=args.temperature,
    )
