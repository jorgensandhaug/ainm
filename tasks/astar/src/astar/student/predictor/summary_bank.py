from __future__ import annotations

import json
import hashlib
from collections.abc import Sequence

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import (
    SUMMARY_ENCODER_SEMANTIC_V3,
    SUMMARY_ENCODER_SPATIAL_V2,
    SUMMARY_ENCODER_TEMPORAL_V4,
    SUMMARY_ENCODER_V1,
    SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
    SUMMARY_HEAD_COEFFICIENT_RIDGE,
    SUMMARY_HEAD_KNN,
    SUMMARY_HEAD_RIDGE,
    SummaryBankStudent,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher

SUMMARY_BANK_STUDENT_ALIAS = "teacher_student_blend"
SUMMARY_BANK_STUDENT_V1 = "teacher_student_blend_v1"
SUMMARY_BANK_STUDENT_V2 = "teacher_student_blend_v2"
SUMMARY_BANK_STUDENT_V3 = "teacher_student_blend_v3"
SUMMARY_BANK_STUDENT_V4 = "teacher_student_blend_v4"
SUMMARY_BANK_STUDENT_V5 = "teacher_student_blend_v5"
SUMMARY_BANK_STUDENT_V6 = "teacher_student_blend_v6"
SUMMARY_BANK_STUDENT_V7 = "teacher_student_blend_v7"
SUMMARY_BANK_STUDENT_V8 = "teacher_student_blend_v8"
SUMMARY_BANK_STUDENT_V9 = "teacher_student_blend_v9"
SUMMARY_BANK_STUDENT_V10 = "teacher_student_blend_v10"
SUMMARY_BANK_STUDENT_V11 = "teacher_student_blend_v11"
SUMMARY_BANK_STUDENT_V12 = "teacher_student_blend_v12"
SUMMARY_BANK_STUDENT_V13 = "teacher_student_blend_v13"
SUMMARY_BANK_STUDENT_V14 = "teacher_student_blend_v14"
SUMMARY_BANK_STUDENT_V15 = "teacher_student_blend_v15"
SUMMARY_BANK_STUDENT_V16 = "teacher_student_blend_v16"
BLEND_MODE_GLOBAL = "global"
BLEND_MODE_SPATIAL_DYNAMIC = "spatial_dynamic"
SUMMARY_BANK_MODEL_NAMES = frozenset(
    {
        SUMMARY_BANK_STUDENT_ALIAS,
        SUMMARY_BANK_STUDENT_V1,
        SUMMARY_BANK_STUDENT_V2,
        SUMMARY_BANK_STUDENT_V3,
        SUMMARY_BANK_STUDENT_V4,
        SUMMARY_BANK_STUDENT_V5,
        SUMMARY_BANK_STUDENT_V6,
        SUMMARY_BANK_STUDENT_V7,
        SUMMARY_BANK_STUDENT_V8,
        SUMMARY_BANK_STUDENT_V9,
        SUMMARY_BANK_STUDENT_V10,
        SUMMARY_BANK_STUDENT_V11,
        SUMMARY_BANK_STUDENT_V12,
        SUMMARY_BANK_STUDENT_V13,
        SUMMARY_BANK_STUDENT_V14,
        SUMMARY_BANK_STUDENT_V15,
        SUMMARY_BANK_STUDENT_V16,
    },
)


class SummaryBankVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    teacher_weight_max: float = Field(default=0.4, ge=0.0, le=1.0)
    query_count_scale: float = Field(default=20.0, gt=0.0)
    summary_encoder: str = SUMMARY_ENCODER_V1
    normalize_summary: bool = False
    inference_head: str = SUMMARY_HEAD_KNN
    ridge_alpha: float = Field(default=1.0, gt=0.0)
    blend_mode: str = BLEND_MODE_GLOBAL


def is_summary_bank_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in SUMMARY_BANK_MODEL_NAMES


def resolve_summary_bank_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == SUMMARY_BANK_STUDENT_ALIAS:
        return SUMMARY_BANK_STUDENT_V1
    if normalized in SUMMARY_BANK_MODEL_NAMES:
        return normalized
    msg = f"unsupported summary_bank model: {model_name}"
    raise ValueError(msg)


def resolve_summary_bank_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> SummaryBankVariantSpec:
    resolved_model_name = resolve_summary_bank_model_name(model_name)
    default_samples_per_round = {
        SUMMARY_BANK_STUDENT_V1: 4,
        SUMMARY_BANK_STUDENT_V2: 8,
        SUMMARY_BANK_STUDENT_V3: 4,
        SUMMARY_BANK_STUDENT_V4: 8,
        SUMMARY_BANK_STUDENT_V5: 4,
        SUMMARY_BANK_STUDENT_V6: 8,
        SUMMARY_BANK_STUDENT_V7: 4,
        SUMMARY_BANK_STUDENT_V8: 8,
        SUMMARY_BANK_STUDENT_V9: 4,
        SUMMARY_BANK_STUDENT_V10: 8,
        SUMMARY_BANK_STUDENT_V11: 4,
        SUMMARY_BANK_STUDENT_V12: 8,
        SUMMARY_BANK_STUDENT_V13: 4,
        SUMMARY_BANK_STUDENT_V14: 8,
        SUMMARY_BANK_STUDENT_V15: 4,
        SUMMARY_BANK_STUDENT_V16: 8,
    }.get(resolved_model_name, 4)
    effective_samples_per_round = (
        default_samples_per_round if samples_per_round is None else samples_per_round
    )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V1 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v1 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V2 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v2 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V3 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v3 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V4 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v4 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V5 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v5 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V6 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v6 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V7 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v7 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V8 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v8 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V9 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v9 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V10 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v10 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V11 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v11 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V12 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v12 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V13 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v13 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V14 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v14 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V15 and effective_samples_per_round != 4:
        raise ValueError("teacher_student_blend_v15 fixes samples_per_round=4")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V16 and effective_samples_per_round != 8:
        raise ValueError("teacher_student_blend_v16 fixes samples_per_round=8")
    if resolved_model_name == SUMMARY_BANK_STUDENT_V16:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.82,
            query_count_scale=10.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
            ridge_alpha=2.0,
            blend_mode=BLEND_MODE_SPATIAL_DYNAMIC,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V15:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.75,
            query_count_scale=10.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
            ridge_alpha=2.0,
            blend_mode=BLEND_MODE_SPATIAL_DYNAMIC,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V14:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.78,
            query_count_scale=10.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
            ridge_alpha=2.0,
            blend_mode=BLEND_MODE_GLOBAL,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V13:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.72,
            query_count_scale=10.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RESIDUAL_KNN,
            ridge_alpha=2.0,
            blend_mode=BLEND_MODE_GLOBAL,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V12:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.75,
            query_count_scale=12.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V11:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.70,
            query_count_scale=12.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_COEFFICIENT_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V10:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.70,
            query_count_scale=12.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V9:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.65,
            query_count_scale=12.0,
            summary_encoder=SUMMARY_ENCODER_TEMPORAL_V4,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V8:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.65,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V7:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.6,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
            normalize_summary=True,
            inference_head=SUMMARY_HEAD_RIDGE,
            ridge_alpha=2.0,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V6:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.6,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
            normalize_summary=True,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V5:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.55,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SEMANTIC_V3,
            normalize_summary=True,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V4:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=7,
            teacher_weight_max=0.55,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SPATIAL_V2,
            normalize_summary=True,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V3:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=5,
            teacher_weight_max=0.5,
            query_count_scale=15.0,
            summary_encoder=SUMMARY_ENCODER_SPATIAL_V2,
            normalize_summary=True,
        )
    if resolved_model_name == SUMMARY_BANK_STUDENT_V2:
        return SummaryBankVariantSpec(
            model_name=resolved_model_name,
            samples_per_round=effective_samples_per_round,
            k_neighbors=11,
            teacher_weight_max=0.4,
            query_count_scale=20.0,
        )
    return SummaryBankVariantSpec(
        model_name=resolved_model_name,
        samples_per_round=effective_samples_per_round,
        k_neighbors=7,
        teacher_weight_max=0.4,
        query_count_scale=20.0,
    )


def _round_scope_token(round_ids: Sequence[str] | None) -> str:
    if round_ids is None:
        return "all"
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_dataset_name(
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"summary_bank_synthetic_live__policy={policy_name.strip().lower()}"
        f"__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


def _cached_model_name(
    *,
    model_name: str,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"{model_name}__policy={policy_name.strip().lower()}"
        f"__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


def _selected_replay_round_ids(
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
    selected = [round_id for round_id in round_ids if round_id in set(available)]
    if not selected:
        raise ValueError("teacher_student_blend requires replay-backed rounds")
    return selected


def _load_or_build_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> SyntheticEpisodeDatasetRef:
    dataset_name = _cached_dataset_name(
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=round_ids,
    )
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = paths.dataset_dir(dataset_name) / "summary.json"
    index_path = paths.dataset_dir(dataset_name) / "index.parquet"
    if summary_path.exists() and index_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        cached_round_ids = sorted(
            {
                str(value)
                for value in pl.read_parquet(index_path, columns=["round_id"])["round_id"].to_list()
            },
        )
        expected_round_ids = sorted(set(round_ids))
        if cached_round_ids == expected_round_ids:
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
    return build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        round_ids=list(round_ids),
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
    )


class SummaryBankRoundPredictor(BaseRoundPredictor):
    name: str = SUMMARY_BANK_STUDENT_V1
    base_predictor: HistoricalBucketPriorPredictor
    student: SummaryBankStudent
    teacher_weight_max: float = Field(default=0.4, ge=0.0, le=1.0)
    query_count_scale: float = Field(default=20.0, gt=0.0)
    blend_mode: str = BLEND_MODE_GLOBAL

    def _teacher_weight(self, evidence: RoundEvidenceBundle) -> float:
        if evidence.total_queries <= 0:
            return 0.0
        return float(
            np.clip(evidence.total_queries / self.query_count_scale, 0.0, 1.0)
            * self.teacher_weight_max,
        )

    def _teacher_blend_map(
        self,
        context: LiveInferenceContext,
        *,
        seed_index: int,
        teacher_weight: float,
    ) -> float | np.ndarray:
        if self.blend_mode == BLEND_MODE_GLOBAL:
            return teacher_weight
        if self.blend_mode != BLEND_MODE_SPATIAL_DYNAMIC:
            raise ValueError(f"unsupported summary-bank blend mode: {self.blend_mode}")
        seed_features = context.geometry_bundle.per_seed[seed_index]
        seed_evidence = context.evidence_bundle.per_seed[seed_index]
        buildable = (seed_features.feature("buildable") > 0.5).astype(np.float64)
        frontier = (seed_features.feature("frontier_score") >= 0.5).astype(np.float64)
        coast = (seed_features.feature("coast") > 0.5).astype(np.float64)
        maritime = (seed_features.feature("maritime_access") >= 0.5).astype(np.float64)
        observed = (
            np.asarray(seed_evidence.coverage_counts, dtype=np.float64) > 0.0
        ).astype(np.float64)
        dynamic_emphasis = np.clip(
            0.05
            + (0.50 * buildable)
            + (0.20 * frontier)
            + (0.15 * coast)
            + (0.10 * maritime)
            + (0.20 * observed),
            0.0,
            1.0,
        )
        return np.asarray(teacher_weight * dynamic_emphasis[:, :, None], dtype=np.float64)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        base_bundle = self.base_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
            None,
        )
        teacher_weight = self._teacher_weight(context.evidence_bundle)
        if teacher_weight <= 0.0:
            return PredictionBundle(
                round_id=context.round_context.round_id,
                model_name=self.name,
                predictions_by_seed=base_bundle.predictions_by_seed,
            )
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            teacher_prediction = self.student.predict_seed(context, seed.seed_index)
            blend_map = self._teacher_blend_map(
                context,
                seed_index=seed.seed_index,
                teacher_weight=teacher_weight,
            )
            predictions_by_seed[seed.seed_index] = np.asarray(
                ((1.0 - blend_map) * base_bundle.predictions_by_seed[seed.seed_index])
                + (blend_map * teacher_prediction),
                dtype=np.float64,
            )
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=evidence or build_round_evidence_from_observations(round_detail, ()),
        )
        return self.build_prediction_bundle_from_context(context)


def load_or_fit_named_summary_bank_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> SummaryBankRoundPredictor:
    spec = resolve_summary_bank_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    )
    selected_round_ids = _selected_replay_round_ids(paths, round_ids)
    checkpoint_dir = paths.model_dir(
        _cached_model_name(
            model_name=spec.model_name,
            policy_name=policy_name,
            samples_per_round=spec.samples_per_round,
            round_ids=selected_round_ids,
        ),
    )
    checkpoint_path = checkpoint_dir / "summary_bank_student.json"
    base_checkpoint_path = checkpoint_dir / "base_prior.json"
    if checkpoint_path.exists() and base_checkpoint_path.exists():
        return SummaryBankRoundPredictor(
            name=spec.model_name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(base_checkpoint_path),
            student=SummaryBankStudent.load_checkpoint(checkpoint_path),
            teacher_weight_max=spec.teacher_weight_max,
            query_count_scale=spec.query_count_scale,
            blend_mode=spec.blend_mode,
        )

    base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
        paths,
        round_ids=list(selected_round_ids),
    )
    replay_episodes = [
        build_round_episode(paths, round_id)
        for round_id in selected_round_ids
    ]
    teacher = HazardTeacher(name=f"{spec.model_name}_teacher").fit(
        [episode for episode in replay_episodes if episode.replay_run_count > 0],
    )
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    base_predictor.save_checkpoint(base_checkpoint_path)
    teacher_checkpoint_path = teacher.save_checkpoint(checkpoint_dir / "hazard_teacher.json")
    dataset = _load_or_build_synthetic_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=spec.samples_per_round,
        round_ids=selected_round_ids,
    )
    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=spec.k_neighbors,
        summary_encoder=spec.summary_encoder,
        normalize_summary=spec.normalize_summary,
        inference_head=spec.inference_head,
        ridge_alpha=spec.ridge_alpha,
    ).model_copy(
        update={
            "name": spec.model_name,
            "dataset_name": dataset.dataset_name,
        },
    )
    student.save_checkpoint(checkpoint_dir, teacher_checkpoint_path)
    return SummaryBankRoundPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        student=student,
        teacher_weight_max=spec.teacher_weight_max,
        query_count_scale=spec.query_count_scale,
        blend_mode=spec.blend_mode,
    )


__all__ = [
    "SUMMARY_BANK_STUDENT_ALIAS",
    "SUMMARY_BANK_STUDENT_V1",
    "SUMMARY_BANK_STUDENT_V2",
    "SUMMARY_BANK_STUDENT_V3",
    "SUMMARY_BANK_STUDENT_V4",
    "SUMMARY_BANK_STUDENT_V5",
    "SUMMARY_BANK_STUDENT_V6",
    "SUMMARY_BANK_STUDENT_V7",
    "SUMMARY_BANK_STUDENT_V8",
    "SUMMARY_BANK_STUDENT_V9",
    "SUMMARY_BANK_STUDENT_V10",
    "SUMMARY_BANK_STUDENT_V11",
    "SUMMARY_BANK_STUDENT_V12",
    "SUMMARY_BANK_STUDENT_V13",
    "SUMMARY_BANK_STUDENT_V14",
    "SUMMARY_BANK_STUDENT_V15",
    "SUMMARY_BANK_STUDENT_V16",
    "SummaryBankRoundPredictor",
    "is_summary_bank_model_name",
    "load_or_fit_named_summary_bank_predictor",
    "resolve_summary_bank_variant_spec",
]
