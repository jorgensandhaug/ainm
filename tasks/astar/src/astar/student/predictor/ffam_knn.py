"""kNN terrain-matching predictor.

Radically different architecture from ffam_mode:
- No per-round operator decomposition or SVD manifold
- Per-cell kNN matching across ALL training cells pooled from all rounds
- Transcript features used directly at cell level
- Simple, non-parametric approach
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
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.ffam_knn_config import FFAMKNNConfig, resolve_ffam_knn_config
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
from astar.student.posterior.deepset_student import (
    _summary_vector_from_observations,
)


def _extract_cell_transcript_features(
    exact_counts: np.ndarray,
) -> np.ndarray:
    """Extract per-cell features from observation counts.

    For each cell, compute:
    - was_observed (1)
    - log1p(observation_count) (1)
    - observed_class_fractions (6)
    - neighborhood_observation_density (1) - fraction of 3x3 neighbors observed
    - neighborhood_class_fractions (6) - mean class fractions in 3x3 neighborhood

    Returns: (H, W, 15) array
    """
    count_total = np.sum(exact_counts, axis=-1)  # (H, W)
    was_observed = (count_total > 0).astype(np.float64)
    log_count = np.log1p(count_total)

    # Observed class fractions at each cell
    safe_total = np.maximum(count_total, 1.0)[..., None]
    cell_fractions = exact_counts / safe_total  # (H, W, 6)

    # Neighborhood features (3x3)
    h, w = count_total.shape
    padded_obs = np.pad(was_observed, 1, mode='constant', constant_values=0)
    padded_fracs = np.pad(cell_fractions, ((1, 1), (1, 1), (0, 0)), mode='constant', constant_values=0)

    neighbor_density = np.zeros((h, w), dtype=np.float64)
    neighbor_fracs = np.zeros((h, w, CLASS_COUNT), dtype=np.float64)
    neighbor_count = np.zeros((h, w), dtype=np.float64)

    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if dy == 0 and dx == 0:
                continue
            shifted_obs = padded_obs[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
            shifted_fracs = padded_fracs[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
            neighbor_density += shifted_obs
            neighbor_fracs += shifted_fracs * shifted_obs[..., None]
            neighbor_count += shifted_obs

    neighbor_density /= 8.0  # normalize by max neighbors
    safe_neighbor_count = np.maximum(neighbor_count, 1.0)[..., None]
    neighbor_fracs = neighbor_fracs / safe_neighbor_count

    return np.concatenate([
        was_observed[..., None],
        log_count[..., None],
        cell_fractions,
        neighbor_density[..., None],
        neighbor_fracs,
    ], axis=-1).astype(np.float64)


class FFAMKNNPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int
    k_neighbors: int
    probability_floor: float
    beta_min: float
    beta_scale: float
    spatial_smooth_sigma: float
    include_transcript_features: bool
    round_similarity_weight: float
    distance_bandwidth: float
    feature_names: list[str]
    arrays_path: str
    base_checkpoint_path: str


class FFAMKNNPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_knn_v1"
    base_predictor: HistoricalBucketPriorPredictor
    policy_name: str = "exploration_r3"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=6, ge=1)
    k_neighbors: int = Field(default=100, ge=1)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)
    beta_min: float = Field(default=12.0, ge=0.0)
    beta_scale: float = Field(default=48.0, ge=0.0)
    spatial_smooth_sigma: float = Field(default=0.3, ge=0.0)
    include_transcript_features: bool = True
    round_similarity_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    distance_bandwidth: float = Field(default=1.0, gt=0.0)
    feature_names: tuple[str, ...] = ()

    # Training data (pooled across all training rounds)
    training_features: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    training_targets: np.ndarray = Field(default_factory=lambda: np.zeros((0, CLASS_COUNT), dtype=np.float64))
    feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    # Per-round transcript summary for round-level similarity
    round_summary_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    round_summary_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMKNNPredictor:
        config = resolve_ffam_knn_config(
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
        config: FFAMKNNConfig,
        round_ids: list[str] | None = None,
    ) -> FFAMKNNPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("ffam knn requires at least one analyzed round with replay data")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
        )

        # Build static feature names
        static_names = _static_feature_names()
        prior_logit_names = [f"prior_logit_{cn}" for cn in CLASS_NAMES]
        transcript_names = (
            ["tx_was_observed", "tx_log_count"]
            + [f"tx_cell_frac_{cn}" for cn in CLASS_NAMES]
            + ["tx_neighbor_density"]
            + [f"tx_neighbor_frac_{cn}" for cn in CLASS_NAMES]
        ) if config.include_transcript_features else []
        feature_names = static_names + prior_logit_names + transcript_names

        # Collect training data: pool cells across all rounds
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

        all_features_list: list[np.ndarray] = []
        all_targets_list: list[np.ndarray] = []
        round_summaries: dict[str, list[np.ndarray]] = {}

        for row in rows:
            round_id = str(row["round_id"])
            round_detail = read_round_record(paths, round_id).round
            features = compute_round_features(round_detail)
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)

            # Load synthetic episode for transcript features
            artifact = load_synthetic_episode(Path(str(row["episode_path"])))
            observations = tuple(artifact.observations)

            # Derive transcript stats
            derived = _derive_transcript_features_from_stats(
                round_detail,
                features,
                prior_bundle,
                _stats_from_observations(round_detail, observations),
                blur_sigmas=DEFAULT_BLUR_SIGMAS,
            )

            # Round-level summary for similarity weighting
            if round_id not in round_summaries:
                round_summaries[round_id] = []
            summary_vec = _summary_vector_from_observations(
                observations,
                seed_count=round_detail.seeds_count,
                map_width=round_detail.map_width,
                map_height=round_detail.map_height,
                variant="v3",
                initial_grids=tuple(
                    np.asarray(initial_state.grid, dtype=np.int64)
                    for initial_state in round_detail.initial_states
                ),
            )
            round_summaries[round_id].append(summary_vec)

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

                # Select training cells
                selected = _select_training_cells(
                    ground_truth,
                    round_detail,
                    seed_index,
                    cells_per_seed=config.cells_per_seed,
                )
                flat_features = cell_features.reshape(-1, cell_features.shape[-1])[selected]
                flat_targets = ground_truth.reshape(-1, CLASS_COUNT)[selected]

                all_features_list.append(flat_features)
                all_targets_list.append(flat_targets)

        if not all_features_list:
            raise ValueError("ffam knn found no training cells")

        # Pool all training data
        training_features = np.concatenate(all_features_list, axis=0).astype(np.float64)
        training_targets = np.concatenate(all_targets_list, axis=0).astype(np.float64)

        # Standardize features
        feature_mean = np.mean(training_features, axis=0)
        feature_std = np.std(training_features, axis=0)
        feature_scale = np.where(feature_std > 1e-8, feature_std, 1.0)
        training_features = (training_features - feature_mean[None, :]) / feature_scale[None, :]

        # Build round summary bank
        round_summary_bank_list = []
        round_summary_ids = []
        for round_id in sorted(round_summaries.keys()):
            avg_summary = np.mean(np.stack(round_summaries[round_id]), axis=0)
            round_summary_bank_list.append(avg_summary)
            round_summary_ids.append(round_id)
        round_summary_bank = np.stack(round_summary_bank_list, axis=0) if round_summary_bank_list else np.zeros((0, 1))

        return cls(
            name=config.model_name,
            base_predictor=base_predictor,
            policy_name=config.policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=config.samples_per_round,
            k_neighbors=config.k_neighbors,
            probability_floor=config.probability_floor,
            beta_min=config.beta_min,
            beta_scale=config.beta_scale,
            spatial_smooth_sigma=config.spatial_smooth_sigma,
            include_transcript_features=config.include_transcript_features,
            round_similarity_weight=config.round_similarity_weight,
            distance_bandwidth=config.distance_bandwidth,
            feature_names=tuple(feature_names),
            training_features=training_features,
            training_targets=training_targets,
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            round_summary_bank=round_summary_bank.astype(np.float64),
            round_summary_round_ids=tuple(round_summary_ids),
        )

    def _predict_cell_probs(
        self,
        cell_features: np.ndarray,
    ) -> np.ndarray:
        """Predict class probabilities for a batch of cells using kNN."""
        standardized = (cell_features - self.feature_mean[None, :]) / self.feature_scale[None, :]

        # Compute distances to all training cells
        # For large datasets, we'd want a tree index, but with ~40K training cells this is fast enough
        n_query = standardized.shape[0]
        n_train = self.training_features.shape[0]

        # Process in chunks to avoid memory issues
        chunk_size = 200
        predictions = np.zeros((n_query, CLASS_COUNT), dtype=np.float64)

        for start in range(0, n_query, chunk_size):
            end = min(start + chunk_size, n_query)
            query_chunk = standardized[start:end]

            # Euclidean distance
            # ||a - b||^2 = ||a||^2 + ||b||^2 - 2 a.b
            query_sq = np.sum(query_chunk ** 2, axis=1, keepdims=True)
            train_sq = np.sum(self.training_features ** 2, axis=1, keepdims=True).T
            cross = query_chunk @ self.training_features.T
            dist_sq = np.maximum(query_sq + train_sq - 2 * cross, 0.0)

            # Find k nearest neighbors
            k = min(self.k_neighbors, n_train)
            knn_indices = np.argpartition(dist_sq, k, axis=1)[:, :k]

            for i in range(end - start):
                indices = knn_indices[i]
                dists = np.sqrt(dist_sq[i, indices])
                weights = np.exp(-dists / (self.distance_bandwidth + 1e-8))
                weight_sum = np.sum(weights)
                if weight_sum > 0:
                    predictions[start + i] = np.sum(
                        weights[:, None] * self.training_targets[indices],
                        axis=0,
                    ) / weight_sum
                else:
                    predictions[start + i] = np.mean(self.training_targets[indices], axis=0)

        return predictions

    def _spatial_smooth(self, prediction: np.ndarray) -> np.ndarray:
        if self.spatial_smooth_sigma <= 0:
            return prediction
        kernel_radius = max(1, int(3 * self.spatial_smooth_sigma))
        ax = np.arange(-kernel_radius, kernel_radius + 1, dtype=np.float64)
        kernel_1d = np.exp(-0.5 * (ax / self.spatial_smooth_sigma) ** 2)
        kernel_1d /= np.sum(kernel_1d)
        smoothed = prediction.copy()
        for c in range(prediction.shape[-1]):
            channel = smoothed[..., c]
            for row in range(channel.shape[0]):
                channel[row] = np.convolve(channel[row], kernel_1d, mode='same')
            for col in range(channel.shape[1]):
                channel[:, col] = np.convolve(channel[:, col], kernel_1d, mode='same')
            smoothed[..., c] = channel
        smoothed = np.clip(smoothed, self.probability_floor, 1.0)
        smoothed = smoothed / np.sum(smoothed, axis=-1, keepdims=True)
        return smoothed

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

            # kNN prediction
            knn_probs = self._predict_cell_probs(flat_features).reshape(h, w, CLASS_COUNT)

            # Ensure valid probabilities
            knn_probs = np.clip(knn_probs, self.probability_floor, 1.0)
            knn_probs = knn_probs / np.sum(knn_probs, axis=-1, keepdims=True)

            # Exact cell blend
            prediction = self._exact_cell_blend(
                knn_probs,
                np.asarray(derived.exact_counts[seed_index], dtype=np.float64),
                prior,
            )

            # Spatial smoothing
            if self.spatial_smooth_sigma > 0:
                prediction = self._spatial_smooth(prediction)

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
        arrays_path = path.parent / "knn_data.npz"
        np.savez_compressed(
            arrays_path,
            training_features=self.training_features,
            training_targets=self.training_targets,
            feature_mean=self.feature_mean,
            feature_scale=self.feature_scale,
            round_summary_bank=self.round_summary_bank,
        )
        base_checkpoint_path = self.base_predictor.save_checkpoint(path.parent / "base_prior.json")
        checkpoint = FFAMKNNPredictorCheckpoint(
            name=self.name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            k_neighbors=self.k_neighbors,
            probability_floor=self.probability_floor,
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            spatial_smooth_sigma=self.spatial_smooth_sigma,
            include_transcript_features=self.include_transcript_features,
            round_similarity_weight=self.round_similarity_weight,
            distance_bandwidth=self.distance_bandwidth,
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
    def load_checkpoint(cls, path: Path) -> FFAMKNNPredictor:
        checkpoint = FFAMKNNPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(checkpoint.arrays_path)
        return cls(
            name=checkpoint.name,
            base_predictor=HistoricalBucketPriorPredictor.load_checkpoint(
                Path(checkpoint.base_checkpoint_path),
            ),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            k_neighbors=checkpoint.k_neighbors,
            probability_floor=checkpoint.probability_floor,
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            spatial_smooth_sigma=checkpoint.spatial_smooth_sigma,
            include_transcript_features=checkpoint.include_transcript_features,
            round_similarity_weight=checkpoint.round_similarity_weight,
            distance_bandwidth=checkpoint.distance_bandwidth,
            feature_names=tuple(checkpoint.feature_names),
            training_features=np.asarray(arrays["training_features"], dtype=np.float64),
            training_targets=np.asarray(arrays["training_targets"], dtype=np.float64),
            feature_mean=np.asarray(arrays["feature_mean"], dtype=np.float64),
            feature_scale=np.asarray(arrays["feature_scale"], dtype=np.float64),
            round_summary_bank=np.asarray(arrays["round_summary_bank"], dtype=np.float64),
            round_summary_round_ids=tuple(checkpoint.round_ids),
        )
