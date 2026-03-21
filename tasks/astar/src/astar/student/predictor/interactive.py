from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import OnlinePredictor, TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.birth_posterior import BirthPosteriorEventPredictor
from astar.student.predictor.birth_posterior_specs import (
    resolve_birth_posterior_model_spec,
    supported_birth_posterior_model_names,
)
from astar.student.predictor.heuristic import (
    EventRegimePredictor,
    GeometryPriorPredictor,
    LatentRegimePredictor,
)
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.query_residual_birth_blend import QueryResidualBirthBlendPredictor
from astar.student.predictor.query_residual_birth_blend_specs import (
    resolve_query_residual_birth_blend_model_spec,
    supported_query_residual_birth_blend_model_names,
)
from astar.student.predictor.query_residual_specs import (
    resolve_query_residual_model_spec,
    supported_query_residual_model_names,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_birth_hybrid import SummaryBirthHybridPredictor
from astar.student.predictor.summary_birth_hybrid_specs import (
    resolve_summary_birth_hybrid_model_spec,
    supported_summary_birth_hybrid_model_names,
)
from astar.student.predictor.summary_bank_decoder import SummaryBankDecoderPredictor
from astar.student.predictor.summary_bank_decoder_specs import (
    resolve_summary_bank_decoder_model_spec,
    supported_summary_bank_decoder_model_names,
)
from astar.student.predictor.summary_rate_decoder import SummaryRateDecoderPredictor
from astar.student.predictor.summary_rate_decoder_specs import (
    resolve_summary_rate_decoder_model_spec,
    supported_summary_rate_decoder_model_names,
)
from astar.student.predictor.summary_rate_lawbank import SummaryRateLawBankPredictor
from astar.student.predictor.summary_rate_lawbank_specs import (
    resolve_summary_rate_lawbank_model_spec,
    supported_summary_rate_lawbank_model_names,
)
from astar.student.predictor.summary_rate_residual_lawbank import SummaryRateResidualLawBankPredictor
from astar.student.predictor.summary_rate_residual_lawbank_specs import (
    resolve_summary_rate_residual_lawbank_model_spec,
    supported_summary_rate_residual_lawbank_model_names,
)
from astar.student.predictor.summary_roundlaw import SummaryRoundLawPredictor
from astar.student.predictor.summary_roundlaw_specs import (
    resolve_summary_roundlaw_model_spec,
    supported_summary_roundlaw_model_names,
)
from astar.student.predictor.summary_roundlaw_decoder import SummaryRoundLawDecoderPredictor
from astar.student.predictor.summary_roundlaw_decoder_specs import (
    resolve_summary_roundlaw_decoder_model_spec,
    supported_summary_roundlaw_decoder_model_names,
)
from astar.student.predictor.summary_bank import SummaryBankTeacherPredictor
from astar.student.predictor.summary_bank_specs import (
    resolve_summary_bank_model_spec,
    supported_summary_bank_model_names,
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
    if normalized == "f1_event_regime_v01":
        event_predictor = EventRegimePredictor()
        return RoundPredictorAdapter(
            predictor=event_predictor,
            name=event_predictor.name,
        )
    birth_posterior_spec = resolve_birth_posterior_model_spec(normalized)
    if birth_posterior_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = BirthPosteriorEventPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=birth_posterior_spec.policy_name,
            budget=birth_posterior_spec.budget,
            samples_per_round=birth_posterior_spec.samples_per_round,
            k_neighbors=birth_posterior_spec.k_neighbors,
            birth_signal_scale=birth_posterior_spec.birth_signal_scale,
            birth_gain=birth_posterior_spec.birth_gain,
            maritime_from_birth=birth_posterior_spec.maritime_from_birth,
            model_name=birth_posterior_spec.model_name,
            probability_floor=birth_posterior_spec.probability_floor,
            birth_dataset_name=birth_posterior_spec.birth_dataset_name,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_bank_spec = resolve_summary_bank_model_spec(normalized)
    if summary_bank_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryBankTeacherPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=summary_bank_spec.policy_name,
            budget=summary_bank_spec.budget,
            samples_per_round=summary_bank_spec.samples_per_round,
            k_neighbors=summary_bank_spec.k_neighbors,
            model_name=summary_bank_spec.model_name,
            probability_floor=summary_bank_spec.probability_floor,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_birth_hybrid_spec = resolve_summary_birth_hybrid_model_spec(normalized)
    if summary_birth_hybrid_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryBirthHybridPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=summary_birth_hybrid_spec.policy_name,
            budget=summary_birth_hybrid_spec.budget,
            samples_per_round=summary_birth_hybrid_spec.samples_per_round,
            k_neighbors=summary_birth_hybrid_spec.k_neighbors,
            birth_signal_scale=summary_birth_hybrid_spec.birth_signal_scale,
            birth_gain=summary_birth_hybrid_spec.birth_gain,
            maritime_from_birth=summary_birth_hybrid_spec.maritime_from_birth,
            teacher_gain=summary_birth_hybrid_spec.teacher_gain,
            settlement_gain=summary_birth_hybrid_spec.settlement_gain,
            port_gain=summary_birth_hybrid_spec.port_gain,
            ruin_gain=summary_birth_hybrid_spec.ruin_gain,
            forest_gain=summary_birth_hybrid_spec.forest_gain,
            delta_clip=summary_birth_hybrid_spec.delta_clip,
            birth_mode=summary_birth_hybrid_spec.birth_mode,
            birth_local_gain=summary_birth_hybrid_spec.birth_local_gain,
            model_name=summary_birth_hybrid_spec.model_name,
            probability_floor=summary_birth_hybrid_spec.probability_floor,
            birth_dataset_name=summary_birth_hybrid_spec.birth_dataset_name,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_bank_decoder_spec = resolve_summary_bank_decoder_model_spec(normalized)
    if summary_bank_decoder_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryBankDecoderPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=policy_name or "coverage",
            budget=summary_bank_decoder_spec.budget,
            samples_per_round=summary_bank_decoder_spec.samples_per_round,
            k_neighbors=summary_bank_decoder_spec.k_neighbors,
            model_name=summary_bank_decoder_spec.model_name,
            probability_floor=summary_bank_decoder_spec.probability_floor,
            ridge_lambda=summary_bank_decoder_spec.ridge_lambda,
            include_teacher_logits=summary_bank_decoder_spec.include_teacher_logits,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_rate_decoder_spec = resolve_summary_rate_decoder_model_spec(normalized)
    if summary_rate_decoder_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryRateDecoderPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=policy_name or "coverage",
            budget=summary_rate_decoder_spec.budget,
            samples_per_round=summary_rate_decoder_spec.samples_per_round,
            k_neighbors=summary_rate_decoder_spec.k_neighbors,
            model_name=summary_rate_decoder_spec.model_name,
            probability_floor=summary_rate_decoder_spec.probability_floor,
            ridge_lambda=summary_rate_decoder_spec.ridge_lambda,
            include_teacher_logits=summary_rate_decoder_spec.include_teacher_logits,
            target_family=summary_rate_decoder_spec.target_family,
            summary_feature_variant=summary_rate_decoder_spec.summary_feature_variant,
            active_class_indices=summary_rate_decoder_spec.active_class_indices,
            active_delta_gate=summary_rate_decoder_spec.active_delta_gate,
            design_variant=summary_rate_decoder_spec.design_variant,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_rate_lawbank_spec = resolve_summary_rate_lawbank_model_spec(normalized)
    if summary_rate_lawbank_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryRateLawBankPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=policy_name or "coverage",
            budget=summary_rate_lawbank_spec.budget,
            samples_per_round=summary_rate_lawbank_spec.samples_per_round,
            k_neighbors=summary_rate_lawbank_spec.k_neighbors,
            model_name=summary_rate_lawbank_spec.model_name,
            probability_floor=summary_rate_lawbank_spec.probability_floor,
            ridge_lambda=summary_rate_lawbank_spec.ridge_lambda,
            include_teacher_logits=summary_rate_lawbank_spec.include_teacher_logits,
            target_family=summary_rate_lawbank_spec.target_family,
            summary_feature_variant=summary_rate_lawbank_spec.summary_feature_variant,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_rate_residual_lawbank_spec = resolve_summary_rate_residual_lawbank_model_spec(normalized)
    if summary_rate_residual_lawbank_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryRateResidualLawBankPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=policy_name or "coverage",
            budget=summary_rate_residual_lawbank_spec.budget,
            samples_per_round=summary_rate_residual_lawbank_spec.samples_per_round,
            k_neighbors=summary_rate_residual_lawbank_spec.k_neighbors,
            model_name=summary_rate_residual_lawbank_spec.model_name,
            probability_floor=summary_rate_residual_lawbank_spec.probability_floor,
            ridge_lambda=summary_rate_residual_lawbank_spec.ridge_lambda,
            target_family=summary_rate_residual_lawbank_spec.target_family,
            summary_feature_variant=summary_rate_residual_lawbank_spec.summary_feature_variant,
            residual_active_class_indices=summary_rate_residual_lawbank_spec.residual_active_class_indices,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_roundlaw_spec = resolve_summary_roundlaw_model_spec(normalized)
    if summary_roundlaw_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryRoundLawPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=summary_roundlaw_spec.policy_name,
            budget=summary_roundlaw_spec.budget,
            samples_per_round=summary_roundlaw_spec.samples_per_round,
            k_neighbors=summary_roundlaw_spec.k_neighbors,
            law_rank=summary_roundlaw_spec.law_rank,
            ridge_alpha=summary_roundlaw_spec.ridge_alpha,
            model_name=summary_roundlaw_spec.model_name,
            probability_floor=summary_roundlaw_spec.probability_floor,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    summary_roundlaw_decoder_spec = resolve_summary_roundlaw_decoder_model_spec(normalized)
    if summary_roundlaw_decoder_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = SummaryRoundLawDecoderPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=policy_name or "coverage",
            budget=summary_roundlaw_decoder_spec.budget,
            samples_per_round=summary_roundlaw_decoder_spec.samples_per_round,
            k_neighbors=summary_roundlaw_decoder_spec.k_neighbors,
            model_name=summary_roundlaw_decoder_spec.model_name,
            probability_floor=summary_roundlaw_decoder_spec.probability_floor,
            ridge_lambda=summary_roundlaw_decoder_spec.ridge_lambda,
            law_rank=summary_roundlaw_decoder_spec.law_rank,
            include_teacher_logits=summary_roundlaw_decoder_spec.include_teacher_logits,
            summary_feature_variant=summary_roundlaw_decoder_spec.summary_feature_variant,
            guide_target_family=summary_roundlaw_decoder_spec.guide_target_family,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    query_residual_birth_blend_spec = resolve_query_residual_birth_blend_model_spec(normalized)
    if query_residual_birth_blend_spec is not None:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = QueryResidualBirthBlendPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=query_residual_birth_blend_spec.policy_name,
            model_name=query_residual_birth_blend_spec.model_name,
            probability_floor=query_residual_birth_blend_spec.probability_floor,
            query_samples_per_round=query_residual_birth_blend_spec.query_samples_per_round,
            query_cells_per_seed=query_residual_birth_blend_spec.query_cells_per_seed,
            query_budget_prefixes=query_residual_birth_blend_spec.query_budget_prefixes,
            query_ridge_lambda=query_residual_birth_blend_spec.query_ridge_lambda,
            query_temperature=query_residual_birth_blend_spec.query_temperature,
            query_prior_blend=query_residual_birth_blend_spec.query_prior_blend,
            query_signal_scale=query_residual_birth_blend_spec.query_signal_scale,
            query_min_delta_scale=query_residual_birth_blend_spec.query_min_delta_scale,
            query_residual_class_scale=query_residual_birth_blend_spec.query_residual_class_scale,
            query_teacher_blend=query_residual_birth_blend_spec.query_teacher_blend,
            query_beta_min=query_residual_birth_blend_spec.query_beta_min,
            query_beta_scale=query_residual_birth_blend_spec.query_beta_scale,
            birth_budget=query_residual_birth_blend_spec.birth_budget,
            birth_samples_per_round=query_residual_birth_blend_spec.birth_samples_per_round,
            birth_k_neighbors=query_residual_birth_blend_spec.birth_k_neighbors,
            birth_signal_scale=query_residual_birth_blend_spec.birth_signal_scale,
            birth_gain=query_residual_birth_blend_spec.birth_gain,
            birth_dataset_name=query_residual_birth_blend_spec.birth_dataset_name,
            settlement_gain=query_residual_birth_blend_spec.settlement_gain,
            port_gain=query_residual_birth_blend_spec.port_gain,
            empty_penalty=query_residual_birth_blend_spec.empty_penalty,
            forest_penalty=query_residual_birth_blend_spec.forest_penalty,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
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
                feature_variant=query_residual_spec.feature_variant,
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
                    feature_variant=query_residual_spec.feature_variant,
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
    "supported_birth_posterior_model_names",
    "supported_query_residual_birth_blend_model_names",
    "supported_query_residual_model_names",
    "supported_summary_birth_hybrid_model_names",
    "supported_summary_bank_decoder_model_names",
    "supported_summary_rate_decoder_model_names",
    "supported_summary_rate_lawbank_model_names",
    "supported_summary_rate_residual_lawbank_model_names",
    "supported_summary_roundlaw_model_names",
    "supported_summary_roundlaw_decoder_model_names",
    "supported_summary_bank_model_names",
]
