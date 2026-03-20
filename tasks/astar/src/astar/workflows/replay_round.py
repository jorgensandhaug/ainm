from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_query_records, read_round_record
from astar.infra.artifacts.tables import write_query_tables, write_round_tables
from astar.workflows.results import ReplayRoundResult


def replay_round(paths: WorkspacePaths, round_id: str) -> ReplayRoundResult:
    round_record = read_round_record(paths, round_id)
    query_files = read_query_records(paths, round_id)
    write_round_tables(paths, round_record)
    write_query_tables(paths, round_id, query_files)
    cell_count = sum(
        len(query_file.record.response.grid) * len(query_file.record.response.grid[0])
        for query_file in query_files
    )
    settlement_count = sum(
        len(query_file.record.response.settlements)
        for query_file in query_files
    )
    return ReplayRoundResult(
        round_id=round_id,
        query_count=len(query_files),
        cell_observation_count=cell_count,
        settlement_observation_count=settlement_count,
        rounds_path=paths.derived_dir / "rounds.parquet",
        seed_initial_states_path=paths.derived_dir / "seed_initial_states.parquet",
        query_log_path=paths.query_log_path(round_id),
        cell_observations_path=paths.cell_observations_path(round_id),
        settlement_observations_path=paths.settlement_observations_path(round_id),
    )
