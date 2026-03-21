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
from astar.student.predictor.evidence_field import (
    is_evidence_field_model_name,
    load_or_fit_named_evidence_field_predictor,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import (
    is_query_residual_model_name,
    load_or_fit_named_query_residual_predictor,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    is_summary_bank_model_name,
    load_or_fit_named_summary_bank_predictor,
)
from astar.student.predictor.transcript_memory import (
    is_transcript_memory_model_name,
    load_or_fit_named_transcript_memory_predictor,
)
from astar.student.predictor.transcript_residual_memory import (
    is_transcript_residual_memory_model_name,
    load_or_fit_named_transcript_residual_memory_predictor,
)
from astar.student.predictor.transcript_sequence_residual_memory import (
    is_transcript_sequence_residual_memory_model_name,
    load_or_fit_named_transcript_sequence_residual_memory_predictor,
)
from astar.student.predictor.transcript_sequence_factor_residual import (
    is_transcript_sequence_factor_residual_model_name,
    load_or_fit_named_transcript_sequence_factor_residual_predictor,
)
from astar.student.predictor.round_transcript_residual_memory import (
    is_round_transcript_residual_memory_model_name,
    load_or_fit_named_round_transcript_residual_memory_predictor,
)
from astar.student.predictor.round_transcript_factor_residual import (
    is_round_transcript_factor_residual_model_name,
    load_or_fit_named_round_transcript_factor_residual_predictor,
)
from astar.student.predictor.round_transcript_prototype_residual import (
    is_round_transcript_prototype_residual_model_name,
    load_or_fit_named_round_transcript_prototype_residual_predictor,
)
from astar.student.predictor.round_heatmap_factor_residual import (
    is_round_heatmap_factor_residual_model_name,
    load_or_fit_named_round_heatmap_factor_residual_predictor,
)
from astar.student.predictor.round_heatmap_residual_memory import (
    is_round_heatmap_residual_memory_model_name,
    load_or_fit_named_round_heatmap_residual_memory_predictor,
)
from astar.student.predictor.round_heatmap_prototype_residual import (
    is_round_heatmap_prototype_residual_model_name,
    load_or_fit_named_round_heatmap_prototype_residual_predictor,
)
from astar.student.predictor.round_heatmap_kernel_residual import (
    is_round_heatmap_kernel_residual_model_name,
    load_or_fit_named_round_heatmap_kernel_residual_predictor,
)
from astar.student.predictor.round_settlement_graph_factor_residual import (
    is_round_settlement_graph_factor_residual_model_name,
    load_or_fit_named_round_settlement_graph_factor_residual_predictor,
)
from astar.student.predictor.round_multiview_factor_residual import (
    is_round_multiview_factor_residual_model_name,
    load_or_fit_named_round_multiview_factor_residual_predictor,
)
from astar.student.predictor.settlement_state_field_blend import (
    is_settlement_state_field_blend_model_name,
    load_or_fit_named_settlement_state_field_blend_predictor,
)
from astar.student.predictor.observation_likelihood_mixture import (
    is_obs_likelihood_model_name,
    load_or_fit_named_obs_likelihood_predictor,
)
from astar.student.predictor.coefficient_inverse import (
    is_coeff_inverse_model_name,
    load_or_fit_named_coeff_inverse_predictor,
)
from astar.student.predictor.spatial_observation_correction import (
    is_spatial_correction_model_name,
    load_or_fit_named_spatial_correction_predictor,
)


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
    samples_per_round: int | None = None,
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
    if is_query_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_query_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_summary_bank_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_summary_bank_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_evidence_field_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_evidence_field_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_transcript_memory_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_transcript_memory_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_transcript_residual_memory_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_transcript_residual_memory_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_transcript_sequence_residual_memory_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_transcript_sequence_residual_memory_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_transcript_sequence_factor_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_transcript_sequence_factor_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_transcript_residual_memory_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_transcript_residual_memory_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_transcript_factor_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_transcript_factor_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_transcript_prototype_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_transcript_prototype_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_heatmap_factor_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_heatmap_factor_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_heatmap_residual_memory_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_heatmap_residual_memory_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_heatmap_prototype_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_heatmap_prototype_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_heatmap_kernel_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_heatmap_kernel_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_settlement_graph_factor_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_settlement_graph_factor_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_round_multiview_factor_residual_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_round_multiview_factor_residual_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_settlement_state_field_blend_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_settlement_state_field_blend_predictor(
            workspace_paths,
            model_name=normalized,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_obs_likelihood_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_obs_likelihood_predictor(
            normalized,
            paths=workspace_paths,
            historical_round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_coeff_inverse_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_coeff_inverse_predictor(
            normalized,
            paths=workspace_paths,
            historical_round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if is_spatial_correction_model_name(normalized):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        resolved_policy_name = (policy_name or "coverage").strip().lower()
        predictor = load_or_fit_named_spatial_correction_predictor(
            normalized,
            paths=workspace_paths,
            historical_round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=resolved_policy_name,
            samples_per_round=samples_per_round,
        )
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
