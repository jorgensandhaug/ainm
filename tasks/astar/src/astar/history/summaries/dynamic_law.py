from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.history.summaries.measurements import ReplayMeasurementBundle

SITE_BINARY_TARGETS: tuple[tuple[str, str], ...] = (
    ("site_ruin_created", "site_ruin_created"),
)
SETTLEMENT_BINARY_TARGETS: tuple[tuple[str, str, str], ...] = (
    ("birth", "birth", "birth"),
    ("rebuild", "rebuild", "rebuild"),
    ("collapse", "collapse", "collapse"),
    ("collapse_to_ruin", "collapse_to_ruin", "collapse_to_ruin"),
    ("port_gain", "port_gain", "port_gain"),
    ("port_loss", "port_loss", "port_loss"),
    ("owner_flip", "owner_flip", "owner_flip"),
)
SETTLEMENT_LINEAR_TARGETS: tuple[tuple[str, str], ...] = (
    ("population_delta", "population_delta"),
    ("food_delta", "food_delta"),
    ("wealth_delta", "wealth_delta"),
    ("defense_delta", "defense_delta"),
)
PAIRWISE_BINARY_TARGETS: tuple[tuple[str, str], ...] = (
    ("dst_owner_flip_next", "dst_owner_flip_next"),
    ("dst_collapse_next", "dst_collapse_next"),
    ("dst_port_gain_next", "dst_port_gain_next"),
)
PAIRWISE_LINEAR_TARGETS: tuple[tuple[str, str], ...] = (
    ("dst_population_delta", "dst_population_delta"),
    ("dst_food_delta", "dst_food_delta"),
    ("dst_wealth_delta", "dst_wealth_delta"),
    ("dst_defense_delta", "dst_defense_delta"),
)
YEAR_SHOCK_COLUMNS: tuple[str, ...] = (
    "live_count",
    "next_live_count",
    "birth_count",
    "rebuild_count",
    "collapse_count",
    "collapse_to_ruin_count",
    "site_ruin_created_count",
    "owner_flip_count",
    "port_gain_count",
    "port_loss_count",
    "changed_settlement_share",
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
MAX_PROBE_SETTLEMENT_ROWS = 50_000
MAX_PROBE_PAIRWISE_ROWS = 100_000
MAX_FIT_SETTLEMENT_ROWS = 50_000
MAX_FIT_PAIRWISE_ROWS = 100_000


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


def _collapse_codes(codes: np.ndarray) -> np.ndarray:
    if codes.size == 0:
        return np.zeros((0,), dtype=np.int64)
    return collapse_internal_grid(codes.reshape(-1, 1)).reshape(-1)


def _positive_quantile(values: np.ndarray, quantile: float) -> float:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return 0.0
    return float(np.quantile(finite, quantile))


def site_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
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


class FittedBinaryHead(BaseModel):
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


class FittedLinearHead(BaseModel):
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


class DynamicLawProbeLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    site_feature_names: tuple[str, ...]
    settlement_feature_names: tuple[str, ...]
    pairwise_feature_names: tuple[str, ...]
    site_probe_names: tuple[str, ...]
    site_probe_matrix: np.ndarray
    settlement_probe_names: tuple[str, ...]
    settlement_probe_matrix: np.ndarray
    pairwise_probe_names: tuple[str, ...]
    pairwise_probe_matrix: np.ndarray


class RoundDynamicLawFit(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    site_feature_names: tuple[str, ...]
    settlement_feature_names: tuple[str, ...]
    pairwise_feature_names: tuple[str, ...]
    site_binary_heads: tuple[FittedBinaryHead, ...]
    settlement_binary_heads: tuple[FittedBinaryHead, ...]
    settlement_linear_heads: tuple[FittedLinearHead, ...]
    pairwise_binary_heads: tuple[FittedBinaryHead, ...]
    pairwise_linear_heads: tuple[FittedLinearHead, ...]
    year_shock_names: tuple[str, ...]
    year_shock_vector: np.ndarray

    def coefficient_summary(self) -> tuple[list[str], np.ndarray]:
        names: list[str] = []
        values: list[float] = []
        for group_name, heads in (
            ("site_binary", self.site_binary_heads),
            ("settlement_binary", self.settlement_binary_heads),
            ("settlement_linear", self.settlement_linear_heads),
            ("pairwise_binary", self.pairwise_binary_heads),
            ("pairwise_linear", self.pairwise_linear_heads),
        ):
            for head in heads:
                names.append(f"{group_name}::{head.name}::intercept")
                values.append(head.intercept)
                for feature_name, coefficient in zip(
                    head.feature_names,
                    head.coefficients,
                    strict=True,
                ):
                    names.append(f"{group_name}::{head.name}::{feature_name}")
                    values.append(float(coefficient))
        for name, value in zip(self.year_shock_names, self.year_shock_vector, strict=True):
            names.append(f"year_shock::{name}")
            values.append(float(value))
        return names, np.asarray(values, dtype=np.float64)

    def probe_summary(self, probe_library: DynamicLawProbeLibrary) -> tuple[list[str], np.ndarray]:
        if tuple(self.site_feature_names) != tuple(probe_library.site_feature_names):
            raise ValueError("site probe library feature mismatch")
        if tuple(self.settlement_feature_names) != tuple(probe_library.settlement_feature_names):
            raise ValueError("settlement probe library feature mismatch")
        if tuple(self.pairwise_feature_names) != tuple(probe_library.pairwise_feature_names):
            raise ValueError("pairwise probe library feature mismatch")

        names: list[str] = []
        values: list[float] = []

        for head in self.site_binary_heads:
            predictions = head.predict(probe_library.site_probe_matrix)
            for probe_name, value in zip(
                probe_library.site_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"site_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.settlement_binary_heads:
            predictions = head.predict(probe_library.settlement_probe_matrix)
            for probe_name, value in zip(
                probe_library.settlement_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"settlement_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.settlement_linear_heads:
            predictions = head.predict(probe_library.settlement_probe_matrix)
            for probe_name, value in zip(
                probe_library.settlement_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"settlement_linear::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.pairwise_binary_heads:
            predictions = head.predict(probe_library.pairwise_probe_matrix)
            for probe_name, value in zip(
                probe_library.pairwise_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"pairwise_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.pairwise_linear_heads:
            predictions = head.predict(probe_library.pairwise_probe_matrix)
            for probe_name, value in zip(
                probe_library.pairwise_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"pairwise_linear::{head.name}::{probe_name}")
                values.append(float(value))

        for name, value in zip(self.year_shock_names, self.year_shock_vector, strict=True):
            names.append(f"year_shock::{name}")
            values.append(float(value))

        return names, np.asarray(values, dtype=np.float64)


def settlement_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    prev_alive = _frame_column(frame, "prev_alive", dtype=np.float64)
    prev_has_port = _frame_column(frame, "prev_has_port", dtype=np.float64)
    prev_owner_id = _frame_column(
        frame,
        "prev_owner_id",
        dtype=np.float64,
        fill_null=-1,
    )
    prev_owner_known = (prev_owner_id >= 0).astype(np.float64)
    prev_scored = _collapse_codes(_frame_column(frame, "prev_grid_code", dtype=np.int64))

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
        "prev_alive",
        "prev_has_port",
        "prev_owner_known",
        *tuple(f"prev_class_{class_index}" for class_index in range(CLASS_COUNT)),
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
        "prev_population_asinh",
        "prev_food_asinh",
        "prev_wealth_asinh",
        "prev_defense_asinh",
    )
    matrix = np.stack(
        [
            prev_alive,
            prev_has_port,
            prev_owner_known,
            *[
                (prev_scored == class_index).astype(np.float64)
                for class_index in range(CLASS_COUNT)
            ],
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
            np.arcsinh(_frame_column(frame, "prev_population", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_food", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_wealth", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "prev_defense", dtype=np.float64, fill_null=0.0)),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


def pairwise_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    land_distance = _frame_column(frame, "land_distance", dtype=np.float64)
    sea_distance = _frame_column(frame, "sea_distance", dtype=np.float64)
    feature_names = (
        "same_owner",
        "src_has_port",
        "dst_has_port",
        "maritime_pair",
        "land_distance_log1p",
        "land_distance_unreachable",
        "sea_distance_log1p",
        "sea_distance_unreachable",
        "src_population_asinh",
        "src_food_asinh",
        "src_wealth_asinh",
        "src_defense_asinh",
        "dst_population_asinh",
        "dst_food_asinh",
        "dst_wealth_asinh",
        "dst_defense_asinh",
    )
    matrix = np.stack(
        [
            _frame_column(frame, "same_owner", dtype=np.float64),
            _frame_column(frame, "src_has_port", dtype=np.float64),
            _frame_column(frame, "dst_has_port", dtype=np.float64),
            _frame_column(frame, "maritime_pair", dtype=np.float64),
            np.log1p(np.clip(land_distance, 0.0, None)),
            (land_distance < 0).astype(np.float64),
            np.log1p(np.clip(sea_distance, 0.0, None)),
            (sea_distance < 0).astype(np.float64),
            np.arcsinh(_frame_column(frame, "src_population", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "src_food", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "src_wealth", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "src_defense", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "dst_population", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "dst_food", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "dst_wealth", dtype=np.float64)),
            np.arcsinh(_frame_column(frame, "dst_defense", dtype=np.float64)),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


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


def build_dynamic_law_probe_library(
    site_frames: Iterable[pl.DataFrame],
    settlement_frames: Iterable[pl.DataFrame],
    pairwise_frames: Iterable[pl.DataFrame],
) -> DynamicLawProbeLibrary:
    site_frame = _sample_frame(
        pl.concat(list(site_frames), how="vertical_relaxed"),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=2,
    )
    settlement_frame = _sample_frame(
        pl.concat(list(settlement_frames), how="vertical_relaxed"),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=0,
    )
    pairwise_frame = _sample_frame(
        pl.concat(list(pairwise_frames), how="vertical_relaxed"),
        max_rows=MAX_PROBE_PAIRWISE_ROWS,
        seed=1,
    )
    site_feature_names, site_matrix = site_feature_matrix(site_frame)
    settlement_feature_names, settlement_matrix = settlement_feature_matrix(settlement_frame)
    pairwise_feature_names, pairwise_matrix = pairwise_feature_matrix(pairwise_frame)

    site_prev_ruin = _frame_column(site_frame, "prev_ruin", dtype=bool)
    site_buildable = _frame_column(site_frame, "buildable", dtype=np.float64) > 0.5
    site_coast = _frame_column(site_frame, "coast", dtype=np.float64) > 0.5
    site_frontier_score = _frame_column(site_frame, "frontier_score", dtype=np.float64)
    site_nearby_live = _frame_column(site_frame, "nearby_live_count", dtype=np.float64)
    site_frontier_threshold = _positive_quantile(site_frontier_score[~site_prev_ruin], 0.67)
    site_probe_specs = (
        ("empty_buildable", (~site_prev_ruin) & site_buildable),
        ("empty_coastal", (~site_prev_ruin) & site_buildable & site_coast),
        (
            "empty_frontier",
            (~site_prev_ruin)
            & site_buildable
            & (site_nearby_live > 0.0)
            & (site_frontier_score >= site_frontier_threshold),
        ),
        ("ruin_site", site_prev_ruin),
    )
    site_probe_matrix = np.stack(
        [_representative_probe(site_matrix, mask) for _, mask in site_probe_specs],
        axis=0,
    ).astype(np.float64)

    prev_alive = _frame_column(settlement_frame, "prev_alive", dtype=bool)
    prev_has_port = _frame_column(settlement_frame, "prev_has_port", dtype=bool)
    coast = _frame_column(settlement_frame, "coast", dtype=np.float64) > 0.5
    buildable = _frame_column(settlement_frame, "buildable", dtype=np.float64) > 0.5
    prev_grid_code = _frame_column(settlement_frame, "prev_grid_code", dtype=np.int64)
    frontier_score = _frame_column(settlement_frame, "frontier_score", dtype=np.float64)
    prev_food = _frame_column(settlement_frame, "prev_food", dtype=np.float64, fill_null=0.0)
    prev_defense = _frame_column(settlement_frame, "prev_defense", dtype=np.float64, fill_null=0.0)
    nearby_other_owner_count = _frame_column(
        settlement_frame,
        "nearby_other_owner_count",
        dtype=np.float64,
    )
    frontier_threshold = _positive_quantile(frontier_score[prev_alive], 0.67)
    food_threshold = _positive_quantile(prev_food[prev_alive], 0.33)
    defense_threshold = _positive_quantile(prev_defense[prev_alive], 0.33)
    settlement_probe_specs = (
        ("live_inland", prev_alive & ~coast),
        ("live_coastal", prev_alive & coast & ~prev_has_port),
        ("live_port", prev_alive & prev_has_port),
        (
            "frontier_weak",
            prev_alive
            & (frontier_score >= frontier_threshold)
            & (nearby_other_owner_count > 0.0)
            & (prev_food <= food_threshold)
            & (prev_defense <= defense_threshold),
        ),
        ("ruin_site", (~prev_alive) & (prev_grid_code == 3)),
        ("empty_buildable", (~prev_alive) & buildable & (prev_grid_code != 3)),
    )
    settlement_probe_matrix = np.stack(
        [
            _representative_probe(settlement_matrix, mask)
            for _, mask in settlement_probe_specs
        ],
        axis=0,
    ).astype(np.float64)

    same_owner = _frame_column(pairwise_frame, "same_owner", dtype=bool)
    maritime_pair = _frame_column(pairwise_frame, "maritime_pair", dtype=bool)
    land_distance = _frame_column(pairwise_frame, "land_distance", dtype=np.int64)
    pairwise_probe_specs = (
        ("land_rival", (~same_owner) & (land_distance >= 0)),
        ("land_same_owner", same_owner & (land_distance >= 0)),
        ("maritime_rival", (~same_owner) & maritime_pair),
        ("maritime_same_owner", same_owner & maritime_pair),
    )
    pairwise_probe_matrix = np.stack(
        [
            _representative_probe(pairwise_matrix, mask)
            for _, mask in pairwise_probe_specs
        ],
        axis=0,
    ).astype(np.float64)

    return DynamicLawProbeLibrary(
        site_feature_names=site_feature_names,
        settlement_feature_names=settlement_feature_names,
        pairwise_feature_names=pairwise_feature_names,
        site_probe_names=tuple(name for name, _ in site_probe_specs),
        site_probe_matrix=site_probe_matrix,
        settlement_probe_names=tuple(name for name, _ in settlement_probe_specs),
        settlement_probe_matrix=settlement_probe_matrix,
        pairwise_probe_names=tuple(name for name, _ in pairwise_probe_specs),
        pairwise_probe_matrix=pairwise_probe_matrix,
    )


def _fit_binary_head(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> FittedBinaryHead:
    intercept, coefficients = _fit_ridge_logistic(feature_matrix, target, ridge_alpha=ridge_alpha)
    return FittedBinaryHead(
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
) -> FittedLinearHead:
    intercept, coefficients = _fit_ridge_linear(feature_matrix, target, ridge_alpha=ridge_alpha)
    return FittedLinearHead(
        name=name,
        feature_names=feature_names,
        intercept=intercept,
        coefficients=coefficients,
        sample_count=int(target.shape[0]),
        target_mean=float(np.mean(target)) if target.size else 0.0,
    )


def _concat_frames(
    frames: Iterable[pl.DataFrame],
    schema: dict[str, pl.DataType] | None = None,
) -> pl.DataFrame:
    materialized = list(frames)
    if not materialized:
        return pl.DataFrame(schema=schema)
    return pl.concat(materialized, how="vertical_relaxed")


def _sample_frame(
    frame: pl.DataFrame,
    *,
    max_rows: int,
    seed: int,
) -> pl.DataFrame:
    if frame.height <= max_rows:
        return frame
    return frame.sample(
        n=max_rows,
        with_replacement=False,
        shuffle=True,
        seed=seed,
    )


def fit_round_dynamic_law_summary(
    round_id: str,
    round_number: int,
    bundles: list[ReplayMeasurementBundle],
    *,
    ridge_alpha: float = 1.0,
) -> RoundDynamicLawFit:
    if not bundles:
        raise ValueError("cannot fit round dynamic law without replay measurement bundles")

    site_frame = _concat_frames(bundle.site_opportunities for bundle in bundles)
    settlement_frame = _concat_frames(bundle.settlement_measurements for bundle in bundles)
    pairwise_frame = _concat_frames(bundle.pairwise_candidates for bundle in bundles)
    year_shock_frame = _concat_frames(bundle.year_shocks for bundle in bundles)
    total_sample_count = int(
        site_frame.height + settlement_frame.height + pairwise_frame.height + year_shock_frame.height
    )
    site_frame = _sample_frame(
        site_frame,
        max_rows=MAX_FIT_SETTLEMENT_ROWS,
        seed=7,
    )
    settlement_frame = _sample_frame(
        settlement_frame,
        max_rows=MAX_FIT_SETTLEMENT_ROWS,
        seed=11,
    )
    pairwise_frame = _sample_frame(
        pairwise_frame,
        max_rows=MAX_FIT_PAIRWISE_ROWS,
        seed=17,
    )

    site_feature_names, site_matrix = site_feature_matrix(site_frame)
    settlement_feature_names, settlement_matrix = settlement_feature_matrix(settlement_frame)
    pairwise_feature_names, pairwise_matrix = pairwise_feature_matrix(pairwise_frame)

    site_binary_heads: list[FittedBinaryHead] = []
    settlement_binary_heads: list[FittedBinaryHead] = []
    settlement_linear_heads: list[FittedLinearHead] = []
    pairwise_binary_heads: list[FittedBinaryHead] = []
    pairwise_linear_heads: list[FittedLinearHead] = []

    prev_ruin = _frame_column(site_frame, "prev_ruin", dtype=bool)
    site_masks: dict[str, np.ndarray] = {
        "site_ruin_created": ~prev_ruin,
    }
    for name, column_name in SITE_BINARY_TARGETS:
        mask = site_masks[name]
        target = _frame_column(site_frame, column_name, dtype=np.float64)[mask]
        site_binary_heads.append(
            _fit_binary_head(
                name,
                site_feature_names,
                site_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    prev_alive = _frame_column(settlement_frame, "prev_alive", dtype=bool)
    next_alive = _frame_column(settlement_frame, "next_alive", dtype=bool)
    prev_owner_known = _frame_column(
        settlement_frame,
        "prev_owner_id",
        dtype=np.int64,
        fill_null=-1,
    ) >= 0
    next_owner_known = _frame_column(
        settlement_frame,
        "next_owner_id",
        dtype=np.int64,
        fill_null=-1,
    ) >= 0
    prev_grid_code = _frame_column(settlement_frame, "prev_grid_code", dtype=np.int64)

    settlement_masks: dict[str, np.ndarray] = {
        "birth": (~prev_alive) & (prev_grid_code != 3),
        "rebuild": (~prev_alive) & (prev_grid_code == 3),
        "collapse": prev_alive,
        "collapse_to_ruin": prev_alive,
        "port_gain": prev_alive & next_alive,
        "port_loss": prev_alive & next_alive,
        "owner_flip": prev_alive & next_alive & prev_owner_known & next_owner_known,
    }
    for name, column_name, mask_key in SETTLEMENT_BINARY_TARGETS:
        mask = settlement_masks[mask_key]
        target = _frame_column(settlement_frame, column_name, dtype=np.float64)[mask]
        settlement_binary_heads.append(
            _fit_binary_head(
                name,
                settlement_feature_names,
                settlement_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    continuous_mask = prev_alive & next_alive
    for name, column_name in SETTLEMENT_LINEAR_TARGETS:
        target = _frame_column(settlement_frame, column_name, dtype=np.float64, fill_null=0.0)[
            continuous_mask
        ]
        settlement_linear_heads.append(
            _fit_linear_head(
                name,
                settlement_feature_names,
                settlement_matrix[continuous_mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, column_name in PAIRWISE_BINARY_TARGETS:
        target = _frame_column(pairwise_frame, column_name, dtype=np.float64)
        pairwise_binary_heads.append(
            _fit_binary_head(
                name,
                pairwise_feature_names,
                pairwise_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, column_name in PAIRWISE_LINEAR_TARGETS:
        target = _frame_column(pairwise_frame, column_name, dtype=np.float64, fill_null=0.0)
        pairwise_linear_heads.append(
            _fit_linear_head(
                name,
                pairwise_feature_names,
                pairwise_matrix,
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    year_shock_vector = np.asarray(
        [
            float(
                np.mean(
                    _frame_column(
                        year_shock_frame,
                        column_name,
                        dtype=np.float64,
                        fill_null=0.0,
                    )
                )
            )
            if year_shock_frame.height > 0
            else 0.0
            for column_name in YEAR_SHOCK_COLUMNS
        ],
        dtype=np.float64,
    )

    return RoundDynamicLawFit(
        round_id=round_id,
        round_number=round_number,
        sample_count=total_sample_count,
        site_feature_names=site_feature_names,
        settlement_feature_names=settlement_feature_names,
        pairwise_feature_names=pairwise_feature_names,
        site_binary_heads=tuple(site_binary_heads),
        settlement_binary_heads=tuple(settlement_binary_heads),
        settlement_linear_heads=tuple(settlement_linear_heads),
        pairwise_binary_heads=tuple(pairwise_binary_heads),
        pairwise_linear_heads=tuple(pairwise_linear_heads),
        year_shock_names=YEAR_SHOCK_COLUMNS,
        year_shock_vector=year_shock_vector,
    )


__all__ = [
    "YEAR_SHOCK_COLUMNS",
    "DynamicLawProbeLibrary",
    "FittedBinaryHead",
    "FittedLinearHead",
    "RoundDynamicLawFit",
    "build_dynamic_law_probe_library",
    "fit_round_dynamic_law_summary",
    "pairwise_feature_matrix",
    "site_feature_matrix",
    "settlement_feature_matrix",
]
