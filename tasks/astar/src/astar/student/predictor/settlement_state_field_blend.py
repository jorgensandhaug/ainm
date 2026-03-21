from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.evidence_field import (
    _apply_global_state_feature_refinement,
    _apply_settlement_state_refinement,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    SummaryBankRoundPredictor,
    load_or_fit_named_summary_bank_predictor,
)

SETTLEMENT_STATE_FIELD_BLEND_ALIAS = "settlement_state_field_blend"
SETTLEMENT_STATE_FIELD_BLEND_V1 = "settlement_state_field_blend_v1"
SETTLEMENT_STATE_FIELD_BLEND_V2 = "settlement_state_field_blend_v2"
SETTLEMENT_STATE_FIELD_BLEND_V3 = "settlement_state_field_blend_v3"
SETTLEMENT_STATE_FIELD_BLEND_V4 = "settlement_state_field_blend_v4"
SETTLEMENT_STATE_FIELD_BLEND_MODEL_NAMES = frozenset(
    {
        SETTLEMENT_STATE_FIELD_BLEND_ALIAS,
        SETTLEMENT_STATE_FIELD_BLEND_V1,
        SETTLEMENT_STATE_FIELD_BLEND_V2,
        SETTLEMENT_STATE_FIELD_BLEND_V3,
        SETTLEMENT_STATE_FIELD_BLEND_V4,
    },
)
SETTLEMENT_STATE_FIELD_BLEND_MODEL_CHOICE_LIST = [
    SETTLEMENT_STATE_FIELD_BLEND_ALIAS,
    SETTLEMENT_STATE_FIELD_BLEND_V1,
    SETTLEMENT_STATE_FIELD_BLEND_V2,
    SETTLEMENT_STATE_FIELD_BLEND_V3,
    SETTLEMENT_STATE_FIELD_BLEND_V4,
]


class SettlementStateFieldBlendVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    base_model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    state_sigma: float = Field(gt=0.0)
    state_strength: float = Field(ge=0.0)
    state_port_strength: float = Field(ge=0.0)
    state_ruin_strength: float = Field(ge=0.0)
    global_state_strength: float = Field(ge=0.0)
    global_port_strength: float = Field(ge=0.0)
    global_ruin_strength: float = Field(ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)


def is_settlement_state_field_blend_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in SETTLEMENT_STATE_FIELD_BLEND_MODEL_NAMES


def resolve_settlement_state_field_blend_model_name(model_name: str) -> str:
    normalized = model_name.strip().lower()
    if normalized == SETTLEMENT_STATE_FIELD_BLEND_ALIAS:
        return SETTLEMENT_STATE_FIELD_BLEND_V1
    if normalized in SETTLEMENT_STATE_FIELD_BLEND_MODEL_NAMES:
        return normalized
    raise ValueError(f"unsupported settlement_state_field_blend model: {model_name}")


def resolve_settlement_state_field_blend_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> SettlementStateFieldBlendVariantSpec:
    resolved = resolve_settlement_state_field_blend_model_name(model_name)
    effective_samples = 4 if samples_per_round is None else samples_per_round
    if effective_samples != 4:
        raise ValueError(f"{resolved} fixes samples_per_round=4")
    if resolved == SETTLEMENT_STATE_FIELD_BLEND_V4:
        return SettlementStateFieldBlendVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            state_sigma=3.0,
            state_strength=1.35,
            state_port_strength=1.35,
            state_ruin_strength=1.25,
            global_state_strength=0.45,
            global_port_strength=1.15,
            global_ruin_strength=1.15,
        )
    if resolved == SETTLEMENT_STATE_FIELD_BLEND_V3:
        return SettlementStateFieldBlendVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v59",
            state_sigma=3.0,
            state_strength=1.35,
            state_port_strength=1.35,
            state_ruin_strength=1.25,
            global_state_strength=0.45,
            global_port_strength=1.15,
            global_ruin_strength=1.15,
        )
    if resolved == SETTLEMENT_STATE_FIELD_BLEND_V2:
        return SettlementStateFieldBlendVariantSpec(
            model_name=resolved,
            base_model_name="teacher_student_blend_v60",
            state_sigma=2.25,
            state_strength=1.0,
            state_port_strength=1.2,
            state_ruin_strength=1.1,
            global_state_strength=0.25,
            global_port_strength=1.0,
            global_ruin_strength=1.0,
        )
    return SettlementStateFieldBlendVariantSpec(
        model_name=resolved,
        base_model_name="teacher_student_blend_v59",
        state_sigma=2.25,
        state_strength=1.0,
        state_port_strength=1.2,
        state_ruin_strength=1.1,
        global_state_strength=0.25,
        global_port_strength=1.0,
        global_ruin_strength=1.0,
    )


def resolve_settlement_state_field_blend_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int:
    return resolve_settlement_state_field_blend_variant_spec(
        model_name,
        samples_per_round=samples_per_round,
    ).samples_per_round


class SettlementStateFieldBlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = SETTLEMENT_STATE_FIELD_BLEND_V1
    base_predictor: SummaryBankRoundPredictor
    state_sigma: float = Field(gt=0.0)
    state_strength: float = Field(ge=0.0)
    state_port_strength: float = Field(ge=0.0)
    state_ruin_strength: float = Field(ge=0.0)
    global_state_strength: float = Field(ge=0.0)
    global_port_strength: float = Field(ge=0.0)
    global_ruin_strength: float = Field(ge=0.0)
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
            prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prediction = _apply_settlement_state_refinement(
                prediction,
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
            prediction = _apply_global_state_feature_refinement(
                prediction,
                seed_evidence=context.evidence_bundle.per_seed[seed_index],
                seed_features=context.geometry_bundle.per_seed[seed_index],
                initial_scored_grid=initial_scored_grid,
                global_state_strength=self.global_state_strength,
                global_port_strength=self.global_port_strength,
                global_ruin_strength=self.global_ruin_strength,
                probability_floor=self.probability_floor,
            )
            predictions_by_seed[seed_index] = prediction
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


def load_or_fit_named_settlement_state_field_blend_predictor(
    paths: WorkspacePaths,
    *,
    model_name: str,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int | None = None,
) -> SettlementStateFieldBlendPredictor:
    spec = resolve_settlement_state_field_blend_variant_spec(
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
    return SettlementStateFieldBlendPredictor(
        name=spec.model_name,
        base_predictor=base_predictor,
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
    "SETTLEMENT_STATE_FIELD_BLEND_ALIAS",
    "SETTLEMENT_STATE_FIELD_BLEND_MODEL_CHOICE_LIST",
    "SETTLEMENT_STATE_FIELD_BLEND_V1",
    "SETTLEMENT_STATE_FIELD_BLEND_V2",
    "SETTLEMENT_STATE_FIELD_BLEND_V3",
    "SETTLEMENT_STATE_FIELD_BLEND_V4",
    "is_settlement_state_field_blend_model_name",
    "load_or_fit_named_settlement_state_field_blend_predictor",
    "resolve_settlement_state_field_blend_samples_per_round",
    "resolve_settlement_state_field_blend_variant_spec",
]
