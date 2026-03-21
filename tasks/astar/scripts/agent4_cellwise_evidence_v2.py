"""Evidence-augmented cellwise LightGBM v2: multi-replay evidence averaging.

Improvements over v1:
1. Average evidence features over multiple replays per evidence source
2. Add settlement-level features from observed replay (population, food, wealth, defense)
3. Use more replays for training pairs
4. More model capacity

Usage:
    uv run python scripts/agent4_cellwise_evidence_v2.py
"""

from __future__ import annotations

import argparse
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


def _build_evidence_features_v2(
    replay_grids: list[np.ndarray],
    replay_settlements_list: list[list[dict]] | None,
    observed_mask: np.ndarray,
    num_classes: int = 6,
) -> np.ndarray:
    """Build evidence features averaged over multiple replay outcomes."""
    from astar.core.terrain import collapse_internal_grid

    h, w = observed_mask.shape
    features: list[np.ndarray] = []
    obs_float = observed_mask.astype(np.float64)
    features.append(obs_float)

    if replay_grids:
        # Average class frequencies over replays
        n_replays = len(replay_grids)
        class_freq = np.zeros((h, w, num_classes), dtype=np.float64)
        for rg in replay_grids:
            collapsed = collapse_internal_grid(rg)
            for cls in range(num_classes):
                class_freq[:, :, cls] += (collapsed == cls).astype(np.float64)
        class_freq /= n_replays

        # Observed class frequencies (masked)
        for cls in range(num_classes):
            features.append(np.where(observed_mask, class_freq[:, :, cls], 0.0))

        # Observed class entropy
        obs_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(num_classes):
            f = class_freq[:, :, cls]
            obs_entropy -= np.where(f > 0, f * np.log(f + 1e-10), 0.0)
        features.append(np.where(observed_mask, obs_entropy, 0.0))

        # Neighborhood evidence at multiple scales
        for radius in [1, 2, 3]:
            nbr_obs = _neighbor_sum_2d(obs_float, radius)
            features.append(nbr_obs)

            for cls in range(num_classes):
                cls_map = np.where(observed_mask, class_freq[:, :, cls], 0.0)
                nbr_sum = _neighbor_sum_2d(cls_map, radius)
                frac = np.where(nbr_obs > 0, nbr_sum / nbr_obs, 0.0)
                features.append(frac)

        # Settlement features from replays (average over replays)
        if replay_settlements_list:
            pop_map = np.zeros((h, w), dtype=np.float64)
            food_map = np.zeros((h, w), dtype=np.float64)
            wealth_map = np.zeros((h, w), dtype=np.float64)
            defense_map = np.zeros((h, w), dtype=np.float64)
            alive_map = np.zeros((h, w), dtype=np.float64)
            port_map = np.zeros((h, w), dtype=np.float64)
            count_map = np.zeros((h, w), dtype=np.float64)

            for settlements in replay_settlements_list:
                for s in settlements:
                    sy, sx = int(s.get("y", 0)), int(s.get("x", 0))
                    if 0 <= sy < h and 0 <= sx < w:
                        count_map[sy, sx] += 1.0
                        pop_map[sy, sx] += float(s.get("population", 0))
                        food_map[sy, sx] += float(s.get("food", 0))
                        wealth_map[sy, sx] += float(s.get("wealth", 0))
                        defense_map[sy, sx] += float(s.get("defense", 0))
                        alive_map[sy, sx] += float(s.get("alive", False))
                        port_map[sy, sx] += float(s.get("has_port", False))

            safe_count = np.maximum(count_map, 1.0)
            features.append(np.where(observed_mask, count_map / n_replays, 0.0))
            features.append(np.where(observed_mask, pop_map / safe_count / 5.0, 0.0))
            features.append(np.where(observed_mask, food_map / safe_count / 2.0, 0.0))
            features.append(np.where(observed_mask, wealth_map / safe_count / 2.0, 0.0))
            features.append(np.where(observed_mask, defense_map / safe_count, 0.0))
            features.append(np.where(observed_mask, alive_map / safe_count, 0.0))
            features.append(np.where(observed_mask, port_map / safe_count, 0.0))

            # Neighborhood settlement features
            for radius in [2, 4]:
                nbr_pop = _neighbor_sum_2d(np.where(observed_mask, pop_map / safe_count, 0.0), radius)
                nbr_alive = _neighbor_sum_2d(np.where(observed_mask, alive_map / safe_count, 0.0), radius)
                features.append(nbr_pop)
                features.append(nbr_alive)
        else:
            # Pad with zeros to keep feature count consistent
            for _ in range(7 + 4):
                features.append(np.zeros((h, w), dtype=np.float64))
    else:
        # No evidence
        n_ev = 1 + num_classes + 1 + 3 * (1 + num_classes) + 7 + 4
        for _ in range(n_ev):
            features.append(np.zeros((h, w), dtype=np.float64))

    return np.stack(features, axis=-1)


def _load_replay_grids_and_settlements(
    replays_dir: Path,
    round_id: str,
    max_per_seed: int = 30,
) -> dict[int, list[tuple[np.ndarray, list[dict]]]]:
    """Load year-50 grids AND settlement lists from replays."""
    round_dir = replays_dir / round_id
    if not round_dir.exists():
        return {}

    result: dict[int, list[tuple[np.ndarray, list[dict]]]] = {}
    for seed_dir in sorted(round_dir.iterdir()):
        if not seed_dir.is_dir() or not seed_dir.name.startswith("seed_index="):
            continue
        seed_index = int(seed_dir.name.split("=")[1])
        items = []
        for rf in sorted(seed_dir.iterdir())[:max_per_seed]:
            try:
                with open(rf) as f:
                    data = json.load(f)
                frames = data["response"]["frames"]
                final_frame = frames[-1]
                grid = np.asarray(final_frame["grid"], dtype=np.int64)
                settlements = final_frame.get("settlements", [])
                items.append((grid, settlements))
            except (KeyError, IndexError, json.JSONDecodeError):
                continue
        if items:
            result[seed_index] = items
    return result


def _simulate_coverage_mask(h: int, w: int) -> np.ndarray:
    mask = np.zeros((h, w), dtype=bool)
    for vy in range(0, h, 15):
        for vx in range(0, w, 15):
            mask[vy:min(vy+15,h), vx:min(vx+15,w)] = True
    return mask


def run_evidence_v2_benchmark(
    *,
    name: str = "agent4_cellwise_evidence_lgb_v2",
    n_estimators: int = 800,
    max_depth: int = 8,
    learning_rate: float = 0.02,
    max_replays_per_seed: int = 30,
    evidence_replays: int = 3,
    probability_floor: float = 0.01,
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
    print(f"Found {len(all_round_ids)} rounds")

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    all_results: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            replay_data = _load_replay_grids_and_settlements(
                replays_dir, round_id, max_per_seed=max_replays_per_seed,
            )

            for seed_index in range(round_detail.seeds_count):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                h, w = grid.shape
                map_feat = build_cellwise_features(grid, initial_state.settlements)

                items = replay_data.get(seed_index, [])
                if len(items) < evidence_replays + 1:
                    continue

                obs_mask = _simulate_coverage_mask(h, w)

                # Create training pairs: evidence (avg of N replays) + target (another replay)
                step = evidence_replays + 1
                for start in range(0, len(items) - step + 1, step):
                    ev_grids = [items[start + j][0] for j in range(evidence_replays)]
                    ev_settlements = [items[start + j][1] for j in range(evidence_replays)]
                    target_grid = items[start + evidence_replays][0]

                    ev_feat = _build_evidence_features_v2(
                        ev_grids, ev_settlements, obs_mask,
                    )
                    combined = np.concatenate([map_feat, ev_feat], axis=-1)
                    X_flat = combined.reshape(-1, combined.shape[-1])

                    target_collapsed = collapse_internal_grid(target_grid)
                    Y_flat = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                    for cls in range(CLASS_COUNT):
                        Y_flat[:, cls] = (target_collapsed.ravel() == cls).astype(np.float64)

                    X_parts.append(X_flat)
                    Y_parts.append(Y_flat)

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

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

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        held_out_data = _load_replay_grids_and_settlements(
            replays_dir, held_out_round, max_per_seed=evidence_replays,
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

            items = held_out_data.get(seed_index, [])
            if items:
                ev_grids = [it[0] for it in items[:evidence_replays]]
                ev_settlements = [it[1] for it in items[:evidence_replays]]
                ev_feat = _build_evidence_features_v2(
                    ev_grids, ev_settlements, obs_mask,
                )
            else:
                ev_feat = _build_evidence_features_v2([], None, np.zeros((h,w), dtype=bool))

            combined = np.concatenate([map_feat, ev_feat], axis=-1)
            X_eval = combined.reshape(-1, combined.shape[-1])

            probs = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
            for cls in range(CLASS_COUNT):
                probs[:, cls] = np.clip(models[cls].predict(X_eval), 0.0, 1.0)

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
    print(f"  Evidence v2 LGB:                 score={mean_score:.4f} kl={mean_kl:.6f}")
    print(f"  Evidence v1 LGB:                 score=71.96  kl=0.114")
    print(f"  query_residual_v11 (online):     score=79.39  kl=0.078")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "evidence_replays": evidence_replays,
        "n_estimators": n_estimators,
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent4_cellwise_evidence_lgb_v2")
    parser.add_argument("--max-replays", type=int, default=30)
    parser.add_argument("--evidence-replays", type=int, default=3)
    parser.add_argument("--n-estimators", type=int, default=800)
    parser.add_argument("--max-depth", type=int, default=8)
    args = parser.parse_args()

    run_evidence_v2_benchmark(
        name=args.name,
        max_replays_per_seed=args.max_replays,
        evidence_replays=args.evidence_replays,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
    )
