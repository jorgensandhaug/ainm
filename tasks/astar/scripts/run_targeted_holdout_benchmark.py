from __future__ import annotations

import argparse

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.targeted_holdout_benchmark import run_targeted_holdout_benchmark


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run corrected targeted holdout benchmark.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--held-out-round-id", action="append", dest="held_out_round_ids", required=True)
    parser.add_argument("--mode", choices=["prior_only", "online_interactive"], default="online_interactive")
    parser.add_argument("--policy", default="coverage")
    parser.add_argument("--samples-per-round", type=int, default=None)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--episode-seed", type=int, default=0)
    parser.add_argument("--with-png", choices=["none", "top", "all"], default="none")
    parser.add_argument("--name", default=None)
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--root", default=".")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    paths = WorkspacePaths.from_root(args.root)
    result = run_targeted_holdout_benchmark(
        paths,
        model_name=args.model,
        held_out_round_ids=list(args.held_out_round_ids),
        mode=args.mode,
        policy_name=args.policy,
        samples_per_round=args.samples_per_round,
        budget=args.budget,
        episode_seed=args.episode_seed,
        visualization_policy=args.with_png,
        benchmark_name=args.name,
        jobs=args.jobs,
    )
    print(f"artifact {result.artifact_path}")
    print(f"mean_score {result.aggregate.mean_score:.4f}")
    print(f"mean_weighted_kl {result.aggregate.mean_weighted_kl:.6f}")


if __name__ == "__main__":
    main()
