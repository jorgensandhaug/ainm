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
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.query_residual_specs import (
    resolve_query_residual_model_spec,
    supported_query_residual_model_names,
)
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
    query_residual_spec = resolve_query_residual_model_spec(normalized)
    if query_residual_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        if historical_round_ids is not None:
            predictor = QueryResidualPredictor.fit_from_workspace(
                workspace_paths,
                round_ids=list(historical_round_ids),
                policy_name=resolved_policy_name,
                samples_per_round=query_residual_spec.samples_per_round,
                cells_per_seed=query_residual_spec.cells_per_seed,
                budget_prefixes=query_residual_spec.budget_prefixes,
                ridge_lambda=query_residual_spec.ridge_lambda,
                model_name=query_residual_spec.model_name,
                probability_floor=query_residual_spec.probability_floor,
                temperature=query_residual_spec.temperature,
                prior_blend=query_residual_spec.prior_blend,
                signal_scale=query_residual_spec.signal_scale,
                min_delta_scale=query_residual_spec.min_delta_scale,
                residual_class_scale=query_residual_spec.residual_class_scale,
                teacher_blend=query_residual_spec.teacher_blend,
                beta_min=query_residual_spec.beta_min,
                beta_scale=query_residual_spec.beta_scale,
            )
        else:
            checkpoint_dir = workspace_paths.model_dir(
                f"{query_residual_spec.model_name}__policy={resolved_policy_name}",
            )
            checkpoint_path = checkpoint_dir / "checkpoint.json"
            if checkpoint_path.exists():
                predictor = QueryResidualPredictor.load_checkpoint(checkpoint_path)
            else:
                predictor = QueryResidualPredictor.fit_from_workspace(
                    workspace_paths,
                    policy_name=resolved_policy_name,
                    samples_per_round=query_residual_spec.samples_per_round,
                    cells_per_seed=query_residual_spec.cells_per_seed,
                    budget_prefixes=query_residual_spec.budget_prefixes,
                    ridge_lambda=query_residual_spec.ridge_lambda,
                    model_name=query_residual_spec.model_name,
                    probability_floor=query_residual_spec.probability_floor,
                    temperature=query_residual_spec.temperature,
                    prior_blend=query_residual_spec.prior_blend,
                    signal_scale=query_residual_spec.signal_scale,
                    min_delta_scale=query_residual_spec.min_delta_scale,
                    residual_class_scale=query_residual_spec.residual_class_scale,
                    teacher_blend=query_residual_spec.teacher_blend,
                    beta_min=query_residual_spec.beta_min,
                    beta_scale=query_residual_spec.beta_scale,
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
    "supported_query_residual_model_names",
]
