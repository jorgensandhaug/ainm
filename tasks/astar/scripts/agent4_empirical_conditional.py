"""Empirical conditional frequency table predictor.

For each cell, compute the empirical final-class distribution conditional on:
- Initial terrain class
- Number of settlement neighbors (radius 1)
- Number of settlement neighbors (radius 3)
- Whether the cell is coastal

This is the simplest possible non-parametric model. No learning, just counting.

Usage:
    uv run python scripts/agent4_empirical_conditional.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np


def run_empirical_benchmark(
    *,
    name: str = "agent4_empirical_conditional_v1",
    max_replays_per_seed: int = 58,
    probability_floor: float = 0.01,
    use_replay: bool = True,
) -> None:
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.features.coasts import coast_mask
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

    fold_scores, fold_kls = [], []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Build conditional frequency tables
        # Key: (initial_class, sett_nbr_r1_bucket, sett_nbr_r3_bucket, is_coastal) -> class counts
        tables: dict[tuple, np.ndarray] = {}
        total_cells = 0

        for round_id in train_rounds:
            rd = read_round_record(paths, round_id).round

            if use_replay:
                replay_grids = load_replay_final_grids(
                    replays_dir, round_id, max_replays_per_seed=max_replays_per_seed,
                )
            else:
                replay_grids = {}
                analyses_train = read_analysis_records(paths, round_id)

            for seed_index in range(rd.seeds_count):
                ist = rd.initial_states[seed_index]
                grid = np.asarray(ist.grid, dtype=np.int64)
                initial = collapse_internal_grid(grid)
                h, w = grid.shape

                # Compute conditioning features from initial map
                coastal = coast_mask(grid).astype(np.int64)
                sett_map = np.zeros((h, w), dtype=np.int64)
                for s in ist.settlements:
                    sett_map[s.y, s.x] = 1

                # Settlement neighbor counts
                sett_nbr_r1 = np.zeros((h, w), dtype=np.int64)
                sett_nbr_r3 = np.zeros((h, w), dtype=np.int64)
                for dy in range(-3, 4):
                    for dx in range(-3, 4):
                        if dy == 0 and dx == 0:
                            continue
                        r = max(abs(dy), abs(dx))
                        sy = slice(max(0, -dy), min(h, h - dy))
                        sx = slice(max(0, -dx), min(w, w - dx))
                        ty = slice(max(0, dy), min(h, h + dy))
                        tx = slice(max(0, dx), min(w, w + dx))
                        if r <= 1:
                            sett_nbr_r1[ty, tx] += sett_map[sy, sx]
                        sett_nbr_r3[ty, tx] += sett_map[sy, sx]

                # Bucket the neighbor counts
                sett_r1_bucket = np.minimum(sett_nbr_r1, 3)  # 0,1,2,3+
                sett_r3_bucket = np.minimum(sett_nbr_r3 // 2, 4)  # 0,1,2,3,4+

                if use_replay:
                    seed_replays = replay_grids.get(seed_index, [])
                    for rg in seed_replays:
                        final = collapse_internal_grid(rg)
                        for y in range(h):
                            for x in range(w):
                                key = (
                                    int(initial[y, x]),
                                    int(sett_r1_bucket[y, x]),
                                    int(sett_r3_bucket[y, x]),
                                    int(coastal[y, x]),
                                )
                                if key not in tables:
                                    tables[key] = np.zeros(CLASS_COUNT, dtype=np.float64)
                                tables[key][int(final[y, x])] += 1.0
                                total_cells += 1
                else:
                    if seed_index in analyses_train:
                        gt = np.asarray(analyses_train[seed_index].analysis.ground_truth, dtype=np.float64)
                        for y in range(h):
                            for x in range(w):
                                key = (
                                    int(initial[y, x]),
                                    int(sett_r1_bucket[y, x]),
                                    int(sett_r3_bucket[y, x]),
                                    int(coastal[y, x]),
                                )
                                if key not in tables:
                                    tables[key] = np.zeros(CLASS_COUNT, dtype=np.float64)
                                tables[key] += gt[y, x]
                                total_cells += 1

        print(f"  {len(tables)} unique conditioning keys, {total_cells} total cells")

        # Compute global fallback
        global_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
        for counts in tables.values():
            global_counts += counts
        global_probs = global_counts / global_counts.sum()

        # Evaluate on held-out round
        rd = read_round_record(paths, held_out_round).round
        analyses = read_analysis_records(paths, held_out_round)

        seed_scores_list, seed_kls_list = [], []

        for seed_index, ar in sorted(analyses.items()):
            ist = rd.initial_states[seed_index]
            grid = np.asarray(ist.grid, dtype=np.int64)
            initial = collapse_internal_grid(grid)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            coastal = coast_mask(grid).astype(np.int64)
            sett_map = np.zeros((h, w), dtype=np.int64)
            for s in ist.settlements:
                sett_map[s.y, s.x] = 1

            sett_nbr_r1 = np.zeros((h, w), dtype=np.int64)
            sett_nbr_r3 = np.zeros((h, w), dtype=np.int64)
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    if dy == 0 and dx == 0:
                        continue
                    r = max(abs(dy), abs(dx))
                    sy = slice(max(0, -dy), min(h, h - dy))
                    sx = slice(max(0, -dx), min(w, w - dx))
                    ty = slice(max(0, dy), min(h, h + dy))
                    tx = slice(max(0, dx), min(w, w + dx))
                    if r <= 1:
                        sett_nbr_r1[ty, tx] += sett_map[sy, sx]
                    sett_nbr_r3[ty, tx] += sett_map[sy, sx]

            sett_r1_bucket = np.minimum(sett_nbr_r1, 3)
            sett_r3_bucket = np.minimum(sett_nbr_r3 // 2, 4)

            pred = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
            for y in range(h):
                for x in range(w):
                    key = (
                        int(initial[y, x]),
                        int(sett_r1_bucket[y, x]),
                        int(sett_r3_bucket[y, x]),
                        int(coastal[y, x]),
                    )
                    if key in tables and tables[key].sum() > 10:
                        pred[y, x] = tables[key] / tables[key].sum()
                    elif key[:3] in {k[:3] for k in tables}:
                        # Fallback: ignore coastal
                        fallback_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
                        for k, v in tables.items():
                            if k[:3] == key[:3]:
                                fallback_counts += v
                        if fallback_counts.sum() > 10:
                            pred[y, x] = fallback_counts / fallback_counts.sum()
                        else:
                            pred[y, x] = global_probs
                    else:
                        pred[y, x] = global_probs

            pred = np.maximum(pred, probability_floor)
            pred /= pred.sum(axis=-1, keepdims=True)

            bd = score_prediction(gt, pred)
            seed_scores_list.append(bd.score)
            seed_kls_list.append(bd.weighted_kl)

        fold_score = float(np.mean(seed_scores_list))
        fold_kl = float(np.mean(seed_kls_list))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time()-fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))

    print(f"\n{'='*60}")
    print(f"EMPIRICAL CONDITIONAL: score={mean_score:.4f}  kl={mean_kl:.6f}")
    print(f"{'='*60}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_empirical_conditional_v1")
    parser.add_argument("--max-replays", type=int, default=58)
    parser.add_argument("--no-replay", action="store_true")
    args = parser.parse_args()

    run_empirical_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        use_replay=not args.no_replay,
    )
