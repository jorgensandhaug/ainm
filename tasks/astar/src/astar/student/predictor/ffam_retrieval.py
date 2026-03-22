from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import SummaryBankStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.ffam_config import (
    FFAMRetrievalConfig,
    ffam_synthetic_dataset_name,
    resolve_ffam_config,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


class FFAMRetrievalPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    samples_per_round: int = Field(ge=1)
    synthetic_dataset_version: str
    k_neighbors: int = Field(ge=1)
    summary_variant: str
    use_standardized_distance: bool = False
    weight_temperature: float = Field(default=0.0, ge=0.0)
    inverse_distance_power: float = Field(default=1.0, gt=0.0)
    projected_regime_dim: int = Field(default=0, ge=0)
    target_kind: str = "regime"
    inference_mode: str = "neighbor_average"
    ridge_alpha: float = Field(default=1e-2, gt=0.0)
    teacher_checkpoint_path: str
    student_checkpoint_path: str


class FFAMRetrievalPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_retrieval_v1"
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=1, ge=1)
    synthetic_dataset_version: str = "v1"
    k_neighbors: int = Field(default=5, ge=1)
    summary_variant: str = "v1"
    use_standardized_distance: bool = False
    weight_temperature: float = Field(default=0.0, ge=0.0)
    inverse_distance_power: float = Field(default=1.0, gt=0.0)
    projected_regime_dim: int = Field(default=0, ge=0)
    target_kind: str = "regime"
    inference_mode: str = "neighbor_average"
    ridge_alpha: float = Field(default=1e-2, gt=0.0)
    teacher: HazardTeacher
    student: SummaryBankStudent

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMRetrievalPredictor:
        config = resolve_ffam_config(
            model_name,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        return cls.fit_from_config(
            paths,
            config=config,
            round_ids=round_ids,
        )

    @classmethod
    def fit_from_config(
        cls,
        paths: WorkspacePaths,
        *,
        config: FFAMRetrievalConfig,
        round_ids: list[str] | None = None,
    ) -> FFAMRetrievalPredictor:
        support_round_ids = sorted(
            round_dir.name
            for round_dir in paths.raw_dir.joinpath("replays").glob("*")
            if round_dir.is_dir()
        )
        selected_round_ids = round_ids or support_round_ids
        replay_episodes = [
            episode
            for round_id in selected_round_ids
            if (episode := build_round_episode(paths, round_id)).replay_run_count > 0
        ]
        if not replay_episodes:
            raise ValueError("ffam_retrieval requires at least one replay-backed round")

        teacher = HazardTeacher(name=f"{config.model_name}__hazard_teacher").fit(replay_episodes)
        regime_vector_by_round = None
        if config.target_kind == "coefficients":
            regime_vector_by_round = {
                round_id: np.asarray(coefficient_vector, dtype=np.float64)
                for round_id, coefficient_vector in zip(
                    teacher.round_ids,
                    teacher.coefficient_bank,
                    strict=True,
                )
            }
        dataset_name = ffam_synthetic_dataset_name(
            config.model_name,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
            round_ids=selected_round_ids,
            summary_variant=config.summary_variant,
            synthetic_dataset_version=config.synthetic_dataset_version,
            target_kind=config.target_kind,
        )
        dataset = build_synthetic_live_dataset(
            paths,
            policy_name=config.policy_name,
            round_ids=selected_round_ids,
            samples_per_round=config.samples_per_round,
            dataset_name=dataset_name,
            regime_vector_by_round=regime_vector_by_round,
        )
        student = SummaryBankStudent.fit_from_dataset(
            dataset,
            teacher,
            round_ids=[episode.metadata.round_id for episode in replay_episodes],
            k_neighbors=config.k_neighbors,
            summary_variant=config.summary_variant,
            use_standardized_distance=config.use_standardized_distance,
            weight_temperature=(
                config.weight_temperature if config.weight_mode == "softmax" else 0.0
            ),
            inverse_distance_power=(
                config.inverse_distance_power
                if config.weight_mode == "inverse_distance"
                else 1.0
            ),
            projected_regime_dim=config.projected_regime_dim,
            target_kind=config.target_kind,
            inference_mode=config.inference_mode,
            ridge_alpha=config.ridge_alpha,
        )
        return cls(
            name=config.model_name,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
            synthetic_dataset_version=config.synthetic_dataset_version,
            k_neighbors=config.k_neighbors,
            summary_variant=config.summary_variant,
            use_standardized_distance=config.use_standardized_distance,
            weight_temperature=(
                config.weight_temperature if config.weight_mode == "softmax" else 0.0
            ),
            inverse_distance_power=(
                config.inverse_distance_power
                if config.weight_mode == "inverse_distance"
                else 1.0
            ),
            projected_regime_dim=config.projected_regime_dim,
            target_kind=config.target_kind,
            inference_mode=config.inference_mode,
            ridge_alpha=config.ridge_alpha,
            teacher=teacher,
            student=student,
        )

    def checkpoint(
        self,
        *,
        teacher_checkpoint_path: Path,
        student_checkpoint_path: Path,
    ) -> FFAMRetrievalPredictorCheckpoint:
        return FFAMRetrievalPredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            samples_per_round=self.samples_per_round,
            synthetic_dataset_version=self.synthetic_dataset_version,
            k_neighbors=self.k_neighbors,
            summary_variant=self.summary_variant,
            use_standardized_distance=self.use_standardized_distance,
            weight_temperature=self.weight_temperature,
            inverse_distance_power=self.inverse_distance_power,
            projected_regime_dim=self.projected_regime_dim,
            target_kind=self.target_kind,
            inference_mode=self.inference_mode,
            ridge_alpha=self.ridge_alpha,
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            student_checkpoint_path=str(student_checkpoint_path),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        teacher_checkpoint_path = self.teacher.save_checkpoint(path.parent / "hazard_teacher.json")
        student_checkpoint_path = self.student.save_checkpoint(
            path.parent / "summary_bank_student",
            teacher_checkpoint_path,
        )
        path.write_text(
            json.dumps(
                to_jsonable(
                    self.checkpoint(
                        teacher_checkpoint_path=teacher_checkpoint_path,
                        student_checkpoint_path=student_checkpoint_path,
                    ),
                ),
                indent=2,
            ),
            encoding="utf-8",
        )
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> FFAMRetrievalPredictor:
        checkpoint = FFAMRetrievalPredictorCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8"),
        )
        teacher = HazardTeacher.load_checkpoint(Path(checkpoint.teacher_checkpoint_path))
        student = SummaryBankStudent.load_checkpoint(
            Path(checkpoint.student_checkpoint_path),
            teacher,
        )
        return cls(
            name=checkpoint.name,
            policy_name=checkpoint.policy_name,
            samples_per_round=checkpoint.samples_per_round,
            synthetic_dataset_version=checkpoint.synthetic_dataset_version,
            k_neighbors=checkpoint.k_neighbors,
            summary_variant=checkpoint.summary_variant,
            use_standardized_distance=checkpoint.use_standardized_distance,
            weight_temperature=checkpoint.weight_temperature,
            inverse_distance_power=checkpoint.inverse_distance_power,
            projected_regime_dim=checkpoint.projected_regime_dim,
            target_kind=checkpoint.target_kind,
            inference_mode=checkpoint.inference_mode,
            ridge_alpha=checkpoint.ridge_alpha,
            teacher=teacher,
            student=student,
        )

    def build_prediction_bundle(
        self,
        round_detail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=(
                evidence
                if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())
            ),
        )
        return self.build_prediction_bundle_from_context(context)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed = {
            seed.seed_index: self.student.predict_seed(context, seed.seed_index)
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["FFAMRetrievalPredictor", "FFAMRetrievalPredictorCheckpoint"]
