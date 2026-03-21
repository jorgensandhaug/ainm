"""Evidence-augmented cellwise LightGBM: a unified model.

KEY RADICAL IDEA: Instead of separate prior + Bayesian update,
train a SINGLE model that takes BOTH map features AND observed evidence
features as input. The model learns to combine them optimally.

For training:
- Use replay year-50 outcomes as labels
- Simulate online observation patterns (which cells would be observed)
- Add evidence features: observed class of nearby cells, neighborhood
  summaries from observations, etc.
- Train LightGBM on the combined feature set

At test time:
- For cells with observations: evidence features are populated
- For cells without: evidence features encode neighborhood observations
- The model learns the correct weighting implicitly

This is fundamentally different from prior + update because:
1. The model can learn NONLINEAR interactions between map features and evidence
2. Spatial propagation happens through neighborhood evidence features
3. No need for calibration parameters (beta, temperature, etc.)

Usage:
    uv run python scripts/agent4_cellwise_evidence_benchmark.py
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np


def _build_evidence_features(
    observed_grid: np.ndarray | None,
    observed_mask: np.ndarray,
    num_classes: int = 6,
) -> np.ndarray:
    """Build evidence features for each cell from observed data.

    Returns (H, W, F_evidence) array.
    """
    from astar.core.terrain import collapse_internal_grid

    h, w = observed_mask.shape
    features: list[np.ndarray] = []

    # 1. Observation mask
    obs_float = observed_mask.astype(np.float64)
    features.append(obs_float)

    if observed_grid is not None:
        collapsed = collapse_internal_grid(observed_grid)

        # 2. Observed class one-hot (zero for unobserved cells)
        for cls in range(num_classes):
            cls_observed = np.where(observed_mask, (collapsed == cls).astype(np.float64), 0.0)
            features.append(cls_observed)

        # 3. Neighborhood evidence at multiple scales
        for radius in [1, 2, 3, 5]:
            for cls in range(num_classes):
                cls_map = np.where(observed_mask, (collapsed == cls).astype(np.float64), 0.0)
                # Sum of observed neighbors in this class
                nbr_sum = _neighbor_sum_2d(cls_map, radius)
                features.append(nbr_sum)

            # Count of observed neighbors (for normalization)
            nbr_obs = _neighbor_sum_2d(obs_float, radius)
            features.append(nbr_obs)

            # Fraction of observed neighbors that are each class
            for cls in range(num_classes):
                cls_map = np.where(observed_mask, (collapsed == cls).astype(np.float64), 0.0)
                nbr_sum = _neighbor_sum_2d(cls_map, radius)
                frac = np.where(nbr_obs > 0, nbr_sum / nbr_obs, 0.0)
                features.append(frac)

        # 4. Observed settlement statistics from the replay
        # (these would come from settlement observations in a real online scenario)

    else:
        # No evidence — all zeros
        n_evidence = 1 + num_classes + 4 * (num_classes + 1 + num_classes)
        for _ in range(n_evidence):
            features.append(np.zeros((h, w), dtype=np.float64))

    return np.stack(features, axis=-1)


def _neighbor_sum_2d(arr: np.ndarray, radius: int) -> np.ndarray:
    """Sum over square neighborhood."""
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            sy = slice(max(0, -dy), min(h, h - dy))
            sx = slice(max(0, -dx), min(w, w - dx))
            ty = slice(max(0, dy), min(h, h + dy))
            tx = slice(max(0, dx), min(w, w + dx))
            out[ty, tx] += arr[sy, sx]
    return out


def _simulate_coverage_mask(h: int, w: int, viewport_size: int = 15) -> np.ndarray:
    """Simulate a coverage observation pattern (tile the map)."""
    mask = np.zeros((h, w), dtype=bool)
    for vy in range(0, h, viewport_size):
        for vx in range(0, w, viewport_size):
            vy_end = min(vy + viewport_size, h)
            vx_end = min(vx + viewport_size, w)
            mask[vy:vy_end, vx:vx_end] = True
    return mask


def run_evidence_benchmark(
    *,
    name: str = "agent4_cellwise_evidence_lgb_v1",
    n_estimators: int = 500,
    max_depth: int = 8,
    learning_rate: float = 0.03,
    max_replays_per_seed: int = 30,
    probability_floor: float = 0.01,
    observe_fraction: float = 0.85,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
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

        # Build training data
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
                h, w = grid.shape

                # Static map features
                map_feat = build_cellwise_features(grid, initial_state.settlements)

                seed_replays = replay_grids.get(seed_index, [])
                if len(seed_replays) < 2:
                    continue

                # For training: use one replay as "observed evidence",
                # another as the label
                # This simulates the online scenario where we observe one
                # stochastic outcome and need to predict the distribution
                for i in range(0, len(seed_replays) - 1, 2):
                    evidence_grid = seed_replays[i]
                    label_grid = seed_replays[i + 1]

                    # Simulate coverage mask
                    obs_mask = _simulate_coverage_mask(h, w)

                    # Evidence features from the "observed" replay
                    ev_feat = _build_evidence_features(evidence_grid, obs_mask)

                    # Combined features
                    combined = np.concatenate([map_feat, ev_feat], axis=-1)
                    X_flat = combined.reshape(-1, combined.shape[-1])

                    # Labels from the "target" replay (one-hot)
                    label_collapsed = collapse_internal_grid(label_grid)
                    Y_flat = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                    for cls in range(CLASS_COUNT):
                        Y_flat[:, cls] = (label_collapsed.ravel() == cls).astype(np.float64)

                    X_parts.append(X_flat)
                    Y_parts.append(Y_flat)

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

        # Train per-class models
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

        # Evaluate on held-out round
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        # Load ONE held-out replay per seed for simulating online evidence
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

            map_feat = build_cellwise_features(grid, initial_state.settlements)
            obs_mask = _simulate_coverage_mask(h, w)

            # Get evidence from one replay
            seed_replays = held_out_replays.get(seed_index, [])
            if seed_replays:
                ev_feat = _build_evidence_features(seed_replays[0], obs_mask)
            else:
                ev_feat = _build_evidence_features(None, np.zeros((h, w), dtype=bool))

            combined = np.concatenate([map_feat, ev_feat], axis=-1)
            X_eval = combined.reshape(-1, combined.shape[-1])

            probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                probs[:, cls] = np.clip(models[cls].predict(X_eval), 0.0, 1.0)

            # Normalize
            row_sums = probs.sum(axis=1, keepdims=True)
            probs = probs / np.maximum(row_sums, 1e-10)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)

            pred = probs.reshape(h, w, CLASS_COUNT)
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
    total_time = time.time() - total_start

    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'='*60}")
    print(f"\nPer-round:")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")
    print(f"\nCOMPARISON:")
    print(f"  Evidence LGB:                    score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  Replay LGB (prior-only):         score=66.74  kl=0.150")
    print(f"  query_residual_v11 (online):     score=79.39  kl=0.078")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_cellwise_evidence_lgb_v1")
    parser.add_argument("--max-replays", type=int, default=30)
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=8)
    args = parser.parse_args()

    run_evidence_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
    )
