from __future__ import annotations

import json

import numpy as np

from astar.eval.backtest import backtest_round_from_saved_analyses
from astar.eval.diagnostics import build_round_episode_diagnostics
from astar.eval.reports import (
    render_backtest_round_report,
    render_round_episode_diagnostics,
)
from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    read_analysis_records,
    read_round_record,
    save_named_arrays,
)
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import build_round_evidence
from astar.workflows.results import (
    MaterializedSeedArtifacts,
    MaterializeEpisodeResult,
)
from astar.workflows.summarize_replays import summarize_round_replays


def _load_existing_materialization(
    paths: WorkspacePaths,
    round_id: str,
) -> MaterializeEpisodeResult | None:
    summary_path = paths.episode_dir(round_id) / "summary.json"
    if not summary_path.exists():
        return None
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    per_seed = [
        MaterializedSeedArtifacts.model_validate(item)
        for item in payload.get("per_seed", [])
    ]
    for seed_result in per_seed:
        if not seed_result.feature_path.exists() or not seed_result.evidence_path.exists():
            return None
        if seed_result.replay_summary_path is not None and not seed_result.replay_summary_path.exists():
            return None
    diagnostics = build_round_episode_diagnostics(paths, round_id)
    replay_report_path = payload.get("replay_report_path")
    return MaterializeEpisodeResult(
        round_id=round_id,
        round_number=int(payload.get("round_number", -1)),
        summary_path=summary_path,
        report_path=paths.episode_dir(round_id) / "report.md",
        replay_report_path=None if replay_report_path is None else replay_report_path,
        feature_names=list(payload.get("feature_names", [])),
        per_seed=per_seed,
        diagnostics=diagnostics,
        replay_round_summary=None,
        backtest_result=None,
    )


def _feature_payload(
    initial_grid: np.ndarray,
    seed_features: dict[str, np.ndarray],
    settlement_x: np.ndarray,
    settlement_y: np.ndarray,
    settlement_has_port: np.ndarray,
    settlement_alive: np.ndarray,
) -> dict[str, np.ndarray]:
    feature_names = sorted(seed_features)
    feature_stack = np.stack([seed_features[name] for name in feature_names], axis=0)
    return {
        "feature_names": np.asarray(feature_names, dtype=np.str_),
        "feature_stack": feature_stack.astype(np.float64),
        "initial_grid": initial_grid.astype(np.int64),
        "settlement_x": settlement_x.astype(np.int64),
        "settlement_y": settlement_y.astype(np.int64),
        "settlement_has_port": settlement_has_port.astype(np.int64),
        "settlement_alive": settlement_alive.astype(np.int64),
    }


def _evidence_payload(
    query_count: int,
    repeated_window_groups: int,
    coverage_counts: np.ndarray,
    observed_class_counts: np.ndarray,
    observed_class_frequencies: np.ndarray,
    observed_class_count_tensor: np.ndarray,
    mean_population: float | None,
    mean_food: float | None,
    mean_wealth: float | None,
    mean_defense: float | None,
) -> dict[str, np.ndarray]:
    def _optional_scalar(value: float | None) -> np.ndarray:
        if value is None:
            return np.asarray([np.nan], dtype=np.float64)
        return np.asarray([value], dtype=np.float64)

    return {
        "query_count": np.asarray([query_count], dtype=np.int64),
        "repeated_window_groups": np.asarray([repeated_window_groups], dtype=np.int64),
        "coverage_counts": coverage_counts.astype(np.int64),
        "observed_class_counts": observed_class_counts.astype(np.int64),
        "observed_class_frequencies": observed_class_frequencies.astype(np.float64),
        "observed_class_count_tensor": observed_class_count_tensor.astype(np.int64),
        "mean_population": _optional_scalar(mean_population),
        "mean_food": _optional_scalar(mean_food),
        "mean_wealth": _optional_scalar(mean_wealth),
        "mean_defense": _optional_scalar(mean_defense),
    }


def materialize_round_episode(
    paths: WorkspacePaths,
    round_id: str,
) -> MaterializeEpisodeResult:
    existing = _load_existing_materialization(paths, round_id)
    if existing is not None:
        return existing

    round_record = read_round_record(paths, round_id)
    features = compute_round_features(round_record.round)
    evidence = build_round_evidence(paths, round_id)
    diagnostics = build_round_episode_diagnostics(paths, round_id)
    analyses = read_analysis_records(paths, round_id)
    round_episode = build_round_episode(paths, round_id)
    replay_round_summary = None
    replay_report_path = None
    if round_episode.replay_run_count > 0:
        replay_result = summarize_round_replays(paths, round_id)
        replay_round_summary = replay_result.hazard_summary
        replay_report_path = replay_result.report_path

    feature_names: list[str] | None = None
    per_seed: list[MaterializedSeedArtifacts] = []
    for seed_index in range(round_record.round.seeds_count):
        seed_features = features.per_seed[seed_index]
        seed_evidence = evidence.per_seed[seed_index]
        initial_state = round_record.round.initial_states[seed_index]
        initial_grid = np.asarray(initial_state.grid, dtype=np.int64)

        feature_path = save_named_arrays(
            paths.feature_tensor_path(round_id, seed_index),
            _feature_payload(
                initial_grid=initial_grid,
                seed_features=seed_features.features,
                settlement_x=np.asarray(
                    [item.x for item in initial_state.settlements],
                    dtype=np.int64,
                ),
                settlement_y=np.asarray(
                    [item.y for item in initial_state.settlements],
                    dtype=np.int64,
                ),
                settlement_has_port=np.asarray(
                    [int(item.has_port) for item in initial_state.settlements],
                    dtype=np.int64,
                ),
                settlement_alive=np.asarray(
                    [int(item.alive) for item in initial_state.settlements],
                    dtype=np.int64,
                ),
            ),
        )
        evidence_path = save_named_arrays(
            paths.evidence_tensor_path(round_id, seed_index),
            _evidence_payload(
                query_count=seed_evidence.query_count,
                repeated_window_groups=seed_evidence.repeated_window_groups,
                coverage_counts=seed_evidence.coverage_counts,
                observed_class_counts=seed_evidence.observed_class_counts,
                observed_class_frequencies=seed_evidence.observed_class_frequencies,
                observed_class_count_tensor=seed_evidence.observed_class_count_tensor,
                mean_population=seed_evidence.mean_population,
                mean_food=seed_evidence.mean_food,
                mean_wealth=seed_evidence.mean_wealth,
                mean_defense=seed_evidence.mean_defense,
            ),
        )
        if feature_names is None:
            feature_names = sorted(seed_features.features)
        per_seed.append(
            MaterializedSeedArtifacts(
                seed_index=seed_index,
                feature_path=feature_path,
                evidence_path=evidence_path,
                replay_summary_path=(
                    paths.replay_summary_path(round_id, seed_index)
                    if paths.replay_summary_path(round_id, seed_index).exists()
                    else None
                ),
                replay_run_count=len(round_episode.seeds[seed_index].replay_runs),
                has_prediction=paths.prediction_tensor_path(round_id, seed_index).exists(),
                has_analysis=seed_index in analyses,
            ),
        )

    backtest_result = None
    if analyses and all(
        paths.prediction_tensor_path(round_id, seed_index).exists() for seed_index in analyses
    ):
        backtest_result = backtest_round_from_saved_analyses(paths, round_id)

    result = MaterializeEpisodeResult(
        round_id=round_id,
        round_number=round_record.round.round_number,
        summary_path=paths.episode_dir(round_id) / "summary.json",
        report_path=paths.episode_dir(round_id) / "report.md",
        replay_report_path=replay_report_path,
        feature_names=feature_names or [],
        per_seed=per_seed,
        diagnostics=diagnostics,
        replay_round_summary=replay_round_summary,
        backtest_result=backtest_result,
    )
    result.summary_path.parent.mkdir(parents=True, exist_ok=True)
    result.summary_path.write_text(
        json.dumps(to_jsonable(result), indent=2),
        encoding="utf-8",
    )

    report_lines = [
        f"# Episode {result.round_number} {result.round_id}",
        "",
        render_round_episode_diagnostics(diagnostics),
        "",
        f"feature_names: {', '.join(result.feature_names)}",
    ]
    if replay_round_summary is not None:
        report_lines.extend(
            [
                "",
                f"replay_seed_count: {replay_round_summary.replay_seed_count}",
                f"replay_run_count: {replay_round_summary.replay_run_count}",
                f"replay_report: {replay_report_path}",
                f"replay_coefficients_mean: {replay_round_summary.coefficient_mean.tolist()}",
            ],
        )
    if backtest_result is not None:
        report_lines.extend(["", render_backtest_round_report(backtest_result)])
    result.report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    try:
        CatalogDB(paths.catalog_path).log_event(
            CatalogEvent(
                event_kind="episode_materialized",
                round_id=round_id,
                status="ok",
                artifact_path=result.summary_path,
                payload_json=to_jsonable(result),
            ),
        )
    except Exception:
        pass
    return result
