from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import OnlinePredictor, TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
from astar.student.predictor.hazard_posterior import (
    HazardPosteriorBlendPredictor,
    HazardPosteriorPredictor,
    hazard_posterior_blend_spec_for_model_name,
    hazard_posterior_k_neighbors_for_model_name,
)
from astar.student.predictor.hazard_posterior_v2 import (
    HazardPosteriorV2BlendPredictor,
    HazardPosteriorV2Predictor,
    hazard_posterior_v2_blend_spec_for_model_name,
    hazard_posterior_v2_spec_for_model_name,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.round import BaseRoundPredictor


class RoundPredictorAdapter(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    predictor: BaseRoundPredictor
    name: str = "round_predictor_adapter"

    def init_belief(self, ctx: RoundContext) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=OnlineEpisodeSample(
                round_context=ctx,
                transcript=OnlineTranscript(),
            ),
        )

    def update(
        self,
        belief: TranscriptBeliefState,
        obs: LiveQueryObs,
    ) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, obs)},
                    ),
                },
            ),
        )

    def predict(self, belief: TranscriptBeliefState) -> PredictionBundle:
        inference_context = round_context_to_live_inference_context(
            belief.round_context,
            belief.observations,
        )
        build_from_context = getattr(self.predictor, "build_prediction_bundle_from_context", None)
        if callable(build_from_context):
            return build_from_context(inference_context)
        round_detail = belief.round_context.to_round_detail()
        return self.predictor.build_prediction_bundle(
            round_detail,
            inference_context.geometry_bundle,
            inference_context.evidence_bundle,
        )


def build_online_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int = 1,
) -> RoundPredictorAdapter:
    normalized = model_name.strip().lower()
    if normalized == "geometry_prior":
        geometry_predictor = GeometryPriorPredictor()
        return RoundPredictorAdapter(
            predictor=geometry_predictor,
            name=geometry_predictor.name,
        )
    if normalized == "historical_bucket_prior":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        if historical_round_ids is not None:
            historical_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
                workspace_paths,
                round_ids=list(historical_round_ids),
            )
        else:
            checkpoint_path = workspace_paths.model_dir("historical_bucket_prior_v1") / "checkpoint.json"
            if checkpoint_path.exists():
                historical_predictor = HistoricalBucketPriorPredictor.load_checkpoint(checkpoint_path)
            else:
                historical_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
                    workspace_paths,
                )
                historical_predictor.save_checkpoint(checkpoint_path)
        return RoundPredictorAdapter(
            predictor=historical_predictor,
            name=historical_predictor.name,
        )
    if normalized == "latent_regime":
        latent_predictor = LatentRegimePredictor()
        return RoundPredictorAdapter(
            predictor=latent_predictor,
            name=latent_predictor.name,
        )
    hazard_posterior_k = hazard_posterior_k_neighbors_for_model_name(normalized)
    if hazard_posterior_k is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = HazardPosteriorPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=(
                list(historical_round_ids)
                if historical_round_ids is not None
                else sorted(
                    round_dir.name
                    for round_dir in workspace_paths.raw_dir.joinpath("replays").glob("*")
                    if round_dir.is_dir()
                )
            ),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=hazard_posterior_k,
            model_name=(
                "hazard_posterior_knn_v1"
                f"__policy={resolved_policy_name}"
                f"__samples={samples_per_round}"
                f"__k={hazard_posterior_k}"
            ),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    hazard_posterior_blend = hazard_posterior_blend_spec_for_model_name(normalized)
    if hazard_posterior_blend is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        k_neighbors, hazard_weight = hazard_posterior_blend
        predictor = HazardPosteriorBlendPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=(
                list(historical_round_ids)
                if historical_round_ids is not None
                else sorted(
                    round_dir.name
                    for round_dir in workspace_paths.raw_dir.joinpath("replays").glob("*")
                    if round_dir.is_dir()
                )
            ),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            hazard_weight=hazard_weight,
            model_name=(
                "hazard_posterior_blend_v1"
                f"__policy={resolved_policy_name}"
                f"__samples={samples_per_round}"
                f"__k={k_neighbors}"
                f"__a={int(round(hazard_weight * 100.0))}"
            ),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    hazard_posterior_v2 = hazard_posterior_v2_spec_for_model_name(normalized)
    if hazard_posterior_v2 is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        k_neighbors, latent_rank = hazard_posterior_v2
        predictor = HazardPosteriorV2Predictor.fit_from_workspace(
            workspace_paths,
            round_ids=(
                list(historical_round_ids)
                if historical_round_ids is not None
                else sorted(
                    round_dir.name
                    for round_dir in workspace_paths.raw_dir.joinpath("replays").glob("*")
                    if round_dir.is_dir()
                )
            ),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=latent_rank,
            model_name=(
                "hazard_posterior_v2"
                f"__policy={resolved_policy_name}"
                f"__samples={samples_per_round}"
                f"__k={k_neighbors}"
                f"__rank={latent_rank}"
            ),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    hazard_posterior_v2_blend = hazard_posterior_v2_blend_spec_for_model_name(normalized)
    if hazard_posterior_v2_blend is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        k_neighbors, latent_rank, hazard_weight = hazard_posterior_v2_blend
        predictor = HazardPosteriorV2BlendPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=(
                list(historical_round_ids)
                if historical_round_ids is not None
                else sorted(
                    round_dir.name
                    for round_dir in workspace_paths.raw_dir.joinpath("replays").glob("*")
                    if round_dir.is_dir()
                )
            ),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
            k_neighbors=k_neighbors,
            latent_rank=latent_rank,
            hazard_weight=hazard_weight,
            model_name=(
                "hazard_posterior_v2_blend"
                f"__policy={resolved_policy_name}"
                f"__samples={samples_per_round}"
                f"__k={k_neighbors}"
                f"__rank={latent_rank}"
                f"__a={int(round(hazard_weight * 100.0))}"
            ),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "query_residual":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        if historical_round_ids is not None:
            predictor = QueryResidualPredictor.fit_from_workspace(
                workspace_paths,
                round_ids=list(historical_round_ids),
                policy_name=resolved_policy_name,
                samples_per_round=samples_per_round,
            )
        else:
            checkpoint_dir = workspace_paths.model_dir(
                f"query_residual_v7__policy={resolved_policy_name}__samples={samples_per_round}",
            )
            checkpoint_path = checkpoint_dir / "checkpoint.json"
            if checkpoint_path.exists():
                predictor = QueryResidualPredictor.load_checkpoint(checkpoint_path)
            else:
                predictor = QueryResidualPredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=resolved_policy_name,
                    samples_per_round=samples_per_round,
                )
                predictor.save_checkpoint(checkpoint_path)
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    msg = f"unsupported online predictor: {model_name}"
    raise ValueError(msg)


__all__ = [
    "OnlinePredictor",
    "RoundPredictorAdapter",
    "build_online_predictor",
]
