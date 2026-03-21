from __future__ import annotations

from statistics import fmean

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, coverage_counts
from astar.core.terrain import CLASS_COUNT, map_internal_code
from astar.core.trajectory import LiveQueryObs
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    QueryFileRecord,
    read_query_records,
    read_round_record,
)


class SeedEvidenceBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    query_count: int = Field(ge=0)
    repeated_window_groups: int = Field(ge=0)
    coverage_counts: np.ndarray
    observed_class_counts: np.ndarray
    observed_class_frequencies: np.ndarray
    observed_class_count_tensor: np.ndarray
    mean_population: float | None = None
    mean_food: float | None = None
    mean_wealth: float | None = None
    mean_defense: float | None = None


class RoundEvidenceBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    per_seed: dict[int, SeedEvidenceBundle]

    @property
    def total_queries(self) -> int:
        return sum(item.query_count for item in self.per_seed.values())


def _viewport_key(record: QueryFileRecord) -> tuple[int, int, int, int, int]:
    viewport = record.record.response.viewport
    return (
        record.record.request.seed_index,
        viewport.x,
        viewport.y,
        viewport.w,
        viewport.h,
    )


def _settlement_means(
    records: list[QueryFileRecord],
) -> tuple[float | None, float | None, float | None, float | None]:
    populations: dict[tuple[int, int], list[float]] = {}
    foods: dict[tuple[int, int], list[float]] = {}
    wealths: dict[tuple[int, int], list[float]] = {}
    defenses: dict[tuple[int, int], list[float]] = {}

    for record in records:
        for settlement in record.record.response.settlements:
            key = (settlement.y, settlement.x)
            if settlement.population is not None:
                populations.setdefault(key, []).append(settlement.population)
            if settlement.food is not None:
                foods.setdefault(key, []).append(settlement.food)
            if settlement.wealth is not None:
                wealths.setdefault(key, []).append(settlement.wealth)
            if settlement.defense is not None:
                defenses.setdefault(key, []).append(settlement.defense)

    if not populations:
        return (None, None, None, None)
    
    site_mean_pops = [fmean(vals) for vals in populations.values()]
    site_mean_foods = [fmean(vals) for vals in foods.values()]
    site_mean_wealths = [fmean(vals) for vals in wealths.values()]
    site_mean_defenses = [fmean(vals) for vals in defenses.values()]

    return (
        float(fmean(site_mean_pops)),
        float(fmean(site_mean_foods)) if site_mean_foods else None,
        float(fmean(site_mean_wealths)) if site_mean_wealths else None,
        float(fmean(site_mean_defenses)) if site_mean_defenses else None,
    )


def _settlement_means_from_observations(
    observations: list[LiveQueryObs],
) -> tuple[float | None, float | None, float | None, float | None]:
    populations: dict[tuple[int, int], list[float]] = {}
    foods: dict[tuple[int, int], list[float]] = {}
    wealths: dict[tuple[int, int], list[float]] = {}
    defenses: dict[tuple[int, int], list[float]] = {}

    for observation in observations:
        for settlement in observation.settlements:
            key = (settlement.y, settlement.x)
            if settlement.population is not None:
                populations.setdefault(key, []).append(settlement.population)
            if settlement.food is not None:
                foods.setdefault(key, []).append(settlement.food)
            if settlement.wealth is not None:
                wealths.setdefault(key, []).append(settlement.wealth)
            if settlement.defense is not None:
                defenses.setdefault(key, []).append(settlement.defense)

    if not populations:
        return (None, None, None, None)

    site_mean_pops = [fmean(vals) for vals in populations.values()]
    site_mean_foods = [fmean(vals) for vals in foods.values()]
    site_mean_wealths = [fmean(vals) for vals in wealths.values()]
    site_mean_defenses = [fmean(vals) for vals in defenses.values()]

    return (
        float(fmean(site_mean_pops)),
        float(fmean(site_mean_foods)) if site_mean_foods else None,
        float(fmean(site_mean_wealths)) if site_mean_wealths else None,
        float(fmean(site_mean_defenses)) if site_mean_defenses else None,
    )


def _build_seed_evidence_bundle(
    *,
    round_id: str,
    seed_index: int,
    map_width: int,
    map_height: int,
    observations: list[LiveQueryObs],
) -> SeedEvidenceBundle:
    viewports = [item.viewport for item in observations]
    coverage = coverage_counts(
        MapShape(width=map_width, height=map_height),
        viewports,
    )
    count_tensor = np.zeros((map_height, map_width, CLASS_COUNT), dtype=np.int64)
    class_counts = np.zeros(CLASS_COUNT, dtype=np.int64)
    repeat_counts: dict[tuple[int, int, int, int, int], int] = {}
    for observation in observations:
        viewport = observation.viewport
        key = (
            seed_index,
            viewport.x,
            viewport.y,
            viewport.w,
            viewport.h,
        )
        repeat_counts[key] = repeat_counts.get(key, 0) + 1
        for local_y, row in enumerate(observation.grid):
            for local_x, code in enumerate(row.tolist()):
                class_index = map_internal_code(int(code))
                global_y = viewport.y + local_y
                global_x = viewport.x + local_x
                count_tensor[global_y, global_x, class_index] += 1
                
    class_counts = count_tensor.sum(axis=(0, 1)).astype(np.int64)
    count_total = count_tensor.sum(axis=-1)
    mask = count_total > 0
    exact_freq = np.zeros_like(count_tensor, dtype=np.float64)
    if np.any(mask):
        exact_freq[mask] = count_tensor[mask] / count_total[mask, None]
        frequencies = exact_freq[mask].mean(axis=0)
    else:
        frequencies = np.zeros(CLASS_COUNT, dtype=np.float64)

    mean_population, mean_food, mean_wealth, mean_defense = _settlement_means_from_observations(
        observations,
    )
    return SeedEvidenceBundle(
        round_id=round_id,
        seed_index=seed_index,
        query_count=len(observations),
        repeated_window_groups=sum(1 for count in repeat_counts.values() if count > 1),
        coverage_counts=coverage,
        observed_class_counts=class_counts,
        observed_class_frequencies=frequencies,
        observed_class_count_tensor=count_tensor,
        mean_population=mean_population,
        mean_food=mean_food,
        mean_wealth=mean_wealth,
        mean_defense=mean_defense,
    )


def build_round_evidence(paths: WorkspacePaths, round_id: str) -> RoundEvidenceBundle:
    round_record = read_round_record(paths, round_id)
    query_records = read_query_records(paths, round_id)
    grouped: dict[int, list[QueryFileRecord]] = {
        seed_index: [] for seed_index in range(round_record.round.seeds_count)
    }
    for query_record in query_records:
        grouped[query_record.record.request.seed_index].append(query_record)

    per_seed: dict[int, SeedEvidenceBundle] = {}
    for seed_index, records in grouped.items():
        viewports = [item.record.response.viewport for item in records]
        coverage = coverage_counts(
            MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
            viewports,
        )
        count_tensor = np.zeros(
            (round_record.round.map_height, round_record.round.map_width, CLASS_COUNT),
            dtype=np.int64,
        )
        class_counts = np.zeros(CLASS_COUNT, dtype=np.int64)
        repeat_counts: dict[tuple[int, int, int, int, int], int] = {}
        for record in records:
            repeat_counts[_viewport_key(record)] = repeat_counts.get(_viewport_key(record), 0) + 1
            viewport = record.record.response.viewport
            for local_y, row in enumerate(record.record.response.grid):
                for local_x, code in enumerate(row):
                    class_index = map_internal_code(code)
                    global_y = viewport.y + local_y
                    global_x = viewport.x + local_x
                    count_tensor[global_y, global_x, class_index] += 1
                    
        class_counts = count_tensor.sum(axis=(0, 1)).astype(np.int64)
        count_total = count_tensor.sum(axis=-1)
        mask = count_total > 0
        exact_freq = np.zeros_like(count_tensor, dtype=np.float64)
        if np.any(mask):
            exact_freq[mask] = count_tensor[mask] / count_total[mask, None]
            frequencies = exact_freq[mask].mean(axis=0)
        else:
            frequencies = np.zeros(CLASS_COUNT, dtype=np.float64)
            
        mean_population, mean_food, mean_wealth, mean_defense = _settlement_means(records)
        per_seed[seed_index] = SeedEvidenceBundle(
            round_id=round_id,
            seed_index=seed_index,
            query_count=len(records),
            repeated_window_groups=sum(1 for count in repeat_counts.values() if count > 1),
            coverage_counts=coverage,
            observed_class_counts=class_counts,
            observed_class_frequencies=frequencies,
            observed_class_count_tensor=count_tensor,
            mean_population=mean_population,
            mean_food=mean_food,
            mean_wealth=mean_wealth,
            mean_defense=mean_defense,
        )

    return RoundEvidenceBundle(round_id=round_id, per_seed=per_seed)


def build_round_evidence_from_observations(
    round_detail: RoundDetail,
    observations: tuple[LiveQueryObs, ...] | list[LiveQueryObs],
) -> RoundEvidenceBundle:
    grouped: dict[int, list[LiveQueryObs]] = {
        seed_index: [] for seed_index in range(round_detail.seeds_count)
    }
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    per_seed = {
        seed_index: _build_seed_evidence_bundle(
            round_id=round_detail.id,
            seed_index=seed_index,
            map_width=round_detail.map_width,
            map_height=round_detail.map_height,
            observations=seed_observations,
        )
        for seed_index, seed_observations in grouped.items()
    }
    return RoundEvidenceBundle(round_id=round_detail.id, per_seed=per_seed)
