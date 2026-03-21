from __future__ import annotations

import hashlib
import json
import time

from astar.history.summaries.dynamic_law import (
    MAX_FIT_PAIRWISE_ROWS,
    MAX_FIT_SETTLEMENT_ROWS,
)
from astar.history.summaries.dynamic_law_manifold import (
    load_or_build_round_dynamic_law_measurement_bundles,
)
from astar.history.summaries.dynamic_law_validation import (
    DynamicLawMetricSummary,
    DynamicLawRoundValidationReport,
    evaluate_round_dynamic_law_summary,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import EvaluateDynamicLawSummaryResult

_PROFILE_DEFAULTS: dict[str, dict[str, int | None]] = {
    "smoke": {
        "max_holdout_runs": 1,
        "bootstrap_samples": 0,
        "site_max_rows": 8_000,
        "settlement_max_rows": 8_000,
        "pairwise_max_rows": 16_000,
    },
    "dev": {
        "max_holdout_runs": 2,
        "bootstrap_samples": 1,
        "site_max_rows": MAX_FIT_SETTLEMENT_ROWS,
        "settlement_max_rows": MAX_FIT_SETTLEMENT_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
    },
    "science": {
        "max_holdout_runs": 8,
        "bootstrap_samples": 8,
        "site_max_rows": MAX_FIT_SETTLEMENT_ROWS,
        "settlement_max_rows": MAX_FIT_SETTLEMENT_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
    },
}


def _discover_round_ids(paths: WorkspacePaths) -> list[str]:
    round_ids = {
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    }
    round_ids.update(
        summary_dir.name.removeprefix("round_id=")
        for summary_dir in paths.derived_dir.joinpath("replay_summaries").glob("round_id=*")
        if summary_dir.is_dir()
    )
    return sorted(round_ids)


def _mean_metric_value(
    reports: tuple[DynamicLawRoundValidationReport, ...],
    attribute_name: str,
) -> float | None:
    values: list[float] = []
    for report in reports:
        metrics = getattr(report, attribute_name)
        values.extend(
            metric.value
            for metric in metrics
            if metric.value is not None
        )
    if not values:
        return None
    return float(sum(values) / len(values))


def _mean_probe_std(reports: tuple[DynamicLawRoundValidationReport, ...]) -> float | None:
    values = [report.probe_std_mean for report in reports if report.probe_std_mean is not None]
    if not values:
        return None
    return float(sum(values) / len(values))


def _default_summary_name(
    *,
    round_ids: list[str],
    validation_profile: str,
    max_holdout_runs: int,
    bootstrap_samples: int,
    rng_seed: int,
    site_max_rows: int | None,
    settlement_max_rows: int | None,
    pairwise_max_rows: int | None,
) -> str:
    payload = {
        "round_ids": round_ids,
        "validation_profile": validation_profile,
        "max_holdout_runs": max_holdout_runs,
        "bootstrap_samples": bootstrap_samples,
        "rng_seed": rng_seed,
        "site_max_rows": site_max_rows,
        "settlement_max_rows": settlement_max_rows,
        "pairwise_max_rows": pairwise_max_rows,
    }
    digest = hashlib.sha1(
        json.dumps(payload, sort_keys=True).encode("utf-8"),
    ).hexdigest()[:10]
    round_stem = round_ids[0] if len(round_ids) == 1 else f"multi_{len(round_ids)}"
    return f"dynamic_law_summary_validation_{round_stem}_{validation_profile}_{digest}"


def _render_round_metric_line(
    label: str,
    metrics: tuple[DynamicLawMetricSummary, ...],
) -> str:
    finite = [metric for metric in metrics if metric.value is not None]
    if not finite:
        return f"- {label}: n/a"
    mean_value = sum(metric.value or 0.0 for metric in finite) / len(finite)
    mean_improvement_values = [
        metric.improvement for metric in finite if metric.improvement is not None
    ]
    suffix = ""
    if mean_improvement_values:
        suffix = (
            f", improvement={sum(mean_improvement_values) / len(mean_improvement_values):.6f}"
        )
    return f"- {label}: {mean_value:.6f}{suffix}"


def _render_report_markdown(
    result: EvaluateDynamicLawSummaryResult,
) -> str:
    lines = [
        "# Dynamic Law Summary Validation",
        "",
        f"- profile: {result.validation_profile}",
        f"- rounds: {result.report_count}",
        f"- holdout_runs: {result.max_holdout_runs}",
        f"- bootstrap_samples: {result.bootstrap_samples}",
        f"- rng_seed: {result.rng_seed}",
        f"- site_max_rows: {result.site_max_rows}",
        f"- settlement_max_rows: {result.settlement_max_rows}",
        f"- pairwise_max_rows: {result.pairwise_max_rows}",
        f"- elapsed_seconds: {result.elapsed_seconds:.3f}",
        f"- mean_site_binary_brier: {result.mean_site_binary_brier}",
        f"- mean_settlement_binary_brier: {result.mean_settlement_binary_brier}",
        f"- mean_settlement_linear_rmse: {result.mean_settlement_linear_rmse}",
        f"- mean_pairwise_binary_brier: {result.mean_pairwise_binary_brier}",
        f"- mean_pairwise_linear_rmse: {result.mean_pairwise_linear_rmse}",
        f"- mean_ruin_binary_brier: {result.mean_ruin_binary_brier}",
        f"- mean_owner_linear_rmse: {result.mean_owner_linear_rmse}",
        f"- mean_macro_linear_rmse: {result.mean_macro_linear_rmse}",
        f"- mean_year_shock_mae: {result.mean_year_shock_mae}",
        f"- mean_probe_std: {result.mean_probe_std}",
        "",
    ]
    for report in result.round_reports:
        lines.extend(
            [
                f"## Round {report.round_number} {report.round_id}",
                "",
                f"- replay_seeds: {report.replay_seed_count}",
                f"- replay_runs: {report.replay_run_count}",
                f"- holdout_runs: {len(report.evaluated_holdout_run_ids)}",
                f"- bootstrap_samples: {report.bootstrap_samples}",
                f"- probe_std_mean: {report.probe_std_mean}",
                f"- probe_std_max: {report.probe_std_max}",
                _render_round_metric_line("site_binary_brier", report.site_binary_metrics),
                _render_round_metric_line(
                    "settlement_binary_brier",
                    report.settlement_binary_metrics,
                ),
                _render_round_metric_line(
                    "settlement_linear_rmse",
                    report.settlement_linear_metrics,
                ),
                _render_round_metric_line(
                    "pairwise_binary_brier",
                    report.pairwise_binary_metrics,
                ),
                _render_round_metric_line(
                    "pairwise_linear_rmse",
                    report.pairwise_linear_metrics,
                ),
                _render_round_metric_line("ruin_binary_brier", report.ruin_binary_metrics),
                _render_round_metric_line("owner_linear_rmse", report.owner_linear_metrics),
                _render_round_metric_line("macro_linear_rmse", report.macro_linear_metrics),
                _render_round_metric_line("year_shock_mae", report.year_shock_metrics),
            ],
        )
        if report.top_unstable_summary_names:
            lines.append("- top_unstable:")
            for name, value in zip(
                report.top_unstable_summary_names,
                report.top_unstable_summary_values,
                strict=True,
            ):
                lines.append(f"  - {name}: {value:.6f}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def evaluate_dynamic_law_summary(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    validation_profile: str = "science",
    max_holdout_runs: int | None = None,
    bootstrap_samples: int | None = None,
    rng_seed: int = 0,
    name: str | None = None,
    site_max_rows: int | None = None,
    settlement_max_rows: int | None = None,
    pairwise_max_rows: int | None = None,
) -> EvaluateDynamicLawSummaryResult:
    started_at = time.perf_counter()
    profile_name = validation_profile.lower()
    if profile_name not in _PROFILE_DEFAULTS:
        raise ValueError(f"unknown dynamic-law validation profile: {validation_profile}")
    profile_defaults = _PROFILE_DEFAULTS[profile_name]
    selected_round_ids = round_ids or _discover_round_ids(paths)
    resolved_max_holdout_runs = (
        max_holdout_runs
        if max_holdout_runs is not None
        else int(profile_defaults["max_holdout_runs"] or 0)
    )
    resolved_bootstrap_samples = (
        bootstrap_samples
        if bootstrap_samples is not None
        else int(profile_defaults["bootstrap_samples"] or 0)
    )
    resolved_site_max_rows = (
        site_max_rows
        if site_max_rows is not None
        else int(profile_defaults["site_max_rows"] or 0)
    )
    resolved_settlement_max_rows = (
        settlement_max_rows
        if settlement_max_rows is not None
        else int(profile_defaults["settlement_max_rows"] or 0)
    )
    resolved_pairwise_max_rows = (
        pairwise_max_rows
        if pairwise_max_rows is not None
        else int(profile_defaults["pairwise_max_rows"] or 0)
    )
    round_reports: list[DynamicLawRoundValidationReport] = []
    for round_id in selected_round_ids:
        round_number, bundles = load_or_build_round_dynamic_law_measurement_bundles(
            paths,
            round_id,
            site_max_rows=resolved_site_max_rows,
            settlement_max_rows=resolved_settlement_max_rows,
            pairwise_max_rows=resolved_pairwise_max_rows,
        )
        if not bundles:
            continue
        round_reports.append(
            evaluate_round_dynamic_law_summary(
                round_id=round_id,
                round_number=round_number,
                bundles=bundles,
                max_holdout_runs=resolved_max_holdout_runs,
                bootstrap_samples=resolved_bootstrap_samples,
                rng_seed=rng_seed,
            )
        )

    reports_tuple = tuple(round_reports)
    if not reports_tuple:
        raise ValueError("no replay-backed rounds available for dynamic-law summary evaluation")

    summary_name = name or _default_summary_name(
        round_ids=[report.round_id for report in reports_tuple],
        validation_profile=profile_name,
        max_holdout_runs=resolved_max_holdout_runs,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        settlement_max_rows=resolved_settlement_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
    )
    artifact_dir = paths.artifacts_dir / "replays" / "validation"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{summary_name}.json"
    report_path = artifact_dir / f"{summary_name}.md"

    result = EvaluateDynamicLawSummaryResult(
        round_ids=[report.round_id for report in reports_tuple],
        report_count=len(reports_tuple),
        validation_profile=profile_name,
        max_holdout_runs=resolved_max_holdout_runs,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        settlement_max_rows=resolved_settlement_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        elapsed_seconds=float(time.perf_counter() - started_at),
        mean_site_binary_brier=_mean_metric_value(reports_tuple, "site_binary_metrics"),
        mean_settlement_binary_brier=_mean_metric_value(
            reports_tuple,
            "settlement_binary_metrics",
        ),
        mean_settlement_linear_rmse=_mean_metric_value(
            reports_tuple,
            "settlement_linear_metrics",
        ),
        mean_pairwise_binary_brier=_mean_metric_value(
            reports_tuple,
            "pairwise_binary_metrics",
        ),
        mean_pairwise_linear_rmse=_mean_metric_value(
            reports_tuple,
            "pairwise_linear_metrics",
        ),
        mean_ruin_binary_brier=_mean_metric_value(reports_tuple, "ruin_binary_metrics"),
        mean_owner_linear_rmse=_mean_metric_value(reports_tuple, "owner_linear_metrics"),
        mean_macro_linear_rmse=_mean_metric_value(reports_tuple, "macro_linear_metrics"),
        mean_year_shock_mae=_mean_metric_value(reports_tuple, "year_shock_metrics"),
        mean_probe_std=_mean_probe_std(reports_tuple),
        artifact_path=artifact_path,
        report_path=report_path,
        round_reports=reports_tuple,
    )

    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report_markdown(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="dynamic_law_summary_evaluated",
            status="ok",
            artifact_path=artifact_path,
            payload_json=to_jsonable(result),
            spec_name=summary_name,
        ),
    )
    return result


__all__ = ["evaluate_dynamic_law_summary"]
