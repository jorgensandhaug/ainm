#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from time import perf_counter

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from astar.envs import CompetitionEvaluator
from astar.envs.historical import HistoricalReplayOracle
from astar.envs.types import GroundTruthBundle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.interactive import build_online_predictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def _default_eval_policies(values: list[str] | None) -> tuple[str, ...]:
    if values:
        return tuple(dict.fromkeys(item.strip().lower() for item in values))
    return (
        "coverage",
        "exploration_r3",
        "adaptive_r5",
        "postinfo_r3",
        "postinfo_r5",
        "scoregain_r3",
        "scoregain_r5",
    )


def _build_truth_bundle(paths: WorkspacePaths, round_id: str) -> GroundTruthBundle:
    analyses = read_analysis_records(paths, round_id)
    if not analyses:
        raise ValueError(f"round {round_id} has no saved analyses")
    truths_by_seed = {
        seed_index: np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
        for seed_index, analysis_record in sorted(analyses.items())
    }
    return GroundTruthBundle(round_id=round_id, truths_by_seed=truths_by_seed)


def _score_bundle(
    evaluator: CompetitionEvaluator,
    prediction_bundle,
    truth_bundle: GroundTruthBundle,
) -> tuple[float, float]:
    score_by_seed = evaluator.score_prediction(prediction_bundle, truth_bundle)
    mean_score = sum(item.score for item in score_by_seed.values()) / float(len(score_by_seed))
    mean_weighted_kl = sum(item.weighted_kl for item in score_by_seed.values()) / float(len(score_by_seed))
    return mean_score, mean_weighted_kl


def _evaluate_round(
    *,
    root: str,
    held_out_round_id: str,
    selected_round_ids: tuple[str, ...],
    model_name: str,
    fit_policy_name: str,
    eval_policy_names: tuple[str, ...],
    samples_per_round: int,
    budget: int,
    episode_seed: int,
) -> dict[str, object]:
    paths = WorkspacePaths.from_root(root)
    evaluator = CompetitionEvaluator()
    oracle = HistoricalReplayOracle(paths=paths)
    truth_bundle = _build_truth_bundle(paths, held_out_round_id)
    training_round_ids = [round_id for round_id in selected_round_ids if round_id != held_out_round_id]
    started_at = perf_counter()

    predictor = build_online_predictor(
        model_name,
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=fit_policy_name,
        samples_per_round=samples_per_round,
    )

    rows: list[dict[str, object]] = []
    for eval_policy_name in eval_policy_names:
        policy = build_interactive_policy(eval_policy_name, predictor=predictor)
        episode = run_online_episode(
            oracle,
            round_id=held_out_round_id,
            predictor=predictor,
            policy=policy,
            budget=budget,
            episode_seed=episode_seed,
        )
        mean_score, mean_weighted_kl = _score_bundle(
            evaluator,
            episode.prediction_bundle,
            truth_bundle,
        )
        rows.append(
            {
                "round_id": held_out_round_id,
                "fit_policy_name": fit_policy_name,
                "eval_policy_name": eval_policy_name,
                "score": mean_score,
                "weighted_kl": mean_weighted_kl,
                "executed_queries": episode.executed_queries,
            },
        )
    return {
        "round_id": held_out_round_id,
        "model_name": model_name,
        "fit_policy_name": fit_policy_name,
        "samples_per_round": samples_per_round,
        "budget": budget,
        "episode_seed": episode_seed,
        "elapsed_seconds": perf_counter() - started_at,
        "rows": rows,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent5_policy_eval_sweep",
        description="Hold predictor training fixed and sweep only eval policies.",
    )
    parser.add_argument("--root", default=str(REPO_ROOT))
    parser.add_argument("--model", default="greybox_student_joint_repeataware")
    parser.add_argument("--fit-policy", default="exploration_r3")
    parser.add_argument("--eval-policy", action="append", default=None)
    parser.add_argument("--round-id", action="append", default=None)
    parser.add_argument("--eval-round-id", action="append", default=None)
    parser.add_argument("--samples-per-round", type=int, default=4)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--episode-seed", type=int, default=0)
    parser.add_argument("--max-workers", type=int, default=None)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    paths = WorkspacePaths.from_root(args.root)
    selected_round_ids = tuple(discover_historical_eval_round_ids(paths, args.round_id))
    eval_round_ids = tuple(args.eval_round_id) if args.eval_round_id else selected_round_ids
    invalid_eval_round_ids = [round_id for round_id in eval_round_ids if round_id not in selected_round_ids]
    if invalid_eval_round_ids:
        raise ValueError(
            "eval_round_ids must be within selected round_ids: "
            + ", ".join(invalid_eval_round_ids),
        )
    eval_policy_names = _default_eval_policies(args.eval_policy)

    configs = [
        {
            "root": str(paths.root),
            "held_out_round_id": held_out_round_id,
            "selected_round_ids": selected_round_ids,
            "model_name": args.model,
            "fit_policy_name": args.fit_policy.strip().lower(),
            "eval_policy_names": eval_policy_names,
            "samples_per_round": int(args.samples_per_round),
            "budget": int(args.budget),
            "episode_seed": int(args.episode_seed),
        }
        for held_out_round_id in eval_round_ids
    ]

    max_workers = args.max_workers
    if max_workers is None:
        max_workers = min(len(configs), max(1, os.cpu_count() or 1))
    max_workers = max(1, min(int(max_workers), len(configs)))

    round_results: list[dict[str, object]] = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        future_to_config = {
            executor.submit(_evaluate_round, **config): config
            for config in configs
        }
        for future in as_completed(future_to_config):
            result = future.result()
            round_results.append(result)
            print(json.dumps(result, sort_keys=True), flush=True)

    aggregate_rows: dict[str, list[dict[str, object]]] = defaultdict(list)
    for result in round_results:
        for row in result["rows"]:
            aggregate_rows[str(row["eval_policy_name"])].append(row)

    ranking: list[dict[str, object]] = []
    for eval_policy_name, rows in aggregate_rows.items():
        ranking.append(
            {
                "model_name": args.model,
                "fit_policy_name": args.fit_policy.strip().lower(),
                "eval_policy_name": eval_policy_name,
                "round_count": len(rows),
                "mean_score": float(np.mean([float(row["score"]) for row in rows])),
                "mean_weighted_kl": float(np.mean([float(row["weighted_kl"]) for row in rows])),
                "mean_executed_queries": float(np.mean([float(row["executed_queries"]) for row in rows])),
            },
        )
    ranking.sort(
        key=lambda item: (
            -float(item["mean_score"]),
            float(item["mean_weighted_kl"]),
            -float(item["mean_executed_queries"]),
            str(item["eval_policy_name"]),
        ),
    )
    if ranking:
        print("# ranking", flush=True)
        print(json.dumps(ranking, sort_keys=True, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
