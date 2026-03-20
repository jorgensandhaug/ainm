from __future__ import annotations

import hashlib

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.executor import execute_query_plan
from astar.observe.planner import build_policy_plan
from astar.observe.policies.registry import build_named_policy
from astar.workflows.replay_round import replay_round
from astar.workflows.results import ExplorationRunResult
from astar.workflows.submissions import build_submission, submit_saved_prediction
from astar.workflows.sync_round import sync_round


def _policy_config_hash(policy_name: str) -> str:
    digest = hashlib.sha1(policy_name.encode("utf-8")).hexdigest()
    return digest[:12]


def explore_round(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    baseline_model: str = "static_semantic",
    submit_baseline: bool = True,
    dry_run: bool = False,
) -> ExplorationRunResult:
    sync_result = sync_round(paths, client, round_id)
    round_record = read_round_record(paths, round_id)
    if round_record.round.status != "active":
        msg = f"round {round_id} is not active: {round_record.round.status}"
        raise ValueError(msg)

    policy = build_named_policy("exploration")
    planned = build_policy_plan(
        policy,
        round_record.round,
        paths.artifacts_dir / "runs" / f"round_id={round_id}_policy={policy.name}.json",
    )

    query_run_result = None
    replay_result = None
    if not dry_run:
        query_run_result = execute_query_plan(
            paths,
            client,
            planned.plan,
            config_hash=_policy_config_hash(planned.policy_name),
        )
        replay_result = replay_round(paths, round_id)

    submission_build_result = None
    submission_results = []
    if submit_baseline and not dry_run:
        submission_build_result = build_submission(paths, round_id, baseline_model)
        for seed_index in range(round_record.round.seeds_count):
            submission_results.append(
                submit_saved_prediction(paths, client, round_id, seed_index),
            )

    return ExplorationRunResult(
        round_id=round_id,
        round_number=round_record.round.round_number,
        round_path=sync_result.round_path,
        plan_path=planned.plan_path,
        planned_queries=planned.query_count,
        dry_run=dry_run,
        baseline_model=(baseline_model if submit_baseline and not dry_run else None),
        sync_result=sync_result,
        query_run_result=query_run_result,
        replay_result=replay_result,
        submission_build_result=submission_build_result,
        submission_results=submission_results,
    )
