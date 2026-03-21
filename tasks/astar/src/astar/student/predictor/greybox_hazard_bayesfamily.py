from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.features.geometry import RoundFeatureBundle
from astar.history.episodes.build import build_round_episode
from astar.history.summaries.round_coefficients import fit_round_semimechanistic_coefficients
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.greybox_regime import (
    DEFAULT_BUDGET_PREFIXES,
    GreyboxHazardLowRankPredictor,
    _derived_from_evidence,
    _exact_cell_blend,
    _round_ids_with_analyses_and_replays,
    _teacher_seed_adapter,
)
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    _derive_transcript_features_from_stats,
    _regime_input_vector,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor


_BAYES_FAMILY_VARIANTS: dict[str, dict[str, float | str]] = {
    "greybox_hazard_bayesfamily": {
        "model_name": "greybox_hazard_bayesfamily_v01",
        "global_anchor_weight": 0.45,
        "likelihood_scale": 0.30,
    },
    "greybox_hazard_bayesfamily_anchor35_scale10_v02": {
        "model_name": "greybox_hazard_bayesfamily_anchor35_scale10_v02",
        "global_anchor_weight": 0.35,
        "likelihood_scale": 0.10,
    },
    "greybox_hazard_bayesfamily_anchor35_scale30_v03": {
        "model_name": "greybox_hazard_bayesfamily_anchor35_scale30_v03",
        "global_anchor_weight": 0.35,
        "likelihood_scale": 0.30,
    },
}


def _normalize_weights(logits: np.ndarray) -> np.ndarray:
    centered = np.asarray(logits, dtype=np.float64) - float(np.max(logits))
    weights = np.exp(np.clip(centered, -60.0, 60.0))
    return np.asarray(weights / np.maximum(np.sum(weights), 1e-12), dtype=np.float64)


def _raw_prediction_bundle_from_coefficients(
    *,
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    prior_bundle: PredictionBundle,
    teacher,
    coefficient_vector: np.ndarray,
    prior_blend: float,
    model_name: str,
) -> PredictionBundle:
    del features
    predictions_by_seed: dict[int, np.ndarray] = {}
    for seed_index in range(round_detail.seeds_count):
        teacher_prediction = teacher._decode_terminal_tensor(
            _teacher_seed_adapter(round_detail, seed_index),
            coefficient_vector,
        )
        prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        prediction = (
            ((1.0 - prior_blend) * teacher_prediction) + (prior_blend * prior)
            if prior_blend > 0.0
            else np.asarray(teacher_prediction, dtype=np.float64)
        )
        predictions_by_seed[seed_index] = np.asarray(prediction, dtype=np.float64)
    return PredictionBundle(
        round_id=round_detail.id,
        model_name=model_name,
        predictions_by_seed=predictions_by_seed,
    )


def _raw_lowrank_prediction_bundle_from_derived(
    predictor: GreyboxHazardLowRankPredictor,
    *,
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    prior_bundle: PredictionBundle,
    derived: object,
    model_name: str,
) -> PredictionBundle:
    feature_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
    standardized = (feature_vector - predictor.feature_mean) / predictor.feature_scale
    coords = np.asarray(
        predictor.coord_intercept + standardized @ predictor.coord_weights,
        dtype=np.float64,
    )
    coords = np.clip(coords, predictor.coord_low, predictor.coord_high)
    coefficient_vector = np.asarray(
        predictor.coefficient_mean + (coords @ predictor.coefficient_basis),
        dtype=np.float64,
    )
    return _raw_prediction_bundle_from_coefficients(
        round_detail=round_detail,
        features=features,
        prior_bundle=prior_bundle,
        teacher=predictor.teacher,
        coefficient_vector=coefficient_vector,
        prior_blend=predictor.prior_blend,
        model_name=model_name,
    )


def _evidence_weight_map(
    prior_prediction: np.ndarray,
    *,
    entropy_floor: float,
) -> np.ndarray:
    normalized_entropy = np.asarray(entropy_map(prior_prediction), dtype=np.float64) / math.log(6.0)
    return np.asarray(
        entropy_floor + ((1.0 - entropy_floor) * normalized_entropy),
        dtype=np.float64,
    )


def _bundle_log_likelihood(
    bundle: PredictionBundle,
    *,
    exact_counts: dict[int, np.ndarray],
    evidence_weights: dict[int, np.ndarray],
    probability_floor: float,
) -> float:
    total = 0.0
    for seed_index, counts in exact_counts.items():
        prediction = np.asarray(bundle.predictions_by_seed[seed_index], dtype=np.float64)
        log_probs = np.log(np.maximum(prediction, probability_floor))
        total += float(
            np.sum(
                np.asarray(counts, dtype=np.float64)
                * log_probs
                * evidence_weights[seed_index][..., None],
            ),
        )
    return total


def bayesfamily_model_names() -> tuple[str, ...]:
    return tuple(_BAYES_FAMILY_VARIANTS)


def fit_named_bayesfamily_predictor(
    model_name: str,
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str] | None = None,
    policy_name: str = "coverage",
    samples_per_round: int = 4,
) -> "GreyboxHazardBayesFamilyPredictor":
    normalized = model_name.strip().lower()
    config = _BAYES_FAMILY_VARIANTS.get(normalized)
    if config is None:
        available = ", ".join(sorted(_BAYES_FAMILY_VARIANTS))
        raise ValueError(f"unsupported bayesfamily model '{model_name}'; available: {available}")
    return GreyboxHazardBayesFamilyPredictor.fit_from_workspace(
        paths,
        round_ids=round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        global_anchor_weight=float(config["global_anchor_weight"]),
        likelihood_scale=float(config["likelihood_scale"]),
        model_name=str(config["model_name"]),
    )


class GreyboxHazardBayesFamilyPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_bayesfamily_v01"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    global_anchor_weight: float = Field(default=0.45, ge=0.0, le=1.0)
    likelihood_scale: float = Field(default=0.30, ge=0.0)
    evidence_entropy_floor: float = Field(default=0.15, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    expert_round_ids: tuple[str, ...] = ()
    expert_coefficients: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    expert_prior_logits: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    training_example_count: int = Field(default=0, ge=0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        prior_blend: float = 0.35,
        global_anchor_weight: float = 0.45,
        likelihood_scale: float = 0.30,
        evidence_entropy_floor: float = 0.15,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_bayesfamily_v01",
    ) -> GreyboxHazardBayesFamilyPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        lowrank_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            prior_blend=prior_blend,
            model_name=f"{model_name}__lowrank",
        )
        coefficient_rows = [
            fit_round_semimechanistic_coefficients(build_round_episode(paths, round_id))
            for round_id in selected_round_ids
        ]
        coefficient_matrix = np.stack(
            [row.combined_vector() for row in coefficient_rows],
            axis=0,
        ).astype(np.float64)
        bank_expert_count = int(coefficient_matrix.shape[0])
        if bank_expert_count <= 0:
            raise ValueError("bayes-family predictor requires at least one replay-backed round expert")
        anchor_mass = float(np.clip(global_anchor_weight, 1e-6, 1.0))
        bank_mass = max(1.0 - anchor_mass, 1e-6)
        expert_prior_logits = np.concatenate(
            [
                np.asarray([math.log(anchor_mass)], dtype=np.float64),
                np.full(bank_expert_count, math.log(bank_mass / float(bank_expert_count)), dtype=np.float64),
            ],
            axis=0,
        )
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            prior_blend=prior_blend,
            global_anchor_weight=global_anchor_weight,
            likelihood_scale=likelihood_scale,
            evidence_entropy_floor=evidence_entropy_floor,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            expert_round_ids=tuple(selected_round_ids),
            expert_coefficients=np.asarray(coefficient_matrix, dtype=np.float64),
            expert_prior_logits=np.asarray(expert_prior_logits, dtype=np.float64),
            training_example_count=bank_expert_count,
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        exact_counts = {
            seed_index: np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
            for seed_index in range(round_detail.seeds_count)
        }
        evidence_weights = {
            seed_index: _evidence_weight_map(
                np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64),
                entropy_floor=self.evidence_entropy_floor,
            )
            for seed_index in range(round_detail.seeds_count)
        }

        expert_bundles = [
            _raw_lowrank_prediction_bundle_from_derived(
                self.lowrank_predictor,
                round_detail=round_detail,
                features=features,
                prior_bundle=prior_bundle,
                derived=derived,
                model_name=f"{self.name}__lowrank_anchor",
            ),
        ]
        expert_bundles.extend(
            _raw_prediction_bundle_from_coefficients(
                round_detail=round_detail,
                features=features,
                prior_bundle=prior_bundle,
                teacher=self.lowrank_predictor.teacher,
                coefficient_vector=np.asarray(coefficient_vector, dtype=np.float64),
                prior_blend=self.prior_blend,
                model_name=f"{self.name}__expert_{round_id}",
            )
            for round_id, coefficient_vector in zip(
                self.expert_round_ids,
                self.expert_coefficients,
                strict=True,
            )
        )
        log_likelihoods = np.asarray(
            [
                _bundle_log_likelihood(
                    bundle,
                    exact_counts=exact_counts,
                    evidence_weights=evidence_weights,
                    probability_floor=self.probability_floor,
                )
                for bundle in expert_bundles
            ],
            dtype=np.float64,
        )
        posterior_weights = _normalize_weights(
            self.expert_prior_logits + (self.likelihood_scale * log_likelihoods),
        )

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            stacked = np.stack(
                [
                    np.asarray(bundle.predictions_by_seed[seed_index], dtype=np.float64)
                    for bundle in expert_bundles
                ],
                axis=0,
            )
            mixture_prediction = np.tensordot(posterior_weights, stacked, axes=(0, 0))
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            conditioned = _exact_cell_blend(
                np.asarray(mixture_prediction, dtype=np.float64),
                exact_counts[seed_index],
                prior,
                beta_min=self.beta_min,
                beta_scale=self.beta_scale,
            )
            predictions_by_seed[seed_index] = apply_probability_floor(
                np.asarray(conditioned, dtype=np.float64),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
        )
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            prior_bundle,
            _stats_from_observations(round_detail, context.observations),
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(round_detail, context.geometry_bundle, derived)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(round_detail, features, derived)
