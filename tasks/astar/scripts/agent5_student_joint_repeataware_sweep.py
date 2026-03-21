#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
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
from astar.student.predictor.greybox_student_joint_repeataware import (
    GreyboxStudentJointRepeatAwarePredictor,
)
from astar.student.predictor.interactive import RoundPredictorAdapter
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def _default_float_grid(values: list[float] | None, *, fallback: float) -> list[float]:
    return [fallback] if not values else [float(value) for value in values]


def _default_int_grid(values: list[int] | None, *, fallback: int) -> list[int]:
    return [fallback] if not values else [int(value) for value in values]


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


def _evaluate_config(
    *,
    root: str,
    selected_round_ids: tuple[str, ...],
    eval_round_ids: tuple[str, ...],
    policy_name: str,
    budget: int,
    episode_seed: int,
    samples_per_round: int,
    residual_rank: int,
    ridge_lambda: float,
    k_neighbors: int,
    memory_weight: float,
    correction_blend: float,
    correction_scale: float,
) -> dict[str, object]:
    paths = WorkspacePaths.from_root(root)
    evaluator = CompetitionEvaluator()
    policy = build_interactive_policy(policy_name)
    oracle = HistoricalReplayOracle(paths=paths)
    rows: list[dict[str, object]] = []
    started_at = perf_counter()

    for held_out_round_id in eval_round_ids:
        training_round_ids = [round_id for round_id in selected_round_ids if round_id != held_out_round_id]
        predictor_base = GreyboxStudentJointRepeatAwarePredictor.fit_from_workspace(
            paths,
            round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            residual_rank=residual_rank,
            ridge_lambda=ridge_lambda,
            k_neighbors=k_neighbors,
            memory_weight=memory_weight,
            correction_blend=correction_blend,
            correction_scale=correction_scale,
            model_name=(
                "greybox_student_joint_repeataware"
                f"__policy={policy_name}"
                f"__samples={samples_per_round}"
                f"__rank={residual_rank}"
                f"__ridge={ridge_lambda:.3f}"
                f"__k={k_neighbors}"
                f"__mw={memory_weight:.3f}"
                f"__blend={correction_blend:.3f}"
                f"__scale={correction_scale:.3f}"
            ),
        )
        predictor = RoundPredictorAdapter(predictor=predictor_base, name=predictor_base.name)
        recorder_episode = run_online_episode(
            oracle,
            round_id=held_out_round_id,
            predictor=TranscriptRecorderPredictor(),
            policy=policy,
            budget=budget,
            episode_seed=episode_seed,
        )
        prediction_bundle = predictor.predict(recorder_episode.belief)
        truth_bundle = _build_truth_bundle(paths, held_out_round_id)
        mean_score, mean_weighted_kl = _score_bundle(evaluator, prediction_bundle, truth_bundle)
        rows.append(
            {
                "round_id": held_out_round_id,
                "score": mean_score,
                "weighted_kl": mean_weighted_kl,
                "executed_queries": recorder_episode.executed_queries,
            },
        )

    return {
        "policy_name": policy_name,
        "budget": budget,
        "episode_seed": episode_seed,
        "samples_per_round": samples_per_round,
        "residual_rank": residual_rank,
        "ridge_lambda": ridge_lambda,
        "k_neighbors": k_neighbors,
        "memory_weight": memory_weight,
        "correction_blend": correction_blend,
        "correction_scale": correction_scale,
        "mean_score": float(np.mean([float(row["score"]) for row in rows])),
        "mean_weighted_kl": float(np.mean([float(row["weighted_kl"]) for row in rows])),
        "elapsed_seconds": perf_counter() - started_at,
        "rounds": rows,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent5_student_joint_repeataware_sweep",
        description="Strict held-out sweep for greybox_student_joint_repeataware.",
    )
    parser.add_argument("--root", default=str(REPO_ROOT))
    parser.add_argument("--round-id", action="append", default=None)
    parser.add_argument("--eval-round-id", action="append", default=None)
    parser.add_argument("--policy", default="coverage")
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--episode-seed", type=int, default=0)
    parser.add_argument("--samples-per-round", action="append", type=int, default=None)
    parser.add_argument("--residual-rank", action="append", type=int, default=None)
    parser.add_argument("--ridge-lambda", action="append", type=float, default=None)
    parser.add_argument("--k-neighbors", action="append", type=int, default=None)
    parser.add_argument("--memory-weight", action="append", type=float, default=None)
    parser.add_argument("--correction-blend", action="append", type=float, default=None)
    parser.add_argument("--correction-scale", action="append", type=float, default=None)
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

    sample_grid = _default_int_grid(args.samples_per_round, fallback=4)
    rank_grid = _default_int_grid(args.residual_rank, fallback=4)
    ridge_grid = _default_float_grid(args.ridge_lambda, fallback=12.0)
    neighbor_grid = _default_int_grid(args.k_neighbors, fallback=24)
    memory_grid = _default_float_grid(args.memory_weight, fallback=0.45)
    blend_grid = _default_float_grid(args.correction_blend, fallback=0.35)
    scale_grid = _default_float_grid(args.correction_scale, fallback=0.40)

    configs = [
        {
            "root": str(paths.root),
            "selected_round_ids": selected_round_ids,
            "eval_round_ids": eval_round_ids,
            "policy_name": args.policy,
            "budget": int(args.budget),
            "episode_seed": int(args.episode_seed),
            "samples_per_round": samples_per_round,
            "residual_rank": residual_rank,
            "ridge_lambda": ridge_lambda,
            "k_neighbors": k_neighbors,
            "memory_weight": memory_weight,
            "correction_blend": correction_blend,
            "correction_scale": correction_scale,
        }
        for (
            samples_per_round,
            residual_rank,
            ridge_lambda,
            k_neighbors,
            memory_weight,
            correction_blend,
            correction_scale,
        ) in itertools.product(
            sample_grid,
            rank_grid,
            ridge_grid,
            neighbor_grid,
            memory_grid,
            blend_grid,
            scale_grid,
        )
    ]

    max_workers = args.max_workers
    if max_workers is None:
        max_workers = min(len(configs), max(1, os.cpu_count() or 1))
    max_workers = max(1, min(int(max_workers), len(configs)))

    results: list[dict[str, object]] = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        future_to_config = {
            executor.submit(_evaluate_config, **config): config
            for config in configs
        }
        for future in as_completed(future_to_config):
            result = future.result()
            results.append(result)
            print(json.dumps(result, sort_keys=True), flush=True)

    ranked = sorted(
        results,
        key=lambda item: (
            -float(item["mean_score"]),
            float(item["mean_weighted_kl"]),
            int(item["samples_per_round"]),
            int(item["k_neighbors"]),
        ),
    )
    if ranked:
        print("# best", flush=True)
        print(json.dumps(ranked[0], sort_keys=True, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
