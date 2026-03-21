from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import cellwise_kl_divergence, entropy_map, score_prediction
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.greybox_regime import (
    GreyboxHazardLowRankPredictor,
    _derived_from_evidence,
)
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    _ensure_synthetic_dataset,
    _regime_input_vector,
    _round_ids_with_analyses_and_replays,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.observe.evidence import RoundEvidenceBundle


DEFAULT_BUDGET_PREFIXES = (0, 5, 10, 20, 35, 50)
DEFAULT_BLEND_GRID = tuple(float(value) / 10.0 for value in range(11))
DEFAULT_GATE_RIDGE_ALPHA = 4.0
DEFAULT_LOWRANK_PRIOR_BLEND = 0.55
DEFAULT_GATE_FLOOR = 0.03
DEFAULT_GATE_CEILING = 0.97


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[float, np.ndarray]:
    design = np.concatenate(
        [np.ones((inputs.shape[0], 1), dtype=np.float64), inputs],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ targets.reshape(-1, 1)
    solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0, 0]), np.asarray(solution[1:, 0], dtype=np.float64)


def _standardize(matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(matrix, axis=0)
    scale = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-6, scale, 1.0)
    return (matrix - mean[None, :]) / scale[None, :], mean, scale


def _round_truths_by_seed(
    paths: WorkspacePaths,
    round_id: str,
) -> dict[int, np.ndarray]:
    analyses = read_analysis_records(paths, round_id)
    if not analyses:
        raise ValueError(f"round {round_id} has no saved analyses")
    return {
        seed_index: np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
        for seed_index, analysis in sorted(analyses.items())
    }


def _blend_prediction_bundles(
    lowrank_bundle: PredictionBundle,
    residual_bundle: PredictionBundle,
    *,
    lowrank_weight: float,
    model_name: str,
) -> PredictionBundle:
    predictions_by_seed: dict[int, np.ndarray] = {}
    for seed_index in lowrank_bundle.predictions_by_seed:
        lowrank_prediction = np.asarray(
            lowrank_bundle.predictions_by_seed[seed_index],
            dtype=np.float64,
        )
        residual_prediction = np.asarray(
            residual_bundle.predictions_by_seed[seed_index],
            dtype=np.float64,
        )
        predictions_by_seed[seed_index] = (
            (lowrank_weight * lowrank_prediction)
            + ((1.0 - lowrank_weight) * residual_prediction)
        )
    return PredictionBundle(
        round_id=lowrank_bundle.round_id,
        model_name=model_name,
        predictions_by_seed=predictions_by_seed,
    )


def _expert_disagreement_features(
    lowrank_bundle: PredictionBundle,
    residual_bundle: PredictionBundle,
) -> np.ndarray:
    per_seed_rows: list[np.ndarray] = []
    for seed_index in sorted(lowrank_bundle.predictions_by_seed):
        lowrank_prediction = np.asarray(
            lowrank_bundle.predictions_by_seed[seed_index],
            dtype=np.float64,
        )
        residual_prediction = np.asarray(
            residual_bundle.predictions_by_seed[seed_index],
            dtype=np.float64,
        )
        diff = lowrank_prediction - residual_prediction
        per_seed_rows.append(
            np.asarray(
                [
                    float(np.mean(np.abs(diff))),
                    float(np.mean(cellwise_kl_divergence(lowrank_prediction, residual_prediction))),
                    float(np.mean(cellwise_kl_divergence(residual_prediction, lowrank_prediction))),
                    float(np.mean(entropy_map(lowrank_prediction) - entropy_map(residual_prediction))),
                    *np.mean(diff, axis=(0, 1)).tolist(),
                    *np.std(diff, axis=(0, 1)).tolist(),
                ],
                dtype=np.float64,
            ),
        )
    if not per_seed_rows:
        return np.zeros(1, dtype=np.float64)
    per_seed_matrix = np.stack(per_seed_rows, axis=0)
    return np.concatenate(
        [
            np.mean(per_seed_matrix, axis=0),
            np.std(per_seed_matrix, axis=0),
        ],
        axis=0,
    )


def _gate_feature_vector(
    derived: object,
    lowrank_bundle: PredictionBundle,
    residual_bundle: PredictionBundle,
) -> np.ndarray:
    base_vector = np.asarray(_regime_input_vector(derived), dtype=np.float64)
    disagreement = _expert_disagreement_features(lowrank_bundle, residual_bundle)
    return np.concatenate([base_vector, disagreement], axis=0)


def _best_blend_weight(
    lowrank_bundle: PredictionBundle,
    residual_bundle: PredictionBundle,
    truths_by_seed: dict[int, np.ndarray],
    candidate_weights: Sequence[float],
) -> float:
    best_weight = float(candidate_weights[0])
    best_loss = math.inf
    for weight in candidate_weights:
        blended = _blend_prediction_bundles(
            lowrank_bundle,
            residual_bundle,
            lowrank_weight=float(weight),
            model_name=lowrank_bundle.model_name,
        )
        total_loss = 0.0
        for seed_index, truth in truths_by_seed.items():
            total_loss += score_prediction(truth, blended.predictions_by_seed[seed_index]).weighted_kl
        mean_loss = total_loss / float(len(truths_by_seed))
        if mean_loss < best_loss:
            best_loss = mean_loss
            best_weight = float(weight)
    return best_weight


def _target_logit(weight: float) -> float:
    clamped = float(np.clip(weight, DEFAULT_GATE_FLOOR, DEFAULT_GATE_CEILING))
    return float(np.log(clamped / (1.0 - clamped)))


def _sigmoid(value: float) -> float:
    if value >= 0.0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def _train_gate(
    feature_matrix: np.ndarray,
    target_weights: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    standardized, feature_mean, feature_scale = _standardize(feature_matrix)
    target_logits = np.asarray([_target_logit(float(weight)) for weight in target_weights], dtype=np.float64)
    intercept, weights = _fit_linear_map(
        standardized,
        target_logits,
        ridge_alpha=ridge_alpha,
    )
    return (
        np.asarray(feature_mean, dtype=np.float64),
        np.asarray(feature_scale, dtype=np.float64),
        np.asarray([intercept], dtype=np.float64),
        np.asarray(weights, dtype=np.float64),
    )


def _load_training_rows(
    paths: WorkspacePaths,
    *,
    selected_round_ids: Sequence[str],
    policy_name: str,
    samples_per_round: int,
) -> tuple[Path, list[dict[str, object]]]:
    dataset_round_ids = _round_ids_with_analyses_and_replays(paths)
    index_path = _ensure_synthetic_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=dataset_round_ids,
    )
    dataset_dir = index_path.parent
    rows = (
        pl.read_parquet(index_path)
        .filter(pl.col("round_id").is_in(list(selected_round_ids)))
        .to_dicts()
    )
    if not rows:
        raise ValueError("gated hybrid predictor synthetic transcript dataset is empty for selected rounds")
    return dataset_dir, rows


class GreyboxGatedHybridPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "greybox_gated_hybrid_v01"
    lowrank_predictor: GreyboxHazardLowRankPredictor
    residual_predictor: QueryResidualPredictor
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=4, ge=1)
    query_samples_per_round: int = Field(default=1, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    lowrank_prior_blend: float = Field(default=DEFAULT_LOWRANK_PRIOR_BLEND, ge=0.0, le=1.0)
    gate_ridge_alpha: float = Field(default=DEFAULT_GATE_RIDGE_ALPHA, ge=0.0)
    gate_floor: float = Field(default=DEFAULT_GATE_FLOOR, ge=0.0, le=1.0)
    gate_ceiling: float = Field(default=DEFAULT_GATE_CEILING, ge=0.0, le=1.0)
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    gate_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    gate_weights: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    training_example_count: int = Field(default=0, ge=0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 4,
        query_samples_per_round: int = 1,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        lowrank_prior_blend: float = DEFAULT_LOWRANK_PRIOR_BLEND,
        gate_ridge_alpha: float = DEFAULT_GATE_RIDGE_ALPHA,
        gate_floor: float = DEFAULT_GATE_FLOOR,
        gate_ceiling: float = DEFAULT_GATE_CEILING,
        model_name: str = "greybox_gated_hybrid_v01",
    ) -> GreyboxGatedHybridPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        lowrank_predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            prior_blend=lowrank_prior_blend,
            model_name=f"{model_name}__lowrank",
        )
        residual_predictor = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            samples_per_round=query_samples_per_round,
            model_name=f"{model_name}__queryres",
        )
        dataset_dir, rows = _load_training_rows(
            paths,
            selected_round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        feature_rows: list[np.ndarray] = []
        target_rows: list[float] = []
        round_cache: dict[str, tuple[RoundDetail, RoundFeatureBundle, PredictionBundle, dict[int, np.ndarray]]] = {}
        for row in rows:
            round_id = str(row["round_id"])
            cached = round_cache.get(round_id)
            if cached is None:
                round_detail = read_round_record(paths, round_id).round
                features = compute_round_features(round_detail)
                prior_bundle = lowrank_predictor.base_predictor.build_prediction_bundle(round_detail, features)
                truths_by_seed = _round_truths_by_seed(paths, round_id)
                cached = (round_detail, features, prior_bundle, truths_by_seed)
                round_cache[round_id] = cached
            round_detail, features, prior_bundle, truths_by_seed = cached

            artifact = load_synthetic_episode(
                Path(str(row["episode_path"])),
                dataset_dir=dataset_dir,
                workspace_root=paths.root,
            )
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in budget_prefixes})
            for budget in budget_values:
                evidence = build_round_evidence_from_observations(
                    round_detail,
                    full_observations[:budget],
                )
                derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
                lowrank_bundle = lowrank_predictor.build_prediction_bundle(round_detail, features, evidence)
                residual_bundle = residual_predictor.build_prediction_bundle(round_detail, features, evidence)
                feature_rows.append(
                    _gate_feature_vector(derived, lowrank_bundle, residual_bundle),
                )
                target_rows.append(
                    _best_blend_weight(
                        lowrank_bundle,
                        residual_bundle,
                        truths_by_seed,
                        DEFAULT_BLEND_GRID,
                    ),
                )

        feature_matrix = np.stack(feature_rows, axis=0)
        feature_mean, feature_scale, gate_intercept, gate_weights = _train_gate(
            feature_matrix,
            np.asarray(target_rows, dtype=np.float64),
            ridge_alpha=gate_ridge_alpha,
        )
        return cls(
            name=model_name,
            lowrank_predictor=lowrank_predictor,
            residual_predictor=residual_predictor,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            query_samples_per_round=query_samples_per_round,
            budget_prefixes=tuple(int(value) for value in budget_prefixes),
            lowrank_prior_blend=lowrank_prior_blend,
            gate_ridge_alpha=gate_ridge_alpha,
            gate_floor=gate_floor,
            gate_ceiling=gate_ceiling,
            feature_mean=np.asarray(feature_mean, dtype=np.float64),
            feature_scale=np.asarray(feature_scale, dtype=np.float64),
            gate_intercept=np.asarray(gate_intercept, dtype=np.float64),
            gate_weights=np.asarray(gate_weights, dtype=np.float64),
            training_example_count=int(feature_matrix.shape[0]),
        )

    def _infer_lowrank_weight(
        self,
        derived: object,
        lowrank_bundle: PredictionBundle,
        residual_bundle: PredictionBundle,
    ) -> float:
        feature_vector = _gate_feature_vector(derived, lowrank_bundle, residual_bundle)
        standardized = (feature_vector - self.feature_mean) / self.feature_scale
        raw_value = float(self.gate_intercept[0] + standardized @ self.gate_weights)
        gate_value = _sigmoid(raw_value)
        return float(np.clip(gate_value, self.gate_floor, self.gate_ceiling))

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: object,
        evidence: RoundEvidenceBundle | None,
    ) -> PredictionBundle:
        lowrank_bundle = self.lowrank_predictor.build_prediction_bundle(round_detail, features, evidence)
        residual_bundle = self.residual_predictor.build_prediction_bundle(round_detail, features, evidence)
        lowrank_weight = self._infer_lowrank_weight(derived, lowrank_bundle, residual_bundle)
        return _blend_prediction_bundles(
            lowrank_bundle,
            residual_bundle,
            lowrank_weight=lowrank_weight,
            model_name=self.name,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        evidence = build_round_evidence_from_observations(round_detail, context.observations)
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
        )
        derived = _derived_from_evidence(
            round_detail,
            context.geometry_bundle,
            prior_bundle,
            evidence,
        )
        return self._predict_from_derived(
            round_detail,
            context.geometry_bundle,
            derived,
            evidence,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.lowrank_predictor.base_predictor.build_prediction_bundle(
            round_detail,
            features,
        )
        derived = _derived_from_evidence(round_detail, features, prior_bundle, evidence)
        return self._predict_from_derived(
            round_detail,
            features,
            derived,
            evidence,
        )


__all__ = [
    "GreyboxGatedHybridPredictor",
]
