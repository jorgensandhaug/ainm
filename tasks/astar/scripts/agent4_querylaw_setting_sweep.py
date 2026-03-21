from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
import json
import multiprocessing as mp
from pathlib import Path
from time import perf_counter

import numpy as np

from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.interactive import (
    GreyBoxTranscriptEnsembleBlendPredictor,
    GreyBoxTranscriptRegimeBlendPredictor,
    RoundPredictorAdapter,
    build_online_predictor,
)
from astar.workflows.model_eval import discover_historical_eval_round_ids, evaluate_model_on_round


@dataclass(frozen=True)
class SweepSetting:
    name: str
    family: str
    transcript_weight: float = 0.0
    gate_mode: str = "uniform"
    querylaw_temperature: float = 1.0
    querylaw_scale_floor: float = 0.05
    queryknn_temperature: float = 1.0
    queryknn_scale_floor: float = 0.05
    transcript_weights: tuple[float, ...] = ()


@dataclass(frozen=True)
class SettingSummary:
    name: str
    family: str
    mean_score: float
    mean_weighted_kl: float
    evaluated_seeds: int


def _default_settings() -> tuple[SweepSetting, ...]:
    return (
        SweepSetting(
            name="baseline_transcriptregime_w20",
            family="transcriptregime_blend",
            transcript_weight=0.20,
        ),
        SweepSetting(
            name="baseline_querylaw_w20",
            family="querylaw_blend",
            transcript_weight=0.20,
        ),
        SweepSetting(
            name="baseline_queryknn_w20",
            family="queryknn_blend",
            transcript_weight=0.20,
        ),
        SweepSetting(
            name="querylaw_w10",
            family="querylaw_blend",
            transcript_weight=0.10,
        ),
        SweepSetting(
            name="queryknn_w10",
            family="queryknn_blend",
            transcript_weight=0.10,
        ),
        SweepSetting(
            name="querylaw_w05",
            family="querylaw_blend",
            transcript_weight=0.05,
        ),
        SweepSetting(
            name="queryknn_w05",
            family="queryknn_blend",
            transcript_weight=0.05,
        ),
        SweepSetting(
            name="querylaw_confentropy_w20",
            family="querylaw_blend",
            transcript_weight=0.20,
            gate_mode="confidence_entropy",
        ),
        SweepSetting(
            name="queryknn_confentropy_w20",
            family="queryknn_blend",
            transcript_weight=0.20,
            gate_mode="confidence_entropy",
        ),
        SweepSetting(
            name="querylaw_w20_temp2_floor010",
            family="querylaw_blend",
            transcript_weight=0.20,
            querylaw_temperature=2.0,
            querylaw_scale_floor=0.10,
        ),
        SweepSetting(
            name="queryknn_w20_temp2_floor010",
            family="queryknn_blend",
            transcript_weight=0.20,
            queryknn_temperature=2.0,
            queryknn_scale_floor=0.10,
        ),
        SweepSetting(
            name="queryknn_w20_temp05_floor010",
            family="queryknn_blend",
            transcript_weight=0.20,
            queryknn_temperature=0.5,
            queryknn_scale_floor=0.10,
        ),
        SweepSetting(
            name="trq_15_05",
            family="transcriptregime_querylaw_ensemble",
            transcript_weights=(0.15, 0.05),
        ),
        SweepSetting(
            name="trq_18_02",
            family="transcriptregime_querylaw_ensemble",
            transcript_weights=(0.18, 0.02),
        ),
        SweepSetting(
            name="trq_10_10",
            family="transcriptregime_querylaw_ensemble",
            transcript_weights=(0.10, 0.10),
        ),
        SweepSetting(
            name="trk_15_05",
            family="transcriptregime_queryknn_ensemble",
            transcript_weights=(0.15, 0.05),
        ),
        SweepSetting(
            name="trk_18_02",
            family="transcriptregime_queryknn_ensemble",
            transcript_weights=(0.18, 0.02),
        ),
        SweepSetting(
            name="trk_10_10",
            family="transcriptregime_queryknn_ensemble",
            transcript_weights=(0.10, 0.10),
        ),
    )


def _evaluate_worker(
    *,
    root: str,
    held_out_round_id: str,
    all_round_ids: list[str],
    policy_name: str,
    samples_per_round: int,
    budget: int,
    episode_seeds: list[int],
    settings: list[dict[str, object]],
) -> tuple[str, dict[str, dict[str, float | int]]]:
    paths = WorkspacePaths.from_root(root)
    training_round_ids = [round_id for round_id in all_round_ids if round_id != held_out_round_id]

    map_prior = build_online_predictor(
        "gbx_prior_maponly_bucket",
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor
    transcriptregime = build_online_predictor(
        "gbx_transcript_regime_knn_terminal_mapknn",
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor
    querylaw = build_online_predictor(
        "gbx_querylaw_roundbank_terminal_mapknn",
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor
    queryknn = build_online_predictor(
        "gbx_queryknn_roundbank_terminal_mapknn",
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    ).predictor

    results: dict[str, dict[str, float | int]] = {}
    for payload in settings:
        setting = SweepSetting(**payload)
        tuned_querylaw = querylaw.model_copy(
            update={
                "posterior_temperature": setting.querylaw_temperature,
                "feature_scale_floor": setting.querylaw_scale_floor,
            },
        )
        tuned_queryknn = queryknn.model_copy(
            update={
                "posterior_temperature": setting.queryknn_temperature,
                "feature_scale_floor": setting.queryknn_scale_floor,
            },
        )
        if setting.family == "transcriptregime_blend":
            predictor = GreyBoxTranscriptRegimeBlendPredictor(
                name=setting.name,
                transcript_weight=setting.transcript_weight,
                gate_mode=setting.gate_mode,
                map_prior_predictor=map_prior,
                transcript_predictor=transcriptregime,
            )
        elif setting.family == "querylaw_blend":
            predictor = GreyBoxTranscriptRegimeBlendPredictor(
                name=setting.name,
                transcript_weight=setting.transcript_weight,
                gate_mode=setting.gate_mode,
                map_prior_predictor=map_prior,
                transcript_predictor=tuned_querylaw,
            )
        elif setting.family == "queryknn_blend":
            predictor = GreyBoxTranscriptRegimeBlendPredictor(
                name=setting.name,
                transcript_weight=setting.transcript_weight,
                gate_mode=setting.gate_mode,
                map_prior_predictor=map_prior,
                transcript_predictor=tuned_queryknn,
            )
        elif setting.family == "transcriptregime_querylaw_ensemble":
            predictor = GreyBoxTranscriptEnsembleBlendPredictor(
                name=setting.name,
                map_prior_predictor=map_prior,
                transcript_predictors=(transcriptregime, tuned_querylaw),
                transcript_weights=setting.transcript_weights,
            )
        elif setting.family == "transcriptregime_queryknn_ensemble":
            predictor = GreyBoxTranscriptEnsembleBlendPredictor(
                name=setting.name,
                map_prior_predictor=map_prior,
                transcript_predictors=(transcriptregime, tuned_queryknn),
                transcript_weights=setting.transcript_weights,
            )
        else:
            raise ValueError(f"unsupported sweep family: {setting.family}")

        adapter = RoundPredictorAdapter(predictor=predictor, name=predictor.name)
        scores: list[float] = []
        weighted_kls: list[float] = []
        for episode_seed in episode_seeds:
            contexts = evaluate_model_on_round(
                paths,
                round_id=held_out_round_id,
                model_name=setting.name,
                training_round_ids=training_round_ids,
                mode="online_interactive",
                policy_name=policy_name,
                samples_per_round=samples_per_round,
                budget=budget,
                episode_seed=episode_seed,
                online_predictor=adapter,
            )
            for context in contexts:
                scores.append(float(context.score_breakdown.score))
                weighted_kls.append(float(context.score_breakdown.weighted_kl))
        results[setting.name] = {
            "mean_score": float(np.mean(np.asarray(scores, dtype=np.float64))),
            "mean_weighted_kl": float(np.mean(np.asarray(weighted_kls, dtype=np.float64))),
            "evaluated_seeds": len(scores),
        }
    return held_out_round_id, results


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Agent4 query-law setting sweep")
    parser.add_argument("--root", default=".")
    parser.add_argument("--round-id", action="append", default=None)
    parser.add_argument("--policy", default="coverage")
    parser.add_argument("--samples-per-round", type=int, default=4)
    parser.add_argument("--budget", type=int, default=50)
    parser.add_argument("--episode-seed", type=int, default=0)
    parser.add_argument("--episode-seed-count", type=int, default=3)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--name", default="agent4_querylaw_setting_sweep")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    started_at = perf_counter()
    paths = WorkspacePaths.from_root(args.root)
    round_ids = discover_historical_eval_round_ids(paths, args.round_id)
    episode_seeds = [args.episode_seed + offset for offset in range(args.episode_seed_count)]
    settings = list(_default_settings())

    aggregate_scores: dict[str, list[float]] = {setting.name: [] for setting in settings}
    aggregate_kls: dict[str, list[float]] = {setting.name: [] for setting in settings}
    aggregate_counts: dict[str, int] = {setting.name: 0 for setting in settings}
    by_round: dict[str, dict[str, dict[str, float | int]]] = {}

    with ProcessPoolExecutor(max_workers=args.jobs, mp_context=mp.get_context("spawn")) as executor:
        futures = [
            executor.submit(
                _evaluate_worker,
                root=str(paths.root),
                held_out_round_id=held_out_round_id,
                all_round_ids=round_ids,
                policy_name=args.policy,
                samples_per_round=args.samples_per_round,
                budget=args.budget,
                episode_seeds=episode_seeds,
                settings=[asdict(setting) for setting in settings],
            )
            for held_out_round_id in round_ids
        ]
        for future in as_completed(futures):
            held_out_round_id, worker_results = future.result()
            by_round[held_out_round_id] = worker_results
            for setting_name, metrics in worker_results.items():
                aggregate_scores[setting_name].append(float(metrics["mean_score"]))
                aggregate_kls[setting_name].append(float(metrics["mean_weighted_kl"]))
                aggregate_counts[setting_name] += int(metrics["evaluated_seeds"])

    summaries = [
        SettingSummary(
            name=setting.name,
            family=setting.family,
            mean_score=float(np.mean(np.asarray(aggregate_scores[setting.name], dtype=np.float64))),
            mean_weighted_kl=float(np.mean(np.asarray(aggregate_kls[setting.name], dtype=np.float64))),
            evaluated_seeds=aggregate_counts[setting.name],
        )
        for setting in settings
    ]
    summaries.sort(key=lambda item: (-item.mean_score, item.mean_weighted_kl, item.name))

    output = {
        "name": args.name,
        "policy": args.policy,
        "samples_per_round": args.samples_per_round,
        "budget": args.budget,
        "episode_seeds": episode_seeds,
        "round_ids": round_ids,
        "jobs": args.jobs,
        "elapsed_s": perf_counter() - started_at,
        "summaries": [asdict(item) for item in summaries],
        "by_round": by_round,
    }
    output_dir = paths.artifacts_dir / "runs" / args.name
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "results.json"
    output_path.write_text(json.dumps(output, indent=2, sort_keys=True), encoding="utf-8")

    print(f"name: {args.name}")
    print(f"output: {output_path}")
    print(f"policy: {args.policy}")
    print(f"rounds: {len(round_ids)}")
    print(f"episode_seeds: {','.join(str(item) for item in episode_seeds)}")
    print(f"elapsed_s: {output['elapsed_s']:.3f}")
    for item in summaries:
        print(
            f"{item.name} family={item.family} "
            f"score={item.mean_score:.4f} kl={item.mean_weighted_kl:.6f} "
            f"n={item.evaluated_seeds}",
        )


if __name__ == "__main__":
    main()
