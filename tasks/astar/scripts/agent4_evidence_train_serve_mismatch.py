"""Train on multi-replay evidence, serve on single-replay evidence.

Tests whether training on cleaner (averaged) evidence creates a model
that works better even when serving with noisy (single) evidence.

Usage:
    uv run python scripts/agent4_evidence_train_serve_mismatch.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def run_mismatch_benchmark(
    *,
    name: str = "agent4_evidence_train15_serve1_v1",
    train_ev: int = 15,
    serve_ev: int = 1,
    max_replays: int = 58,
    n_estimators: int = 800,
    max_depth: int = 8,
    probability_floor: float = 0.01,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features
    from scripts.agent4_cellwise_evidence_v2 import (
        _build_evidence_features_v2,
        _load_replay_grids_and_settlements,
        _simulate_coverage_mask,
    )

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"

    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # TRAIN with train_ev replays
        X_parts, Y_parts = [], []
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            replay_data = _load_replay_grids_and_settlements(replays_dir, round_id, max_per_seed=max_replays)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                items = replay_data.get(si, [])
                if len(items) < train_ev + 1:
                    continue
                obs_mask = _simulate_coverage_mask(h, w)
                step = train_ev + 1
                for s in range(0, len(items) - step + 1, step):
                    eg = [items[s+j][0] for j in range(train_ev)]
                    es = [items[s+j][1] for j in range(train_ev)]
                    tg = items[s + train_ev][0]
                    ef = _build_evidence_features_v2(eg, es, obs_mask)
                    combined = np.concatenate([mf, ef], axis=-1)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    tc = collapse_internal_grid(tg)
                    yf = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
                    for c in range(CLASS_COUNT):
                        yf[:, c] = (tc.ravel() == c).astype(np.float64)
                    Y_parts.append(yf)

        X = np.concatenate(X_parts)
        Y = np.concatenate(Y_parts)
        print(f"  Training: {X.shape[0]} cells, {X.shape[1]} features (train_ev={train_ev})")

        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators, max_depth=max_depth,
                learning_rate=0.02, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:, cls])
            models[cls] = m

        # SERVE with serve_ev replays
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)
        ho_data = _load_replay_grids_and_settlements(replays_dir, held_out_round, max_per_seed=serve_ev)

        seed_scores, seed_kls = [], []
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs_mask = _simulate_coverage_mask(h, w)
            items = ho_data.get(si, [])
            if items:
                eg = [it[0] for it in items[:serve_ev]]
                es = [it[1] for it in items[:serve_ev]]
                ef = _build_evidence_features_v2(eg, es, obs_mask)
            else:
                ef = _build_evidence_features_v2([], None, np.zeros((h,w), dtype=bool))
            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                probs[:, c] = np.clip(models[c].predict(Xe), 0.0, 1.0)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)
            pred = probs.reshape(h, w, CLASS_COUNT)
            bd = score_prediction(gt, pred)
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
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}")
    print(f"train_ev={train_ev}, serve_ev={serve_ev}")
    print(f"{'='*60}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "train_ev": train_ev,
        "serve_ev": serve_ev,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_evidence_train15_serve1_v1")
    parser.add_argument("--train-ev", type=int, default=15)
    parser.add_argument("--serve-ev", type=int, default=1)
    args = parser.parse_args()
    run_mismatch_benchmark(name=args.name, train_ev=args.train_ev, serve_ev=args.serve_ev)
