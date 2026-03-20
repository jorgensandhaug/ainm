from __future__ import annotations

import polars as pl
from pydantic import BaseModel, ConfigDict

from astar.api.schemas import StoredRoundRecord
from astar.domain.terrain import map_internal_code
from astar.storage.io_raw import QueryFileRecord
from astar.storage.manifests import RepoPaths


class QueryLogRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    query_id: str
    round_id: str
    seed_index: int
    viewport_x: int
    viewport_y: int
    viewport_w: int
    viewport_h: int
    requested_at: str
    git_sha: str
    config_hash: str
    response_path: str


class CellObservationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    query_id: str
    round_id: str
    seed_index: int
    y: int
    x: int
    observed_code: int
    observed_class6: int


class SettlementObservationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    query_id: str
    round_id: str
    seed_index: int
    x: int
    y: int
    population: float
    food: float
    wealth: float
    defense: float
    has_port: bool
    alive: bool
    owner_id: int | None = None


class RoundRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    status: str
    width: int
    height: int
    seeds_count: int


class SeedInitialStateRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int
    y: int
    x: int
    terrain_code: int
    initial_has_settlement: bool
    initial_has_port: bool


def build_query_log_frame(query_files: list[QueryFileRecord]) -> pl.DataFrame:
    rows = [
        QueryLogRow(
            query_id=query_file.record.query_id,
            round_id=query_file.record.request.round_id,
            seed_index=query_file.record.request.seed_index,
            viewport_x=query_file.record.request.viewport_x,
            viewport_y=query_file.record.request.viewport_y,
            viewport_w=query_file.record.request.viewport_w,
            viewport_h=query_file.record.request.viewport_h,
            requested_at=query_file.record.requested_at.isoformat(),
            git_sha=query_file.record.git_sha,
            config_hash=query_file.record.config_hash,
            response_path=str(query_file.path),
        ).model_dump()
        for query_file in query_files
    ]
    return pl.DataFrame(rows)


def build_cell_observations_frame(query_files: list[QueryFileRecord]) -> pl.DataFrame:
    rows: list[dict[str, object]] = []
    for query_file in query_files:
        record = query_file.record
        base_x = record.response.viewport.x
        base_y = record.response.viewport.y
        for local_y, row in enumerate(record.response.grid):
            for local_x, observed_code in enumerate(row):
                rows.append(
                    CellObservationRow(
                        query_id=record.query_id,
                        round_id=record.request.round_id,
                        seed_index=record.request.seed_index,
                        y=base_y + local_y,
                        x=base_x + local_x,
                        observed_code=observed_code,
                        observed_class6=map_internal_code(observed_code),
                    ).model_dump()
                )
    return pl.DataFrame(rows)


def build_settlement_observations_frame(query_files: list[QueryFileRecord]) -> pl.DataFrame:
    rows: list[dict[str, object]] = []
    for query_file in query_files:
        record = query_file.record
        for settlement in record.response.settlements:
            rows.append(
                SettlementObservationRow(
                    query_id=record.query_id,
                    round_id=record.request.round_id,
                    seed_index=record.request.seed_index,
                    x=settlement.x,
                    y=settlement.y,
                    population=settlement.population,
                    food=settlement.food,
                    wealth=settlement.wealth,
                    defense=settlement.defense,
                    has_port=settlement.has_port,
                    alive=settlement.alive,
                    owner_id=settlement.owner_id,
                ).model_dump()
            )
    return pl.DataFrame(rows)


def build_round_frame(record: StoredRoundRecord) -> pl.DataFrame:
    row = RoundRow(
        round_id=record.round.id,
        round_number=record.round.round_number,
        status=record.round.status,
        width=record.round.map_width,
        height=record.round.map_height,
        seeds_count=record.round.seeds_count,
    )
    return pl.DataFrame([row.model_dump()])


def build_seed_initial_states_frame(record: StoredRoundRecord) -> pl.DataFrame:
    rows: list[dict[str, object]] = []
    for seed_index, initial_state in enumerate(record.round.initial_states):
        settlement_lookup = {(item.x, item.y): item for item in initial_state.settlements}
        for y, row in enumerate(initial_state.grid):
            for x, terrain_code in enumerate(row):
                settlement = settlement_lookup.get((x, y))
                rows.append(
                    SeedInitialStateRow(
                        round_id=record.round.id,
                        seed_index=seed_index,
                        y=y,
                        x=x,
                        terrain_code=terrain_code,
                        initial_has_settlement=settlement is not None,
                        initial_has_port=(
                            bool(settlement.has_port) if settlement is not None else False
                        ),
                    ).model_dump()
                )
    return pl.DataFrame(rows)


def write_round_tables(paths: RepoPaths, record: StoredRoundRecord) -> None:
    build_round_frame(record).write_parquet(paths.derived_dir / "rounds.parquet")
    build_seed_initial_states_frame(record).write_parquet(
        paths.derived_dir / "seed_initial_states.parquet",
    )


def write_query_tables(paths: RepoPaths, round_id: str, query_files: list[QueryFileRecord]) -> None:
    build_query_log_frame(query_files).write_parquet(paths.query_log_path(round_id))
    build_cell_observations_frame(query_files).write_parquet(paths.cell_observations_path(round_id))
    build_settlement_observations_frame(query_files).write_parquet(paths.settlement_observations_path(round_id))
