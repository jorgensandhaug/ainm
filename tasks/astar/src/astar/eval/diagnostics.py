from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.episode import RoundEpisodeSummary
from astar.core.grid import MapShape, summarize_coverage
from astar.core.score import entropy_map
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    read_analysis_records,
    read_query_records,
    read_round_record,
    read_submission_records,
)
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogDatasetSummary
from astar.observe.evidence import build_round_evidence


class SeedCoverageDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seed_index: int = Field(ge=0)
    query_count: int = Field(ge=0)
    coverage_min: int = Field(ge=0)
    coverage_max: int = Field(ge=0)
    repeated_window_groups: int = Field(ge=0)


class RoundEpisodeDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    summary: RoundEpisodeSummary
    per_seed: list[SeedCoverageDiagnostic]
    scored_seed_count: int = Field(ge=0)
    mean_ground_truth_entropy: float | None = None
    score_by_seed: dict[int, float] = Field(default_factory=dict)


class LocalDatasetDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_ids: list[str]
    rounds_with_queries: int = Field(ge=0)
    rounds_with_submissions: int = Field(ge=0)
    rounds_with_analyses: int = Field(ge=0)
    rounds_with_features: int = Field(ge=0)
    rounds_with_evidence: int = Field(ge=0)
    rounds_materialized: int = Field(ge=0)
    catalog: CatalogDatasetSummary | None = None


def build_round_episode_diagnostics(
    paths: WorkspacePaths,
    round_id: str,
) -> RoundEpisodeDiagnostics:
    round_record = read_round_record(paths, round_id)
    query_records = read_query_records(paths, round_id)
    submissions = read_submission_records(paths, round_id)
    analyses = read_analysis_records(paths, round_id)
    evidence = build_round_evidence(paths, round_id)

    repeated_window_groups = sum(
        bundle.repeated_window_groups
        for bundle in evidence.per_seed.values()
    )
    summary = RoundEpisodeSummary(
        round_id=round_id,
        round_number=round_record.round.round_number,
        status=round_record.round.status,
        seed_count=round_record.round.seeds_count,
        query_count=len(query_records),
        repeated_window_groups=repeated_window_groups,
        submission_count=len(submissions),
        analysis_count=len(analyses),
    )
    per_seed = []
    for seed_index, bundle in sorted(evidence.per_seed.items()):
        coverage_summary = summarize_coverage(
            MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
            [
                item.record.response.viewport
                for item in query_records
                if item.record.request.seed_index == seed_index
            ],
        )
        per_seed.append(
            SeedCoverageDiagnostic(
                seed_index=seed_index,
                query_count=bundle.query_count,
                coverage_min=coverage_summary.min_count,
                coverage_max=coverage_summary.max_count,
                repeated_window_groups=bundle.repeated_window_groups,
            ),
        )

    score_by_seed = {
        seed_index: float(record.analysis.score)
        for seed_index, record in analyses.items()
        if record.analysis.score is not None
    }
    mean_ground_truth_entropy = None
    if analyses:
        entropies = [
            float(np.mean(entropy_map(np.asarray(record.analysis.ground_truth, dtype=np.float64))))
            for record in analyses.values()
        ]
        mean_ground_truth_entropy = float(np.mean(entropies))

    return RoundEpisodeDiagnostics(
        summary=summary,
        per_seed=per_seed,
        scored_seed_count=len(score_by_seed),
        mean_ground_truth_entropy=mean_ground_truth_entropy,
        score_by_seed=score_by_seed,
    )


def build_local_dataset_diagnostics(paths: WorkspacePaths) -> LocalDatasetDiagnostics:
    round_ids = sorted(path.stem for path in paths.raw_dir.joinpath("rounds").glob("*.json"))
    rounds_with_queries = 0
    rounds_with_submissions = 0
    rounds_with_analyses = 0
    rounds_with_features = 0
    rounds_with_evidence = 0
    rounds_materialized = 0
    for round_id in round_ids:
        if paths.raw_query_dir(round_id).exists() and any(
            paths.raw_query_dir(round_id).glob("*.json"),
        ):
            rounds_with_queries += 1
        if paths.raw_submission_dir(round_id).exists() and any(
            paths.raw_submission_dir(round_id).glob("seed_index=*.json"),
        ):
            rounds_with_submissions += 1
        if paths.raw_analysis_dir(round_id).exists() and any(
            paths.raw_analysis_dir(round_id).glob("seed_index=*.json"),
        ):
            rounds_with_analyses += 1
        if paths.feature_dir(round_id).exists() and any(
            paths.feature_dir(round_id).glob("seed_index=*.npz"),
        ):
            rounds_with_features += 1
        if paths.evidence_dir(round_id).exists() and any(
            paths.evidence_dir(round_id).glob("seed_index=*.npz"),
        ):
            rounds_with_evidence += 1
        episode_summary_path = paths.episode_dir(round_id) / "summary.json"
        if episode_summary_path.exists():
            rounds_materialized += 1

    catalog = None
    if paths.catalog_path.exists():
        catalog = CatalogDB(paths.catalog_path).summarize_dataset()

    return LocalDatasetDiagnostics(
        round_ids=round_ids,
        rounds_with_queries=rounds_with_queries,
        rounds_with_submissions=rounds_with_submissions,
        rounds_with_analyses=rounds_with_analyses,
        rounds_with_features=rounds_with_features,
        rounds_with_evidence=rounds_with_evidence,
        rounds_materialized=rounds_materialized,
        catalog=catalog,
    )
