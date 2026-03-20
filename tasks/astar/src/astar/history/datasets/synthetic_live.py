from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import Viewport
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs, SettlementFullState
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import round_regime_summary_vector
from astar.infra.api.dto import InitialSettlement, InitialState, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.models.episode_dataset import RoundLearningEpisode, load_round_learning_episode
from astar.observe.policies.registry import build_named_policy
from astar.observe.query_plan import QueryPlanItem
from astar.workflows.materialize_episode import materialize_round_episode


class SyntheticEpisodeIndexRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    sample_index: int = Field(ge=0)
    policy_name: str
    query_count: int = Field(ge=0)
    episode_path: Path


class SyntheticEpisodeArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_index: int = Field(ge=0)
    policy_name: str
    regime_vector: np.ndarray
    observations: tuple[LiveQueryObs, ...]
    target_sources: dict[int, str]
    target_paths: dict[int, Path]


def _item_to_observation(
    round_id: str,
    query_index: int,
    item: QueryPlanItem,
    final_grid: np.ndarray,
    settlements: tuple[SettlementFullState, ...],
) -> LiveQueryObs:
    viewport = item.viewport
    patch = np.asarray(
        final_grid[
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
        ],
        dtype=np.int64,
    )
    patch_settlements = tuple(
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
        for settlement in settlements
        if viewport.x <= settlement.x < viewport.x + viewport.w
        and viewport.y <= settlement.y < viewport.y + viewport.h
    )
    return LiveQueryObs(
        round_id=round_id,
        seed_index=item.seed_index,
        viewport=Viewport(x=viewport.x, y=viewport.y, w=viewport.w, h=viewport.h),
        grid=patch,
        settlements=patch_settlements,
        query_index=query_index,
    )


def _target_info(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    episode: RoundLearningEpisode,
) -> tuple[str, Path]:
    seed = episode.per_seed[seed_index]
    if seed.ground_truth is not None:
        return ("analysis_ground_truth", paths.analysis_tensor_path(round_id, seed_index))
    if seed.replay_mean_terminal_probs is not None:
        return ("replay_mean_terminal_probs", paths.replay_summary_path(round_id, seed_index))
    msg = f"seed {seed_index} in round {round_id} has no terminal target"
    raise ValueError(msg)


def load_synthetic_episode(path: Path) -> SyntheticEpisodeArtifact:
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["regime_vector"] = np.asarray(payload["regime_vector"], dtype=np.float64)
    normalized_observations: list[dict[str, object]] = []
    for observation in payload.get("observations", []):
        observation_payload = dict(observation)
        observation_payload["grid"] = np.asarray(observation_payload["grid"], dtype=np.int64)
        normalized_observations.append(observation_payload)
    payload["observations"] = normalized_observations
    return SyntheticEpisodeArtifact.model_validate(payload)


def build_synthetic_live_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str = "coverage",
    round_ids: list[str] | None = None,
    samples_per_round: int = 1,
    dataset_name: str = "synthetic_live_v1",
) -> SyntheticEpisodeDatasetRef:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    episodes_dir = dataset_dir / "episodes"
    episodes_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "index.parquet"
    summary_path = dataset_dir / "summary.json"

    rows: list[dict[str, str | int]] = []
    total_query_count = 0
    policy = build_named_policy(policy_name)

    for round_id in selected_round_ids:
        round_episode = build_round_episode(paths, round_id)
        if round_episode.replay_run_count == 0:
            continue
        materialize_round_episode(paths, round_id)

        round_detail = RoundDetail(
            id=round_episode.metadata.round_id,
            round_number=int(round_episode.metadata.round_number or -1),
            status=round_episode.metadata.status,
            map_width=round_episode.metadata.map_width,
            map_height=round_episode.metadata.map_height,
            seeds_count=round_episode.metadata.seeds_count,
            initial_states=[
                InitialState(
                    grid=seed.initial_state.grid.tolist(),
                    settlements=[
                        InitialSettlement(
                            x=item.x,
                            y=item.y,
                            has_port=item.has_port,
                            alive=item.alive,
                        )
                        for item in seed.initial_state.settlements
                    ],
                )
                for seed in round_episode.seeds
            ],
        )
        plan = policy.build_plan(round_detail)

        learning_episode = load_round_learning_episode(paths, round_id)

        for sample_index in range(samples_per_round):
            observations: list[LiveQueryObs] = []
            for query_index, item in enumerate(plan.items):
                seed = round_episode.seeds[item.seed_index]
                if not seed.replay_runs:
                    continue
                replay_run = seed.replay_runs[(sample_index + query_index) % len(seed.replay_runs)]
                final_frame = replay_run.frames[-1]
                observations.append(
                    _item_to_observation(
                        round_id=round_id,
                        query_index=query_index,
                        item=item,
                        final_grid=final_frame.grid,
                        settlements=final_frame.settlements,
                    ),
                )

            target_sources = {}
            target_paths = {}
            for seed_index in range(round_episode.metadata.seeds_count):
                try:
                    target_source, target_path = _target_info(
                        paths,
                        round_id,
                        seed_index,
                        learning_episode,
                    )
                except ValueError:
                    continue
                target_sources[seed_index] = target_source
                target_paths[seed_index] = target_path

            artifact = SyntheticEpisodeArtifact(
                round_id=round_id,
                round_number=int(round_episode.metadata.round_number or -1),
                sample_index=sample_index,
                policy_name=policy.name,
                regime_vector=round_regime_summary_vector(round_episode),
                observations=tuple(observations),
                target_sources=target_sources,
                target_paths=target_paths,
            )
            episode_path = episodes_dir / f"{round_id}__sample_index={sample_index}.json"
            episode_path.write_text(
                json.dumps(to_jsonable(artifact), indent=2),
                encoding="utf-8",
            )
            rows.append(
                {
                    "round_id": round_id,
                    "sample_index": sample_index,
                    "policy_name": policy.name,
                    "query_count": len(observations),
                    "episode_path": str(episode_path),
                },
            )
            total_query_count += len(observations)

    index_table = pl.DataFrame(rows)
    index_table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "synthetic_live",
        "policy_name": policy.name,
        "episode_count": index_table.height,
        "samples_per_round": samples_per_round,
        "total_query_count": total_query_count,
        "round_count": len({row["round_id"] for row in rows}),
        "index_path": str(index_path),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="synthetic_episode_built",
            status="ok",
            artifact_path=summary_path,
            payload_json=summary,
            spec_name=dataset_name,
        ),
    )
    return SyntheticEpisodeDatasetRef(
        dataset_name=dataset_name,
        dataset_kind="synthetic_live",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=index_table.height,
        round_count=len({row["round_id"] for row in rows}),
        policy_name=policy.name,
        episode_count=index_table.height,
        total_query_count=total_query_count,
        samples_per_round=samples_per_round,
    )
