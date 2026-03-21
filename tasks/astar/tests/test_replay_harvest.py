from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from astar.infra.api.dto import (
    ReplayFrame,
    ReplayRequest,
    ReplayResponse,
    RoundSummary,
    SettlementObservation,
    StoredReplayRecord,
)
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.workflows.replay_capture import fetch_replay as record_replay
from astar.workflows.replay_capture import harvest_replays
from tests.conftest import ROUND_ID


def _build_round_summary(paths: RepoPaths) -> RoundSummary:
    round_record = read_round_record(paths, ROUND_ID)
    round_detail = round_record.round
    return RoundSummary(
        id=round_detail.id,
        round_number=round_detail.round_number,
        event_date=round_detail.event_date or "2026-01-01",
        status=round_detail.status,
        map_width=round_detail.map_width,
        map_height=round_detail.map_height,
        prediction_window_minutes=round_detail.prediction_window_minutes or 1,
        started_at=round_detail.started_at or datetime.now(UTC),
        closes_at=round_detail.closes_at or datetime.now(UTC),
        round_weight=round_detail.round_weight or 1.0,
        created_at=round_record.fetched_at,
    )


class FakeReplayClient:
    def __init__(self, paths: RepoPaths) -> None:
        self._round_record = read_round_record(paths, ROUND_ID)
        self._summary = _build_round_summary(paths)
        self.replay_calls: list[ReplayRequest] = []

    def list_rounds(self) -> list[RoundSummary]:
        return [self._summary]

    def get_round(self, round_id: str):  # type: ignore[no-untyped-def]
        assert round_id == ROUND_ID
        return self._round_record.round

    def replay(self, request: ReplayRequest) -> ReplayResponse:
        self.replay_calls.append(request)
        sim_seed = 1000 + len(self.replay_calls)
        settlement = SettlementObservation(
            x=request.seed_index,
            y=request.seed_index,
            population=1.0,
            food=0.5,
            wealth=0.5,
            defense=0.5,
            has_port=False,
            alive=True,
            owner_id=request.seed_index,
        )
        frames = [
            ReplayFrame(step=0, grid=[[11, 11], [11, 11]], settlements=[settlement]),
            ReplayFrame(step=1, grid=[[11, 11], [11, 3]], settlements=[settlement]),
        ]
        return ReplayResponse(
            round_id=request.round_id,
            seed_index=request.seed_index,
            sim_seed=sim_seed,
            width=2,
            height=2,
            frames=frames,
        )


def test_record_replay_writes_expected_file(sample_paths: RepoPaths) -> None:
    client = FakeReplayClient(sample_paths)

    result = record_replay(
        sample_paths,
        client,  # type: ignore[arg-type]
        ReplayRequest(round_id=ROUND_ID, seed_index=2),
    )

    assert result.round_id == ROUND_ID
    assert result.seed_index == 2
    assert result.sim_seed == 1001
    assert result.frame_count == 2
    assert result.path.parent == sample_paths.raw_replay_dir(ROUND_ID, 2)

    record = StoredReplayRecord.model_validate_json(result.path.read_text(encoding="utf-8"))
    assert record.request.seed_index == 2
    assert record.response.frames[-1].grid[1][1] == 3


def test_harvest_replays_is_resumable_and_prioritizes_lowest_count_targets(
    sample_paths: RepoPaths,
) -> None:
    client = FakeReplayClient(sample_paths)

    existing = record_replay(
        sample_paths,
        client,  # type: ignore[arg-type]
        ReplayRequest(round_id=ROUND_ID, seed_index=0),
    )
    assert Path(existing.path).exists()

    result = harvest_replays(
        sample_paths,
        client,  # type: ignore[arg-type]
        round_ids=[ROUND_ID],
        samples_per_seed=2,
        max_new_replays=3,
        cooldown_seconds=0.0,
    )

    assert result.round_ids == [ROUND_ID]
    assert result.existing_replays == 1
    assert result.captured_replays == 3
    assert result.total_replays == 4
    assert result.seeds_considered == 5

    summaries = {(item.round_id, item.seed_index): item for item in result.seed_summaries}
    assert summaries[(ROUND_ID, 0)].existing_before == 1
    assert summaries[(ROUND_ID, 0)].captured == 0
    assert summaries[(ROUND_ID, 0)].total_after == 1
    assert summaries[(ROUND_ID, 1)].captured == 1
    assert summaries[(ROUND_ID, 2)].captured == 1
    assert summaries[(ROUND_ID, 3)].captured == 1
    assert summaries[(ROUND_ID, 4)].captured == 0


def test_harvest_replays_applies_randomized_inter_replay_delay(
    sample_paths: RepoPaths,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeReplayClient(sample_paths)
    sleep_calls: list[float] = []
    progress_messages: list[str] = []

    monkeypatch.setattr(
        "astar.workflows.replay_capture.random.uniform",
        lambda lower, upper: (lower + upper) / 2.0,
    )
    monkeypatch.setattr("astar.workflows.replay_capture.time.sleep", sleep_calls.append)

    result = harvest_replays(
        sample_paths,
        client,  # type: ignore[arg-type]
        round_ids=[ROUND_ID],
        samples_per_seed=1,
        max_new_replays=2,
        cooldown_seconds=0.0,
        random_delay_min_seconds=60.0,
        random_delay_max_seconds=180.0,
        progress=progress_messages.append,
    )

    assert result.captured_replays == 2
    assert sleep_calls == [120.0]
    assert progress_messages[0] == f"synced-round round={ROUND_ID} status=completed seeds=5"
    assert progress_messages[1].startswith(
        f"captured-replay round={ROUND_ID} seed=0 sim_seed=1001 frames=2 saved=",
    )
    assert progress_messages[2] == "sleeping-next-replay seconds=120.0"
    assert progress_messages[3].startswith(
        f"captured-replay round={ROUND_ID} seed=1 sim_seed=1002 frames=2 saved=",
    )
