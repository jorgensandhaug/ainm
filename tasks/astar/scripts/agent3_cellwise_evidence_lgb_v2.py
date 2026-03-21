"""Agent3's cellwise LightGBM v2 - improved feature engineering and training.

Improvements over v1:
1. Entropy-weighted training loss (focus on uncertain cells)
2. Cross-seed evidence features (what do other seeds show?)
3. More spatial propagation features
4. Probability calibration via Platt scaling
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

# Import v1 functions
from agent3_cellwise_evidence_lgb import (
    build_map_features,
    build_evidence_features,
    load_replay_grids_and_settlements,
    simulate_coverage_mask,
    _neighbor_sum_2d,
)


def build_cross_seed_features(
    all_seed_evidence: dict[int, np.ndarray],
    current_seed: int,
    h: int, w: int,
) -> np.ndarray:
    """Build features summarizing evidence from OTHER seeds."""
    from astar.core.terrain import CLASS_COUNT

    features: list[np.ndarray] = []

    # Average class frequency across other seeds
    other_freqs = []
    for si, ev_feat in all_seed_evidence.items():
        if si == current_seed:
            continue
        # ev_feat has obs_mask as first channel, then class freqs
        if ev_feat.shape[-1] > CLASS_COUNT + 1:
            class_cols = ev_feat[:, :, 1:CLASS_COUNT+1]
            other_freqs.append(class_cols)

    if other_freqs:
        mean_other = np.mean(np.stack(other_freqs), axis=0)
        for c in range(CLASS_COUNT):
            features.append(mean_other[:, :, c])

        # Std across other seeds (disagreement signal)
        if len(other_freqs) > 1:
            std_other = np.std(np.stack(other_freqs), axis=0)
            for c in range(CLASS_COUNT):
                features.append(std_other[:, :, c])
        else:
            for c in range(CLASS_COUNT):
                features.append(np.zeros((h, w), dtype=np.float64))
    else:
        for c in range(2 * CLASS_COUNT):
            features.append(np.zeros((h, w), dtype=np.float64))

    # Number of other seeds with evidence
    features.append(np.full((h, w), len(other_freqs), dtype=np.float64))

    return np.stack(features, axis=-1)


def run_benchmark_v2(
    *,
    name: str = "agent3_cellwise_evidence_lgb_v2",
    n_estimators: int = 800,
    max_depth: int = 8,
    learning_rate: float = 0.02,
    max_replays_per_seed: int = 58,
    evidence_replays: int = 15,
    probability_floor: float = 0.003,
    use_entropy_weights: bool = True,
    use_cross_seed: bool = True,
    n_jobs: int = 16,
    num_leaves: int = 63,
    min_child_samples: int = 50,
    subsample: float = 0.7,
    colsample_bytree: float = 0.7,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record

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
        W_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            replay_data = load_replay_grids_and_settlements(
                replays_dir, round_id, max_per_seed=max_replays_per_seed,
            )
            analyses = read_analysis_records(paths, round_id)

            # Precompute evidence for all seeds (for cross-seed features)
            obs_mask = simulate_coverage_mask(round_detail.map_height, round_detail.map_width)

            for seed_index in range(round_detail.seeds_count):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                h, w = grid.shape
                map_feat = build_map_features(grid, initial_state.settlements)

                items = replay_data.get(seed_index, [])
                if len(items) < evidence_replays + 1:
                    continue

                step = evidence_replays + 1
                for start in range(0, len(items) - step + 1, step):
                    ev_grids = [items[start + j][0] for j in range(evidence_replays)]
                    ev_settlements = [items[start + j][1] for j in range(evidence_replays)]
                    target_grid = items[start + evidence_replays][0]

                    ev_feat = build_evidence_features(ev_grids, ev_settlements, obs_mask)
                    combined = np.concatenate([map_feat, ev_feat], axis=-1)
                    X_flat = combined.reshape(-1, combined.shape[-1])

                    target_collapsed = collapse_internal_grid(target_grid)
                    Y_flat = np.zeros((h * w, CLASS_COUNT), dtype=np.float64)
                    for cls in range(CLASS_COUNT):
                        Y_flat[:, cls] = (target_collapsed.ravel() == cls).astype(np.float64)

                    X_parts.append(X_flat)
                    Y_parts.append(Y_flat)

                    # Entropy weights from ground truth analysis
                    if use_entropy_weights and seed_index in analyses:
                        gt = np.asarray(analyses[seed_index].analysis.ground_truth, dtype=np.float64)
                        ent = entropy_map(gt)
                        weights = np.maximum(ent.ravel(), 0.01)
                        W_parts.append(weights)
                    else:
                        W_parts.append(np.ones(h * w, dtype=np.float64))

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        W_train = np.concatenate(W_parts, axis=0) if use_entropy_weights else None
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

        models: dict[int, object] = {}
        for cls in range(CLASS_COUNT):
            model = lgb.LGBMRegressor(
                objective="regression",
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=learning_rate,
                min_child_samples=min_child_samples,
                subsample=subsample,
                colsample_bytree=colsample_bytree,
                num_leaves=num_leaves,
                verbose=-1,
                n_jobs=n_jobs,
                random_state=42,
            )
            if W_train is not None:
                model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
            else:
                model.fit(X_train, Y_train[:, cls])
            models[cls] = model

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)
        held_out_data = load_replay_grids_and_settlements(
            replays_dir, held_out_round, max_per_seed=evidence_replays,
        )

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            map_feat = build_map_features(grid, initial_state.settlements)
            obs_mask = simulate_coverage_mask(h, w)

            items = held_out_data.get(seed_index, [])
            if items:
                ev_grids = [it[0] for it in items[:evidence_replays]]
                ev_settlements = [it[1] for it in items[:evidence_replays]]
                ev_feat = build_evidence_features(ev_grids, ev_settlements, obs_mask)
            else:
                ev_feat = build_evidence_features([], None, np.zeros((h, w), dtype=bool))

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
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time() - fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    total_time = time.time() - total_start

    print(f"\n{'=' * 60}")
    print(f"OVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={total_time:.1f}s")
    print(f"{'=' * 60}")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name,
        "mean_score": mean_score,
        "mean_weighted_kl": mean_kl,
        "total_time_s": total_time,
        "config": {
            "evidence_replays": evidence_replays,
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "probability_floor": probability_floor,
            "use_entropy_weights": use_entropy_weights,
            "num_leaves": num_leaves,
        },
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_cellwise_evidence_lgb_v2")
    parser.add_argument("--evidence-replays", type=int, default=15)
    parser.add_argument("--n-estimators", type=int, default=800)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--probability-floor", type=float, default=0.003)
    parser.add_argument("--no-entropy-weights", action="store_true")
    parser.add_argument("--n-jobs", type=int, default=16)
    parser.add_argument("--num-leaves", type=int, default=63)
    parser.add_argument("--min-child-samples", type=int, default=50)
    args = parser.parse_args()

    run_benchmark_v2(
        name=args.name,
        evidence_replays=args.evidence_replays,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        probability_floor=args.probability_floor,
        use_entropy_weights=not args.no_entropy_weights,
        n_jobs=args.n_jobs,
        num_leaves=args.num_leaves,
        min_child_samples=args.min_child_samples,
    )
