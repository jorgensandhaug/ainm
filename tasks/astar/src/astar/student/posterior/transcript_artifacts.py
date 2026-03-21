from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from astar.infra.api.dto import RoundDetail, StoredAnalysisRecord, StoredRoundRecord
from astar.infra.artifacts.store import load_named_arrays
from astar.student.posterior.transcript_set import build_transcript_summary_vector
from astar.student.predictor.base import LiveInferenceContext

if TYPE_CHECKING:
    from astar.history.datasets.synthetic_live import SyntheticEpisodeArtifact

_DEFAULT_ROUND_DETAIL_RELPATH_PREFIX = Path("data") / "raw" / "rounds"


def _load_synthetic_episode(path: Path) -> SyntheticEpisodeArtifact:
    from astar.history.datasets.synthetic_live import load_synthetic_episode

    return load_synthetic_episode(path)


def resolve_round_detail_path(
    episode_path: Path,
    round_id: str,
    configured_path: Path | None,
) -> Path:
    resolved_episode_path = episode_path.resolve()
    if configured_path is not None:
        if configured_path.is_absolute():
            if configured_path.exists():
                return configured_path
        else:
            for parent in resolved_episode_path.parents:
                candidate = parent / configured_path
                if candidate.exists():
                    return candidate
    for parent in resolved_episode_path.parents:
        candidate = parent / _DEFAULT_ROUND_DETAIL_RELPATH_PREFIX / f"{round_id}.json"
        if candidate.exists():
            return candidate
    msg = f"could not resolve round detail path for synthetic episode {episode_path}"
    raise FileNotFoundError(msg)


def load_round_detail(path: Path) -> RoundDetail:
    stored = StoredRoundRecord.model_validate_json(path.read_text(encoding="utf-8"))
    return stored.round


def round_detail_from_artifact(path: Path) -> RoundDetail:
    artifact = _load_synthetic_episode(path)
    round_path = resolve_round_detail_path(path, artifact.round_id, artifact.round_detail_path)
    return load_round_detail(round_path)


def summary_vector_from_artifact(path: Path) -> tuple[tuple[str, ...], np.ndarray, np.ndarray]:
    artifact = _load_synthetic_episode(path)
    round_path = resolve_round_detail_path(path, artifact.round_id, artifact.round_detail_path)
    round_detail = load_round_detail(round_path)
    feature_names, feature_vector = build_transcript_summary_vector(
        round_detail,
        artifact.observations,
    )
    return feature_names, feature_vector, artifact.regime_vector


def summary_vector_from_context(context: LiveInferenceContext) -> np.ndarray:
    _, feature_vector = build_transcript_summary_vector(
        context.round_context.to_round_detail(),
        context.observations,
        geometry_bundle=context.geometry_bundle,
    )
    return feature_vector


def terminal_targets_from_artifact(path: Path) -> dict[int, np.ndarray]:
    artifact = _load_synthetic_episode(path)
    targets: dict[int, np.ndarray] = {}
    for seed_index, target_path in artifact.target_paths.items():
        resolved_target_path = Path(target_path)
        if not resolved_target_path.is_absolute():
            resolved_target_path = (path.parent / resolved_target_path).resolve()
        target_source = artifact.target_sources[int(seed_index)]
        if target_source == "analysis_ground_truth":
            if resolved_target_path.suffix == ".json":
                stored = StoredAnalysisRecord.model_validate_json(
                    resolved_target_path.read_text(encoding="utf-8")
                )
                targets[int(seed_index)] = np.asarray(
                    stored.analysis.ground_truth,
                    dtype=np.float64,
                )
            else:
                payload = load_named_arrays(resolved_target_path)
                targets[int(seed_index)] = np.asarray(payload["ground_truth"], dtype=np.float64)
        elif target_source == "replay_mean_terminal_probs":
            payload = load_named_arrays(resolved_target_path)
            targets[int(seed_index)] = np.asarray(payload["mean_terminal_probs"], dtype=np.float64)
        else:
            msg = f"unsupported synthetic target source: {target_source}"
            raise ValueError(msg)
    return targets


__all__ = [
    "load_round_detail",
    "resolve_round_detail_path",
    "round_detail_from_artifact",
    "summary_vector_from_artifact",
    "summary_vector_from_context",
    "terminal_targets_from_artifact",
]
