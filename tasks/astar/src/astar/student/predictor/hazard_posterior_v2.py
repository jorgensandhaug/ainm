from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.posterior.deepset_student import ObservationSetBankStudent
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher_v2 import HazardTeacherV2

DEFAULT_HAZARD_POSTERIOR_V2_K = 5
DEFAULT_HAZARD_POSTERIOR_V2_RANK = 3
_HAZARD_V2_PREFIX = "hazard_posterior_v2_k"
_HAZARD_V2_BLEND_PREFIX = "hazard_posterior_v2_blend_a"


def hazard_posterior_v2_spec_for_model_name(model_name: str) -> tuple[int, int] | None:
    normalized = model_name.strip().lower()
    if normalized == "hazard_posterior_v2":
        return (DEFAULT_HAZARD_POSTERIOR_V2_K, DEFAULT_HAZARD_POSTERIOR_V2_RANK)
    if not normalized.startswith(_HAZARD_V2_PREFIX):
        return None
    raw = normalized.removeprefix(_HAZARD_V2_PREFIX)
    if "_r" in raw:
        k_token, rank_token = raw.split("_r", maxsplit=1)
    else:
        k_token = raw
        rank_token = str(DEFAULT_HAZARD_POSTERIOR_V2_RANK)
    if not k_token.isdigit() or not rank_token.isdigit():
        return None
    k_neighbors = int(k_token)
    latent_rank = int(rank_token)
    if k_neighbors < 1 or latent_rank < 1:
        return None
    return (k_neighbors, latent_rank)


def hazard_posterior_v2_blend_spec_for_model_name(model_name: str) -> tuple[int, int, float] | None:
    normalized = model_name.strip().lower()
    if not normalized.startswith(_HAZARD_V2_BLEND_PREFIX):
        return None
    raw = normalized.removeprefix(_HAZARD_V2_BLEND_PREFIX)
    if "_k" not in raw:
        return None
    alpha_token, suffix = raw.split("_k", maxsplit=1)
    if "_r" in suffix:
        k_token, rank_token = suffix.split("_r", maxsplit=1)
    else:
        k_token = suffix
        rank_token = str(DEFAULT_HAZARD_POSTERIOR_V2_RANK)
    if not alpha_token.isdigit() or not k_token.isdigit() or not rank_token.isdigit():
        return None
    alpha_pct = int(alpha_token)
    k_neighbors = int(k_token)
    latent_rank = int(rank_token)
    if not (1 <= alpha_pct <= 99) or k_neighbors < 1 or latent_rank < 1:
        return None
    return (k_neighbors, latent_rank, alpha_pct / 100.0)


def _round_scope_token(round_ids: Sequence[str]) -> str:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_dataset_name(
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
    latent_rank: int,
) -> str:
    normalized_policy = policy_name.strip().lower()
    scope_token = _round_scope_token(round_ids)
    return (
        f"hazard_posterior_v2_synthetic_live__policy={normalized_policy}"
        f"__samples={samples_per_round}"
        f"__rank={latent_rank}"
        f"__rounds={scope_token}"
    )


def _load_cached_dataset_ref(
    paths: WorkspacePaths,
    dataset_name: str,
) -> SyntheticEpisodeDatasetRef:
    dataset_dir = paths.dataset_dir(dataset_name)
    summary_path = dataset_dir / "summary.json"
    index_path = dataset_dir / "index.parquet"
    if not summary_path.exists() or not index_path.exists():
        raise FileNotFoundError(dataset_name)
    episode_paths = (
        pl.read_parquet(index_path, columns=["episode_path"]).get_column("episode_path").to_list()
    )
    if any(not Path(str(item)).exists() for item in episode_paths):
        raise FileNotFoundError(f"{dataset_name}: stale episode paths")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    row_count = int(len(episode_paths))
    return SyntheticEpisodeDatasetRef(
        dataset_name=str(summary.get("dataset_name", dataset_name)),
        dataset_kind=str(summary.get("dataset_kind", "synthetic_live")),
        dataset_dir=dataset_dir,
        summary_path=summary_path,
        index_path=index_path,
        row_count=row_count,
        round_count=int(summary.get("round_count", 0)),
        policy_name=str(summary.get("policy_name", "coverage")),
        episode_count=int(summary.get("episode_count", row_count)),
        total_query_count=int(summary.get("total_query_count", 0)),
        samples_per_round=int(summary.get("samples_per_round", 1)),
    )


def _ensure_synthetic_dataset(
    paths: WorkspacePaths,
    *,
    policy_name: str,
    samples_per_round: int,
    round_ids: Sequence[str],
    latent_rank: int,
    regime_vectors_by_round: dict[str, np.ndarray],
) -> SyntheticEpisodeDatasetRef:
    dataset_name = _cached_dataset_name(
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        round_ids=round_ids,
        latent_rank=latent_rank,
    )
    try:
        return _load_cached_dataset_ref(paths, dataset_name)
    except FileNotFoundError:
        return build_synthetic_live_dataset(
            paths,
            policy_name=policy_name,
            round_ids=list(round_ids),
            samples_per_round=samples_per_round,
            dataset_name=dataset_name,
            regime_vectors_by_round=regime_vectors_by_round,
        )


class HazardPosteriorV2Predictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v2"
    student: ObservationSetBankStudent
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V2_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V2_RANK, ge=1)
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_HAZARD_POSTERIOR_V2_K,
        latent_rank: int = DEFAULT_HAZARD_POSTERIOR_V2_RANK,
        model_name: str | None = None,
    ) -> HazardPosteriorV2Predictor:
        selected_round_ids = sorted(set(round_ids))
        if not selected_round_ids:
            raise ValueError("hazard_posterior_v2 requires replay-backed training rounds")
        replay_episodes = [
            build_round_episode(paths, round_id)
            for round_id in selected_round_ids
        ]
        replay_episodes = [episode for episode in replay_episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("hazard_posterior_v2 requires replay-backed training rounds")

        resolved_name = model_name or (
            "hazard_posterior_v2"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
        )
        teacher = HazardTeacherV2(name=f"{resolved_name}__teacher").fit(
            replay_episodes,
            latent_rank=latent_rank,
        )
        dataset = _ensure_synthetic_dataset(
            paths,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=selected_round_ids,
            latent_rank=teacher.latent_rank,
            regime_vectors_by_round=teacher.regime_vectors_by_round(),
        )
        student = ObservationSetBankStudent.fit_from_dataset(
            dataset,
            teacher,
            k_neighbors=k_neighbors,
        )
        return cls(
            name=resolved_name,
            student=student,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=teacher.latent_rank,
            training_round_ids=tuple(selected_round_ids),
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed = {
            seed.seed_index: self.student.predict_seed(context, seed.seed_index)
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=(
                evidence
                if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())
            ),
        )
        return self.build_prediction_bundle_from_context(context)


class HazardPosteriorV2BlendPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_posterior_v2_blend"
    hazard_predictor: HazardPosteriorV2Predictor
    baseline_predictor: HistoricalBucketPriorPredictor
    hazard_weight: float = Field(default=0.25, gt=0.0, lt=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    policy_name: str = "coverage"
    samples_per_round: int = Field(default=1, ge=1)
    k_neighbors: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V2_K, ge=1)
    latent_rank: int = Field(default=DEFAULT_HAZARD_POSTERIOR_V2_RANK, ge=1)
    training_round_ids: tuple[str, ...] = ()

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str],
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        k_neighbors: int = DEFAULT_HAZARD_POSTERIOR_V2_K,
        latent_rank: int = DEFAULT_HAZARD_POSTERIOR_V2_RANK,
        hazard_weight: float = 0.25,
        model_name: str | None = None,
    ) -> HazardPosteriorV2BlendPredictor:
        selected_round_ids = sorted(set(round_ids))
        alpha_token = int(round(hazard_weight * 100.0))
        resolved_name = model_name or (
            "hazard_posterior_v2_blend"
            f"__policy={policy_name.strip().lower()}"
            f"__samples={samples_per_round}"
            f"__k={k_neighbors}"
            f"__rank={latent_rank}"
            f"__a={alpha_token}"
        )
        hazard_predictor = HazardPosteriorV2Predictor.fit_from_workspace(
            paths,
            round_ids=selected_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=latent_rank,
            model_name=f"{resolved_name}__hazard",
        )
        baseline_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected_round_ids),
            model_name=f"{resolved_name}__bucket",
        )
        return cls(
            name=resolved_name,
            hazard_predictor=hazard_predictor,
            baseline_predictor=baseline_predictor,
            hazard_weight=hazard_weight,
            policy_name=policy_name.strip().lower(),
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=hazard_predictor.latent_rank,
            training_round_ids=tuple(selected_round_ids),
        )

    def _blend_bundles(
        self,
        *,
        round_id: str,
        hazard_bundle: PredictionBundle,
        baseline_bundle: PredictionBundle,
    ) -> PredictionBundle:
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, hazard_prediction in hazard_bundle.predictions_by_seed.items():
            baseline_prediction = np.asarray(
                baseline_bundle.predictions_by_seed[seed_index],
                dtype=np.float64,
            )
            blended = (
                self.hazard_weight * np.asarray(hazard_prediction, dtype=np.float64)
                + (1.0 - self.hazard_weight) * baseline_prediction
            )
            normalized = blended / np.sum(blended, axis=-1, keepdims=True)
            predictions_by_seed[seed_index] = apply_probability_floor(
                normalized,
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        baseline_bundle = self.baseline_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
        )
        hazard_bundle = self.hazard_predictor.build_prediction_bundle_from_context(context)
        return self._blend_bundles(
            round_id=context.round_context.round_id,
            hazard_bundle=hazard_bundle,
            baseline_bundle=baseline_bundle,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context),
            geometry_bundle=features,
            evidence_bundle=(
                evidence
                if evidence is not None
                else build_round_evidence_from_observations(round_detail, ())
            ),
        )
        return self.build_prediction_bundle_from_context(context)


__all__ = [
    "DEFAULT_HAZARD_POSTERIOR_V2_K",
    "DEFAULT_HAZARD_POSTERIOR_V2_RANK",
    "HazardPosteriorV2BlendPredictor",
    "HazardPosteriorV2Predictor",
    "hazard_posterior_v2_blend_spec_for_model_name",
    "hazard_posterior_v2_spec_for_model_name",
]
