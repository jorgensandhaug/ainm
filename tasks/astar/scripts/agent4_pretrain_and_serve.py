"""Pre-train evidence model offline, serve fast during live rounds.

Two-phase pipeline:
  Phase 1 (OFFLINE, run any time): Train LGB+CatBoost on all historical rounds, save to disk
  Phase 2 (LIVE, run when round opens): Load pre-trained model, query viewports, predict, submit

Train/serve parity:
  - Training: uses augmented evidence from replay grids at various serve_ev levels (1-15)
  - Serving: assembles 9 coverage viewports into ONE composite grid = ~serve_ev=1
  - Both use the same feature extraction pipeline (_build_evidence with full-map mask)

Usage:
  # Pre-train (run offline):
  uv run python scripts/agent4_pretrain_and_serve.py pretrain

  # Live submit (run when round opens):
  uv run python scripts/agent4_pretrain_and_serve.py serve --round-id ROUND_ID

  # Dry run (no queries, no submission):
  uv run python scripts/agent4_pretrain_and_serve.py serve --round-id ROUND_ID --dry-run
"""
from __future__ import annotations

import json
import os
import pickle
import sys
import time
import urllib.request
import ssl
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask, _neighbor_sum_2d


MODEL_DIR = Path(__file__).resolve().parent.parent / "data" / "artifacts" / "models" / "pretrained_evidence_v1"


def _api_call(method, endpoint, data=None):
    """Pure-Python API call via urllib."""
    base_url = os.environ.get("ASTAR_BASE_URL", "https://api.ainm.no/astar-island")
    token = os.environ.get("ASTAR_BEARER_TOKEN", "")
    if not token:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("ASTAR_BEARER_TOKEN="):
                    token = line.split("=", 1)[1].strip()
    url = f"{base_url}{endpoint}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pretrain(
    floor=0.0003,
    n_estimators_lgb=800,
    n_estimators_cat=500,
    augment_count=5,
    max_replays=58,
):
    """Train LGB+CatBoost on ALL historical rounds and save to disk."""
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

    all_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )

    print(f"Pre-training evidence model on {len(all_round_ids)} rounds")
    rng = np.random.RandomState(42)
    evidence_levels = [1, 2, 3, 5, 10, 15]
    X_parts, Y_parts, W_parts = [], [], []

    for ri, rid in enumerate(all_round_ids):
        print(f"  Processing round {ri+1}/{len(all_round_ids)}: {rid[:8]}...")
        rd = read_round_record(paths, rid).round
        analyses = read_analysis_records(paths, rid)
        replay_data = _load_replay_data(replays_dir, rid, max_replays)

        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)

            items = replay_data.get(si, [])
            if not items:
                continue

            # Cross-seed data
            cross_items = {
                osi: oitems for osi, oitems in replay_data.items() if osi != si
            }

            for _ in range(augment_count):
                ev_level = min(rng.choice(evidence_levels), len(items))
                ev_idx = rng.choice(len(items), ev_level, replace=False)
                eg = [items[i][0] for i in ev_idx]
                es = [items[i][1] for i in ev_idx]
                ef = _build_evidence(eg, es, obs)

                csf = _build_crossseed(cross_items, si, ev_level, h, w, rng)

                combined = np.concatenate([mf, ef, csf], axis=-1)
                X_parts.append(combined.reshape(-1, combined.shape[-1]))
                Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                ent = entropy_map(gt)
                W_parts.append(np.maximum(ent.ravel(), 0.01))

    X = np.concatenate(X_parts)
    Y = np.concatenate(Y_parts)
    W = np.concatenate(W_parts)
    print(f"Training: {X.shape[0]} cells, {X.shape[1]} features")

    # Train LightGBM
    lgb_models = {}
    for cls in range(CLASS_COUNT):
        print(f"  Training LGB class {cls}...")
        m = lgb.LGBMRegressor(
            objective="regression", n_estimators=n_estimators_lgb, max_depth=8,
            learning_rate=0.02, min_child_samples=30, subsample=0.7,
            colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42)
        m.fit(X, Y[:, cls], sample_weight=W)
        lgb_models[cls] = m

    # Train CatBoost
    cat_models = {}
    for cls in range(CLASS_COUNT):
        print(f"  Training CatBoost class {cls}...")
        m = CatBoostRegressor(
            iterations=n_estimators_cat, depth=6, learning_rate=0.01,
            l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=8)
        m.fit(X, Y[:, cls], sample_weight=W)
        cat_models[cls] = m

    # Save models
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_DIR / "lgb_models.pkl", "wb") as f:
        pickle.dump(lgb_models, f)
    with open(MODEL_DIR / "cat_models.pkl", "wb") as f:
        pickle.dump(cat_models, f)

    meta = {
        "n_rounds": len(all_round_ids),
        "n_features": X.shape[1],
        "n_cells": X.shape[0],
        "floor": floor,
        "round_ids": all_round_ids,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(MODEL_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nModels saved to {MODEL_DIR}")
    print(f"  LGB: {(MODEL_DIR / 'lgb_models.pkl').stat().st_size / 1024 / 1024:.1f} MB")
    print(f"  CatBoost: {(MODEL_DIR / 'cat_models.pkl').stat().st_size / 1024 / 1024:.1f} MB")


def serve(round_id, dry_run=True, floor=0.0003):
    """Load pre-trained model, query viewports, predict, submit."""
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.student.predictor.gbx_cellwise import build_cellwise_features
    from types import SimpleNamespace

    # Load pre-trained models
    print("Loading pre-trained models...")
    t0 = time.time()
    with open(MODEL_DIR / "lgb_models.pkl", "rb") as f:
        lgb_models = pickle.load(f)
    with open(MODEL_DIR / "cat_models.pkl", "rb") as f:
        cat_models = pickle.load(f)
    with open(MODEL_DIR / "meta.json") as f:
        meta = json.load(f)
    print(f"  Loaded in {time.time()-t0:.1f}s ({meta['n_features']} features, {meta['n_rounds']} training rounds)")

    # Fetch round details
    round_data = _api_call("GET", f"/rounds/{round_id}")
    h, w = round_data["map_height"], round_data["map_width"]
    n_seeds = round_data["seeds_count"]
    print(f"  Round: {round_id}, Map: {h}x{w}, Seeds: {n_seeds}")

    # Plan queries: 9 coverage per seed = 45, leaves 5 spare
    coverage = _get_coverage_queries(h, w)
    per_seed = 10  # 9 coverage + 1 repeat for extra evidence

    # Execute queries
    all_observations = {}  # seed -> list of viewport responses
    if not dry_run:
        budget = _api_call("GET", "/budget")
        remaining = budget["queries_max"] - budget["queries_used"]
        print(f"  Budget: {remaining} remaining")

        for si in range(n_seeds):
            all_observations[si] = []
            queries = coverage[:per_seed]
            for vx, vy, vw, vh in queries:
                try:
                    resp = _api_call("POST", "/simulate", {
                        "round_id": round_id,
                        "seed_index": si,
                        "viewport_x": vx, "viewport_y": vy,
                        "viewport_w": vw, "viewport_h": vh,
                    })
                    all_observations[si].append(resp)
                    time.sleep(0.22)  # Rate limit
                except Exception as e:
                    print(f"  Query failed: {e}")
            print(f"  Seed {si}: {len(all_observations[si])} observations")

    # Generate predictions
    print("\nGenerating predictions...")
    predictions = {}
    for si in range(n_seeds):
        ist = round_data["initial_states"][si]
        grid = np.asarray(ist["grid"], dtype=np.int64)
        setts = [SimpleNamespace(**s) for s in ist.get("settlements", [])]
        mf = build_cellwise_features(grid, setts)

        # Build evidence from observations
        if si in all_observations and all_observations[si]:
            # Assemble viewports into ONE composite grid
            composite_grid, composite_setts, obs_mask = _assemble_composite(
                all_observations[si], h, w
            )
            ef = _build_evidence([composite_grid], [composite_setts], obs_mask)
        else:
            ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

        # Cross-seed features from other seeds' observations
        csf = _build_crossseed_from_obs(all_observations, si, h, w)

        combined = np.concatenate([mf, ef, csf], axis=-1)
        Xe = combined.reshape(-1, combined.shape[-1])

        # Verify feature count matches training
        if Xe.shape[1] != meta["n_features"]:
            raise ValueError(
                f"Feature mismatch: model expects {meta['n_features']}, got {Xe.shape[1]}"
            )

        # Ensemble prediction
        lgb_p = np.zeros((h * w, CLASS_COUNT))
        cat_p = np.zeros((h * w, CLASS_COUNT))
        for c in range(CLASS_COUNT):
            lgb_p[:, c] = np.clip(lgb_models[c].predict(Xe), floor, 1)
            cat_p[:, c] = np.clip(cat_models[c].predict(Xe), floor, 1)
        lgb_p /= lgb_p.sum(axis=1, keepdims=True)
        cat_p /= cat_p.sum(axis=1, keepdims=True)

        log_blend = 0.5 * np.log(np.maximum(lgb_p, 1e-10)) + 0.5 * np.log(
            np.maximum(cat_p, 1e-10)
        )
        probs = np.exp(log_blend)
        probs /= probs.sum(axis=1, keepdims=True)
        probs = np.maximum(probs, floor)
        probs /= probs.sum(axis=1, keepdims=True)

        predictions[si] = probs.reshape(h, w, CLASS_COUNT)
        print(f"  Seed {si}: shape={predictions[si].shape}, sum={predictions[si].sum(axis=-1).mean():.6f}")

    # Validate
    print("\nValidating...")
    for si, pred in predictions.items():
        assert pred.shape == (h, w, CLASS_COUNT)
        assert np.allclose(pred.sum(axis=-1), 1.0, atol=0.01)
        assert (pred >= 0).all()
        print(f"  Seed {si}: VALID")

    # Submit
    if dry_run:
        print("\nDRY RUN — predictions NOT submitted")
        out_dir = Path(__file__).resolve().parent.parent / "data" / "artifacts" / "runs" / f"serve_dryrun_{round_id[:8]}"
        out_dir.mkdir(parents=True, exist_ok=True)
        for si, pred in predictions.items():
            np.save(out_dir / f"seed{si}.npy", pred)
        print(f"  Saved to {out_dir}")
    else:
        print("\nSubmitting...")
        for si, pred in sorted(predictions.items()):
            resp = _api_call("POST", "/submit", {
                "round_id": round_id,
                "seed_index": si,
                "prediction": pred.tolist(),
            })
            print(f"  Seed {si}: {resp}")
        print("SUBMITTED!")


def _load_replay_data(replays_dir, round_id, max_per_seed):
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
                items.append((
                    np.asarray(frames[-1]["grid"], dtype=np.int64),
                    frames[-1].get("settlements", []),
                ))
            except Exception:
                continue
        if items:
            result[si] = items
    return result


def _build_crossseed(cross_items, current_seed, ev_level, h, w, rng, nc=6):
    """Build cross-seed features matching training code exactly."""
    from astar.core.terrain import collapse_internal_grid
    feats = []
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    all_pop, all_food, all_wealth, all_def = [], [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    n_other_seeds = 0

    for osi, oitems in cross_items.items():
        n_other_seeds += 1
        cross_ev = min(ev_level, len(oitems))
        cross_idx = rng.choice(len(oitems), cross_ev, replace=False)
        for i in cross_idx:
            grid, setts = oitems[i]
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


def _build_crossseed_from_obs(all_observations, current_seed, h, w, nc=6):
    """Build cross-seed features from live viewport observations."""
    from astar.core.terrain import collapse_internal_grid
    feats = []
    class_counts = np.zeros(nc, dtype=np.float64)
    total_cells = 0
    all_pop, all_food, all_wealth, all_def = [], [], [], []
    alive_total, dead_total, port_total = 0, 0, 0
    owners = set()
    n_other_seeds = 0

    for si, obs_list in all_observations.items():
        if si == current_seed:
            continue
        n_other_seeds += 1
        # Assemble this seed's viewports into composite
        if obs_list:
            composite_grid, composite_setts, _ = _assemble_composite(obs_list, h, w)
            collapsed = collapse_internal_grid(composite_grid)
            for cls in range(nc):
                class_counts[cls] += (collapsed == cls).sum()
            total_cells += collapsed.size
            for s in composite_setts:
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


def _assemble_composite(obs_list, h, w):
    """Assemble viewport observations into ONE composite grid.

    This is the KEY function for train/serve parity.
    Instead of creating separate grids per viewport (wrong!),
    we paste all viewports into ONE grid, matching what training
    sees with serve_ev=1 (one full-map grid).
    """
    composite_grid = np.zeros((h, w), dtype=np.int64)
    obs_mask = np.zeros((h, w), dtype=bool)
    all_settlements = []
    seen_positions = set()

    for obs in obs_list:
        vp = obs.get("viewport", obs)
        vx = vp.get("viewport_x", 0)
        vy = vp.get("viewport_y", 0)
        vgrid = vp.get("grid", [])
        vsetts = vp.get("settlements", [])

        # Paste viewport into composite
        for dy, row in enumerate(vgrid):
            for dx, val in enumerate(row):
                cy, cx = vy + dy, vx + dx
                if 0 <= cy < h and 0 <= cx < w:
                    composite_grid[cy, cx] = val
                    obs_mask[cy, cx] = True

        # Collect unique settlements
        for s in vsetts:
            pos = (s.get("x", 0), s.get("y", 0))
            if pos not in seen_positions:
                seen_positions.add(pos)
                all_settlements.append(s)

    return composite_grid, all_settlements, obs_mask


def _get_coverage_queries(h, w, max_vp=15):
    """Generate tiling viewport queries for full coverage."""
    queries = []
    for vy in range(0, h, max_vp):
        for vx in range(0, w, max_vp):
            vh = min(max_vp, h - vy)
            vw = min(max_vp, w - vx)
            queries.append((vx, vy, vw, vh))
    return queries


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="command")

    pt = sub.add_parser("pretrain")

    sv = sub.add_parser("serve")
    sv.add_argument("--round-id", required=True)
    sv.add_argument("--dry-run", action="store_true")

    a = p.parse_args()

    if a.command == "pretrain":
        pretrain()
    elif a.command == "serve":
        serve(a.round_id, dry_run=a.dry_run)
    else:
        p.print_help()
