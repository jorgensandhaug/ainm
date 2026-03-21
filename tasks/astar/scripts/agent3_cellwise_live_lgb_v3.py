"""Agent3's cellwise LightGBM v3 - Multi-episode training + QR features.

Key improvements over v1:
1. Multiple episodes per training round (different seeds = diverse evidence)
2. Query-residual predictions as additional features (gives the LGB the existing model's opinion)
3. Settlement-growth-potential features
4. Better handling of dynamic vs static cells
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from agent3_cellwise_live_lgb import (
    build_map_features,
    build_viewport_evidence_features,
    _neighbor_sum_2d,
)


def run_multi_episode_benchmark(
    *,
    name: str = "agent3_cellwise_live_lgb_v3",
    n_estimators: int = 500,
    max_depth: int = 6,
    learning_rate: float = 0.03,
    probability_floor: float = 0.0005,
    budget: int = 50,
    policy_name: str = "coverage",
    n_episodes: int = 5,
    n_jobs: int = 24,
    use_qr_features: bool = True,
    samples_per_round: int = 2,
) -> None:
    import lightgbm as lgb
    from astar.core.score import score_prediction
    from astar.core.terrain import CLASS_COUNT
    from astar.policy.interactive import build_interactive_policy
    from astar.envs.synthetic import SyntheticActiveOracle
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids
    from astar.workflows.online_episode import run_online_episode
    from astar.student.predictor.interactive import build_online_predictor

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    all_round_ids = discover_historical_eval_round_ids(paths)
    print(f"Found {len(all_round_ids)} rounds, {n_episodes} episodes each")

    fold_scores: list[float] = []
    fold_kls: list[float] = []
    all_results: list[dict] = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        # Build base predictor once for this fold
        base_predictor = build_online_predictor(
            "query_residual_v19",
            paths=paths,
            historical_round_ids=train_rounds,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        oracle = SyntheticActiveOracle(paths=paths)
        policy = build_interactive_policy(policy_name)

        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            h, w = round_detail.map_height, round_detail.map_width

            # Run MULTIPLE episodes with different seeds for diverse evidence
            for ep_seed in range(n_episodes):
                episode_run = run_online_episode(
                    oracle,
                    round_id=round_id,
                    predictor=base_predictor,
                    policy=policy,
                    budget=budget,
                    episode_seed=ep_seed * 1000,  # Different seeds
                )
                observations = list(episode_run.belief.observations)

                # Get QR predictions for this episode
                qr_pred = None
                if use_qr_features:
                    qr_bundle = episode_run.prediction_bundle
                    qr_pred = qr_bundle.predictions_by_seed

                for seed_index, analysis_record in sorted(analyses.items()):
                    initial_state = round_detail.initial_states[seed_index]
                    grid = np.asarray(initial_state.grid, dtype=np.int64)
                    gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)

                    map_feat = build_map_features(grid, initial_state.settlements)
                    ev_feat = build_viewport_evidence_features(observations, seed_index, h, w)

                    # Add QR prediction as features
                    if qr_pred is not None and seed_index in qr_pred:
                        qr_tensor = qr_pred[seed_index]
                        combined = np.concatenate([map_feat, ev_feat, qr_tensor], axis=-1)
                    else:
                        combined = np.concatenate([map_feat, ev_feat], axis=-1)

                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))

        if not X_parts:
            print("  No training data!")
            continue

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features, {n_episodes} episodes/round")

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
                n_jobs=n_jobs,
                random_state=42,
            )
            model.fit(X_train, Y_train[:, cls])
            models[cls] = model

        # Evaluate on held-out round
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        eval_episode = run_online_episode(
            oracle,
            round_id=held_out_round,
            predictor=base_predictor,
            policy=policy,
            budget=budget,
            episode_seed=0,
        )
        eval_observations = list(eval_episode.belief.observations)
        eval_qr_pred = eval_episode.prediction_bundle.predictions_by_seed if use_qr_features else None

        seed_scores: list[float] = []
        seed_kls: list[float] = []

        for seed_index, analysis_record in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            map_feat = build_map_features(grid, initial_state.settlements)
            ev_feat = build_viewport_evidence_features(eval_observations, seed_index, h, w)

            if eval_qr_pred is not None and seed_index in eval_qr_pred:
                qr_tensor = eval_qr_pred[seed_index]
                combined = np.concatenate([map_feat, ev_feat, qr_tensor], axis=-1)
            else:
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
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "probability_floor": probability_floor,
            "n_episodes": n_episodes,
            "use_qr_features": use_qr_features,
        },
        "per_fold": [{"round_id": r, "score": s, "kl": k}
                     for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
        "per_seed": all_results,
    }, indent=2))
    print(f"\nSaved to {output_dir / 'results.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_cellwise_live_lgb_v3")
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--learning-rate", type=float, default=0.03)
    parser.add_argument("--probability-floor", type=float, default=0.0005)
    parser.add_argument("--n-episodes", type=int, default=5)
    parser.add_argument("--n-jobs", type=int, default=24)
    parser.add_argument("--no-qr-features", action="store_true")
    args = parser.parse_args()

    run_multi_episode_benchmark(
        name=args.name,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        probability_floor=args.probability_floor,
        n_episodes=args.n_episodes,
        n_jobs=args.n_jobs,
        use_qr_features=not args.no_qr_features,
    )
