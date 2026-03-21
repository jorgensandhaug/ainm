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
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_live_inference_context
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
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.base import LiveInferenceContext
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


def _observation_grid_loglikelihood(
    predictive_tensor: np.ndarray,
    observation: LiveQueryObs,
    *,
    class_floor: float = 0.01,
    class_weights: np.ndarray | None = None,
) -> float:
    """Compute log-likelihood of observed cells under the predictive tensor."""
    viewport = observation.viewport
    patch = np.asarray(
        predictive_tensor[
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
            :,
        ],
        dtype=np.float64,
    )
    observed_classes = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
    class_probabilities = np.take_along_axis(
        patch,
        observed_classes[..., None],
        axis=-1,
    ).reshape(-1)
    safe_probabilities = np.clip(class_probabilities, class_floor, 1.0)
    if safe_probabilities.size == 0:
        return 0.0
    if class_weights is not None:
        obs_weights = np.asarray(class_weights[observed_classes.reshape(-1)], dtype=np.float64)
        weight_sum = float(np.sum(obs_weights))
        if np.isfinite(weight_sum) and weight_sum > 0.0:
            return float(np.sum(obs_weights * np.log(safe_probabilities)) / weight_sum)
    return float(np.mean(np.log(safe_probabilities)))


def _posterior_reweighted_by_observations(
    observations: tuple[LiveQueryObs, ...],
    round_context: object,
    *,
    teacher: HazardTeacherV2,
    particles: tuple[np.ndarray, ...],
    base_weights: np.ndarray,
    observation_weight: float,
    class_floor: float = 0.01,
    class_weights: np.ndarray | None = None,
) -> np.ndarray:
    """Reweight regime particles by how well they explain observed cells."""
    if observation_weight <= 0.0 or not observations:
        return np.asarray(base_weights, dtype=np.float64)

    seed_cache: dict[int, list[np.ndarray]] = {}
    log_likelihoods = np.zeros(len(particles), dtype=np.float64)

    for particle_index in range(len(particles)):
        total_ll = 0.0
        for obs in observations:
            per_seed = seed_cache.setdefault(obs.seed_index, [])
            while len(per_seed) <= particle_index:
                seed = round_context.seeds[obs.seed_index]
                per_seed.append(
                    np.asarray(
                        teacher.terminal_tensor(seed, particles[len(per_seed)]),
                        dtype=np.float64,
                    ),
                )
            total_ll += _observation_grid_loglikelihood(
                per_seed[particle_index],
                obs,
                class_floor=class_floor,
                class_weights=class_weights,
            )
        log_likelihoods[particle_index] = total_ll

    log_prior = np.log(np.clip(np.asarray(base_weights, dtype=np.float64), 1e-12, None))
    centered_ll = log_likelihoods - float(np.mean(log_likelihoods))
    logits = log_prior + observation_weight * centered_ll
    logits = logits - float(np.max(logits))
    refined = np.exp(np.clip(logits, -60.0, 0.0))
    total = float(np.sum(refined))
    if not np.isfinite(total) or total <= 0.0:
        return np.asarray(base_weights, dtype=np.float64)
    return np.asarray(refined / total, dtype=np.float64)


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
    observation_weight: float = Field(default=0.0, ge=0.0)
    observation_class_weights: np.ndarray = Field(
        default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64),
    )

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
        observation_weight: float = 0.0,
        teacher_version: int = 2,
        synthetic_dataset_name: str | None = None,
    ) -> HazardPosteriorV2PortPredictor:
        selected = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected) < 2:
            raise ValueError("hazard posterior v2 requires at least two analyzed rounds")

        # Build teacher (V2 or V3)
        episodes = [build_round_episode(paths, rid) for rid in selected]
        if teacher_version == 3:
            from astar.teacher.dynamics.hazard_teacher_v3 import HazardTeacherV3
            teacher = HazardTeacherV3(name=f"{model_name}__teacher_v3").fit(
                episodes,
                latent_rank=latent_rank,
            )
        else:
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

        # Compute entropy-conditioned class weights for observation reweighting
        obs_class_weights = np.ones(CLASS_COUNT, dtype=np.float64)
        if observation_weight > 0.0:
            class_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
            entropy_weighted_mass = np.zeros(CLASS_COUNT, dtype=np.float64)
            for ep in episodes:
                for seed in ep.seeds:
                    tt = seed.terminal_truth
                    if tt is None:
                        continue
                    probs = np.asarray(tt.probs, dtype=np.float64)
                    class_mass += np.sum(probs, axis=(0, 1))
                    entropy_weighted_mass += np.sum(
                        entropy_map(probs)[..., None] * probs, axis=(0, 1),
                    )
            if float(np.sum(class_mass)) > 0.0:
                cond_ent = entropy_weighted_mass / np.clip(class_mass, 1e-9, None)
                normed = cond_ent / max(float(np.mean(cond_ent)), 1e-9)
                w = np.power(np.clip(normed, 1e-9, None), 0.5)
                w = w / max(float(np.mean(w)), 1e-9)
                obs_class_weights = np.clip(w, 0.6, 1.8).astype(np.float64)

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
            observation_weight=observation_weight,
            observation_class_weights=obs_class_weights,
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

    def _infer_regime_with_observations(
        self,
        evidence: RoundEvidenceBundle | None,
        observations: tuple[LiveQueryObs, ...],
        round_context: object,
    ) -> RegimePosteriorState:
        """Infer regime posterior and optionally refine with observation likelihood."""
        posterior = self._infer_regime(evidence)

        if (
            self.observation_weight > 0.0
            and observations
            and posterior.particles is not None
            and posterior.weights is not None
        ):
            refined_weights = _posterior_reweighted_by_observations(
                observations,
                round_context,
                teacher=self.teacher,
                particles=posterior.particles,
                base_weights=posterior.weights,
                observation_weight=self.observation_weight,
                class_weights=self.observation_class_weights,
            )
            particle_matrix = np.stack(posterior.particles, axis=0)
            mean = np.tensordot(refined_weights, particle_matrix, axes=(0, 0))
            return RegimePosteriorState(
                mean=np.asarray(mean, dtype=np.float64),
                particles=posterior.particles,
                weights=refined_weights,
            )

        return posterior

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        """Predict using full context including observation-likelihood reweighting."""
        posterior = self._infer_regime_with_observations(
            context.evidence_bundle,
            context.observations,
            context.round_context,
        )

        predictions: dict[int, np.ndarray] = {}
        for seed in context.round_context.seeds:
            prediction = self.teacher.posterior_predictive(seed, posterior)
            predictions[seed.seed_index] = apply_probability_floor(
                prediction,
                self.probability_floor,
            )

        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions,
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
