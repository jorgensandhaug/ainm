from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Sequence
from pathlib import Path
from typing import cast

from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.student.posterior.state_space_student import StateSpaceStudent
from astar.student.posterior.summary_bank import (
    SummaryBankStudent,
    SummaryBankStudentCheckpoint,
)
from astar.student.predictor.assimilation import (
    AssimilatedStateSpaceStudent,
    ObservedCellAssimilator,
)
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher


def _replay_round_ids(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    available = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if round_ids is None:
        return available
    selected = [round_id for round_id in round_ids if round_id in available]
    if not selected:
        raise ValueError("offline student predictor requires replay-backed rounds")
    return selected


def _round_scope_token(round_ids: Sequence[str] | None) -> str:
    if round_ids is None:
        return "all"
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _teacher_signature(
    teacher: HazardTeacher | StateSpaceTeacher,
) -> str:
    checkpoint = teacher.checkpoint()
    regime_encoder_checkpoint = getattr(checkpoint, "regime_encoder_checkpoint", None)
    payload = (
        to_jsonable(regime_encoder_checkpoint)
        if regime_encoder_checkpoint is not None
        else to_jsonable(checkpoint)
    )
    digest = hashlib.sha1(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()[:12]
    return f"{teacher.__class__.__name__.lower()}__{digest}"


def _cached_dataset_name(
    stack_name: str,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str] | None,
    *,
    teacher_signature: str,
) -> str:
    normalized_policy = policy_name.strip().lower()
    scope_token = _round_scope_token(round_ids)
    return (
        f"{stack_name}__policy={normalized_policy}"
        f"__samples={samples_per_round}__rounds={scope_token}"
        f"__teacher={teacher_signature}"
    )


def _load_dataset_ref(
    paths: WorkspacePaths,
    dataset_name: str,
) -> SyntheticEpisodeDatasetRef:
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "index.parquet"
    if not summary_path.exists() or not index_path.exists():
        raise FileNotFoundError(dataset_name)
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    episode_count = int(payload.get("episode_count", 0))
    return SyntheticEpisodeDatasetRef(
        dataset_name=str(payload.get("dataset_name", dataset_name)),
        dataset_kind=str(payload.get("dataset_kind", "synthetic_live")),
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=episode_count,
        round_count=int(payload.get("round_count", 0)),
        policy_name=str(payload.get("policy_name", "")),
        episode_count=episode_count,
        total_query_count=int(payload.get("total_query_count", 0)),
        samples_per_round=int(payload.get("samples_per_round", 1)),
    )


def _ensure_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    stack_name: str,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str] | None,
    regime_encoder: HazardTeacher | StateSpaceTeacher,
) -> SyntheticEpisodeDatasetRef:
    dataset_name = _cached_dataset_name(
        stack_name,
        policy_name,
        samples_per_round,
        round_ids,
        teacher_signature=_teacher_signature(regime_encoder),
    )
    try:
        return _load_dataset_ref(paths, dataset_name)
    except FileNotFoundError:
        return build_synthetic_live_dataset(
            paths,
            policy_name=policy_name,
            round_ids=None if round_ids is None else list(round_ids),
            samples_per_round=samples_per_round,
            dataset_name=dataset_name,
            regime_encoder=regime_encoder,
        )


def _resolve_checkpoint_path(
    checkpoint_path: Path,
    configured_path: str | Path,
) -> Path:
    resolved = Path(configured_path)
    if resolved.is_absolute():
        return resolved
    return (checkpoint_path.parent / resolved).resolve()


def _load_summary_bank_student_checkpoint(path: Path) -> SummaryBankStudent:
    checkpoint = SummaryBankStudentCheckpoint.model_validate_json(
        path.read_text(encoding="utf-8")
    )
    teacher = HazardTeacher.load_checkpoint(
        _resolve_checkpoint_path(path, checkpoint.teacher_checkpoint_path),
    )
    return SummaryBankStudent.load_checkpoint(path, teacher=teacher)


def _state_space_fit_workers() -> int:
    cpu_count = os.cpu_count() or 1
    return max(1, min(8, cpu_count))


def _replay_backed_episodes(
    paths: WorkspacePaths,
    round_ids: Sequence[str],
) -> list[RoundEpisode]:
    episodes = [build_round_episode(paths, round_id) for round_id in round_ids]
    return [episode for episode in episodes if episode.replay_run_count > 0]


class PosteriorStudentPredictorAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    student: SummaryBankStudent | StateSpaceStudent | AssimilatedStateSpaceStudent
    name: str
    samples_per_round: int = Field(default=1, ge=1)

    def init_belief(self, ctx: RoundContext) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=OnlineEpisodeSample(
                round_context=ctx,
                transcript=OnlineTranscript(),
            ),
        )

    def update(
        self,
        belief: TranscriptBeliefState,
        obs: LiveQueryObs,
    ) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, obs)},
                    ),
                },
            ),
        )

    def predict(self, belief: TranscriptBeliefState) -> PredictionBundle:
        inference_context = round_context_to_live_inference_context(
            belief.round_context,
            belief.observations,
        )
        build_from_context = getattr(self.student, "build_prediction_bundle_from_context", None)
        if callable(build_from_context):
            return cast(PredictionBundle, build_from_context(inference_context))
        predictions_by_seed = {
            seed.seed_index: self.student.predict_seed(inference_context, seed.seed_index)
            for seed in belief.round_context.seeds
        }
        return PredictionBundle(
            round_id=belief.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


def _load_or_fit_summary_bank_student(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    k_neighbors: int = 5,
) -> SummaryBankStudent:
    selected_round_ids = _replay_round_ids(paths, round_ids)
    scope_token = _round_scope_token(selected_round_ids)
    teacher_name = f"hazard_teacher_summary_bank_cache__rounds={scope_token}"
    student_name = (
        f"summary_bank_student_cache__policy={policy_name}"
        f"__samples={samples_per_round}__rounds={scope_token}"
    )
    teacher_checkpoint_path = paths.model_dir(teacher_name) / "checkpoint.json"
    student_checkpoint_path = paths.model_dir(student_name) / "summary_bank_student.json"

    if student_checkpoint_path.exists():
        student = _load_summary_bank_student_checkpoint(student_checkpoint_path)
    else:
        replay_episodes: list[RoundEpisode] | None = None
        if teacher_checkpoint_path.exists():
            teacher = HazardTeacher.load_checkpoint(teacher_checkpoint_path)
            if not teacher.supports_offline_regime_encoding:
                replay_episodes = _replay_backed_episodes(paths, selected_round_ids)
                teacher = teacher.fit(replay_episodes).without_replay_bank()
                teacher.save_checkpoint(teacher_checkpoint_path)
        else:
            replay_episodes = _replay_backed_episodes(paths, selected_round_ids)
            teacher = HazardTeacher(name=teacher_name).fit(replay_episodes).without_replay_bank()
            teacher.save_checkpoint(teacher_checkpoint_path)
        dataset = _ensure_synthetic_dataset(
            paths,
            stack_name="summary_bank_synthetic_live_v1",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_round_ids,
            regime_encoder=teacher,
        )
        student = SummaryBankStudent.fit_from_dataset(
            dataset,
            teacher,
            k_neighbors=k_neighbors,
        )
        student.save_checkpoint(paths.model_dir(student_name), teacher_checkpoint_path)

    return student.model_copy(update={"name": "summary_bank_student"})


def build_summary_bank_student_predictor(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    k_neighbors: int = 5,
) -> PosteriorStudentPredictorAdapter:
    student = _load_or_fit_summary_bank_student(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        k_neighbors=k_neighbors,
    )
    return PosteriorStudentPredictorAdapter(
        student=student,
        name=student.name,
        samples_per_round=samples_per_round,
    )


def _load_or_fit_state_space_student(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    prototype_count: int = 6,
    decoder_rollouts: int = 32,
) -> StateSpaceStudent:
    selected_round_ids = _replay_round_ids(paths, round_ids)
    scope_token = _round_scope_token(selected_round_ids)
    teacher_name = f"state_space_teacher_cache__rounds={scope_token}"
    student_name = (
        f"state_space_student_cache__policy={policy_name}"
        f"__samples={samples_per_round}__rounds={scope_token}"
    )
    teacher_checkpoint_path = paths.model_dir(teacher_name) / "checkpoint.json"
    student_checkpoint_path = paths.model_dir(student_name) / "state_space_student.json"

    if student_checkpoint_path.exists():
        student = StateSpaceStudent.load_checkpoint(student_checkpoint_path)
    else:
        if teacher_checkpoint_path.exists():
            teacher = StateSpaceTeacher.load_checkpoint(teacher_checkpoint_path)
        else:
            replay_episodes = _replay_backed_episodes(paths, selected_round_ids)
            teacher = StateSpaceTeacher(
                name=teacher_name,
                fit_workers=_state_space_fit_workers(),
            ).fit(replay_episodes)
            teacher.save_checkpoint(teacher_checkpoint_path)
        dataset = _ensure_synthetic_dataset(
            paths,
            stack_name="state_space_synthetic_live_v1",
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_round_ids,
            regime_encoder=teacher,
        )
        student = StateSpaceStudent.fit_from_dataset(
            dataset,
            teacher,
            prototype_count=prototype_count,
            decoder_rollouts=decoder_rollouts,
        )
        student.save_checkpoint(paths.model_dir(student_name), teacher_checkpoint_path)

    return student.model_copy(update={"name": "state_space_student"})


def build_state_space_student_predictor(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    prototype_count: int = 6,
    decoder_rollouts: int = 32,
) -> PosteriorStudentPredictorAdapter:
    student = _load_or_fit_state_space_student(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        prototype_count=prototype_count,
        decoder_rollouts=decoder_rollouts,
    )
    return PosteriorStudentPredictorAdapter(
        student=student,
        name=student.name,
        samples_per_round=samples_per_round,
    )


def build_state_space_student_assimilated_predictor(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    prototype_count: int = 6,
    decoder_rollouts: int = 32,
) -> PosteriorStudentPredictorAdapter:
    student = _load_or_fit_state_space_student(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        prototype_count=prototype_count,
        decoder_rollouts=decoder_rollouts,
    )
    selected_round_ids = _replay_round_ids(paths, round_ids)
    dataset = _ensure_synthetic_dataset(
        paths,
        stack_name="state_space_synthetic_live_v1",
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=selected_round_ids,
        regime_encoder=student.teacher,
    )
    assimilator = ObservedCellAssimilator.fit_from_dataset(dataset, student)
    corrected = AssimilatedStateSpaceStudent(
        name="state_space_student_assimilated",
        student=student,
        assimilator=assimilator,
    )
    return PosteriorStudentPredictorAdapter(
        student=corrected,
        name=corrected.name,
        samples_per_round=samples_per_round,
    )


__all__ = [
    "PosteriorStudentPredictorAdapter",
    "build_state_space_student_assimilated_predictor",
    "build_state_space_student_predictor",
    "build_summary_bank_student_predictor",
]
