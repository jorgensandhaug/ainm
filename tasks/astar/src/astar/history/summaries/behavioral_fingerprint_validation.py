from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.behavioral_fingerprint import (
    LIVE_BINARY_TARGETS,
    LIVE_LINEAR_TARGETS,
    OWNER_LINEAR_TARGETS,
    PAIRWISE_BINARY_TARGETS,
    PAIRWISE_LINEAR_TARGETS,
    RUIN_BINARY_TARGETS,
    SITE_BINARY_TARGETS,
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
    fit_round_behavioral_fingerprint,
    live_settlement_feature_matrix,
    owner_feature_matrix,
    pairwise_feature_matrix,
    ruin_feature_matrix,
    site_opportunity_feature_matrix,
    summarize_probe_support,
)
from astar.history.summaries.behavioral_fingerprint_core import (
    select_behavioral_fingerprint_core,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    ReplayMeasurementSeedSummary,
)


class BehavioralFingerprintMetricSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    metric_name: Literal["brier", "rmse"]
    sample_count: int = Field(ge=0)
    value: float | None = None
    baseline_value: float | None = None
    improvement: float | None = None


class BehavioralFingerprintProbeSupportSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    family: Literal["site", "live", "ruin", "pairwise", "owner"]
    sample_count: int = Field(ge=0)
    min_feature_support_fraction: float | None = None
    mean_feature_support_fraction: float | None = None
    all_probes_in_range: bool = False
    out_of_range_probe_count: int = Field(ge=0)
    worst_probe_name: str | None = None
    worst_probe_support_fraction: float | None = None
    worst_probe_distance: float | None = None


class BehavioralFingerprintRoundValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    replay_seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    evaluated_holdout_run_ids: tuple[str, ...]
    bootstrap_samples: int = Field(ge=0)
    site_binary_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    live_binary_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    live_linear_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    pairwise_binary_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    pairwise_linear_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    ruin_binary_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    owner_linear_metrics: tuple[BehavioralFingerprintMetricSummary, ...]
    probe_summary_names: tuple[str, ...]
    probe_summary_std: tuple[float, ...]
    probe_std_mean: float | None = None
    probe_std_median: float | None = None
    probe_std_max: float | None = None
    top_unstable_summary_names: tuple[str, ...]
    top_unstable_summary_values: tuple[float, ...]
    probe_support: tuple[BehavioralFingerprintProbeSupportSummary, ...]


@dataclass
class _MetricAccumulator:
    metric_name: str
    count: int = 0
    squared_error_sum: float = 0.0
    baseline_squared_error_sum: float | None = 0.0

    def update(
        self,
        predicted: np.ndarray,
        target: np.ndarray,
        *,
        baseline: float | np.ndarray | None = None,
    ) -> None:
        prediction = np.asarray(predicted, dtype=np.float64).reshape(-1)
        truth = np.asarray(target, dtype=np.float64).reshape(-1)
        if prediction.size == 0 or truth.size == 0:
            return
        error = prediction - truth
        self.count += int(truth.size)
        self.squared_error_sum += float(np.sum(error**2))
        if baseline is None:
            self.baseline_squared_error_sum = None
            return
        baseline_prediction = np.asarray(baseline, dtype=np.float64)
        if baseline_prediction.ndim == 0:
            baseline_prediction = np.full(truth.shape, float(baseline_prediction), dtype=np.float64)
        else:
            baseline_prediction = baseline_prediction.reshape(-1)
        baseline_error = baseline_prediction - truth
        if self.baseline_squared_error_sum is not None:
            self.baseline_squared_error_sum += float(np.sum(baseline_error**2))

    def summarize(self, name: str) -> BehavioralFingerprintMetricSummary:
        if self.count <= 0:
            return BehavioralFingerprintMetricSummary(
                name=name,
                metric_name=self.metric_name,  # type: ignore[arg-type]
                sample_count=0,
            )
        if self.metric_name == "rmse":
            value = float(np.sqrt(self.squared_error_sum / float(self.count)))
            baseline_value = (
                float(np.sqrt(self.baseline_squared_error_sum / float(self.count)))
                if self.baseline_squared_error_sum is not None
                else None
            )
        else:
            value = float(self.squared_error_sum / float(self.count))
            baseline_value = (
                float(self.baseline_squared_error_sum / float(self.count))
                if self.baseline_squared_error_sum is not None
                else None
            )
        improvement = (
            float(baseline_value - value)
            if baseline_value is not None
            else None
        )
        return BehavioralFingerprintMetricSummary(
            name=name,
            metric_name=self.metric_name,  # type: ignore[arg-type]
            sample_count=self.count,
            value=value,
            baseline_value=baseline_value,
            improvement=improvement,
        )


@dataclass(frozen=True)
class _PartitionedBundle:
    round_id: str
    seed_index: int
    replay_run_ids: tuple[str, ...]
    site_transition_counts_by_step: np.ndarray
    site_by_run: dict[str, pl.DataFrame]
    live_by_run: dict[str, pl.DataFrame]
    ruin_by_run: dict[str, pl.DataFrame]
    pairwise_by_run: dict[str, pl.DataFrame]
    owner_by_run: dict[str, pl.DataFrame]
    year_shock_by_run: dict[str, pl.DataFrame]
    macro_by_run: dict[str, pl.DataFrame]
    settlement_empty: pl.DataFrame
    site_empty: pl.DataFrame
    live_empty: pl.DataFrame
    ruin_empty: pl.DataFrame
    pairwise_empty: pl.DataFrame
    owner_empty: pl.DataFrame
    year_shock_empty: pl.DataFrame
    macro_empty: pl.DataFrame

    @property
    def run_ids(self) -> tuple[str, ...]:
        return self.replay_run_ids


def _frame_column(
    frame: pl.DataFrame,
    name: str,
    *,
    dtype: np.dtype | type,
    fill_null: float | int | bool | None = None,
) -> np.ndarray:
    if frame.height == 0:
        return np.zeros((0,), dtype=dtype)
    series = frame.get_column(name)
    if fill_null is not None:
        series = series.fill_null(fill_null)
    return np.asarray(series.to_numpy(), dtype=dtype)


def _nonnull_mask(frame: pl.DataFrame, name: str) -> np.ndarray:
    if frame.height == 0:
        return np.zeros((0,), dtype=bool)
    return np.asarray(~frame.get_column(name).is_null().to_numpy(), dtype=bool)


def _normalize_partition_keys(partitions: dict[object, pl.DataFrame]) -> dict[str, pl.DataFrame]:
    normalized: dict[str, pl.DataFrame] = {}
    for key, frame in partitions.items():
        if isinstance(key, tuple):
            if not key:
                continue
            normalized[str(key[0])] = frame
            continue
        normalized[str(key)] = frame
    return normalized


def _partition_frame(frame: pl.DataFrame) -> dict[str, pl.DataFrame]:
    if frame.height == 0:
        return {}
    return _normalize_partition_keys(
        frame.partition_by("replay_run_id", as_dict=True),
    )


def _seed_scoped_run_frames(
    seed_index: int,
    frames_by_run: dict[str, pl.DataFrame],
) -> dict[str, pl.DataFrame]:
    return {
        f"seed{seed_index}:{run_id}": frame
        for run_id, frame in frames_by_run.items()
    }


def _partition_bundle(bundle: ReplayMeasurementBundle) -> _PartitionedBundle:
    site_by_run = _seed_scoped_run_frames(bundle.seed_index, _partition_frame(bundle.site_opportunities))
    live_by_run = _seed_scoped_run_frames(
        bundle.seed_index,
        _partition_frame(bundle.live_settlement_transitions),
    )
    ruin_by_run = _seed_scoped_run_frames(bundle.seed_index, _partition_frame(bundle.ruin_transitions))
    pairwise_by_run = _seed_scoped_run_frames(
        bundle.seed_index,
        _partition_frame(bundle.pairwise_candidates),
    )
    owner_by_run = _seed_scoped_run_frames(bundle.seed_index, _partition_frame(bundle.owner_years))
    year_shock_by_run = _seed_scoped_run_frames(
        bundle.seed_index,
        _partition_frame(bundle.year_shocks),
    )
    macro_by_run = _seed_scoped_run_frames(
        bundle.seed_index,
        _partition_frame(bundle.macro_trajectories),
    )
    run_ids = tuple(
        sorted(
            set(site_by_run)
            | set(live_by_run)
            | set(ruin_by_run)
            | set(pairwise_by_run)
            | set(owner_by_run)
            | set(year_shock_by_run)
            | set(macro_by_run)
        )
    )
    return _PartitionedBundle(
        round_id=bundle.round_id,
        seed_index=bundle.seed_index,
        replay_run_ids=run_ids,
        site_transition_counts_by_step=bundle.site_transition_counts_by_step,
        settlement_empty=bundle.settlement_measurements.head(0),
        site_empty=bundle.site_opportunities.head(0),
        live_empty=bundle.live_settlement_transitions.head(0),
        ruin_empty=bundle.ruin_transitions.head(0),
        pairwise_empty=bundle.pairwise_candidates.head(0),
        owner_empty=bundle.owner_years.head(0),
        year_shock_empty=bundle.year_shocks.head(0),
        macro_empty=bundle.macro_trajectories.head(0),
        site_by_run=site_by_run,
        live_by_run=live_by_run,
        ruin_by_run=ruin_by_run,
        pairwise_by_run=pairwise_by_run,
        owner_by_run=owner_by_run,
        year_shock_by_run=year_shock_by_run,
        macro_by_run=macro_by_run,
    )


def _concat_selected(
    frames_by_run: dict[str, pl.DataFrame],
    selected_run_ids: list[str],
    empty_frame: pl.DataFrame,
) -> pl.DataFrame:
    parts = [frames_by_run[run_id] for run_id in selected_run_ids if run_id in frames_by_run]
    if not parts:
        return empty_frame
    if len(parts) == 1:
        return parts[0]
    return pl.concat(parts, how="vertical_relaxed")


def _subset_bundle(
    partitioned: _PartitionedBundle,
    selected_run_ids: list[str],
) -> ReplayMeasurementBundle:
    unique_selected = tuple(sorted(set(run_id for run_id in selected_run_ids if run_id in partitioned.run_ids)))
    site_frame = _concat_selected(partitioned.site_by_run, selected_run_ids, partitioned.site_empty)
    live_frame = _concat_selected(partitioned.live_by_run, selected_run_ids, partitioned.live_empty)
    ruin_frame = _concat_selected(partitioned.ruin_by_run, selected_run_ids, partitioned.ruin_empty)
    pairwise_frame = _concat_selected(
        partitioned.pairwise_by_run,
        selected_run_ids,
        partitioned.pairwise_empty,
    )
    owner_frame = _concat_selected(partitioned.owner_by_run, selected_run_ids, partitioned.owner_empty)
    year_shock_frame = _concat_selected(
        partitioned.year_shock_by_run,
        selected_run_ids,
        partitioned.year_shock_empty,
    )
    macro_frame = _concat_selected(
        partitioned.macro_by_run,
        selected_run_ids,
        partitioned.macro_empty,
    )
    summary = ReplayMeasurementSeedSummary(
        round_id=partitioned.round_id,
        seed_index=partitioned.seed_index,
        replay_run_count=len(unique_selected),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_count=0,
        site_opportunity_count=int(site_frame.height),
        settlement_measurement_count=0,
        live_settlement_transition_count=int(live_frame.height),
        ruin_transition_count=int(ruin_frame.height),
        pairwise_candidate_count=int(pairwise_frame.height),
        owner_year_count=int(owner_frame.height),
        year_shock_count=int(year_shock_frame.height),
        macro_trajectory_count=int(macro_frame.height),
    )
    return ReplayMeasurementBundle(
        round_id=partitioned.round_id,
        seed_index=partitioned.seed_index,
        replay_run_count=len(unique_selected),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_counts_by_step=partitioned.site_transition_counts_by_step,
        settlement_measurements=partitioned.settlement_empty,
        site_opportunities=site_frame,
        live_settlement_transitions=live_frame,
        ruin_transitions=ruin_frame,
        pairwise_candidates=pairwise_frame,
        owner_years=owner_frame,
        year_shocks=year_shock_frame,
        macro_trajectories=macro_frame,
        summary=summary,
    )


def _evenly_spaced_values(values: tuple[str, ...], count: int) -> tuple[str, ...]:
    if count <= 0 or not values:
        return ()
    if count >= len(values):
        return values
    indexes = np.floor(
        ((np.arange(count, dtype=np.float64) + 1.0) * len(values)) / (count + 1),
    ).astype(np.int64)
    indexes = np.clip(indexes, 0, len(values) - 1)
    return tuple(values[int(index)] for index in indexes.tolist())


def _select_holdout_run_ids(
    run_ids: tuple[str, ...],
    *,
    max_holdout_runs: int,
) -> tuple[str, ...]:
    if len(run_ids) <= max_holdout_runs:
        return run_ids
    runs_by_seed: dict[str, list[str]] = {}
    for run_id in run_ids:
        seed_key = run_id.split(":", 1)[0]
        runs_by_seed.setdefault(seed_key, []).append(run_id)
    seed_keys = tuple(sorted(runs_by_seed))
    if max_holdout_runs <= len(seed_keys):
        selected_seed_keys = _evenly_spaced_values(seed_keys, max_holdout_runs)
        selected: list[str] = []
        for seed_key in selected_seed_keys:
            selected.extend(_evenly_spaced_values(tuple(runs_by_seed[seed_key]), 1))
        return tuple(selected)

    selected_counts = {seed_key: 1 for seed_key in seed_keys}
    remaining_budget = max_holdout_runs - len(seed_keys)
    while remaining_budget > 0:
        candidates = [
            seed_key
            for seed_key in seed_keys
            if selected_counts[seed_key] < len(runs_by_seed[seed_key])
        ]
        if not candidates:
            break
        next_seed_key = min(
            candidates,
            key=lambda seed_key: (
                selected_counts[seed_key] / max(len(runs_by_seed[seed_key]), 1),
                seed_key,
            ),
        )
        selected_counts[next_seed_key] += 1
        remaining_budget -= 1
    selected = []
    for seed_key in seed_keys:
        selected.extend(
            _evenly_spaced_values(tuple(runs_by_seed[seed_key]), selected_counts[seed_key]),
        )
    return tuple(selected)


def _evaluate_binary_group(
    frame: pl.DataFrame,
    feature_builder,
    target_builder,
    heads,
    accumulators: dict[str, _MetricAccumulator],
) -> None:
    if frame.height == 0:
        return
    _, matrix = feature_builder(frame)
    heads_by_name = {head.name: head for head in heads}
    for name, (mask, target) in target_builder(frame).items():
        head = heads_by_name.get(name)
        if head is None or target.size == 0:
            continue
        accumulators[name].update(head.predict(matrix[mask]), target, baseline=head.positive_rate)


def _evaluate_linear_group(
    frame: pl.DataFrame,
    feature_builder,
    target_builder,
    heads,
    accumulators: dict[str, _MetricAccumulator],
) -> None:
    if frame.height == 0:
        return
    _, matrix = feature_builder(frame)
    heads_by_name = {head.name: head for head in heads}
    for name, (mask, target) in target_builder(frame).items():
        head = heads_by_name.get(name)
        if head is None or target.size == 0:
            continue
        accumulators[name].update(head.predict(matrix[mask]), target, baseline=head.target_mean)


def _site_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    non_ruin_mask = ~_frame_column(frame, "prev_ruin", dtype=bool)
    return {
        name: (
            non_ruin_mask,
            _frame_column(frame, name, dtype=np.float64)[non_ruin_mask],
        )
        for name in SITE_BINARY_TARGETS
    }


def _live_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    owner_known_mask = (
        _frame_column(frame, "prev_owner_id", dtype=np.int64, fill_null=-1) >= 0
    ) & (
        _frame_column(frame, "next_owner_id", dtype=np.int64, fill_null=-1) >= 0
    )
    return {
        "collapse": (
            np.ones(frame.height, dtype=bool),
            _frame_column(frame, "collapse", dtype=np.float64),
        ),
        "collapse_to_ruin": (
            np.ones(frame.height, dtype=bool),
            _frame_column(frame, "collapse_to_ruin", dtype=np.float64),
        ),
        "port_gain": (
            ~_frame_column(frame, "prev_has_port", dtype=bool),
            _frame_column(frame, "port_gain", dtype=np.float64)[~_frame_column(frame, "prev_has_port", dtype=bool)],
        ),
        "owner_flip": (
            owner_known_mask,
            _frame_column(frame, "owner_flip", dtype=np.float64)[owner_known_mask],
        ),
    }


def _live_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    next_alive_mask = _frame_column(frame, "next_alive", dtype=bool)
    return {
        name: (
            next_alive_mask,
            _frame_column(frame, name, dtype=np.float64, fill_null=0.0)[next_alive_mask],
        )
        for name in LIVE_LINEAR_TARGETS
    }


def _pairwise_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    return {
        name: (
            np.ones(frame.height, dtype=bool),
            _frame_column(frame, name, dtype=np.float64),
        )
        for name in PAIRWISE_BINARY_TARGETS
    }


def _pairwise_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    return {
        name: (
            _nonnull_mask(frame, name),
            _frame_column(frame, name, dtype=np.float64, fill_null=0.0)[_nonnull_mask(frame, name)],
        )
        for name in PAIRWISE_LINEAR_TARGETS
    }


def _ruin_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    return {
        name: (
            np.ones(frame.height, dtype=bool),
            _frame_column(frame, name, dtype=np.float64),
        )
        for name in RUIN_BINARY_TARGETS
    }


def _owner_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    return {
        name: (
            np.ones(frame.height, dtype=bool),
            _frame_column(frame, name, dtype=np.float64, fill_null=0.0),
        )
        for name in OWNER_LINEAR_TARGETS
    }


def _probe_std_summary(
    probe_names: tuple[str, ...],
    probe_std: np.ndarray,
) -> tuple[float | None, float | None, float | None, tuple[str, ...], tuple[float, ...]]:
    if probe_std.size == 0:
        return None, None, None, (), ()
    order = np.argsort(-probe_std)
    top_indexes = order[: min(8, probe_std.shape[0])]
    return (
        float(np.mean(probe_std)),
        float(np.median(probe_std)),
        float(np.max(probe_std)),
        tuple(probe_names[int(index)] for index in top_indexes.tolist()),
        tuple(float(probe_std[int(index)]) for index in top_indexes.tolist()),
    )


def _summarize_probe_support_family(
    family: Literal["site", "live", "ruin", "pairwise", "owner"],
    payload: dict[str, object],
) -> BehavioralFingerprintProbeSupportSummary:
    probe_names = [str(name) for name in payload.get("probe_names", [])]
    support = np.asarray(payload.get("feature_support_fraction", []), dtype=np.float64)
    in_range = np.asarray(payload.get("all_features_in_range", []), dtype=bool)
    distance = np.asarray(payload.get("nearest_standardized_distance", []), dtype=np.float64)
    worst_index = int(np.argmin(support)) if support.size else -1
    return BehavioralFingerprintProbeSupportSummary(
        family=family,
        sample_count=int(payload.get("sample_count", 0)),
        min_feature_support_fraction=float(np.min(support)) if support.size else None,
        mean_feature_support_fraction=float(np.mean(support)) if support.size else None,
        all_probes_in_range=bool(np.all(in_range)) if in_range.size else False,
        out_of_range_probe_count=int(np.sum(~in_range)) if in_range.size else 0,
        worst_probe_name=probe_names[worst_index] if worst_index >= 0 else None,
        worst_probe_support_fraction=float(support[worst_index]) if worst_index >= 0 else None,
        worst_probe_distance=float(distance[worst_index]) if worst_index >= 0 else None,
    )


def evaluate_round_behavioral_fingerprint_summary(
    *,
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
    support_bundles: list[ReplayMeasurementBundle] | None = None,
    max_holdout_runs: int = 8,
    bootstrap_samples: int = 8,
    rng_seed: int = 0,
) -> BehavioralFingerprintRoundValidationReport:
    if not bundles:
        raise ValueError("cannot validate behavioral fingerprint without replay measurements")

    partitioned_bundles = [_partition_bundle(bundle) for bundle in bundles]
    all_run_ids = tuple(sorted({run_id for bundle in partitioned_bundles for run_id in bundle.run_ids}))
    holdout_run_ids = _select_holdout_run_ids(all_run_ids, max_holdout_runs=max_holdout_runs)

    probe_library = build_behavioral_fingerprint_probe_library([], [], [], [], [])
    support_payload = summarize_probe_support(support_bundles or bundles, probe_library)

    site_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name in SITE_BINARY_TARGETS
    }
    live_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name in LIVE_BINARY_TARGETS
    }
    live_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name in LIVE_LINEAR_TARGETS
    }
    pairwise_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name in PAIRWISE_BINARY_TARGETS
    }
    pairwise_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name in PAIRWISE_LINEAR_TARGETS
    }
    ruin_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name in RUIN_BINARY_TARGETS
    }
    owner_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name in OWNER_LINEAR_TARGETS
    }

    for holdout_run_id in holdout_run_ids:
        train_bundles = [
            _subset_bundle(
                partitioned,
                [run_id for run_id in all_run_ids if run_id != holdout_run_id],
            )
            for partitioned in partitioned_bundles
        ]
        train_bundles = [
            bundle
            for bundle in train_bundles
            if bundle.replay_run_count > 0
        ]
        if not train_bundles:
            continue
        fitted = fit_round_behavioral_fingerprint(
            round_id=round_id,
            round_number=round_number,
            bundles=train_bundles,
        )
        for partitioned in partitioned_bundles:
            heldout_site = _concat_selected(
                partitioned.site_by_run,
                [holdout_run_id],
                partitioned.site_empty,
            )
            heldout_live = _concat_selected(
                partitioned.live_by_run,
                [holdout_run_id],
                partitioned.live_empty,
            )
            heldout_ruin = _concat_selected(
                partitioned.ruin_by_run,
                [holdout_run_id],
                partitioned.ruin_empty,
            )
            heldout_pairwise = _concat_selected(
                partitioned.pairwise_by_run,
                [holdout_run_id],
                partitioned.pairwise_empty,
            )
            heldout_owner = _concat_selected(
                partitioned.owner_by_run,
                [holdout_run_id],
                partitioned.owner_empty,
            )
            _evaluate_binary_group(
                heldout_site,
                site_opportunity_feature_matrix,
                _site_binary_target_data,
                fitted.site_binary_heads,
                site_binary_acc,
            )
            _evaluate_binary_group(
                heldout_live,
                live_settlement_feature_matrix,
                _live_binary_target_data,
                fitted.live_binary_heads,
                live_binary_acc,
            )
            _evaluate_linear_group(
                heldout_live,
                live_settlement_feature_matrix,
                _live_linear_target_data,
                fitted.live_linear_heads,
                live_linear_acc,
            )
            _evaluate_binary_group(
                heldout_pairwise,
                pairwise_feature_matrix,
                _pairwise_binary_target_data,
                fitted.pairwise_binary_heads,
                pairwise_binary_acc,
            )
            _evaluate_linear_group(
                heldout_pairwise,
                pairwise_feature_matrix,
                _pairwise_linear_target_data,
                fitted.pairwise_linear_heads,
                pairwise_linear_acc,
            )
            _evaluate_binary_group(
                heldout_ruin,
                ruin_feature_matrix,
                _ruin_binary_target_data,
                fitted.ruin_binary_heads,
                ruin_binary_acc,
            )
            _evaluate_linear_group(
                heldout_owner,
                owner_feature_matrix,
                _owner_linear_target_data,
                fitted.owner_linear_heads,
                owner_linear_acc,
            )

    estimate = estimate_round_behavioral_fingerprint(
        round_id=round_id,
        round_number=round_number,
        bundles=bundles,
        probe_library=probe_library,
        bootstrap_samples=bootstrap_samples,
        rng_seed=rng_seed,
    )
    core_estimate = select_behavioral_fingerprint_core(
        estimate.summary_names,
        estimate.summary_vector,
        estimate.summary_std,
    )
    probe_std = (
        np.asarray(core_estimate.summary_std, dtype=np.float64)
        if core_estimate.summary_std is not None
        else np.zeros((len(core_estimate.summary_names),), dtype=np.float64)
    )
    (
        probe_std_mean,
        probe_std_median,
        probe_std_max,
        top_unstable_summary_names,
        top_unstable_summary_values,
    ) = _probe_std_summary(core_estimate.summary_names, probe_std)

    return BehavioralFingerprintRoundValidationReport(
        round_id=round_id,
        round_number=round_number,
        replay_seed_count=len(bundles),
        replay_run_count=len(all_run_ids),
        evaluated_holdout_run_ids=holdout_run_ids,
        bootstrap_samples=estimate.bootstrap_samples,
        site_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in site_binary_acc.items()
        ),
        live_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in live_binary_acc.items()
        ),
        live_linear_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in live_linear_acc.items()
        ),
        pairwise_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in pairwise_binary_acc.items()
        ),
        pairwise_linear_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in pairwise_linear_acc.items()
        ),
        ruin_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in ruin_binary_acc.items()
        ),
        owner_linear_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in owner_linear_acc.items()
        ),
        probe_summary_names=tuple(core_estimate.summary_names),
        probe_summary_std=tuple(float(value) for value in probe_std.tolist()),
        probe_std_mean=probe_std_mean,
        probe_std_median=probe_std_median,
        probe_std_max=probe_std_max,
        top_unstable_summary_names=top_unstable_summary_names,
        top_unstable_summary_values=top_unstable_summary_values,
        probe_support=tuple(
            _summarize_probe_support_family(family, support_payload[family])
            for family in ("site", "live", "ruin", "pairwise", "owner")
        ),
    )


__all__ = [
    "BehavioralFingerprintMetricSummary",
    "BehavioralFingerprintProbeSupportSummary",
    "BehavioralFingerprintRoundValidationReport",
    "evaluate_round_behavioral_fingerprint_summary",
]
