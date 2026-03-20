from __future__ import annotations

import json

from astar.envs import CompetitionEvaluator
from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor
from astar.envs.synthetic import SyntheticActiveOracle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.online_episode import run_online_episode
from astar.workflows.results import SyntheticTournamentResult


def run_synthetic_tournament(
    paths: WorkspacePaths,
    *,
    round_id: str,
    predictor: OnlinePredictor,
    policy: InteractiveQueryPolicy,
    budget: int = 50,
    episode_seed: int = 0,
) -> SyntheticTournamentResult:
    oracle = SyntheticActiveOracle(paths=paths)
    evaluator = CompetitionEvaluator()
    online_episode = run_online_episode(
        oracle,
        round_id=round_id,
        predictor=predictor,
        policy=policy,
        budget=budget,
        episode_seed=episode_seed,
    )
    score_by_seed = evaluator.score_prediction(
        online_episode.prediction_bundle,
        oracle.get_ground_truth(round_id),
    )
    mean_score = sum(item.score for item in score_by_seed.values()) / float(len(score_by_seed))
    mean_weighted_kl = sum(item.weighted_kl for item in score_by_seed.values()) / float(
        len(score_by_seed),
    )
    artifact_path = (
        paths.artifacts_dir
        / "runs"
        / (
            "synthetic_tournament__"
            f"round_id={round_id}__policy={policy.name}__predictor={predictor.name}"
            f"__episode_seed={episode_seed}.json"
        )
    )
    result = SyntheticTournamentResult(
        round_id=round_id,
        round_number=online_episode.round_context.round_number,
        oracle_name=oracle.name,
        predictor_name=predictor.name,
        policy_name=policy.name,
        episode_seed=episode_seed,
        budget=budget,
        executed_queries=online_episode.executed_queries,
        mean_score=mean_score,
        mean_weighted_kl=mean_weighted_kl,
        score_by_seed=score_by_seed,
        query_trace=online_episode.query_trace,
        artifact_path=artifact_path,
    )
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="synthetic_tournament",
            round_id=round_id,
            spec_name=f"{policy.name}+{predictor.name}",
            status="ok",
            artifact_path=artifact_path,
            payload_json={
                "budget": budget,
                "episode_seed": episode_seed,
                "executed_queries": online_episode.executed_queries,
                "mean_score": mean_score,
                "mean_weighted_kl": mean_weighted_kl,
            },
        ),
    )
    return result


__all__ = ["run_synthetic_tournament"]
