from __future__ import annotations

import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from astar.api.client import AstarApiClient
from astar.api.schemas import ReplayRequest, StoredReplayRecord
from astar.ops.results import (
    HarvestReplaysResult,
    RecordedReplayResult,
    ReplayHarvestSeedSummary,
)
from astar.ops.run_queries import current_git_sha
from astar.ops.sync_round import sync_round
from astar.storage.io_raw import write_replay_record
from astar.storage.manifests import RepoPaths


@dataclass(slots=True)
class _ReplayTarget:
    round_id: str
    seed_index: int
    existing_before: int
    remaining: int
    captured: int = 0


def _count_existing_replays(paths: RepoPaths, round_id: str, seed_index: int) -> int:
    replay_dir = paths.raw_replay_dir(round_id, seed_index)
    if not replay_dir.exists():
        return 0
    return sum(1 for _ in replay_dir.glob("*.json"))


def record_replay(
    paths: RepoPaths,
    client: AstarApiClient,
    request: ReplayRequest,
    capture_id: str | None = None,
) -> RecordedReplayResult:
    response = client.replay(request)
    resolved_capture_id = capture_id or uuid4().hex
    record = StoredReplayRecord(
        capture_id=resolved_capture_id,
        requested_at=datetime.now(UTC),
        git_sha=current_git_sha(),
        request=request,
        response=response,
    )
    path = write_replay_record(paths, record)
    settlement_observation_count = sum(len(frame.settlements) for frame in response.frames)
    return RecordedReplayResult(
        round_id=request.round_id,
        seed_index=request.seed_index,
        sim_seed=response.sim_seed,
        frame_count=len(response.frames),
        settlement_observation_count=settlement_observation_count,
        path=path,
    )


def _inter_replay_delay_seconds(min_seconds: float, max_seconds: float) -> float:
    if max_seconds <= 0.0:
        return 0.0
    if min_seconds == max_seconds:
        return min_seconds
    return random.uniform(min_seconds, max_seconds)


def harvest_replays(
    paths: RepoPaths,
    client: AstarApiClient,
    *,
    round_ids: list[str] | None = None,
    statuses: set[str] | None = None,
    samples_per_seed: int = 1,
    max_new_replays: int | None = None,
    cooldown_seconds: float = 30.0,
    random_delay_min_seconds: float = 0.0,
    random_delay_max_seconds: float = 0.0,
    progress: Callable[[str], None] | None = None,
) -> HarvestReplaysResult:
    if samples_per_seed < 1:
        raise ValueError("samples_per_seed must be >= 1")
    if max_new_replays is not None and max_new_replays < 0:
        raise ValueError("max_new_replays must be >= 0")
    if cooldown_seconds < 0.0:
        raise ValueError("cooldown_seconds must be >= 0")
    if random_delay_min_seconds < 0.0:
        raise ValueError("random_delay_min_seconds must be >= 0")
    if random_delay_max_seconds < 0.0:
        raise ValueError("random_delay_max_seconds must be >= 0")
    if random_delay_min_seconds > random_delay_max_seconds:
        raise ValueError("random_delay_min_seconds must be <= random_delay_max_seconds")

    selected_round_ids = set(round_ids) if round_ids is not None else None
    effective_statuses = statuses
    if effective_statuses is None and selected_round_ids is None:
        effective_statuses = {"completed"}

    round_summaries = client.list_rounds()
    if effective_statuses is not None:
        round_summaries = [item for item in round_summaries if item.status in effective_statuses]
    if selected_round_ids is not None:
        round_summaries = [item for item in round_summaries if item.id in selected_round_ids]

    if selected_round_ids is not None:
        found_round_ids = {item.id for item in round_summaries}
        missing_round_ids = sorted(selected_round_ids - found_round_ids)
        if missing_round_ids:
            msg = f"rounds not found in list-rounds output: {', '.join(missing_round_ids)}"
            raise ValueError(msg)

    round_summaries = sorted(round_summaries, key=lambda item: item.round_number)
    if not round_summaries:
        raise ValueError("no rounds matched the requested replay harvest filters")

    targets: list[_ReplayTarget] = []
    existing_replays = 0
    ordered_round_ids: list[str] = []

    for round_summary in round_summaries:
        ordered_round_ids.append(round_summary.id)
        sync_result = sync_round(paths, client, round_summary.id)
        if progress is not None:
            progress(
                " ".join(
                    [
                        "synced-round",
                        f"round={sync_result.round_id}",
                        f"status={sync_result.status}",
                        f"seeds={sync_result.seeds_count}",
                    ],
                ),
            )
        for seed_index in range(sync_result.seeds_count):
            existing_before = _count_existing_replays(paths, round_summary.id, seed_index)
            existing_replays += existing_before
            targets.append(
                _ReplayTarget(
                    round_id=round_summary.id,
                    seed_index=seed_index,
                    existing_before=existing_before,
                    remaining=max(samples_per_seed - existing_before, 0),
                ),
            )

    captured_replays = 0
    rate_limit_cooldowns = 0

    while any(target.remaining > 0 for target in targets):
        if max_new_replays is not None and captured_replays >= max_new_replays:
            break

        rate_limited = False
        for target in targets:
            if target.remaining <= 0:
                continue
            if max_new_replays is not None and captured_replays >= max_new_replays:
                break

            try:
                replay_result = record_replay(
                    paths,
                    client,
                    ReplayRequest(round_id=target.round_id, seed_index=target.seed_index),
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 429:
                    raise
                rate_limit_cooldowns += 1
                rate_limited = True
                if progress is not None:
                    progress(
                        " ".join(
                            [
                                "rate-limited",
                                f"round={target.round_id}",
                                f"seed={target.seed_index}",
                                f"cooldown_seconds={cooldown_seconds:.1f}",
                            ],
                        ),
                    )
                break

            target.remaining -= 1
            target.captured += 1
            captured_replays += 1
            if progress is not None:
                progress(
                    " ".join(
                        [
                            "captured-replay",
                            f"round={replay_result.round_id}",
                            f"seed={replay_result.seed_index}",
                            f"sim_seed={replay_result.sim_seed}",
                            f"frames={replay_result.frame_count}",
                            f"saved={replay_result.path}",
                            f"new_total={captured_replays}",
                        ],
                    ),
                )

            if max_new_replays is not None and captured_replays >= max_new_replays:
                continue
            if not any(next_target.remaining > 0 for next_target in targets):
                continue

            delay_seconds = _inter_replay_delay_seconds(
                random_delay_min_seconds,
                random_delay_max_seconds,
            )
            if delay_seconds > 0.0:
                if progress is not None:
                    progress(f"sleeping-next-replay seconds={delay_seconds:.1f}")
                time.sleep(delay_seconds)

        if rate_limited and cooldown_seconds > 0.0:
            time.sleep(cooldown_seconds)

    seed_summaries = [
        ReplayHarvestSeedSummary(
            round_id=target.round_id,
            seed_index=target.seed_index,
            existing_before=target.existing_before,
            captured=target.captured,
            total_after=target.existing_before + target.captured,
            replay_dir=paths.raw_replay_dir(target.round_id, target.seed_index),
        )
        for target in targets
    ]

    return HarvestReplaysResult(
        round_ids=ordered_round_ids,
        rounds_considered=len(ordered_round_ids),
        seeds_considered=len(seed_summaries),
        existing_replays=existing_replays,
        captured_replays=captured_replays,
        total_replays=existing_replays + captured_replays,
        rate_limit_cooldowns=rate_limit_cooldowns,
        replay_root=paths.raw_dir / "replays",
        seed_summaries=seed_summaries,
    )
