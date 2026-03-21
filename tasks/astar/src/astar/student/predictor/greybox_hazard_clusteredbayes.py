from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.greybox_hazard_bayesfamily import (
    _bundle_log_likelihood,
    _evidence_weight_map,
    _normalize_weights,
    _raw_prediction_bundle_from_coefficients,
)
from astar.student.predictor.greybox_hazard_clusteredmanifold import (
    GreyboxHazardClusteredManifoldPredictor,
)
from astar.student.predictor.greybox_regime import (
    DEFAULT_BLUR_SIGMAS,
    _derive_transcript_features_from_stats,
    _derived_from_evidence,
    _exact_cell_blend,
    _stats_from_observations,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.calibrate import apply_probability_floor


class GreyboxHazardClusteredBayesPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_hazard_clusteredbayes_v01"
    clustered_predictor: GreyboxHazardClusteredManifoldPredictor
    likelihood_scale: float = Field(default=0.30, ge=0.0)
    evidence_entropy_floor: float = Field(default=0.15, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        likelihood_scale: float = 0.30,
        evidence_entropy_floor: float = 0.15,
        probability_floor: float = 0.01,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
        model_name: str = "greybox_hazard_clusteredbayes_v01",
    ) -> GreyboxHazardClusteredBayesPredictor:
        clustered_predictor = GreyboxHazardClusteredManifoldPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
            model_name=f"{model_name}__clusteredmanifold",
        )
        return cls(
            name=model_name,
            clustered_predictor=clustered_predictor,
            likelihood_scale=likelihood_scale,
            evidence_entropy_floor=evidence_entropy_floor,
            probability_floor=probability_floor,
            beta_min=beta_min,
            beta_scale=beta_scale,
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
    ) -> PredictionBundle:
        prior_bundle = self.clustered_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        standardized = self.clustered_predictor._standardized_feature_vector(derived)
        prior_logits = self.clustered_predictor._cluster_logits_from_standardized(standardized)
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
            _raw_prediction_bundle_from_coefficients(
                round_detail=round_detail,
                features=features,
                prior_bundle=prior_bundle,
                teacher=self.clustered_predictor.teacher,
                coefficient_vector=self.clustered_predictor._coefficient_vector_for_cluster(
                    cluster_index,
                    standardized,
                ),
                prior_blend=self.clustered_predictor.prior_blend,
                model_name=f"{self.name}__cluster_{cluster_index}",
            )
            for cluster_index in range(self.clustered_predictor.cluster_count)
        ]
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
        posterior_weights = _normalize_weights(prior_logits + (self.likelihood_scale * log_likelihoods))

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
        prior_bundle = self.clustered_predictor.base_predictor.build_prediction_bundle(
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
        prior_bundle = self.clustered_predictor.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(round_detail, features, derived)


__all__ = ["GreyboxHazardClusteredBayesPredictor"]
