from __future__ import annotations
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, SeedFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, SeedEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)

EVIDENCE_FIELD_ALIAS = "evidence_field_blend"
EVIDENCE_FIELD_V1 = "evidence_field_blend_v1"
EVIDENCE_FIELD_V2 = "evidence_field_blend_v2"
EVIDENCE_FIELD_V3 = "evidence_field_blend_v3"
EVIDENCE_FIELD_V4 = "evidence_field_blend_v4"
EVIDENCE_FIELD_V5 = "evidence_field_blend_v5"
EVIDENCE_FIELD_V6 = "evidence_field_blend_v6"
EVIDENCE_FIELD_MODEL_NAMES = frozenset(
    {
        EVIDENCE_FIELD_ALIAS,
        EVIDENCE_FIELD_V1,
        EVIDENCE_FIELD_V2,
        EVIDENCE_FIELD_V3,
        EVIDENCE_FIELD_V4,
        EVIDENCE_FIELD_V5,
        EVIDENCE_FIELD_V6,
    },
)
EVIDENCE_FIELD_MODEL_CHOICE_LIST = [
    EVIDENCE_FIELD_ALIAS,
    EVIDENCE_FIELD_V1,
    EVIDENCE_FIELD_V2,
    EVIDENCE_FIELD_V3,
    EVIDENCE_FIELD_V4,
    EVIDENCE_FIELD_V5,
    EVIDENCE_FIELD_V6,
]


class EvidenceFieldVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    blur_radius: int = Field(default=2, ge=1)
    blur_sigma: float = Field(default=1.5, gt=0.0)
    count_scale: float = Field(default=3.0, gt=0.0)
    field_strength: float = Field(default=1.0, gt=0.0)
    port_strength: float = Field(default=1.2, gt=0.0)
    ruin_strength: float = Field(default=1.1, gt=0.0)
    forest_strength: float = Field(default=0.7, gt=0.0)
    empty_strength: float = Field(default=0.55, gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


def is_evidence_field_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in EVIDENCE_FIELD_MODEL_NAMES


def resolve_evidence_field_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == EVIDENCE_FIELD_ALIAS:
        return EVIDENCE_FIELD_V1
    if normalized in EVIDENCE_FIELD_MODEL_NAMES:
        return normalized
    msg = f"unsupported evidence_field model: {model_name}"
    raise ValueError(msg)


def resolve_evidence_field_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> EvidenceFieldVariantSpec:
    resolved_model_name = resolve_evidence_field_model_name(model_name)
    effective_samples_per_round = 4 if samples_per_round is None else samples_per_round
    if effective_samples_per_round != 4:
        raise ValueError(f"{resolved_model_name} fixes samples_per_round=4")
    if resolved_model_name == EVIDENCE_FIELD_V6:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            blur_radius=3,
            blur_sigma=2.0,
            count_scale=4.0,
            field_strength=1.2,
            port_strength=1.3,
            ruin_strength=1.15,
        )
    if resolved_model_name == EVIDENCE_FIELD_V5:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            blur_radius=3,
            blur_sigma=2.0,
            count_scale=4.0,
            field_strength=1.2,
            port_strength=1.3,
            ruin_strength=1.15,
        )
    if resolved_model_name == EVIDENCE_FIELD_V4:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            blur_radius=2,
            blur_sigma=1.5,
            count_scale=3.0,
            field_strength=1.25,
            port_strength=1.35,
            ruin_strength=1.2,
        )
    if resolved_model_name == EVIDENCE_FIELD_V3:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            blur_radius=2,
            blur_sigma=1.5,
            count_scale=3.0,
            field_strength=1.25,
            port_strength=1.35,
            ruin_strength=1.2,
        )
    if resolved_model_name == EVIDENCE_FIELD_V2:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            blur_radius=2,
            blur_sigma=1.25,
            count_scale=3.0,
            field_strength=0.9,
        )
    return EvidenceFieldVariantSpec(
        model_name=resolved_model_name,
        base_model_name="teacher_student_blend_v59",
        blur_radius=2,
        blur_sigma=1.25,
        count_scale=3.0,
        field_strength=0.9,
    )


def resolve_evidence_field_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_evidence_field_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    ).samples_per_round


def _gaussian_kernel(radius: int, sigma: float) -> np.ndarray:
    coordinates = np.arange(-radius, radius + 1, dtype=np.float64)
    grid_y, grid_x = np.meshgrid(coordinates, coordinates, indexing="ij")
    kernel = np.exp(-((grid_y * grid_y) + (grid_x * grid_x)) / (2.0 * sigma * sigma))
    kernel = kernel / np.sum(kernel, dtype=np.float64)
    return np.asarray(kernel, dtype=np.float64)


def _blur_2d(values: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    radius = kernel.shape[0] // 2
    padded = np.pad(values, radius, mode="edge")
    height, width = values.shape
    output = np.zeros_like(values, dtype=np.float64)
    for offset_y in range(kernel.shape[0]):
        for offset_x in range(kernel.shape[1]):
            weight = float(kernel[offset_y, offset_x])
            if weight <= 0.0:
                continue
            output += weight * padded[offset_y : offset_y + height, offset_x : offset_x + width]
    return output


def _blur_count_tensor(count_tensor: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    return np.stack(
        [_blur_2d(count_tensor[..., class_index], kernel) for class_index in range(count_tensor.shape[-1])],
        axis=-1,
    ).astype(np.float64)


def _apply_local_evidence_field_refinement(
    prediction: np.ndarray,
    *,
    seed_evidence: SeedEvidenceBundle,
    seed_features: SeedFeatureBundle,
    initial_scored_grid: np.ndarray,
    blur_radius: int,
    blur_sigma: float,
    count_scale: float,
    field_strength: float,
    port_strength: float,
    ruin_strength: float,
    forest_strength: float,
    empty_strength: float,
    probability_floor: float,
) -> np.ndarray:
    count_tensor = np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64)
    total_count = np.sum(count_tensor, axis=-1, dtype=np.float64)
    if float(np.sum(total_count, dtype=np.float64)) <= 0.0:
        return prediction
    kernel = _gaussian_kernel(blur_radius, blur_sigma)
    blurred_count = _blur_count_tensor(count_tensor, kernel)
    blurred_total = _blur_2d(total_count, kernel)
    local_frequency = blurred_count / np.clip(blurred_total[..., None], 1e-6, None)
    low_support = np.clip(1.0 - (total_count / count_scale), 0.0, 1.0)
    neighborhood_support = np.clip(blurred_total / count_scale, 0.0, 1.0)
    mutable = (initial_scored_grid != 5).astype(np.float64)
    field_weight = low_support * neighborhood_support * mutable

    buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
    settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)
    coastal_exposure = np.asarray(seed_features.feature("coastal_exposure"), dtype=np.float64)
    maritime_access = np.asarray(seed_features.feature("maritime_access"), dtype=np.float64)
    frontier_score = np.asarray(seed_features.feature("frontier_score"), dtype=np.float64)
    forest_density = np.asarray(seed_features.feature("forest_density"), dtype=np.float64)
    mountain_density = np.asarray(seed_features.feature("mountain_density"), dtype=np.float64)

    built_frequency = local_frequency[..., 1] + local_frequency[..., 2] + local_frequency[..., 3]
    settlement_signal = field_weight * built_frequency * buildable * (
        0.8 * settlement_proximity + 0.6 * frontier_score
    )
    port_signal = field_weight * np.maximum(local_frequency[..., 2], 0.5 * built_frequency) * (
        coastal_exposure * maritime_access * (0.5 + 0.5 * settlement_proximity)
    )
    ruin_signal = field_weight * np.maximum(local_frequency[..., 3], 0.4 * built_frequency) * (
        0.8 * frontier_score + 0.3 * mountain_density + 0.2 * settlement_proximity
    )
    forest_signal = field_weight * local_frequency[..., 4] * forest_density * (
        1.0 - 0.4 * settlement_proximity
    )
    empty_signal = field_weight * local_frequency[..., 0] * (
        (1.0 - buildable) + 0.3 * forest_density + 0.2 * mountain_density
    )

    logits = np.log(np.maximum(prediction, 1e-6))
    logits[..., 0] += field_strength * (
        empty_strength * empty_signal - 0.35 * built_frequency * field_weight
    )
    logits[..., 1] += field_strength * (1.0 * settlement_signal - 0.15 * empty_signal)
    logits[..., 2] += field_strength * port_strength * port_signal
    logits[..., 3] += field_strength * ruin_strength * ruin_signal
    logits[..., 4] += field_strength * forest_strength * forest_signal

    refined = softmax_logits(logits)
    return apply_probability_floor(refined, probability_floor)


class EvidenceFieldBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = EVIDENCE_FIELD_V1
    base_predictor: SummaryBankRoundPredictor
    blur_radius: int = Field(default=2, ge=1)
    blur_sigma: float = Field(default=1.25, gt=0.0)
    count_scale: float = Field(default=3.0, gt=0.0)
    field_strength: float = Field(default=1.0, gt=0.0)
    port_strength: float = Field(default=1.2, gt=0.0)
    ruin_strength: float = Field(default=1.1, gt=0.0)
    forest_strength: float = Field(default=0.7, gt=0.0)
    empty_strength: float = Field(default=0.55, gt=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        base_bundle = self.base_predictor.build_prediction_bundle_from_context(context)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            seed_index = seed.seed_index
            initial_scored_grid = collapse_internal_grid(
                np.asarray(round_detail.initial_states[seed_index].grid, dtype=np.int64),
            )
            predictions_by_seed[seed_index] = _apply_local_evidence_field_refinement(
                np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64),
                seed_evidence=context.evidence_bundle.per_seed[seed_index],
                seed_features=context.geometry_bundle.per_seed[seed_index],
                initial_scored_grid=initial_scored_grid,
                blur_radius=self.blur_radius,
                blur_sigma=self.blur_sigma,
                count_scale=self.count_scale,
                field_strength=self.field_strength,
                port_strength=self.port_strength,
                ruin_strength=self.ruin_strength,
                forest_strength=self.forest_strength,
                empty_strength=self.empty_strength,
                probability_floor=self.probability_floor,
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


def load_or_fit_named_evidence_field_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> EvidenceFieldBlendPredictor:
    spec = resolve_evidence_field_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    )
    base_predictor = load_or_fit_named_summary_bank_predictor(
        paths,
        model_name=spec.base_model_name,
        round_ids=None if round_ids is None else list(round_ids),
        policy_name=policy_name,
        samples_per_round=spec.samples_per_round,
    )
    return EvidenceFieldBlendPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
        blur_radius=spec.blur_radius,
        blur_sigma=spec.blur_sigma,
        count_scale=spec.count_scale,
        field_strength=spec.field_strength,
        port_strength=spec.port_strength,
        ruin_strength=spec.ruin_strength,
        forest_strength=spec.forest_strength,
        empty_strength=spec.empty_strength,
        probability_floor=spec.probability_floor,
    )


__all__ = [
    "EVIDENCE_FIELD_ALIAS",
    "EVIDENCE_FIELD_MODEL_CHOICE_LIST",
    "EVIDENCE_FIELD_V1",
    "EVIDENCE_FIELD_V2",
    "EVIDENCE_FIELD_V3",
    "EVIDENCE_FIELD_V4",
    "EVIDENCE_FIELD_V5",
    "EVIDENCE_FIELD_V6",
    "EvidenceFieldBlendPredictor",
    "_apply_local_evidence_field_refinement",
    "is_evidence_field_model_name",
    "load_or_fit_named_evidence_field_predictor",
    "resolve_evidence_field_samples_per_round",
    "resolve_evidence_field_variant_spec",
]
