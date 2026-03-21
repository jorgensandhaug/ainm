"""Replay-backed verification for the behavioral-fingerprint summary path.

Run:
  uv run python scripts/verify_behavioral_fingerprint.py
  uv run python scripts/verify_behavioral_fingerprint.py --target-round-id <round-id>
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from astar.features.geometry import compute_round_features
from astar.history.replay.ingest import load_seed_replay_runs
from astar.history.summaries import behavioral_fingerprint as bf
from astar.history.summaries.behavioral_fingerprint import (
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
    fit_round_behavioral_fingerprint,
    summarize_probe_support,
)
from astar.history.summaries.behavioral_fingerprint_manifold import (
    factorize_round_behavioral_fingerprint_subspace,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    build_replay_measurement_bundle,
    load_replay_measurement_bundle,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record


PAIRWISE_LINEAR_TARGETS: tuple[str, ...] = (
    "dst_population_delta",
    "dst_food_delta",
    "dst_wealth_delta",
    "dst_defense_delta",
)


def _cached_round_ids(paths: WorkspacePaths) -> list[str]:
    replay_summary_round_ids = {
        directory.name.removeprefix("round_id=")
        for directory in paths.derived_dir.joinpath("replay_summaries").glob("round_id=*")
        if directory.is_dir()
    }
    replay_event_round_ids = {
        directory.name.removeprefix("round_id=")
        for directory in paths.derived_dir.joinpath("replay_events").glob("round_id=*")
        if directory.is_dir() and any(directory.glob("*__site_opportunity.parquet"))
    }
    return sorted(replay_summary_round_ids & replay_event_round_ids)


def _seed_count(paths: WorkspacePaths, round_id: str) -> int:
    summary_dir = paths.replay_summary_dir(round_id)
    return len(list(summary_dir.glob("seed_index=*.npz")))


def _choose_round_ids(
    paths: WorkspacePaths,
    *,
    target_round_id: str | None,
    corpus_round_count: int,
) -> tuple[str, list[str]]:
    cached = _cached_round_ids(paths)
    if not cached:
        raise ValueError("no cached replay summaries found")
    ordered = sorted(
        cached,
        key=lambda round_id: (_seed_count(paths, round_id), round_id),
        reverse=True,
    )
    if target_round_id is None:
        target = ordered[0]
    else:
        target = target_round_id
    corpus = [target]
    for round_id in ordered:
        if round_id == target:
            continue
        corpus.append(round_id)
        if len(corpus) >= corpus_round_count:
            break
    return target, corpus


def _load_cached_round_bundles(
    paths: WorkspacePaths,
    round_id: str,
) -> tuple[int, list[ReplayMeasurementBundle]]:
    round_record = read_round_record(paths, round_id)
    bundles: list[ReplayMeasurementBundle] = []
    for seed_index in range(round_record.round.seeds_count):
        try:
            bundle = load_replay_measurement_bundle(paths, round_id, seed_index)
        except Exception:
            continue
        if bundle is not None:
            bundles.append(bundle)
    if not bundles:
        raise ValueError(f"no cached replay measurement bundles for round {round_id}")
    return round_record.round.round_number, bundles


def _build_cached_probe_library(
    paths: WorkspacePaths,
    round_ids: list[str],
) -> tuple[bf.BehavioralFingerprintProbeLibrary, dict[str, tuple[int, list[ReplayMeasurementBundle]]]]:
    site_frames: list[pl.DataFrame] = []
    live_frames: list[pl.DataFrame] = []
    ruin_frames: list[pl.DataFrame] = []
    pairwise_frames: list[pl.DataFrame] = []
    owner_frames: list[pl.DataFrame] = []
    bundle_map: dict[str, tuple[int, list[ReplayMeasurementBundle]]] = {}
    for round_id in round_ids:
        round_number, bundles = _load_cached_round_bundles(paths, round_id)
        bundle_map[round_id] = (round_number, bundles)
        for bundle in bundles:
            site_frames.append(bundle.site_opportunities)
            live_frames.append(bundle.live_settlement_transitions)
            ruin_frames.append(bundle.ruin_transitions)
            pairwise_frames.append(bundle.pairwise_candidates)
            owner_frames.append(bundle.owner_years)
    probe_library = build_behavioral_fingerprint_probe_library(
        site_frames,
        live_frames,
        ruin_frames,
        pairwise_frames,
        owner_frames,
    )
    return probe_library, bundle_map


def _sample_frame(frame: pl.DataFrame, *, max_rows: int, seed: int) -> pl.DataFrame:
    if frame.height <= max_rows:
        return frame
    return frame.sample(
        n=max_rows,
        with_replacement=False,
        shuffle=True,
        seed=seed,
    )


def verify_subset_sensitivity(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
    corpus_round_ids: list[str],
) -> dict[str, object]:
    probe_full, bundle_map = _build_cached_probe_library(paths, corpus_round_ids)
    probe_reduced, _ = _build_cached_probe_library(paths, corpus_round_ids[:-1])
    round_number, bundles = bundle_map[target_round_id]
    estimate_full = estimate_round_behavioral_fingerprint(
        target_round_id,
        round_number,
        bundles,
        probe_full,
        bootstrap_samples=1,
        rng_seed=7,
    )
    estimate_reduced = estimate_round_behavioral_fingerprint(
        target_round_id,
        round_number,
        bundles,
        probe_reduced,
        bootstrap_samples=1,
        rng_seed=7,
    )
    delta = np.abs(estimate_full.summary_vector - estimate_reduced.summary_vector)
    return {
        "target_round_id": target_round_id,
        "corpus_round_ids": corpus_round_ids,
        "reduced_corpus_round_ids": corpus_round_ids[:-1],
        "summary_dim": int(estimate_full.summary_vector.shape[0]),
        "mean_abs_delta": float(np.mean(delta)),
        "median_abs_delta": float(np.median(delta)),
        "max_abs_delta": float(np.max(delta)),
        "changed_components_gt_1e-3": int(np.sum(delta > 1e-3)),
        "changed_components_gt_1e-2": int(np.sum(delta > 1e-2)),
    }


def verify_probe_library_invariance(
    paths: WorkspacePaths,
    *,
    corpus_round_ids: list[str],
) -> dict[str, object]:
    probe_full, _ = _build_cached_probe_library(paths, corpus_round_ids)
    probe_reduced, _ = _build_cached_probe_library(paths, corpus_round_ids[:-1])
    comparisons = (
        (
            "site",
            probe_full.site_probe_names,
            probe_reduced.site_probe_names,
            probe_full.site_probe_matrix,
            probe_reduced.site_probe_matrix,
        ),
        (
            "live",
            probe_full.live_probe_names,
            probe_reduced.live_probe_names,
            probe_full.live_probe_matrix,
            probe_reduced.live_probe_matrix,
        ),
        (
            "ruin",
            probe_full.ruin_probe_names,
            probe_reduced.ruin_probe_names,
            probe_full.ruin_probe_matrix,
            probe_reduced.ruin_probe_matrix,
        ),
        (
            "pairwise",
            probe_full.pairwise_probe_names,
            probe_reduced.pairwise_probe_names,
            probe_full.pairwise_probe_matrix,
            probe_reduced.pairwise_probe_matrix,
        ),
        (
            "owner",
            probe_full.owner_probe_names,
            probe_reduced.owner_probe_names,
            probe_full.owner_probe_matrix,
            probe_reduced.owner_probe_matrix,
        ),
    )
    result: dict[str, object] = {
        "full_library_kind": probe_full.library_kind,
        "full_library_version": probe_full.library_version,
        "reduced_library_kind": probe_reduced.library_kind,
        "reduced_library_version": probe_reduced.library_version,
    }
    all_names_equal = True
    all_matrices_equal = True
    for prefix, full_names, reduced_names, full_matrix, reduced_matrix in comparisons:
        names_equal = tuple(full_names) == tuple(reduced_names)
        matrix_equal = bool(np.array_equal(full_matrix, reduced_matrix))
        all_names_equal = all_names_equal and names_equal
        all_matrices_equal = all_matrices_equal and matrix_equal
        result[f"{prefix}_names_equal"] = names_equal
        result[f"{prefix}_matrix_equal"] = matrix_equal
        result[f"{prefix}_max_abs_delta"] = float(np.max(np.abs(full_matrix - reduced_matrix)))
    result["all_names_equal"] = all_names_equal
    result["all_matrices_equal"] = all_matrices_equal
    return result


def verify_bootstrap_signal(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
    corpus_round_ids: list[str],
    bootstrap_samples: int,
) -> dict[str, object]:
    probe_library, bundle_map = _build_cached_probe_library(paths, corpus_round_ids)
    round_number, bundles = bundle_map[target_round_id]
    estimate = estimate_round_behavioral_fingerprint(
        target_round_id,
        round_number,
        bundles,
        probe_library,
        bootstrap_samples=bootstrap_samples,
        rng_seed=7,
    )
    std = estimate.summary_std
    return {
        "target_round_id": target_round_id,
        "bootstrap_samples": bootstrap_samples,
        "summary_dim": int(std.shape[0]),
        "std_nonzero_count": int(np.sum(std > 0.0)),
        "std_gt_1e-6_count": int(np.sum(std > 1e-6)),
        "std_max": float(np.max(std)),
        "std_mean": float(np.mean(std)),
    }


def verify_probe_support(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
    corpus_round_ids: list[str],
) -> dict[str, object]:
    probe_library, bundle_map = _build_cached_probe_library(paths, corpus_round_ids)
    _, bundles = bundle_map[target_round_id]
    support = summarize_probe_support(bundles, probe_library)
    result: dict[str, object] = {}
    for prefix, payload in support.items():
        fractions = np.asarray(payload["feature_support_fraction"], dtype=np.float64)
        distances = np.asarray(payload["nearest_standardized_distance"], dtype=np.float64)
        all_in_range = np.asarray(payload["all_features_in_range"], dtype=bool)
        result[prefix] = {
            "probe_names": payload["probe_names"],
            "sample_count": int(payload["sample_count"]),
            "min_feature_support_fraction": float(np.min(fractions)),
            "mean_feature_support_fraction": float(np.mean(fractions)),
            "all_in_range_count": int(np.sum(all_in_range)),
            "probe_count": int(fractions.shape[0]),
            "max_nearest_standardized_distance": float(np.max(distances)),
            "mean_nearest_standardized_distance": float(np.mean(distances)),
            "per_probe": [
                {
                    "probe_name": str(name),
                    "feature_support_fraction": float(fraction),
                    "all_features_in_range": bool(in_range),
                    "nearest_standardized_distance": float(distance),
                }
                for name, fraction, in_range, distance in zip(
                    payload["probe_names"],
                    fractions,
                    all_in_range,
                    distances,
                    strict=True,
                )
            ],
        }
    return result


def verify_cached_only_discovery(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="bf_cached_verify_") as temp_root_str:
        temp_root = Path(temp_root_str)
        temp_paths = WorkspacePaths.from_root(temp_root)
        temp_paths.ensure_layout()
        shutil.copy2(paths.raw_round_path(target_round_id), temp_paths.raw_round_path(target_round_id))
        shutil.copytree(
            paths.replay_summary_dir(target_round_id),
            temp_paths.replay_summary_dir(target_round_id),
            dirs_exist_ok=True,
        )
        shutil.copytree(
            paths.replay_event_dir(target_round_id),
            temp_paths.replay_event_dir(target_round_id),
            dirs_exist_ok=True,
        )
        factorization, _, _ = factorize_round_behavioral_fingerprint_subspace(
            temp_paths,
            round_ids=None,
            max_rank=1,
            summary_name="verify_cached_only_behavioral_fingerprint",
            bootstrap_samples=1,
            rng_seed=7,
        )
    return {
        "target_round_id": target_round_id,
        "discovered_round_ids": list(factorization.round_ids),
        "round_count": len(factorization.round_ids),
    }


def verify_owner_year_completeness(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
    max_runs_per_seed: int,
) -> dict[str, object]:
    round_record = read_round_record(paths, target_round_id)
    round_features = compute_round_features(round_record.round)
    checked_steps = 0
    checked_runs = 0
    mismatches: list[dict[str, object]] = []
    emergent_step_count = 0

    for seed_index in range(round_record.round.seeds_count):
        runs = load_seed_replay_runs(paths, target_round_id, seed_index)[:max_runs_per_seed]
        if not runs:
            continue
        checked_runs += len(runs)
        bundle = build_replay_measurement_bundle(
            np.asarray(round_record.round.initial_states[seed_index].grid, dtype=np.int64),
            round_features.per_seed[seed_index],
            runs,
        )
        owner_years = bundle.owner_years
        for run in runs:
            for frame_index in range(len(run.frames) - 1):
                previous = run.frames[frame_index]
                current = run.frames[frame_index + 1]
                expected_owner_ids = sorted(
                    {
                        settlement.owner_id
                        for settlement in previous.settlements
                        if settlement.owner_id is not None
                    }
                    | {
                        settlement.owner_id
                        for settlement in current.settlements
                        if settlement.owner_id is not None
                    }
                )
                actual_owner_ids = sorted(
                    owner_years.filter(
                        (pl.col("replay_run_id") == run.replay_run_id) & (pl.col("step") == frame_index)
                    )
                    .get_column("owner_id")
                    .to_list()
                )
                if any(
                    owner_id not in {
                        settlement.owner_id
                        for settlement in previous.settlements
                        if settlement.owner_id is not None
                    }
                    for owner_id in expected_owner_ids
                ):
                    emergent_step_count += 1
                checked_steps += 1
                if actual_owner_ids != expected_owner_ids:
                    mismatches.append(
                        {
                            "seed_index": seed_index,
                            "replay_run_id": run.replay_run_id,
                            "step": frame_index,
                            "expected_owner_ids": expected_owner_ids,
                            "actual_owner_ids": actual_owner_ids,
                        }
                    )
                    if len(mismatches) >= 5:
                        return {
                            "target_round_id": target_round_id,
                            "checked_runs": checked_runs,
                            "checked_steps": checked_steps,
                            "emergent_step_count": emergent_step_count,
                            "mismatch_count": len(mismatches),
                            "mismatch_examples": mismatches,
                        }
    return {
        "target_round_id": target_round_id,
        "checked_runs": checked_runs,
        "checked_steps": checked_steps,
        "emergent_step_count": emergent_step_count,
        "mismatch_count": len(mismatches),
        "mismatch_examples": mismatches,
    }


def verify_pairwise_null_handling(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
) -> dict[str, object]:
    round_number, bundles = _load_cached_round_bundles(paths, target_round_id)
    fit = fit_round_behavioral_fingerprint(target_round_id, round_number, bundles)
    pairwise_frame = pl.concat([bundle.pairwise_candidates for bundle in bundles], how="vertical_relaxed")
    sampled_pairwise = _sample_frame(
        pairwise_frame,
        max_rows=bf.MAX_FIT_PAIRWISE_ROWS,
        seed=17,
    )
    head_sample_counts = {head.name: head.sample_count for head in fit.pairwise_linear_heads}
    target_stats = {
        name: {
            "sampled_rows": sampled_pairwise.height,
            "nonnull_rows": int(sampled_pairwise.height - sampled_pairwise.get_column(name).null_count()),
            "head_sample_count": int(head_sample_counts[name]),
        }
        for name in PAIRWISE_LINEAR_TARGETS
    }
    return {
        "target_round_id": target_round_id,
        "target_stats": target_stats,
        "all_match_nonnull": all(
            stats["nonnull_rows"] == stats["head_sample_count"]
            for stats in target_stats.values()
        ),
    }


def verify_sample_count_accounting(
    paths: WorkspacePaths,
    *,
    target_round_id: str,
) -> dict[str, object]:
    round_number, bundles = _load_cached_round_bundles(paths, target_round_id)
    fit = fit_round_behavioral_fingerprint(target_round_id, round_number, bundles)
    expected = int(
        sum(bundle.site_opportunities.height for bundle in bundles)
        + sum(bundle.live_settlement_transitions.height for bundle in bundles)
        + sum(bundle.ruin_transitions.height for bundle in bundles)
        + sum(bundle.pairwise_candidates.height for bundle in bundles)
        + sum(bundle.owner_years.height for bundle in bundles)
        + sum(bundle.year_shocks.height for bundle in bundles)
        + sum(bundle.macro_trajectories.height for bundle in bundles)
    )
    return {
        "target_round_id": target_round_id,
        "fit_sample_count": int(fit.sample_count),
        "expected_sample_count": expected,
        "matches": int(fit.sample_count) == expected,
    }


def verify_factorization_reproducibility(
    paths: WorkspacePaths,
    *,
    corpus_round_ids: list[str],
) -> dict[str, object]:
    factorization_a, _, _ = factorize_round_behavioral_fingerprint_subspace(
        paths,
        round_ids=corpus_round_ids,
        max_rank=2,
        summary_name="verify_behavioral_fingerprint_repro_a",
        bootstrap_samples=2,
        rng_seed=7,
    )
    factorization_b, _, _ = factorize_round_behavioral_fingerprint_subspace(
        paths,
        round_ids=corpus_round_ids,
        max_rank=2,
        summary_name="verify_behavioral_fingerprint_repro_b",
        bootstrap_samples=2,
        rng_seed=7,
    )
    return {
        "corpus_round_ids": corpus_round_ids,
        "summary_matrix_equal": bool(
            np.allclose(factorization_a.summary_matrix, factorization_b.summary_matrix)
        ),
        "basis_equal": bool(np.allclose(factorization_a.basis, factorization_b.basis)),
        "coordinates_equal": bool(
            np.allclose(factorization_a.coordinates, factorization_b.coordinates)
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--target-round-id", default=None)
    parser.add_argument("--corpus-round-count", type=int, default=3)
    parser.add_argument("--bootstrap-samples", type=int, default=4)
    parser.add_argument("--max-runs-per-seed", type=int, default=1)
    parser.add_argument("--skip-cached-only-discovery", action="store_true")
    parser.add_argument("--skip-owner-year-completeness", action="store_true")
    parser.add_argument("--skip-factorization-reproducibility", action="store_true")
    args = parser.parse_args()

    started = time.time()
    paths = WorkspacePaths.from_root(args.root)
    target_round_id, corpus_round_ids = _choose_round_ids(
        paths,
        target_round_id=args.target_round_id,
        corpus_round_count=max(2, args.corpus_round_count),
    )

    result: dict[str, object] = {
        "discovered_round_count": len(_cached_round_ids(paths)),
        "target_round_id": target_round_id,
        "corpus_round_ids": corpus_round_ids,
        "probe_library_invariance": verify_probe_library_invariance(
            paths,
            corpus_round_ids=corpus_round_ids,
        ),
        "probe_support": verify_probe_support(
            paths,
            target_round_id=target_round_id,
            corpus_round_ids=corpus_round_ids,
        ),
        "subset_sensitivity": verify_subset_sensitivity(
            paths,
            target_round_id=target_round_id,
            corpus_round_ids=corpus_round_ids,
        ),
        "bootstrap_signal": verify_bootstrap_signal(
            paths,
            target_round_id=target_round_id,
            corpus_round_ids=corpus_round_ids,
            bootstrap_samples=args.bootstrap_samples,
        ),
        "pairwise_null_handling": verify_pairwise_null_handling(
            paths,
            target_round_id=target_round_id,
        ),
        "sample_count_accounting": verify_sample_count_accounting(
            paths,
            target_round_id=target_round_id,
        ),
        "elapsed_seconds": time.time() - started,
    }
    if not args.skip_cached_only_discovery:
        result["cached_only_discovery"] = verify_cached_only_discovery(
            paths,
            target_round_id=target_round_id,
        )
    if not args.skip_owner_year_completeness:
        result["owner_year_completeness"] = verify_owner_year_completeness(
            paths,
            target_round_id=target_round_id,
            max_runs_per_seed=max(1, args.max_runs_per_seed),
        )
    if not args.skip_factorization_reproducibility:
        result["factorization_reproducibility"] = verify_factorization_reproducibility(
            paths,
            corpus_round_ids=corpus_round_ids,
        )
    result["elapsed_seconds"] = time.time() - started
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
