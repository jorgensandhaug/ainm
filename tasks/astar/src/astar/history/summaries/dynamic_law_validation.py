from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.dynamic_law import (
    MACRO_LINEAR_TARGETS,
    OWNER_LINEAR_TARGETS,
    PAIRWISE_BINARY_TARGETS,
    PAIRWISE_LINEAR_TARGETS,
    RUIN_BINARY_TARGETS,
    SETTLEMENT_BINARY_TARGETS,
    SETTLEMENT_LINEAR_TARGETS,
    SITE_BINARY_TARGETS,
    YEAR_SHOCK_COLUMNS,
    FittedBinaryHead,
    FittedLinearHead,
    RoundDynamicLawFit,
    build_dynamic_law_probe_library,
    dynamic_law_probe_summary_names,
    fit_binary_head_from_matrix,
    fit_linear_head_from_matrix,
    macro_feature_matrix,
    macro_linear_target_data,
    owner_feature_matrix,
    owner_linear_target_data,
    pairwise_binary_target_data,
    pairwise_feature_matrix,
    pairwise_linear_target_data,
    ruin_binary_target_data,
    ruin_feature_matrix,
    settlement_binary_target_data,
    settlement_feature_matrix,
    settlement_linear_target_data,
    site_binary_target_data,
    site_feature_matrix,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    ReplayMeasurementSeedSummary,
)


class DynamicLawMetricSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    metric_name: Literal["brier", "rmse", "mae"]
    sample_count: int = Field(ge=0)
    value: float | None = None
    baseline_value: float | None = None
    improvement: float | None = None


class DynamicLawRoundValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    replay_seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    evaluated_holdout_run_ids: tuple[str, ...]
    bootstrap_samples: int = Field(ge=0)
    site_binary_metrics: tuple[DynamicLawMetricSummary, ...]
    settlement_binary_metrics: tuple[DynamicLawMetricSummary, ...]
    settlement_linear_metrics: tuple[DynamicLawMetricSummary, ...]
    pairwise_binary_metrics: tuple[DynamicLawMetricSummary, ...]
    pairwise_linear_metrics: tuple[DynamicLawMetricSummary, ...]
    ruin_binary_metrics: tuple[DynamicLawMetricSummary, ...]
    owner_linear_metrics: tuple[DynamicLawMetricSummary, ...]
    macro_linear_metrics: tuple[DynamicLawMetricSummary, ...]
    year_shock_metrics: tuple[DynamicLawMetricSummary, ...]
    probe_summary_names: tuple[str, ...]
    probe_summary_std: tuple[float, ...]
    probe_std_mean: float | None = None
    probe_std_median: float | None = None
    probe_std_max: float | None = None
    top_unstable_summary_names: tuple[str, ...]
    top_unstable_summary_values: tuple[float, ...]


@dataclass
class _MetricAccumulator:
    metric_name: str
    count: int = 0
    squared_error_sum: float = 0.0
    absolute_error_sum: float = 0.0
    baseline_squared_error_sum: float | None = 0.0
    baseline_absolute_error_sum: float | None = 0.0

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
        self.absolute_error_sum += float(np.sum(np.abs(error)))
        if baseline is None:
            self.baseline_squared_error_sum = None
            self.baseline_absolute_error_sum = None
            return
        baseline_prediction = np.asarray(baseline, dtype=np.float64)
        if baseline_prediction.ndim == 0:
            baseline_prediction = np.full(truth.shape, float(baseline_prediction), dtype=np.float64)
        else:
            baseline_prediction = baseline_prediction.reshape(-1)
        baseline_error = baseline_prediction - truth
        if self.baseline_squared_error_sum is not None:
            self.baseline_squared_error_sum += float(np.sum(baseline_error**2))
        if self.baseline_absolute_error_sum is not None:
            self.baseline_absolute_error_sum += float(np.sum(np.abs(baseline_error)))

    def summarize(self, name: str) -> DynamicLawMetricSummary:
        if self.count <= 0:
            return DynamicLawMetricSummary(
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
        elif self.metric_name == "mae":
            value = float(self.absolute_error_sum / float(self.count))
            baseline_value = (
                float(self.baseline_absolute_error_sum / float(self.count))
                if self.baseline_absolute_error_sum is not None
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
        return DynamicLawMetricSummary(
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
    site_by_run: dict[str, pl.DataFrame]
    settlement_by_run: dict[str, pl.DataFrame]
    pairwise_by_run: dict[str, pl.DataFrame]
    ruin_by_run: dict[str, pl.DataFrame]
    owner_by_run: dict[str, pl.DataFrame]
    year_shock_by_run: dict[str, pl.DataFrame]
    macro_by_run: dict[str, pl.DataFrame]
    site_empty: pl.DataFrame
    settlement_empty: pl.DataFrame
    live_empty: pl.DataFrame
    ruin_empty: pl.DataFrame
    pairwise_empty: pl.DataFrame
    owner_empty: pl.DataFrame
    year_shock_empty: pl.DataFrame
    macro_empty: pl.DataFrame

    @property
    def run_ids(self) -> tuple[str, ...]:
        return tuple(
            sorted(
                set(self.site_by_run)
                | set(self.settlement_by_run)
                | set(self.pairwise_by_run)
                | set(self.ruin_by_run)
                | set(self.owner_by_run)
                | set(self.year_shock_by_run)
                | set(self.macro_by_run)
            )
        )


@dataclass(frozen=True)
class _PreparedGroup:
    feature_names: tuple[str, ...]
    feature_matrices_by_run: dict[str, np.ndarray]
    masks_by_target_by_run: dict[str, dict[str, np.ndarray]]
    targets_by_target_by_run: dict[str, dict[str, np.ndarray]]

    @property
    def run_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self.feature_matrices_by_run))


@dataclass(frozen=True)
class _PreparedYearShockGroup:
    values_by_run: dict[str, np.ndarray]

    @property
    def run_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self.values_by_run))


def _seed_scoped_run_frames(
    seed_index: int,
    frames_by_run: dict[str, pl.DataFrame],
) -> dict[str, pl.DataFrame]:
    return {
        f"seed{seed_index}:{run_id}": frame
        for run_id, frame in frames_by_run.items()
    }


def _normalize_partition_keys(partitions: dict[object, pl.DataFrame]) -> dict[str, pl.DataFrame]:
    normalized: dict[str, pl.DataFrame] = {}
    for key, frame in partitions.items():
        if isinstance(key, tuple):
            if not key:
                continue
            normalized[str(key[0])] = frame
        else:
            normalized[str(key)] = frame
    return normalized


def _partition_frame(frame: pl.DataFrame) -> dict[str, pl.DataFrame]:
    if frame.height == 0:
        return {}
    return _normalize_partition_keys(
        frame.partition_by("replay_run_id", as_dict=True),
    )


def _partition_bundle(bundle: ReplayMeasurementBundle) -> _PartitionedBundle:
    return _PartitionedBundle(
        round_id=bundle.round_id,
        seed_index=bundle.seed_index,
        site_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.site_opportunities),
        ),
        settlement_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.settlement_measurements),
        ),
        pairwise_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.pairwise_candidates),
        ),
        ruin_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.ruin_transitions),
        ),
        owner_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.owner_years),
        ),
        year_shock_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.year_shocks),
        ),
        macro_by_run=_seed_scoped_run_frames(
            bundle.seed_index,
            _partition_frame(bundle.macro_trajectories),
        ),
        site_empty=bundle.site_opportunities.head(0),
        settlement_empty=bundle.settlement_measurements.head(0),
        live_empty=bundle.live_settlement_transitions.head(0),
        ruin_empty=bundle.ruin_transitions.head(0),
        pairwise_empty=bundle.pairwise_candidates.head(0),
        owner_empty=bundle.owner_years.head(0),
        year_shock_empty=bundle.year_shocks.head(0),
        macro_empty=bundle.macro_trajectories.head(0),
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
    unique_selected = tuple(sorted(set(selected_run_ids)))
    site_frame = _concat_selected(partitioned.site_by_run, selected_run_ids, partitioned.site_empty)
    settlement_frame = _concat_selected(
        partitioned.settlement_by_run,
        selected_run_ids,
        partitioned.settlement_empty,
    )
    pairwise_frame = _concat_selected(
        partitioned.pairwise_by_run,
        selected_run_ids,
        partitioned.pairwise_empty,
    )
    year_shock_frame = _concat_selected(
        partitioned.year_shock_by_run,
        selected_run_ids,
        partitioned.year_shock_empty,
    )
    summary = ReplayMeasurementSeedSummary(
        round_id=partitioned.round_id,
        seed_index=partitioned.seed_index,
        replay_run_count=len(unique_selected),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_count=0,
        site_opportunity_count=int(site_frame.height),
        settlement_measurement_count=int(settlement_frame.height),
        live_settlement_transition_count=0,
        ruin_transition_count=0,
        pairwise_candidate_count=int(pairwise_frame.height),
        owner_year_count=0,
        year_shock_count=int(year_shock_frame.height),
        macro_trajectory_count=0,
    )
    return ReplayMeasurementBundle(
        round_id=partitioned.round_id,
        seed_index=partitioned.seed_index,
        replay_run_count=len(unique_selected),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_counts_by_step=np.zeros((0, 0, 0, 0, 0), dtype=np.int32),
        site_opportunities=site_frame,
        settlement_measurements=settlement_frame,
        live_settlement_transitions=partitioned.live_empty,
        ruin_transitions=partitioned.ruin_empty,
        pairwise_candidates=pairwise_frame,
        owner_years=partitioned.owner_empty,
        year_shocks=year_shock_frame,
        macro_trajectories=partitioned.macro_empty,
        summary=summary,
    )


def _head_by_name(
    heads: tuple[FittedBinaryHead, ...] | tuple[FittedLinearHead, ...],
) -> dict[str, FittedBinaryHead | FittedLinearHead]:
    return {head.name: head for head in heads}


def _prepare_group(
    partitioned_bundles: list[_PartitionedBundle],
    *,
    group_name: Literal["site", "settlement", "pairwise", "ruin", "owner", "macro"],
    feature_builder,
    target_builders: tuple,
) -> _PreparedGroup:
    if group_name == "site":
        empty_frame = partitioned_bundles[0].site_empty
    elif group_name == "settlement":
        empty_frame = partitioned_bundles[0].settlement_empty
    elif group_name == "pairwise":
        empty_frame = partitioned_bundles[0].pairwise_empty
    elif group_name == "ruin":
        empty_frame = partitioned_bundles[0].ruin_empty
    elif group_name == "owner":
        empty_frame = partitioned_bundles[0].owner_empty
    else:
        empty_frame = partitioned_bundles[0].macro_empty
    feature_names: tuple[str, ...] | None = None
    feature_matrices_by_run: dict[str, np.ndarray] = {}
    masks_by_target_by_run: dict[str, dict[str, np.ndarray]] = {}
    targets_by_target_by_run: dict[str, dict[str, np.ndarray]] = {}
    for bundle in partitioned_bundles:
        if group_name == "site":
            frames_by_run = bundle.site_by_run
        elif group_name == "settlement":
            frames_by_run = bundle.settlement_by_run
        elif group_name == "pairwise":
            frames_by_run = bundle.pairwise_by_run
        elif group_name == "ruin":
            frames_by_run = bundle.ruin_by_run
        elif group_name == "owner":
            frames_by_run = bundle.owner_by_run
        else:
            frames_by_run = bundle.macro_by_run
        for run_id, frame in frames_by_run.items():
            if frame.height == 0:
                continue
            local_feature_names, feature_matrix = feature_builder(frame)
            if feature_names is None:
                feature_names = local_feature_names
            elif tuple(feature_names) != tuple(local_feature_names):
                raise ValueError(f"{group_name} feature name mismatch across runs")
            feature_matrices_by_run[run_id] = feature_matrix
            for target_builder in target_builders:
                for target_name, (mask, target) in target_builder(frame).items():
                    masks_by_target_by_run.setdefault(target_name, {})[run_id] = mask
                    targets_by_target_by_run.setdefault(target_name, {})[run_id] = target
    if feature_names is None:
        feature_names, _ = feature_builder(empty_frame)
    return _PreparedGroup(
        feature_names=feature_names,
        feature_matrices_by_run=feature_matrices_by_run,
        masks_by_target_by_run=masks_by_target_by_run,
        targets_by_target_by_run=targets_by_target_by_run,
    )


def _prepare_year_shocks(
    partitioned_bundles: list[_PartitionedBundle],
) -> _PreparedYearShockGroup:
    values_by_run: dict[str, np.ndarray] = {}
    for bundle in partitioned_bundles:
        for run_id, frame in bundle.year_shock_by_run.items():
            if frame.height == 0:
                continue
            values_by_run[run_id] = np.stack(
                [
                    frame.get_column(column_name).fill_null(0.0).to_numpy().astype(np.float64)
                    for column_name in YEAR_SHOCK_COLUMNS
                ],
                axis=1,
            ).astype(np.float64)
    return _PreparedYearShockGroup(values_by_run=values_by_run)


def _concat_target_dataset(
    prepared: _PreparedGroup,
    target_name: str,
    selected_run_ids: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    feature_parts: list[np.ndarray] = []
    target_parts: list[np.ndarray] = []
    masks_by_run = prepared.masks_by_target_by_run.get(target_name, {})
    targets_by_run = prepared.targets_by_target_by_run.get(target_name, {})
    for run_id in selected_run_ids:
        feature_matrix = prepared.feature_matrices_by_run.get(run_id)
        mask = masks_by_run.get(run_id)
        target = targets_by_run.get(run_id)
        if feature_matrix is None or mask is None or target is None or target.size == 0:
            continue
        feature_parts.append(feature_matrix[mask])
        target_parts.append(target)
    if not feature_parts:
        feature_dim = len(prepared.feature_names)
        return (
            np.zeros((0, feature_dim), dtype=np.float64),
            np.zeros((0,), dtype=np.float64),
        )
    return (
        np.concatenate(feature_parts, axis=0).astype(np.float64),
        np.concatenate(target_parts, axis=0).astype(np.float64),
    )


def _fit_prepared_dynamic_law(
    *,
    round_id: str,
    round_number: int,
    selected_run_ids: list[str],
    site_group: _PreparedGroup,
    settlement_group: _PreparedGroup,
    pairwise_group: _PreparedGroup,
    ruin_group: _PreparedGroup,
    owner_group: _PreparedGroup,
    macro_group: _PreparedGroup,
    year_shocks: _PreparedYearShockGroup,
    ridge_alpha: float = 1.0,
) -> RoundDynamicLawFit:
    site_binary_heads: list[FittedBinaryHead] = []
    settlement_binary_heads: list[FittedBinaryHead] = []
    settlement_linear_heads: list[FittedLinearHead] = []
    pairwise_binary_heads: list[FittedBinaryHead] = []
    pairwise_linear_heads: list[FittedLinearHead] = []
    ruin_binary_heads: list[FittedBinaryHead] = []
    owner_linear_heads: list[FittedLinearHead] = []
    macro_linear_heads: list[FittedLinearHead] = []
    total_sample_count = 0

    for target_name, _column_name in SITE_BINARY_TARGETS:
        feature_matrix, target = _concat_target_dataset(site_group, target_name, selected_run_ids)
        total_sample_count += int(target.shape[0])
        site_binary_heads.append(
            fit_binary_head_from_matrix(
                target_name,
                site_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name, _mask_name in SETTLEMENT_BINARY_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            settlement_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        settlement_binary_heads.append(
            fit_binary_head_from_matrix(
                target_name,
                settlement_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in SETTLEMENT_LINEAR_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            settlement_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        settlement_linear_heads.append(
            fit_linear_head_from_matrix(
                target_name,
                settlement_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in PAIRWISE_BINARY_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            pairwise_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        pairwise_binary_heads.append(
            fit_binary_head_from_matrix(
                target_name,
                pairwise_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in PAIRWISE_LINEAR_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            pairwise_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        pairwise_linear_heads.append(
            fit_linear_head_from_matrix(
                target_name,
                pairwise_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in RUIN_BINARY_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            ruin_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        ruin_binary_heads.append(
            fit_binary_head_from_matrix(
                target_name,
                ruin_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in OWNER_LINEAR_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            owner_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        owner_linear_heads.append(
            fit_linear_head_from_matrix(
                target_name,
                owner_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for target_name, _column_name in MACRO_LINEAR_TARGETS:
        feature_matrix, target = _concat_target_dataset(
            macro_group,
            target_name,
            selected_run_ids,
        )
        total_sample_count += int(target.shape[0])
        macro_linear_heads.append(
            fit_linear_head_from_matrix(
                target_name,
                macro_group.feature_names,
                feature_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    year_shock_parts = [
        year_shocks.values_by_run[run_id]
        for run_id in selected_run_ids
        if run_id in year_shocks.values_by_run
    ]
    if year_shock_parts:
        year_shock_matrix = np.concatenate(year_shock_parts, axis=0).astype(np.float64)
        total_sample_count += int(year_shock_matrix.shape[0])
        year_shock_vector = np.mean(year_shock_matrix, axis=0).astype(np.float64)
    else:
        year_shock_vector = np.zeros((len(YEAR_SHOCK_COLUMNS),), dtype=np.float64)

    return RoundDynamicLawFit(
        round_id=round_id,
        round_number=round_number,
        sample_count=total_sample_count,
        site_feature_names=site_group.feature_names,
        settlement_feature_names=settlement_group.feature_names,
        pairwise_feature_names=pairwise_group.feature_names,
        ruin_feature_names=ruin_group.feature_names,
        owner_feature_names=owner_group.feature_names,
        macro_feature_names=macro_group.feature_names,
        site_binary_heads=tuple(site_binary_heads),
        settlement_binary_heads=tuple(settlement_binary_heads),
        settlement_linear_heads=tuple(settlement_linear_heads),
        pairwise_binary_heads=tuple(pairwise_binary_heads),
        pairwise_linear_heads=tuple(pairwise_linear_heads),
        ruin_binary_heads=tuple(ruin_binary_heads),
        owner_linear_heads=tuple(owner_linear_heads),
        macro_linear_heads=tuple(macro_linear_heads),
        year_shock_names=YEAR_SHOCK_COLUMNS,
        year_shock_vector=year_shock_vector,
    )


def _evaluate_binary_prepared_group(
    accumulators: dict[str, _MetricAccumulator],
    prepared: _PreparedGroup,
    selected_run_ids: list[str],
    heads: tuple[FittedBinaryHead, ...],
) -> None:
    heads_by_name = _head_by_name(heads)
    for target_name, accumulator in accumulators.items():
        head = heads_by_name.get(target_name)
        if head is None:
            continue
        feature_matrix, target = _concat_target_dataset(prepared, target_name, selected_run_ids)
        if target.size == 0:
            continue
        accumulator.update(head.predict(feature_matrix), target, baseline=head.positive_rate)


def _evaluate_linear_prepared_group(
    accumulators: dict[str, _MetricAccumulator],
    prepared: _PreparedGroup,
    selected_run_ids: list[str],
    heads: tuple[FittedLinearHead, ...],
) -> None:
    heads_by_name = _head_by_name(heads)
    for target_name, accumulator in accumulators.items():
        head = heads_by_name.get(target_name)
        if head is None:
            continue
        feature_matrix, target = _concat_target_dataset(prepared, target_name, selected_run_ids)
        if target.size == 0:
            continue
        accumulator.update(head.predict(feature_matrix), target, baseline=head.target_mean)


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
        selected_run_ids: list[str] = []
        for seed_key in selected_seed_keys:
            selected_run_ids.extend(_evenly_spaced_values(tuple(runs_by_seed[seed_key]), 1))
        return tuple(selected_run_ids)

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

    selected_run_ids = []
    for seed_key in seed_keys:
        selected_run_ids.extend(
            _evenly_spaced_values(
                tuple(runs_by_seed[seed_key]),
                selected_counts[seed_key],
            ),
        )
    return tuple(selected_run_ids)


def _evenly_spaced_values(values: tuple[str, ...], count: int) -> tuple[str, ...]:
    if count <= 0 or not values:
        return ()
    if count >= len(values):
        return values
    n_values = len(values)
    indexes = np.floor(
        ((np.arange(count, dtype=np.float64) + 1.0) * n_values) / (count + 1),
    ).astype(np.int64)
    indexes = np.clip(indexes, 0, n_values - 1)
    return tuple(values[int(index)] for index in indexes.tolist())


def _evaluate_binary_group(
    accumulators: dict[str, _MetricAccumulator],
    frame: pl.DataFrame,
    feature_builder,
    target_builder,
    heads: tuple[FittedBinaryHead, ...],
) -> None:
    if frame.height == 0:
        return
    _, matrix = feature_builder(frame)
    heads_by_name = _head_by_name(heads)
    for name, (mask, target) in target_builder(frame).items():
        head = heads_by_name.get(name)
        if head is None:
            continue
        predictions = head.predict(matrix[mask])
        accumulators[name].update(predictions, target, baseline=head.positive_rate)


def _evaluate_linear_group(
    accumulators: dict[str, _MetricAccumulator],
    frame: pl.DataFrame,
    feature_builder,
    target_builder,
    heads: tuple[FittedLinearHead, ...],
) -> None:
    if frame.height == 0:
        return
    _, matrix = feature_builder(frame)
    heads_by_name = _head_by_name(heads)
    for name, (mask, target) in target_builder(frame).items():
        head = heads_by_name.get(name)
        if head is None:
            continue
        predictions = head.predict(matrix[mask])
        accumulators[name].update(predictions, target, baseline=head.target_mean)


def _evaluate_prepared_year_shocks(
    accumulators: dict[str, _MetricAccumulator],
    prepared: _PreparedYearShockGroup,
    selected_run_ids: list[str],
    fit: RoundDynamicLawFit,
) -> None:
    value_parts = [
        prepared.values_by_run[run_id]
        for run_id in selected_run_ids
        if run_id in prepared.values_by_run
    ]
    if not value_parts:
        return
    year_shock_matrix = np.concatenate(value_parts, axis=0).astype(np.float64)
    for index, name in enumerate(fit.year_shock_names):
        accumulators[name].update(
            np.full(
                (year_shock_matrix.shape[0],),
                float(fit.year_shock_vector[index]),
                dtype=np.float64,
            ),
            year_shock_matrix[:, index],
            baseline=None,
        )


def _probe_std_summary(
    probe_names: list[str],
    probe_matrix: np.ndarray,
) -> tuple[float | None, float | None, float | None, tuple[str, ...], tuple[float, ...]]:
    if probe_matrix.size == 0:
        return None, None, None, (), ()
    std_vector = np.std(probe_matrix, axis=0)
    order = np.argsort(-std_vector)
    top_count = min(8, std_vector.shape[0])
    top_indexes = order[:top_count]
    return (
        float(np.mean(std_vector)),
        float(np.median(std_vector)),
        float(np.max(std_vector)),
        tuple(probe_names[index] for index in top_indexes.tolist()),
        tuple(float(std_vector[index]) for index in top_indexes.tolist()),
    )


def evaluate_round_dynamic_law_summary(
    *,
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
    max_holdout_runs: int = 8,
    bootstrap_samples: int = 8,
    rng_seed: int = 0,
) -> DynamicLawRoundValidationReport:
    if not bundles:
        raise ValueError("cannot validate round dynamic law without replay measurement bundles")

    partitioned_bundles = [_partition_bundle(bundle) for bundle in bundles]
    prepared_site = _prepare_group(
        partitioned_bundles,
        group_name="site",
        feature_builder=site_feature_matrix,
        target_builders=(site_binary_target_data,),
    )
    prepared_settlement = _prepare_group(
        partitioned_bundles,
        group_name="settlement",
        feature_builder=settlement_feature_matrix,
        target_builders=(settlement_binary_target_data, settlement_linear_target_data),
    )
    prepared_pairwise = _prepare_group(
        partitioned_bundles,
        group_name="pairwise",
        feature_builder=pairwise_feature_matrix,
        target_builders=(pairwise_binary_target_data, pairwise_linear_target_data),
    )
    prepared_ruin = _prepare_group(
        partitioned_bundles,
        group_name="ruin",
        feature_builder=ruin_feature_matrix,
        target_builders=(ruin_binary_target_data,),
    )
    prepared_owner = _prepare_group(
        partitioned_bundles,
        group_name="owner",
        feature_builder=owner_feature_matrix,
        target_builders=(owner_linear_target_data,),
    )
    prepared_macro = _prepare_group(
        partitioned_bundles,
        group_name="macro",
        feature_builder=macro_feature_matrix,
        target_builders=(macro_linear_target_data,),
    )
    prepared_year_shocks = _prepare_year_shocks(partitioned_bundles)
    all_run_ids = tuple(
        sorted({run_id for bundle in partitioned_bundles for run_id in bundle.run_ids}),
    )
    holdout_run_ids = _select_holdout_run_ids(
        all_run_ids,
        max_holdout_runs=max_holdout_runs,
    )
    probe_source_run_ids = [run_id for run_id in all_run_ids if run_id not in holdout_run_ids]
    if not probe_source_run_ids:
        probe_source_run_ids = list(all_run_ids)

    probe_library = build_dynamic_law_probe_library(
        [
            _concat_selected(bundle.site_by_run, probe_source_run_ids, bundle.site_empty)
            for bundle in partitioned_bundles
        ],
        [
            _concat_selected(
                bundle.settlement_by_run,
                probe_source_run_ids,
                bundle.settlement_empty,
            )
            for bundle in partitioned_bundles
        ],
        [
            _concat_selected(
                bundle.pairwise_by_run,
                probe_source_run_ids,
                bundle.pairwise_empty,
            )
            for bundle in partitioned_bundles
        ],
        [
            _concat_selected(
                bundle.ruin_by_run,
                probe_source_run_ids,
                bundle.ruin_empty,
            )
            for bundle in partitioned_bundles
        ],
        [
            _concat_selected(
                bundle.owner_by_run,
                probe_source_run_ids,
                bundle.owner_empty,
            )
            for bundle in partitioned_bundles
        ],
        [
            _concat_selected(
                bundle.macro_by_run,
                probe_source_run_ids,
                bundle.macro_empty,
            )
            for bundle in partitioned_bundles
        ],
    )
    probe_summary_names = dynamic_law_probe_summary_names(probe_library)

    site_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name, _column_name in SITE_BINARY_TARGETS
    }
    settlement_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name, _column_name, _mask_name in SETTLEMENT_BINARY_TARGETS
    }
    settlement_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name, _column_name in SETTLEMENT_LINEAR_TARGETS
    }
    pairwise_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name, _column_name in PAIRWISE_BINARY_TARGETS
    }
    pairwise_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name, _column_name in PAIRWISE_LINEAR_TARGETS
    }
    ruin_binary_acc = {
        name: _MetricAccumulator(metric_name="brier")
        for name, _column_name in RUIN_BINARY_TARGETS
    }
    owner_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name, _column_name in OWNER_LINEAR_TARGETS
    }
    macro_linear_acc = {
        name: _MetricAccumulator(metric_name="rmse")
        for name, _column_name in MACRO_LINEAR_TARGETS
    }
    year_shock_acc = {
        name: _MetricAccumulator(metric_name="mae")
        for name in YEAR_SHOCK_COLUMNS
    }

    for holdout_run_id in holdout_run_ids:
        train_run_ids = [run_id for run_id in all_run_ids if run_id != holdout_run_id]
        if not train_run_ids:
            continue

        fitted = _fit_prepared_dynamic_law(
            round_id=round_id,
            round_number=round_number,
            selected_run_ids=train_run_ids,
            site_group=prepared_site,
            settlement_group=prepared_settlement,
            pairwise_group=prepared_pairwise,
            ruin_group=prepared_ruin,
            owner_group=prepared_owner,
            macro_group=prepared_macro,
            year_shocks=prepared_year_shocks,
        )
        heldout_run_ids = [holdout_run_id]
        _evaluate_binary_prepared_group(
            site_binary_acc,
            prepared_site,
            heldout_run_ids,
            fitted.site_binary_heads,
        )
        _evaluate_binary_prepared_group(
            settlement_binary_acc,
            prepared_settlement,
            heldout_run_ids,
            fitted.settlement_binary_heads,
        )
        _evaluate_linear_prepared_group(
            settlement_linear_acc,
            prepared_settlement,
            heldout_run_ids,
            fitted.settlement_linear_heads,
        )
        _evaluate_binary_prepared_group(
            pairwise_binary_acc,
            prepared_pairwise,
            heldout_run_ids,
            fitted.pairwise_binary_heads,
        )
        _evaluate_linear_prepared_group(
            pairwise_linear_acc,
            prepared_pairwise,
            heldout_run_ids,
            fitted.pairwise_linear_heads,
        )
        _evaluate_binary_prepared_group(
            ruin_binary_acc,
            prepared_ruin,
            heldout_run_ids,
            fitted.ruin_binary_heads,
        )
        _evaluate_linear_prepared_group(
            owner_linear_acc,
            prepared_owner,
            heldout_run_ids,
            fitted.owner_linear_heads,
        )
        _evaluate_linear_prepared_group(
            macro_linear_acc,
            prepared_macro,
            heldout_run_ids,
            fitted.macro_linear_heads,
        )
        _evaluate_prepared_year_shocks(
            year_shock_acc,
            prepared_year_shocks,
            heldout_run_ids,
            fitted,
        )

    bootstrap_vectors: list[np.ndarray] = []
    rng = np.random.default_rng(rng_seed)
    for _bootstrap_index in range(max(0, bootstrap_samples)):
        sampled_run_ids: list[str] = []
        for bundle in partitioned_bundles:
            if not bundle.run_ids:
                continue
            sampled_run_ids.extend(
                rng.choice(
                    np.asarray(bundle.run_ids, dtype=object),
                    size=len(bundle.run_ids),
                    replace=True,
                ).tolist(),
            )
        if not sampled_run_ids:
            continue
        sampled_fit = _fit_prepared_dynamic_law(
            round_id=round_id,
            round_number=round_number,
            selected_run_ids=sampled_run_ids,
            site_group=prepared_site,
            settlement_group=prepared_settlement,
            pairwise_group=prepared_pairwise,
            ruin_group=prepared_ruin,
            owner_group=prepared_owner,
            macro_group=prepared_macro,
            year_shocks=prepared_year_shocks,
        )
        _, sampled_probe_vector = sampled_fit.probe_summary(probe_library)
        bootstrap_vectors.append(sampled_probe_vector)

    bootstrap_matrix = (
        np.stack(bootstrap_vectors, axis=0).astype(np.float64)
        if bootstrap_vectors
        else np.zeros((0, len(probe_summary_names)), dtype=np.float64)
    )
    probe_std = (
        np.std(bootstrap_matrix, axis=0).astype(np.float64)
        if bootstrap_matrix.shape[0] > 0
        else np.zeros((len(probe_summary_names),), dtype=np.float64)
    )
    (
        probe_std_mean,
        probe_std_median,
        probe_std_max,
        top_unstable_names,
        top_unstable_values,
    ) = _probe_std_summary(probe_summary_names, bootstrap_matrix)

    return DynamicLawRoundValidationReport(
        round_id=round_id,
        round_number=round_number,
        replay_seed_count=len(bundles),
        replay_run_count=len(all_run_ids),
        evaluated_holdout_run_ids=holdout_run_ids,
        bootstrap_samples=bootstrap_matrix.shape[0],
        site_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in site_binary_acc.items()
        ),
        settlement_binary_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in settlement_binary_acc.items()
        ),
        settlement_linear_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in settlement_linear_acc.items()
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
        macro_linear_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in macro_linear_acc.items()
        ),
        year_shock_metrics=tuple(
            accumulator.summarize(name)
            for name, accumulator in year_shock_acc.items()
        ),
        probe_summary_names=tuple(probe_summary_names),
        probe_summary_std=tuple(float(value) for value in probe_std.tolist()),
        probe_std_mean=probe_std_mean,
        probe_std_median=probe_std_median,
        probe_std_max=probe_std_max,
        top_unstable_summary_names=top_unstable_names,
        top_unstable_summary_values=top_unstable_values,
    )


__all__ = [
    "DynamicLawMetricSummary",
    "DynamicLawRoundValidationReport",
    "evaluate_round_dynamic_law_summary",
]
