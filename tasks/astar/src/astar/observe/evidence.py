from __future__ import annotations

from collections.abc import Sequence
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
    observed_cell_count: int = Field(default=0, ge=0)
    repeated_cell_count: int = Field(default=0, ge=0)
    mean_positive_coverage_count: float = Field(default=0.0, ge=0.0)
    mean_population: float | None = None
    mean_food: float | None = None
    mean_wealth: float | None = None
    mean_defense: float | None = None
    std_population: float | None = None
    std_food: float | None = None
    std_wealth: float | None = None
    std_defense: float | None = None
    q25_population: float | None = None
    q25_food: float | None = None
    q25_wealth: float | None = None
    q25_defense: float | None = None
    q75_population: float | None = None
    q75_food: float | None = None
    q75_wealth: float | None = None
    q75_defense: float | None = None
    mean_settlement_count: float = Field(default=0.0, ge=0.0)
    std_settlement_count: float = Field(default=0.0, ge=0.0)
    port_share: float = Field(default=0.0, ge=0.0, le=1.0)
    owner_count: int = Field(default=0, ge=0)
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


def _distribution_summary(
    values: Sequence[float],
) -> tuple[float | None, float | None, float | None, float | None]:
    if not values:
        return (None, None, None, None)
    array = np.asarray(values, dtype=np.float64)
    return (
        float(np.mean(array)),
        float(np.std(array)),
        float(np.quantile(array, 0.25)),
        float(np.quantile(array, 0.75)),
    )


def _coverage_summary_from_counts(
    coverage: np.ndarray,
) -> tuple[int, int, float]:
    positive_mask = coverage > 0
    observed_cell_count = int(np.count_nonzero(positive_mask))
    repeated_cell_count = int(np.count_nonzero(coverage > 1))
    if observed_cell_count == 0:
        return (0, 0, 0.0)
    return (
        observed_cell_count,
        repeated_cell_count,
        float(np.mean(coverage[positive_mask])),
    )


def _coverage_summary_from_observations(
    observations: Sequence[LiveQueryObs],
) -> tuple[int, int, float]:
    cell_counts: dict[tuple[int, int], int] = {}
    for observation in observations:
        viewport = observation.viewport
        for local_y in range(int(viewport.h)):
            for local_x in range(int(viewport.w)):
                key = (int(viewport.y + local_y), int(viewport.x + local_x))
                cell_counts[key] = cell_counts.get(key, 0) + 1
    if not cell_counts:
        return (0, 0, 0.0)
    counts = np.asarray(list(cell_counts.values()), dtype=np.float64)
    return (
        int(counts.shape[0]),
        int(np.count_nonzero(counts > 1.0)),
        float(np.mean(counts)),
    )


def _settlement_summary_from_groups(
    settlement_groups: Sequence[Sequence[object]],
) -> dict[str, float | int | None]:
    settlement_counts: list[float] = []
    populations: list[float] = []
    foods: list[float] = []
    wealths: list[float] = []
    defenses: list[float] = []
    owner_counts: dict[int, int] = {}
    port_count = 0
    total_settlement_count = 0

    for settlements in settlement_groups:
        settlement_counts.append(float(len(settlements)))
        for settlement in settlements:
            total_settlement_count += 1
            population = getattr(settlement, "population", None)
            food = getattr(settlement, "food", None)
            wealth = getattr(settlement, "wealth", None)
            defense = getattr(settlement, "defense", None)
            owner_id = getattr(settlement, "owner_id", None)
            has_port = bool(getattr(settlement, "has_port", False))
            if population is not None:
                populations.append(float(population))
            if food is not None:
                foods.append(float(food))
            if wealth is not None:
                wealths.append(float(wealth))
            if defense is not None:
                defenses.append(float(defense))
            if owner_id is not None:
                owner_counts[int(owner_id)] = owner_counts.get(int(owner_id), 0) + 1
            if has_port:
                port_count += 1

    mean_population, std_population, q25_population, q75_population = _distribution_summary(
        populations,
    )
    mean_food, std_food, q25_food, q75_food = _distribution_summary(foods)
    mean_wealth, std_wealth, q25_wealth, q75_wealth = _distribution_summary(wealths)
    mean_defense, std_defense, q25_defense, q75_defense = _distribution_summary(defenses)
    if owner_counts:
        shares = np.asarray(
            [count / float(sum(owner_counts.values())) for count in owner_counts.values()],
            dtype=np.float64,
        )
        largest_owner_share = float(np.max(shares))
        owner_hhi = float(np.sum(shares * shares))
    else:
        largest_owner_share = 0.0
        owner_hhi = 0.0
    settlement_count_array = np.asarray(settlement_counts, dtype=np.float64)
    return {
        "mean_population": mean_population,
        "mean_food": mean_food,
        "mean_wealth": mean_wealth,
        "mean_defense": mean_defense,
        "std_population": std_population,
        "std_food": std_food,
        "std_wealth": std_wealth,
        "std_defense": std_defense,
        "q25_population": q25_population,
        "q25_food": q25_food,
        "q25_wealth": q25_wealth,
        "q25_defense": q25_defense,
        "q75_population": q75_population,
        "q75_food": q75_food,
        "q75_wealth": q75_wealth,
        "q75_defense": q75_defense,
        "mean_settlement_count": (
            float(np.mean(settlement_count_array)) if settlement_count_array.size > 0 else 0.0
        ),
        "std_settlement_count": (
            float(np.std(settlement_count_array)) if settlement_count_array.size > 0 else 0.0
        ),
        "port_share": (
            float(port_count) / float(total_settlement_count) if total_settlement_count > 0 else 0.0
        ),
        "owner_count": len(owner_counts),
        "largest_owner_share": largest_owner_share,
        "owner_hhi": owner_hhi,
    }


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
    observed_cell_count, repeated_cell_count, mean_positive_coverage_count = _coverage_summary_from_counts(
        coverage,
    )
    settlement_summary = _settlement_summary_from_groups(
        [observation.settlements for observation in observations],
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
        observed_cell_count=observed_cell_count,
        repeated_cell_count=repeated_cell_count,
        mean_positive_coverage_count=mean_positive_coverage_count,
        mean_population=settlement_summary["mean_population"],
        mean_food=settlement_summary["mean_food"],
        mean_wealth=settlement_summary["mean_wealth"],
        mean_defense=settlement_summary["mean_defense"],
        std_population=settlement_summary["std_population"],
        std_food=settlement_summary["std_food"],
        std_wealth=settlement_summary["std_wealth"],
        std_defense=settlement_summary["std_defense"],
        q25_population=settlement_summary["q25_population"],
        q25_food=settlement_summary["q25_food"],
        q25_wealth=settlement_summary["q25_wealth"],
        q25_defense=settlement_summary["q25_defense"],
        q75_population=settlement_summary["q75_population"],
        q75_food=settlement_summary["q75_food"],
        q75_wealth=settlement_summary["q75_wealth"],
        q75_defense=settlement_summary["q75_defense"],
        mean_settlement_count=float(settlement_summary["mean_settlement_count"]),
        std_settlement_count=float(settlement_summary["std_settlement_count"]),
        port_share=float(settlement_summary["port_share"]),
        owner_count=int(settlement_summary["owner_count"]),
        largest_owner_share=float(settlement_summary["largest_owner_share"]),
        owner_hhi=float(settlement_summary["owner_hhi"]),
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
        observed_cell_count, repeated_cell_count, mean_positive_coverage_count = _coverage_summary_from_counts(
            coverage,
        )
        settlement_summary = _settlement_summary_from_groups(
            [record.record.response.settlements for record in records],
        )
        per_seed[seed_index] = SeedEvidenceBundle(
            round_id=round_id,
            seed_index=seed_index,
            query_count=len(records),
            repeated_window_groups=sum(1 for count in repeat_counts.values() if count > 1),
            coverage_counts=coverage,
            observed_class_counts=class_counts,
            observed_class_frequencies=frequencies,
            observed_class_count_tensor=count_tensor,
            observed_cell_count=observed_cell_count,
            repeated_cell_count=repeated_cell_count,
            mean_positive_coverage_count=mean_positive_coverage_count,
            mean_population=settlement_summary["mean_population"],
            mean_food=settlement_summary["mean_food"],
            mean_wealth=settlement_summary["mean_wealth"],
            mean_defense=settlement_summary["mean_defense"],
            std_population=settlement_summary["std_population"],
            std_food=settlement_summary["std_food"],
            std_wealth=settlement_summary["std_wealth"],
            std_defense=settlement_summary["std_defense"],
            q25_population=settlement_summary["q25_population"],
            q25_food=settlement_summary["q25_food"],
            q25_wealth=settlement_summary["q25_wealth"],
            q25_defense=settlement_summary["q25_defense"],
            q75_population=settlement_summary["q75_population"],
            q75_food=settlement_summary["q75_food"],
            q75_wealth=settlement_summary["q75_wealth"],
            q75_defense=settlement_summary["q75_defense"],
            mean_settlement_count=float(settlement_summary["mean_settlement_count"]),
            std_settlement_count=float(settlement_summary["std_settlement_count"]),
            port_share=float(settlement_summary["port_share"]),
            owner_count=int(settlement_summary["owner_count"]),
            largest_owner_share=float(settlement_summary["largest_owner_share"]),
            owner_hhi=float(settlement_summary["owner_hhi"]),
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
