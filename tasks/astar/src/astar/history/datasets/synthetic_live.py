from __future__ import annotations

import gc
import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import LiveQueryObs
from astar.envs.synthetic import SyntheticActiveOracle
from astar.envs.historical import _cached_round_episode
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
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
    budget: int | None = Field(default=None, ge=0)
    query_count: int = Field(ge=0)
    episode_path: Path


class SyntheticEpisodeArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_index: int = Field(ge=0)
    policy_name: str
    budget: int | None = Field(default=None, ge=0)
    regime_vector: np.ndarray
    observations: tuple[LiveQueryObs, ...]
    target_sources: dict[int, str]
    target_paths: dict[int, Path]


def _load_existing_dataset_ref(
    *,
    dataset_name: str,
    dataset_dir: Path,
    summary_path: Path,
    index_path: Path,
    policy_name: str,
    budget: int | None,
    samples_per_round: int,
    round_ids: list[str],
) -> SyntheticEpisodeDatasetRef | None:
    if not summary_path.exists() or not index_path.exists():
        return None
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if summary.get("dataset_kind") != "synthetic_live":
        return None
    if summary.get("dataset_name") != dataset_name:
        return None
    if summary.get("policy_name") != policy_name:
        return None
    if summary.get("budget") != budget:
        return None
    if int(summary.get("samples_per_round", -1)) != samples_per_round:
        return None
    if summary.get("round_ids") != round_ids:
        return None
    return SyntheticEpisodeDatasetRef(
        dataset_name=dataset_name,
        dataset_kind="synthetic_live",
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=int(summary["episode_count"]),
        round_count=int(summary["round_count"]),
        policy_name=str(summary["policy_name"]),
        episode_count=int(summary["episode_count"]),
        total_query_count=int(summary["total_query_count"]),
        samples_per_round=int(summary["samples_per_round"]),
    )


def resolve_synthetic_episode_path(
    dataset_dir: Path,
    path_value: str | Path,
) -> Path:
    path = Path(str(path_value))
    if path.exists():
        return path
    if not path.is_absolute():
        candidate = dataset_dir / path
        if candidate.exists():
            return candidate
    parts = list(path.parts)
    if "episodes" in parts:
        candidate = dataset_dir.joinpath(*parts[parts.index("episodes") :])
        if candidate.exists():
            return candidate
    candidate = dataset_dir / "episodes" / path.name
    if candidate.exists():
        return candidate
    msg = (
        "synthetic episode artifact path is missing and could not be resolved from "
        f"dataset_dir={dataset_dir}: {path_value}"
    )
    raise FileNotFoundError(msg)


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
) -> tuple[str, Path]:
    analysis_path = paths.analysis_tensor_path(round_id, seed_index)
    if analysis_path.exists():
        return ("analysis_ground_truth", analysis_path)
    replay_summary_path = paths.replay_summary_path(round_id, seed_index)
    if replay_summary_path.exists():
        return ("replay_mean_terminal_probs", replay_summary_path)
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
    budget: int | None = None,
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
    policy = build_interactive_policy(policy_name)
    existing = _load_existing_dataset_ref(
        dataset_name=dataset_name,
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        policy_name=policy.name,
        budget=budget,
        samples_per_round=samples_per_round,
        round_ids=selected_round_ids,
    )
    if existing is not None:
        return existing

    rows: list[dict[str, str | int]] = []
    total_query_count = 0
    oracle = SyntheticActiveOracle(paths=paths)
    recorder = TranscriptRecorderPredictor()

    for round_id in selected_round_ids:
        round_episode = _cached_round_episode(str(paths.root), round_id)
        if round_episode.replay_run_count == 0:
            continue
        planned_budget = _plan_budget(policy, round_id, oracle)
        resolved_budget = planned_budget if budget is None else budget
        if any(
            not paths.analysis_tensor_path(round_id, seed_index).exists()
            and not paths.replay_summary_path(round_id, seed_index).exists()
            for seed_index in range(round_episode.metadata.seeds_count)
        ):
            materialize_round_episode(paths, round_id)

        for sample_index in range(samples_per_round):
            episode_run = run_online_episode(
                oracle,
                round_id=round_id,
                predictor=recorder,
                policy=policy,
                budget=resolved_budget,
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
                budget=resolved_budget,
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
                    "budget": resolved_budget,
                    "query_count": len(observations),
                    "episode_path": str(episode_path),
                },
            )
            total_query_count += len(observations)

        # Synthetic-live generation walks replay-backed rounds one at a time; dropping
        # the cached round episode here prevents all replay corpora from accumulating
        # in memory across the full dataset build.
        del round_episode
        _cached_round_episode.cache_clear()
        gc.collect()

    index_table = pl.DataFrame(rows)
    index_table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "synthetic_live",
        "policy_name": policy.name,
        "budget": budget,
        "episode_count": index_table.height,
        "samples_per_round": samples_per_round,
        "total_query_count": total_query_count,
        "round_count": len({row["round_id"] for row in rows}),
        "round_ids": selected_round_ids,
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
