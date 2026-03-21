from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import LiveQueryObs
from astar.envs.synthetic import SyntheticActiveOracle
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.episodes.build import build_round_episode
from astar.history.learning import RoundLearningEpisode, load_round_learning_episode
from astar.history.summaries.round_coefficients import round_regime_summary_vector
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.policy.interactive import QueryPlanPolicyAdapter, build_interactive_policy
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.online_episode import run_online_episode


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


def _plan_budget(
    policy: QueryPlanPolicyAdapter,
    round_id: str,
    oracle: SyntheticActiveOracle,
) -> int:
    round_context = oracle.get_round_context(round_id)
    plan = policy.policy.build_plan(round_context.to_round_detail())
    return sum(item.repeats for item in plan.items)


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


def resolve_synthetic_episode_path(
    path: Path,
    *,
    paths: WorkspacePaths | None = None,
) -> Path:
    candidate = Path(path)
    if candidate.exists():
        return candidate
    if paths is not None:
        if not candidate.is_absolute():
            workspace_relative = (paths.root / candidate).resolve()
            if workspace_relative.exists():
                return workspace_relative
        parts = candidate.parts
        if "data" in parts:
            data_index = parts.index("data")
            remapped = paths.root.joinpath(*parts[data_index:])
            if remapped.exists():
                return remapped
        if len(parts) >= 3 and parts[-2] == "episodes":
            dataset_name = parts[-3]
            remapped = paths.dataset_dir(dataset_name) / "episodes" / parts[-1]
            if remapped.exists():
                return remapped
    msg = f"synthetic episode artifact not found: {candidate}"
    raise FileNotFoundError(msg)


def load_synthetic_episode(
    path: Path,
    *,
    paths: WorkspacePaths | None = None,
) -> SyntheticEpisodeArtifact:
    resolved_path = resolve_synthetic_episode_path(path, paths=paths)
    payload = json.loads(resolved_path.read_text(encoding="utf-8"))
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
    oracle = SyntheticActiveOracle(paths=paths)
    policy = build_interactive_policy(policy_name)
    recorder = TranscriptRecorderPredictor()

    for round_id in selected_round_ids:
        round_episode = build_round_episode(paths, round_id)
        if round_episode.replay_run_count == 0:
            continue
        materialize_round_episode(paths, round_id)
        budget = _plan_budget(policy, round_id, oracle)
        learning_episode = load_round_learning_episode(paths, round_id)

        for sample_index in range(samples_per_round):
            episode_run = run_online_episode(
                oracle,
                round_id=round_id,
                predictor=recorder,
                policy=policy,
                budget=budget,
                episode_seed=sample_index,
            )
            observations = episode_run.belief.observations

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
                round_number=int(episode_run.round_context.round_number or -1),
                sample_index=sample_index,
                policy_name=policy.name,
                regime_vector=round_regime_summary_vector(round_episode),
                observations=observations,
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
                    "episode_path": str(episode_path.relative_to(paths.root)),
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
