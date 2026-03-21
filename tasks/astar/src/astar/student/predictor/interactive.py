from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import OnlinePredictor, TranscriptBeliefState
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.artifacts.paths import WorkspacePaths
from astar.student.predictor.greybox_cellknn import GreyboxCellKnnPredictor
from astar.student.predictor.greybox_cellknn_perround import GreyboxCellKnnPerRoundPredictor
from astar.student.predictor.greybox_stacked_v01 import GreyboxStackedPredictor
from astar.student.predictor.greybox_obsval_ensemble import GreyboxObsValEnsemblePredictor
from astar.student.predictor.greybox_roundmatch import GreyboxRoundMatchPredictor
from astar.student.predictor.greybox_gated_hybrid import GreyboxGatedHybridPredictor
from astar.student.predictor.greybox_coefficient_knn import GreyboxCoefficientKnnPredictor
from astar.student.predictor.greybox_coefficient_knn import GreyboxLowRankCoefficientHybridPredictor
from astar.student.predictor.greybox_hazard_bayesfamily import (
    bayesfamily_model_names,
    fit_named_bayesfamily_predictor,
)
from astar.student.predictor.greybox_hazard_clusteredbayes import GreyboxHazardClusteredBayesPredictor
from astar.student.predictor.greybox_hazard_clusteredmanifold import GreyboxHazardClusteredManifoldPredictor
from astar.student.predictor.greybox_hazard_mixture import GreyboxHazardMixturePredictor
from astar.student.predictor.greybox_hazard_phasefactored import GreyboxHazardPhaseFactoredPredictor
from astar.student.predictor.greybox_regime import (
    GreyboxHazardLowRankPredictor,
    GreyboxLowRankQueryResidualHybridPredictor,
    GreyboxRegimeKnnPredictor,
    GreyboxRegimeRidgePredictor,
)
from astar.student.predictor.greybox_student_joint import GreyboxStudentJointPredictor
from astar.student.predictor.greybox_student_joint_repeataware import (
    GreyboxStudentJointRepeatAwarePredictor,
)
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
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
    if normalized == "greybox_regime_ridge":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxRegimeRidgePredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_regime_knn":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxRegimeKnnPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hazard_lowrank":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxHazardLowRankPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hazard_phasefactored":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxHazardPhaseFactoredPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hazard_clusteredmanifold":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxHazardClusteredManifoldPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hazard_clusteredbayes":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxHazardClusteredBayesPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized in bayesfamily_model_names():
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = fit_named_bayesfamily_predictor(
            model_name,
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_student_joint":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxStudentJointPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized in {"greybox_student_joint_repeataware", "greybox_student_joint_repeataware_v01"}:
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxStudentJointRepeatAwarePredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_coefficient_knn":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxCoefficientKnnPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hybrid_lowrank_coefficientknn":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxLowRankCoefficientHybridPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hazard_mixture":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxHazardMixturePredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hybrid_lowrank_queryres":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxLowRankQueryResidualHybridPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_hybrid_lowrank_queryres_w45":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxLowRankQueryResidualHybridPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
            lowrank_weight=0.45,
            model_name="greybox_hybrid_lowrank_queryres_w45_v01",
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_gated_hybrid":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxGatedHybridPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_cellknn":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxCellKnnPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_cellknn_perround":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxCellKnnPerRoundPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_roundmatch":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxRoundMatchPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized.startswith("greybox_stacked"):
        workspace_paths = paths or WorkspacePaths.from_root(".")
        # Parse weight from model name: greybox_stacked_w25 -> 0.25
        weight = 0.5  # default
        use_hybrid = "hybrid" in normalized
        if "_w" in normalized:
            try:
                # Extract numeric part after _w, before any other _
                parts = normalized.split("_w")
                w_part = parts[-1].split("_")[0] if parts[-1] else ""
                if w_part.isdigit():
                    weight = int(w_part) / 100.0
            except (ValueError, IndexError):
                pass
        predictor = GreyboxStackedPredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
            cellknn_feature_weight=weight,
            model_name=normalized,
            use_lowrank_hybrid=use_hybrid,
        )
        return RoundPredictorAdapter(
            predictor=predictor,
            name=predictor.name,
        )
    if normalized == "greybox_obsval_ensemble":
        workspace_paths = paths or WorkspacePaths.from_root(".")
        predictor = GreyboxObsValEnsemblePredictor.fit_from_workspace(
            workspace_paths,
            round_ids=None if historical_round_ids is None else list(historical_round_ids),
            policy_name=(policy_name or "coverage").strip().lower(),
            samples_per_round=samples_per_round,
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
