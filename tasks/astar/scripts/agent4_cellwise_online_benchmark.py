"""Combined cellwise LightGBM + online evidence benchmark.

The key insight: query_residual's power comes from observing year-50 cells
via online queries and blending with a prior. If we replace the prior with
a better one (replay-trained LightGBM), the online model should improve.

This script:
1. Trains a replay-augmented LightGBM prior on training rounds
2. For the held-out round, uses the historical benchmark's online simulation
   to observe year-50 cells
3. Blends LightGBM prior with observed cell evidence (Bayesian update)

Usage:
    uv run python scripts/agent4_cellwise_online_benchmark.py [--name NAME]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np


def _bayesian_update_dirichlet(
    prior_probs: np.ndarray,
    observed_class: int,
    beta: float = 6.0,
    num_classes: int = 6,
) -> np.ndarray:
    """Bayesian update with Dirichlet prior centered on the model's prediction.

    prior_probs: (num_classes,) model's prior probability
    observed_class: the class observed at this cell
    beta: concentration parameter (higher = trust prior more)
    """
    # Dirichlet pseudo-counts from prior
    alpha = prior_probs * beta
    # Add observation
    alpha[observed_class] += 1.0
    # Posterior mean
    return alpha / alpha.sum()


def run_online_benchmark(
    *,
    name: str = "agent4_cellwise_online_lgb_v1",
    n_estimators: int = 500,
    max_depth: int = 8,
    learning_rate: float = 0.03,
    max_replays_per_seed: int = 30,
    probability_floor: float = 0.01,
    beta: float = 6.0,
    prior_weight: float = 0.0,
    temperature: float = 1.0,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features
    from astar.student.predictor.gbx_cellwise import load_replay_final_grids as _load_replay_final_grids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    results: list[dict] = []
    fold_scores: list[float] = []
    fold_kls: list[float] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")

        fold_start = time.time()

        # Build training data from replay year-50 outcomes
        X_parts: list[np.ndarray] = []
        y_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            replay_grids = _load_replay_final_grids(
                replays_dir, round_id, max_replays_per_seed=max_replays_per_seed,
            )

            for seed_index in range(round_detail.seeds_count):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, initial_state.settlements)
                h, w, f = feat.shape
                X_flat = feat.reshape(-1, f)

                for replay_grid in replay_grids.get(seed_index, []):
                    collapsed = collapse_internal_grid(replay_grid)
                    labels = collapsed.ravel().astype(np.int32)
                    X_parts.append(X_flat)
                    y_parts.append(labels)

        X_train = np.concatenate(X_parts, axis=0)
        y_train = np.concatenate(y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells")

        # Train multiclass model
        model = lgb.LGBMClassifier(
            objective="multiclass",
            num_class=CLASS_COUNT,
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
        model.fit(X_train, y_train)

        # Evaluate on held-out round
        # Simulate online evidence: use replay outcomes as observed data
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        # Load held-out replays for simulating online evidence
        held_out_replays = _load_replay_final_grids(
            replays_dir, held_out_round, max_replays_per_seed=1,
        )

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            # Get model prior
            feat = build_cellwise_features(grid, initial_state.settlements)
            X_eval = feat.reshape(-1, feat.shape[-1])
            prior_probs = model.predict_proba(X_eval).reshape(h, w, CLASS_COUNT)

            # Simulate online evidence: observe cells via one replay
            observed_replay_grids = held_out_replays.get(seed_index, [])

            if observed_replay_grids:
                observed_grid = observed_replay_grids[0]
                observed_collapsed = collapse_internal_grid(observed_grid)

                # Simulate coverage-like query pattern:
                # Observe cells in 15x15 viewports across the map
                # Budget: ~9 queries per seed (45/5), each 15x15
                observed_mask = np.zeros((h, w), dtype=bool)
                viewport_size = 15
                # Simple coverage: tile the map
                for vy in range(0, h, viewport_size):
                    for vx in range(0, w, viewport_size):
                        vy_end = min(vy + viewport_size, h)
                        vx_end = min(vx + viewport_size, w)
                        observed_mask[vy:vy_end, vx:vx_end] = True

                # Bayesian update for observed cells
                updated_probs = prior_probs.copy()
                for y in range(h):
                    for x in range(w):
                        if observed_mask[y, x]:
                            obs_class = int(observed_collapsed[y, x])
                            updated_probs[y, x] = _bayesian_update_dirichlet(
                                prior_probs[y, x].copy(),
                                obs_class,
                                beta=beta,
                            )

                probs = updated_probs
            else:
                probs = prior_probs

            # Apply temperature
            if temperature != 1.0:
                log_p = np.log(np.maximum(probs, 1e-10))
                log_p /= temperature
                probs = np.exp(log_p)
                probs /= probs.sum(axis=-1, keepdims=True)

            # Floor and normalize
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=-1, keepdims=True)

            breakdown = score_prediction(gt, probs)
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

    print(f"\nCOMPARISON:")
    print(f"  Online LGB (Dirichlet beta={beta}): score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  query_residual_v11 (online):        score=79.39 kl=0.0780")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "name": name,
        "model": "gbx_cellwise_online_lgb_v1",
        "mode": "online_simulated",
        "beta": beta,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "per_fold": [{"round_id": r, "score": s, "kl": k} for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": results,
    }
    (output_dir / "results.json").write_text(json.dumps(summary, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", type=str, default="agent4_cellwise_online_lgb_v1")
    parser.add_argument("--max-replays", type=int, default=30)
    parser.add_argument("--beta", type=float, default=6.0)
    parser.add_argument("--temperature", type=float, default=1.0)
    args = parser.parse_args()

    run_online_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        beta=args.beta,
        temperature=args.temperature,
    )
