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
    mean_settlement_count: float = Field(default=0.0, ge=0.0)
    alive_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    port_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    owner_count: float = Field(default=0.0, ge=0.0)
    largest_owner_share: float = Field(default=0.0, ge=0.0, le=1.0)
    owner_hhi: float = Field(default=0.0, ge=0.0, le=1.0)


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
    populations = [
        settlement.population
        for record in records
        for settlement in record.record.response.settlements
    ]
    foods = [
        settlement.food for record in records for settlement in record.record.response.settlements
    ]
    wealths = [
        settlement.wealth for record in records for settlement in record.record.response.settlements
    ]
    defenses = [
        settlement.defense
        for record in records
        for settlement in record.record.response.settlements
    ]
    if not populations:
        return (None, None, None, None)
    return (
        float(fmean(populations)),
        float(fmean(foods)),
        float(fmean(wealths)),
        float(fmean(defenses)),
    )


def _settlement_means_from_observations(
    observations: list[LiveQueryObs],
) -> tuple[float | None, float | None, float | None, float | None]:
    populations = [
        settlement.population
        for observation in observations
        for settlement in observation.settlements
        if settlement.population is not None
    ]
    foods = [
        settlement.food
        for observation in observations
        for settlement in observation.settlements
        if settlement.food is not None
    ]
    wealths = [
        settlement.wealth
        for observation in observations
        for settlement in observation.settlements
        if settlement.wealth is not None
    ]
    defenses = [
        settlement.defense
        for observation in observations
        for settlement in observation.settlements
        if settlement.defense is not None
    ]
    if not populations:
        return (None, None, None, None)
    return (
        float(fmean(populations)),
        float(fmean(foods)) if foods else None,
        float(fmean(wealths)) if wealths else None,
        float(fmean(defenses)) if defenses else None,
    )


def _settlement_structure(
    settlements_by_query: list[list[object]],
) -> tuple[float, float, float, float, float, float]:
    if not settlements_by_query:
        return (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    owner_counts: dict[int, int] = {}
    total_settlement_count = 0
    alive_count = 0
    port_count = 0
    query_counts: list[float] = []
    for settlements in settlements_by_query:
        query_counts.append(float(len(settlements)))
        total_settlement_count += len(settlements)
        for settlement in settlements:
            if getattr(settlement, "alive", False):
                alive_count += 1
            if getattr(settlement, "has_port", False):
                port_count += 1
            owner_id = getattr(settlement, "owner_id", None)
            if owner_id is not None:
                owner_counts[int(owner_id)] = owner_counts.get(int(owner_id), 0) + 1
    denominator = float(total_settlement_count)
    alive_fraction = float(alive_count) / denominator if denominator > 0.0 else 0.0
    port_fraction = float(port_count) / denominator if denominator > 0.0 else 0.0
    if owner_counts:
        owner_total = float(sum(owner_counts.values()))
        owner_shares = np.asarray(
            [count / owner_total for count in owner_counts.values()],
            dtype=np.float64,
        )
        owner_count = float(len(owner_counts)) / 10.0
        largest_owner_share = float(np.max(owner_shares))
        owner_hhi = float(np.sum(owner_shares * owner_shares))
    else:
        owner_count = 0.0
        largest_owner_share = 0.0
        owner_hhi = 0.0
    return (
        float(fmean(query_counts)) if query_counts else 0.0,
        alive_fraction,
        port_fraction,
        owner_count,
        largest_owner_share,
        owner_hhi,
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
                class_counts[class_index] += 1
    class_total = int(class_counts.sum())
    frequencies = np.zeros(CLASS_COUNT, dtype=np.float64)
    if class_total > 0:
        frequencies = class_counts.astype(np.float64) / float(class_total)
    mean_population, mean_food, mean_wealth, mean_defense = _settlement_means_from_observations(
        observations,
    )
    (
        mean_settlement_count,
        alive_fraction,
        port_fraction,
        owner_count,
        largest_owner_share,
        owner_hhi,
    ) = _settlement_structure([list(observation.settlements) for observation in observations])
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
        mean_settlement_count=mean_settlement_count,
        alive_fraction=alive_fraction,
        port_fraction=port_fraction,
        owner_count=owner_count,
        largest_owner_share=largest_owner_share,
        owner_hhi=owner_hhi,
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
                    class_counts[class_index] += 1
        class_total = int(class_counts.sum())
        frequencies = np.zeros(CLASS_COUNT, dtype=np.float64)
        if class_total > 0:
            frequencies = class_counts.astype(np.float64) / float(class_total)
        mean_population, mean_food, mean_wealth, mean_defense = _settlement_means(records)
        (
            mean_settlement_count,
            alive_fraction,
            port_fraction,
            owner_count,
            largest_owner_share,
            owner_hhi,
        ) = _settlement_structure([list(record.record.response.settlements) for record in records])
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
            mean_settlement_count=mean_settlement_count,
            alive_fraction=alive_fraction,
            port_fraction=port_fraction,
            owner_count=owner_count,
            largest_owner_share=largest_owner_share,
            owner_hhi=owner_hhi,
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
