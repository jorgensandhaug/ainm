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
from astar.student.predictor.round import BaseRoundPredictor

SMH_RESID_LOCALGATE_V001 = "smh_resid_z12_h0_covbase_locgate_v001"
QUERY_RESIDUAL_V8 = "query_residual_v8"
QUERY_RESIDUAL_V9 = "query_residual_v9"
QUERY_RESIDUAL_V10 = "query_residual_v10"
QUERY_RESIDUAL_V9_LOCALGATE_V001 = "query_residual_v9_locgate_v001"


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


def _build_query_residual_adapter(
    workspace_paths: WorkspacePaths,
    *,
    historical_round_ids: Sequence[str] | None,
    policy_name: str | None,
    samples_per_round: int | None,
    checkpoint_stem: str,
    model_name: str,
    fit_kwargs: dict[str, object] | None = None,
) -> RoundPredictorAdapter:
    resolved_policy_name = (policy_name or "coverage").strip().lower()
    fit_kwargs = {} if fit_kwargs is None else dict(fit_kwargs)
    if samples_per_round is not None:
        fit_kwargs.setdefault("samples_per_round", samples_per_round)
    if historical_round_ids is not None:
        predictor = QueryResidualPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=list(historical_round_ids),
            policy_name=resolved_policy_name,
            model_name=model_name,
            **fit_kwargs,
        )
    else:
        samples_suffix = ""
        if samples_per_round is not None:
            samples_suffix = f"__samples={samples_per_round}"
        checkpoint_dir = workspace_paths.model_dir(
            f"{checkpoint_stem}__policy={resolved_policy_name}{samples_suffix}",
        )
        checkpoint_path = checkpoint_dir / "checkpoint.json"
        if checkpoint_path.exists():
            predictor = QueryResidualPredictor.load_checkpoint(checkpoint_path)
        else:
            predictor = QueryResidualPredictor.fit_from_workspace(
                workspace_paths,
                policy_name=resolved_policy_name,
                model_name=model_name,
                **fit_kwargs,
            )
            predictor.save_checkpoint(checkpoint_path)
    return RoundPredictorAdapter(
        predictor=predictor,
        name=predictor.name,
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
    if normalized == "query_residual":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem="query_residual_v7",
            model_name="query_residual_v7",
        )
    if normalized == QUERY_RESIDUAL_V8:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V8,
            model_name=QUERY_RESIDUAL_V8,
            fit_kwargs={
                "cell_selection_strategy": "stratified_entropy",
                "include_exact_local_residual": True,
            },
        )
    if normalized == QUERY_RESIDUAL_V9:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V9,
            model_name=QUERY_RESIDUAL_V9,
            fit_kwargs={
                "include_exact_local_residual": True,
            },
        )
    if normalized == QUERY_RESIDUAL_V10:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V10,
            model_name=QUERY_RESIDUAL_V10,
            fit_kwargs={
                "cell_selection_strategy": "top_heavy_stratified_entropy",
                "include_exact_local_residual": True,
            },
        )
    if normalized == QUERY_RESIDUAL_V9_LOCALGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=QUERY_RESIDUAL_V9_LOCALGATE_V001,
            model_name=QUERY_RESIDUAL_V9_LOCALGATE_V001,
            fit_kwargs={
                "include_exact_local_residual": True,
                "min_delta_scale": 0.0,
                "teacher_locality_blend": True,
            },
        )
    if normalized == SMH_RESID_LOCALGATE_V001:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        return _build_query_residual_adapter(
            workspace_paths,
            historical_round_ids=historical_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            checkpoint_stem=SMH_RESID_LOCALGATE_V001,
            model_name=SMH_RESID_LOCALGATE_V001,
            fit_kwargs={
                "min_delta_scale": 0.0,
                "teacher_locality_blend": True,
            },
        )
    msg = f"unsupported online predictor: {model_name}"
    raise ValueError(msg)


__all__ = [
    "OnlinePredictor",
    "RoundPredictorAdapter",
    "build_online_predictor",
]
