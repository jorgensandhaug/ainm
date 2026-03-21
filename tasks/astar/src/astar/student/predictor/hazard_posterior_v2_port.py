"""Hazard posterior predictor ported from agent1's V8 architecture.

Uses HazardTeacherV2 with proper SVD-compressed low-rank regime latent,
ridge-projected regime prediction blended with kNN particles, and
entropy-conditioned class-specific observation weights.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank_decoder import (
    _round_ids_with_replays_and_analyses,
)
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2
from astar.teacher.regime.base import RegimePosteriorState


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.sqrt(np.maximum(np.var(features, axis=0), 1.0e-6))
    return means, scales


class HazardPosteriorV2PortPredictor(BaseRoundPredictor):
    """Hazard posterior predictor with V2 teacher and ridge-projected regime."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "f1_hazard_posterior_v2_v01"
    teacher: HazardTeacherV2

    # kNN + ridge bank
    summary_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    regime_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    # Ridge projection from summary -> regime
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(
        default_factory=lambda: np.zeros((1, 1), dtype=np.float64),
    )
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    latent_rank: int = Field(default=3, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        budget: int = 50,
        samples_per_round: int = 4,
        k_neighbors: int = 5,
        latent_rank: int = 3,
        ridge_alpha: float = 32.0,
        predicted_particle_weight: float = 0.7,
        model_name: str = "f1_hazard_posterior_v2_v01",
        probability_floor: float = 0.01,
        summary_feature_variant: str = "basic",
        synthetic_dataset_name: str | None = None,
    ) -> HazardPosteriorV2PortPredictor:
        selected = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected) < 2:
            raise ValueError("hazard posterior v2 requires at least two analyzed rounds")

        # Build V2 teacher
        episodes = [build_round_episode(paths, rid) for rid in selected]
        teacher = HazardTeacherV2(name=f"{model_name}__teacher").fit(
            episodes,
            latent_rank=latent_rank,
        )

        # Build summary bank
        dataset_name = synthetic_dataset_name or f"{model_name}__synthetic_live"
        dataset = build_synthetic_live_dataset(
            paths,
            dataset_name=dataset_name,
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            round_ids=list(selected),
        )
        if dataset.index_path is None:
            raise ValueError("hazard posterior v2 requires synthetic live dataset with index")

        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(selected),
        )

        summary_list: list[np.ndarray] = []
        regime_list: list[np.ndarray] = []

        for row in index_table.iter_rows(named=True):
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(
                episode_path,
                feature_variant=summary_feature_variant,
            )
            # Use the V2 teacher's regime encoding for this round
            rid = str(row["round_id"])
            regime_dict = teacher.regime_vectors_by_round()
            if rid in regime_dict:
                regime_vector = np.asarray(regime_dict[rid], dtype=np.float64)
            else:
                regime_vector = np.zeros(teacher.latent_rank, dtype=np.float64)

            summary_list.append(summary_vector)
            regime_list.append(regime_vector)

        if not summary_list:
            raise ValueError("hazard posterior v2: no summary vectors found")

        summary_matrix = np.stack(summary_list, axis=0)
        regime_matrix = np.stack(regime_list, axis=0)

        # Standardize summaries
        smeans, sscales = _standardize(summary_matrix)
        normalized_summary = (summary_matrix - smeans[None, :]) / sscales[None, :]

        # Fit ridge projection: summary -> regime
        regime_mean_val = np.mean(regime_matrix, axis=0)
        centered_regime = regime_matrix - regime_mean_val[None, :]
        gram = normalized_summary.T @ normalized_summary
        rhs = normalized_summary.T @ centered_regime
        projection = np.linalg.solve(
            gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
            rhs,
        )
        regime_clip_val = np.maximum(
            np.percentile(np.abs(centered_regime), 95.0, axis=0),
            np.max(np.abs(centered_regime), axis=0),
        )

        return cls(
            name=model_name,
            teacher=teacher,
            summary_vectors=normalized_summary,
            regime_vectors=regime_matrix,
            summary_means=smeans,
            summary_scales=sscales,
            regime_mean=regime_mean_val,
            regime_projection=projection,
            regime_clip=regime_clip_val,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            latent_rank=latent_rank,
            probability_floor=probability_floor,
            summary_feature_variant=summary_feature_variant,
        )

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def _infer_regime(self, evidence: RoundEvidenceBundle | None) -> RegimePosteriorState:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return RegimePosteriorState(
                mean=np.asarray(self.regime_mean, dtype=np.float64),
            )

        summary = _summary_vector_from_evidence(
            evidence,
            feature_variant=self.summary_feature_variant,
        )
        normalized_query = (summary - self.summary_means) / self.summary_scales
        predicted_mean = self._predict_regime_mean(normalized_query)

        # Find kNN neighbors in regime space (using predicted mean as query)
        distances = np.linalg.norm(
            self.summary_vectors - normalized_query[None, :], axis=1,
        )
        k = min(len(self.regime_vectors), self.k_neighbors)
        order = np.argsort(distances)[:k]

        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        # Blend predicted mean with kNN particles
        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[idx] for idx in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[idx] for idx in order)
            weights = neighbor_weights

        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        posterior = self._infer_regime(evidence)
        round_context = build_round_context_from_detail(round_detail)

        predictions: dict[int, np.ndarray] = {}
        for seed in round_context.seeds:
            prediction = self.teacher.posterior_predictive(seed, posterior)
            predictions[seed.seed_index] = apply_probability_floor(
                prediction,
                self.probability_floor,
            )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions,
        )
