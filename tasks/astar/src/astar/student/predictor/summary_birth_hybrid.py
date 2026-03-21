from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.birth_posterior import BirthPosteriorEventPredictor
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.heuristic import EventStructuralPriorPredictor, _neighbor_count
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import SummaryBankTeacherPredictor


class SummaryBirthHybridPredictor(BaseRoundPredictor):
    name: str = "f1_summary_birth_hybrid_t20_v01"
    structural_predictor: EventStructuralPriorPredictor = Field(
        default_factory=EventStructuralPriorPredictor,
    )
    birth_predictor: BirthPosteriorEventPredictor
    summary_predictor: SummaryBankTeacherPredictor
    reference_budget: int = Field(default=50, ge=1)
    teacher_gain: float = Field(default=0.20, ge=0.0)
    settlement_gain: float = Field(default=1.0, ge=0.0)
    port_gain: float = Field(default=1.0, ge=0.0)
    ruin_gain: float = Field(default=1.0, ge=0.0)
    forest_gain: float = Field(default=0.15, ge=0.0)
    delta_clip: float = Field(default=0.08, gt=0.0)
    birth_mode: str = "full_overlay"
    birth_local_gain: float = Field(default=1.0, ge=0.0)
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        budget: int = 50,
        samples_per_round: int = 4,
        k_neighbors: int = 7,
        birth_signal_scale: float = 1.10,
        birth_gain: float = 0.95,
        maritime_from_birth: float = 0.0,
        teacher_gain: float = 0.20,
        settlement_gain: float = 1.0,
        port_gain: float = 1.0,
        ruin_gain: float = 1.0,
        forest_gain: float = 0.15,
        delta_clip: float = 0.08,
        birth_mode: str = "full_overlay",
        birth_local_gain: float = 1.0,
        model_name: str = "f1_summary_birth_hybrid_t20_v01",
        probability_floor: float = 0.02,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        synthetic_dataset_name: str | None = None,
    ) -> SummaryBirthHybridPredictor:
        birth_predictor = BirthPosteriorEventPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            birth_signal_scale=birth_signal_scale,
            birth_gain=birth_gain,
            maritime_from_birth=maritime_from_birth,
            model_name=f"{model_name}__birth",
            probability_floor=probability_floor,
            birth_dataset_name=birth_dataset_name,
            synthetic_dataset_name=synthetic_dataset_name,
        )
        summary_predictor = SummaryBankTeacherPredictor.fit_from_workspace(
            paths,
            round_ids=round_ids,
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            model_name=f"{model_name}__summary",
            probability_floor=probability_floor,
            synthetic_dataset_name=synthetic_dataset_name,
        )
        return cls(
            name=model_name,
            structural_predictor=EventStructuralPriorPredictor(probability_floor=probability_floor),
            birth_predictor=birth_predictor,
            summary_predictor=summary_predictor,
            reference_budget=budget,
            teacher_gain=teacher_gain,
            settlement_gain=settlement_gain,
            port_gain=port_gain,
            ruin_gain=ruin_gain,
            forest_gain=forest_gain,
            delta_clip=delta_clip,
            birth_mode=birth_mode,
            birth_local_gain=birth_local_gain,
            probability_floor=probability_floor,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        structural_bundle = self.structural_predictor.build_prediction_bundle(round_detail, features)
        if evidence is None or evidence.total_queries == 0:
            return PredictionBundle(
                round_id=round_detail.id,
                model_name=self.name,
                predictions_by_seed=structural_bundle.predictions_by_seed,
            )

        teacher_bundle = self.summary_predictor.build_prediction_bundle(round_detail, evidence=evidence)
        birth_bundle = (
            self.birth_predictor.build_prediction_bundle(round_detail, features, evidence)
            if self.birth_mode == "full_overlay"
            else None
        )
        birth_signal = self.birth_predictor.infer_birth_signal(evidence)
        maritime_signal = birth_signal * self.birth_predictor.maritime_from_birth
        query_fraction = min(1.0, float(evidence.total_queries) / float(self.reference_budget))
        delta_scale = query_fraction * self.teacher_gain

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, structural_prediction in structural_bundle.predictions_by_seed.items():
            if self.birth_mode == "full_overlay":
                hybrid = np.asarray(
                    birth_bundle.predictions_by_seed[seed_index],  # type: ignore[union-attr]
                    dtype=np.float64,
                ).copy()
            else:
                hybrid = np.asarray(structural_prediction, dtype=np.float64).copy()
            teacher_prediction = np.asarray(teacher_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            teacher_delta = np.clip(
                teacher_prediction - structural_prediction,
                -self.delta_clip,
                self.delta_clip,
            )
            initial_state = round_detail.initial_states[seed_index]
            seed_features = features.per_seed[seed_index]
            buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
            coast = np.asarray(seed_features.feature("coast"), dtype=np.float64)
            land = np.asarray(seed_features.feature("land"), dtype=np.float64)
            if self.birth_mode == "signal_only":
                scored_grid = collapse_internal_grid(np.asarray(initial_state.grid, dtype=np.int64))
                settlement_proximity = np.asarray(
                    seed_features.feature("settlement_proximity"),
                    dtype=np.float64,
                )
                coastal_exposure = np.asarray(
                    seed_features.feature("coastal_exposure"),
                    dtype=np.float64,
                )
                maritime_access = np.asarray(
                    seed_features.feature("maritime_access"),
                    dtype=np.float64,
                )
                settlement_neighbors = _neighbor_count(scored_grid == 1).astype(np.float64) / 9.0
                port_neighbors = _neighbor_count(scored_grid == 2).astype(np.float64) / 9.0
                ruin_neighbors = _neighbor_count(scored_grid == 3).astype(np.float64) / 9.0
                birth_mask = buildable * (~np.isin(scored_grid, (1, 2, 3))).astype(np.float64)
                birth_support = birth_mask * (
                    0.95 * settlement_proximity
                    + 0.70 * settlement_neighbors
                    + 0.35 * port_neighbors
                    + 0.20 * ruin_neighbors
                )
                maritime_support = birth_mask * (
                    0.90 * coastal_exposure * maritime_access
                    + 0.50 * port_neighbors
                    + 0.20 * settlement_proximity
                )
                logits = np.log(np.maximum(hybrid, 1.0e-6))
                logits[..., 1] += self.birth_local_gain * birth_signal * birth_support
                logits[..., 2] += self.birth_local_gain * maritime_signal * maritime_support
                logits[..., 0] -= 0.35 * self.birth_local_gain * birth_signal * birth_mask
                shifted = logits - np.max(logits, axis=-1, keepdims=True)
                hybrid = np.exp(shifted)
                hybrid = hybrid / np.sum(hybrid, axis=-1, keepdims=True)

            hybrid[..., 1] += delta_scale * self.settlement_gain * teacher_delta[..., 1] * buildable
            hybrid[..., 2] += delta_scale * self.port_gain * teacher_delta[..., 2] * buildable * coast
            hybrid[..., 3] += delta_scale * self.ruin_gain * teacher_delta[..., 3] * buildable
            hybrid[..., 4] += delta_scale * self.forest_gain * teacher_delta[..., 4] * land

            hybrid = np.clip(hybrid, 1.0e-8, None)
            hybrid = hybrid / np.sum(hybrid, axis=-1, keepdims=True)
            predictions_by_seed[seed_index] = apply_probability_floor(
                hybrid,
                self.probability_floor,
            )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryBirthHybridPredictor"]
