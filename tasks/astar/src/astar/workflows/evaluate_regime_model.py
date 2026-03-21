from __future__ import annotations

import hashlib
import json
import time

import numpy as np

from astar.history.episodes.build import build_round_episode
from astar.history.summaries.behavioral_fingerprint import (
    MAX_FIT_LIVE_ROWS,
    MAX_FIT_PAIRWISE_ROWS,
    MAX_FIT_RUIN_ROWS,
    MAX_FIT_SITE_ROWS,
)
from astar.history.summaries.behavioral_fingerprint_manifold import (
    load_or_build_round_behavioral_fingerprint_measurement_bundles,
)
from astar.history.summaries.factorization import factorize_summary_matrix
from astar.history.summaries.regime_validation import (
    estimate_behavioral_fingerprint_core_rounds,
    evaluate_regime_rank,
    prepare_regime_heldout_rounds,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.results import EvaluateRegimeModelResult

_PROFILE_DEFAULTS: dict[str, dict[str, int | None]] = {
    "smoke": {
        "bootstrap_samples": 0,
        "site_max_rows": 8_000,
        "live_max_rows": 8_000,
        "ruin_max_rows": 8_000,
        "pairwise_max_rows": 16_000,
        "owner_max_rows": 8_000,
    },
    "dev": {
        "bootstrap_samples": 1,
        "site_max_rows": MAX_FIT_SITE_ROWS,
        "live_max_rows": MAX_FIT_LIVE_ROWS,
        "ruin_max_rows": MAX_FIT_RUIN_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
        "owner_max_rows": MAX_FIT_LIVE_ROWS,
    },
    "science": {
        "bootstrap_samples": 8,
        "site_max_rows": MAX_FIT_SITE_ROWS,
        "live_max_rows": MAX_FIT_LIVE_ROWS,
        "ruin_max_rows": MAX_FIT_RUIN_ROWS,
        "pairwise_max_rows": MAX_FIT_PAIRWISE_ROWS,
        "owner_max_rows": MAX_FIT_LIVE_ROWS,
    },
}


def _discover_regime_round_ids(paths: WorkspacePaths) -> list[str]:
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
    round_ids.update(
        event_dir.name.removeprefix("round_id=")
        for event_dir in paths.derived_dir.joinpath("replay_events").glob("round_id=*")
        if event_dir.is_dir()
    )
    return sorted(round_ids)


def _render_report_markdown(result: EvaluateRegimeModelResult) -> str:
    lines = [
        "# Regime Model Evaluation",
        "",
        f"- summary_backend: {result.summary_backend}",
        f"- summary_profile: {result.behavioral_fingerprint_summary_profile}",
        f"- validation_profile: {result.validation_profile}",
        f"- rounds: {result.round_count}",
        f"- summary_dim: {result.summary_dim}",
        f"- max_rank: {result.max_rank}",
        f"- bootstrap_samples: {result.bootstrap_samples}",
        f"- rng_seed: {result.rng_seed}",
        f"- site_max_rows: {result.site_max_rows}",
        f"- live_max_rows: {result.live_max_rows}",
        f"- ruin_max_rows: {result.ruin_max_rows}",
        f"- pairwise_max_rows: {result.pairwise_max_rows}",
        f"- owner_max_rows: {result.owner_max_rows}",
        f"- elapsed_seconds: {result.elapsed_seconds:.3f}",
        f"- best_rank_by_reconstruction: {result.best_rank_by_reconstruction}",
        f"- best_rank_by_terminal_weighted_kl: {result.best_rank_by_terminal_weighted_kl}",
        "",
    ]
    for report in result.rank_reports:
        lines.extend(
            [
                f"## Rank {report.rank}",
                "",
                f"- in_sample_effective_rank: {report.in_sample_effective_rank}",
                "- in_sample_cumulative_explained_variance: "
                + f"{report.in_sample_cumulative_explained_variance}",
                f"- mean_effective_rank: {report.mean_effective_rank}",
                f"- mean_reconstruction_rmse: {report.mean_reconstruction_rmse}",
                f"- mean_reconstruction_baseline_rmse: {report.mean_reconstruction_baseline_rmse}",
                "- mean_reconstruction_rmse_improvement: "
                + f"{report.mean_reconstruction_rmse_improvement}",
                f"- mean_coefficient_l2: {report.mean_coefficient_l2}",
                f"- mean_baseline_coefficient_l2: {report.mean_baseline_coefficient_l2}",
                f"- mean_raw_summary_coefficient_l2: {report.mean_raw_summary_coefficient_l2}",
                f"- mean_coefficient_l2_improvement: {report.mean_coefficient_l2_improvement}",
                "- mean_low_rank_vs_raw_summary_coefficient_l2_improvement: "
                + f"{report.mean_low_rank_vs_raw_summary_coefficient_l2_improvement}",
                f"- coefficient_round_count: {report.coefficient_round_count}",
                f"- raw_summary_round_count: {report.raw_summary_round_count}",
                f"- mean_terminal_weighted_kl: {report.mean_terminal_weighted_kl}",
                "- mean_baseline_terminal_weighted_kl: "
                + f"{report.mean_baseline_terminal_weighted_kl}",
                "- mean_raw_summary_terminal_weighted_kl: "
                + f"{report.mean_raw_summary_terminal_weighted_kl}",
                "- mean_terminal_weighted_kl_improvement: "
                + f"{report.mean_terminal_weighted_kl_improvement}",
                "- mean_low_rank_vs_raw_summary_terminal_weighted_kl_improvement: "
                + f"{report.mean_low_rank_vs_raw_summary_terminal_weighted_kl_improvement}",
                f"- mean_terminal_score: {report.mean_terminal_score}",
                f"- mean_baseline_terminal_score: {report.mean_baseline_terminal_score}",
                f"- mean_raw_summary_terminal_score: {report.mean_raw_summary_terminal_score}",
                f"- mean_terminal_score_improvement: {report.mean_terminal_score_improvement}",
                "- mean_low_rank_vs_raw_summary_terminal_score_improvement: "
                + f"{report.mean_low_rank_vs_raw_summary_terminal_score_improvement}",
                f"- terminal_round_count: {report.terminal_round_count}",
                f"- terminal_seed_count: {report.terminal_seed_count}",
                "",
            ],
        )
    return "\n".join(lines).rstrip() + "\n"


def _best_rank_by_metric(
    result: EvaluateRegimeModelResult,
    attribute_name: str,
) -> int | None:
    best_rank: int | None = None
    best_value: float | None = None
    for report in result.rank_reports:
        value = getattr(report, attribute_name)
        if value is None:
            continue
        if best_value is None or value < best_value:
            best_value = float(value)
            best_rank = int(report.rank)
    return best_rank


def _default_summary_name(
    *,
    round_ids: list[str],
    validation_profile: str,
    summary_profile: str,
    max_rank: int,
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
        "summary_profile": summary_profile,
        "max_rank": max_rank,
        "bootstrap_samples": bootstrap_samples,
        "rng_seed": rng_seed,
        "site_max_rows": site_max_rows,
        "live_max_rows": live_max_rows,
        "ruin_max_rows": ruin_max_rows,
        "pairwise_max_rows": pairwise_max_rows,
        "owner_max_rows": owner_max_rows,
    }
    digest = hashlib.sha1(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()[:10]
    round_stem = round_ids[0] if len(round_ids) == 1 else f"multi_{len(round_ids)}"
    return f"regime_model_evaluation_{round_stem}_{validation_profile}_{digest}"


def evaluate_regime_model(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    validation_profile: str = "science",
    max_rank: int = 4,
    behavioral_fingerprint_summary_profile: str = "core_v1",
    bootstrap_samples: int | None = None,
    rng_seed: int = 0,
    name: str | None = None,
    site_max_rows: int | None = None,
    live_max_rows: int | None = None,
    ruin_max_rows: int | None = None,
    pairwise_max_rows: int | None = None,
    owner_max_rows: int | None = None,
) -> EvaluateRegimeModelResult:
    started_at = time.perf_counter()
    profile_name = validation_profile.lower()
    if profile_name not in _PROFILE_DEFAULTS:
        raise ValueError(f"unknown regime validation profile: {validation_profile}")
    profile_defaults = _PROFILE_DEFAULTS[profile_name]
    selected_round_ids = round_ids or _discover_regime_round_ids(paths)
    resolved_bootstrap_samples = (
        bootstrap_samples
        if bootstrap_samples is not None
        else int(profile_defaults["bootstrap_samples"] or 0)
    )
    resolved_site_max_rows = (
        site_max_rows if site_max_rows is not None else profile_defaults["site_max_rows"]
    )
    resolved_live_max_rows = (
        live_max_rows if live_max_rows is not None else profile_defaults["live_max_rows"]
    )
    resolved_ruin_max_rows = (
        ruin_max_rows if ruin_max_rows is not None else profile_defaults["ruin_max_rows"]
    )
    resolved_pairwise_max_rows = (
        pairwise_max_rows
        if pairwise_max_rows is not None
        else profile_defaults["pairwise_max_rows"]
    )
    resolved_owner_max_rows = (
        owner_max_rows if owner_max_rows is not None else profile_defaults["owner_max_rows"]
    )
    episodes = []
    for round_id in selected_round_ids:
        try:
            episodes.append(
                build_round_episode(
                    paths,
                    round_id,
                    include_replays=False,
                    include_live_transcript=False,
                    include_submitted_prediction=False,
                )
            )
        except (FileNotFoundError, ValueError):
            if round_ids is not None:
                raise
            continue
    round_measurement_bundles = {
        episode.metadata.round_id: load_or_build_round_behavioral_fingerprint_measurement_bundles(
            paths,
            episode.metadata.round_id,
            site_max_rows=resolved_site_max_rows,
            live_max_rows=resolved_live_max_rows,
            ruin_max_rows=resolved_ruin_max_rows,
            pairwise_max_rows=resolved_pairwise_max_rows,
            owner_max_rows=resolved_owner_max_rows,
        )[1]
        for episode in episodes
    }
    replay_episodes = [
        episode
        for episode in episodes
        if episode.replay_run_count > 0 or round_measurement_bundles[episode.metadata.round_id]
    ]
    if len(replay_episodes) <= 1:
        raise ValueError("regime evaluation requires at least two replay-backed rounds")

    summary_names, round_estimates = estimate_behavioral_fingerprint_core_rounds(
        paths,
        episodes=replay_episodes,
        measurement_bundles_by_round_id=round_measurement_bundles,
        summary_profile=behavioral_fingerprint_summary_profile,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        live_max_rows=resolved_live_max_rows,
        ruin_max_rows=resolved_ruin_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        owner_max_rows=resolved_owner_max_rows,
    )
    round_episodes = {episode.metadata.round_id: episode for episode in replay_episodes}
    round_measurement_bundles = {
        round_id: round_measurement_bundles[round_id]
        for round_id in round_episodes
    }
    prepared_heldout_rounds = prepare_regime_heldout_rounds(
        paths,
        summary_names,
        round_estimates,
        round_episodes,
        round_measurement_bundles,
        summary_profile=behavioral_fingerprint_summary_profile,
    )
    preview_factorization = factorize_summary_matrix(
        summary_kind="behavioral_fingerprint_core",
        summary_names=list(summary_names),
        round_ids=[item.round_id for item in round_estimates],
        round_numbers=[item.round_number for item in round_estimates],
        sample_counts=[item.sample_count for item in round_estimates],
        summary_matrix=np.stack([item.summary_vector for item in round_estimates], axis=0),
        max_rank=max_rank,
    )
    max_allowed_rank = max(
        1,
        min(max_rank, len(round_estimates) - 1, max(1, preview_factorization.effective_rank)),
    )
    rank_reports = tuple(
        evaluate_regime_rank(
            paths,
            summary_names,
            round_estimates,
            round_episodes,
            round_measurement_bundles,
            rank=rank,
            summary_profile=behavioral_fingerprint_summary_profile,
            prepared_heldout_rounds=prepared_heldout_rounds,
        )
        for rank in range(1, max_allowed_rank + 1)
    )

    artifact_name = name or _default_summary_name(
        round_ids=[item.round_id for item in round_estimates],
        validation_profile=profile_name,
        summary_profile=behavioral_fingerprint_summary_profile,
        max_rank=max_allowed_rank,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        live_max_rows=resolved_live_max_rows,
        ruin_max_rows=resolved_ruin_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        owner_max_rows=resolved_owner_max_rows,
    )
    artifact_path = paths.artifacts_dir / "reports" / f"{artifact_name}.json"
    report_path = paths.artifacts_dir / "reports" / f"{artifact_name}.md"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    provisional = EvaluateRegimeModelResult(
        summary_backend="behavioral_fingerprint_core",
        behavioral_fingerprint_summary_profile=behavioral_fingerprint_summary_profile,
        validation_profile=profile_name,
        round_ids=[item.round_id for item in round_estimates],
        round_count=len(round_estimates),
        summary_dim=len(summary_names),
        max_rank=max_allowed_rank,
        bootstrap_samples=resolved_bootstrap_samples,
        rng_seed=rng_seed,
        site_max_rows=resolved_site_max_rows,
        live_max_rows=resolved_live_max_rows,
        ruin_max_rows=resolved_ruin_max_rows,
        pairwise_max_rows=resolved_pairwise_max_rows,
        owner_max_rows=resolved_owner_max_rows,
        elapsed_seconds=float(time.perf_counter() - started_at),
        best_rank_by_reconstruction=None,
        best_rank_by_terminal_l1=None,
        best_rank_by_terminal_weighted_kl=None,
        artifact_path=artifact_path,
        report_path=report_path,
        rank_reports=rank_reports,
    )
    result = provisional.model_copy(
        update={
            "best_rank_by_reconstruction": _best_rank_by_metric(
                provisional,
                "mean_reconstruction_rmse",
            ),
            "best_rank_by_terminal_weighted_kl": _best_rank_by_metric(
                provisional,
                "mean_terminal_weighted_kl",
            ),
            "best_rank_by_terminal_l1": _best_rank_by_metric(
                provisional,
                "mean_terminal_weighted_kl",
            ),
        },
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report_markdown(result), encoding="utf-8")
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="science_evaluation",
            spec_name=artifact_name,
            status="ok",
            artifact_path=artifact_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result


__all__ = ["evaluate_regime_model"]
