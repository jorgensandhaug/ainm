from __future__ import annotations

import hashlib
import json
import os
import time
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.synthetic import SyntheticActiveOracle
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    SyntheticEpisodeArtifact,
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import round_regime_summary_vector
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.transcript import TranscriptRecorderPredictor
from astar.teacher.dynamics.terminal_teacher import (
    GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
    GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
    GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
    GBX_TERMINAL_REGIME_TEACHER_MODEL,
    GreyBoxTerminalTeacher,
    gbx_terminal_round_coefficients_path,
    gbx_terminal_scoped_checkpoint_path,
    load_round_terminal_coefficients,
    save_round_terminal_coefficients,
)
from astar.teacher.regime.base import RegimePosteriorState
from astar.workflows.online_episode import run_online_episode

MAX_QUERY_BUDGET = 50.0
MAX_VIEWPORT_AREA = 15.0 * 15.0
GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN = "gbx_transcript_regime_knn_terminal_mapknn_v1"
GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA = "gbx_transcript_regime_knn_terminal_mapknn_delta_v1"
GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPLLR = "gbx_transcript_regime_knn_terminal_mapllr_v1"
GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR = "gbx_transcript_regime_knn_terminal_mapprior_v1"
GBX_ROUNDBANK_TERMINAL_MAPKNN = "gbx_roundbank_terminal_mapknn_v1"
GBX_RIDGE_TERMINAL_MAPKNN = "gbx_ridge_terminal_mapknn_v1"

_MODEL_SPECS: dict[str, tuple[str, str, str, int, int]] = {
    "gbx_transcript_regime_knn_terminal_mapknn": (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN: (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    "gbx_transcript_regime_knn_terminal_mapknn_delta": (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA: (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    "gbx_transcript_regime_knn_terminal_mapllr": (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPLLR,
        GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
        "map_summary_local_linear",
        5,
        5,
    ),
    GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPLLR: (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPLLR,
        GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
        "map_summary_local_linear",
        5,
        5,
    ),
    "gbx_transcript_regime_knn_terminal_mapprior": (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR,
        GBX_TERMINAL_REGIME_TEACHER_MODEL,
        "regime_space_knn",
        3,
        5,
    ),
    GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR: (
        GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR,
        GBX_TERMINAL_REGIME_TEACHER_MODEL,
        "regime_space_knn",
        3,
        5,
    ),
    "gbx_roundbank_terminal_mapknn": (
        GBX_ROUNDBANK_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    GBX_ROUNDBANK_TERMINAL_MAPKNN: (
        GBX_ROUNDBANK_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    "gbx_ridge_terminal_mapknn": (
        GBX_RIDGE_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
    GBX_RIDGE_TERMINAL_MAPKNN: (
        GBX_RIDGE_TERMINAL_MAPKNN,
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "map_summary_knn",
        5,
        5,
    ),
}

_ROUNDBANK_MODEL_NAMES = {
    "gbx_roundbank_terminal_mapknn",
    GBX_ROUNDBANK_TERMINAL_MAPKNN,
}

_RIDGE_MODEL_NAMES = {
    "gbx_ridge_terminal_mapknn",
    GBX_RIDGE_TERMINAL_MAPKNN,
}

_DELTA_FEATURE_MODEL_NAMES = {
    "gbx_transcript_regime_knn_terminal_mapknn_delta",
    GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA,
}


def is_gbx_transcript_regime_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in _MODEL_SPECS


def is_gbx_transcript_regime_roundbank_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in _ROUNDBANK_MODEL_NAMES


def is_gbx_transcript_regime_ridge_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in _RIDGE_MODEL_NAMES


def resolve_gbx_transcript_regime_training_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> tuple[str, str, str, int, int]:
    normalized = model_name.strip().lower()
    if normalized not in _MODEL_SPECS:
        raise ValueError(f"unsupported gbx transcript regime model: {model_name}")
    checkpoint_model_name, terminal_checkpoint_model_name, map_posterior_mode, map_neighbor_count, default_k_neighbors = _MODEL_SPECS[
        normalized
    ]
    resolved_samples = 4 if samples_per_round is None else int(samples_per_round)
    if resolved_samples < 1:
        raise ValueError("samples_per_round must be >= 1")
    return (
        checkpoint_model_name,
        terminal_checkpoint_model_name,
        map_posterior_mode,
        map_neighbor_count,
        resolved_samples,
    )


def _round_ids_with_analyses_and_replays(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    analysis_round_ids = {
        item.name
        for item in paths.raw_dir.joinpath("analyses").glob("*")
        if item.is_dir() and any(item.glob("seed_index=*.json"))
    }
    replay_round_ids = {
        item.name
        for item in paths.raw_dir.joinpath("replays").glob("*")
        if item.is_dir()
    }
    available = sorted(analysis_round_ids & replay_round_ids)
    if round_ids is None:
        return available
    selected = [round_id for round_id in round_ids if round_id in available]
    if not selected:
        raise ValueError("gbx transcript regime model requires rounds with both analyses and replays")
    return selected


def resolve_gbx_transcript_regime_policy_names(policy_name: str) -> tuple[str, str]:
    normalized = policy_name.strip().lower()
    if normalized in {"coverage"}:
        return ("coverage", "coverage")
    if normalized in {"exploration", "exploration_v2"}:
        return ("exploration", "exploration_v2")
    if normalized in {"exploration_global", "exploration_global_v1"}:
        return ("exploration_global", "exploration_global_v1")
    if normalized in {"exploration_focus", "exploration_focus_v1"}:
        return ("exploration_focus", "exploration_focus_v1")
    adapter = build_interactive_policy(policy_name)
    return (normalized, adapter.name)


def _round_scope_token(round_ids: Sequence[str]) -> str:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def gbx_transcript_regime_scoped_checkpoint_path(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str],
    policy_name: str,
    samples_per_round: int,
) -> Path:
    scope_token = _round_scope_token(round_ids)
    normalized_policy = policy_name.strip().lower()
    return (
        paths.model_dir(
            f"{model_name}__policy={normalized_policy}__samples={samples_per_round}__rounds={scope_token}",
        )
        / "checkpoint.json"
    )


def _cached_synthetic_dataset_name(
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"gbx_transcript_regime__synthetic_live__policy={policy_name.strip().lower()}"
        f"__samples={samples_per_round}__rounds={_round_scope_token(round_ids)}"
    )


def _load_synthetic_dataset_ref(
    paths: WorkspacePaths,
    dataset_name: str,
    *,
    required_round_ids: Sequence[str] | None = None,
) -> Path:
    dataset_dir = paths.dataset_dir(dataset_name)
    index_path = dataset_dir / "index.parquet"
    summary_path = dataset_dir / "summary.json"
    if not index_path.exists() or not summary_path.exists():
        raise FileNotFoundError(dataset_name)
    index_table = pl.read_parquet(index_path, columns=["round_id", "episode_path"])
    if required_round_ids is not None:
        available_round_ids = set(index_table["round_id"].to_list())
        if not set(required_round_ids).issubset(available_round_ids):
            raise FileNotFoundError(
                f"{dataset_name} missing requested rounds: "
                f"{sorted(set(required_round_ids) - available_round_ids)!r}",
            )
    for path_value in index_table["episode_path"].to_list():
        resolve_synthetic_episode_path(index_path, str(path_value))
    return index_path


def _ensure_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> Path:
    dataset_name = _cached_synthetic_dataset_name(
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=round_ids,
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    lock_path = dataset_dir / ".build.lock"
    try:
        return _load_synthetic_dataset_ref(
            paths,
            dataset_name,
            required_round_ids=round_ids,
        )
    except FileNotFoundError:
        dataset_dir.mkdir(parents=True, exist_ok=True)
        lock_acquired = False
        lock_started_at = time.monotonic()
        while not lock_acquired:
            try:
                lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(lock_fd, f"{os.getpid()}\n".encode("utf-8"))
                os.close(lock_fd)
                lock_acquired = True
            except FileExistsError:
                try:
                    return _load_synthetic_dataset_ref(
                        paths,
                        dataset_name,
                        required_round_ids=round_ids,
                    )
                except FileNotFoundError:
                    if time.monotonic() - lock_started_at > 900.0:
                        raise TimeoutError(f"timed out waiting for synthetic dataset lock: {lock_path}")
                    time.sleep(0.5)
        try:
            try:
                return _load_synthetic_dataset_ref(
                    paths,
                    dataset_name,
                    required_round_ids=round_ids,
                )
            except FileNotFoundError:
                return _build_lightweight_synthetic_dataset(
                    paths,
                    policy_name=policy_name,
                    round_ids=list(round_ids),
                    samples_per_round=samples_per_round,
                    dataset_name=dataset_name,
                )
        finally:
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass


def _plan_budget(
    policy: object,
    round_id: str,
    oracle: SyntheticActiveOracle,
) -> int:
    round_context = oracle.get_round_context(round_id)
    plan = policy.policy.build_plan(round_context.to_round_detail())
    return sum(item.repeats for item in plan.items)


def _build_lightweight_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    round_ids: list[str],
    samples_per_round: int,
    dataset_name: str,
) -> Path:
    dataset_dir = paths.dataset_dir(dataset_name)
    episodes_dir = dataset_dir / "episodes"
    episodes_dir.mkdir(parents=True, exist_ok=True)
    index_path = dataset_dir / "index.parquet"
    summary_path = dataset_dir / "summary.json"

    oracle = SyntheticActiveOracle(paths=paths)
    policy = build_interactive_policy(policy_name)
    recorder = TranscriptRecorderPredictor()

    rows: list[dict[str, str | int]] = []
    total_query_count = 0
    for round_id in round_ids:
        round_episode = build_round_episode(paths, round_id)
        if round_episode.replay_run_count == 0:
            continue
        budget = _plan_budget(policy, round_id, oracle)
        regime_vector = round_regime_summary_vector(round_episode)
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
            artifact = SyntheticEpisodeArtifact(
                round_id=round_id,
                round_number=int(episode_run.round_context.round_number or -1),
                sample_index=sample_index,
                policy_name=policy.name,
                regime_vector=regime_vector,
                observations=observations,
                target_sources={},
                target_paths={},
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
                    "episode_path": str(episode_path.relative_to(dataset_dir)),
                },
            )
            total_query_count += len(observations)

    index_table = pl.DataFrame(rows)
    index_table.write_parquet(index_path)
    summary = {
        "dataset_name": dataset_name,
        "dataset_kind": "synthetic_live_gbx_transcript_regime",
        "policy_name": policy.name,
        "episode_count": index_table.height,
        "samples_per_round": samples_per_round,
        "total_query_count": total_query_count,
        "round_count": len({row["round_id"] for row in rows}),
        "index_path": str(index_path),
    }
    summary_path.write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    return index_path


def _load_or_fit_terminal_teacher(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str],
    terminal_checkpoint_model_name: str,
    serving_model_name: str,
    map_posterior_mode: str,
    map_neighbor_count: int,
) -> GreyBoxTerminalTeacher:
    checkpoint_path = gbx_terminal_scoped_checkpoint_path(
        paths,
        round_ids=round_ids,
        model_name=terminal_checkpoint_model_name,
    )
    if checkpoint_path.exists():
        teacher = GreyBoxTerminalTeacher.load_checkpoint(checkpoint_path)
    else:
        replay_episodes = [
            build_round_episode(paths, round_id)
            for round_id in round_ids
        ]
        replay_episodes = [
            episode
            for episode in replay_episodes
            if any(seed.terminal_truth is not None for seed in episode.seeds)
        ]
        if not replay_episodes:
            raise ValueError("gbx transcript regime model requires terminal-truth replay episodes")
        coefficient_rows = []
        for episode in replay_episodes:
            coefficient_path = gbx_terminal_round_coefficients_path(
                paths,
                round_id=episode.metadata.round_id,
                model_name=terminal_checkpoint_model_name,
            )
            if coefficient_path.exists():
                coefficient_rows.append(load_round_terminal_coefficients(coefficient_path))
                continue
            row = GreyBoxTerminalTeacher(name=terminal_checkpoint_model_name)._fit_round_coefficients(
                episode,
                ridge_alpha=1.0,
            )
            save_round_terminal_coefficients(coefficient_path, row)
            coefficient_rows.append(row)
        teacher = GreyBoxTerminalTeacher(name=terminal_checkpoint_model_name).fit(
            replay_episodes,
            coefficient_rows=coefficient_rows,
        )
        teacher.save_checkpoint(checkpoint_path)
    return teacher.model_copy(
        update={
            "name": serving_model_name,
            "map_posterior_mode": map_posterior_mode,
            "map_neighbor_count": map_neighbor_count,
        },
    )


def _safe_mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(np.mean(np.asarray(values, dtype=np.float64)))


def _safe_fraction(numerator: float, denominator: float) -> float:
    if denominator <= 0.0:
        return 0.0
    return float(numerator) / float(denominator)


def _transcript_feature_variant(model_name: str) -> str:
    return "delta" if model_name.strip().lower() in _DELTA_FEATURE_MODEL_NAMES else "base"


def _seed_summary_feature_names(seed_index: int, *, feature_variant: str = "base") -> list[str]:
    prefix = f"seed{seed_index}"
    names = [
        f"{prefix}_query_frac",
        f"{prefix}_repeat_frac",
        f"{prefix}_coverage_frac",
        f"{prefix}_mean_viewport_area_frac",
        *[f"{prefix}_class_freq_{class_index}" for class_index in range(6)],
        f"{prefix}_class_entropy",
        f"{prefix}_settlement_density",
        f"{prefix}_alive_frac",
        f"{prefix}_port_frac",
        f"{prefix}_owner_diversity",
        f"{prefix}_mean_population",
        f"{prefix}_mean_food",
        f"{prefix}_mean_wealth",
        f"{prefix}_mean_defense",
    ]
    if feature_variant == "delta":
        names.extend(
            [
                f"{prefix}_mean_query_center_x",
                f"{prefix}_mean_query_center_y",
                f"{prefix}_std_query_center_x",
                f"{prefix}_std_query_center_y",
                f"{prefix}_changed_frac",
                *[f"{prefix}_initial_query_class_freq_{class_index}" for class_index in range(6)],
                *[f"{prefix}_delta_query_class_freq_{class_index}" for class_index in range(6)],
            ],
        )
    return names


def _transcript_feature_names(seed_count: int, regime_dim: int, *, feature_variant: str = "base") -> list[str]:
    names: list[str] = []
    for seed_index in range(seed_count):
        names.extend(_seed_summary_feature_names(seed_index, feature_variant=feature_variant))
    names.extend([f"map_prior_regime_{index}" for index in range(regime_dim)])
    return names


def _build_seed_summary_vector(
    *,
    round_detail: RoundDetail,
    seed_index: int,
    observations: Sequence[LiveQueryObs],
    evidence: RoundEvidenceBundle,
    feature_variant: str = "base",
) -> np.ndarray:
    seed_evidence = evidence.per_seed[seed_index]
    viewport_areas = [float(obs.viewport.w * obs.viewport.h) for obs in observations]
    all_settlements = [settlement for obs in observations for settlement in obs.settlements]
    owner_ids = [settlement.owner_id for settlement in all_settlements if settlement.owner_id is not None]
    observed_cells = float(sum(viewport_areas))
    settlement_count = float(len(all_settlements))
    class_entropy = 0.0
    positive_frequencies = seed_evidence.observed_class_frequencies[
        seed_evidence.observed_class_frequencies > 0.0
    ]
    if positive_frequencies.size > 0:
        entropy = -np.sum(positive_frequencies * np.log(positive_frequencies))
        class_entropy = float(entropy / np.log(6.0))
    components = [
        float(seed_evidence.query_count) / MAX_QUERY_BUDGET,
        _safe_fraction(seed_evidence.repeated_window_groups, max(seed_evidence.query_count, 1)),
        float(np.mean(seed_evidence.coverage_counts > 0)),
        _safe_mean(viewport_areas) / MAX_VIEWPORT_AREA,
        *seed_evidence.observed_class_frequencies.astype(np.float64).tolist(),
        class_entropy,
        _safe_fraction(settlement_count, observed_cells),
        _safe_fraction(sum(1 for item in all_settlements if item.alive), settlement_count),
        _safe_fraction(sum(1 for item in all_settlements if item.has_port), settlement_count),
        _safe_fraction(len(set(owner_ids)), settlement_count),
        0.0 if seed_evidence.mean_population is None else float(seed_evidence.mean_population),
        0.0 if seed_evidence.mean_food is None else float(seed_evidence.mean_food),
        0.0 if seed_evidence.mean_wealth is None else float(seed_evidence.mean_wealth),
        0.0 if seed_evidence.mean_defense is None else float(seed_evidence.mean_defense),
    ]
    if feature_variant == "delta":
        initial_grid = collapse_internal_grid(
            np.asarray(round_detail.initial_states[seed_index].grid, dtype=np.int64),
        )
        initial_counts = np.zeros(6, dtype=np.float64)
        changed_count = 0.0
        center_xs: list[float] = []
        center_ys: list[float] = []
        for observation in observations:
            collapsed_observed = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
            viewport = observation.viewport
            initial_patch = initial_grid[
                viewport.y:(viewport.y + viewport.h),
                viewport.x:(viewport.x + viewport.w),
            ]
            initial_counts += np.bincount(initial_patch.reshape(-1), minlength=6).astype(np.float64)
            changed_count += float(np.sum(initial_patch != collapsed_observed))
            center_xs.append((float(viewport.x) + (0.5 * float(viewport.w))) / float(round_detail.map_width))
            center_ys.append((float(viewport.y) + (0.5 * float(viewport.h))) / float(round_detail.map_height))
        initial_frequencies = (
            initial_counts / float(np.sum(initial_counts))
            if float(np.sum(initial_counts)) > 0.0
            else np.zeros(6, dtype=np.float64)
        )
        delta_frequencies = seed_evidence.observed_class_frequencies.astype(np.float64) - initial_frequencies
        components.extend(
            [
                _safe_mean(center_xs),
                _safe_mean(center_ys),
                float(np.std(np.asarray(center_xs, dtype=np.float64))) if center_xs else 0.0,
                float(np.std(np.asarray(center_ys, dtype=np.float64))) if center_ys else 0.0,
                _safe_fraction(changed_count, float(np.sum(initial_counts))),
                *initial_frequencies.tolist(),
                *delta_frequencies.tolist(),
            ],
        )
    return np.asarray(components, dtype=np.float64)


def _build_transcript_summary_vector(
    round_detail: RoundDetail,
    observations: Sequence[LiveQueryObs],
    *,
    feature_variant: str = "base",
) -> np.ndarray:
    grouped: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in range(round_detail.seeds_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    evidence = build_round_evidence_from_observations(round_detail, tuple(observations))
    components: list[np.ndarray] = []
    for seed_index in range(round_detail.seeds_count):
        components.append(
            _build_seed_summary_vector(
                round_detail=round_detail,
                seed_index=seed_index,
                observations=grouped.get(seed_index, []),
                evidence=evidence,
                feature_variant=feature_variant,
            ),
        )
    return np.concatenate(components, axis=0)


def _clip_regime(regime: np.ndarray) -> np.ndarray:
    return np.clip(np.asarray(regime, dtype=np.float64), -0.25, 1.25)


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate([np.ones((inputs.shape[0], 1), dtype=np.float64), inputs], axis=1)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    solution = np.linalg.pinv(design.T @ design + ridge_alpha * penalty) @ (design.T @ targets)
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


class GreyBoxTranscriptRegimeCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    policy_name: str
    samples_per_round: int = Field(ge=1)
    checkpoint_npz_path: str
    terminal_checkpoint_path: str
    terminal_model_name: str
    k_neighbors: int = Field(ge=1)
    training_round_ids: list[str]
    feature_names: list[str]
    sample_count: int = Field(ge=0)
    feature_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)


class GreyBoxTranscriptRegimeKNNPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN
    dataset_name: str
    policy_name: str
    samples_per_round: int = Field(ge=1)
    training_round_ids: tuple[str, ...] = ()
    terminal_checkpoint_path: str
    feature_names: tuple[str, ...] = ()
    standardized_feature_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    residual_regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    terminal_teacher: GreyBoxTerminalTeacher

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        model_name: str = GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN,
    ) -> GreyBoxTranscriptRegimeKNNPredictor:
        (
            checkpoint_model_name,
            terminal_checkpoint_model_name,
            map_posterior_mode,
            map_neighbor_count,
            resolved_samples_per_round,
        ) = resolve_gbx_transcript_regime_training_spec(
            model_name,
            samples_per_round=samples_per_round,
        )
        dataset_policy_name, resolved_policy_name = resolve_gbx_transcript_regime_policy_names(policy_name)
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=dataset_policy_name,
            samples_per_round=resolved_samples_per_round,
            round_ids=selected_round_ids,
        )
        terminal_checkpoint_path = gbx_terminal_scoped_checkpoint_path(
            paths,
            round_ids=selected_round_ids,
            model_name=terminal_checkpoint_model_name,
        )
        terminal_teacher = _load_or_fit_terminal_teacher(
            paths,
            round_ids=selected_round_ids,
            terminal_checkpoint_model_name=terminal_checkpoint_model_name,
            serving_model_name=(
                GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL
                if checkpoint_model_name == GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR
                else terminal_checkpoint_model_name
            ),
            map_posterior_mode=map_posterior_mode,
            map_neighbor_count=map_neighbor_count,
        )

        index_table = pl.read_parquet(index_path, columns=["round_id", "episode_path"])
        round_detail_cache: dict[str, RoundDetail] = {}
        map_prior_cache: dict[str, np.ndarray] = {}
        feature_vectors: list[np.ndarray] = []
        residual_regimes: list[np.ndarray] = []
        feature_variant = _transcript_feature_variant(checkpoint_model_name)
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            if round_id not in round_detail_cache:
                round_detail = read_round_record(paths, round_id).round
                round_detail_cache[round_id] = round_detail
                round_context = build_round_context_from_detail(round_detail)
                map_prior_cache[round_id] = terminal_teacher.map_regime_prior(round_context.seeds)
            round_detail = round_detail_cache[round_id]
            artifact_path = resolve_synthetic_episode_path(index_path, str(row["episode_path"]))
            artifact = load_synthetic_episode(artifact_path)
            transcript_summary = _build_transcript_summary_vector(
                round_detail,
                artifact.observations,
                feature_variant=feature_variant,
            )
            map_prior = np.asarray(map_prior_cache[round_id], dtype=np.float64)
            feature_vectors.append(np.concatenate([transcript_summary, map_prior], axis=0))
            residual_regimes.append(np.asarray(artifact.regime_vector, dtype=np.float64) - map_prior)
        if not feature_vectors:
            raise ValueError("gbx transcript regime model did not yield any synthetic episodes")
        feature_matrix = np.stack(feature_vectors, axis=0)
        residual_matrix = np.stack(residual_regimes, axis=0)
        feature_mean = np.mean(feature_matrix, axis=0)
        feature_scale = np.std(feature_matrix, axis=0)
        feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
        standardized_feature_bank = (feature_matrix - feature_mean[None, :]) / feature_scale[None, :]
        regime_dim = int(residual_matrix.shape[1])
        feature_names = _transcript_feature_names(
            seed_count=int(round_detail_cache[selected_round_ids[0]].seeds_count),
            regime_dim=regime_dim,
            feature_variant=feature_variant,
        )
        return cls(
            name=checkpoint_model_name,
            dataset_name=index_path.parent.name,
            policy_name=resolved_policy_name,
            samples_per_round=resolved_samples_per_round,
            training_round_ids=tuple(selected_round_ids),
            terminal_checkpoint_path=str(terminal_checkpoint_path),
            feature_names=tuple(feature_names),
            standardized_feature_bank=standardized_feature_bank,
            residual_regime_bank=residual_matrix,
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            k_neighbors=_MODEL_SPECS[checkpoint_model_name][4],
            terminal_teacher=terminal_teacher,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        terminal_checkpoint_path: Path,
    ) -> GreyBoxTranscriptRegimeCheckpoint:
        return GreyBoxTranscriptRegimeCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            policy_name=self.policy_name,
            samples_per_round=self.samples_per_round,
            checkpoint_npz_path=str(checkpoint_npz_path),
            terminal_checkpoint_path=self.terminal_checkpoint_path,
            terminal_model_name=self.terminal_teacher.name,
            k_neighbors=self.k_neighbors,
            training_round_ids=list(self.training_round_ids),
            feature_names=list(self.feature_names),
            sample_count=int(self.standardized_feature_bank.shape[0]),
            feature_dim=int(self.standardized_feature_bank.shape[1]),
            regime_dim=int(self.residual_regime_bank.shape[1]),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        npz_path = path.parent / "bank.npz"
        np.savez_compressed(
            npz_path,
            standardized_feature_bank=self.standardized_feature_bank,
            residual_regime_bank=self.residual_regime_bank,
            feature_mean=self.feature_mean,
            feature_scale=self.feature_scale,
        )
        checkpoint = self.checkpoint(npz_path, Path(self.terminal_checkpoint_path))
        path.write_text(json.dumps(to_jsonable(checkpoint), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> GreyBoxTranscriptRegimeKNNPredictor:
        checkpoint = GreyBoxTranscriptRegimeCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.checkpoint_npz_path)
        terminal_teacher = GreyBoxTerminalTeacher.load_checkpoint(Path(checkpoint.terminal_checkpoint_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            policy_name=checkpoint.policy_name,
            samples_per_round=checkpoint.samples_per_round,
            training_round_ids=tuple(checkpoint.training_round_ids),
            terminal_checkpoint_path=checkpoint.terminal_checkpoint_path,
            feature_names=tuple(checkpoint.feature_names),
            standardized_feature_bank=np.asarray(arrays["standardized_feature_bank"], dtype=np.float64),
            residual_regime_bank=np.asarray(arrays["residual_regime_bank"], dtype=np.float64),
            feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
            feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
            k_neighbors=checkpoint.k_neighbors,
            terminal_teacher=terminal_teacher,
        )

    def _feature_vector_from_context(self, context: LiveInferenceContext, map_prior: np.ndarray) -> np.ndarray:
        round_detail = context.round_context.to_round_detail()
        transcript_summary = _build_transcript_summary_vector(
            round_detail,
            context.observations,
            feature_variant=_transcript_feature_variant(self.name),
        )
        return np.concatenate([transcript_summary, np.asarray(map_prior, dtype=np.float64)], axis=0)

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        current_map_prior = self.terminal_teacher.map_regime_prior(context.round_context.seeds)
        feature_vector = self._feature_vector_from_context(context, current_map_prior)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.standardized_feature_bank - standardized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        residual_mean = np.tensordot(weights, self.residual_regime_bank[order], axes=(0, 0))
        posterior_mean = _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + residual_mean)
        particles = tuple(
            _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + self.residual_regime_bank[index])
            for index in order
        )
        return RegimePosteriorState(
            mean=posterior_mean,
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.terminal_teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )

    def build_prediction_bundle_from_context(self, context: LiveInferenceContext) -> PredictionBundle:
        posterior = self.infer_regime(context)
        predictions_by_seed = {
            seed.seed_index: self.terminal_teacher.posterior_predictive(seed, posterior)
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: object,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        context = round_context_to_live_inference_context(build_round_context_from_detail(round_detail), ())
        return self.build_prediction_bundle_from_context(context)


class GreyBoxTranscriptRegimeRoundBankCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    policy_name: str
    samples_per_round: int = Field(ge=1)
    checkpoint_npz_path: str
    terminal_checkpoint_path: str
    terminal_model_name: str
    training_round_ids: list[str]
    round_ids_by_bank: list[str]
    feature_names: list[str]
    sample_count: int = Field(ge=0)
    round_count: int = Field(ge=1)
    feature_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    posterior_temperature: float = Field(gt=0.0)
    feature_scale_floor: float = Field(gt=0.0)


class GreyBoxTranscriptRegimeRoundBankPredictor(GreyBoxTranscriptRegimeKNNPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_ROUNDBANK_TERMINAL_MAPKNN
    round_ids_by_bank: tuple[str, ...] = ()
    round_feature_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    round_feature_scale_bank: np.ndarray = Field(default_factory=lambda: np.ones((0, 1), dtype=np.float64))
    round_residual_regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_temperature: float = Field(default=1.0, gt=0.0)
    feature_scale_floor: float = Field(default=0.5, gt=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        model_name: str = GBX_ROUNDBANK_TERMINAL_MAPKNN,
    ) -> GreyBoxTranscriptRegimeRoundBankPredictor:
        base_predictor = GreyBoxTranscriptRegimeKNNPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            model_name=model_name,
        )
        scale_floor = 0.5
        index_path = paths.dataset_dir(base_predictor.dataset_name) / "index.parquet"
        index_table = pl.read_parquet(index_path, columns=["round_id"])
        round_labels = [str(item) for item in index_table["round_id"].to_list()]
        standardized_feature_bank = np.asarray(base_predictor.standardized_feature_bank, dtype=np.float64)
        residual_regime_bank = np.asarray(base_predictor.residual_regime_bank, dtype=np.float64)
        round_feature_bank: list[np.ndarray] = []
        round_variance_bank: list[np.ndarray] = []
        round_residual_bank: list[np.ndarray] = []
        for round_id in base_predictor.training_round_ids:
            mask = np.asarray([label == round_id for label in round_labels], dtype=bool)
            if not np.any(mask):
                raise ValueError(f"roundbank training bank missing round_id={round_id}")
            round_features = standardized_feature_bank[mask]
            round_feature_bank.append(np.mean(round_features, axis=0))
            round_variance_bank.append(np.var(round_features, axis=0))
            round_residual_bank.append(np.mean(residual_regime_bank[mask], axis=0))
        variance_bank = np.stack(round_variance_bank, axis=0)
        pooled_variance = np.mean(variance_bank, axis=0)
        shrunk_variance = 0.5 * variance_bank + 0.5 * pooled_variance[None, :]
        round_feature_scale_bank = np.sqrt(np.maximum(shrunk_variance, scale_floor**2))
        return cls(
            name=base_predictor.name,
            dataset_name=base_predictor.dataset_name,
            policy_name=base_predictor.policy_name,
            samples_per_round=base_predictor.samples_per_round,
            training_round_ids=base_predictor.training_round_ids,
            terminal_checkpoint_path=base_predictor.terminal_checkpoint_path,
            feature_names=base_predictor.feature_names,
            standardized_feature_bank=standardized_feature_bank,
            residual_regime_bank=residual_regime_bank,
            feature_mean=np.asarray(base_predictor.feature_mean, dtype=np.float64),
            feature_scale=np.asarray(base_predictor.feature_scale, dtype=np.float64),
            k_neighbors=base_predictor.k_neighbors,
            terminal_teacher=base_predictor.terminal_teacher,
            round_ids_by_bank=tuple(base_predictor.training_round_ids),
            round_feature_bank=np.stack(round_feature_bank, axis=0),
            round_feature_scale_bank=np.asarray(round_feature_scale_bank, dtype=np.float64),
            round_residual_regime_bank=np.stack(round_residual_bank, axis=0),
            posterior_temperature=1.0,
            feature_scale_floor=scale_floor,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        terminal_checkpoint_path: Path,
    ) -> GreyBoxTranscriptRegimeRoundBankCheckpoint:
        return GreyBoxTranscriptRegimeRoundBankCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            policy_name=self.policy_name,
            samples_per_round=self.samples_per_round,
            checkpoint_npz_path=str(checkpoint_npz_path),
            terminal_checkpoint_path=str(terminal_checkpoint_path),
            terminal_model_name=self.terminal_teacher.name,
            training_round_ids=list(self.training_round_ids),
            round_ids_by_bank=list(self.round_ids_by_bank),
            feature_names=list(self.feature_names),
            sample_count=int(self.standardized_feature_bank.shape[0]),
            round_count=int(self.round_feature_bank.shape[0]),
            feature_dim=int(self.round_feature_bank.shape[1]),
            regime_dim=int(self.round_residual_regime_bank.shape[1]),
            posterior_temperature=self.posterior_temperature,
            feature_scale_floor=self.feature_scale_floor,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        npz_path = path.parent / "bank.npz"
        np.savez_compressed(
            npz_path,
            standardized_feature_bank=self.standardized_feature_bank,
            residual_regime_bank=self.residual_regime_bank,
            feature_mean=self.feature_mean,
            feature_scale=self.feature_scale,
            round_feature_bank=self.round_feature_bank,
            round_feature_scale_bank=self.round_feature_scale_bank,
            round_residual_regime_bank=self.round_residual_regime_bank,
        )
        checkpoint = self.checkpoint(npz_path, Path(self.terminal_checkpoint_path))
        path.write_text(json.dumps(to_jsonable(checkpoint), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> GreyBoxTranscriptRegimeRoundBankPredictor:
        checkpoint = GreyBoxTranscriptRegimeRoundBankCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.checkpoint_npz_path)
        terminal_teacher = GreyBoxTerminalTeacher.load_checkpoint(Path(checkpoint.terminal_checkpoint_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            policy_name=checkpoint.policy_name,
            samples_per_round=checkpoint.samples_per_round,
            training_round_ids=tuple(checkpoint.training_round_ids),
            terminal_checkpoint_path=checkpoint.terminal_checkpoint_path,
            feature_names=tuple(checkpoint.feature_names),
            standardized_feature_bank=np.asarray(arrays["standardized_feature_bank"], dtype=np.float64),
            residual_regime_bank=np.asarray(arrays["residual_regime_bank"], dtype=np.float64),
            feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
            feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
            k_neighbors=5,
            terminal_teacher=terminal_teacher,
            round_ids_by_bank=tuple(checkpoint.round_ids_by_bank),
            round_feature_bank=np.asarray(arrays["round_feature_bank"], dtype=np.float64),
            round_feature_scale_bank=np.asarray(arrays["round_feature_scale_bank"], dtype=np.float64),
            round_residual_regime_bank=np.asarray(arrays["round_residual_regime_bank"], dtype=np.float64),
            posterior_temperature=checkpoint.posterior_temperature,
            feature_scale_floor=checkpoint.feature_scale_floor,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        current_map_prior = self.terminal_teacher.map_regime_prior(context.round_context.seeds)
        feature_vector = self._feature_vector_from_context(context, current_map_prior)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        scaled_delta = (self.round_feature_bank - standardized[None, :]) / np.clip(
            self.round_feature_scale_bank,
            self.feature_scale_floor,
            None,
        )
        distances = np.sqrt(np.mean(np.square(scaled_delta), axis=1))
        shifted = distances - float(np.min(distances))
        weights = np.exp(-shifted / self.posterior_temperature)
        weights = weights / np.sum(weights)
        order = np.argsort(distances)
        ordered_weights = np.asarray(weights[order], dtype=np.float64)
        ordered_residuals = np.asarray(self.round_residual_regime_bank[order], dtype=np.float64)
        residual_mean = np.tensordot(ordered_weights, ordered_residuals, axes=(0, 0))
        posterior_mean = _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + residual_mean)
        particles = tuple(
            _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + residual)
            for residual in ordered_residuals
        )
        return RegimePosteriorState(
            mean=posterior_mean,
            particles=particles,
            weights=ordered_weights,
        )


class GreyBoxTranscriptRegimeRidgeCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    policy_name: str
    samples_per_round: int = Field(ge=1)
    checkpoint_npz_path: str
    terminal_checkpoint_path: str
    terminal_model_name: str
    training_round_ids: list[str]
    feature_names: list[str]
    sample_count: int = Field(ge=0)
    feature_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)
    ridge_alpha: float = Field(gt=0.0)
    particle_neighbor_count: int = Field(ge=1)


class GreyBoxTranscriptRegimeRidgePredictor(GreyBoxTranscriptRegimeKNNPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = GBX_RIDGE_TERMINAL_MAPKNN
    residual_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    residual_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    round_residual_regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    ridge_alpha: float = Field(default=4.0, gt=0.0)
    particle_neighbor_count: int = Field(default=3, ge=1)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        model_name: str = GBX_RIDGE_TERMINAL_MAPKNN,
    ) -> GreyBoxTranscriptRegimeRidgePredictor:
        base_predictor = GreyBoxTranscriptRegimeKNNPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            model_name=model_name,
        )
        ridge_alpha = 4.0
        residual_intercept, residual_weights = _fit_linear_map(
            np.asarray(base_predictor.standardized_feature_bank, dtype=np.float64),
            np.asarray(base_predictor.residual_regime_bank, dtype=np.float64),
            ridge_alpha=ridge_alpha,
        )
        index_path = paths.dataset_dir(base_predictor.dataset_name) / "index.parquet"
        index_table = pl.read_parquet(index_path, columns=["round_id"])
        round_labels = [str(item) for item in index_table["round_id"].to_list()]
        round_residual_bank: list[np.ndarray] = []
        for round_id in base_predictor.training_round_ids:
            mask = np.asarray([label == round_id for label in round_labels], dtype=bool)
            if not np.any(mask):
                raise ValueError(f"ridge training bank missing round_id={round_id}")
            round_residual_bank.append(
                np.mean(np.asarray(base_predictor.residual_regime_bank, dtype=np.float64)[mask], axis=0),
            )
        return cls(
            name=base_predictor.name,
            dataset_name=base_predictor.dataset_name,
            policy_name=base_predictor.policy_name,
            samples_per_round=base_predictor.samples_per_round,
            training_round_ids=base_predictor.training_round_ids,
            terminal_checkpoint_path=base_predictor.terminal_checkpoint_path,
            feature_names=base_predictor.feature_names,
            standardized_feature_bank=np.asarray(base_predictor.standardized_feature_bank, dtype=np.float64),
            residual_regime_bank=np.asarray(base_predictor.residual_regime_bank, dtype=np.float64),
            feature_mean=np.asarray(base_predictor.feature_mean, dtype=np.float64),
            feature_scale=np.asarray(base_predictor.feature_scale, dtype=np.float64),
            k_neighbors=base_predictor.k_neighbors,
            terminal_teacher=base_predictor.terminal_teacher,
            residual_intercept=residual_intercept,
            residual_weights=residual_weights,
            round_residual_regime_bank=np.stack(round_residual_bank, axis=0),
            ridge_alpha=ridge_alpha,
            particle_neighbor_count=3,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        terminal_checkpoint_path: Path,
    ) -> GreyBoxTranscriptRegimeRidgeCheckpoint:
        return GreyBoxTranscriptRegimeRidgeCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            policy_name=self.policy_name,
            samples_per_round=self.samples_per_round,
            checkpoint_npz_path=str(checkpoint_npz_path),
            terminal_checkpoint_path=str(terminal_checkpoint_path),
            terminal_model_name=self.terminal_teacher.name,
            training_round_ids=list(self.training_round_ids),
            feature_names=list(self.feature_names),
            sample_count=int(self.standardized_feature_bank.shape[0]),
            feature_dim=int(self.standardized_feature_bank.shape[1]),
            regime_dim=int(self.residual_intercept.shape[0]),
            ridge_alpha=self.ridge_alpha,
            particle_neighbor_count=self.particle_neighbor_count,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        npz_path = path.parent / "bank.npz"
        np.savez_compressed(
            npz_path,
            standardized_feature_bank=self.standardized_feature_bank,
            residual_regime_bank=self.residual_regime_bank,
            feature_mean=self.feature_mean,
            feature_scale=self.feature_scale,
            residual_intercept=self.residual_intercept,
            residual_weights=self.residual_weights,
            round_residual_regime_bank=self.round_residual_regime_bank,
        )
        checkpoint = self.checkpoint(npz_path, Path(self.terminal_checkpoint_path))
        path.write_text(json.dumps(to_jsonable(checkpoint), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> GreyBoxTranscriptRegimeRidgePredictor:
        checkpoint = GreyBoxTranscriptRegimeRidgeCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.checkpoint_npz_path)
        terminal_teacher = GreyBoxTerminalTeacher.load_checkpoint(Path(checkpoint.terminal_checkpoint_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            policy_name=checkpoint.policy_name,
            samples_per_round=checkpoint.samples_per_round,
            training_round_ids=tuple(checkpoint.training_round_ids),
            terminal_checkpoint_path=checkpoint.terminal_checkpoint_path,
            feature_names=tuple(checkpoint.feature_names),
            standardized_feature_bank=np.asarray(arrays["standardized_feature_bank"], dtype=np.float64),
            residual_regime_bank=np.asarray(arrays["residual_regime_bank"], dtype=np.float64),
            feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
            feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
            k_neighbors=5,
            terminal_teacher=terminal_teacher,
            residual_intercept=np.asarray(arrays["residual_intercept"], dtype=np.float64),
            residual_weights=np.asarray(arrays["residual_weights"], dtype=np.float64),
            round_residual_regime_bank=np.asarray(arrays["round_residual_regime_bank"], dtype=np.float64),
            ridge_alpha=checkpoint.ridge_alpha,
            particle_neighbor_count=checkpoint.particle_neighbor_count,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        current_map_prior = self.terminal_teacher.map_regime_prior(context.round_context.seeds)
        feature_vector = self._feature_vector_from_context(context, current_map_prior)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        residual_mean = np.asarray(
            self.residual_intercept + standardized @ self.residual_weights,
            dtype=np.float64,
        )
        posterior_mean = _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + residual_mean)
        distances = np.linalg.norm(self.round_residual_regime_bank - residual_mean[None, :], axis=1)
        order = np.argsort(distances)[: min(self.particle_neighbor_count, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        particles = tuple(
            _clip_regime(np.asarray(current_map_prior, dtype=np.float64) + self.round_residual_regime_bank[index])
            for index in order
        )
        return RegimePosteriorState(
            mean=posterior_mean,
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )


__all__ = [
    "GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN",
    "GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPKNN_DELTA",
    "GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPLLR",
    "GBX_TRANSCRIPT_REGIME_KNN_TERMINAL_MAPPRIOR",
    "GBX_ROUNDBANK_TERMINAL_MAPKNN",
    "GBX_RIDGE_TERMINAL_MAPKNN",
    "GreyBoxTranscriptRegimeCheckpoint",
    "GreyBoxTranscriptRegimeKNNPredictor",
    "GreyBoxTranscriptRegimeRoundBankCheckpoint",
    "GreyBoxTranscriptRegimeRoundBankPredictor",
    "GreyBoxTranscriptRegimeRidgeCheckpoint",
    "GreyBoxTranscriptRegimeRidgePredictor",
    "gbx_transcript_regime_scoped_checkpoint_path",
    "is_gbx_transcript_regime_model_name",
    "is_gbx_transcript_regime_roundbank_model_name",
    "is_gbx_transcript_regime_ridge_model_name",
    "resolve_gbx_transcript_regime_policy_names",
    "resolve_gbx_transcript_regime_training_spec",
]
