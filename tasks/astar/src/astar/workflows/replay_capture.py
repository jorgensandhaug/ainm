from __future__ import annotations

from collections.abc import Callable
from typing import Any

from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import ReplayRequest
from astar.infra.artifacts.paths import WorkspacePaths
from astar.legacy.harvest_replays import (
    harvest_replays as harvest_replays_legacy,
)
from astar.legacy.harvest_replays import (
    record_replay as record_replay_legacy,
)


def fetch_replay(
    paths: WorkspacePaths,
    client: AstarApiClient,
    request: ReplayRequest,
) -> Any:
    return record_replay_legacy(paths, client, request)


def harvest_replays(
    paths: WorkspacePaths,
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
) -> Any:
    return harvest_replays_legacy(
        paths,
        client,
        round_ids=round_ids,
        statuses=statuses,
        samples_per_seed=samples_per_seed,
        max_new_replays=max_new_replays,
        cooldown_seconds=cooldown_seconds,
        random_delay_min_seconds=random_delay_min_seconds,
        random_delay_max_seconds=random_delay_max_seconds,
        progress=progress,
    )
