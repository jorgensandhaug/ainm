"""Temperature sweep on the evidence v2 model without retraining.

Trains once, then evaluates at multiple temperatures.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def run_sweep() -> None:
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

    evidence_replays = 10
    max_replays = 30
    probability_floor = 0.01
    temperatures = [0.85, 0.90, 0.95, 1.00, 1.05, 1.10]

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: {held_out_round[:8]}... ===")

        # Train once
        X_parts, Y_parts = [], []
        for round_id in train_rounds:
            rr = read_round_record(paths, round_id)
            rd = rr.round
            replay_data = _load_replay_grids_and_settlements(replays_dir, round_id, max_per_seed=max_replays)
            for si in range(rd.seeds_count):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)
                items = replay_data.get(si, [])
                if len(items) < evidence_replays + 1:
                    continue
                obs_mask = _simulate_coverage_mask(h, w)
                step = evidence_replays + 1
                for s in range(0, len(items) - step + 1, step):
                    eg = [items[s+j][0] for j in range(evidence_replays)]
                    es = [items[s+j][1] for j in range(evidence_replays)]
                    tg = items[s + evidence_replays][0]
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
                objective="regression", n_estimators=800, max_depth=8,
                learning_rate=0.02, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X, Y[:, cls])
            models[cls] = m

        # Evaluate at each temperature
        rr = read_round_record(paths, held_out_round)
        rd = rr.round
        analyses = read_analysis_records(paths, held_out_round)
        ho_data = _load_replay_grids_and_settlements(replays_dir, held_out_round, max_per_seed=evidence_replays)

        # Get raw predictions once
        raw_preds = {}
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs_mask = _simulate_coverage_mask(h, w)
            items = ho_data.get(si, [])
            if items:
                eg = [it[0] for it in items[:evidence_replays]]
                es = [it[1] for it in items[:evidence_replays]]
                ef = _build_evidence_features_v2(eg, es, obs_mask)
            else:
                ef = _build_evidence_features_v2([], None, np.zeros((h,w), dtype=bool))
            combined = np.concatenate([mf, ef], axis=-1)
            Xe = combined.reshape(-1, combined.shape[-1])
            probs = np.zeros((h*w, CLASS_COUNT), dtype=np.float64)
            for c in range(CLASS_COUNT):
                probs[:, c] = np.clip(models[c].predict(Xe), 0.0, 1.0)
            raw_preds[si] = (probs.reshape(h,w,CLASS_COUNT), gt)

        for temp in temperatures:
            scores = []
            for si, (raw_p, gt) in raw_preds.items():
                p = raw_p.copy()
                if temp != 1.0:
                    lp = np.log(np.maximum(p, 1e-10))
                    lp /= temp
                    p = np.exp(lp)
                    p /= p.sum(axis=-1, keepdims=True)
                p = np.maximum(p, probability_floor)
                p /= p.sum(axis=-1, keepdims=True)
                bd = score_prediction(gt, p)
                scores.append(bd.score)
            mean_s = float(np.mean(scores))
            print(f"  temp={temp:.2f}: score={mean_s:.4f}")


if __name__ == "__main__":
    run_sweep()
