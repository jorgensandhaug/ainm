from __future__ import annotations

from astar.core.trajectory import LiveQueryObs
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.features.geometry import compute_round_features
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext


def round_context_to_online_episode(
    round_context: RoundContext,
    observations: tuple[LiveQueryObs, ...] = (),
) -> OnlineEpisodeSample:
    return OnlineEpisodeSample(
        round_context=round_context,
        transcript=OnlineTranscript(observations=tuple(observations)),
    )


def round_context_to_live_inference_context(
    round_context: RoundContext,
    observations: tuple[LiveQueryObs, ...] = (),
) -> LiveInferenceContext:
    round_detail = round_context.to_round_detail()
    return LiveInferenceContext(
        online_episode=round_context_to_online_episode(round_context, observations),
        geometry_bundle=compute_round_features(round_detail),
        evidence_bundle=build_round_evidence_from_observations(round_detail, observations),
    )


def round_context_to_evidence(
    round_context: RoundContext,
    observations: tuple[LiveQueryObs, ...] = (),
) -> RoundEvidenceBundle:
    return build_round_evidence_from_observations(round_context.to_round_detail(), observations)


__all__ = [
    "round_context_to_evidence",
    "round_context_to_live_inference_context",
    "round_context_to_online_episode",
]
