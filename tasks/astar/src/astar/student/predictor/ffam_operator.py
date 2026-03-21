from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.ffam_operator_config import (
    FFAMOperatorConfig,
    resolve_ffam_operator_config,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    LOG_FLOOR_DENOM,
    _build_static_feature_stack,
    _derive_transcript_features_from_stats,
    _ensure_synthetic_dataset,
    _fit_linear_map,
    _regime_input_names,
    _regime_input_vector,
    _regime_interaction_names,
    _regime_interaction_tensor,
    _regime_summary_names,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _select_training_cells,
    _static_feature_names,
    _stats_from_observations,
    _stats_from_seed_evidence,
    _teacher_seed_adapter,
)
from astar.student.predictor.query_residual_config import RegimeInputVariant
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


def _operator_feature_names() -> list[str]:
    names = _static_feature_names()
    names.extend([f"prior_logit_{class_name}" for class_name in CLASS_NAMES])
    names.extend([f"teacher_logit_{class_name}" for class_name in CLASS_NAMES])
    names.extend(_regime_summary_names())
    names.extend(_regime_interaction_names())
    return names


def _compose_operator_design_tensor(
    static_stack: np.ndarray,
    prior: np.ndarray,
    teacher_prior: np.ndarray,
    regime_vector: np.ndarray,
    *,
    probability_floor: float,
) -> np.ndarray:
    height, width = prior.shape[:2]
    regime_broadcast = np.broadcast_to(regime_vector, (height, width, len(regime_vector)))
    prior_logits = _safe_log_probs(prior, probability_floor) / LOG_FLOOR_DENOM
    teacher_logits = _safe_log_probs(teacher_prior, probability_floor) / LOG_FLOOR_DENOM
    regime_interaction = _regime_interaction_tensor(static_stack, regime_vector)
    return np.concatenate(
        [
            static_stack,
            prior_logits,
            teacher_logits,
            regime_broadcast,
            regime_interaction,
        ],
        axis=-1,
    ).astype(np.float64)


def _round_operator_vector(
    *,
    round_detail: RoundDetail,
    features: RoundFeatureBundle,
    prior_bundle: PredictionBundle,
    teacher: HazardTeacher,
    regime_vector: np.ndarray,
    analyses: dict[int, object],
    cells_per_seed: int,
    ridge_lambda: float,
    probability_floor: float,
) -> np.ndarray:
    feature_dim = len(_operator_feature_names())
    xtwx = np.zeros((feature_dim + 1, feature_dim + 1), dtype=np.float64)
    xtwy = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)

    for seed_index, analysis in analyses.items():
        ground_truth = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
        prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        teacher_prior = np.asarray(
            teacher.terminal_tensor(
                _teacher_seed_adapter(round_detail, seed_index),
                regime_vector,
            ),
            dtype=np.float64,
        )
        static_stack = _build_static_feature_stack(round_detail, features, seed_index)
        design = _compose_operator_design_tensor(
            static_stack,
            prior,
            teacher_prior,
            regime_vector,
            probability_floor=probability_floor,
        )
        flat_design = design.reshape(-1, feature_dim)
        target_delta = (
            _safe_log_probs(ground_truth, probability_floor) - _safe_log_probs(prior, probability_floor)
        ).reshape(-1, CLASS_COUNT)
        row_weights = (
            0.05 + np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1) / np.log(6.0)
        )
        selected = _select_training_cells(
            ground_truth,
            round_detail,
            seed_index,
            cells_per_seed=cells_per_seed,
        )
        batch_x = flat_design[selected]
        batch_y = target_delta[selected]
        batch_w = row_weights[selected]
        batch_aug = np.concatenate(
            [np.ones((batch_x.shape[0], 1), dtype=np.float64), batch_x],
            axis=1,
        )
        xtwx += batch_aug.T @ (batch_w[:, None] * batch_aug)
        xtwy += batch_aug.T @ (batch_w[:, None] * batch_y)

    regularizer = np.eye(feature_dim + 1, dtype=np.float64)
    regularizer[0, 0] = 0.0
    regularizer *= ridge_lambda
    solved = np.linalg.solve(xtwx + regularizer + 1e-6 * np.eye(feature_dim + 1), xtwy)
    intercept = np.asarray(solved[0], dtype=np.float64)
    coefficients = np.asarray(solved[1:], dtype=np.float64)
    return np.concatenate([intercept, coefficients.reshape(-1)], axis=0).astype(np.float64)


def _split_combined_vector(
    combined_vector: np.ndarray,
    *,
    operator_feature_count: int,
) -> tuple[np.ndarray, np.ndarray]:
    operator_size = CLASS_COUNT + (operator_feature_count * CLASS_COUNT)
    operator_vector = np.asarray(combined_vector[:operator_size], dtype=np.float64)
    regime_vector = np.asarray(combined_vector[operator_size:], dtype=np.float64)
    return operator_vector, regime_vector


def _split_operator_vector(
    operator_vector: np.ndarray,
    *,
    operator_feature_count: int,
) -> tuple[np.ndarray, np.ndarray]:
    intercept = np.asarray(operator_vector[:CLASS_COUNT], dtype=np.float64)
    coefficients = np.asarray(
        operator_vector[CLASS_COUNT:].reshape(operator_feature_count, CLASS_COUNT),
        dtype=np.float64,
    )
    return intercept, coefficients


class FFAMOperatorPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    cells_per_seed: int = Field(ge=1)
    budget_prefixes: list[int]
    operator_ridge_lambda: float = Field(ge=0.0)
    posterior_ridge_lambda: float = Field(gt=0.0)
    projected_operator_dim: int = Field(ge=1)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    temperature: float = Field(gt=0.0)
    prior_blend: float = Field(ge=0.0, le=1.0)
    residual_class_scale: list[float]
    beta_min: float = Field(ge=0.0)
    beta_scale: float = Field(ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "base"
    posterior_method: str = "global_ridge"
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_retrieval_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    manifold_neighbor_count: int = Field(default=0, ge=0)
    manifold_bandwidth: float = Field(default=1.0, gt=0.0)
    manifold_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    operator_feature_names: list[str]
    regime_input_names: list[str]
    manifold_round_ids: list[str]
    operator_basis_path: str
    base_checkpoint_path: str
    teacher_checkpoint_path: str


class FFAMOperatorPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_operator_v1"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher
    policy_name: str = "exploration_r3"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=512, ge=1)
    budget_prefixes: tuple[int, ...] = (0, 5, 10, 20, 35, 50)
    operator_ridge_lambda: float = Field(default=8.0, ge=0.0)
    posterior_ridge_lambda: float = Field(default=8.0, gt=0.0)
    projected_operator_dim: int = Field(default=4, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.1, gt=0.0)
    prior_blend: float = Field(default=0.2, ge=0.0, le=1.0)
    residual_class_scale: np.ndarray = Field(
        default_factory=lambda: np.asarray([1.0, 0.7, 0.6, 0.6, 0.9, 1.0], dtype=np.float64),
    )
    beta_min: float = Field(default=2.0, ge=0.0)
    beta_scale: float = Field(default=8.0, ge=0.0)
    beta_repeat_discount: float = Field(default=0.0, ge=0.0)
    synthetic_dataset_version: str = "v2"
    regime_input_variant: RegimeInputVariant = "base"
    posterior_method: str = "global_ridge"
    posterior_metric_dim: int = Field(default=8, ge=1)
    posterior_neighbor_count: int = Field(default=16, ge=1)
    posterior_bandwidth: float = Field(default=1.0, gt=0.0)
    posterior_retrieval_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    posterior_ood_prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    manifold_neighbor_count: int = Field(default=0, ge=0)
    manifold_bandwidth: float = Field(default=1.0, gt=0.0)
    manifold_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    operator_feature_names: tuple[str, ...] = ()
    regime_input_names: tuple[str, ...] = ()
    manifold_round_ids: tuple[str, ...] = ()
    combined_mean_vector: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    combined_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    combined_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_input_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    posterior_input_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    posterior_metric_basis: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    posterior_metric_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    posterior_coord_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMOperatorPredictor:
        config = resolve_ffam_operator_config(
            model_name,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )
        return cls.fit_from_config(paths, config=config, round_ids=round_ids)

    @classmethod
    def fit_from_config(
        cls,
        paths: WorkspacePaths,
        *,
        config: FFAMOperatorConfig,
        round_ids: list[str] | None = None,
    ) -> FFAMOperatorPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("ffam operator requires at least one analyzed round with replay data")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )
        replay_episodes = [build_round_episode(paths, round_id) for round_id in selected_round_ids]
        teacher = HazardTeacher(name=f"{config.model_name}__hazard_teacher").fit(replay_episodes)

        round_cache: dict[str, dict[str, object]] = {}
        combined_rows: list[np.ndarray] = []
        manifold_round_ids: list[str] = []
        operator_feature_names = _operator_feature_names()
        regime_input_names = _regime_input_names(config.regime_input_variant)

        for round_id, episode in zip(selected_round_ids, replay_episodes, strict=True):
            round_detail = read_round_record(paths, round_id).round
            features = compute_round_features(round_detail)
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)
            regime_vector = np.asarray(teacher.encode_round(episode), dtype=np.float64)
            operator_vector = _round_operator_vector(
                round_detail=round_detail,
                features=features,
                prior_bundle=prior_bundle,
                teacher=teacher,
                regime_vector=regime_vector,
                analyses=analyses,
                cells_per_seed=config.cells_per_seed,
                ridge_lambda=config.operator_ridge_lambda,
                probability_floor=config.probability_floor,
            )
            combined_rows.append(np.concatenate([operator_vector, regime_vector], axis=0))
            manifold_round_ids.append(round_id)
            round_cache[round_id] = {
                "round_detail": round_detail,
                "features": features,
                "prior_bundle": prior_bundle,
            }

        if not combined_rows:
            raise ValueError("ffam operator found no analyzed rounds to fit operator bank")

        combined_bank = np.stack(combined_rows, axis=0).astype(np.float64)
        combined_mean_vector = np.mean(combined_bank, axis=0)
        centered = combined_bank - combined_mean_vector[None, :]
        _, _, vt_matrix = np.linalg.svd(centered, full_matrices=False)
        effective_dim = max(1, min(config.projected_operator_dim, vt_matrix.shape[0]))
        combined_basis = np.asarray(vt_matrix[:effective_dim], dtype=np.float64)
        combined_coord_bank = np.asarray(centered @ combined_basis.T, dtype=np.float64)

        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
            dataset_version=config.synthetic_dataset_version,
            round_ids=selected_round_ids,
        )
        index_table = pl.read_parquet(index_path).filter(pl.col("round_id").is_in(manifold_round_ids))
        rows = index_table.to_dicts()
        if not rows:
            raise ValueError("ffam operator synthetic transcript dataset is empty for selected rounds")

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        posterior_inputs: list[np.ndarray] = []
        posterior_targets: list[np.ndarray] = []
        coord_by_round = {
            round_id: combined_coord_bank[index]
            for index, round_id in enumerate(manifold_round_ids)
        }
        for row in rows:
            round_id = str(row["round_id"])
            if round_id not in round_cache or round_id not in coord_by_round:
                continue
            cached = round_cache[round_id]
            artifact = load_synthetic_episode(Path(str(row["episode_path"])))
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(int(value), len(full_observations)) for value in config.budget_prefixes})
            for budget in budget_values:
                observations = full_observations[:budget]
                derived = _derive_transcript_features_from_stats(
                    cached["round_detail"],  # type: ignore[arg-type]
                    cached["features"],  # type: ignore[arg-type]
                    cached["prior_bundle"],  # type: ignore[arg-type]
                    _stats_from_observations(cached["round_detail"], observations),  # type: ignore[arg-type]
                    blur_sigmas=DEFAULT_BLUR_SIGMAS,
                )
                posterior_inputs.append(
                    _regime_input_vector(
                        derived,
                        variant=config.regime_input_variant,
                    ),
                )
                posterior_targets.append(np.asarray(coord_by_round[round_id], dtype=np.float64))

        posterior_input_matrix = np.stack(posterior_inputs, axis=0).astype(np.float64)
        posterior_target_matrix = np.stack(posterior_targets, axis=0).astype(np.float64)
        posterior_intercept, posterior_weights = _fit_linear_map(
            posterior_input_matrix,
            posterior_target_matrix,
            ridge_alpha=config.posterior_ridge_lambda,
        )
        posterior_input_mean = np.mean(posterior_input_matrix, axis=0)
        posterior_input_scale = np.std(posterior_input_matrix, axis=0)
        posterior_input_scale = np.where(posterior_input_scale > 1e-6, posterior_input_scale, 1.0)
        posterior_metric_basis = np.zeros((1, posterior_input_matrix.shape[1]), dtype=np.float64)
        posterior_metric_bank = np.zeros((posterior_input_matrix.shape[0], 1), dtype=np.float64)
        posterior_coord_bank = np.asarray(posterior_target_matrix, dtype=np.float64)
        if config.posterior_method == "local_linear":
            standardized_inputs = (posterior_input_matrix - posterior_input_mean[None, :]) / posterior_input_scale[
                None, :
            ]
            _, _, posterior_vt = np.linalg.svd(standardized_inputs, full_matrices=False)
            metric_dim = max(1, min(config.posterior_metric_dim, posterior_vt.shape[0]))
            posterior_metric_basis = np.asarray(posterior_vt[:metric_dim], dtype=np.float64)
            posterior_metric_bank = np.asarray(
                standardized_inputs @ posterior_metric_basis.T,
                dtype=np.float64,
            )
        return cls(
            name=config.model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=config.policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=config.samples_per_round,
            cells_per_seed=config.cells_per_seed,
            budget_prefixes=tuple(int(item) for item in config.budget_prefixes),
            operator_ridge_lambda=config.operator_ridge_lambda,
            posterior_ridge_lambda=config.posterior_ridge_lambda,
            projected_operator_dim=config.projected_operator_dim,
            probability_floor=config.probability_floor,
            temperature=config.temperature,
            prior_blend=config.prior_blend,
            residual_class_scale=np.asarray(config.residual_class_scale, dtype=np.float64),
            beta_min=config.beta_min,
            beta_scale=config.beta_scale,
            beta_repeat_discount=config.beta_repeat_discount,
            synthetic_dataset_version=config.synthetic_dataset_version,
            regime_input_variant=config.regime_input_variant,
            posterior_method=config.posterior_method,
            posterior_metric_dim=config.posterior_metric_dim,
            posterior_neighbor_count=config.posterior_neighbor_count,
            posterior_bandwidth=config.posterior_bandwidth,
            posterior_retrieval_blend=config.posterior_retrieval_blend,
            posterior_ood_prior_blend=config.posterior_ood_prior_blend,
            manifold_neighbor_count=config.manifold_neighbor_count,
            manifold_bandwidth=config.manifold_bandwidth,
            manifold_blend=config.manifold_blend,
            operator_feature_names=tuple(operator_feature_names),
            regime_input_names=tuple(regime_input_names),
            manifold_round_ids=tuple(manifold_round_ids),
            combined_mean_vector=np.asarray(combined_mean_vector, dtype=np.float64),
            combined_basis=np.asarray(combined_basis, dtype=np.float64),
            combined_coord_bank=np.asarray(combined_coord_bank, dtype=np.float64),
            posterior_intercept=np.asarray(posterior_intercept, dtype=np.float64),
            posterior_weights=np.asarray(posterior_weights, dtype=np.float64),
            posterior_input_mean=np.asarray(posterior_input_mean, dtype=np.float64),
            posterior_input_scale=np.asarray(posterior_input_scale, dtype=np.float64),
            posterior_metric_basis=np.asarray(posterior_metric_basis, dtype=np.float64),
            posterior_metric_bank=np.asarray(posterior_metric_bank, dtype=np.float64),
            posterior_coord_bank=np.asarray(posterior_coord_bank, dtype=np.float64),
        )

    def checkpoint(
        self,
        *,
        operator_basis_path: Path,
        base_checkpoint_path: Path,
        teacher_checkpoint_path: Path,
    ) -> FFAMOperatorPredictorCheckpoint:
        return FFAMOperatorPredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            cells_per_seed=self.cells_per_seed,
            budget_prefixes=list(self.budget_prefixes),
            operator_ridge_lambda=self.operator_ridge_lambda,
            posterior_ridge_lambda=self.posterior_ridge_lambda,
            projected_operator_dim=self.projected_operator_dim,
            probability_floor=self.probability_floor,
            temperature=self.temperature,
            prior_blend=self.prior_blend,
            residual_class_scale=np.asarray(self.residual_class_scale, dtype=np.float64).tolist(),
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            beta_repeat_discount=self.beta_repeat_discount,
            synthetic_dataset_version=self.synthetic_dataset_version,
            regime_input_variant=self.regime_input_variant,
            posterior_method=self.posterior_method,
            posterior_metric_dim=self.posterior_metric_dim,
            posterior_neighbor_count=self.posterior_neighbor_count,
            posterior_bandwidth=self.posterior_bandwidth,
            posterior_retrieval_blend=self.posterior_retrieval_blend,
            posterior_ood_prior_blend=self.posterior_ood_prior_blend,
            manifold_neighbor_count=self.manifold_neighbor_count,
            manifold_bandwidth=self.manifold_bandwidth,
            manifold_blend=self.manifold_blend,
            operator_feature_names=list(self.operator_feature_names),
            regime_input_names=list(self.regime_input_names),
            manifold_round_ids=list(self.manifold_round_ids),
            operator_basis_path=str(operator_basis_path),
            base_checkpoint_path=str(base_checkpoint_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        arrays_path = path.parent / "operator_basis.npz"
        np.savez_compressed(
            arrays_path,
            combined_mean_vector=self.combined_mean_vector,
            combined_basis=self.combined_basis,
            combined_coord_bank=self.combined_coord_bank,
            posterior_intercept=self.posterior_intercept,
            posterior_weights=self.posterior_weights,
            posterior_input_mean=self.posterior_input_mean,
            posterior_input_scale=self.posterior_input_scale,
            posterior_metric_basis=self.posterior_metric_basis,
            posterior_metric_bank=self.posterior_metric_bank,
            posterior_coord_bank=self.posterior_coord_bank,
        )
        base_checkpoint_path = self.base_predictor.save_checkpoint(path.parent / "base_prior.json")
        teacher_checkpoint_path = self.teacher.save_checkpoint(path.parent / "hazard_teacher.json")
        path.write_text(
            json.dumps(
                to_jsonable(
                    self.checkpoint(
                        operator_basis_path=arrays_path,
                        base_checkpoint_path=base_checkpoint_path,
                        teacher_checkpoint_path=teacher_checkpoint_path,
                    ),
                ),
                indent=2,
            ),
            encoding="utf-8",
        )
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> FFAMOperatorPredictor:
        checkpoint = FFAMOperatorPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.operator_basis_path)
        posterior_input_mean = (
            np.asarray(arrays["posterior_input_mean"], dtype=np.float64)
            if "posterior_input_mean" in arrays.files
            else np.zeros(checkpoint.posterior_metric_dim, dtype=np.float64)
        )
        posterior_input_scale = (
            np.asarray(arrays["posterior_input_scale"], dtype=np.float64)
            if "posterior_input_scale" in arrays.files
            else np.ones_like(posterior_input_mean, dtype=np.float64)
        )
        posterior_metric_basis = (
            np.asarray(arrays["posterior_metric_basis"], dtype=np.float64)
            if "posterior_metric_basis" in arrays.files
            else np.zeros((1, posterior_input_mean.shape[0]), dtype=np.float64)
        )
        posterior_metric_bank = (
            np.asarray(arrays["posterior_metric_bank"], dtype=np.float64)
            if "posterior_metric_bank" in arrays.files
            else np.zeros((0, posterior_metric_basis.shape[0]), dtype=np.float64)
        )
        posterior_coord_bank = (
            np.asarray(arrays["posterior_coord_bank"], dtype=np.float64)
            if "posterior_coord_bank" in arrays.files
            else np.zeros((0, checkpoint.projected_operator_dim), dtype=np.float64)
        )
        return cls(
            name=checkpoint.name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(
                Path(checkpoint.base_checkpoint_path),
            ),
            teacher=HazardTeacher.load_checkpoint(Path(checkpoint.teacher_checkpoint_path)),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            cells_per_seed=checkpoint.cells_per_seed,
            budget_prefixes=tuple(checkpoint.budget_prefixes),
            operator_ridge_lambda=checkpoint.operator_ridge_lambda,
            posterior_ridge_lambda=checkpoint.posterior_ridge_lambda,
            projected_operator_dim=checkpoint.projected_operator_dim,
            probability_floor=checkpoint.probability_floor,
            temperature=checkpoint.temperature,
            prior_blend=checkpoint.prior_blend,
            residual_class_scale=np.asarray(checkpoint.residual_class_scale, dtype=np.float64),
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            beta_repeat_discount=checkpoint.beta_repeat_discount,
            synthetic_dataset_version=checkpoint.synthetic_dataset_version,
            regime_input_variant=checkpoint.regime_input_variant,
            posterior_method=checkpoint.posterior_method,
            posterior_metric_dim=checkpoint.posterior_metric_dim,
            posterior_neighbor_count=checkpoint.posterior_neighbor_count,
            posterior_bandwidth=checkpoint.posterior_bandwidth,
            posterior_retrieval_blend=checkpoint.posterior_retrieval_blend,
            posterior_ood_prior_blend=checkpoint.posterior_ood_prior_blend,
            manifold_neighbor_count=checkpoint.manifold_neighbor_count,
            manifold_bandwidth=checkpoint.manifold_bandwidth,
            manifold_blend=checkpoint.manifold_blend,
            operator_feature_names=tuple(checkpoint.operator_feature_names),
            regime_input_names=tuple(checkpoint.regime_input_names),
            manifold_round_ids=tuple(checkpoint.manifold_round_ids),
            combined_mean_vector=np.asarray(arrays["combined_mean_vector"], dtype=np.float64),
            combined_basis=np.asarray(arrays["combined_basis"], dtype=np.float64),
            combined_coord_bank=np.asarray(arrays["combined_coord_bank"], dtype=np.float64),
            posterior_intercept=np.asarray(arrays["posterior_intercept"], dtype=np.float64),
            posterior_weights=np.asarray(arrays["posterior_weights"], dtype=np.float64),
            posterior_input_mean=posterior_input_mean,
            posterior_input_scale=posterior_input_scale,
            posterior_metric_basis=posterior_metric_basis,
            posterior_metric_bank=posterior_metric_bank,
            posterior_coord_bank=posterior_coord_bank,
        )

    def _manifold_coords(self, raw_coords: np.ndarray) -> np.ndarray:
        if self.manifold_neighbor_count <= 0 or self.manifold_blend <= 0.0 or self.combined_coord_bank.size == 0:
            return np.asarray(raw_coords, dtype=np.float64)
        distances = np.linalg.norm(self.combined_coord_bank - raw_coords[None, :], axis=1)
        neighbor_count = min(int(self.manifold_neighbor_count), int(self.combined_coord_bank.shape[0]))
        indexes = np.argsort(distances)[:neighbor_count]
        local_distances = distances[indexes]
        weights = np.exp(-0.5 * np.square(local_distances / max(self.manifold_bandwidth, 1e-6)))
        weight_sum = float(np.sum(weights))
        if weight_sum <= 0.0 or not np.isfinite(weight_sum):
            weights = np.full(indexes.shape[0], 1.0 / float(indexes.shape[0]), dtype=np.float64)
        else:
            weights = weights / weight_sum
        manifold_coords = np.sum(weights[:, None] * self.combined_coord_bank[indexes], axis=0)
        return np.asarray(
            ((1.0 - self.manifold_blend) * raw_coords) + (self.manifold_blend * manifold_coords),
            dtype=np.float64,
        )

    def _posterior_metric_input(self, input_vector: np.ndarray) -> np.ndarray:
        if (
            self.posterior_metric_basis.size == 0
            or self.posterior_input_mean.size == 0
            or self.posterior_input_scale.size == 0
        ):
            return np.zeros(1, dtype=np.float64)
        standardized = (input_vector - self.posterior_input_mean) / np.maximum(self.posterior_input_scale, 1e-6)
        return np.asarray(standardized @ self.posterior_metric_basis.T, dtype=np.float64)

    def _predict_local_coords(self, input_vector: np.ndarray) -> tuple[np.ndarray, float]:
        if self.posterior_metric_bank.shape[0] == 0 or self.posterior_coord_bank.shape[0] == 0:
            global_coords = np.asarray(self.posterior_intercept + (input_vector @ self.posterior_weights), dtype=np.float64)
            return global_coords, 1.0
        metric_input = self._posterior_metric_input(input_vector)
        distances = np.linalg.norm(self.posterior_metric_bank - metric_input[None, :], axis=1)
        neighbor_count = min(int(self.posterior_neighbor_count), int(self.posterior_metric_bank.shape[0]))
        indexes = np.argsort(distances)[:neighbor_count]
        local_metric = np.asarray(self.posterior_metric_bank[indexes], dtype=np.float64)
        local_coords = np.asarray(self.posterior_coord_bank[indexes], dtype=np.float64)
        local_distances = np.asarray(distances[indexes], dtype=np.float64)
        weights = np.exp(-0.5 * np.square(local_distances / max(self.posterior_bandwidth, 1e-6)))
        weight_sum = float(np.sum(weights))
        if weight_sum <= 0.0 or not np.isfinite(weight_sum):
            weights = np.full(indexes.shape[0], 1.0 / max(indexes.shape[0], 1), dtype=np.float64)
        else:
            weights = weights / weight_sum
        retrieval_coords = np.sum(weights[:, None] * local_coords, axis=0)
        centered_metric = local_metric - metric_input[None, :]
        augmented = np.concatenate(
            [np.ones((centered_metric.shape[0], 1), dtype=np.float64), centered_metric],
            axis=1,
        )
        regularizer = np.eye(augmented.shape[1], dtype=np.float64)
        regularizer[0, 0] = 0.0
        solved = np.linalg.solve(
            augmented.T @ (weights[:, None] * augmented)
            + (self.posterior_ridge_lambda * regularizer)
            + 1e-6 * np.eye(augmented.shape[1], dtype=np.float64),
            augmented.T @ (weights[:, None] * local_coords),
        )
        local_linear_coords = np.asarray(solved[0], dtype=np.float64)
        blended_coords = np.asarray(
            ((1.0 - self.posterior_retrieval_blend) * local_linear_coords)
            + (self.posterior_retrieval_blend * retrieval_coords),
            dtype=np.float64,
        )
        confidence = float(
            np.exp(
                -0.5
                * np.square(
                    float(np.mean(local_distances[: max(1, min(3, local_distances.shape[0]))]))
                    / max(self.posterior_bandwidth, 1e-6),
                ),
            ),
        )
        return blended_coords, float(np.clip(confidence, 0.0, 1.0))

    def _predict_combined_vector(self, derived) -> tuple[np.ndarray, np.ndarray, float]:
        input_vector = _regime_input_vector(
            derived,
            variant=self.regime_input_variant,
        )
        if self.posterior_method == "local_linear":
            raw_coords, confidence = self._predict_local_coords(input_vector)
        else:
            raw_coords = np.asarray(
                self.posterior_intercept + (input_vector @ self.posterior_weights),
                dtype=np.float64,
            )
            confidence = 1.0
        coords = self._manifold_coords(raw_coords)
        combined_vector = np.asarray(
            self.combined_mean_vector + coords @ self.combined_basis,
            dtype=np.float64,
        )
        operator_vector, regime_vector = _split_combined_vector(
            combined_vector,
            operator_feature_count=len(self.operator_feature_names),
        )
        return operator_vector, np.clip(regime_vector, -0.25, 1.25), confidence

    def _exact_cell_blend(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
        prior: np.ndarray,
    ) -> np.ndarray:
        count_total = np.sum(exact_counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prediction
        prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
        beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / np.log(6.0)))
        if self.beta_repeat_discount > 0.0:
            beta = beta / (1.0 + (self.beta_repeat_discount * np.maximum(count_total - 1.0, 0.0)))
        blended = np.where(
            count_total > 0.0,
            (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
            prediction,
        )
        return np.asarray(blended, dtype=np.float64)

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        operator_vector, regime_vector, posterior_confidence = self._predict_combined_vector(derived)
        intercept, coefficients = _split_operator_vector(
            operator_vector,
            operator_feature_count=len(self.operator_feature_names),
        )
        effective_prior_blend = min(
            1.0,
            self.prior_blend + (self.posterior_ood_prior_blend * (1.0 - posterior_confidence)),
        )
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            teacher_prior = np.asarray(
                self.teacher.terminal_tensor(
                    _teacher_seed_adapter(round_detail, seed_index),
                    regime_vector,
                ),
                dtype=np.float64,
            )
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)
            design = _compose_operator_design_tensor(
                static_stack,
                prior,
                teacher_prior,
                regime_vector,
                probability_floor=self.probability_floor,
            )
            flat_design = design.reshape(-1, len(self.operator_feature_names))
            delta = (intercept[None, :] + flat_design @ coefficients).reshape(prior.shape)
            delta *= np.asarray(self.residual_class_scale, dtype=np.float64)[None, None, :]
            logits = _safe_log_probs(prior, self.probability_floor) + np.clip(delta, -4.0, 4.0)
            prediction = softmax_logits(logits)
            prediction = self._exact_cell_blend(
                prediction,
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
            )
            if self.temperature != 1.0:
                prediction = softmax_logits(_safe_log_probs(prediction, self.probability_floor) / self.temperature)
            if effective_prior_blend > 0.0:
                prediction = ((1.0 - effective_prior_blend) * prediction) + (effective_prior_blend * prior)
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)
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
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            self.base_predictor.build_prediction_bundle(round_detail, context.geometry_bundle),
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
        if evidence is None or evidence.total_queries == 0:
            per_seed_stats = {
                seed_index: _stats_from_observations(round_detail, [])[seed_index]
                for seed_index in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {
                seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
                for seed_index in range(round_detail.seeds_count)
            }
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            self.base_predictor.build_prediction_bundle(round_detail, features),
            per_seed_stats,
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(round_detail, features, derived)


__all__ = ["FFAMOperatorPredictor", "FFAMOperatorPredictorCheckpoint"]
