"""Agent3: Rich settlement and faction features.

Adds features from settlement data that aren't currently used:
1. Faction/owner_id analysis (distinct factions, faction sizes, territory)
2. Settlement health distribution (population/food/wealth quartiles)
3. Settlement survival analysis (alive fraction, dead settlement patterns)
4. Spatial settlement graph features (clustering, connectivity)
5. Settlement density gradients and frontiers
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np

from agent3_cellwise_live_lgb import build_map_features, build_viewport_evidence_features
from agent3_cellwise_live_lgb_v4 import build_cross_seed_evidence, build_settlement_proximity_from_evidence
from agent3_cellwise_live_lgb_v5 import build_activity_heatmap_features, _gaussian_smooth
from agent3_multiep_v1 import build_multi_episode_variance_features, load_cached_observations
from agent3_stacking_v1 import build_stacking_features


def build_rich_settlement_features(observations: list, seed_index: int, h: int, w: int) -> np.ndarray:
    """Build rich features from settlement observation data (owner_id, population, etc.)."""
    features = []

    # Collect all settlements from all observations for this seed
    all_settlements = []
    for obs in observations:
        if obs.seed_index != seed_index:
            continue
        for s in obs.settlements:
            all_settlements.append(s)

    N_FEATS = 20
    if not all_settlements:
        return np.zeros((h, w, N_FEATS), dtype=np.float64)

    # === 1. Faction/Owner analysis ===
    owners = [s.owner_id for s in all_settlements if s.alive]
    unique_owners = set(owners)
    n_factions = len(unique_owners)
    faction_sizes = {}
    for o in owners:
        faction_sizes[o] = faction_sizes.get(o, 0) + 1

    max_faction_size = max(faction_sizes.values()) if faction_sizes else 0
    faction_entropy = 0.0
    if faction_sizes:
        total = sum(faction_sizes.values())
        for count in faction_sizes.values():
            p = count / total
            if p > 0:
                faction_entropy -= p * np.log(p + 1e-10)

    # Per-cell: which faction dominates this area?
    faction_dominance = np.zeros((h, w), dtype=np.float64)
    faction_diversity = np.zeros((h, w), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            nearby_owners = []
            for s in all_settlements:
                if s.alive and abs(s.y - y) <= 5 and abs(s.x - x) <= 5:
                    nearby_owners.append(s.owner_id)
            if nearby_owners:
                from collections import Counter
                counts = Counter(nearby_owners)
                most_common = counts.most_common(1)[0][1]
                faction_dominance[y, x] = most_common / len(nearby_owners)
                # Local faction diversity
                total_local = len(nearby_owners)
                for cnt in counts.values():
                    p = cnt / total_local
                    faction_diversity[y, x] -= p * np.log(p + 1e-10)

    features.append(faction_dominance[:, :, None])
    features.append(faction_diversity[:, :, None])
    features.append(np.full((h, w, 1), n_factions / 10.0, dtype=np.float64))
    features.append(np.full((h, w, 1), max_faction_size / max(len(all_settlements), 1), dtype=np.float64))
    features.append(np.full((h, w, 1), faction_entropy, dtype=np.float64))

    # === 2. Settlement health distribution ===
    alive_settlements = [s for s in all_settlements if s.alive]
    dead_settlements = [s for s in all_settlements if not s.alive]

    alive_frac = len(alive_settlements) / max(len(all_settlements), 1)
    features.append(np.full((h, w, 1), alive_frac, dtype=np.float64))

    if alive_settlements:
        pops = [s.population for s in alive_settlements]
        foods = [s.food for s in alive_settlements]
        wealths = [s.wealth for s in alive_settlements]
        defenses = [s.defense for s in alive_settlements]

        features.append(np.full((h, w, 1), np.median(pops), dtype=np.float64))
        features.append(np.full((h, w, 1), np.std(pops) / (np.mean(pops) + 1e-8), dtype=np.float64))  # CV
        features.append(np.full((h, w, 1), np.median(foods), dtype=np.float64))
        features.append(np.full((h, w, 1), np.median(wealths), dtype=np.float64))
        features.append(np.full((h, w, 1), np.mean(defenses), dtype=np.float64))
    else:
        features.extend([np.zeros((h, w, 1), dtype=np.float64)] * 5)

    # === 3. Per-cell settlement intensity maps ===
    pop_map = np.zeros((h, w), dtype=np.float64)
    wealth_map = np.zeros((h, w), dtype=np.float64)
    defense_map = np.zeros((h, w), dtype=np.float64)
    dead_map = np.zeros((h, w), dtype=np.float64)
    sett_count_map = np.zeros((h, w), dtype=np.float64)

    for s in all_settlements:
        if 0 <= s.y < h and 0 <= s.x < w:
            sett_count_map[s.y, s.x] += 1
            if s.alive:
                pop_map[s.y, s.x] += s.population
                wealth_map[s.y, s.x] += s.wealth
                defense_map[s.y, s.x] += s.defense
            else:
                dead_map[s.y, s.x] += 1

    safe = np.maximum(sett_count_map, 1.0)
    features.append((pop_map / safe)[:, :, None])
    features.append((wealth_map / safe)[:, :, None])
    features.append((defense_map / safe)[:, :, None])
    features.append((dead_map / safe)[:, :, None])

    # Smoothed versions
    features.append(_gaussian_smooth(pop_map / safe, 3.0)[:, :, None])
    features.append(_gaussian_smooth(wealth_map / safe, 3.0)[:, :, None])
    features.append(_gaussian_smooth(dead_map / safe, 3.0)[:, :, None])

    # === 4. Port density ===
    port_count = sum(1 for s in all_settlements if s.has_port and s.alive)
    features.append(np.full((h, w, 1), port_count / max(len(alive_settlements), 1), dtype=np.float64))

    # === 5. Expansion indicator ===
    # If total observed settlements >> initial settlements, expansion happened
    features.append(np.full((h, w, 1), len(alive_settlements) / 30.0, dtype=np.float64))

    return np.concatenate(features, axis=-1)


def run_rich_features_benchmark(
    *,
    name: str = "rich_features_v1",
    n_estimators: int = 800,
    max_depth: int = 10,
    learning_rate: float = 0.02,
    probability_floor: float = 0.0001,
    policy: str = "exploration",
    n_jobs_model: int = 48,
    episode_seeds: list[int] | None = None,
    train_episode_count: int = 3,
    eval_avg_count: int = 10,
) -> dict:
    import lightgbm as lgb
    from astar.core.score import score_prediction, entropy_map
    from astar.core.terrain import CLASS_COUNT
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.workflows.model_eval import discover_historical_eval_round_ids

    if episode_seeds is None:
        episode_seeds = list(range(0, 10000, 1000))

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"

    all_round_ids = discover_historical_eval_round_ids(paths)
    usable = [rid for rid in all_round_ids
              if all((cache_dir / f"{rid}__{policy}__budget=50__seed={es}.pkl").exists()
                     for es in episode_seeds)]
    all_round_ids = usable
    print(f"Rich features on {len(all_round_ids)} rounds")

    obs_cache = {}
    for rid in all_round_ids:
        obs_cache[rid] = {es: load_cached_observations(cache_dir, rid, policy, 50, es)
                          for es in episode_seeds}

    total_start = time.time()
    fold_results = []

    for fold_idx, held_out_round in enumerate(all_round_ids):
        train_rounds = [r for r in all_round_ids if r != held_out_round]
        fold_start = time.time()

        # Stage 1 with rich features
        X1_parts, Y_parts, W_parts = [], [], []
        for round_id in train_rounds:
            rr = read_round_record(paths, round_id)
            rd = rr.round
            analyses = read_analysis_records(paths, round_id)
            h, w = rd.map_height, rd.map_width
            all_ep = [obs_cache[round_id][es] for es in episode_seeds]
            for ep_idx in range(min(train_episode_count, len(episode_seeds))):
                obs = obs_cache[round_id][episode_seeds[ep_idx]]
                for si, ana in sorted(analyses.items()):
                    ist = rd.initial_states[si]
                    grid = np.asarray(ist.grid, dtype=np.int64)
                    gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)
                    fp = [build_map_features(grid, ist.settlements),
                          build_viewport_evidence_features(obs, si, h, w),
                          build_cross_seed_evidence(obs, si, h, w),
                          build_settlement_proximity_from_evidence(obs, si, h, w),
                          build_activity_heatmap_features(obs, si, h, w),
                          build_multi_episode_variance_features(all_ep, si, h, w),
                          build_rich_settlement_features(obs, si, h, w)]
                    c = np.concatenate(fp, axis=-1)
                    X1_parts.append(c.reshape(-1, c.shape[-1]))
                    Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt)
                    W_parts.append(np.maximum(ent.ravel(), 0.01))

        X1 = np.concatenate(X1_parts, axis=0)
        Y = np.concatenate(Y_parts, axis=0)
        W = np.concatenate(W_parts, axis=0)

        s1_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(objective="regression", n_estimators=n_estimators,
                                  max_depth=max_depth, learning_rate=learning_rate,
                                  min_child_samples=50, subsample=0.7, colsample_bytree=0.7,
                                  num_leaves=63, verbose=-1, n_jobs=n_jobs_model, random_state=42)
            m.fit(X1, Y[:, cls], sample_weight=W)
            s1_models[cls] = m

        # Stage 2
        X2_parts, Y2_parts, W2_parts = [], [], []
        cell_idx = 0
        for round_id in train_rounds:
            rr = read_round_record(paths, round_id); rd = rr.round
            analyses = read_analysis_records(paths, round_id)
            h, w = rd.map_height, rd.map_width
            for ep_idx in range(min(train_episode_count, len(episode_seeds))):
                for si, ana in sorted(analyses.items()):
                    gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)
                    n = h * w; x1 = X1[cell_idx:cell_idx+n]; cell_idx += n
                    s1p = np.zeros((n, CLASS_COUNT))
                    for cls in range(CLASS_COUNT):
                        s1p[:, cls] = np.clip(s1_models[cls].predict(x1), 1e-8, 1.0)
                    s1p /= np.maximum(s1p.sum(axis=1, keepdims=True), 1e-10)
                    sf = build_stacking_features(s1p.reshape(h,w,CLASS_COUNT), h, w)
                    X2_parts.append(np.concatenate([x1, sf.reshape(-1, sf.shape[-1])], axis=-1))
                    Y2_parts.append(gt.reshape(-1, CLASS_COUNT))
                    ent = entropy_map(gt); W2_parts.append(np.maximum(ent.ravel(), 0.01))

        X2 = np.concatenate(X2_parts, axis=0)
        Y2 = np.concatenate(Y2_parts, axis=0)
        W2 = np.concatenate(W2_parts, axis=0)

        s2_models = {}
        for cls in range(CLASS_COUNT):
            m = lgb.LGBMRegressor(objective="regression", n_estimators=400, max_depth=8,
                                  learning_rate=learning_rate, min_child_samples=50, subsample=0.7,
                                  colsample_bytree=0.7, num_leaves=63, verbose=-1,
                                  n_jobs=n_jobs_model, random_state=42)
            m.fit(X2, Y2[:, cls], sample_weight=W2)
            s2_models[cls] = m

        # Eval with averaging
        rr = read_round_record(paths, held_out_round); rd = rr.round
        analyses = read_analysis_records(paths, held_out_round)
        eval_all = [obs_cache[held_out_round][es] for es in episode_seeds]
        seed_scores = []

        for si, ana in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ana.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            all_preds = []
            for ep_idx in range(min(eval_avg_count, len(episode_seeds))):
                eobs = obs_cache[held_out_round][episode_seeds[ep_idx]]
                fp = [build_map_features(grid, ist.settlements),
                      build_viewport_evidence_features(eobs, si, h, w),
                      build_cross_seed_evidence(eobs, si, h, w),
                      build_settlement_proximity_from_evidence(eobs, si, h, w),
                      build_activity_heatmap_features(eobs, si, h, w),
                      build_multi_episode_variance_features(eval_all, si, h, w),
                      build_rich_settlement_features(eobs, si, h, w)]
                c = np.concatenate(fp, axis=-1); X_e = c.reshape(-1, c.shape[-1])
                s1p = np.zeros((h*w, CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    s1p[:, cls] = np.clip(s1_models[cls].predict(X_e), 1e-8, 1.0)
                s1p /= np.maximum(s1p.sum(axis=1, keepdims=True), 1e-10)
                sf = build_stacking_features(s1p.reshape(h,w,CLASS_COUNT), h, w)
                X2_e = np.concatenate([X_e, sf.reshape(-1, sf.shape[-1])], axis=-1)
                s2p = np.zeros((h*w, CLASS_COUNT))
                for cls in range(CLASS_COUNT):
                    s2p[:, cls] = np.clip(s2_models[cls].predict(X2_e), 1e-8, 1.0)
                s2p /= np.maximum(s2p.sum(axis=1, keepdims=True), 1e-10)
                all_preds.append(s2p)

            log_avg = np.mean([np.log(np.maximum(p, 1e-8)) for p in all_preds], axis=0)
            avg = np.exp(log_avg); avg /= avg.sum(axis=1, keepdims=True)
            avg = np.maximum(avg, probability_floor); avg /= avg.sum(axis=1, keepdims=True)
            bd = score_prediction(gt, avg.reshape(h, w, CLASS_COUNT))
            seed_scores.append(bd.score)

        fold_score = float(np.mean(seed_scores))
        fold_results.append({"fold_idx": fold_idx, "held_out_round": held_out_round,
                             "score": fold_score, "time_s": time.time() - fold_start})
        print(f"  Fold {fold_idx+1}/{len(all_round_ids)}: {held_out_round[:8]}... score={fold_score:.4f}")

    mean_score = float(np.mean([r["score"] for r in fold_results]))
    print(f"\nRICH FEATURES: {mean_score:.4f} (n_features={X1.shape[1]})")

    output_dir = paths.root / "data" / "artifacts" / "runs" / name
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results.json").write_text(json.dumps({
        "name": name, "mean_score": mean_score, "n_features": int(X1.shape[1]),
        "total_time_s": time.time() - total_start, "per_fold": fold_results,
    }, indent=2, default=str))
    return {"mean_score": mean_score}


if __name__ == "__main__":
    run_rich_features_benchmark(name="rich_features_v1", n_jobs_model=48)
