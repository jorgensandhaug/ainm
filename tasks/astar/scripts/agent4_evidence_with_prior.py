"""Evidence LGB with prior-conditioned features.

Adds features that compare the observation with the model's own prior,
helping the model learn when to trust observations vs prior.

Uses the replay-only LGB as the prior (no evidence features), then
adds observation-vs-prior features to the evidence model.

Usage:
    uv run python scripts/agent4_evidence_with_prior.py
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


def _build_evidence_with_prior_features(
    replay_grids: list[np.ndarray],
    prior_probs: np.ndarray,
    observed_mask: np.ndarray,
    num_classes: int = 6,
) -> np.ndarray:
    """Build evidence + prior-comparison features."""
    from astar.core.terrain import collapse_internal_grid

    h, w = observed_mask.shape
    features: list[np.ndarray] = []
    obs_float = observed_mask.astype(np.float64)
    features.append(obs_float)
    features.append(np.full((h, w), float(len(replay_grids)) / 20.0, dtype=np.float64))

    if replay_grids:
        n_replays = len(replay_grids)
        class_freq = np.zeros((h, w, num_classes), dtype=np.float64)
        for rg in replay_grids:
            collapsed = collapse_internal_grid(rg)
            for cls in range(num_classes):
                class_freq[:, :, cls] += (collapsed == cls).astype(np.float64)
        class_freq /= n_replays

        # 1. Observed class frequencies
        for cls in range(num_classes):
            features.append(np.where(observed_mask, class_freq[:, :, cls], 0.0))

        # 2. Prior probabilities (from replay-only model)
        for cls in range(num_classes):
            features.append(prior_probs[:, :, cls])

        # 3. Observation-vs-prior residual (key new feature)
        for cls in range(num_classes):
            residual = np.where(observed_mask, class_freq[:, :, cls] - prior_probs[:, :, cls], 0.0)
            features.append(residual)

        # 4. Prior entropy (tells model how uncertain the prior is)
        prior_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(num_classes):
            p = prior_probs[:, :, cls]
            prior_entropy -= np.where(p > 0, p * np.log(p + 1e-10), 0.0)
        features.append(prior_entropy)

        # 5. Observed entropy
        obs_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(num_classes):
            f = class_freq[:, :, cls]
            obs_entropy -= np.where(f > 0, f * np.log(f + 1e-10), 0.0)
        features.append(np.where(observed_mask, obs_entropy, 0.0))

        # 6. Agreement score: how much does observation match prior argmax?
        prior_argmax = np.argmax(prior_probs, axis=-1)
        obs_argmax = np.zeros((h, w), dtype=np.int64)
        if n_replays == 1:
            obs_argmax = collapse_internal_grid(replay_grids[0]).astype(np.int64)
        else:
            obs_argmax = np.argmax(class_freq, axis=-1)
        agreement = np.where(observed_mask, (prior_argmax == obs_argmax).astype(np.float64), 0.5)
        features.append(agreement)

        # 7. Neighborhood evidence
        for radius in [1, 2, 3]:
            nbr_obs = _neighbor_sum_2d(obs_float, radius)
            for cls in range(num_classes):
                cls_map = np.where(observed_mask, class_freq[:, :, cls], 0.0)
                nbr_sum = _neighbor_sum_2d(cls_map, radius)
                frac = np.where(nbr_obs > 0, nbr_sum / nbr_obs, 0.0)
                features.append(frac)

            # Neighborhood residual
            for cls in range(num_classes):
                res_map = np.where(observed_mask, class_freq[:, :, cls] - prior_probs[:, :, cls], 0.0)
                nbr_res = _neighbor_sum_2d(res_map, radius)
                avg_res = np.where(nbr_obs > 0, nbr_res / nbr_obs, 0.0)
                features.append(avg_res)
    else:
        n_feats = 2 + 6 + 6 + 6 + 1 + 1 + 1 + 3 * (6 + 6)
        for _ in range(n_feats):
            features.append(np.zeros((h, w), dtype=np.float64))

    return np.stack(features, axis=-1)


def _simulate_coverage_mask(h: int, w: int) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    for vy in range(0, h, 15):
        for vx in range(0, w, 15):
            mask[vy:min(vy+15,h), vx:min(vx+15,w)] = True
    return mask


def run_evidence_with_prior(
    *,
    name: str = "agent4_evidence_prior_ev1_v1",
    max_replays: int = 58,
    serve_ev: int = 1,
    n_estimators: int = 800,
    max_depth: int = 8,
    probability_floor: float = 0.01,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features, load_replay_final_grids

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

    fold_scores, fold_kls = [], []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Step 1: Build replay-only prior models (no evidence features)
        prior_X_parts, prior_Y_parts = [], []
        replay_cache: dict[str, dict[int, list[np.ndarray]]] = {}
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            grids = load_replay_final_grids(replays_dir, round_id, max_replays_per_seed=max_replays)
            replay_cache[round_id] = grids
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, ist.settlements)
                h, w, f = feat.shape
                X_flat = feat.reshape(-1, f)
                for rg in grids.get(si, []):
                    collapsed = collapse_internal_grid(rg)
                    yf = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
                    for c in range(CLASS_COUNT):
                        yf[:, c] = (collapsed.ravel() == c).astype(np.float64)
                    prior_X_parts.append(X_flat)
                    prior_Y_parts.append(yf)

        prior_X = np.concatenate(prior_X_parts)
        prior_Y = np.concatenate(prior_Y_parts)
        prior_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=300, max_depth=6,
                learning_rate=0.05, min_child_samples=30, subsample=0.8,
                colsample_bytree=0.8, verbose=-1, n_jobs=4, random_state=42,
            )
            m.fit(prior_X, prior_Y[:, cls])
            prior_models[cls] = m

        # Helper to get prior predictions for a seed
        def get_prior(grid, settlements):
            feat = build_cellwise_features(grid, settlements)
            h, w, f = feat.shape
            Xe = feat.reshape(-1, f)
            probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                probs[:, c] = np.clip(prior_models[c].predict(Xe), 0.001, 1.0)
            probs /= probs.sum(axis=1, keepdims=True)
            return probs.reshape(h, w, CLASS_COUNT)

        # Step 2: Build evidence+prior training data with mixed evidence
        X_parts, Y_parts = [], []
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            grids_by_seed = replay_cache[round_id]
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs_mask = _simulate_coverage_mask(h, w)
                prior = get_prior(grid, ist.settlements)

                seed_grids = grids_by_seed.get(si, [])
                if len(seed_grids) < 2:
                    continue

                used = 0
                while used + 2 <= len(seed_grids):
                    ev = min(rng.choice(evidence_levels), len(seed_grids) - used - 1)
                    if ev < 1: break
                    ev_grids = seed_grids[used:used+ev]
                    target = seed_grids[used+ev]
                    used += ev + 1

                    ef = _build_evidence_with_prior_features(ev_grids, prior, obs_mask)
                    combined = np.concatenate([mf, ef], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    tc = collapse_internal_grid(target)
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

        # Evaluate
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)
        ho_replays = load_replay_final_grids(replays_dir, held_out_round, max_replays_per_seed=serve_ev)

        seed_scores, seed_kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            prior = get_prior(grid, ist.settlements)
            obs_mask = _simulate_coverage_mask(h, w)

            grids = ho_replays.get(si, [])
            if grids:
                ef = _build_evidence_with_prior_features(grids[:serve_ev], prior, obs_mask)
            else:
                ef = _build_evidence_with_prior_features([], prior, np.zeros((h,w), dtype=bool))

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
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time()-fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    print(f"\n{'='*60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f} (serve_ev={serve_ev})")
    print(f"{'='*60}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "serve_ev": serve_ev,
        "mean_score": mean_score, "mean_weighted_kl": mean_kl,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_evidence_prior_ev1_v1")
    parser.add_argument("--serve-ev", type=int, default=1)
    args = parser.parse_args()
    run_evidence_with_prior(name=args.name, serve_ev=args.serve_ev)
