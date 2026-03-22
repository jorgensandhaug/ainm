"""Pre-compute and cache online episode observations for all rounds and policies.

This avoids re-running the expensive replay-backed online episodes for every LOO fold.
The cached observations are deterministic given (round_id, policy_name, budget, episode_seed).
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np


def precompute_all_episodes(
    *,
    policies: list[str] = ["coverage", "exploration"],
    budget: int = 50,
    episode_seed: int = 0,
) -> None:
    from astar.envs.synthetic import SyntheticActiveOracle
    from astar.infra.artifacts.paths import WorkspacePaths
    from astar.policy.interactive import build_interactive_policy
    from astar.student.predictor.interactive import build_online_predictor
    from astar.workflows.model_eval import discover_historical_eval_round_ids
    from astar.workflows.online_episode import run_online_episode

    paths = WorkspacePaths.from_root(Path(__file__).resolve().parent.parent)
    all_round_ids = discover_historical_eval_round_ids(paths)

    # Filter to rounds with replays
    usable = []
    for rid in all_round_ids:
        replay_dir = paths.root / "data" / "raw" / "replays" / rid
        if replay_dir.exists() and any(replay_dir.iterdir()):
            usable.append(rid)
    all_round_ids = usable
    print(f"Pre-computing episodes for {len(all_round_ids)} rounds")

    cache_dir = paths.root / "data" / "artifacts" / "episode_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    base_predictor = build_online_predictor("geometry_prior", paths=paths)
    oracle = SyntheticActiveOracle(paths=paths)

    total_start = time.time()
    for policy_name in policies:
        policy = build_interactive_policy(policy_name)
        for i, round_id in enumerate(all_round_ids):
            cache_key = f"{round_id}__{policy_name}__budget={budget}__seed={episode_seed}"
            cache_path = cache_dir / f"{cache_key}.pkl"

            if cache_path.exists():
                print(f"  [{i+1}/{len(all_round_ids)}] {round_id[:8]}... {policy_name} (cached)")
                continue

            t0 = time.time()
            episode = run_online_episode(
                oracle,
                round_id=round_id,
                predictor=base_predictor,
                policy=policy,
                budget=budget,
                episode_seed=episode_seed,
            )
            observations = list(episode.belief.observations)

            # Save observations as pickle
            with open(cache_path, "wb") as f:
                pickle.dump(observations, f, protocol=pickle.HIGHEST_PROTOCOL)

            elapsed = time.time() - t0
            print(f"  [{i+1}/{len(all_round_ids)}] {round_id[:8]}... {policy_name} "
                  f"({len(observations)} obs, {elapsed:.1f}s)")

    print(f"\nDone in {time.time() - total_start:.0f}s. Cache at {cache_dir}")


if __name__ == "__main__":
    precompute_all_episodes()
