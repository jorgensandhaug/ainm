"""Sweep over coverage vs evidence quality tradeoff.

Tests what happens when we sacrifice coverage for more observations per cell.

Usage:
    uv run python scripts/agent4_partial_coverage_sweep.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def _neighbor_sum_2d(arr, radius):
    h, w = arr.shape
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0: continue
            sy, sx = slice(max(0,-dy), min(h,h-dy)), slice(max(0,-dx), min(w,w-dx))
            ty, tx = slice(max(0, dy), min(h,h+dy)), slice(max(0, dx), min(w,w+dx))
            out[ty, tx] += arr[sy, sx]
    return out


def _build_evidence(grids, mask, nc=6):
    from astar.core.terrain import collapse_internal_grid
    h, w = mask.shape
    feats = []
    obs = mask.astype(np.float64)
    feats.append(obs)
    feats.append(np.full((h,w), float(len(grids))/20.0))
    if grids:
        cf = np.zeros((h,w,nc), dtype=np.float64)
        for g in grids:
            c = collapse_internal_grid(g)
            for cls in range(nc):
                cf[:,:,cls] += (c == cls).astype(np.float64)
        cf /= len(grids)
        for cls in range(nc): feats.append(np.where(mask, cf[:,:,cls], 0.0))
        ent = np.zeros((h,w))
        for cls in range(nc):
            f = cf[:,:,cls]
            ent -= np.where(f>0, f*np.log(f+1e-10), 0)
        feats.append(np.where(mask, ent, 0))
        for r in [1,2,3]:
            no = _neighbor_sum_2d(obs, r)
            feats.append(no)
            for cls in range(nc):
                cm = np.where(mask, cf[:,:,cls], 0)
                ns = _neighbor_sum_2d(cm, r)
                feats.append(np.where(no>0, ns/no, 0))
    else:
        for _ in range(nc+1+3*(1+nc)): feats.append(np.zeros((h,w)))
    return np.stack(feats, axis=-1)


def _partial_mask(h, w, coverage_frac, rng):
    """Create a random partial observation mask."""
    mask = np.zeros((h, w), dtype=bool)
    vp = 15
    # Generate all possible viewport positions
    positions = [(vy, vx) for vy in range(0, h) for vx in range(0, w)
                 if vy + vp <= h and vx + vp <= w]
    rng.shuffle(positions)
    target_cells = int(h * w * coverage_frac)
    for vy, vx in positions:
        mask[vy:vy+vp, vx:vx+vp] = True
        if mask.sum() >= target_cells:
            break
    return mask


def run_sweep():
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

    # Configs: (evidence_replays, coverage_fraction, description)
    configs = [
        (1, 1.0, "ev1_full"),      # current single-obs full coverage
        (2, 0.60, "ev2_60pct"),     # 2 obs, 60% coverage
        (3, 0.40, "ev3_40pct"),     # 3 obs, 40% coverage
        (1, 0.60, "ev1_60pct"),     # single obs, 60% coverage (baseline)
        (2, 1.0, "ev2_full"),       # 2 obs, full coverage (oracle)
    ]

    rng = np.random.RandomState(42)

    for ev_replays, cov_frac, desc in configs:
        print(f"\n{'#'*60}")
        print(f"Config: {desc} (ev={ev_replays}, coverage={cov_frac:.0%})")
        print(f"{'#'*60}")

        fold_scores = []
        for held_out_idx, held_out_round in enumerate(all_round_ids):
            train_rounds = [r for r in all_round_ids if r != held_out_round]

            # Train with mixed evidence
            X_parts, Y_parts = [], []
            for round_id in train_rounds:
                rd = read_round_record(paths, round_id).round
                grids = load_replay_final_grids(replays_dir, round_id, max_replays_per_seed=58)
                for si in range(rd.seeds_count):
                    ist = rd.initial_states[si]
                    grid = np.asarray(ist.grid, dtype=np.int64)
                    h, w = grid.shape
                    mf = build_cellwise_features(grid, ist.settlements)
                    sg = grids.get(si, [])
                    if len(sg) < ev_replays + 1: continue

                    if cov_frac >= 1.0:
                        obs = np.ones((h, w), dtype=bool)
                    else:
                        obs = _partial_mask(h, w, cov_frac, rng)

                    step = ev_replays + 1
                    for s in range(0, len(sg) - step + 1, step):
                        eg = sg[s:s+ev_replays]
                        tg = sg[s+ev_replays]
                        ef = _build_evidence(eg, obs)
                        combined = np.concatenate([mf, ef], axis=-1)
                        X_parts.append(combined.reshape(-1, combined.shape[-1]))
                        tc = collapse_internal_grid(tg)
                        yf = np.zeros((h*w, CLASS_COUNT))
                        for c in range(CLASS_COUNT):
                            yf[:, c] = (tc.ravel() == c).astype(np.float64)
                        Y_parts.append(yf)

            X = np.concatenate(X_parts)
            Y = np.concatenate(Y_parts)
            models = {}
            for cls in range(CLASS_COUNT):
                m = lgb.LGBMRegressor(
                    objective="regression", n_estimators=500, max_depth=8,
                    learning_rate=0.03, min_child_samples=50, subsample=0.7,
                    colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42)
                m.fit(X, Y[:, cls])
                models[cls] = m

            # Evaluate
            rd = read_round_record(paths, held_out_round).round
            analyses = read_analysis_records(paths, held_out_round)
            ho = load_replay_final_grids(replays_dir, held_out_round, max_replays_per_seed=ev_replays)

            scores = []
            for si, ar in sorted(analyses.items()):
                ist = rd.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
                h, w = grid.shape
                mf = build_cellwise_features(grid, ist.settlements)

                if cov_frac >= 1.0:
                    obs = np.ones((h, w), dtype=bool)
                else:
                    obs = _partial_mask(h, w, cov_frac, rng)

                sg = ho.get(si, [])
                if sg:
                    ef = _build_evidence(sg[:ev_replays], obs)
                else:
                    ef = _build_evidence([], np.zeros((h,w), dtype=bool))
                combined = np.concatenate([mf, ef], axis=-1)
                Xe = combined.reshape(-1, combined.shape[-1])
                probs = np.zeros((h*w, CLASS_COUNT))
                for c in range(CLASS_COUNT):
                    probs[:, c] = np.clip(models[c].predict(Xe), 0, 1)
                probs /= probs.sum(axis=1, keepdims=True)
                probs = np.maximum(probs, 0.01)
                probs /= probs.sum(axis=1, keepdims=True)
                bd = score_prediction(gt, probs.reshape(h,w,CLASS_COUNT))
                scores.append(bd.score)

            fold_scores.append(float(np.mean(scores)))

        mean = float(np.mean(fold_scores))
        print(f"Result: score={mean:.4f}")

    print("\n" + "="*60)
    print("COMPARISON:")
    print("  query_residual_v11: 79.39")
    print("  evidence ev15 full: 83.06")
    print("="*60)


if __name__ == "__main__":
    run_sweep()
