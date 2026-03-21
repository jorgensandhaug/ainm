"""Observation-Likelihood Round Mixture Predictor.

Radical new approach: instead of learning a mapping from features to corrections,
directly compute how likely the current observations would be under each historical
round's ground truth, then weight historical predictions accordingly.

This is essentially a particle filter over round identities.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor

# ---------------------------------------------------------------------------
# Model names
# ---------------------------------------------------------------------------
OBS_LIKELIHOOD_MIXTURE_ALIAS = "obs_likelihood_mixture"
OBS_LIKELIHOOD_MIXTURE_V1 = "obs_likelihood_mixture_v1"
OBS_LIKELIHOOD_MIXTURE_V2 = "obs_likelihood_mixture_v2"
OBS_LIKELIHOOD_MIXTURE_V3 = "obs_likelihood_mixture_v3"
OBS_LIKELIHOOD_MIXTURE_V4 = "obs_likelihood_mixture_v4"

OBS_LIKELIHOOD_MIXTURE_MODEL_NAMES = frozenset({
    OBS_LIKELIHOOD_MIXTURE_ALIAS,
    OBS_LIKELIHOOD_MIXTURE_V1,
    OBS_LIKELIHOOD_MIXTURE_V2,
    OBS_LIKELIHOOD_MIXTURE_V3,
    OBS_LIKELIHOOD_MIXTURE_V4,
})

def resolve_obs_likelihood_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int | None:
    spec = resolve_obs_likelihood_variant_spec(model_name, samples_per_round=samples_per_round)
    return spec.samples_per_round


OBS_LIKELIHOOD_MIXTURE_MODEL_CHOICE_LIST = [
    OBS_LIKELIHOOD_MIXTURE_ALIAS,
    OBS_LIKELIHOOD_MIXTURE_V1,
    OBS_LIKELIHOOD_MIXTURE_V2,
    OBS_LIKELIHOOD_MIXTURE_V3,
    OBS_LIKELIHOOD_MIXTURE_V4,
]


class ObsLikelihoodVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    temperature: float = Field(default=1.0, gt=0.0)
    prior_blend: float = Field(default=0.1, ge=0.0, le=1.0)
    prob_floor: float = Field(default=0.005, ge=0.0)
    use_entropy_weighting: bool = True
    use_cross_seed_evidence: bool = True


def is_obs_likelihood_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in OBS_LIKELIHOOD_MIXTURE_MODEL_NAMES


def resolve_obs_likelihood_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> ObsLikelihoodVariantSpec:
    normalized = model_name.strip().lower()
    if normalized not in OBS_LIKELIHOOD_MIXTURE_MODEL_NAMES:
        msg = f"unsupported obs_likelihood model: {model_name}"
        raise ValueError(msg)

    specs = {
        OBS_LIKELIHOOD_MIXTURE_V1: ObsLikelihoodVariantSpec(
            model_name=OBS_LIKELIHOOD_MIXTURE_V1,
            samples_per_round=4,
            temperature=1.0,
            prior_blend=0.1,
            prob_floor=0.005,
            use_entropy_weighting=True,
            use_cross_seed_evidence=True,
        ),
        OBS_LIKELIHOOD_MIXTURE_V2: ObsLikelihoodVariantSpec(
            model_name=OBS_LIKELIHOOD_MIXTURE_V2,
            samples_per_round=4,
            temperature=0.5,
            prior_blend=0.05,
            prob_floor=0.005,
            use_entropy_weighting=True,
            use_cross_seed_evidence=True,
        ),
        OBS_LIKELIHOOD_MIXTURE_V3: ObsLikelihoodVariantSpec(
            model_name=OBS_LIKELIHOOD_MIXTURE_V3,
            samples_per_round=8,
            temperature=0.25,
            prior_blend=0.02,
            prob_floor=0.003,
            use_entropy_weighting=True,
            use_cross_seed_evidence=True,
        ),
        OBS_LIKELIHOOD_MIXTURE_V4: ObsLikelihoodVariantSpec(
            model_name=OBS_LIKELIHOOD_MIXTURE_V4,
            samples_per_round=8,
            temperature=2.0,
            prior_blend=0.15,
            prob_floor=0.005,
            use_entropy_weighting=False,
            use_cross_seed_evidence=True,
        ),
    }
    resolved_name = normalized if normalized != OBS_LIKELIHOOD_MIXTURE_ALIAS else OBS_LIKELIHOOD_MIXTURE_V1
    spec = specs.get(resolved_name, specs[OBS_LIKELIHOOD_MIXTURE_V1])

    if samples_per_round is not None:
        spec = spec.model_copy(update={"samples_per_round": samples_per_round})

    return spec


# ---------------------------------------------------------------------------
# Core model
# ---------------------------------------------------------------------------


class ObsLikelihoodMixturePredictor(BaseModel):
    """Predict by weighting historical round ground truths by observation likelihood."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "obs_likelihood_mixture_v1"
    spec: ObsLikelihoodVariantSpec = Field(
        default_factory=lambda: ObsLikelihoodVariantSpec(model_name=OBS_LIKELIHOOD_MIXTURE_V1)
    )

    # Stored historical ground truths: dict[round_id -> dict[seed_index -> (H, W, 6)]]
    round_ground_truths: dict[str, dict[int, np.ndarray]] = Field(default_factory=dict)
    round_ids: tuple[str, ...] = ()

    # Base prior for fallback
    base_prior: HistoricalBucketPriorPredictor | None = None

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        seeds_count = round_detail.seeds_count

        # Compute per-seed observation masks and observed classes
        observations = context.observations
        obs_by_seed: dict[int, list[LiveQueryObs]] = {}
        for obs in observations:
            seed_idx = obs.seed_index
            if seed_idx not in obs_by_seed:
                obs_by_seed[seed_idx] = []
            obs_by_seed[seed_idx].append(obs)

        # Compute round-level log-likelihoods for each historical round
        log_likelihoods = {}
        for rid in self.round_ids:
            ll = self._compute_round_log_likelihood(
                rid, obs_by_seed, round_detail, context
            )
            log_likelihoods[rid] = ll

        # Convert to weights via softmax with temperature
        if log_likelihoods:
            ll_values = np.array([log_likelihoods[rid] for rid in self.round_ids])
            ll_values = ll_values / max(self.spec.temperature, 1e-8)
            ll_values -= np.max(ll_values)  # numerical stability
            weights = np.exp(ll_values)
            weights /= np.sum(weights)
        else:
            weights = np.ones(len(self.round_ids)) / max(len(self.round_ids), 1)

        # Build per-seed predictions as weighted mixture
        seed_predictions: dict[int, np.ndarray] = {}
        for seed_index in range(seeds_count):
            pred = self._blend_predictions(
                seed_index, weights, round_detail, context
            )
            seed_predictions[seed_index] = pred

        return PredictionBundle(
            round_id=round_detail.id,
            predictions=seed_predictions,
        )

    def _compute_round_log_likelihood(
        self,
        historical_round_id: str,
        obs_by_seed: dict[int, list[LiveQueryObs]],
        round_detail: RoundDetail,
        context: LiveInferenceContext,
    ) -> float:
        """Compute log-likelihood of current observations under a historical round's GT."""
        total_ll = 0.0
        total_cells = 0

        gt_dict = self.round_ground_truths.get(historical_round_id, {})

        for seed_index, observations in obs_by_seed.items():
            # Get the historical GT for this seed
            # Use same seed_index if available, otherwise average across seeds
            if seed_index in gt_dict:
                gt = gt_dict[seed_index]
            elif gt_dict:
                gt = np.mean(np.stack(list(gt_dict.values())), axis=0)
            else:
                continue

            for obs in observations:
                viewport = obs.viewport
                grid = np.asarray(obs.grid, dtype=np.int64)
                collapsed = collapse_internal_grid(grid)

                for dy in range(viewport.h):
                    for dx in range(viewport.w):
                        y = viewport.y + dy
                        x = viewport.x + dx
                        if 0 <= y < gt.shape[0] and 0 <= x < gt.shape[1]:
                            observed_class = int(collapsed[dy, dx])
                            if 0 <= observed_class < CLASS_COUNT:
                                prob = max(gt[y, x, observed_class], 1e-10)
                                if self.spec.use_entropy_weighting:
                                    entropy = -np.sum(
                                        gt[y, x] * np.log(np.maximum(gt[y, x], 1e-10))
                                    )
                                    weight = max(entropy, 0.01)
                                else:
                                    weight = 1.0
                                total_ll += weight * math.log(prob)
                                total_cells += 1

        return total_ll

    def _blend_predictions(
        self,
        seed_index: int,
        weights: np.ndarray,
        round_detail: RoundDetail,
        context: LiveInferenceContext,
    ) -> np.ndarray:
        """Create weighted mixture of historical ground truths for one seed."""
        H = round_detail.map_height
        W = round_detail.map_width
        blended = np.zeros((H, W, CLASS_COUNT), dtype=np.float64)

        for i, rid in enumerate(self.round_ids):
            gt_dict = self.round_ground_truths.get(rid, {})
            if seed_index in gt_dict:
                gt = gt_dict[seed_index]
            elif gt_dict:
                gt = np.mean(np.stack(list(gt_dict.values())), axis=0)
            else:
                continue

            # Handle shape mismatch (different map sizes)
            if gt.shape[0] != H or gt.shape[1] != W:
                continue

            blended += weights[i] * gt

        # Blend with base prior for safety
        if self.base_prior is not None and self.spec.prior_blend > 0:
            prior_bundle = self.base_prior.build_prediction_bundle(
                round_detail,
                context.geometry_bundle,
                context.evidence_bundle,
            )
            if seed_index in prior_bundle.predictions:
                prior_pred = prior_bundle.predictions[seed_index]
                blended = (1.0 - self.spec.prior_blend) * blended + self.spec.prior_blend * prior_pred

        # Apply floor and normalize
        blended = apply_probability_floor(blended, floor=self.spec.prob_floor)

        return blended


# ---------------------------------------------------------------------------
# Factory / builder
# ---------------------------------------------------------------------------


def load_or_fit_obs_likelihood_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> ObsLikelihoodMixturePredictor:
    """Build obs-likelihood-mixture predictor from replay data."""
    spec = resolve_obs_likelihood_variant_spec(model_name, samples_per_round=samples_per_round)
    workspace_paths = paths or WorkspacePaths.from_root(".")

    # Load ground truths from replay summaries
    from astar.history.episodes.build import build_round_episode

    round_ids_list = list(historical_round_ids) if historical_round_ids else []
    if not round_ids_list:
        # Discover all available rounds
        all_records = read_analysis_records(workspace_paths)
        round_ids_list = list({r.round_id for r in all_records if r.has_replay})

    round_ground_truths: dict[str, dict[int, np.ndarray]] = {}
    for rid in round_ids_list:
        seed_gts: dict[int, np.ndarray] = {}
        for seed_index in range(5):
            npz_path = (
                workspace_paths.replay_summaries_root
                / f"round_id={rid}"
                / f"seed_index={seed_index}.npz"
            )
            if npz_path.exists():
                data = np.load(str(npz_path))
                if "mean_terminal_probs" in data:
                    seed_gts[seed_index] = data["mean_terminal_probs"]
        if seed_gts:
            round_ground_truths[rid] = seed_gts

    # Build base prior
    base_prior = HistoricalBucketPriorPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=round_ids_list,
    )

    return ObsLikelihoodMixturePredictor(
        name=spec.model_name,
        spec=spec,
        round_ground_truths=round_ground_truths,
        round_ids=tuple(round_ground_truths.keys()),
        base_prior=base_prior,
    )


def load_or_fit_named_obs_likelihood_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> BaseRoundPredictor:
    """Entry point for the interactive predictor factory."""
    predictor = load_or_fit_obs_likelihood_predictor(
        model_name,
        paths=paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    # Wrap in a BaseRoundPredictor-compatible adapter
    return _ObsLikelihoodRoundAdapter(
        name=predictor.name,
        predictor=predictor,
    )


class _ObsLikelihoodRoundAdapter(BaseRoundPredictor):
    """Adapts ObsLikelihoodMixturePredictor to BaseRoundPredictor interface."""

    predictor: ObsLikelihoodMixturePredictor

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        raise NotImplementedError("Use build_prediction_bundle_from_context instead")

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        return self.predictor.build_prediction_bundle_from_context(context)
