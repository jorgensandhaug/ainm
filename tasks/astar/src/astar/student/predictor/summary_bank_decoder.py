from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import SummaryBankTeacherPredictor
from astar.teacher.regime.base import RegimePosteriorState


def _round_ids_with_replays_and_analyses(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    replay_round_ids = {
        item.name
        for item in paths.raw_dir.joinpath("replays").glob("*")
        if item.is_dir()
    }
    available = sorted(
        round_id
        for round_id in replay_round_ids
        if read_analysis_records(paths, round_id)
    )
    if round_ids is None:
        return available
    return [round_id for round_id in round_ids if round_id in available]


def _terrain_one_hot(initial_grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(initial_grid)
    return np.stack([(collapsed == class_index).astype(np.float64) for class_index in range(CLASS_COUNT)], axis=-1)


def _initial_settlement_maps(round_detail: RoundDetail, seed_index: int) -> tuple[np.ndarray, np.ndarray]:
    settlement_map = np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64)
    port_map = np.zeros((round_detail.map_height, round_detail.map_width), dtype=np.float64)
    for settlement in round_detail.initial_states[seed_index].settlements:
        settlement_map[settlement.y, settlement.x] = 1.0
        if settlement.has_port:
            port_map[settlement.y, settlement.x] = 1.0
    return settlement_map, port_map


def _spatial_basis(
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    seed_index: int,
) -> tuple[list[str], np.ndarray]:
    initial_grid = np.asarray(round_detail.initial_states[seed_index].grid, dtype=np.int64)
    seed_features = features.per_seed[seed_index]
    settlement_map, port_map = _initial_settlement_maps(round_detail, seed_index)
    names = [
        *[f"terrain_{class_name}" for class_name in CLASS_NAMES],
        "initial_settlement",
        "initial_port",
        "buildable",
        "coast",
        "settlement_proximity",
        "maritime_access",
        "frontier_score",
        "forest_density",
        "mountain_density",
    ]
    stack = np.concatenate(
        [
            _terrain_one_hot(initial_grid),
            settlement_map[..., None],
            port_map[..., None],
            seed_features.feature("buildable")[..., None],
            seed_features.feature("coast")[..., None],
            seed_features.feature("settlement_proximity")[..., None],
            seed_features.feature("maritime_access")[..., None],
            seed_features.feature("frontier_score")[..., None],
            seed_features.feature("forest_density")[..., None],
            seed_features.feature("mountain_density")[..., None],
        ],
        axis=-1,
    )
    return names, np.asarray(stack, dtype=np.float64)


def _decoder_design_tensor(
    spatial_basis: np.ndarray,
    prior_prediction: np.ndarray,
    regime_vector: np.ndarray,
    *,
    teacher_prediction: np.ndarray | None,
) -> tuple[list[str], np.ndarray]:
    regime_array = np.asarray(regime_vector, dtype=np.float64)
    prior_logits = np.log(np.maximum(np.asarray(prior_prediction, dtype=np.float64), 1.0e-6))
    components = [spatial_basis, prior_logits]
    names = [
        *[f"spatial_{index}" for index in range(spatial_basis.shape[-1])],
        *[f"prior_logit_{class_name}" for class_name in CLASS_NAMES],
    ]
    if teacher_prediction is not None:
        teacher_logits = np.log(np.maximum(np.asarray(teacher_prediction, dtype=np.float64), 1.0e-6))
        components.append(teacher_logits)
        names.extend([f"teacher_logit_{class_name}" for class_name in CLASS_NAMES])
    regime_maps = np.broadcast_to(regime_array, spatial_basis.shape[:2] + (regime_array.shape[0],))
    components.append(regime_maps)
    names.extend([f"regime_{index}" for index in range(regime_array.shape[0])])
    interaction_tensor = (
        spatial_basis[..., :, None] * regime_array[None, None, None, :]
    ).reshape(spatial_basis.shape[0], spatial_basis.shape[1], -1)
    components.append(interaction_tensor)
    names.extend(
        [
            f"spatial_{spatial_index}__x__regime_{regime_index}"
            for spatial_index in range(spatial_basis.shape[-1])
            for regime_index in range(regime_array.shape[0])
        ],
    )
    return names, np.concatenate(components, axis=-1)


def _weighted_standardize(features: np.ndarray, weights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    weight_total = max(float(np.sum(weights)), 1.0e-12)
    means = np.sum(features * weights[:, None], axis=0) / weight_total
    centered = features - means[None, :]
    variances = np.sum((centered**2) * weights[:, None], axis=0) / weight_total
    scales = np.sqrt(np.maximum(variances, 1.0e-6))
    return means, scales


def _fit_weighted_ridge(
    features: np.ndarray,
    targets: np.ndarray,
    weights: np.ndarray,
    *,
    ridge_lambda: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    means, scales = _weighted_standardize(features, weights)
    normalized = (features - means[None, :]) / scales[None, :]
    design = np.concatenate([np.ones((normalized.shape[0], 1), dtype=np.float64), normalized], axis=1)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ (design * weights[:, None]) + ridge_lambda * penalty
    rhs = design.T @ (targets * weights[:, None])
    solution = np.linalg.pinv(lhs) @ rhs
    return (
        np.asarray(solution[0], dtype=np.float64),
        np.asarray(solution[1:], dtype=np.float64),
        means,
        scales,
    )


class SummaryBankDecoderPredictor(BaseRoundPredictor):
    name: str = "f1_summary_bank_decoder_v01"
    summary_bank: SummaryBankTeacherPredictor
    base_predictor: HistoricalBucketPriorPredictor
    feature_names: list[str] = Field(default_factory=list)
    decoder_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(CLASS_COUNT, dtype=np.float64))
    decoder_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, CLASS_COUNT), dtype=np.float64))
    feature_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    include_teacher_logits: bool = False
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)

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
        model_name: str = "f1_summary_bank_decoder_v01",
        probability_floor: float = 0.01,
        ridge_lambda: float = 12.0,
        include_teacher_logits: bool = False,
        synthetic_dataset_name: str | None = None,
    ) -> SummaryBankDecoderPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary bank decoder requires at least two replay-backed analyzed rounds")

        summary_bank = SummaryBankTeacherPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            model_name=f"{model_name}__summary_bank",
            probability_floor=probability_floor,
            synthetic_dataset_name=synthetic_dataset_name,
        )
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )

        design_rows: list[np.ndarray] = []
        target_rows: list[np.ndarray] = []
        weight_rows: list[np.ndarray] = []
        feature_names: list[str] | None = None

        for round_id in selected_round_ids:
            round_detail = read_round_record(paths, round_id).round
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            features = compute_round_features(round_detail)
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
            exact_regime = summary_bank.teacher.encode_round(build_round_episode(paths, round_id))
            exact_posterior = RegimePosteriorState(mean=np.asarray(exact_regime, dtype=np.float64))
            teacher_predictions: dict[int, np.ndarray] = {}
            if include_teacher_logits:
                round_context = build_round_context_from_detail(round_detail)
                teacher_predictions = {
                    seed.seed_index: summary_bank.teacher.posterior_predictive(seed, exact_posterior)
                    for seed in round_context.seeds
                }
            for seed_index, analysis_record in sorted(analyses.items()):
                spatial_names, spatial_basis = _spatial_basis(round_detail, features, seed_index)
                del spatial_names
                teacher_prediction = teacher_predictions.get(seed_index) if include_teacher_logits else None
                feature_names, design_tensor = _decoder_design_tensor(
                    spatial_basis,
                    prior_bundle.predictions_by_seed[seed_index],
                    exact_regime,
                    teacher_prediction=teacher_prediction,
                )
                ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                prior_logits = np.log(
                    np.maximum(np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64), 1.0e-6),
                )
                target_delta = np.log(np.maximum(ground_truth, 1.0e-6)) - prior_logits
                cell_weights = entropy_map(ground_truth).reshape(-1) + 0.05
                design_rows.append(design_tensor.reshape(-1, design_tensor.shape[-1]))
                target_rows.append(target_delta.reshape(-1, CLASS_COUNT))
                weight_rows.append(cell_weights.astype(np.float64))

        if not design_rows or feature_names is None:
            raise ValueError("summary bank decoder fit produced no training rows")

        design_matrix = np.concatenate(design_rows, axis=0)
        targets = np.concatenate(target_rows, axis=0)
        weights = np.concatenate(weight_rows, axis=0)
        intercept, decoder_weights, means, scales = _fit_weighted_ridge(
            design_matrix,
            targets,
            weights,
            ridge_lambda=ridge_lambda,
        )
        return cls(
            name=model_name,
            summary_bank=summary_bank,
            base_predictor=base_predictor,
            feature_names=feature_names,
            decoder_intercept=intercept,
            decoder_weights=decoder_weights,
            feature_means=means,
            feature_scales=scales,
            include_teacher_logits=include_teacher_logits,
            probability_floor=probability_floor,
        )

    def _predict_delta(self, design_tensor: np.ndarray) -> np.ndarray:
        normalized = (design_tensor - self.feature_means[None, None, :]) / self.feature_scales[None, None, :]
        return self.decoder_intercept[None, None, :] + np.tensordot(
            normalized,
            self.decoder_weights,
            axes=([2], [0]),
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        base_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        posterior = self.summary_bank.infer_regime(evidence)
        regime_vector = np.asarray(posterior.mean, dtype=np.float64)
        teacher_predictions: dict[int, np.ndarray] = {}
        if self.include_teacher_logits:
            round_context = build_round_context_from_detail(round_detail)
            teacher_predictions = {
                seed.seed_index: self.summary_bank.teacher.posterior_predictive(seed, posterior)
                for seed in round_context.seeds
            }
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            _, spatial_basis = _spatial_basis(round_detail, features, seed_index)
            _, design_tensor = _decoder_design_tensor(
                spatial_basis,
                base_bundle.predictions_by_seed[seed_index],
                regime_vector,
                teacher_prediction=teacher_predictions.get(seed_index) if self.include_teacher_logits else None,
            )
            prior_logits = np.log(np.maximum(base_bundle.predictions_by_seed[seed_index], 1.0e-6))
            logits = prior_logits + self._predict_delta(design_tensor)
            predictions_by_seed[seed_index] = apply_probability_floor(
                softmax_logits(logits),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryBankDecoderPredictor"]
