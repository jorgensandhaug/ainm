"""Nearest-round prediction with evidence correction.

Find the most similar training round by map+settlement similarity,
use its replay-derived year-50 distributions as base prediction,
then correct with observed evidence features.

This captures round-specific dynamics better than averaging all rounds.

Usage:
    uv run python scripts/agent4_nearest_round_model.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def _round_summary_vector(round_detail, analyses=None) -> np.ndarray:
    """Compute a summary vector for a round from its initial maps."""
    feats = []
    for si in range(round_detail.seeds_count):
        ist = round_detail.initial_states[si]
        grid = np.asarray(ist.grid, dtype=np.int64)
        h, w = grid.shape

        # Count terrain types
        for code in [0, 1, 2, 3, 4, 5, 10, 11]:
            feats.append(float((grid == code).sum()) / (h * w))

        # Settlement stats
        n_sett = len(ist.settlements)
        n_port = sum(1 for s in ist.settlements if s.has_port)
        feats.extend([n_sett / 60.0, n_port / 10.0])

        # Spatial clustering of settlements
        if ist.settlements:
            ys = [s.y for s in ist.settlements]
            xs = [s.x for s in ist.settlements]
            feats.extend([
                np.std(ys) / h if ys else 0,
                np.std(xs) / w if xs else 0,
                np.mean(ys) / h if ys else 0.5,
                np.mean(xs) / w if xs else 0.5,
            ])
        else:
            feats.extend([0, 0, 0.5, 0.5])

    return np.asarray(feats, dtype=np.float64)


def run_nearest_round(
    *, name="agent4_nearest_round_v1",
    max_replays=58, serve_ev=1, k_rounds=3,
    probability_floor=0.01,
):
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import load_replay_final_grids

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    # Compute round summaries
    round_summaries = {}
    for rid in all_round_ids:
        rd = read_round_record(paths, rid).round
        round_summaries[rid] = _round_summary_vector(rd)

    fold_scores, fold_kls = [], []
    total_start = time.time()

    for hi, hr in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != hr]
        print(f"\n=== Fold {hi+1}/{len(all_round_ids)}: held out {hr[:8]}... ===")

        # Find nearest training rounds
        hr_summary = round_summaries[hr]
        distances = []
        for tr in train_rounds:
            dist = np.linalg.norm(hr_summary - round_summaries[tr])
            distances.append((dist, tr))
        distances.sort()
        nearest = [rid for _, rid in distances[:k_rounds]]
        print(f"  Nearest rounds: {[r[:8] for r in nearest]}")

        # Build empirical distributions from nearest rounds' replays
        # For each cell configuration, compute the average year-50 distribution
        rd_ho = read_round_record(paths, hr).round
        analyses_ho = read_analysis_records(paths, hr)

        scores, kls = [], []
        for si, ar in sorted(analyses_ho.items()):
            ist = rd_ho.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            initial = collapse_internal_grid(grid)

            # For each cell, find matching cells from nearest rounds and average their outcomes
            pred = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
            count = np.zeros((h, w), dtype=np.float64)

            for nr_id in nearest:
                nr_rd = read_round_record(paths, nr_id).round
                nr_analyses = read_analysis_records(paths, nr_id)

                for nr_si, nr_ar in sorted(nr_analyses.items()):
                    nr_gt = np.asarray(nr_ar.analysis.ground_truth, dtype=np.float64)
                    nr_ist = nr_rd.initial_states[nr_si]
                    nr_grid = np.asarray(nr_ist.grid, dtype=np.int64)
                    nr_initial = collapse_internal_grid(nr_grid)

                    # Match cells by initial class and add their ground truth distributions
                    for cls in range(CLASS_COUNT):
                        mask_ho = initial == cls
                        mask_nr = nr_initial == cls
                        if mask_ho.sum() > 0 and mask_nr.sum() > 0:
                            # Average the training round's GT for this class
                            mean_dist = nr_gt[mask_nr].mean(axis=0)
                            pred[mask_ho] += mean_dist
                            count[mask_ho] += 1.0

            # Average
            for y in range(h):
                for x in range(w):
                    if count[y, x] > 0:
                        pred[y, x] /= count[y, x]
                    else:
                        pred[y, x] = np.ones(CLASS_COUNT) / CLASS_COUNT

            # Now blend with observed evidence if available
            ho_replays = load_replay_final_grids(replays_dir, hr, max_replays_per_seed=serve_ev)
            items = ho_replays.get(si, [])
            if items and serve_ev > 0:
                # Average observed class frequencies
                obs_freq = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
                for rg in items[:serve_ev]:
                    collapsed = collapse_internal_grid(rg)
                    for cls in range(CLASS_COUNT):
                        obs_freq[:, :, cls] += (collapsed == cls).astype(np.float64)
                obs_freq /= len(items[:serve_ev])

                # Simple blend: 50% nearest-round prior + 50% observation
                alpha = 0.5
                pred = (1 - alpha) * pred + alpha * obs_freq

            pred = np.maximum(pred, probability_floor)
            pred /= pred.sum(axis=-1, keepdims=True)

            bd = score_prediction(gt, pred)
            scores.append(bd.score)
            kls.append(bd.weighted_kl)

        fs, fk = float(np.mean(scores)), float(np.mean(kls))
        fold_scores.append(fs); fold_kls.append(fk)
        print(f"  Score: {fs:.4f}  KL: {fk:.6f}")

    ms, mk = float(np.mean(fold_scores)), float(np.mean(fold_kls))
    print(f"\n{'='*60}")
    print(f"NEAREST-ROUND: score={ms:.4f} kl={mk:.6f} (k={k_rounds}, serve_ev={serve_ev})")
    print(f"{'='*60}")

    od = paths.root / "data" / "artifacts" / "runs" / name
    od.mkdir(parents=True, exist_ok=True)
    (od / "results.json").write_text(json.dumps({
        "name": name, "k_rounds": k_rounds, "serve_ev": serve_ev,
        "mean_score": ms, "mean_weighted_kl": mk,
        "per_fold": [{"round_id":r,"score":s,"kl":k}
                     for r,s,k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="agent4_nearest_round_ev1_k3_v1")
    p.add_argument("--serve-ev", type=int, default=1)
    p.add_argument("--k-rounds", type=int, default=3)
    a = p.parse_args()
    run_nearest_round(name=a.name, serve_ev=a.serve_ev, k_rounds=a.k_rounds)
