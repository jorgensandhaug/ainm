"""Pooled ridge regression predictor.

Fundamentally different from ffam_mode:
- No per-round operators
- No SVD manifold / mode coordinates
- No MLP posterior
- Single ridge regression on pooled cells from ALL training rounds
- Cell-level transcript features as direct regression inputs
- Target: logit delta from bucket prior
"""

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
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.ffam_knn import _extract_cell_transcript_features
from astar.student.predictor.ffam_pooled_config import FFAMPooledConfig, resolve_ffam_pooled_config
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    DEFAULT_BLUR_SIGMAS,
    LOG_FLOOR_DENOM,
    _build_static_feature_stack,
    _derive_transcript_features_from_stats,
    _ensure_synthetic_dataset,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _select_training_cells,
    _static_feature_names,
    _stats_from_observations,
    _stats_from_seed_evidence,
)
from astar.student.predictor.round import BaseRoundPredictor


class FFAMPooledPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int
    ridge_lambda: float
    probability_floor: float
    beta_min: float
    beta_scale: float
    spatial_smooth_sigma: float
    include_transcript_features: bool
    feature_names: list[str]
    arrays_path: str
    base_checkpoint_path: str


class FFAMPooledPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_pooled_v1"
    base_predictor: HistoricalBucketPriorPredictor
    policy_name: str = "exploration_r3"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=6, ge=1)
    ridge_lambda: float = Field(default=10.0, ge=0.0)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)
    beta_min: float = Field(default=12.0, ge=0.0)
    beta_scale: float = Field(default=48.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.3, ge=0.0)
    include_transcript_features: bool = True
    feature_names: tuple[str, ...] = ()

    # Regression coefficients
    intercept: np.ndarray = Field(default_factory=lambda: np.zeros(CLASS_COUNT, dtype=np.float64))
    coefficients: np.ndarray = Field(default_factory=lambda: np.zeros((1, CLASS_COUNT), dtype=np.float64))

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMPooledPredictor:
        config = resolve_ffam_pooled_config(
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
        config: FFAMPooledConfig,
        round_ids: list[str] | None = None,
    ) -> FFAMPooledPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("ffam pooled requires at least one analyzed round with replay data")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        # Feature names
        static_names = _static_feature_names()
        prior_logit_names = [f"prior_logit_{cn}" for cn in CLASS_NAMES]
        transcript_names = (
            ["tx_was_observed", "tx_log_count"]
            + [f"tx_cell_frac_{cn}" for cn in CLASS_NAMES]
            + ["tx_neighbor_density"]
            + [f"tx_neighbor_frac_{cn}" for cn in CLASS_NAMES]
        ) if config.include_transcript_features else []
        feature_names = static_names + prior_logit_names + transcript_names

        # Generate synthetic dataset
        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
            dataset_version=config.synthetic_dataset_version,
            round_ids=selected_round_ids,
        )
        index_table = pl.read_parquet(index_path).filter(
            pl.col("round_id").is_in(selected_round_ids)
        )
        rows = index_table.to_dicts()

        from astar.history.datasets.synthetic_live import load_synthetic_episode

        # Accumulate sufficient statistics (XtWX, XtWY) for ridge regression
        feature_dim = len(feature_names)
        xtwx = np.zeros((feature_dim + 1, feature_dim + 1), dtype=np.float64)
        xtwy = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)

        for row in rows:
            round_id = str(row["round_id"])
            round_detail = read_round_record(paths, round_id).round
            features = compute_round_features(round_detail)
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)

            # Load synthetic episode
            artifact = load_synthetic_episode(Path(str(row["episode_path"])))
            observations = tuple(artifact.observations)
            derived = _derive_transcript_features_from_stats(
                round_detail,
                features,
                prior_bundle,
                _stats_from_observations(round_detail, observations),
                blur_sigmas=DEFAULT_BLUR_SIGMAS,
            )

            for seed_index, analysis in analyses.items():
                ground_truth = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
                prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
                static_stack = _build_static_feature_stack(round_detail, features, seed_index)

                # Build feature tensor
                prior_logits = _safe_log_probs(prior, config.probability_floor) / LOG_FLOOR_DENOM
                base_features = np.concatenate([static_stack, prior_logits], axis=-1)

                if config.include_transcript_features:
                    exact_counts = np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
                    tx_features = _extract_cell_transcript_features(exact_counts)
                    cell_features = np.concatenate([base_features, tx_features], axis=-1)
                else:
                    cell_features = base_features

                # Target: logit delta from prior
                target_delta = (
                    _safe_log_probs(ground_truth, config.probability_floor)
                    - _safe_log_probs(prior, config.probability_floor)
                ).reshape(-1, CLASS_COUNT)

                # Entropy weight
                raw_entropy = np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1) / np.log(6.0)
                row_weights = 0.05 + np.clip(raw_entropy, 0.0, 1.0)

                # Cell selection
                selected = _select_training_cells(
                    ground_truth,
                    round_detail,
                    seed_index,
                    cells_per_seed=config.cells_per_seed,
                )
                flat_features = cell_features.reshape(-1, feature_dim)[selected]
                batch_y = target_delta[selected]
                batch_w = row_weights[selected]

                # Augment with intercept
                batch_aug = np.concatenate(
                    [np.ones((flat_features.shape[0], 1), dtype=np.float64), flat_features],
                    axis=1,
                )
                xtwx += batch_aug.T @ (batch_w[:, None] * batch_aug)
                xtwy += batch_aug.T @ (batch_w[:, None] * batch_y)

        # Solve ridge regression
        regularizer = np.eye(feature_dim + 1, dtype=np.float64)
        regularizer[0, 0] = 0.0
        regularizer *= config.ridge_lambda
        solved = np.linalg.solve(
            xtwx + regularizer + 1e-6 * np.eye(feature_dim + 1),
            xtwy,
        )
        intercept = np.asarray(solved[0], dtype=np.float64)
        coefficients = np.asarray(solved[1:], dtype=np.float64)

        return cls(
            name=config.model_name,
            base_predictor=base_predictor,
            policy_name=config.policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=config.samples_per_round,
            ridge_lambda=config.ridge_lambda,
            probability_floor=config.probability_floor,
            beta_min=config.beta_min,
            beta_scale=config.beta_scale,
            spatial_smooth_sigma=config.spatial_smooth_sigma,
            include_transcript_features=config.include_transcript_features,
            feature_names=tuple(feature_names),
            intercept=intercept,
            coefficients=coefficients,
        )

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived,
        *,
        prior_bundle: PredictionBundle | None = None,
    ) -> PredictionBundle:
        effective_prior_bundle = prior_bundle or self.base_predictor.build_prediction_bundle(round_detail, features)

        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            prior = np.asarray(effective_prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)

            # Build feature tensor
            prior_logits = _safe_log_probs(prior, self.probability_floor) / LOG_FLOOR_DENOM
            base_features = np.concatenate([static_stack, prior_logits], axis=-1)

            if self.include_transcript_features:
                exact_counts = np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
                tx_features = _extract_cell_transcript_features(exact_counts)
                cell_features = np.concatenate([base_features, tx_features], axis=-1)
            else:
                cell_features = base_features

            h, w = prior.shape[:2]
            flat_features = cell_features.reshape(-1, cell_features.shape[-1])

            # Apply regression
            delta = (self.intercept[None, :] + flat_features @ self.coefficients).reshape(h, w, CLASS_COUNT)

            # Apply delta to prior logits
            logits = _safe_log_probs(prior, self.probability_floor) + np.clip(delta, -4.0, 4.0)
            prediction = softmax_logits(logits)

            # Exact cell blend
            count_total = np.sum(
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                axis=-1, keepdims=True,
            )
            if np.any(count_total > 0.0):
                exact_counts = np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
                prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
                beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / np.log(6.0)))
                prediction = np.where(
                    count_total > 0.0,
                    (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
                    prediction,
                )

            # Spatial smoothing
            if self.spatial_smooth_sigma > 0:
                kernel_radius = max(1, int(3 * self.spatial_smooth_sigma))
                ax = np.arange(-kernel_radius, kernel_radius + 1, dtype=np.float64)
                kernel_1d = np.exp(-0.5 * (ax / self.spatial_smooth_sigma) ** 2)
                kernel_1d /= np.sum(kernel_1d)
                smoothed = prediction.copy()
                for c in range(prediction.shape[-1]):
                    channel = smoothed[..., c]
                    for row_idx in range(channel.shape[0]):
                        channel[row_idx] = np.convolve(channel[row_idx], kernel_1d, mode='same')
                    for col_idx in range(channel.shape[1]):
                        channel[:, col_idx] = np.convolve(channel[:, col_idx], kernel_1d, mode='same')
                    smoothed[..., c] = channel
                smoothed = np.clip(smoothed, self.probability_floor, 1.0)
                smoothed = smoothed / np.sum(smoothed, axis=-1, keepdims=True)
                prediction = smoothed

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
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, context.geometry_bundle)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            prior_bundle,
            _stats_from_observations(round_detail, context.observations),
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(
            round_detail,
            context.geometry_bundle,
            derived,
            prior_bundle=prior_bundle,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        if evidence is None or evidence.total_queries == 0:
            empty_stats = _stats_from_observations(round_detail, [])
            per_seed_stats = {
                seed_index: empty_stats[seed_index]
                for seed_index in range(round_detail.seeds_count)
            }
        else:
            per_seed_stats = {
                seed_index: _stats_from_seed_evidence(evidence.per_seed[seed_index])
                for seed_index in range(round_detail.seeds_count)
            }
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            prior_bundle,
            per_seed_stats,
            blur_sigmas=DEFAULT_BLUR_SIGMAS,
        )
        return self._predict_from_derived(
            round_detail,
            features,
            derived,
            prior_bundle=prior_bundle,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        arrays_path = path.parent / "pooled_coefficients.npz"
        np.savez_compressed(
            arrays_path,
            intercept=self.intercept,
            coefficients=self.coefficients,
        )
        base_checkpoint_path = self.base_predictor.save_checkpoint(path.parent / "base_prior.json")
        checkpoint = FFAMPooledPredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            ridge_lambda=self.ridge_lambda,
            probability_floor=self.probability_floor,
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            spatial_smooth_sigma=self.spatial_smooth_sigma,
            include_transcript_features=self.include_transcript_features,
            feature_names=list(self.feature_names),
            arrays_path=str(arrays_path),
            base_checkpoint_path=str(base_checkpoint_path),
        )
        path.write_text(
            json.dumps(to_jsonable(checkpoint), indent=2),
            encoding="utf-8",
        )
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> FFAMPooledPredictor:
        checkpoint = FFAMPooledPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.arrays_path)
        return cls(
            name=checkpoint.name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(
                Path(checkpoint.base_checkpoint_path),
            ),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            ridge_lambda=checkpoint.ridge_lambda,
            probability_floor=checkpoint.probability_floor,
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            spatial_smooth_sigma=checkpoint.spatial_smooth_sigma,
            include_transcript_features=checkpoint.include_transcript_features,
            feature_names=tuple(checkpoint.feature_names),
            intercept=np.asarray(arrays["intercept"], dtype=np.float64),
            coefficients=np.asarray(arrays["coefficients"], dtype=np.float64),
        )
