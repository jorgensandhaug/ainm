from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.measurements import ReplayMeasurementBundle

SITE_BINARY_TARGETS: tuple[str, ...] = ("birth", "site_ruin_created")
LIVE_BINARY_TARGETS: tuple[str, ...] = (
    "collapse",
    "collapse_to_ruin",
    "port_gain",
    "owner_flip",
)
LIVE_LINEAR_TARGETS: tuple[str, ...] = (
    "population_delta",
    "food_delta",
    "wealth_delta",
    "defense_delta",
)
RUIN_BINARY_TARGETS: tuple[str, ...] = (
    "remain_ruin",
    "rebuild_settlement",
    "rebuild_port",
    "reclaim_forest",
    "fade_empty",
)
OWNER_SUMMARY_COLUMNS: tuple[str, ...] = (
    "settlement_delta",
    "port_delta",
    "population_delta",
    "food_delta",
    "wealth_delta",
    "defense_delta",
    "mean_frontier_score",
    "mean_maritime_access",
    "mean_settlement_proximity",
)
YEAR_SHOCK_SUMMARY_COLUMNS: tuple[str, ...] = (
    "birth_count",
    "rebuild_count",
    "collapse_count",
    "collapse_to_ruin_count",
    "site_ruin_created_count",
    "owner_flip_count",
    "port_gain_count",
    "port_loss_count",
    "collapse_rate",
    "site_ruin_created_rate",
    "negative_food_share",
    "mean_population_delta",
    "mean_food_delta",
    "mean_wealth_delta",
    "mean_defense_delta",
    "food_delta_std",
    "wealth_delta_std",
)
MACRO_SUMMARY_COLUMNS: tuple[str, ...] = (
    "live_count",
    "port_count",
    "ruin_count",
    "owner_count",
    "coastal_live_share",
    "frontier_live_share",
    "mean_frontier_score",
    "mean_maritime_access",
    "live_delta",
    "port_delta",
    "ruin_delta",
    "owner_delta",
)


def _sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -30.0, 30.0)
    return 1.0 / (1.0 + np.exp(-clipped))


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


def _positive_quantile(values: np.ndarray, quantile: float) -> float:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return 0.0
    return float(np.quantile(finite, quantile))


def _fit_ridge_linear(
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[float, np.ndarray]:
    if feature_matrix.shape[0] == 0:
        return 0.0, np.zeros(feature_matrix.shape[1], dtype=np.float64)
    design = np.concatenate(
        [np.ones((feature_matrix.shape[0], 1), dtype=np.float64), feature_matrix],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ target
    solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0]), np.asarray(solution[1:], dtype=np.float64)


def _fit_ridge_logistic(
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
    max_iter: int = 32,
    tol: float = 1e-6,
) -> tuple[float, np.ndarray]:
    if feature_matrix.shape[0] == 0:
        return 0.0, np.zeros(feature_matrix.shape[1], dtype=np.float64)
    design = np.concatenate(
        [np.ones((feature_matrix.shape[0], 1), dtype=np.float64), feature_matrix],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    mean_target = float(np.mean(target))
    beta = np.zeros(design.shape[1], dtype=np.float64)
    clipped_mean = np.clip(mean_target, 1e-4, 1.0 - 1e-4)
    beta[0] = float(np.log(clipped_mean / (1.0 - clipped_mean)))
    for _ in range(max_iter):
        logits = design @ beta
        probs = _sigmoid(logits)
        weights = np.maximum(probs * (1.0 - probs), 1e-4)
        working = logits + (target - probs) / weights
        lhs = design.T @ (design * weights[:, None]) + ridge_alpha * penalty
        rhs = design.T @ (weights * working)
        updated = np.linalg.pinv(lhs) @ rhs
        if float(np.max(np.abs(updated - beta))) <= tol:
            beta = updated
            break
        beta = updated
    return float(beta[0]), np.asarray(beta[1:], dtype=np.float64)


def _representative_probe(feature_matrix: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if feature_matrix.shape[0] == 0:
        return np.zeros((feature_matrix.shape[1],), dtype=np.float64)
    candidate_mask = np.asarray(mask, dtype=bool)
    if not bool(np.any(candidate_mask)):
        candidate_mask = np.ones(feature_matrix.shape[0], dtype=bool)
    candidates = feature_matrix[candidate_mask]
    center = np.median(candidates, axis=0)
    distances = np.sum((candidates - center[None, :]) ** 2, axis=1)
    return np.asarray(candidates[int(np.argmin(distances))], dtype=np.float64)


def _concat_frames(
    frames: Iterable[pl.DataFrame],
    schema: dict[str, pl.DataType] | None = None,
) -> pl.DataFrame:
    materialized = list(frames)
    if not materialized:
        return pl.DataFrame(schema=schema)
    return pl.concat(materialized, how="vertical_relaxed")


def _aggregate_summary(
    frame: pl.DataFrame,
    columns: tuple[str, ...],
) -> tuple[tuple[str, ...], np.ndarray]:
    values = [
        float(np.mean(_frame_column(frame, name, dtype=np.float64, fill_null=0.0)))
        if frame.height > 0
        else 0.0
        for name in columns
    ]
    return columns, np.asarray(values, dtype=np.float64)


class BehavioralBinaryHead(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    feature_names: tuple[str, ...]
    intercept: float
    coefficients: np.ndarray
    sample_count: int = Field(ge=0)
    positive_rate: float

    def predict(self, feature_matrix: np.ndarray) -> np.ndarray:
        matrix = np.asarray(feature_matrix, dtype=np.float64)
        return _sigmoid(self.intercept + (matrix @ self.coefficients))


class BehavioralLinearHead(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    feature_names: tuple[str, ...]
    intercept: float
    coefficients: np.ndarray
    sample_count: int = Field(ge=0)
    target_mean: float

    def predict(self, feature_matrix: np.ndarray) -> np.ndarray:
        matrix = np.asarray(feature_matrix, dtype=np.float64)
        return self.intercept + (matrix @ self.coefficients)


class BehavioralFingerprintProbeLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    site_feature_names: tuple[str, ...]
    live_feature_names: tuple[str, ...]
    ruin_feature_names: tuple[str, ...]
    site_probe_names: tuple[str, ...]
    site_probe_matrix: np.ndarray
    live_probe_names: tuple[str, ...]
    live_probe_matrix: np.ndarray
    ruin_probe_names: tuple[str, ...]
    ruin_probe_matrix: np.ndarray


class RoundBehavioralFingerprintFit(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    site_feature_names: tuple[str, ...]
    live_feature_names: tuple[str, ...]
    ruin_feature_names: tuple[str, ...]
    site_binary_heads: tuple[BehavioralBinaryHead, ...]
    live_binary_heads: tuple[BehavioralBinaryHead, ...]
    live_linear_heads: tuple[BehavioralLinearHead, ...]
    ruin_binary_heads: tuple[BehavioralBinaryHead, ...]
    owner_summary_names: tuple[str, ...]
    owner_summary_vector: np.ndarray
    year_shock_summary_names: tuple[str, ...]
    year_shock_summary_vector: np.ndarray
    macro_summary_names: tuple[str, ...]
    macro_summary_vector: np.ndarray

    def probe_summary(
        self,
        probe_library: BehavioralFingerprintProbeLibrary,
    ) -> tuple[list[str], np.ndarray]:
        if tuple(self.site_feature_names) != tuple(probe_library.site_feature_names):
            raise ValueError("site probe library feature mismatch")
        if tuple(self.live_feature_names) != tuple(probe_library.live_feature_names):
            raise ValueError("live probe library feature mismatch")
        if tuple(self.ruin_feature_names) != tuple(probe_library.ruin_feature_names):
            raise ValueError("ruin probe library feature mismatch")

        names: list[str] = []
        values: list[float] = []

        for head in self.site_binary_heads:
            predictions = head.predict(probe_library.site_probe_matrix)
            for probe_name, value in zip(probe_library.site_probe_names, predictions, strict=True):
                names.append(f"site_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.live_binary_heads:
            predictions = head.predict(probe_library.live_probe_matrix)
            for probe_name, value in zip(probe_library.live_probe_names, predictions, strict=True):
                names.append(f"live_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.live_linear_heads:
            predictions = head.predict(probe_library.live_probe_matrix)
            for probe_name, value in zip(probe_library.live_probe_names, predictions, strict=True):
                names.append(f"live_linear::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.ruin_binary_heads:
            predictions = head.predict(probe_library.ruin_probe_matrix)
            for probe_name, value in zip(probe_library.ruin_probe_names, predictions, strict=True):
                names.append(f"ruin_binary::{head.name}::{probe_name}")
                values.append(float(value))

        for name, value in zip(self.owner_summary_names, self.owner_summary_vector, strict=True):
            names.append(f"owner::{name}")
            values.append(float(value))
        for name, value in zip(
            self.year_shock_summary_names,
            self.year_shock_summary_vector,
            strict=True,
        ):
            names.append(f"year_shock::{name}")
            values.append(float(value))
        for name, value in zip(self.macro_summary_names, self.macro_summary_vector, strict=True):
            names.append(f"macro::{name}")
            values.append(float(value))
        return names, np.asarray(values, dtype=np.float64)


class RoundBehavioralFingerprintEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    bootstrap_samples: int = Field(ge=0)
    summary_names: tuple[str, ...]
    summary_vector: np.ndarray
    summary_std: np.ndarray


def site_opportunity_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    coast_distance_steps = _frame_column(frame, "coast_distance_steps", dtype=np.float64)
    coast_distance_unreachable = _frame_column(
        frame,
        "coast_distance_unreachable",
        dtype=np.float64,
    )
    land_distance_steps = _frame_column(
        frame,
        "land_distance_to_settlement_steps",
        dtype=np.float64,
    )
    land_distance_unreachable = _frame_column(
        frame,
        "land_distance_to_settlement_unreachable",
        dtype=np.float64,
    )
    sea_distance_steps = _frame_column(frame, "sea_distance_to_port_steps", dtype=np.float64)
    sea_distance_unreachable = _frame_column(
        frame,
        "sea_distance_to_port_unreachable",
        dtype=np.float64,
    )
    basin_gap_steps = _frame_column(frame, "settlement_basin_gap_steps", dtype=np.float64)
    basin_gap_unreachable = _frame_column(
        frame,
        "settlement_basin_gap_unreachable",
        dtype=np.float64,
    )
    feature_names = (
        "prev_ruin",
        "buildable",
        "coast",
        "coast_distance_steps_log1p",
        "coast_distance_unreachable",
        "land_distance_to_settlement_steps_log1p",
        "land_distance_to_settlement_unreachable",
        "sea_distance_to_port_steps_log1p",
        "sea_distance_to_port_unreachable",
        "settlement_basin_gap_steps_log1p",
        "settlement_basin_gap_unreachable",
        "forest_density",
        "mountain_density",
        "settlement_proximity",
        "maritime_access",
        "frontier_score",
        "nearby_live_count_log1p",
        "nearby_same_owner_count_log1p",
        "nearby_other_owner_count_log1p",
        "nearby_port_count_log1p",
        "nearby_ruin_count_log1p",
    )
    matrix = np.stack(
        [
            _frame_column(frame, "prev_ruin", dtype=np.float64),
            _frame_column(frame, "buildable", dtype=np.float64),
            _frame_column(frame, "coast", dtype=np.float64),
            np.log1p(np.clip(coast_distance_steps, 0.0, None)),
            coast_distance_unreachable,
            np.log1p(np.clip(land_distance_steps, 0.0, None)),
            land_distance_unreachable,
            np.log1p(np.clip(sea_distance_steps, 0.0, None)),
            sea_distance_unreachable,
            np.log1p(np.clip(basin_gap_steps, 0.0, None)),
            basin_gap_unreachable,
            _frame_column(frame, "forest_density", dtype=np.float64),
            _frame_column(frame, "mountain_density", dtype=np.float64),
            _frame_column(frame, "settlement_proximity", dtype=np.float64),
            _frame_column(frame, "maritime_access", dtype=np.float64),
            _frame_column(frame, "frontier_score", dtype=np.float64),
            np.log1p(_frame_column(frame, "nearby_live_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_same_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_other_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_port_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_ruin_count", dtype=np.float64)),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


def live_settlement_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    coast_distance_steps = _frame_column(frame, "coast_distance_steps", dtype=np.float64)
    coast_distance_unreachable = _frame_column(
        frame,
        "coast_distance_unreachable",
        dtype=np.float64,
    )
    land_distance_steps = _frame_column(
        frame,
        "land_distance_to_settlement_steps",
        dtype=np.float64,
    )
    land_distance_unreachable = _frame_column(
        frame,
        "land_distance_to_settlement_unreachable",
        dtype=np.float64,
    )
    sea_distance_steps = _frame_column(frame, "sea_distance_to_port_steps", dtype=np.float64)
    sea_distance_unreachable = _frame_column(
        frame,
        "sea_distance_to_port_unreachable",
        dtype=np.float64,
    )
    basin_gap_steps = _frame_column(frame, "settlement_basin_gap_steps", dtype=np.float64)
    basin_gap_unreachable = _frame_column(
        frame,
        "settlement_basin_gap_unreachable",
        dtype=np.float64,
    )
    prev_owner_id = _frame_column(frame, "prev_owner_id", dtype=np.float64, fill_null=-1.0)
    feature_names = (
        "prev_has_port",
        "prev_owner_known",
        "coast",
        "coast_distance_steps_log1p",
        "coast_distance_unreachable",
        "land_distance_to_settlement_steps_log1p",
        "land_distance_to_settlement_unreachable",
        "sea_distance_to_port_steps_log1p",
        "sea_distance_to_port_unreachable",
        "settlement_basin_gap_steps_log1p",
        "settlement_basin_gap_unreachable",
        "forest_density",
        "mountain_density",
        "settlement_proximity",
        "maritime_access",
        "frontier_score",
        "nearby_live_count_log1p",
        "nearby_same_owner_count_log1p",
        "nearby_other_owner_count_log1p",
        "nearby_port_count_log1p",
        "nearby_ruin_count_log1p",
        "prev_population_asinh",
        "prev_food_asinh",
        "prev_wealth_asinh",
        "prev_defense_asinh",
    )
    matrix = np.stack(
        [
            _frame_column(frame, "prev_has_port", dtype=np.float64),
            (prev_owner_id >= 0.0).astype(np.float64),
            _frame_column(frame, "coast", dtype=np.float64),
            np.log1p(np.clip(coast_distance_steps, 0.0, None)),
            coast_distance_unreachable,
            np.log1p(np.clip(land_distance_steps, 0.0, None)),
            land_distance_unreachable,
            np.log1p(np.clip(sea_distance_steps, 0.0, None)),
            sea_distance_unreachable,
            np.log1p(np.clip(basin_gap_steps, 0.0, None)),
            basin_gap_unreachable,
            _frame_column(frame, "forest_density", dtype=np.float64),
            _frame_column(frame, "mountain_density", dtype=np.float64),
            _frame_column(frame, "settlement_proximity", dtype=np.float64),
            _frame_column(frame, "maritime_access", dtype=np.float64),
            _frame_column(frame, "frontier_score", dtype=np.float64),
            np.log1p(_frame_column(frame, "nearby_live_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_same_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_other_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_port_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_ruin_count", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "prev_population", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_food", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_wealth", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_defense", dtype=np.float64, fill_null=0.0)),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


def ruin_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    coast_distance_steps = _frame_column(frame, "coast_distance_steps", dtype=np.float64)
    coast_distance_unreachable = _frame_column(
        frame,
        "coast_distance_unreachable",
        dtype=np.float64,
    )
    land_distance_steps = _frame_column(
        frame,
        "land_distance_to_settlement_steps",
        dtype=np.float64,
    )
    land_distance_unreachable = _frame_column(
        frame,
        "land_distance_to_settlement_unreachable",
        dtype=np.float64,
    )
    sea_distance_steps = _frame_column(frame, "sea_distance_to_port_steps", dtype=np.float64)
    sea_distance_unreachable = _frame_column(
        frame,
        "sea_distance_to_port_unreachable",
        dtype=np.float64,
    )
    basin_gap_steps = _frame_column(frame, "settlement_basin_gap_steps", dtype=np.float64)
    basin_gap_unreachable = _frame_column(
        frame,
        "settlement_basin_gap_unreachable",
        dtype=np.float64,
    )
    feature_names = (
        "ruin_age_log1p",
        "buildable",
        "coast",
        "coast_distance_steps_log1p",
        "coast_distance_unreachable",
        "land_distance_to_settlement_steps_log1p",
        "land_distance_to_settlement_unreachable",
        "sea_distance_to_port_steps_log1p",
        "sea_distance_to_port_unreachable",
        "settlement_basin_gap_steps_log1p",
        "settlement_basin_gap_unreachable",
        "forest_density",
        "mountain_density",
        "settlement_proximity",
        "maritime_access",
        "frontier_score",
        "nearby_live_count_log1p",
        "nearby_same_owner_count_log1p",
        "nearby_other_owner_count_log1p",
        "nearby_port_count_log1p",
        "nearby_ruin_count_log1p",
    )
    matrix = np.stack(
        [
            np.log1p(np.clip(_frame_column(frame, "ruin_age", dtype=np.float64), 0.0, None)),
            _frame_column(frame, "buildable", dtype=np.float64),
            _frame_column(frame, "coast", dtype=np.float64),
            np.log1p(np.clip(coast_distance_steps, 0.0, None)),
            coast_distance_unreachable,
            np.log1p(np.clip(land_distance_steps, 0.0, None)),
            land_distance_unreachable,
            np.log1p(np.clip(sea_distance_steps, 0.0, None)),
            sea_distance_unreachable,
            np.log1p(np.clip(basin_gap_steps, 0.0, None)),
            basin_gap_unreachable,
            _frame_column(frame, "forest_density", dtype=np.float64),
            _frame_column(frame, "mountain_density", dtype=np.float64),
            _frame_column(frame, "settlement_proximity", dtype=np.float64),
            _frame_column(frame, "maritime_access", dtype=np.float64),
            _frame_column(frame, "frontier_score", dtype=np.float64),
            np.log1p(_frame_column(frame, "nearby_live_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_same_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_other_owner_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_port_count", dtype=np.float64)),
            np.log1p(_frame_column(frame, "nearby_ruin_count", dtype=np.float64)),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


def build_behavioral_fingerprint_probe_library(
    site_frames: Iterable[pl.DataFrame],
    live_frames: Iterable[pl.DataFrame],
    ruin_frames: Iterable[pl.DataFrame],
) -> BehavioralFingerprintProbeLibrary:
    site_frame = pl.concat(list(site_frames), how="vertical_relaxed")
    live_frame = pl.concat(list(live_frames), how="vertical_relaxed")
    ruin_frame = pl.concat(list(ruin_frames), how="vertical_relaxed")
    site_feature_names, site_matrix = site_opportunity_feature_matrix(site_frame)
    live_feature_names, live_matrix = live_settlement_feature_matrix(live_frame)
    ruin_feature_names, ruin_matrix = ruin_feature_matrix(ruin_frame)

    site_prev_ruin = _frame_column(site_frame, "prev_ruin", dtype=bool)
    site_buildable = _frame_column(site_frame, "buildable", dtype=np.float64) > 0.5
    site_coast = _frame_column(site_frame, "coast", dtype=np.float64) > 0.5
    site_frontier = _frame_column(site_frame, "frontier_score", dtype=np.float64)
    site_other_owner = _frame_column(site_frame, "nearby_other_owner_count", dtype=np.float64)
    site_nearby_live = _frame_column(site_frame, "nearby_live_count", dtype=np.float64)
    site_forest = _frame_column(site_frame, "forest_density", dtype=np.float64)
    site_frontier_threshold = _positive_quantile(site_frontier[~site_prev_ruin], 0.67)
    site_forest_threshold = _positive_quantile(site_forest[~site_prev_ruin], 0.67)
    site_probe_specs = (
        ("open_inland", (~site_prev_ruin) & site_buildable & (~site_coast)),
        ("open_coastal", (~site_prev_ruin) & site_buildable & site_coast),
        (
            "frontier_open",
            (~site_prev_ruin)
            & site_buildable
            & (site_frontier >= site_frontier_threshold)
            & (site_other_owner > 0.0),
        ),
        ("forest_edge_open", (~site_prev_ruin) & site_buildable & (site_forest >= site_forest_threshold)),
        ("coastal_ruin", site_prev_ruin & site_coast),
        ("supported_ruin", site_prev_ruin & (site_nearby_live > 0.0)),
        ("isolated_ruin", site_prev_ruin & (site_nearby_live <= 0.0)),
    )
    site_probe_matrix = np.stack(
        [_representative_probe(site_matrix, mask) for _, mask in site_probe_specs],
        axis=0,
    ).astype(np.float64)

    live_coast = _frame_column(live_frame, "coast", dtype=np.float64) > 0.5
    live_has_port = _frame_column(live_frame, "prev_has_port", dtype=bool)
    live_food = _frame_column(live_frame, "prev_food", dtype=np.float64, fill_null=0.0)
    live_wealth = _frame_column(live_frame, "prev_wealth", dtype=np.float64, fill_null=0.0)
    live_defense = _frame_column(live_frame, "prev_defense", dtype=np.float64, fill_null=0.0)
    live_frontier = _frame_column(live_frame, "frontier_score", dtype=np.float64)
    live_other_owner = _frame_column(live_frame, "nearby_other_owner_count", dtype=np.float64)
    live_food_low = _positive_quantile(live_food, 0.33)
    live_wealth_high = _positive_quantile(live_wealth, 0.67)
    live_defense_high = _positive_quantile(live_defense, 0.67)
    live_frontier_threshold = _positive_quantile(live_frontier, 0.67)
    live_probe_specs = (
        (
            "weak_inland",
            (~live_coast) & (~live_has_port) & (live_food <= live_food_low),
        ),
        ("coastal_nonport", live_coast & (~live_has_port)),
        ("established_port", live_has_port),
        (
            "frontier_exposed",
            (live_frontier >= live_frontier_threshold) & (live_other_owner > 0.0),
        ),
        (
            "defended_core",
            (live_defense >= live_defense_high) & (live_other_owner <= 0.0),
        ),
        (
            "rich_coastal",
            live_coast & (live_wealth >= live_wealth_high) & (live_food > live_food_low),
        ),
    )
    live_probe_matrix = np.stack(
        [_representative_probe(live_matrix, mask) for _, mask in live_probe_specs],
        axis=0,
    ).astype(np.float64)

    ruin_coast = _frame_column(ruin_frame, "coast", dtype=np.float64) > 0.5
    ruin_nearby_live = _frame_column(ruin_frame, "nearby_live_count", dtype=np.float64)
    ruin_forest = _frame_column(ruin_frame, "forest_density", dtype=np.float64)
    ruin_forest_threshold = _positive_quantile(ruin_forest, 0.67)
    ruin_probe_specs = (
        ("coastal_supported", ruin_coast & (ruin_nearby_live > 0.0)),
        ("inland_supported", (~ruin_coast) & (ruin_nearby_live > 0.0)),
        ("isolated", ruin_nearby_live <= 0.0),
        ("forest_pressured", ruin_forest >= ruin_forest_threshold),
    )
    ruin_probe_matrix = np.stack(
        [_representative_probe(ruin_matrix, mask) for _, mask in ruin_probe_specs],
        axis=0,
    ).astype(np.float64)

    return BehavioralFingerprintProbeLibrary(
        site_feature_names=site_feature_names,
        live_feature_names=live_feature_names,
        ruin_feature_names=ruin_feature_names,
        site_probe_names=tuple(name for name, _ in site_probe_specs),
        site_probe_matrix=site_probe_matrix,
        live_probe_names=tuple(name for name, _ in live_probe_specs),
        live_probe_matrix=live_probe_matrix,
        ruin_probe_names=tuple(name for name, _ in ruin_probe_specs),
        ruin_probe_matrix=ruin_probe_matrix,
    )


def _fit_binary_head(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> BehavioralBinaryHead:
    intercept, coefficients = _fit_ridge_logistic(feature_matrix, target, ridge_alpha=ridge_alpha)
    return BehavioralBinaryHead(
        name=name,
        feature_names=feature_names,
        intercept=intercept,
        coefficients=coefficients,
        sample_count=int(target.shape[0]),
        positive_rate=float(np.mean(target)) if target.size else 0.0,
    )


def _fit_linear_head(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> BehavioralLinearHead:
    intercept, coefficients = _fit_ridge_linear(feature_matrix, target, ridge_alpha=ridge_alpha)
    return BehavioralLinearHead(
        name=name,
        feature_names=feature_names,
        intercept=intercept,
        coefficients=coefficients,
        sample_count=int(target.shape[0]),
        target_mean=float(np.mean(target)) if target.size else 0.0,
    )


def fit_round_behavioral_fingerprint(
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
    *,
    ridge_alpha: float = 1.0,
) -> RoundBehavioralFingerprintFit:
    if not bundles:
        raise ValueError("cannot fit round behavioral fingerprint without replay measurements")

    site_frame = _concat_frames(bundle.site_opportunities for bundle in bundles)
    live_frame = _concat_frames(bundle.live_settlement_transitions for bundle in bundles)
    ruin_frame = _concat_frames(bundle.ruin_transitions for bundle in bundles)
    owner_frame = _concat_frames(bundle.owner_years for bundle in bundles)
    year_shock_frame = _concat_frames(bundle.year_shocks for bundle in bundles)
    macro_frame = _concat_frames(bundle.macro_trajectories for bundle in bundles)

    site_feature_names, site_matrix = site_opportunity_feature_matrix(site_frame)
    live_feature_names, live_matrix = live_settlement_feature_matrix(live_frame)
    ruin_feature_names, ruin_matrix = ruin_feature_matrix(ruin_frame)

    site_binary_heads: list[BehavioralBinaryHead] = []
    non_ruin_mask = ~_frame_column(site_frame, "prev_ruin", dtype=bool)
    for name in SITE_BINARY_TARGETS:
        target = _frame_column(site_frame, name, dtype=np.float64)[non_ruin_mask]
        site_binary_heads.append(
            _fit_binary_head(
                name,
                site_feature_names,
                site_matrix[non_ruin_mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    live_binary_heads: list[BehavioralBinaryHead] = []
    live_owner_known_mask = (
        _frame_column(live_frame, "prev_owner_id", dtype=np.int64, fill_null=-1) >= 0
    ) & (_frame_column(live_frame, "next_owner_id", dtype=np.int64, fill_null=-1) >= 0)
    for name in LIVE_BINARY_TARGETS:
        if name == "owner_flip":
            mask = live_owner_known_mask
        elif name == "port_gain":
            mask = ~_frame_column(live_frame, "prev_has_port", dtype=bool)
        else:
            mask = np.ones(live_frame.height, dtype=bool)
        target = _frame_column(live_frame, name, dtype=np.float64)[mask]
        live_binary_heads.append(
            _fit_binary_head(
                name,
                live_feature_names,
                live_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    live_linear_heads: list[BehavioralLinearHead] = []
    continuous_mask = _frame_column(live_frame, "next_alive", dtype=bool)
    for name in LIVE_LINEAR_TARGETS:
        target = _frame_column(live_frame, name, dtype=np.float64, fill_null=0.0)[continuous_mask]
        live_linear_heads.append(
            _fit_linear_head(
                name,
                live_feature_names,
                live_matrix[continuous_mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    ruin_binary_heads: list[BehavioralBinaryHead] = []
    for name in RUIN_BINARY_TARGETS:
        target = _frame_column(ruin_frame, name, dtype=np.float64)
        ruin_binary_heads.append(
            _fit_binary_head(
                name,
                ruin_feature_names,
                ruin_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    owner_summary_names, owner_summary_vector = _aggregate_summary(
        owner_frame,
        OWNER_SUMMARY_COLUMNS,
    )
    year_shock_summary_names, year_shock_summary_vector = _aggregate_summary(
        year_shock_frame,
        YEAR_SHOCK_SUMMARY_COLUMNS,
    )
    macro_summary_names, macro_summary_vector = _aggregate_summary(
        macro_frame,
        MACRO_SUMMARY_COLUMNS,
    )

    return RoundBehavioralFingerprintFit(
        round_id=round_id,
        round_number=round_number,
        sample_count=int(site_frame.height + live_frame.height + ruin_frame.height),
        site_feature_names=site_feature_names,
        live_feature_names=live_feature_names,
        ruin_feature_names=ruin_feature_names,
        site_binary_heads=tuple(site_binary_heads),
        live_binary_heads=tuple(live_binary_heads),
        live_linear_heads=tuple(live_linear_heads),
        ruin_binary_heads=tuple(ruin_binary_heads),
        owner_summary_names=owner_summary_names,
        owner_summary_vector=owner_summary_vector,
        year_shock_summary_names=year_shock_summary_names,
        year_shock_summary_vector=year_shock_summary_vector,
        macro_summary_names=macro_summary_names,
        macro_summary_vector=macro_summary_vector,
    )


def _bundle_run_ids(bundle: ReplayMeasurementBundle) -> list[str]:
    for frame in (
        bundle.site_opportunities,
        bundle.live_settlement_transitions,
        bundle.ruin_transitions,
        bundle.owner_years,
        bundle.year_shocks,
        bundle.macro_trajectories,
    ):
        if frame.height > 0:
            return [
                str(value)
                for value in frame.get_column("replay_run_id").unique().to_list()
            ]
    return []


def _resample_frame_by_run_id(
    frame: pl.DataFrame,
    sampled_run_ids: list[str],
) -> pl.DataFrame:
    if frame.height == 0:
        return pl.DataFrame(schema=frame.schema)
    parts: list[pl.DataFrame] = []
    for draw_index, run_id in enumerate(sampled_run_ids):
        part = frame.filter(pl.col("replay_run_id") == run_id)
        if part.height == 0:
            continue
        parts.append(
            part.with_columns(
                pl.lit(f"{run_id}__bootstrap_{draw_index}").alias("replay_run_id")
            )
        )
    if not parts:
        return pl.DataFrame(schema=frame.schema)
    return pl.concat(parts, how="vertical_relaxed")


def _resample_bundle(
    bundle: ReplayMeasurementBundle,
    rng: np.random.Generator,
) -> ReplayMeasurementBundle:
    run_ids = _bundle_run_ids(bundle)
    if not run_ids:
        return bundle
    sampled_run_ids = list(rng.choice(run_ids, size=len(run_ids), replace=True))
    site_opportunities = _resample_frame_by_run_id(bundle.site_opportunities, sampled_run_ids)
    settlement_measurements = _resample_frame_by_run_id(
        bundle.settlement_measurements,
        sampled_run_ids,
    )
    live_settlement_transitions = _resample_frame_by_run_id(
        bundle.live_settlement_transitions,
        sampled_run_ids,
    )
    ruin_transitions = _resample_frame_by_run_id(bundle.ruin_transitions, sampled_run_ids)
    pairwise_candidates = _resample_frame_by_run_id(bundle.pairwise_candidates, sampled_run_ids)
    owner_years = _resample_frame_by_run_id(bundle.owner_years, sampled_run_ids)
    year_shocks = _resample_frame_by_run_id(bundle.year_shocks, sampled_run_ids)
    macro_trajectories = _resample_frame_by_run_id(bundle.macro_trajectories, sampled_run_ids)
    summary = bundle.summary.model_copy(
        update={
            "replay_run_count": len(sampled_run_ids),
            "site_opportunity_count": int(site_opportunities.height),
            "settlement_measurement_count": int(settlement_measurements.height),
            "live_settlement_transition_count": int(live_settlement_transitions.height),
            "ruin_transition_count": int(ruin_transitions.height),
            "pairwise_candidate_count": int(pairwise_candidates.height),
            "owner_year_count": int(owner_years.height),
            "year_shock_count": int(year_shocks.height),
            "macro_trajectory_count": int(macro_trajectories.height),
        }
    )
    return bundle.model_copy(
        update={
            "replay_run_count": len(sampled_run_ids),
            "site_opportunities": site_opportunities,
            "settlement_measurements": settlement_measurements,
            "live_settlement_transitions": live_settlement_transitions,
            "ruin_transitions": ruin_transitions,
            "pairwise_candidates": pairwise_candidates,
            "owner_years": owner_years,
            "year_shocks": year_shocks,
            "macro_trajectories": macro_trajectories,
            "summary": summary,
        }
    )


def estimate_round_behavioral_fingerprint(
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
    probe_library: BehavioralFingerprintProbeLibrary,
    *,
    ridge_alpha: float = 1.0,
    bootstrap_samples: int = 0,
    rng_seed: int = 0,
) -> RoundBehavioralFingerprintEstimate:
    fit = fit_round_behavioral_fingerprint(
        round_id=round_id,
        round_number=round_number,
        bundles=bundles,
        ridge_alpha=ridge_alpha,
    )
    names, vector = fit.probe_summary(probe_library)
    std = np.zeros_like(vector)
    if bootstrap_samples > 0:
        rng = np.random.default_rng(rng_seed)
        bootstrap_vectors: list[np.ndarray] = []
        for _ in range(bootstrap_samples):
            resampled = [_resample_bundle(bundle, rng) for bundle in bundles]
            bootstrap_fit = fit_round_behavioral_fingerprint(
                round_id=round_id,
                round_number=round_number,
                bundles=resampled,
                ridge_alpha=ridge_alpha,
            )
            bootstrap_names, bootstrap_vector = bootstrap_fit.probe_summary(probe_library)
            if bootstrap_names != names:
                raise ValueError("bootstrap probe summary names changed across resamples")
            bootstrap_vectors.append(bootstrap_vector)
        std = np.std(
            np.stack(bootstrap_vectors, axis=0),
            axis=0,
            ddof=1 if bootstrap_samples > 1 else 0,
        )
    return RoundBehavioralFingerprintEstimate(
        round_id=round_id,
        round_number=round_number,
        sample_count=fit.sample_count,
        bootstrap_samples=bootstrap_samples,
        summary_names=tuple(names),
        summary_vector=vector,
        summary_std=np.asarray(std, dtype=np.float64),
    )


__all__ = [
    "BehavioralBinaryHead",
    "BehavioralFingerprintProbeLibrary",
    "BehavioralLinearHead",
    "RoundBehavioralFingerprintEstimate",
    "RoundBehavioralFingerprintFit",
    "build_behavioral_fingerprint_probe_library",
    "estimate_round_behavioral_fingerprint",
    "fit_round_behavioral_fingerprint",
    "live_settlement_feature_matrix",
    "ruin_feature_matrix",
    "site_opportunity_feature_matrix",
]
