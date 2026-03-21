from __future__ import annotations

import hashlib
import json
import time

from astar.history.summaries.behavioral_fingerprint import (
    MAX_FIT_LIVE_ROWS,
    MAX_FIT_PAIRWISE_ROWS,
    MAX_FIT_RUIN_ROWS,
    MAX_FIT_SITE_ROWS,
)
from astar.history.summaries.behavioral_fingerprint_manifold import (
    _discover_round_ids,
    load_or_build_round_behavioral_fingerprint_measurement_bundles,
)
from astar.history.summaries.behavioral_fingerprint_validation import (
    BehavioralFingerprintMetricSummary,
    BehavioralFingerprintRoundValidationReport,
    evaluate_round_behavioral_fingerprint_summary,
)
from astar.history.summaries.measurements import load_replay_measurement_bundle
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import EvaluateBehavioralFingerprintSummaryResult

_PROFILE_DEFAULTS: dict[str, dict[str, int | None]] = {
    "smoke": {
        "max_holdout_runs": 1,
        "bootstrap_samples": 0,
        "site_max_rows": 8_000,
        "live_max_rows": 8_000,
        "ruin_max_rows": 8_000,
        "pairwise_max_rows": 16_000,
        "owner_max_rows": 8_000,
    },
    "dev": {
        "max_holdout_runs": 2,
        "bootstrap_samples": 1,
        "site_max_rows": MAX_FIT_SITE_ROWS,
        "live_max_rows": MAX_FIT_LIVE_ROWS,
        "ruin_max_rows": MAX_FIT_RUIN_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
        "owner_max_rows": MAX_FIT_LIVE_ROWS,
    },
    "science": {
        "max_holdout_runs": 8,
        "bootstrap_samples": 8,
        "site_max_rows": MAX_FIT_SITE_ROWS,
        "live_max_rows": MAX_FIT_LIVE_ROWS,
        "ruin_max_rows": MAX_FIT_RUIN_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
        "owner_max_rows": MAX_FIT_LIVE_ROWS,
    },
}


def _mean_metric_value(
    reports: tuple[BehavioralFingerprintRoundValidationReport, ...],
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


def _mean_probe_std(reports: tuple[BehavioralFingerprintRoundValidationReport, ...]) -> float | None:
    values = [report.probe_std_mean for report in reports if report.probe_std_mean is not None]
    if not values:
        return None
    return float(sum(values) / len(values))


def _min_probe_support_fraction(
    reports: tuple[BehavioralFingerprintRoundValidationReport, ...],
) -> float | None:
    values = [
        support.min_feature_support_fraction
        for report in reports
        for support in report.probe_support
        if support.min_feature_support_fraction is not None
    ]
    if not values:
        return None
    return float(min(values))


def _all_probe_families_in_range(
    reports: tuple[BehavioralFingerprintRoundValidationReport, ...],
) -> bool:
    return all(
        support.all_probes_in_range
        for report in reports
        for support in report.probe_support
    )


def _default_summary_name(
    *,
    round_ids: list[str],
    validation_profile: str,
    max_holdout_runs: int,
    bootstrap_samples: int,
    rng_seed: int,
    site_max_rows: int | None,
    live_max_rows: int | None,
    ruin_max_rows: int | None,
    pairwise_max_rows: int | None,
    owner_max_rows: int | None,
) -> str:
    payload = {
        "round_ids": round_ids,
        "validation_profile": validation_profile,
        "max_holdout_runs": max_holdout_runs,
        "bootstrap_samples": bootstrap_samples,
        "rng_seed": rng_seed,
        "site_max_rows": site_max_rows,
        "live_max_rows": live_max_rows,
        "ruin_max_rows": ruin_max_rows,
        "pairwise_max_rows": pairwise_max_rows,
        "owner_max_rows": owner_max_rows,
    }
    digest = hashlib.sha1(
        json.dumps(payload, sort_keys=True).encode("utf-8"),
    ).hexdigest()[:10]
    round_stem = round_ids[0] if len(round_ids) == 1 else f"multi_{len(round_ids)}"
    return f"behavioral_fingerprint_summary_validation_{round_stem}_{validation_profile}_{digest}"


def _render_round_metric_line(
    label: str,
    metrics: tuple[BehavioralFingerprintMetricSummary, ...],
) -> str:
    finite = [metric for metric in metrics if metric.value is not None]
    if not finite:
        return f"- {label}: n/a"
    mean_value = sum(metric.value or 0.0 for metric in finite) / len(finite)
    improvements = [
        metric.improvement
        for metric in finite
        if metric.improvement is not None
    ]
    suffix = ""
    if improvements:
        suffix = f", improvement={sum(improvements) / len(improvements):.6f}"
    return f"- {label}: {mean_value:.6f}{suffix}"


def _render_report_markdown(
    result: EvaluateBehavioralFingerprintSummaryResult,
) -> str:
    lines = [
        "# Behavioral Fingerprint Summary Validation",
        "",
        f"- profile: {result.validation_profile}",
        f"- rounds: {result.report_count}",
        f"- holdout_runs: {result.max_holdout_runs}",
        f"- bootstrap_samples: {result.bootstrap_samples}",
        f"- rng_seed: {result.rng_seed}",
        f"- site_max_rows: {result.site_max_rows}",
        f"- live_max_rows: {result.live_max_rows}",
        f"- ruin_max_rows: {result.ruin_max_rows}",
        f"- pairwise_max_rows: {result.pairwise_max_rows}",
        f"- owner_max_rows: {result.owner_max_rows}",
        f"- elapsed_seconds: {result.elapsed_seconds:.3f}",
        f"- mean_site_binary_brier: {result.mean_site_binary_brier}",
        f"- mean_live_binary_brier: {result.mean_live_binary_brier}",
        f"- mean_live_linear_rmse: {result.mean_live_linear_rmse}",
        f"- mean_pairwise_binary_brier: {result.mean_pairwise_binary_brier}",
        f"- mean_pairwise_linear_rmse: {result.mean_pairwise_linear_rmse}",
        f"- mean_ruin_binary_brier: {result.mean_ruin_binary_brier}",
        f"- mean_owner_linear_rmse: {result.mean_owner_linear_rmse}",
        f"- mean_probe_std: {result.mean_probe_std}",
        f"- min_probe_support_fraction: {result.min_probe_support_fraction}",
        f"- all_probe_families_in_range: {result.all_probe_families_in_range}",
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
                _render_round_metric_line("live_binary_brier", report.live_binary_metrics),
                _render_round_metric_line("live_linear_rmse", report.live_linear_metrics),
                _render_round_metric_line("pairwise_binary_brier", report.pairwise_binary_metrics),
                _render_round_metric_line("pairwise_linear_rmse", report.pairwise_linear_metrics),
                _render_round_metric_line("ruin_binary_brier", report.ruin_binary_metrics),
                _render_round_metric_line("owner_linear_rmse", report.owner_linear_metrics),
            ],
        )
        for support in report.probe_support:
            lines.append(
                "- "
                + f"support {support.family}: min={support.min_feature_support_fraction} "
                + f"in_range={support.all_probes_in_range} "
                + f"worst={support.worst_probe_name}"
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


def evaluate_behavioral_fingerprint_summary(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    validation_profile: str = "science",
    max_holdout_runs: int | None = None,
    bootstrap_samples: int | None = None,
    rng_seed: int = 0,
    name: str | None = None,
    site_max_rows: int | None = None,
    live_max_rows: int | None = None,
    ruin_max_rows: int | None = None,
    pairwise_max_rows: int | None = None,
    owner_max_rows: int | None = None,
) -> EvaluateBehavioralFingerprintSummaryResult:
    started_at = time.perf_counter()
    profile_name = validation_profile.lower()
    if profile_name not in _PROFILE_DEFAULTS:
        raise ValueError(
            f"unknown behavioral-fingerprint validation profile: {validation_profile}"
        )
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
    resolved_live_max_rows = (
        live_max_rows
        if live_max_rows is not None
        else int(profile_defaults["live_max_rows"] or 0)
    )
    resolved_ruin_max_rows = (
        ruin_max_rows
        if ruin_max_rows is not None
        else int(profile_defaults["ruin_max_rows"] or 0)
    )
    resolved_pairwise_max_rows = (
        pairwise_max_rows
        if pairwise_max_rows is not None
        else int(profile_defaults["pairwise_max_rows"] or 0)
    )
    resolved_owner_max_rows = (
        owner_max_rows
        if owner_max_rows is not None
        else int(profile_defaults["owner_max_rows"] or 0)
    )

    round_reports: list[BehavioralFingerprintRoundValidationReport] = []
    for round_id in selected_round_ids:
        round_number, bundles = load_or_build_round_behavioral_fingerprint_measurement_bundles(
            paths,
            round_id,
            site_max_rows=resolved_site_max_rows,
            live_max_rows=resolved_live_max_rows,
            ruin_max_rows=resolved_ruin_max_rows,
            pairwise_max_rows=resolved_pairwise_max_rows,
            owner_max_rows=resolved_owner_max_rows,
        )
        if not bundles:
            continue
        round_record = read_round_record(paths, round_id)
        full_bundles = [
            bundle
            for seed_index in range(round_record.round.seeds_count)
            if (bundle := load_replay_measurement_bundle(paths, round_id, seed_index)) is not None
        ]
        projected_seed_indexes = {bundle.seed_index for bundle in bundles}
        full_seed_indexes = {bundle.seed_index for bundle in full_bundles}
        support_bundles = (
            full_bundles
            if projected_seed_indexes.issubset(full_seed_indexes)
            else bundles
        )
        round_reports.append(
            evaluate_round_behavioral_fingerprint_summary(
                round_id=round_id,
                round_number=round_number,
                bundles=bundles,
                support_bundles=support_bundles,
                max_holdout_runs=resolved_max_holdout_runs,
                bootstrap_samples=resolved_bootstrap_samples,
                rng_seed=rng_seed,
            )
        )
    if not round_reports:
        raise ValueError("no replay-backed rounds available for behavioral-fingerprint validation")

    report_tuple = tuple(round_reports)
    summary_name = name or _default_summary_name(
        round_ids=[report.round_id for report in report_tuple],
        validation_profile=profile_name,
        max_holdout_runs=resolved_max_holdout_runs,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        live_max_rows=resolved_live_max_rows,
        ruin_max_rows=resolved_ruin_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        owner_max_rows=resolved_owner_max_rows,
    )
    artifact_dir = paths.artifacts_dir / "replays" / "validation"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{summary_name}.json"
    report_path = artifact_dir / f"{summary_name}.md"
    elapsed_seconds = time.perf_counter() - started_at
    result = EvaluateBehavioralFingerprintSummaryResult(
        round_ids=[report.round_id for report in report_tuple],
        report_count=len(report_tuple),
        validation_profile=profile_name,
        max_holdout_runs=resolved_max_holdout_runs,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        live_max_rows=resolved_live_max_rows,
        ruin_max_rows=resolved_ruin_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        owner_max_rows=resolved_owner_max_rows,
        elapsed_seconds=elapsed_seconds,
        mean_site_binary_brier=_mean_metric_value(report_tuple, "site_binary_metrics"),
        mean_live_binary_brier=_mean_metric_value(report_tuple, "live_binary_metrics"),
        mean_live_linear_rmse=_mean_metric_value(report_tuple, "live_linear_metrics"),
        mean_pairwise_binary_brier=_mean_metric_value(report_tuple, "pairwise_binary_metrics"),
        mean_pairwise_linear_rmse=_mean_metric_value(report_tuple, "pairwise_linear_metrics"),
        mean_ruin_binary_brier=_mean_metric_value(report_tuple, "ruin_binary_metrics"),
        mean_owner_linear_rmse=_mean_metric_value(report_tuple, "owner_linear_metrics"),
        mean_probe_std=_mean_probe_std(report_tuple),
        min_probe_support_fraction=_min_probe_support_fraction(report_tuple),
        all_probe_families_in_range=_all_probe_families_in_range(report_tuple),
        artifact_path=artifact_path,
        report_path=report_path,
        round_reports=report_tuple,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report_markdown(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="behavioral_fingerprint_summary_validated",
            status="ok",
            artifact_path=artifact_path,
            payload_json=to_jsonable(result),
            spec_name=summary_name,
        ),
    )
    return result


__all__ = ["evaluate_behavioral_fingerprint_summary"]
