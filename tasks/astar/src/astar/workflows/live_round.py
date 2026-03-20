from __future__ import annotations

import hashlib

from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.eval.diagnostics import build_round_episode_diagnostics
from astar.features.geometry import compute_round_features
from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.observe.evidence import build_round_evidence
from astar.observe.executor import execute_query_plan
from astar.observe.planner import build_policy_plan
from astar.workflows.fetch_analysis import fetch_analysis
from astar.workflows.materialize_episode import materialize_round_episode
from astar.workflows.replay_round import replay_round
from astar.workflows.results import FetchAnalysisResult, LiveRoundRunResult
from astar.workflows.specs import LiveRunSpec
from astar.workflows.submissions import persist_prediction_bundle, submit_saved_prediction
from astar.workflows.sync_round import sync_round


def _spec_hash(spec: LiveRunSpec) -> str:
    payload = f"{spec.name}:{spec.policy.__class__.__name__}:{spec.predictor.__class__.__name__}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def run_live_round(
    paths: WorkspacePaths,
    client: AstarApiClient,
    spec: LiveRunSpec,
    round_id: str,
    dry_run: bool = False,
) -> LiveRoundRunResult:
    catalog = CatalogDB(paths.catalog_path)
    sync_result = sync_round(paths, client, round_id)
    catalog.log_event(
        CatalogEvent(
            event_kind="round_synced",
            round_id=round_id,
            status=sync_result.status,
            artifact_path=sync_result.round_path,
            payload_json=sync_result.model_dump(mode="json"),
        ),
    )

    round_record = read_round_record(paths, round_id)
    if round_record.round.status != "active":
        msg = f"round {round_id} is not active: {round_record.round.status}"
        raise ValueError(msg)

    planned = build_policy_plan(
        spec.policy,
        round_record.round,
        paths.live_spec_path(round_id, spec.name),
    )
    query_run_result = None
    replay_result = None
    if not dry_run:
        query_run_result = execute_query_plan(paths, client, planned.plan, _spec_hash(spec))
        catalog.log_event(
            CatalogEvent(
                event_kind="query_recorded",
                round_id=round_id,
                spec_name=spec.name,
                status="ok",
                artifact_path=query_run_result.query_dir,
                payload_json=query_run_result.model_dump(mode="json"),
            ),
        )
        replay_result = replay_round(paths, round_id)
        catalog.log_event(
            CatalogEvent(
                event_kind="round_replayed",
                round_id=round_id,
                spec_name=spec.name,
                status="ok",
                artifact_path=replay_result.query_log_path,
                payload_json=replay_result.model_dump(mode="json"),
            ),
        )

    evidence = build_round_evidence(paths, round_id)
    features = compute_round_features(round_record.round)
    regime_posterior = None
    if hasattr(spec.predictor, "infer_regime_posterior"):
        regime_posterior = spec.predictor.infer_regime_posterior(
            round_record.round,
            features,
            evidence,
        )
    prediction_bundle = spec.predictor.build_prediction_bundle(
        round_record.round,
        features,
        evidence,
    )
    prediction_dir = None
    submitted_predictions = []
    if not dry_run:
        for prediction in prediction_bundle.predictions_by_seed.values():
            validate_prediction_tensor(
                prediction,
                SubmissionSpec(
                    height=round_record.round.map_height,
                    width=round_record.round.map_width,
                ),
            )
        persist_prediction_bundle(
            paths,
            round_id,
            prediction_bundle.model_name,
            prediction_bundle.predictions_by_seed,
        )
        prediction_dir = paths.prediction_dir(round_id)
        catalog.log_event(
            CatalogEvent(
                event_kind="predictions_built",
                round_id=round_id,
                spec_name=spec.name,
                status="ok",
                artifact_path=prediction_dir,
                payload_json={"model_name": prediction_bundle.model_name},
            ),
        )
        if spec.submit_predictions:
            for seed_index in sorted(prediction_bundle.predictions_by_seed):
                submit_result = submit_saved_prediction(paths, client, round_id, seed_index)
                submitted_predictions.append(submit_result)
                catalog.log_event(
                    CatalogEvent(
                        event_kind="prediction_submitted",
                        round_id=round_id,
                        seed_index=seed_index,
                        spec_name=spec.name,
                        status=submit_result.status,
                        artifact_path=submit_result.submission_record_path,
                        payload_json=submit_result.model_dump(mode="json"),
                    ),
                )

    episode_diagnostics = build_round_episode_diagnostics(paths, round_id)
    materialized_episode = materialize_round_episode(paths, round_id)
    catalog.log_event(
        CatalogEvent(
            event_kind="live_run",
            round_id=round_id,
            spec_name=spec.name,
            status="dry_run" if dry_run else "ok",
            artifact_path=planned.plan_path,
            payload_json={
                "model_name": prediction_bundle.model_name,
                "query_count": episode_diagnostics.summary.query_count,
                "submission_count": episode_diagnostics.summary.submission_count,
            },
        ),
    )
    return LiveRoundRunResult(
        spec_name=spec.name,
        round_id=round_id,
        round_number=round_record.round.round_number,
        sync_result=sync_result,
        plan_path=planned.plan_path,
        query_run_result=query_run_result,
        replay_result=replay_result,
        prediction_dir=prediction_dir,
        model_name=prediction_bundle.model_name,
        regime_posterior=regime_posterior,
        submitted_predictions=submitted_predictions,
        episode_diagnostics=episode_diagnostics,
        materialized_episode=materialized_episode,
    )


def fetch_all_round_analyses(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
) -> list[FetchAnalysisResult]:
    round_record = read_round_record(paths, round_id)
    return [
        fetch_analysis(paths, client, round_id, seed_index)
        for seed_index in range(round_record.round.seeds_count)
    ]
