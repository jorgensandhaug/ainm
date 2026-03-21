"""Mixed evidence quality training for robustness.

During training, randomly choose between 1, 3, 5, or 15 replays
for evidence. This teaches the model to handle varying evidence quality,
making it robust for live serving where only 1 observation is available.

Usage:
    uv run python scripts/agent4_evidence_mixed_training.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def _neighbor_sum_2d(arr: np.ndarray, radius: int) -> np.ndarray:
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


def _build_evidence_features_mixed(
    replay_grids: list[np.ndarray],
    observed_mask: np.ndarray,
    num_classes: int = 6,
) -> np.ndarray:
    """Build evidence features averaged over provided replay grids."""
    from astar.core.terrain import collapse_internal_grid

    h, w = observed_mask.shape
    features: list[np.ndarray] = []
    obs_float = observed_mask.astype(np.float64)
    features.append(obs_float)

    # Number of evidence replays as a feature (so model knows evidence quality)
    n_replays = len(replay_grids)
    features.append(np.full((h, w), float(n_replays) / 20.0, dtype=np.float64))

    if replay_grids:
        class_freq = np.zeros((h, w, num_classes), dtype=np.float64)
        for rg in replay_grids:
            collapsed = collapse_internal_grid(rg)
            for cls in range(num_classes):
                class_freq[:, :, cls] += (collapsed == cls).astype(np.float64)
        class_freq /= n_replays

        for cls in range(num_classes):
            features.append(np.where(observed_mask, class_freq[:, :, cls], 0.0))

        obs_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(num_classes):
            f = class_freq[:, :, cls]
            obs_entropy -= np.where(f > 0, f * np.log(f + 1e-10), 0.0)
        features.append(np.where(observed_mask, obs_entropy, 0.0))

        for radius in [1, 2, 3]:
            nbr_obs = _neighbor_sum_2d(obs_float, radius)
            features.append(nbr_obs)
            for cls in range(num_classes):
                cls_map = np.where(observed_mask, class_freq[:, :, cls], 0.0)
                nbr_sum = _neighbor_sum_2d(cls_map, radius)
                frac = np.where(nbr_obs > 0, nbr_sum / nbr_obs, 0.0)
                features.append(frac)
    else:
        n_ev = 1 + num_classes + 1 + 3 * (1 + num_classes)
        for _ in range(n_ev):
            features.append(np.zeros((h, w), dtype=np.float64))

    return np.stack(features, axis=-1)


def _simulate_coverage_mask(h: int, w: int) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    for vy in range(0, h, 15):
        for vx in range(0, w, 15):
            mask[vy:min(vy+15,h), vx:min(vx+15,w)] = True
    return mask


def _load_replay_grids(replays_dir: Path, round_id: str, max_per_seed: int) -> dict[int, list[np.ndarray]]:
    from astar.student.predictor.gbx_cellwise import load_replay_final_grids
    return load_replay_final_grids(replays_dir, round_id, max_per_seed)


def run_mixed_evidence_benchmark(
    *,
    name: str = "agent4_evidence_mixed_v1",
    max_replays: int = 58,
    n_estimators: int = 800,
    max_depth: int = 8,
    probability_floor: float = 0.01,
    serve_ev: int = 1,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    rng = np.random.RandomState(42)
    evidence_levels = [1, 3, 5, 10, 15]

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        X_parts, Y_parts = [], []
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            replay_grids = _load_replay_grids(replays_dir, round_id, max_per_seed=max_replays)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs_mask = _simulate_coverage_mask(h, w)

                grids = replay_grids.get(si, [])
                if len(grids) < 2:
                    continue

                # Create training pairs with mixed evidence quality
                used = 0
                while used + 2 <= len(grids):
                    # Randomly choose evidence level
                    ev_level = rng.choice(evidence_levels)
                    ev_level = min(ev_level, len(grids) - used - 1)
                    if ev_level < 1:
                        break

                    ev_grids_sample = grids[used:used + ev_level]
                    target_grid = grids[used + ev_level]
                    used += ev_level + 1

                    ef = _build_evidence_features_mixed(ev_grids_sample, obs_mask)
                    combined = np.concatenate([mf, ef], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))

                    tc = collapse_internal_grid(target_grid)
                    yf = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
                    for c in range(CLASS_COUNT):
                        yf[:, c] = (tc.ravel() == c).astype(np.float64)
                    Y_parts.append(yf)

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features")

        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators, max_depth=max_depth,
                learning_rate=0.02, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:, cls])
            models[cls] = m

        # Evaluate with serve_ev replays
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)
        ho_replays = _load_replay_grids(replays_dir, held_out_round, max_per_seed=serve_ev)

        seed_scores, seed_kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs_mask = _simulate_coverage_mask(h, w)

            grids = ho_replays.get(si, [])
            if grids:
                ef = _build_evidence_features_mixed(grids[:serve_ev], obs_mask)
            else:
                ef = _build_evidence_features_mixed([], np.zeros((h,w), dtype=bool))

            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                probs[:, c] = np.clip(models[c].predict(Xe), 0.0, 1.0)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)
            bd = score_prediction(gt, probs.reshape(h, w, CLASS_COUNT))
            seed_scores.append(bd.score)
            seed_kls.append(bd.weighted_kl)

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f} (serve_ev={serve_ev}) Time: {time.time()-fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")
    print(f"\nCOMPARISON:")
    print(f"  Mixed training, serve_ev={serve_ev}:  score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  Fixed ev1 training+serve:            score=69.70  kl=0.128")
    print(f"  Fixed ev15 training+serve:           score=83.06  kl=0.062")
    print(f"  query_residual_v11 champion:         score=79.39  kl=0.078")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "serve_ev": serve_ev,
        "evidence_levels": evidence_levels,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_evidence_mixed_serve1_v1")
    parser.add_argument("--serve-ev", type=int, default=1)
    args = parser.parse_args()
    run_mixed_evidence_benchmark(name=args.name, serve_ev=args.serve_ev)
