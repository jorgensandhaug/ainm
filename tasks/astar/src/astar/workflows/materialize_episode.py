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
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    load_named_arrays,
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
    SummarizeReplaysResult,
)
from astar.workflows.summarize_replays import (
    load_round_replay_summary,
    summarize_round_replays,
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


def _replay_run_counts(
    paths: WorkspacePaths,
    round_id: str,
    *,
    seeds_count: int,
) -> tuple[list[int], SummarizeReplaysResult | None]:
    def _counts_from_summary_paths(summary_paths: list[object]) -> list[int]:
        counts = [0] * seeds_count
        for summary_path in summary_paths:
            path_str = str(summary_path)
            stem = path_str.rsplit("/", maxsplit=1)[-1].removesuffix(".npz")
            seed_index = int(stem.split("seed_index=", maxsplit=1)[1])
            payload = load_named_arrays(summary_path)
            counts[seed_index] = int(payload["replay_run_count"][0])
        return counts

    cached = load_round_replay_summary(paths, round_id)
    if cached is not None:
        return _counts_from_summary_paths(cached.summary_paths), cached
    counts: list[int] = []
    for seed_index in range(seeds_count):
        replay_dir = paths.raw_replay_dir(round_id, seed_index)
        if not replay_dir.exists():
            counts.append(0)
            continue
        counts.append(sum(1 for _ in replay_dir.glob("*.json")))
    return counts, None


def materialize_round_episode(
    paths: WorkspacePaths,
    round_id: str,
) -> MaterializeEpisodeResult:
    round_record = read_round_record(paths, round_id)
    replay_run_counts, replay_result = _replay_run_counts(
        paths,
        round_id,
        seeds_count=round_record.round.seeds_count,
    )
    features = compute_round_features(round_record.round)
    evidence = build_round_evidence(paths, round_id)
    diagnostics = build_round_episode_diagnostics(paths, round_id)
    analyses = read_analysis_records(paths, round_id)
    replay_round_summary = None
    replay_event_summary = None
    replay_measurement_summary = None
    replay_report_path = None
    if replay_result is None and sum(replay_run_counts) > 0:
        replay_result = summarize_round_replays(paths, round_id, reuse_existing=True)
        replay_run_counts = _replay_run_counts(
            paths,
            round_id,
            seeds_count=round_record.round.seeds_count,
        )[0]
    if replay_result is not None:
        replay_round_summary = replay_result.hazard_summary
        replay_event_summary = replay_result.event_summary
        replay_measurement_summary = replay_result.measurement_summary
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
                replay_cell_events_path=(
                    paths.replay_cell_event_path(round_id, seed_index)
                    if paths.replay_cell_event_path(round_id, seed_index).exists()
                    else None
                ),
                replay_settlement_events_path=(
                    paths.replay_settlement_event_path(round_id, seed_index)
                    if paths.replay_settlement_event_path(round_id, seed_index).exists()
                    else None
                ),
                replay_site_transition_path=(
                    paths.replay_site_transition_path(round_id, seed_index)
                    if paths.replay_site_transition_path(round_id, seed_index).exists()
                    else None
                ),
                replay_site_opportunities_path=(
                    paths.replay_site_opportunity_path(round_id, seed_index)
                    if paths.replay_site_opportunity_path(round_id, seed_index).exists()
                    else None
                ),
                replay_settlement_measurements_path=(
                    paths.replay_settlement_measurement_path(round_id, seed_index)
                    if paths.replay_settlement_measurement_path(round_id, seed_index).exists()
                    else None
                ),
                replay_live_settlement_transitions_path=(
                    paths.replay_live_settlement_transition_path(round_id, seed_index)
                    if paths.replay_live_settlement_transition_path(round_id, seed_index).exists()
                    else None
                ),
                replay_ruin_transitions_path=(
                    paths.replay_ruin_transition_path(round_id, seed_index)
                    if paths.replay_ruin_transition_path(round_id, seed_index).exists()
                    else None
                ),
                replay_pairwise_candidates_path=(
                    paths.replay_pairwise_candidate_path(round_id, seed_index)
                    if paths.replay_pairwise_candidate_path(round_id, seed_index).exists()
                    else None
                ),
                replay_owner_years_path=(
                    paths.replay_owner_year_path(round_id, seed_index)
                    if paths.replay_owner_year_path(round_id, seed_index).exists()
                    else None
                ),
                replay_year_shocks_path=(
                    paths.replay_year_shock_path(round_id, seed_index)
                    if paths.replay_year_shock_path(round_id, seed_index).exists()
                    else None
                ),
                replay_macro_trajectories_path=(
                    paths.replay_macro_trajectory_path(round_id, seed_index)
                    if paths.replay_macro_trajectory_path(round_id, seed_index).exists()
                    else None
                ),
                replay_run_count=replay_run_counts[seed_index],
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
        replay_event_summary=replay_event_summary,
        replay_measurement_summary=replay_measurement_summary,
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
    if replay_measurement_summary is not None:
        report_lines.extend(
            [
                (
                    "replay_measurements: "
                    f"frames={replay_measurement_summary.frame_transition_count} "
                    f"sites={replay_measurement_summary.site_transition_count} "
                    f"opportunities={replay_measurement_summary.site_opportunity_count} "
                    f"settlements={replay_measurement_summary.settlement_measurement_count} "
                    f"live={replay_measurement_summary.live_settlement_transition_count} "
                    f"ruins={replay_measurement_summary.ruin_transition_count} "
                    f"pairs={replay_measurement_summary.pairwise_candidate_count} "
                    f"owners={replay_measurement_summary.owner_year_count} "
                    f"years={replay_measurement_summary.year_shock_count}"
                    f" macro={replay_measurement_summary.macro_trajectory_count}"
                ),
            ],
        )
    if replay_round_summary is not None:
        for item in per_seed:
            if item.replay_cell_events_path is None and item.replay_settlement_events_path is None:
                continue
            report_lines.extend(
                [
                    f"seed {item.seed_index} replay_cell_events: {item.replay_cell_events_path}",
                    (
                        "seed "
                        f"{item.seed_index} replay_settlement_events: "
                        f"{item.replay_settlement_events_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_site_transitions: "
                        f"{item.replay_site_transition_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_site_opportunities: "
                        f"{item.replay_site_opportunities_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_settlement_measurements: "
                        f"{item.replay_settlement_measurements_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_live_settlement_transitions: "
                        f"{item.replay_live_settlement_transitions_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_ruin_transitions: "
                        f"{item.replay_ruin_transitions_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_pairwise_candidates: "
                        f"{item.replay_pairwise_candidates_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_owner_years: "
                        f"{item.replay_owner_years_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_year_shocks: "
                        f"{item.replay_year_shocks_path}"
                    ),
                    (
                        "seed "
                        f"{item.seed_index} replay_macro_trajectories: "
                        f"{item.replay_macro_trajectories_path}"
                    ),
                ],
            )
    if backtest_result is not None:
        report_lines.extend(["", render_backtest_round_report(backtest_result)])
    result.report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    catalog = CatalogDB(paths.catalog_path)
    catalog.log_event(
        CatalogEvent(
            event_kind="episode_materialized",
            round_id=round_id,
            status="ok",
            artifact_path=result.summary_path,
            payload_json=to_jsonable(result),
        ),
    )
    return result
