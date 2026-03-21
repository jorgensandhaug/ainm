#!/usr/bin/env python3
from __future__ import annotations

import argparse
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
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.greybox_regime import GreyboxHazardLowRankPredictor
from astar.student.predictor.interactive import RoundPredictorAdapter, build_online_predictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.workflows.model_eval import discover_historical_eval_round_ids
from astar.workflows.online_episode import run_online_episode


def _default_weights() -> list[float]:
    return [index / 10.0 for index in range(11)]


def _parse_weights(values: list[float] | None) -> list[float]:
    weights = _default_weights() if not values else values
    cleaned = []
    for value in weights:
        clipped = float(np.clip(value, 0.0, 1.0))
        if clipped not in cleaned:
            cleaned.append(clipped)
    return cleaned


def _build_truth_bundle(paths: WorkspacePaths, round_id: str) -> GroundTruthBundle:
    analyses = read_analysis_records(paths, round_id)
    if not analyses:
        raise ValueError(f"round {round_id} has no saved analyses")
    truths_by_seed = {
        seed_index: np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
        for seed_index, analysis_record in sorted(analyses.items())
    }
    return GroundTruthBundle(round_id=round_id, truths_by_seed=truths_by_seed)


def _blend_prediction_bundles(
    lowrank_bundle,
    residual_bundle,
    *,
    lowrank_weight: float,
):
    if lowrank_bundle.round_id != residual_bundle.round_id:
        raise ValueError("prediction bundles must come from the same round")
    if set(lowrank_bundle.predictions_by_seed) != set(residual_bundle.predictions_by_seed):
        raise ValueError("prediction bundles must cover the same seeds")

    predictions_by_seed: dict[int, np.ndarray] = {}
    for seed_index in lowrank_bundle.predictions_by_seed:
        lowrank_prediction = np.asarray(lowrank_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        residual_prediction = np.asarray(residual_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        blended = (lowrank_weight * lowrank_prediction) + ((1.0 - lowrank_weight) * residual_prediction)
        predictions_by_seed[seed_index] = np.asarray(blended, dtype=np.float64)

    return lowrank_bundle.model_copy(
        update={
            "model_name": f"hybrid(lowrank={lowrank_weight:.3f},query_residual={1.0 - lowrank_weight:.3f})",
            "predictions_by_seed": predictions_by_seed,
        },
    )


def _score_bundle(evaluator: CompetitionEvaluator, prediction_bundle, truth_bundle: GroundTruthBundle) -> tuple[float, float]:
    score_by_seed = evaluator.score_prediction(prediction_bundle, truth_bundle)
    mean_score = sum(item.score for item in score_by_seed.values()) / float(len(score_by_seed))
    mean_weighted_kl = sum(item.weighted_kl for item in score_by_seed.values()) / float(len(score_by_seed))
    return mean_score, mean_weighted_kl


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent5_hybrid_sweep",
        description="Sweep lowrank/query_residual convex blends on held-out rounds.",
    )
    parser.add_argument(
        "--root",
        default=str(REPO_ROOT),
        help="workspace root (defaults to repo root)",
    )
    parser.add_argument(
        "--round-id",
        action="append",
        default=None,
        help="limit the overall analyzed-round universe used for training/eval",
    )
    parser.add_argument(
        "--eval-round-id",
        action="append",
        default=None,
        help="evaluate only these held-out rounds, while training still uses the full selected round universe",
    )
    parser.add_argument("--policy", default="coverage", help="interactive policy name")
    parser.add_argument("--budget", type=int, default=50, help="online query budget")
    parser.add_argument("--episode-seed", type=int, default=0, help="online episode seed")
    parser.add_argument(
        "--lowrank-samples-per-round",
        type=int,
        default=4,
        help="synthetic transcript samples per round for the low-rank expert",
    )
    parser.add_argument(
        "--residual-samples-per-round",
        type=int,
        default=1,
        help="synthetic transcript samples per round for the residual expert",
    )
    parser.add_argument(
        "--lowrank-model",
        default="greybox_hazard_lowrank",
        help="low-rank expert model name",
    )
    parser.add_argument(
        "--lowrank-prior-blend",
        type=float,
        default=0.55,
        help="prior blend to use when the low-rank expert is greybox_hazard_lowrank",
    )
    parser.add_argument(
        "--residual-model",
        default="query_residual",
        help="residual expert model name",
    )
    parser.add_argument(
        "--weight",
        action="append",
        type=float,
        default=None,
        help="convex weight on lowrank expert; repeat to set custom sweep",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=None,
        help="parallel held-out rounds to evaluate (default: min(round count, cpu count))",
    )
    return parser


def _evaluate_round(
    *,
    root: str,
    held_out_round_id: str,
    selected_round_ids: tuple[str, ...],
    policy_name: str,
    budget: int,
    episode_seed: int,
    lowrank_model: str,
    lowrank_samples_per_round: int,
    lowrank_prior_blend: float,
    residual_model: str,
    residual_samples_per_round: int,
    weights: tuple[float, ...],
) -> tuple[str, int | None, list[tuple[float, float, float]], float]:
    paths = WorkspacePaths.from_root(root)
    evaluator = CompetitionEvaluator()
    policy = build_interactive_policy(policy_name)
    oracle = HistoricalReplayOracle(paths=paths)
    round_started_at = perf_counter()

    training_round_ids = [item for item in selected_round_ids if item != held_out_round_id]
    round_detail = read_round_record(paths, held_out_round_id).round
    truth_bundle = _build_truth_bundle(paths, held_out_round_id)

    if lowrank_model.strip().lower() == "greybox_hazard_lowrank":
        lowrank_base_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=lowrank_samples_per_round,
            prior_blend=lowrank_prior_blend,
            model_name=(
                f"greybox_hazard_lowrank_v01__policy={policy_name}"
                f"__samples={lowrank_samples_per_round}"
                f"__prior={lowrank_prior_blend:.2f}"
            ),
        )
        lowrank_predictor = RoundPredictorAdapter(
            predictor=lowrank_base_predictor,
            name=lowrank_base_predictor.name,
        )
    else:
        lowrank_predictor = build_online_predictor(
            lowrank_model,
            paths=paths,
            historical_round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=lowrank_samples_per_round,
        )

    if residual_model.strip().lower() == "query_residual":
        residual_base_predictor = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=residual_samples_per_round,
            model_name=(
                f"query_residual_v7__policy={policy_name}"
                f"__samples={residual_samples_per_round}"
            ),
        )
        residual_predictor = RoundPredictorAdapter(
            predictor=residual_base_predictor,
            name=residual_base_predictor.name,
        )
    else:
        residual_predictor = build_online_predictor(
            residual_model,
            paths=paths,
            historical_round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=residual_samples_per_round,
        )

    recorder_episode = run_online_episode(
        oracle,
        round_id=held_out_round_id,
        predictor=TranscriptRecorderPredictor(),
        policy=policy,
        budget=budget,
        episode_seed=episode_seed,
    )

    lowrank_bundle = lowrank_predictor.predict(recorder_episode.belief)
    residual_bundle = residual_predictor.predict(recorder_episode.belief)
    weight_rows: list[tuple[float, float, float]] = []
    for weight in weights:
        blended_bundle = _blend_prediction_bundles(
            lowrank_bundle,
            residual_bundle,
            lowrank_weight=weight,
        )
        mean_score, mean_weighted_kl = _score_bundle(evaluator, blended_bundle, truth_bundle)
        weight_rows.append((weight, mean_score, mean_weighted_kl))

    return (
        held_out_round_id,
        round_detail.round_number,
        weight_rows,
        perf_counter() - round_started_at,
    )


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    paths = WorkspacePaths.from_root(args.root)
    selected_round_ids = discover_historical_eval_round_ids(paths, args.round_id)
    if len(selected_round_ids) < 2:
        raise ValueError("hybrid sweep requires at least two analyzed rounds")
    eval_round_ids = discover_historical_eval_round_ids(paths, args.eval_round_id) if args.eval_round_id else selected_round_ids
    missing_eval_round_ids = [round_id for round_id in eval_round_ids if round_id not in selected_round_ids]
    if missing_eval_round_ids:
        raise ValueError(
            "eval rounds must be contained in the selected round universe: "
            + ", ".join(missing_eval_round_ids),
        )

    weights = _parse_weights(args.weight)
    evaluator = CompetitionEvaluator()
    policy = build_interactive_policy(args.policy)
    oracle = HistoricalReplayOracle(paths=paths)

    print(f"root={paths.root}", flush=True)
    print(
        f"rounds={len(selected_round_ids)} eval_rounds={len(eval_round_ids)} "
        f"policy={policy.name} budget={args.budget} episode_seed={args.episode_seed}",
        flush=True,
    )
    print(
        " ".join(
            [
                f"lowrank_model={args.lowrank_model}",
                f"lowrank_samples={args.lowrank_samples_per_round}",
                f"residual_model={args.residual_model}",
                f"residual_samples={args.residual_samples_per_round}",
            ],
        ),
        flush=True,
    )
    print(f"weights={weights}", flush=True)

    round_results: dict[str, dict[str, object]] = {}
    started_at = perf_counter()
    del evaluator, policy, oracle
    resolved_max_workers = args.max_workers or min(
        len(eval_round_ids),
        max(1, os.cpu_count() or 1),
    )
    with ProcessPoolExecutor(max_workers=resolved_max_workers) as executor:
        futures = {
            executor.submit(
                _evaluate_round,
                root=str(paths.root),
                held_out_round_id=held_out_round_id,
                selected_round_ids=tuple(selected_round_ids),
                policy_name=args.policy,
                budget=args.budget,
                episode_seed=args.episode_seed,
                lowrank_model=args.lowrank_model,
                lowrank_samples_per_round=args.lowrank_samples_per_round,
                lowrank_prior_blend=args.lowrank_prior_blend,
                residual_model=args.residual_model,
                residual_samples_per_round=args.residual_samples_per_round,
                weights=tuple(weights),
            ): held_out_round_id
            for held_out_round_id in eval_round_ids
        }
        for future in as_completed(futures):
            held_out_round_id, round_number, weight_rows, fit_seconds = future.result()
            for weight, mean_score, mean_weighted_kl in weight_rows:
                print(
                    f"round={held_out_round_id} round_number={round_number} "
                    f"weight={weight:.3f} score={mean_score:.6f} weighted_kl={mean_weighted_kl:.6f}",
                    flush=True,
                )
            round_results[held_out_round_id] = {
                "round_number": round_number,
                "weights": weight_rows,
                "fit_seconds": fit_seconds,
            }

    print("summary", flush=True)
    aggregate_rows: list[tuple[float, list[float], list[float]]] = []
    for weight in weights:
        round_scores: list[float] = []
        round_kls: list[float] = []
        for round_info in round_results.values():
            for weight_value, score, weighted_kl in round_info["weights"]:
                if weight_value == weight:
                    round_scores.append(score)
                    round_kls.append(weighted_kl)
                    break
        aggregate_rows.append((weight, round_scores, round_kls))
        mean_score = sum(round_scores) / float(len(round_scores))
        mean_weighted_kl = sum(round_kls) / float(len(round_kls))
        print(
            f"weight={weight:.3f} mean_score={mean_score:.6f} "
            f"mean_weighted_kl={mean_weighted_kl:.6f} rounds={len(round_scores)}",
            flush=True,
        )

    best_weight, best_scores, best_kls = max(
        aggregate_rows,
        key=lambda item: sum(item[1]) / float(len(item[1])),
    )
    best_mean_score = sum(best_scores) / float(len(best_scores))
    best_mean_weighted_kl = sum(best_kls) / float(len(best_kls))
    total_seconds = perf_counter() - started_at
    print(
        f"best_weight={best_weight:.3f} mean_score={best_mean_score:.6f} "
        f"mean_weighted_kl={best_mean_weighted_kl:.6f} total_seconds={total_seconds:.2f}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
