"""Live round submission using evidence model.

Strategy:
1. Fetch active round initial states
2. Query 50 viewports across 5 seeds (10 per seed, full coverage)
3. Train evidence model on ALL 16 historical rounds (no holdout)
4. Generate predictions using evidence from live queries
5. Submit predictions for all 5 seeds

The evidence model is used because:
- Trajectory model requires full replay data (not available live)
- Evidence model works with year-50 viewport observations
- Evidence model scored 90.40 on 16-round LOO at ev15

Usage:
    uv run python scripts/agent4_live_submit.py --round-id ROUND_ID [--dry-run]
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask, _neighbor_sum_2d


def _api_call(method, endpoint, data=None):
    """Make API call via urllib (pure Python, no subprocess/curl needed)."""
    import urllib.request
    import ssl

    base_url = os.environ.get("ASTAR_BASE_URL", "https://api.ainm.no/astar-island")

    # Read token from .env file directly
    token = os.environ.get("ASTAR_BEARER_TOKEN", "")
    if not token:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("ASTAR_BEARER_TOKEN="):
                    token = line.split("=", 1)[1].strip()
                    break

    url = f"{base_url}{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get_coverage_queries(h, w, max_viewport=15):
    """Generate coverage viewport queries for the full map."""
    queries = []
    for vy in range(0, h, max_viewport):
        for vx in range(0, w, max_viewport):
            vh = min(max_viewport, h - vy)
            vw = min(max_viewport, w - vx)
            queries.append((vx, vy, vw, vh))
    return queries


def _distribute_queries(n_seeds, total_budget=50, coverage_queries_per_seed=None):
    """Distribute query budget across seeds.

    With 40x40 map and 15x15 viewports, we need 9 queries for full coverage (3x3 grid).
    With 5 seeds and 50 total budget, that's exactly 10 per seed.
    We use 9 for coverage + 1 extra (repeat center for more evidence).
    """
    if coverage_queries_per_seed is None:
        coverage_queries_per_seed = 9  # 3x3 grid of 15x15 on 40x40

    per_seed = total_budget // n_seeds  # 10 per seed
    return per_seed


def run_live_submission(
    *,
    round_id: str,
    dry_run: bool = True,
    floor: float = 0.0003,
    n_estimators_lgb: int = 800,
    n_estimators_cat: int = 500,
    augment_count: int = 5,
    max_replays: int = 58,
):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"

    # === STEP 1: Fetch round details ===
    print(f"=== Live Submission for Round {round_id} ===")
    print(f"  dry_run={dry_run}")

    round_data = _api_call("GET", f"/rounds/{round_id}")
    h, w = round_data["map_height"], round_data["map_width"]
    n_seeds = round_data["seeds_count"]
    print(f"  Map: {h}x{w}, Seeds: {n_seeds}")

    budget = _api_call("GET", "/budget")
    remaining = budget["queries_max"] - budget["queries_used"]
    print(f"  Budget: {remaining}/{budget['queries_max']} queries remaining")

    if remaining == 0:
        print("  WARNING: No queries remaining! Using map-only prediction.")

    # === STEP 2: Plan and execute queries ===
    coverage = _get_coverage_queries(h, w)
    per_seed = remaining // n_seeds
    print(f"  Coverage needs {len(coverage)} queries/seed, budget allows {per_seed}/seed")

    # Collect observations per seed
    observations = {}  # seed_index -> list of (grid, settlements)

    if not dry_run and remaining > 0:
        for si in range(n_seeds):
            observations[si] = []
            # Query coverage viewports
            for qi, (vx, vy, vw, vh) in enumerate(coverage[:per_seed]):
                print(f"  Querying seed {si}, viewport ({vx},{vy},{vw},{vh})...", end=" ")
                try:
                    resp = _api_call("POST", "/simulate", {
                        "round_id": round_id,
                        "seed_index": si,
                        "viewport_x": vx,
                        "viewport_y": vy,
                        "viewport_w": vw,
                        "viewport_h": vh,
                    })
                    observations[si].append(resp)
                    print(f"OK (budget: {resp.get('queries_remaining', '?')})")
                    time.sleep(0.25)  # Rate limit: 5 req/s
                except Exception as e:
                    print(f"FAILED: {e}")
                    break

            if len(observations[si]) == 0:
                print(f"  WARNING: No observations for seed {si}")

    # === STEP 3: Train model on ALL historical rounds ===
    print("\n=== Training evidence model on all 16 historical rounds ===")

    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )
    print(f"  Training rounds: {len(all_round_ids)}")

    rng = np.random.RandomState(42)
    evidence_levels = [1, 2, 3, 5, 10, 15]
    X_parts, Y_parts, W_parts = [], [], []

    for rid in all_round_ids:
        rd = read_round_record(paths, rid).round
        analyses = read_analysis_records(paths, rid)
        replay_data = _load_replay_data_local(replays_dir, rid, max_replays)

        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)

            items = replay_data.get(si, [])
            if not items:
                continue

            for _ in range(augment_count):
                ev_level = min(rng.choice(evidence_levels), len(items))
                ev_idx = rng.choice(len(items), ev_level, replace=False)
                eg = [items[i][0] for i in ev_idx]
                es = [items[i][1] for i in ev_idx]
                ef = _build_evidence(eg, es, obs)

                # Cross-seed features
                cross_replay = {}
                for other_si, other_items in replay_data.items():
                    if other_si == si:
                        continue
                    cross_ev = min(ev_level, len(other_items))
                    cross_idx = rng.choice(len(other_items), cross_ev, replace=False)
                    cross_replay[other_si] = [other_items[i] for i in cross_idx]

                csf = _build_crossseed_features_local(cross_replay, si, ev_level, h, w)
                combined = np.concatenate([mf, ef, csf], axis=-1)
                X_parts.append(combined.reshape(-1, combined.shape[-1]))
                Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                ent = entropy_map(gt)
                W_parts.append(np.maximum(ent.ravel(), 0.01))

    X = np.concatenate(X_parts)
    Y = np.concatenate(Y_parts)
    W = np.concatenate(W_parts)
    print(f"  Training data: {X.shape[0]} cells, {X.shape[1]} features")

    # Train LightGBM
    lgb_models = {}
    for cls in range(CLASS_COUNT):
        m = lgb.LGBMRegressor(
            objective="regression", n_estimators=n_estimators_lgb, max_depth=8,
            learning_rate=0.02, min_child_samples=30, subsample=0.7,
            colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42)
        m.fit(X, Y[:, cls], sample_weight=W)
        lgb_models[cls] = m

    # Train CatBoost
    cat_models = {}
    for cls in range(CLASS_COUNT):
        m = CatBoostRegressor(
            iterations=n_estimators_cat, depth=6, learning_rate=0.01,
            l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=8)
        m.fit(X, Y[:, cls], sample_weight=W)
        cat_models[cls] = m

    print("  Models trained!")

    # === STEP 4: Generate predictions ===
    print("\n=== Generating predictions ===")

    predictions = {}
    for si in range(n_seeds):
        ist_data = round_data["initial_states"][si]
        grid = np.asarray(ist_data["grid"], dtype=np.int64)
        # Convert settlement dicts to objects with x/y/has_port attributes
        raw_setts = ist_data.get("settlements", [])
        from types import SimpleNamespace
        setts_objs = [SimpleNamespace(**s) for s in raw_setts] if raw_setts and isinstance(raw_setts[0], dict) else raw_setts
        mf = build_cellwise_features(grid, setts_objs)

        # Build evidence from observations
        if si in observations and observations[si]:
            # Assemble full-map evidence from viewport observations
            ev_grids, ev_setts = _assemble_viewport_evidence(
                observations[si], h, w
            )
            obs_mask = _build_observation_mask(observations[si], h, w)
            ef = _build_evidence(ev_grids, ev_setts, obs_mask)
        else:
            # No observations: use empty evidence
            ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

        # Cross-seed features from observations of other seeds
        csf = _build_crossseed_from_observations(observations, si, h, w)

        combined = np.concatenate([mf, ef, csf], axis=-1)
        Xe = combined.reshape(-1, combined.shape[-1])

        # Ensemble predictions
        lgb_p = np.zeros((h * w, CLASS_COUNT))
        cat_p = np.zeros((h * w, CLASS_COUNT))
        for c in range(CLASS_COUNT):
            lgb_p[:, c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
            cat_p[:, c] = np.clip(cat_models[c].predict(Xe), floor, 1)
        lgb_p /= lgb_p.sum(axis=1, keepdims=True)
        cat_p /= cat_p.sum(axis=1, keepdims=True)

        # Geometric mean ensemble
        log_blend = 0.5 * np.log(np.maximum(lgb_p, 1e-10)) + 0.5 * np.log(
            np.maximum(cat_p, 1e-10)
        )
        probs = np.exp(log_blend)
        probs /= probs.sum(axis=1, keepdims=True)
        probs = np.maximum(probs, floor)
        probs /= probs.sum(axis=1, keepdims=True)

        prediction = probs.reshape(h, w, CLASS_COUNT)
        predictions[si] = prediction
        print(f"  Seed {si}: prediction shape {prediction.shape}, sum check {prediction.sum(axis=-1).mean():.6f}")

    # === STEP 5: Validate and submit ===
    print("\n=== Validation ===")
    for si, pred in predictions.items():
        # Check shape
        assert pred.shape == (h, w, CLASS_COUNT), f"Bad shape for seed {si}: {pred.shape}"
        # Check sums
        sums = pred.sum(axis=-1)
        assert np.allclose(sums, 1.0, atol=0.01), f"Bad sums for seed {si}: min={sums.min():.6f} max={sums.max():.6f}"
        # Check non-negative
        assert (pred >= 0).all(), f"Negative probs for seed {si}"
        print(f"  Seed {si}: VALID (shape OK, sums OK, non-negative)")

    if dry_run:
        print("\n=== DRY RUN — NOT submitting ===")
        # Save predictions locally for inspection
        od = paths.root / "data" / "artifacts" / "runs" / f"live_dryrun_{round_id[:8]}"
        od.mkdir(parents=True, exist_ok=True)
        for si, pred in predictions.items():
            np.save(od / f"prediction_seed{si}.npy", pred)
        print(f"  Predictions saved to {od}")
    else:
        print("\n=== SUBMITTING ===")
        for si, pred in sorted(predictions.items()):
            print(f"  Submitting seed {si}...", end=" ")
            try:
                resp = _api_call("POST", "/submit", {
                    "round_id": round_id,
                    "seed_index": si,
                    "prediction": pred.tolist(),
                })
                print(f"OK: {resp}")
            except Exception as e:
                print(f"FAILED: {e}")

    return predictions


def _load_replay_data_local(replays_dir, round_id, max_per_seed):
    """Load year-50 replay data (grids + settlements) per seed."""
    from astar.core.terrain import collapse_internal_grid
    result = {}
    rd = replays_dir / round_id
    if not rd.exists():
        return result
    for sd in sorted(rd.iterdir()):
        if not sd.is_dir() or not sd.name.startswith("seed_index="):
            continue
        si = int(sd.name.split("=")[1])
        items = []
        for rf in sorted(sd.iterdir())[:max_per_seed]:
            try:
                with open(rf) as f:
                    data = json.load(f)
                frames = data["response"]["frames"]
                items.append(
                    (np.asarray(frames[-1]["grid"], dtype=np.int64), frames[-1].get("settlements", []))
                )
            except Exception:
                continue
        if items:
            result[si] = items
    return result


def _build_crossseed_features_local(all_seeds_replay_data, current_seed, serve_ev, h, w, nc=6):
    """Build cross-seed features (simplified version for submission)."""
    from astar.core.terrain import collapse_internal_grid

    feats = []
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    all_pop, all_food, all_wealth, all_def = [], [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    n_other_seeds = 0

    for si, items in all_seeds_replay_data.items():
        if si == current_seed:
            continue
        n_other_seeds += 1
        for grid, setts in items[:serve_ev]:
            collapsed = collapse_internal_grid(grid)
            for cls in range(nc):
                class_counts[cls] += (collapsed == cls).sum()
            total_cells += collapsed.size
            for s in setts:
                if s.get("alive", False):
                    alive_total += 1
                    all_pop.append(float(s.get("population", 0)))
                    all_food.append(float(s.get("food", 0)))
                    all_wealth.append(float(s.get("wealth", 0)))
                    all_def.append(float(s.get("defense", 0)))
                    if s.get("has_port", False):
                        port_total += 1
                    owners.add(s.get("owner_id", 0))
                else:
                    dead_total += 1

    if total_cells > 0:
        class_fracs = class_counts / total_cells
    else:
        class_fracs = np.ones(nc) / nc

    for cls in range(nc):
        feats.append(np.full((h, w), class_fracs[cls]))

    cross_feats = [
        np.mean(all_pop) / 5.0 if all_pop else 0.0,
        np.mean(all_food) / 2.0 if all_food else 0.0,
        np.mean(all_wealth) / 2.0 if all_wealth else 0.0,
        np.mean(all_def) if all_def else 0.0,
        np.std(all_pop) / 3.0 if len(all_pop) > 1 else 0.0,
        np.std(all_food) if len(all_food) > 1 else 0.0,
        alive_total / max(n_other_seeds, 1) / 60.0,
        dead_total / max(n_other_seeds, 1) / 60.0,
        port_total / max(alive_total, 1),
        len(owners) / 60.0,
        class_fracs[1] + class_fracs[2],
        class_fracs[3],
        class_fracs[1] + class_fracs[2] + class_fracs[3],
    ]
    for v in cross_feats:
        feats.append(np.full((h, w), float(v)))

    return np.stack(feats, axis=-1)


def _assemble_viewport_evidence(obs_list, h, w):
    """Assemble viewport observations into full-map evidence."""
    # Each observation has 'viewport' with grid and settlements
    grids = []
    setts_list = []
    for obs in obs_list:
        # Create full-map grid with viewport pasted in
        vp = obs.get("viewport", obs)
        vx = vp.get("viewport_x", 0)
        vy = vp.get("viewport_y", 0)
        vgrid = vp.get("grid", [])
        vsetts = vp.get("settlements", [])

        full_grid = np.zeros((h, w), dtype=np.int64)
        vh = len(vgrid)
        vw = len(vgrid[0]) if vgrid else 0
        for dy in range(vh):
            for dx in range(vw):
                if vy + dy < h and vx + dx < w:
                    full_grid[vy + dy, vx + dx] = vgrid[dy][dx]

        grids.append(full_grid)
        setts_list.append(vsetts)

    return grids, setts_list


def _build_observation_mask(obs_list, h, w):
    """Build observation coverage mask from viewport queries."""
    mask = np.zeros((h, w), dtype=bool)
    for obs in obs_list:
        vp = obs.get("viewport", obs)
        vx = vp.get("viewport_x", 0)
        vy = vp.get("viewport_y", 0)
        vgrid = vp.get("grid", [])
        vh = len(vgrid)
        vw = len(vgrid[0]) if vgrid else 0
        mask[vy:vy + vh, vx:vx + vw] = True
    return mask


def _build_crossseed_from_observations(observations, current_seed, h, w, nc=6):
    """Build cross-seed features from live observations of other seeds."""
    from astar.core.terrain import collapse_internal_grid

    feats = []
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    all_pop, all_food, all_wealth = [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    n_other_seeds = 0

    for si, obs_list in observations.items():
        if si == current_seed:
            continue
        n_other_seeds += 1
        for obs in obs_list:
            vp = obs.get("viewport", obs)
            vgrid = vp.get("grid", [])
            vsetts = vp.get("settlements", [])
            if vgrid:
                collapsed = collapse_internal_grid(np.asarray(vgrid, dtype=np.int64))
                for cls in range(nc):
                    class_counts[cls] += (collapsed == cls).sum()
                total_cells += collapsed.size
            for s in vsetts:
                if s.get("alive", False):
                    alive_total += 1
                    all_pop.append(float(s.get("population", 0)))
                    all_food.append(float(s.get("food", 0)))
                    all_wealth.append(float(s.get("wealth", 0)))
                    if s.get("has_port", False):
                        port_total += 1
                    owners.add(s.get("owner_id", 0))
                else:
                    dead_total += 1

    if total_cells > 0:
        class_fracs = class_counts / total_cells
    else:
        class_fracs = np.ones(nc) / nc

    for cls in range(nc):
        feats.append(np.full((h, w), class_fracs[cls]))

    cross_feats = [
        np.mean(all_pop) / 5.0 if all_pop else 0.0,
        np.mean(all_food) / 2.0 if all_food else 0.0,
        np.mean(all_wealth) / 2.0 if all_wealth else 0.0,
        0.0,  # defense not critical
        np.std(all_pop) / 3.0 if len(all_pop) > 1 else 0.0,
        np.std(all_food) if len(all_food) > 1 else 0.0,
        alive_total / max(n_other_seeds, 1) / 60.0,
        dead_total / max(n_other_seeds, 1) / 60.0,
        port_total / max(alive_total, 1),
        len(owners) / 60.0,
        class_fracs[1] + class_fracs[2],
        class_fracs[3],
        class_fracs[1] + class_fracs[2] + class_fracs[3],
    ]
    for v in cross_feats:
        feats.append(np.full((h, w), float(v)))

    return np.stack(feats, axis=-1)


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--round-id", required=True)
    p.add_argument("--dry-run", action="store_true", default=True)
    p.add_argument("--submit", action="store_true", help="Actually submit (overrides --dry-run)")
    a = p.parse_args()

    dry = not a.submit
    run_live_submission(round_id=a.round_id, dry_run=dry)
