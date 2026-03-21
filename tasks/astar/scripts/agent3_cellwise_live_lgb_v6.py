"""Agent3's cellwise LightGBM v6 - Stacking ensemble + XGBoost + tuning.

Radical new ideas:
1. XGBoost as alternative/ensemble member
2. Stacking: LGB predictions as features for a second-level model
3. Per-class tuned hyperparameters (settlement/port/ruin get more capacity)
4. Feature selection via importance filtering
5. Multiple random seeds for evidence diversity
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from agent3_cellwise_live_lgb import build_map_features, build_viewport_evidence_features, _neighbor_sum_2d
from agent3_cellwise_live_lgb_v4 import build_cross_seed_evidence, build_settlement_proximity_from_evidence
from agent3_cellwise_live_lgb_v5 import build_activity_heatmap_features


def build_all_features(observations, initial_state, grid, seed_index, h, w):
    feat_parts = [
        build_map_features(grid, initial_state.settlements),
        build_viewport_evidence_features(observations, seed_index, h, w),
        build_cross_seed_evidence(observations, seed_index, h, w),
        build_settlement_proximity_from_evidence(observations, seed_index, h, w),
        build_activity_heatmap_features(observations, seed_index, h, w),
    ]
    return np.concatenate(feat_parts, axis=-1)


def run_v6_benchmark(
    *,
    name: str = "agent3_v6_default",
    n_estimators: int = 800,
    max_depth: int = 8,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    budget: int = 50,
    n_episodes: int = 1,
    n_jobs: int = 32,
    model_type: str = "lgb",  # "lgb", "xgb", or "stack"
    use_per_class_tuning: bool = True,
    samples_per_round: int = 2,
) -> None:
    from astar.core.score import score_prediction, entropy_map
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
    print(f"Found {len(all_round_ids)} rounds, model_type={model_type}")

    fold_scores, fold_kls = [], []
    all_results = []
    total_start = time.time()

    for held_out_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        print(f"\n=== Fold {held_out_idx + 1}/{len(all_round_ids)}: held out {held_out_round[:8]}... ===")
        fold_start = time.time()

        base_predictor = build_online_predictor(
            "query_residual_v19", paths=paths,
            historical_round_ids=train_rounds,
            policy_name="coverage", samples_per_round=samples_per_round,
        )
        oracle = SyntheticActiveOracle(paths=paths)
        policy = build_interactive_policy("coverage")

        X_parts, Y_parts, W_parts = [], [], []

        for round_id in train_rounds:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)
            h, w = round_detail.map_height, round_detail.map_width

            for ep_seed in range(n_episodes):
                episode = run_online_episode(
                    oracle, round_id=round_id, predictor=base_predictor,
                    policy=policy, budget=budget, episode_seed=ep_seed * 1000,
                )
                observations = list(episode.belief.observations)

                for seed_index, analysis in sorted(analyses.items()):
                    initial_state = round_detail.initial_states[seed_index]
                    grid = np.asarray(initial_state.grid, dtype=np.int64)
                    gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)

                    combined = build_all_features(observations, initial_state, grid, seed_index, h, w)
                    X_parts.append(combined.reshape(-1, combined.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))

                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X_train = np.concatenate(X_parts, axis=0)
        Y_train = np.concatenate(Y_parts, axis=0)
        W_train = np.concatenate(W_parts, axis=0)
        print(f"  Training: {X_train.shape[0]} cells, {X_train.shape[1]} features")

        # Train models
        if model_type == "xgb":
            import xgboost as xgb
            models = {}
            for cls in range(CLASS_COUNT):
                # Dynamic classes get more capacity
                if use_per_class_tuning and cls in (1, 2, 3):
                    cls_n_est = int(n_estimators * 1.5)
                    cls_depth = max_depth + 2
                else:
                    cls_n_est = n_estimators
                    cls_depth = max_depth
                model = xgb.XGBRegressor(
                    objective="reg:squarederror", n_estimators=cls_n_est,
                    max_depth=cls_depth, learning_rate=learning_rate,
                    subsample=0.7, colsample_bytree=0.7,
                    min_child_weight=50, tree_method="hist",
                    verbosity=0, n_jobs=n_jobs, random_state=42,
                )
                model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
                models[cls] = model
        elif model_type == "stack":
            import lightgbm as lgb
            # Level 1: Train LGB models
            lgb_models = {}
            lgb_oof_preds = np.zeros_like(Y_train)
            n_train = X_train.shape[0]
            # Simple 2-fold OOF for stacking
            mid = n_train // 2
            for cls in range(CLASS_COUNT):
                m1 = lgb.LGBMRegressor(
                    objective="regression", n_estimators=n_estimators,
                    max_depth=max_depth, learning_rate=learning_rate,
                    min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                    num_leaves=63, verbose=-1, n_jobs=n_jobs, random_state=42,
                )
                m1.fit(X_train[:mid], Y_train[:mid, cls], sample_weight=W_train[:mid])
                lgb_oof_preds[mid:, cls] = np.clip(m1.predict(X_train[mid:]), 0, 1)

                m2 = lgb.LGBMRegressor(
                    objective="regression", n_estimators=n_estimators,
                    max_depth=max_depth, learning_rate=learning_rate,
                    min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                    num_leaves=63, verbose=-1, n_jobs=n_jobs, random_state=42,
                )
                m2.fit(X_train[mid:], Y_train[mid:, cls], sample_weight=W_train[mid:])
                lgb_oof_preds[:mid, cls] = np.clip(m2.predict(X_train[:mid]), 0, 1)

                # Final model on all data
                m_full = lgb.LGBMRegressor(
                    objective="regression", n_estimators=n_estimators,
                    max_depth=max_depth, learning_rate=learning_rate,
                    min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                    num_leaves=63, verbose=-1, n_jobs=n_jobs, random_state=42,
                )
                m_full.fit(X_train, Y_train[:, cls], sample_weight=W_train)
                lgb_models[cls] = m_full

            # Level 2: Ridge regression on LGB predictions + original features
            X_stack = np.concatenate([X_train, lgb_oof_preds], axis=1)
            models = {"lgb": lgb_models}
            stack_models = {}
            from sklearn.linear_model import Ridge
            for cls in range(CLASS_COUNT):
                ridge = Ridge(alpha=1.0)
                ridge.fit(X_stack, Y_train[:, cls], sample_weight=W_train)
                stack_models[cls] = ridge
            models["stack"] = stack_models
        else:  # lgb
            import lightgbm as lgb
            models = {}
            for cls in range(CLASS_COUNT):
                if use_per_class_tuning and cls in (1, 2, 3):
                    cls_n_est = int(n_estimators * 1.5)
                    cls_depth = max_depth + 2
                else:
                    cls_n_est = n_estimators
                    cls_depth = max_depth
                model = lgb.LGBMRegressor(
                    objective="regression", n_estimators=cls_n_est,
                    max_depth=cls_depth, learning_rate=learning_rate,
                    min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                    num_leaves=63 if cls not in (1,2,3) else 127,
                    verbose=-1, n_jobs=n_jobs, random_state=42,
                )
                model.fit(X_train, Y_train[:, cls], sample_weight=W_train)
                models[cls] = model

        # Evaluate
        round_record = read_round_record(paths, held_out_round)
        round_detail = round_record.round
        analyses = read_analysis_records(paths, held_out_round)

        eval_episode = run_online_episode(
            oracle, round_id=held_out_round, predictor=base_predictor,
            policy=policy, budget=budget, episode_seed=0,
        )
        eval_obs = list(eval_episode.belief.observations)
        seed_scores, seed_kls = [], []

        for seed_index, analysis in sorted(analyses.items()):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            gt = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape

            combined = build_all_features(eval_obs, initial_state, grid, seed_index, h, w)
            X_eval = combined.reshape(-1, combined.shape[-1])

            if model_type == "stack":
                lgb_preds = np.zeros((X_eval.shape[0], CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    lgb_preds[:, cls] = np.clip(models["lgb"][cls].predict(X_eval), 0, 1)
                X_stack_eval = np.concatenate([X_eval, lgb_preds], axis=1)
                probs = np.zeros((X_eval.shape[0], CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    probs[:, cls] = np.clip(models["stack"][cls].predict(X_stack_eval), 0, 1)
            else:
                probs = np.zeros((X_eval.shape[0], CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    probs[:, cls] = np.clip(models[cls].predict(X_eval), 0, 1)

            probs /= np.maximum(probs.sum(axis=1, keepdims=True), 1e-10)
            probs = np.maximum(probs, probability_floor)
            probs /= probs.sum(axis=1, keepdims=True)

            pred = probs.reshape(h, w, CLASS_COUNT)
            breakdown = score_prediction(gt, pred)
            seed_scores.append(breakdown.score)
            seed_kls.append(breakdown.weighted_kl)

        fold_score = float(np.mean(seed_scores))
        fold_kl = float(np.mean(seed_kls))
        fold_scores.append(fold_score)
        fold_kls.append(fold_kl)
        print(f"  Score: {fold_score:.4f}  KL: {fold_kl:.6f}  Time: {time.time() - fold_start:.1f}s")

    mean_score = float(np.mean(fold_scores))
    mean_kl = float(np.mean(fold_kls))
    print(f"\n{'='*60}\nOVERALL: score={mean_score:.4f}  kl={mean_kl:.6f}  time={time.time()-total_start:.1f}s\n{'='*60}")
    for r, s, k in zip(all_round_ids, fold_scores, fold_kls):
        print(f"  {r[:8]}... score={s:.4f} kl={k:.6f}")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score, "mean_weighted_kl": mean_kl,
        "model_type": model_type, "per_class_tuning": use_per_class_tuning,
        "per_fold": [{"round_id": r, "score": s, "kl": k} for r, s, k in zip(all_round_ids, fold_scores, fold_kls)],
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="agent3_v6_default")
    parser.add_argument("--model-type", choices=["lgb", "xgb", "stack"], default="lgb")
    parser.add_argument("--n-estimators", type=int, default=800)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--probability-floor", type=float, default=0.0001)
    parser.add_argument("--n-episodes", type=int, default=1)
    parser.add_argument("--n-jobs", type=int, default=32)
    parser.add_argument("--no-per-class-tuning", action="store_true")
    args = parser.parse_args()
    run_v6_benchmark(
        name=args.name, model_type=args.model_type,
        n_estimators=args.n_estimators, max_depth=args.max_depth,
        learning_rate=args.learning_rate, probability_floor=args.probability_floor,
        n_episodes=args.n_episodes, n_jobs=args.n_jobs,
        use_per_class_tuning=not args.no_per_class_tuning,
    )
