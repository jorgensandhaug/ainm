from __future__ import annotations
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import LiveQueryObs
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
EVIDENCE_FIELD_V7 = "evidence_field_blend_v7"
EVIDENCE_FIELD_V8 = "evidence_field_blend_v8"
EVIDENCE_FIELD_V9 = "evidence_field_blend_v9"
EVIDENCE_FIELD_V10 = "evidence_field_blend_v10"
EVIDENCE_FIELD_V11 = "evidence_field_blend_v11"
EVIDENCE_FIELD_V12 = "evidence_field_blend_v12"
EVIDENCE_FIELD_V13 = "evidence_field_blend_v13"
EVIDENCE_FIELD_V14 = "evidence_field_blend_v14"
EVIDENCE_FIELD_MODEL_NAMES = frozenset(
    {
        EVIDENCE_FIELD_ALIAS,
        EVIDENCE_FIELD_V1,
        EVIDENCE_FIELD_V2,
        EVIDENCE_FIELD_V3,
        EVIDENCE_FIELD_V4,
        EVIDENCE_FIELD_V5,
        EVIDENCE_FIELD_V6,
        EVIDENCE_FIELD_V7,
        EVIDENCE_FIELD_V8,
        EVIDENCE_FIELD_V9,
        EVIDENCE_FIELD_V10,
        EVIDENCE_FIELD_V11,
        EVIDENCE_FIELD_V12,
        EVIDENCE_FIELD_V13,
        EVIDENCE_FIELD_V14,
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
    EVIDENCE_FIELD_V7,
    EVIDENCE_FIELD_V8,
    EVIDENCE_FIELD_V9,
    EVIDENCE_FIELD_V10,
    EVIDENCE_FIELD_V11,
    EVIDENCE_FIELD_V12,
    EVIDENCE_FIELD_V13,
    EVIDENCE_FIELD_V14,
]


class EvidenceFieldVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    blur_radius: int = Field(default=2, ge=1)
    blur_sigma: float = Field(default=1.5, gt=0.0)
    count_scale: float = Field(default=3.0, gt=0.0)
    field_strength: float = Field(default=1.0, ge=0.0)
    port_strength: float = Field(default=1.2, gt=0.0)
    ruin_strength: float = Field(default=1.1, gt=0.0)
    forest_strength: float = Field(default=0.7, gt=0.0)
    empty_strength: float = Field(default=0.55, gt=0.0)
    state_sigma: float = Field(default=0.0, ge=0.0)
    state_strength: float = Field(default=0.0, ge=0.0)
    state_port_strength: float = Field(default=1.0, ge=0.0)
    state_ruin_strength: float = Field(default=1.0, ge=0.0)
    global_state_strength: float = Field(default=0.0, ge=0.0)
    global_port_strength: float = Field(default=1.0, ge=0.0)
    global_ruin_strength: float = Field(default=1.0, ge=0.0)
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
    if resolved_model_name == EVIDENCE_FIELD_V14:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            field_strength=0.25,
            global_state_strength=1.2,
            global_port_strength=1.25,
            global_ruin_strength=1.2,
        )
    if resolved_model_name == EVIDENCE_FIELD_V13:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            field_strength=0.25,
            global_state_strength=1.2,
            global_port_strength=1.25,
            global_ruin_strength=1.2,
        )
    if resolved_model_name == EVIDENCE_FIELD_V12:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            field_strength=0.0,
            global_state_strength=1.1,
            global_port_strength=1.2,
            global_ruin_strength=1.15,
        )
    if resolved_model_name == EVIDENCE_FIELD_V11:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            field_strength=0.0,
            global_state_strength=1.1,
            global_port_strength=1.2,
            global_ruin_strength=1.15,
        )
    if resolved_model_name == EVIDENCE_FIELD_V10:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            blur_radius=2,
            blur_sigma=1.25,
            count_scale=3.0,
            field_strength=0.35,
            port_strength=1.2,
            ruin_strength=1.1,
            state_sigma=2.75,
            state_strength=1.25,
            state_port_strength=1.35,
            state_ruin_strength=1.3,
        )
    if resolved_model_name == EVIDENCE_FIELD_V9:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            blur_radius=2,
            blur_sigma=1.25,
            count_scale=3.0,
            field_strength=0.35,
            port_strength=1.2,
            ruin_strength=1.1,
            state_sigma=2.75,
            state_strength=1.25,
            state_port_strength=1.35,
            state_ruin_strength=1.3,
        )
    if resolved_model_name == EVIDENCE_FIELD_V8:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v60",
            field_strength=0.0,
            state_sigma=2.5,
            state_strength=1.2,
            state_port_strength=1.35,
            state_ruin_strength=1.25,
        )
    if resolved_model_name == EVIDENCE_FIELD_V7:
        return EvidenceFieldVariantSpec(
            model_name=resolved_model_name,
            base_model_name="teacher_student_blend_v59",
            field_strength=0.0,
            state_sigma=2.5,
            state_strength=1.2,
            state_port_strength=1.35,
            state_ruin_strength=1.25,
        )
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


def _normalize_population(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 4.5


def _normalize_food(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 1.1


def _normalize_wealth(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value) / 1.5


def _normalize_defense(value: float | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _apply_settlement_state_refinement(
    prediction: np.ndarray,
    *,
    observations: Sequence[LiveQueryObs],
    seed_index: int,
    seed_evidence: SeedEvidenceBundle,
    seed_features: SeedFeatureBundle,
    initial_scored_grid: np.ndarray,
    state_sigma: float,
    state_strength: float,
    state_port_strength: float,
    state_ruin_strength: float,
    probability_floor: float,
) -> np.ndarray:
    if state_strength <= 0.0:
        return prediction
    seed_observations = [item for item in observations if item.seed_index == seed_index]
    if not seed_observations:
        return prediction

    height, width = prediction.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    thriving_field = np.zeros((height, width), dtype=np.float64)
    port_field = np.zeros((height, width), dtype=np.float64)
    ruin_field = np.zeros((height, width), dtype=np.float64)
    settlement_count = 0

    for observation in seed_observations:
        for settlement in observation.settlements:
            settlement_count += 1
            population = _normalize_population(settlement.population)
            food = _normalize_food(settlement.food)
            wealth = _normalize_wealth(settlement.wealth)
            defense = _normalize_defense(settlement.defense)
            alive = 1.0 if settlement.alive else 0.0
            thriving = max(0.0, (0.35 * population) + (0.2 * food) + (0.25 * wealth) + (0.2 * defense))
            collapse = max(
                0.0,
                (0.9 * (1.0 - alive))
                + max(0.0, 0.35 - food)
                + max(0.0, 0.45 - defense)
                + (0.1 * max(0.0, 0.3 - wealth)),
            )
            distance_sq = ((yy - settlement.y) ** 2) + ((xx - settlement.x) ** 2)
            influence = np.exp(-(distance_sq / (2.0 * state_sigma * state_sigma)))
            thriving_field += thriving * influence
            if settlement.has_port:
                port_field += (0.35 + thriving) * influence
            ruin_field += collapse * influence

    if settlement_count <= 0:
        return prediction
    normalizer = max(float(np.sqrt(float(settlement_count))), 1.0)
    thriving_field /= normalizer
    port_field /= normalizer
    ruin_field /= normalizer

    observed_total = np.sum(
        np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64),
        axis=-1,
        dtype=np.float64,
    )
    support_gate = np.clip(1.0 - (observed_total / 3.0), 0.0, 1.0)
    mutable = (initial_scored_grid != 5).astype(np.float64)
    gate = support_gate * mutable

    buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
    settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)
    coastal_exposure = np.asarray(seed_features.feature("coastal_exposure"), dtype=np.float64)
    maritime_access = np.asarray(seed_features.feature("maritime_access"), dtype=np.float64)
    frontier_score = np.asarray(seed_features.feature("frontier_score"), dtype=np.float64)
    mountain_density = np.asarray(seed_features.feature("mountain_density"), dtype=np.float64)
    forest_density = np.asarray(seed_features.feature("forest_density"), dtype=np.float64)

    settlement_signal = gate * thriving_field * buildable * (
        (0.65 * settlement_proximity) + (0.35 * frontier_score)
    )
    port_signal = gate * port_field * coastal_exposure * maritime_access * (
        0.4 + (0.6 * settlement_proximity)
    )
    ruin_signal = gate * ruin_field * (
        (0.65 * frontier_score) + (0.2 * mountain_density) + (0.15 * (1.0 - buildable))
    )

    logits = np.log(np.maximum(prediction, 1e-6))
    logits[..., 0] += state_strength * (
        (0.18 * forest_density * gate) - (0.28 * settlement_signal) - (0.18 * port_signal) - (0.22 * ruin_signal)
    )
    logits[..., 1] += state_strength * settlement_signal
    logits[..., 2] += state_strength * state_port_strength * port_signal
    logits[..., 3] += state_strength * state_ruin_strength * ruin_signal
    refined = softmax_logits(logits)
    return apply_probability_floor(refined, probability_floor)


def _apply_global_state_feature_refinement(
    prediction: np.ndarray,
    *,
    seed_evidence: SeedEvidenceBundle,
    seed_features: SeedFeatureBundle,
    initial_scored_grid: np.ndarray,
    global_state_strength: float,
    global_port_strength: float,
    global_ruin_strength: float,
    probability_floor: float,
) -> np.ndarray:
    if global_state_strength <= 0.0:
        return prediction

    population = _normalize_population(seed_evidence.mean_population)
    food = _normalize_food(seed_evidence.mean_food)
    wealth = _normalize_wealth(seed_evidence.mean_wealth)
    defense = _normalize_defense(seed_evidence.mean_defense)
    thriving = max(
        0.0,
        (0.3 * population)
        + (0.2 * food)
        + (0.2 * wealth)
        + (0.2 * defense)
        + (0.15 * seed_evidence.alive_fraction)
        - (0.05 * seed_evidence.owner_hhi),
    )
    collapse = max(
        0.0,
        (0.65 * (1.0 - seed_evidence.alive_fraction))
        + (0.35 * seed_evidence.owner_hhi)
        + (0.2 * (1.0 - seed_evidence.largest_owner_share))
        + (0.1 * seed_evidence.mean_settlement_count)
        - (0.15 * thriving),
    )
    port_bias = seed_evidence.port_fraction * (0.4 + thriving)
    if thriving <= 0.0 and collapse <= 0.0 and port_bias <= 0.0:
        return prediction

    observed_total = np.sum(
        np.asarray(seed_evidence.observed_class_count_tensor, dtype=np.float64),
        axis=-1,
        dtype=np.float64,
    )
    support_gate = 0.25 + (0.75 * np.clip(1.0 - (observed_total / 4.0), 0.0, 1.0))
    mutable = (initial_scored_grid != 5).astype(np.float64)
    gate = support_gate * mutable

    buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
    settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)
    coastal_exposure = np.asarray(seed_features.feature("coastal_exposure"), dtype=np.float64)
    maritime_access = np.asarray(seed_features.feature("maritime_access"), dtype=np.float64)
    frontier_score = np.asarray(seed_features.feature("frontier_score"), dtype=np.float64)
    forest_density = np.asarray(seed_features.feature("forest_density"), dtype=np.float64)
    mountain_density = np.asarray(seed_features.feature("mountain_density"), dtype=np.float64)

    settlement_signal = gate * buildable * (
        thriving * ((0.7 * settlement_proximity) + (0.3 * frontier_score))
    )
    port_signal = gate * coastal_exposure * maritime_access * (
        port_bias * (0.45 + (0.55 * settlement_proximity))
    )
    ruin_signal = gate * (
        collapse * ((0.6 * frontier_score) + (0.25 * mountain_density) + (0.15 * (1.0 - buildable)))
    )

    logits = np.log(np.maximum(prediction, 1e-6))
    logits[..., 0] += global_state_strength * (
        (0.12 * forest_density * gate) - (0.22 * settlement_signal) - (0.15 * port_signal) - (0.18 * ruin_signal)
    )
    logits[..., 1] += global_state_strength * settlement_signal
    logits[..., 2] += global_state_strength * global_port_strength * port_signal
    logits[..., 3] += global_state_strength * global_ruin_strength * ruin_signal
    refined = softmax_logits(logits)
    return apply_probability_floor(refined, probability_floor)


class EvidenceFieldBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = EVIDENCE_FIELD_V1
    base_predictor: SummaryBankRoundPredictor
    blur_radius: int = Field(default=2, ge=1)
    blur_sigma: float = Field(default=1.25, gt=0.0)
    count_scale: float = Field(default=3.0, gt=0.0)
    field_strength: float = Field(default=1.0, ge=0.0)
    port_strength: float = Field(default=1.2, gt=0.0)
    ruin_strength: float = Field(default=1.1, gt=0.0)
    forest_strength: float = Field(default=0.7, gt=0.0)
    empty_strength: float = Field(default=0.55, gt=0.0)
    state_sigma: float = Field(default=0.0, ge=0.0)
    state_strength: float = Field(default=0.0, ge=0.0)
    state_port_strength: float = Field(default=1.0, ge=0.0)
    state_ruin_strength: float = Field(default=1.0, ge=0.0)
    global_state_strength: float = Field(default=0.0, ge=0.0)
    global_port_strength: float = Field(default=1.0, ge=0.0)
    global_ruin_strength: float = Field(default=1.0, ge=0.0)
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
            predictions_by_seed[seed_index] = _apply_settlement_state_refinement(
                predictions_by_seed[seed_index],
                observations=context.observations,
                seed_index=seed_index,
                seed_evidence=context.evidence_bundle.per_seed[seed_index],
                seed_features=context.geometry_bundle.per_seed[seed_index],
                initial_scored_grid=initial_scored_grid,
                state_sigma=self.state_sigma,
                state_strength=self.state_strength,
                state_port_strength=self.state_port_strength,
                state_ruin_strength=self.state_ruin_strength,
                probability_floor=self.probability_floor,
            )
            predictions_by_seed[seed_index] = _apply_global_state_feature_refinement(
                predictions_by_seed[seed_index],
                seed_evidence=context.evidence_bundle.per_seed[seed_index],
                seed_features=context.geometry_bundle.per_seed[seed_index],
                initial_scored_grid=initial_scored_grid,
                global_state_strength=self.global_state_strength,
                global_port_strength=self.global_port_strength,
                global_ruin_strength=self.global_ruin_strength,
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
        state_sigma=spec.state_sigma,
        state_strength=spec.state_strength,
        state_port_strength=spec.state_port_strength,
        state_ruin_strength=spec.state_ruin_strength,
        global_state_strength=spec.global_state_strength,
        global_port_strength=spec.global_port_strength,
        global_ruin_strength=spec.global_ruin_strength,
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
    "EVIDENCE_FIELD_V7",
    "EVIDENCE_FIELD_V8",
    "EVIDENCE_FIELD_V9",
    "EVIDENCE_FIELD_V10",
    "EVIDENCE_FIELD_V11",
    "EVIDENCE_FIELD_V12",
    "EVIDENCE_FIELD_V13",
    "EVIDENCE_FIELD_V14",
    "EvidenceFieldBlendPredictor",
    "_apply_local_evidence_field_refinement",
    "_apply_settlement_state_refinement",
    "_apply_global_state_feature_refinement",
    "is_evidence_field_model_name",
    "load_or_fit_named_evidence_field_predictor",
    "resolve_evidence_field_samples_per_round",
    "resolve_evidence_field_variant_spec",
]
