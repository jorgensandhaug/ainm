from __future__ import annotations

from typing import Any

import numpy as np

from astar.core.trajectory import LiveQueryObs, TerminalTruth
from astar.core.world_state import (
    InitialSettlementState,
    InitialWorldState,
    LiveSettlementObs,
)
from astar.history.episodes.models import LiveTranscript, RoundEpisode, RoundMetadata, SeedEpisode
from astar.history.replay.ingest import load_seed_replay_runs
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    load_prediction_tensor,
    read_analysis_records,
    read_query_records,
    read_round_record,
    read_submission_records,
)


def _build_initial_state(round_id: str, initial_state: Any) -> InitialWorldState:
    del round_id
    settlements = tuple(
        InitialSettlementState(
            x=item.x,
            y=item.y,
            has_port=item.has_port,
            alive=item.alive,
        )
        for item in initial_state.settlements
    )
    return InitialWorldState(
        grid=np.asarray(initial_state.grid, dtype=np.int64),
        settlements=settlements,
    )


def _build_live_transcript(paths: WorkspacePaths, round_id: str) -> LiveTranscript | None:
    query_records = read_query_records(paths, round_id)
    if not query_records:
        return None
    observations: list[LiveQueryObs] = []
    for query_index, item in enumerate(
        sorted(query_records, key=lambda record: record.record.query_id)
    ):
        observations.append(
            LiveQueryObs(
                round_id=round_id,
                seed_index=item.record.request.seed_index,
                viewport=item.record.response.viewport,
                grid=np.asarray(item.record.response.grid, dtype=np.int64),
                settlements=tuple(
                    LiveSettlementObs(
                        x=settlement.x,
                        y=settlement.y,
                        population=settlement.population,
                        food=settlement.food,
                        wealth=settlement.wealth,
                        defense=settlement.defense,
                        has_port=settlement.has_port,
                        alive=settlement.alive,
                        owner_id=settlement.owner_id,
                    )
                    for settlement in item.record.response.settlements
                ),
                query_index=query_index,
            ),
        )
    return LiveTranscript(observations=tuple(observations))


def build_round_episode(
    paths: WorkspacePaths,
    round_id: str,
) -> RoundEpisode:
    round_record = read_round_record(paths, round_id)
    analyses = read_analysis_records(paths, round_id)
    submissions = read_submission_records(paths, round_id)
    seeds: list[SeedEpisode] = []

    for seed_index in range(round_record.round.seeds_count):
        initial_state = _build_initial_state(
            round_id,
            round_record.round.initial_states[seed_index],
        )
        terminal_truth = None
        if seed_index in analyses:
            terminal_truth = TerminalTruth(
                probs=np.asarray(analyses[seed_index].analysis.ground_truth, dtype=np.float64),
                score_against_submission=analyses[seed_index].analysis.score,
            )
        submitted_prediction = None
        prediction_path = paths.prediction_tensor_path(round_id, seed_index)
        if seed_index in submissions and prediction_path.exists():
            submitted_prediction = load_prediction_tensor(prediction_path)
        seeds.append(
            SeedEpisode(
                seed_index=seed_index,
                initial_state=initial_state,
                terminal_truth=terminal_truth,
                submitted_prediction=submitted_prediction,
                replay_runs=tuple(load_seed_replay_runs(paths, round_id, seed_index)),
            ),
        )

    return RoundEpisode(
        metadata=RoundMetadata(
            round_id=round_record.round.id,
            round_number=round_record.round.round_number,
            status=round_record.round.status,
            map_width=round_record.round.map_width,
            map_height=round_record.round.map_height,
            seeds_count=round_record.round.seeds_count,
        ),
        seeds=tuple(seeds),
        live_transcript=_build_live_transcript(paths, round_id),
    )
