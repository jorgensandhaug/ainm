"""Live prediction using GT-crossseed ensemble model.

Trains on ALL 8 historical rounds, queries the active round,
and submits predictions.

Usage:
    uv run python scripts/agent4_live_predict.py --round-id <ROUND_ID> --submit
"""
from __future__ import annotations
import argparse, json, time, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent4_gt_evidence_model import _build_evidence, _coverage_mask
from agent4_gt_crossseed import _build_crossseed_features


def _load_replay_data(replays_dir, round_id, max_per_seed):
    result = {}
    rd = replays_dir / round_id
    if not rd.exists(): return result
    for sd in sorted(rd.iterdir()):
        if not sd.is_dir() or not sd.name.startswith("seed_index="): continue
        si = int(sd.name.split("=")[1])
        items = []
        for rf in sorted(sd.iterdir())[:max_per_seed]:
            try:
                with open(rf) as f: data = json.load(f)
                frames = data["response"]["frames"]
                items.append((np.asarray(frames[-1]["grid"], dtype=np.int64), frames[-1].get("settlements",[])))
            except: continue
        if items: result[si] = items
    return result


def run_live(*, round_id: str, submit: bool = False, budget: int = 50):
    import lightgbm as lgb
    from catboost import CatBoostRegressor
    from astar.core.score import entropy_map
    from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
    from astar.core.validation import SubmissionSpec, validate_prediction_tensor
    from astar.infra.api.client import AstarClient
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.infra.artifacts.store import read_analysis_records, read_round_record
    from astar.student.predictor.gbx_cellwise import build_cellwise_features

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    replays_dir = paths.raw_dir / "replays"
    analyses_dir = paths.raw_dir / "analyses"
    floor = 0.0003

    # Get all historical training rounds
    train_round_ids = sorted(
        d.name for d in analyses_dir.iterdir()
        if d.is_dir() and any(d.glob("seed_index=*.json"))
        and (replays_dir / d.name).exists()
    )
    print(f"Training on {len(train_round_ids)} historical rounds")

    # Build training data from ALL historical rounds
    rng = np.random.RandomState(42)
    ev_levels = [1,2,3,5,10,15]
    augment_count = 5
    max_replays = 58

    X_parts, Y_parts, W_parts = [], [], []
    for rid in train_round_ids:
        rd = read_round_record(paths, rid).round
        analyses = read_analysis_records(paths, rid)
        rdata = _load_replay_data(replays_dir, rid, max_per_seed=max_replays)
        for si, ar in sorted(analyses.items()):
            ist = rd.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            gt = np.asarray(ar.analysis.ground_truth, dtype=np.float64)
            h, w = grid.shape
            mf = build_cellwise_features(grid, ist.settlements)
            obs = _coverage_mask(h, w)
            items = rdata.get(si, [])
            if not items: continue
            for _ in range(augment_count):
                ev = min(rng.choice(ev_levels), len(items))
                idx = rng.choice(len(items), ev, replace=False)
                eg = [items[i][0] for i in idx]
                es = [items[i][1] for i in idx]
                ef = _build_evidence(eg, es, obs)
                cr = {}
                for osi, oi in rdata.items():
                    if osi == si: continue
                    cev = min(ev, len(oi))
                    cidx = rng.choice(len(oi), cev, replace=False)
                    cr[osi] = [oi[i] for i in cidx]
                csf = _build_crossseed_features(cr, si, ev, h, w)
                combined = np.concatenate([mf, ef, csf], axis=-1)
                X_parts.append(combined.reshape(-1, combined.shape[-1]))
                Y_parts.append(gt.reshape(-1, CLASS_COUNT))
                ent = entropy_map(gt)
                W_parts.append(np.maximum(ent.ravel(), 0.01))

    X = np.concatenate(X_parts); Y = np.concatenate(Y_parts); W = np.concatenate(W_parts)
    print(f"Training data: {X.shape[0]} cells, {X.shape[1]} features")

    # Train LightGBM + CatBoost
    lgb_m, cat_m = {}, {}
    for cls in range(CLASS_COUNT):
        print(f"  Training class {cls}...", end=" ", flush=True)
        m = lgb.LGBMRegressor(objective="regression", n_estimators=800, max_depth=8,
            learning_rate=0.02, min_child_samples=30, subsample=0.7,
            colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42)
        m.fit(X, Y[:,cls], sample_weight=W)
        lgb_m[cls] = m
        m2 = CatBoostRegressor(iterations=500, depth=6, learning_rate=0.01,
            l2_leaf_reg=1.0, random_seed=42, verbose=0, thread_count=8)
        m2.fit(X, Y[:,cls], sample_weight=W)
        cat_m[cls] = m2
        print("done")

    print("\nModel trained. Now querying live round...")

    # Load live round
    round_record = read_round_record(paths, round_id)
    round_detail = round_record.round
    h, w = round_detail.map_height, round_detail.map_width

    # Run queries using the existing pipeline
    client = AstarClient.from_env()

    # Check existing queries
    query_dir = paths.raw_query_dir(round_id)
    existing_queries = list(query_dir.glob("*.json")) if query_dir.exists() else []
    remaining_budget = budget - len(existing_queries)
    print(f"Existing queries: {len(existing_queries)}, remaining budget: {remaining_budget}")

    # Run coverage queries if we have budget
    if remaining_budget > 0:
        from astar.policy.coverage import CoveragePolicy
        policy = CoveragePolicy(name="coverage")

        queries_per_seed = remaining_budget // round_detail.seeds_count
        viewport_size = 15

        for seed_index in range(round_detail.seeds_count):
            for q in range(queries_per_seed):
                # Simple tiling coverage
                vy = (q * viewport_size) % h
                vx = ((q * viewport_size) // h * viewport_size) % w
                vy = min(vy, h - viewport_size)
                vx = min(vx, w - viewport_size)

                try:
                    result = client.simulate(
                        round_id=round_id,
                        seed_index=seed_index,
                        y=vy, x=vx,
                        height=viewport_size,
                        width=viewport_size,
                    )
                    # Save query
                    query_dir.mkdir(parents=True, exist_ok=True)
                    qpath = query_dir / f"q_{seed_index}_{q}_{int(time.time()*1000)}.json"
                    qpath.write_text(json.dumps({
                        "seed_index": seed_index,
                        "y": vy, "x": vx,
                        "height": viewport_size,
                        "width": viewport_size,
                        "response": result if isinstance(result, dict) else result.model_dump(),
                    }))
                    print(f"  Query seed={seed_index} ({vy},{vx}) OK")
                except Exception as e:
                    print(f"  Query seed={seed_index} ({vy},{vx}) FAILED: {e}")
                    break

    # Build evidence from query results
    print("\nBuilding evidence from queries...")

    # Load saved queries and build per-seed evidence grids
    evidence_by_seed: dict[int, tuple[np.ndarray, list[dict], np.ndarray]] = {}

    for seed_index in range(round_detail.seeds_count):
        # Construct observed grid from queries
        obs_grid = np.zeros((h, w), dtype=np.int64)
        obs_mask = np.zeros((h, w), dtype=bool)
        settlements = []

        # Load all queries for this seed
        if query_dir.exists():
            for qf in sorted(query_dir.glob("*.json")):
                try:
                    qdata = json.loads(qf.read_text())
                    if qdata.get("seed_index") != seed_index:
                        # Also check inside response
                        resp = qdata.get("response", {})
                        if resp.get("seed_index") != seed_index:
                            continue
                    resp = qdata.get("response", qdata)
                    viewport = resp.get("viewport", resp.get("grid"))
                    if viewport is None:
                        continue
                    vy = qdata.get("y", resp.get("y", 0))
                    vx = qdata.get("x", resp.get("x", 0))
                    vgrid = np.asarray(viewport, dtype=np.int64)
                    vh, vw = vgrid.shape
                    obs_grid[vy:vy+vh, vx:vx+vw] = vgrid
                    obs_mask[vy:vy+vh, vx:vx+vw] = True
                    for s in resp.get("settlements", []):
                        settlements.append(s)
                except Exception:
                    continue

        evidence_by_seed[seed_index] = (obs_grid, settlements, obs_mask)
        print(f"  Seed {seed_index}: {obs_mask.sum()} cells observed, {len(settlements)} settlements")

    # Generate predictions
    print("\nGenerating predictions...")
    predictions = {}

    for seed_index in range(round_detail.seeds_count):
        ist = round_detail.initial_states[seed_index]
        grid = np.asarray(ist.grid, dtype=np.int64)
        mf = build_cellwise_features(grid, ist.settlements)

        obs_grid, settlements, obs_mask = evidence_by_seed[seed_index]

        # Build evidence features
        if obs_mask.any():
            ef = _build_evidence([obs_grid], [settlements], obs_mask)
        else:
            # No queries — use prior only
            ef = _build_evidence([], None, np.zeros((h, w), dtype=bool))

        # Cross-seed features
        cross_data = {}
        for osi in range(round_detail.seeds_count):
            if osi == seed_index: continue
            og, os_, om = evidence_by_seed.get(osi, (np.zeros((h,w), dtype=np.int64), [], np.zeros((h,w), dtype=bool)))
            if om.any():
                cross_data[osi] = [(og, os_)]
        csf = _build_crossseed_features(cross_data, seed_index, 1, h, w)

        combined = np.concatenate([mf, ef, csf], axis=-1)
        Xe = combined.reshape(-1, combined.shape[-1])

        # Ensemble prediction
        lp = np.zeros((h*w, CLASS_COUNT))
        cp = np.zeros((h*w, CLASS_COUNT))
        for c in range(CLASS_COUNT):
            lp[:,c] = np.clip(lgb_m[c].predict(Xe), floor, 1)
            cp[:,c] = np.clip(cat_m[c].predict(Xe), floor, 1)
        lp /= lp.sum(axis=1, keepdims=True)
        cp /= cp.sum(axis=1, keepdims=True)
        log_b = 0.5*np.log(np.maximum(lp,1e-10))+0.5*np.log(np.maximum(cp,1e-10))
        probs = np.exp(log_b)
        probs /= probs.sum(axis=1, keepdims=True)
        probs = np.maximum(probs, floor)
        probs /= probs.sum(axis=1, keepdims=True)

        pred = probs.reshape(h, w, CLASS_COUNT)
        predictions[seed_index] = pred
        print(f"  Seed {seed_index}: predicted (sum check: {pred.sum(axis=-1).mean():.6f})")

    # Save and optionally submit
    pred_dir = paths.derived_dir / "predictions" / f"round_id={round_id}"
    pred_dir.mkdir(parents=True, exist_ok=True)

    for seed_index, pred in predictions.items():
        # Validate
        spec = SubmissionSpec(height=h, width=w, classes=CLASS_COUNT)
        validate_prediction_tensor(pred, spec)

        # Save
        np.savez_compressed(pred_dir / f"seed_index={seed_index}.npz", prediction=pred)
        print(f"  Saved seed {seed_index}")

        if submit:
            try:
                result = client.submit(
                    round_id=round_id,
                    seed_index=seed_index,
                    prediction=pred.tolist(),
                )
                print(f"  SUBMITTED seed {seed_index}: {result}")
            except Exception as e:
                print(f"  SUBMIT FAILED seed {seed_index}: {e}")

    print("\nDone!")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--round-id", required=True)
    p.add_argument("--submit", action="store_true")
    p.add_argument("--budget", type=int, default=50)
    a = p.parse_args()
    run_live(round_id=a.round_id, submit=a.submit, budget=a.budget)
