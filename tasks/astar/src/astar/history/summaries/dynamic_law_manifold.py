from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from astar.features.geometry import compute_round_features
from astar.history.replay.ingest import load_seed_replay_runs
from astar.history.summaries.dynamic_law import (
    build_dynamic_law_probe_library,
    fit_round_dynamic_law_summary,
)
from astar.history.summaries.factorization import (
    RoundSummaryFactorization,
    factorize_summary_matrix,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    build_replay_measurement_bundle,
    load_replay_measurement_bundle,
    materialize_round_replay_measurements,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable


def _replay_seed_indexes(
    paths: WorkspacePaths,
    round_id: str,
    *,
    seed_count: int,
) -> list[int]:
    replay_seed_indexes: list[int] = []
    for seed_index in range(seed_count):
        replay_dir = paths.raw_replay_dir(round_id, seed_index)
        if paths.replay_site_transition_path(round_id, seed_index).exists():
            replay_seed_indexes.append(seed_index)
            continue
        if replay_dir.exists() and any(replay_dir.glob("*.json")):
            replay_seed_indexes.append(seed_index)
    return replay_seed_indexes


def _load_or_build_round_measurement_bundles(
    paths: WorkspacePaths,
    round_id: str,
) -> tuple[int, list[ReplayMeasurementBundle]]:
    round_record = read_round_record(paths, round_id)
    replay_seed_indexes = _replay_seed_indexes(
        paths,
        round_id,
        seed_count=round_record.round.seeds_count,
    )
    bundles = [
        bundle
        for seed_index in replay_seed_indexes
        if (bundle := load_replay_measurement_bundle(paths, round_id, seed_index)) is not None
    ]
    if len(bundles) == len(replay_seed_indexes):
        return round_record.round.round_number, sorted(bundles, key=lambda item: item.seed_index)

    if replay_seed_indexes:
        materialize_round_replay_measurements(paths, round_id)
        bundles = [
            bundle
            for seed_index in replay_seed_indexes
            if (bundle := load_replay_measurement_bundle(paths, round_id, seed_index)) is not None
        ]
    if len(bundles) == len(replay_seed_indexes):
        return round_record.round.round_number, sorted(bundles, key=lambda item: item.seed_index)

    round_features = compute_round_features(round_record.round)
    loaded_by_seed = {bundle.seed_index: bundle for bundle in bundles}
    for seed_index in replay_seed_indexes:
        if seed_index in loaded_by_seed:
            continue
        runs = load_seed_replay_runs(paths, round_id, seed_index)
        if not runs:
            continue
        loaded_by_seed[seed_index] = build_replay_measurement_bundle(
            np.asarray(round_record.round.initial_states[seed_index].grid, dtype=np.int64),
            round_features.per_seed[seed_index],
            runs,
        )
    return round_record.round.round_number, [
        loaded_by_seed[seed_index]
        for seed_index in replay_seed_indexes
        if seed_index in loaded_by_seed
    ]


def factorize_round_dynamic_law_subspace(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 3,
    summary_name: str = "round_dynamic_law_subspace_v1",
) -> tuple[RoundSummaryFactorization, Path, Path]:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )

    fitted_laws = []
    site_frames = []
    settlement_frames = []
    pairwise_frames = []

    for round_id in selected_round_ids:
        round_number, bundles = _load_or_build_round_measurement_bundles(paths, round_id)
        for bundle in bundles:
            site_frames.append(bundle.site_opportunities)
            settlement_frames.append(bundle.settlement_measurements)
            pairwise_frames.append(bundle.pairwise_candidates)

        if not bundles:
            continue

        fitted_laws.append(
            fit_round_dynamic_law_summary(
                round_id=round_id,
                round_number=round_number,
                bundles=bundles,
            )
        )

    if not fitted_laws:
        raise ValueError("no replay-backed round dynamic laws available for factorization")

    probe_library = build_dynamic_law_probe_library(
        site_frames,
        settlement_frames,
        pairwise_frames,
    )

    summary_names: list[str] | None = None
    row_vectors: list[list[float]] = []
    row_round_ids: list[str] = []
    row_round_numbers: list[int] = []
    row_sample_counts: list[int] = []
    for fitted in fitted_laws:
        names, vector = fitted.probe_summary(probe_library)
        if summary_names is None:
            summary_names = names
        row_vectors.append(vector.tolist())
        row_round_ids.append(fitted.round_id)
        row_round_numbers.append(fitted.round_number)
        row_sample_counts.append(fitted.sample_count)

    if summary_names is None:
        raise ValueError("dynamic law factorization produced no summary names")

    factorization = factorize_summary_matrix(
        summary_kind="dynamic_law",
        summary_names=summary_names,
        round_ids=row_round_ids,
        round_numbers=row_round_numbers,
        sample_counts=row_sample_counts,
        summary_matrix=row_vectors,
        max_rank=max_rank,
    )

    artifact_dir = paths.artifacts_dir / "replays" / "manifold"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    summary_path = artifact_dir / f"{summary_name}.json"
    basis_path = artifact_dir / f"{summary_name}.npz"
    summary_payload = {
        "factorization": factorization,
        "site_probe_names": probe_library.site_probe_names,
        "site_probe_matrix": probe_library.site_probe_matrix,
        "settlement_probe_names": probe_library.settlement_probe_names,
        "settlement_probe_matrix": probe_library.settlement_probe_matrix,
        "pairwise_probe_names": probe_library.pairwise_probe_names,
        "pairwise_probe_matrix": probe_library.pairwise_probe_matrix,
    }
    summary_path.write_text(json.dumps(to_jsonable(summary_payload), indent=2), encoding="utf-8")
    np.savez_compressed(
        basis_path,
        summary_matrix=factorization.summary_matrix,
        mean_vector=factorization.mean_vector,
        singular_values=factorization.singular_values,
        explained_variance_ratio=factorization.explained_variance_ratio,
        basis=factorization.basis,
        coordinates=factorization.coordinates,
        site_probe_matrix=probe_library.site_probe_matrix,
        settlement_probe_matrix=probe_library.settlement_probe_matrix,
        pairwise_probe_matrix=probe_library.pairwise_probe_matrix,
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="round_manifold_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=to_jsonable(summary_payload),
            spec_name=summary_name,
        ),
    )
    return factorization, summary_path, basis_path


__all__ = ["factorize_round_dynamic_law_subspace"]
