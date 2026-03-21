"""Oracle ensemble: combine evidence LGB + query_residual predictions.

For each held-out round, train both models independently on the same
training data, then average their predictions at various weights.

This tests whether the two approaches are complementary.

Usage:
    uv run python scripts/agent4_oracle_ensemble.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def run_oracle_ensemble(
    *,
    name: str = "agent4_oracle_ensemble_v1",
    max_replays: int = 58,
    ev_replays: int = 15,
    n_estimators: int = 800,
    probability_floor: float = 0.01,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features, load_replay_final_grids
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

    # Also try getting the existing query_residual predictions from saved benchmarks
    # For simplicity, let's just compute the evidence model predictions and compare
    # against the existing champion benchmark artifacts

    fold_data: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Train evidence model
        X_parts, Y_parts = [], []
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            rdata = _load_replay_grids_and_settlements(replays_dir, round_id, max_per_seed=max_replays)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                obs_mask = _simulate_coverage_mask(h, w)
                items = rdata.get(si, [])
                step = ev_replays + 1
                for s in range(0, len(items) - step + 1, step):
                    eg = [items[s+j][0] for j in range(ev_replays)]
                    es = [items[s+j][1] for j in range(ev_replays)]
                    tg = items[s + ev_replays][0]
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
        models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=n_estimators, max_depth=8,
                learning_rate=0.02, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:, cls])
            models[cls] = m

        # Also train a replay-only prior (no evidence)
        prior_X_parts, prior_Y_parts = [], []
        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round
            rg = load_replay_final_grids(replays_dir, round_id, max_replays_per_seed=30)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, ist.settlements)
                h, w, f = feat.shape
                for g in rg.get(si, []):
                    collapsed = collapse_internal_grid(g)
                    yf = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
                    for c in range(CLASS_COUNT):
                        yf[:, c] = (collapsed.ravel() == c).astype(np.float64)
                    prior_X_parts.append(feat.reshape(-1, f))
                    prior_Y_parts.append(yf)
        prior_X = np.concatenate(prior_X_parts)
        prior_Y = np.concatenate(prior_Y_parts)
        prior_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=300, max_depth=6,
                learning_rate=0.05, min_child_samples=30, verbose=-1, n_jobs=4, random_state=42,
            )
            m.fit(prior_X, prior_Y[:, cls])
            prior_models[cls] = m

        # Evaluate
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)
        ho_data = _load_replay_grids_and_settlements(replays_dir, held_out_round, max_per_seed=ev_replays)

        seed_data = {}
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            # Evidence model prediction
            mf = build_cellwise_features(grid, ist.settlements)
            obs_mask = _simulate_coverage_mask(h, w)
            items = ho_data.get(si, [])
            if items:
                eg = [it[0] for it in items[:ev_replays]]
                es = [it[1] for it in items[:ev_replays]]
                ef = _build_evidence_features_v2(eg, es, obs_mask)
            else:
                ef = _build_evidence_features_v2([], None, np.zeros((h,w), dtype=bool))
            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            ev_probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                ev_probs[:, c] = np.clip(models[c].predict(Xe), 0.0, 1.0)
            ev_probs /= ev_probs.sum(axis=1, keepdims=True)
            ev_probs = ev_probs.reshape(h, w, CLASS_COUNT)

            # Prior-only prediction
            feat = build_cellwise_features(grid, ist.settlements)
            Xp = feat.reshape(-1, feat.shape[-1])
            pr_probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                pr_probs[:, c] = np.clip(prior_models[c].predict(Xp), 0.001, 1.0)
            pr_probs /= pr_probs.sum(axis=1, keepdims=True)
            pr_probs = pr_probs.reshape(h, w, CLASS_COUNT)

            seed_data[si] = {"ev": ev_probs, "prior": pr_probs, "gt": gt}

        # Score at various ensemble weights
        weights = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        for w_ev in weights:
            w_pr = 1.0 - w_ev
            scores = []
            for si, d in seed_data.items():
                blended = w_ev * d["ev"] + w_pr * d["prior"]
                blended = np.maximum(blended, probability_floor)
                blended /= blended.sum(axis=-1, keepdims=True)
                bd = score_prediction(d["gt"], blended)
                scores.append(bd.score)
            print(f"  w_ev={w_ev:.1f}: score={np.mean(scores):.4f}")

        # Best evidence-only score
        ev_only_scores = [score_prediction(d["gt"], np.maximum(d["ev"], probability_floor) / np.maximum(d["ev"], probability_floor).sum(axis=-1, keepdims=True)).score for d in seed_data.values()]
        print(f"  Evidence-only: {np.mean(ev_only_scores):.4f}")

        fold_data.append({"round_id": held_out_round})
        print(f"  Time: {time.time()-fold_start:.1f}s")

    print(f"\nTotal time: {time.time()-total_start:.1f}s")


if __name__ == "__main__":
    run_oracle_ensemble()
