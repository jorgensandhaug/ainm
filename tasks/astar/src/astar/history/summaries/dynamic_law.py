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
RUIN_BINARY_TARGETS: tuple[tuple[str, str], ...] = (
    ("remain_ruin", "remain_ruin"),
    ("rebuild_settlement", "rebuild_settlement"),
    ("rebuild_port", "rebuild_port"),
    ("reclaim_forest", "reclaim_forest"),
    ("fade_empty", "fade_empty"),
)
OWNER_LINEAR_TARGETS: tuple[tuple[str, str], ...] = (
    ("settlement_delta", "settlement_delta"),
    ("port_delta", "port_delta"),
    ("population_delta", "population_delta"),
    ("food_delta", "food_delta"),
    ("wealth_delta", "wealth_delta"),
    ("defense_delta", "defense_delta"),
)
MACRO_LINEAR_TARGETS: tuple[tuple[str, str], ...] = (
    ("live_delta", "live_delta"),
    ("port_delta", "port_delta"),
    ("ruin_delta", "ruin_delta"),
    ("owner_delta", "owner_delta"),
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
YEAR_SHOCK_REQUIRED_COLUMNS: tuple[str, ...] = ("replay_run_id", *YEAR_SHOCK_COLUMNS)
MAX_PROBE_SETTLEMENT_ROWS = 25_000
MAX_PROBE_PAIRWISE_ROWS = 50_000
MAX_FIT_SETTLEMENT_ROWS = 25_000
MAX_FIT_PAIRWISE_ROWS = 50_000
SITE_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "prev_ruin",
    "buildable",
    "coast",
    "coast_distance_steps",
    "coast_distance_unreachable",
    "land_distance_to_settlement_steps",
    "land_distance_to_settlement_unreachable",
    "sea_distance_to_port_steps",
    "sea_distance_to_port_unreachable",
    "settlement_basin_gap_steps",
    "settlement_basin_gap_unreachable",
    "forest_density",
    "mountain_density",
    "settlement_proximity",
    "maritime_access",
    "frontier_score",
    "nearby_live_count",
    "nearby_same_owner_count",
    "nearby_other_owner_count",
    "nearby_port_count",
    "nearby_ruin_count",
    "site_ruin_created",
)
SETTLEMENT_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "prev_alive",
    "next_alive",
    "prev_has_port",
    "prev_owner_id",
    "next_owner_id",
    "prev_grid_code",
    "buildable",
    "coast",
    "coast_distance_steps",
    "coast_distance_unreachable",
    "land_distance_to_settlement_steps",
    "land_distance_to_settlement_unreachable",
    "sea_distance_to_port_steps",
    "sea_distance_to_port_unreachable",
    "settlement_basin_gap_steps",
    "settlement_basin_gap_unreachable",
    "forest_density",
    "mountain_density",
    "settlement_proximity",
    "maritime_access",
    "frontier_score",
    "nearby_live_count",
    "nearby_same_owner_count",
    "nearby_other_owner_count",
    "nearby_port_count",
    "nearby_ruin_count",
    "prev_population",
    "prev_food",
    "prev_wealth",
    "prev_defense",
    "birth",
    "rebuild",
    "collapse",
    "collapse_to_ruin",
    "port_gain",
    "port_loss",
    "owner_flip",
    "population_delta",
    "food_delta",
    "wealth_delta",
    "defense_delta",
)
PAIRWISE_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "same_owner",
    "src_has_port",
    "dst_has_port",
    "maritime_pair",
    "land_distance",
    "sea_distance",
    "src_population",
    "src_food",
    "src_wealth",
    "src_defense",
    "dst_population",
    "dst_food",
    "dst_wealth",
    "dst_defense",
    "dst_population_delta",
    "dst_food_delta",
    "dst_wealth_delta",
    "dst_defense_delta",
    "dst_owner_flip_next",
    "dst_collapse_next",
    "dst_port_gain_next",
)
RUIN_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "ruin_age",
    "coast",
    "coast_distance_steps",
    "coast_distance_unreachable",
    "forest_density",
    "mountain_density",
    "land_distance_to_settlement_steps",
    "land_distance_to_settlement_unreachable",
    "settlement_proximity",
    "sea_distance_to_port_steps",
    "sea_distance_to_port_unreachable",
    "maritime_access",
    "settlement_basin_gap_steps",
    "settlement_basin_gap_unreachable",
    "frontier_score",
    "nearby_live_count",
    "nearby_same_owner_count",
    "nearby_other_owner_count",
    "nearby_port_count",
    "nearby_ruin_count",
    "remain_ruin",
    "rebuild_settlement",
    "rebuild_port",
    "reclaim_forest",
    "fade_empty",
)
OWNER_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "settlement_count",
    "port_count",
    "coastal_settlement_count",
    "frontier_settlement_count",
    "total_population",
    "total_food",
    "total_wealth",
    "total_defense",
    "mean_frontier_score",
    "mean_maritime_access",
    "mean_settlement_proximity",
    "settlement_delta",
    "port_delta",
    "population_delta",
    "food_delta",
    "wealth_delta",
    "defense_delta",
)
MACRO_REQUIRED_COLUMNS: tuple[str, ...] = (
    "replay_run_id",
    "live_count",
    "port_count",
    "ruin_count",
    "built_cell_count",
    "owner_count",
    "total_population",
    "total_food",
    "total_wealth",
    "total_defense",
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


def _collapse_codes(codes: np.ndarray) -> np.ndarray:
    if codes.size == 0:
        return np.zeros((0,), dtype=np.int64)
    return collapse_internal_grid(codes.reshape(-1, 1)).reshape(-1)


def _positive_quantile(values: np.ndarray, quantile: float) -> float:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return 0.0
    return float(np.quantile(finite, quantile))


def site_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    prev_ruin = _frame_column(frame, "prev_ruin", dtype=bool)
    site_masks: dict[str, np.ndarray] = {
        "site_ruin_created": ~prev_ruin,
    }
    return {
        name: (
            site_masks[name],
            _frame_column(frame, column_name, dtype=np.float64)[site_masks[name]],
        )
        for name, column_name in SITE_BINARY_TARGETS
    }


def settlement_binary_target_data(
    frame: pl.DataFrame,
) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    prev_alive = _frame_column(frame, "prev_alive", dtype=bool)
    next_alive = _frame_column(frame, "next_alive", dtype=bool)
    prev_owner_known = _frame_column(
        frame,
        "prev_owner_id",
        dtype=np.int64,
        fill_null=-1,
    ) >= 0
    next_owner_known = _frame_column(
        frame,
        "next_owner_id",
        dtype=np.int64,
        fill_null=-1,
    ) >= 0
    prev_grid_code = _frame_column(frame, "prev_grid_code", dtype=np.int64)
    settlement_masks: dict[str, np.ndarray] = {
        "birth": (~prev_alive) & (prev_grid_code != 3),
        "rebuild": (~prev_alive) & (prev_grid_code == 3),
        "collapse": prev_alive,
        "collapse_to_ruin": prev_alive,
        "port_gain": prev_alive & next_alive,
        "port_loss": prev_alive & next_alive,
        "owner_flip": prev_alive & next_alive & prev_owner_known & next_owner_known,
    }
    return {
        name: (
            settlement_masks[mask_key],
            _frame_column(frame, column_name, dtype=np.float64)[settlement_masks[mask_key]],
        )
        for name, column_name, mask_key in SETTLEMENT_BINARY_TARGETS
    }


def settlement_linear_target_data(
    frame: pl.DataFrame,
) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    prev_alive = _frame_column(frame, "prev_alive", dtype=bool)
    next_alive = _frame_column(frame, "next_alive", dtype=bool)
    continuous_mask = prev_alive & next_alive
    return {
        name: (
            continuous_mask,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0)[continuous_mask],
        )
        for name, column_name in SETTLEMENT_LINEAR_TARGETS
    }


def pairwise_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64),
        )
        for name, column_name in PAIRWISE_BINARY_TARGETS
    }


def pairwise_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0),
        )
        for name, column_name in PAIRWISE_LINEAR_TARGETS
    }


def ruin_binary_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64),
        )
        for name, column_name in RUIN_BINARY_TARGETS
    }


def owner_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0),
        )
        for name, column_name in OWNER_LINEAR_TARGETS
    }


def macro_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0),
        )
        for name, column_name in MACRO_LINEAR_TARGETS
    }


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
    try:
        solution = np.linalg.solve(lhs, rhs)
    except np.linalg.LinAlgError:
        solution = np.linalg.pinv(lhs) @ rhs
    return float(solution[0]), np.asarray(solution[1:], dtype=np.float64)


def _fit_ridge_logistic(
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
    max_iter: int = 12,
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
        try:
            updated = np.linalg.solve(lhs, rhs)
        except np.linalg.LinAlgError:
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
        expected_width = len(self.feature_names)
        if matrix.ndim != 2:
            matrix = (
                matrix.reshape(matrix.shape[0], -1)
                if matrix.size
                else np.zeros((0, expected_width), dtype=np.float64)
            )
        if matrix.shape[1] != expected_width:
            if matrix.shape[0] == 0:
                matrix = np.zeros((0, expected_width), dtype=np.float64)
            else:
                raise ValueError(
                    "binary head "
                    f"{self.name} predict width mismatch: {matrix.shape[1]} != "
                    f"{expected_width}"
                )
        coefficients = np.asarray(self.coefficients, dtype=np.float64)
        if coefficients.shape[0] != expected_width:
            if coefficients.size == 0:
                coefficients = np.zeros((expected_width,), dtype=np.float64)
            else:
                raise ValueError(
                    "binary head "
                    f"{self.name} coefficient width mismatch: "
                    f"{coefficients.shape[0]} != {expected_width}"
                )
        return _sigmoid(self.intercept + (matrix @ coefficients))


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
        expected_width = len(self.feature_names)
        if matrix.ndim != 2:
            matrix = (
                matrix.reshape(matrix.shape[0], -1)
                if matrix.size
                else np.zeros((0, expected_width), dtype=np.float64)
            )
        if matrix.shape[1] != expected_width:
            if matrix.shape[0] == 0:
                matrix = np.zeros((0, expected_width), dtype=np.float64)
            else:
                raise ValueError(
                    "linear head "
                    f"{self.name} predict width mismatch: {matrix.shape[1]} != "
                    f"{expected_width}"
                )
        coefficients = np.asarray(self.coefficients, dtype=np.float64)
        if coefficients.shape[0] != expected_width:
            if coefficients.size == 0:
                coefficients = np.zeros((expected_width,), dtype=np.float64)
            else:
                raise ValueError(
                    "linear head "
                    f"{self.name} coefficient width mismatch: "
                    f"{coefficients.shape[0]} != {expected_width}"
                )
        return self.intercept + (matrix @ coefficients)


class DynamicLawProbeLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    site_feature_names: tuple[str, ...]
    settlement_feature_names: tuple[str, ...]
    pairwise_feature_names: tuple[str, ...]
    ruin_feature_names: tuple[str, ...]
    owner_feature_names: tuple[str, ...]
    macro_feature_names: tuple[str, ...]
    site_probe_names: tuple[str, ...]
    site_probe_matrix: np.ndarray
    settlement_probe_names: tuple[str, ...]
    settlement_probe_matrix: np.ndarray
    pairwise_probe_names: tuple[str, ...]
    pairwise_probe_matrix: np.ndarray
    ruin_probe_names: tuple[str, ...]
    ruin_probe_matrix: np.ndarray
    owner_probe_names: tuple[str, ...]
    owner_probe_matrix: np.ndarray
    macro_probe_names: tuple[str, ...]
    macro_probe_matrix: np.ndarray


class RoundDynamicLawFit(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    site_feature_names: tuple[str, ...]
    settlement_feature_names: tuple[str, ...]
    pairwise_feature_names: tuple[str, ...]
    ruin_feature_names: tuple[str, ...]
    owner_feature_names: tuple[str, ...]
    macro_feature_names: tuple[str, ...]
    site_binary_heads: tuple[FittedBinaryHead, ...]
    settlement_binary_heads: tuple[FittedBinaryHead, ...]
    settlement_linear_heads: tuple[FittedLinearHead, ...]
    pairwise_binary_heads: tuple[FittedBinaryHead, ...]
    pairwise_linear_heads: tuple[FittedLinearHead, ...]
    ruin_binary_heads: tuple[FittedBinaryHead, ...]
    owner_linear_heads: tuple[FittedLinearHead, ...]
    macro_linear_heads: tuple[FittedLinearHead, ...]
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
            ("ruin_binary", self.ruin_binary_heads),
            ("owner_linear", self.owner_linear_heads),
            ("macro_linear", self.macro_linear_heads),
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
        if tuple(self.ruin_feature_names) != tuple(probe_library.ruin_feature_names):
            raise ValueError("ruin probe library feature mismatch")
        if tuple(self.owner_feature_names) != tuple(probe_library.owner_feature_names):
            raise ValueError("owner probe library feature mismatch")
        if tuple(self.macro_feature_names) != tuple(probe_library.macro_feature_names):
            raise ValueError("macro probe library feature mismatch")

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
        for head in self.ruin_binary_heads:
            predictions = head.predict(probe_library.ruin_probe_matrix)
            for probe_name, value in zip(
                probe_library.ruin_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"ruin_binary::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.owner_linear_heads:
            predictions = head.predict(probe_library.owner_probe_matrix)
            for probe_name, value in zip(
                probe_library.owner_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"owner_linear::{head.name}::{probe_name}")
                values.append(float(value))
        for head in self.macro_linear_heads:
            predictions = head.predict(probe_library.macro_probe_matrix)
            for probe_name, value in zip(
                probe_library.macro_probe_names,
                predictions,
                strict=True,
            ):
                names.append(f"macro_linear::{head.name}::{probe_name}")
                values.append(float(value))

        for name, value in zip(self.year_shock_names, self.year_shock_vector, strict=True):
            names.append(f"year_shock::{name}")
            values.append(float(value))

        return names, np.asarray(values, dtype=np.float64)


def dynamic_law_probe_summary_names(probe_library: DynamicLawProbeLibrary) -> list[str]:
    names: list[str] = []
    for head_name, _column_name in SITE_BINARY_TARGETS:
        for probe_name in probe_library.site_probe_names:
            names.append(f"site_binary::{head_name}::{probe_name}")
    for head_name, _column_name, _mask_name in SETTLEMENT_BINARY_TARGETS:
        for probe_name in probe_library.settlement_probe_names:
            names.append(f"settlement_binary::{head_name}::{probe_name}")
    for head_name, _column_name in SETTLEMENT_LINEAR_TARGETS:
        for probe_name in probe_library.settlement_probe_names:
            names.append(f"settlement_linear::{head_name}::{probe_name}")
    for head_name, _column_name in PAIRWISE_BINARY_TARGETS:
        for probe_name in probe_library.pairwise_probe_names:
            names.append(f"pairwise_binary::{head_name}::{probe_name}")
    for head_name, _column_name in PAIRWISE_LINEAR_TARGETS:
        for probe_name in probe_library.pairwise_probe_names:
            names.append(f"pairwise_linear::{head_name}::{probe_name}")
    for head_name, _column_name in RUIN_BINARY_TARGETS:
        for probe_name in probe_library.ruin_probe_names:
            names.append(f"ruin_binary::{head_name}::{probe_name}")
    for head_name, _column_name in OWNER_LINEAR_TARGETS:
        for probe_name in probe_library.owner_probe_names:
            names.append(f"owner_linear::{head_name}::{probe_name}")
    for head_name, _column_name in MACRO_LINEAR_TARGETS:
        for probe_name in probe_library.macro_probe_names:
            names.append(f"macro_linear::{head_name}::{probe_name}")
    names.extend(f"year_shock::{name}" for name in YEAR_SHOCK_COLUMNS)
    return names


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
            np.log1p(_frame_column(frame, "ruin_age", dtype=np.float64, fill_null=0.0)),
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


def owner_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    settlement_count = _frame_column(frame, "settlement_count", dtype=np.float64, fill_null=0.0)
    port_count = _frame_column(frame, "port_count", dtype=np.float64, fill_null=0.0)
    coastal_count = _frame_column(
        frame,
        "coastal_settlement_count",
        dtype=np.float64,
        fill_null=0.0,
    )
    frontier_count = _frame_column(
        frame,
        "frontier_settlement_count",
        dtype=np.float64,
        fill_null=0.0,
    )
    safe_settlement_count = np.maximum(settlement_count, 1.0)
    feature_names = (
        "settlement_count_log1p",
        "port_count_log1p",
        "coastal_share",
        "frontier_share",
        "total_population_asinh",
        "total_food_asinh",
        "total_wealth_asinh",
        "total_defense_asinh",
        "mean_frontier_score",
        "mean_maritime_access",
        "mean_settlement_proximity",
    )
    matrix = np.stack(
        [
            np.log1p(settlement_count),
            np.log1p(port_count),
            coastal_count / safe_settlement_count,
            frontier_count / safe_settlement_count,
            np.arcsinh(_frame_column(frame, "total_population", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_food", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_wealth", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_defense", dtype=np.float64, fill_null=0.0)),
            _frame_column(frame, "mean_frontier_score", dtype=np.float64, fill_null=0.0),
            _frame_column(frame, "mean_maritime_access", dtype=np.float64, fill_null=0.0),
            _frame_column(frame, "mean_settlement_proximity", dtype=np.float64, fill_null=0.0),
        ],
        axis=1,
    ).astype(np.float64)
    return feature_names, matrix


def macro_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    feature_names = (
        "live_count_log1p",
        "port_count_log1p",
        "ruin_count_log1p",
        "built_cell_count_log1p",
        "owner_count_log1p",
        "total_population_asinh",
        "total_food_asinh",
        "total_wealth_asinh",
        "total_defense_asinh",
        "coastal_live_share",
        "frontier_live_share",
        "mean_frontier_score",
        "mean_maritime_access",
    )
    matrix = np.stack(
        [
            np.log1p(_frame_column(frame, "live_count", dtype=np.float64, fill_null=0.0)),
            np.log1p(_frame_column(frame, "port_count", dtype=np.float64, fill_null=0.0)),
            np.log1p(_frame_column(frame, "ruin_count", dtype=np.float64, fill_null=0.0)),
            np.log1p(_frame_column(frame, "built_cell_count", dtype=np.float64, fill_null=0.0)),
            np.log1p(_frame_column(frame, "owner_count", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_population", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_food", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_wealth", dtype=np.float64, fill_null=0.0)),
            np.arcsinh(_frame_column(frame, "total_defense", dtype=np.float64, fill_null=0.0)),
            _frame_column(frame, "coastal_live_share", dtype=np.float64, fill_null=0.0),
            _frame_column(frame, "frontier_live_share", dtype=np.float64, fill_null=0.0),
            _frame_column(frame, "mean_frontier_score", dtype=np.float64, fill_null=0.0),
            _frame_column(frame, "mean_maritime_access", dtype=np.float64, fill_null=0.0),
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
    ruin_frames: Iterable[pl.DataFrame] | None = None,
    owner_frames: Iterable[pl.DataFrame] | None = None,
    macro_frames: Iterable[pl.DataFrame] | None = None,
) -> DynamicLawProbeLibrary:
    ruin_iterable = ruin_frames or ()
    owner_iterable = owner_frames or ()
    macro_iterable = macro_frames or ()
    site_frame = _sample_frame(
        _concat_frames(site_frames),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=2,
    )
    settlement_frame = _sample_frame(
        _concat_frames(settlement_frames),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=0,
    )
    pairwise_frame = _sample_frame(
        _concat_frames(pairwise_frames),
        max_rows=MAX_PROBE_PAIRWISE_ROWS,
        seed=1,
    )
    ruin_frame = _sample_frame(
        _concat_frames(ruin_iterable),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=3,
    )
    owner_frame = _sample_frame(
        _concat_frames(owner_iterable),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=4,
    )
    macro_frame = _sample_frame(
        _concat_frames(macro_iterable),
        max_rows=MAX_PROBE_SETTLEMENT_ROWS,
        seed=5,
    )
    site_feature_names, site_matrix = site_feature_matrix(site_frame)
    settlement_feature_names, settlement_matrix = settlement_feature_matrix(settlement_frame)
    pairwise_feature_names, pairwise_matrix = pairwise_feature_matrix(pairwise_frame)
    ruin_feature_names, ruin_matrix = ruin_feature_matrix(ruin_frame)
    owner_feature_names, owner_matrix = owner_feature_matrix(owner_frame)
    macro_feature_names, macro_matrix = macro_feature_matrix(macro_frame)

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

    ruin_coast = _frame_column(ruin_frame, "coast", dtype=np.float64) > 0.5
    ruin_nearby_live = _frame_column(ruin_frame, "nearby_live_count", dtype=np.float64)
    ruin_maritime_access = _frame_column(ruin_frame, "maritime_access", dtype=np.float64)
    ruin_maritime_threshold = _positive_quantile(ruin_maritime_access, 0.67)
    ruin_probe_specs = (
        ("inland_ruin", ~ruin_coast),
        ("coastal_ruin", ruin_coast),
        ("supported_ruin", ruin_nearby_live > 0.0),
        ("isolated_ruin", ruin_nearby_live <= 0.0),
        ("maritime_ruin", ruin_maritime_access >= ruin_maritime_threshold),
    )
    ruin_probe_matrix = np.stack(
        [_representative_probe(ruin_matrix, mask) for _, mask in ruin_probe_specs],
        axis=0,
    ).astype(np.float64)

    owner_settlement_count = _frame_column(owner_frame, "settlement_count", dtype=np.float64)
    owner_port_count = _frame_column(owner_frame, "port_count", dtype=np.float64)
    owner_frontier_count = _frame_column(
        owner_frame,
        "frontier_settlement_count",
        dtype=np.float64,
    )
    owner_maritime = _frame_column(owner_frame, "mean_maritime_access", dtype=np.float64)
    owner_frontier = _frame_column(owner_frame, "mean_frontier_score", dtype=np.float64)
    owner_small_threshold = _positive_quantile(owner_settlement_count, 0.33)
    owner_large_threshold = _positive_quantile(owner_settlement_count, 0.67)
    owner_frontier_threshold = _positive_quantile(owner_frontier, 0.67)
    owner_maritime_threshold = _positive_quantile(owner_maritime, 0.67)
    owner_probe_specs = (
        ("small_owner", owner_settlement_count <= owner_small_threshold),
        ("large_owner", owner_settlement_count >= owner_large_threshold),
        (
            "frontier_owner",
            (owner_frontier_count > 0.0) & (owner_frontier >= owner_frontier_threshold),
        ),
        (
            "maritime_owner",
            (owner_port_count > 0.0) & (owner_maritime >= owner_maritime_threshold),
        ),
    )
    owner_probe_matrix = np.stack(
        [_representative_probe(owner_matrix, mask) for _, mask in owner_probe_specs],
        axis=0,
    ).astype(np.float64)

    macro_live_count = _frame_column(macro_frame, "live_count", dtype=np.float64)
    macro_ruin_count = _frame_column(macro_frame, "ruin_count", dtype=np.float64)
    macro_frontier_share = _frame_column(macro_frame, "frontier_live_share", dtype=np.float64)
    macro_maritime = _frame_column(macro_frame, "mean_maritime_access", dtype=np.float64)
    macro_live_threshold = _positive_quantile(macro_live_count, 0.33)
    macro_ruin_threshold = _positive_quantile(macro_ruin_count, 0.67)
    macro_frontier_threshold = _positive_quantile(macro_frontier_share, 0.67)
    macro_maritime_threshold = _positive_quantile(macro_maritime, 0.67)
    macro_probe_specs = (
        ("sparse_macro", macro_live_count <= macro_live_threshold),
        ("ruin_heavy_macro", macro_ruin_count >= macro_ruin_threshold),
        ("frontier_macro", macro_frontier_share >= macro_frontier_threshold),
        ("maritime_macro", macro_maritime >= macro_maritime_threshold),
    )
    macro_probe_matrix = np.stack(
        [_representative_probe(macro_matrix, mask) for _, mask in macro_probe_specs],
        axis=0,
    ).astype(np.float64)

    return DynamicLawProbeLibrary(
        site_feature_names=site_feature_names,
        settlement_feature_names=settlement_feature_names,
        pairwise_feature_names=pairwise_feature_names,
        ruin_feature_names=ruin_feature_names,
        owner_feature_names=owner_feature_names,
        macro_feature_names=macro_feature_names,
        site_probe_names=tuple(name for name, _ in site_probe_specs),
        site_probe_matrix=site_probe_matrix,
        settlement_probe_names=tuple(name for name, _ in settlement_probe_specs),
        settlement_probe_matrix=settlement_probe_matrix,
        pairwise_probe_names=tuple(name for name, _ in pairwise_probe_specs),
        pairwise_probe_matrix=pairwise_probe_matrix,
        ruin_probe_names=tuple(name for name, _ in ruin_probe_specs),
        ruin_probe_matrix=ruin_probe_matrix,
        owner_probe_names=tuple(name for name, _ in owner_probe_specs),
        owner_probe_matrix=owner_probe_matrix,
        macro_probe_names=tuple(name for name, _ in macro_probe_specs),
        macro_probe_matrix=macro_probe_matrix,
    )


def fit_binary_head_from_matrix(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> FittedBinaryHead:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    expected_width = len(feature_names)
    if matrix.ndim != 2:
        if matrix.size:
            matrix = matrix.reshape(matrix.shape[0], -1)
        else:
            matrix = np.zeros((0, expected_width), dtype=np.float64)
    if matrix.shape[1] != expected_width:
        if matrix.shape[0] == 0 and matrix.shape[1] == 0 and expected_width > 0:
            matrix = np.zeros((0, expected_width), dtype=np.float64)
        else:
            raise ValueError(
                f"binary head {name} feature width mismatch: {matrix.shape[1]} != {expected_width}"
            )
    intercept, coefficients = _fit_ridge_logistic(matrix, target, ridge_alpha=ridge_alpha)
    return FittedBinaryHead(
        name=name,
        feature_names=feature_names,
        intercept=intercept,
        coefficients=coefficients,
        sample_count=int(target.shape[0]),
        positive_rate=float(np.mean(target)) if target.size else 0.0,
    )


def fit_linear_head_from_matrix(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> FittedLinearHead:
    matrix = np.asarray(feature_matrix, dtype=np.float64)
    expected_width = len(feature_names)
    if matrix.ndim != 2:
        if matrix.size:
            matrix = matrix.reshape(matrix.shape[0], -1)
        else:
            matrix = np.zeros((0, expected_width), dtype=np.float64)
    if matrix.shape[1] != expected_width:
        if matrix.shape[0] == 0 and matrix.shape[1] == 0 and expected_width > 0:
            matrix = np.zeros((0, expected_width), dtype=np.float64)
        else:
            raise ValueError(
                f"linear head {name} feature width mismatch: {matrix.shape[1]} != {expected_width}"
            )
    intercept, coefficients = _fit_ridge_linear(matrix, target, ridge_alpha=ridge_alpha)
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
    ruin_frame = _concat_frames(bundle.ruin_transitions for bundle in bundles)
    owner_frame = _concat_frames(bundle.owner_years for bundle in bundles)
    macro_frame = _concat_frames(bundle.macro_trajectories for bundle in bundles)
    year_shock_frame = _concat_frames(bundle.year_shocks for bundle in bundles)
    total_sample_count = int(
        site_frame.height
        + settlement_frame.height
        + pairwise_frame.height
        + ruin_frame.height
        + owner_frame.height
        + macro_frame.height
        + year_shock_frame.height
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
    ruin_frame = _sample_frame(
        ruin_frame,
        max_rows=MAX_FIT_SETTLEMENT_ROWS,
        seed=19,
    )
    owner_frame = _sample_frame(
        owner_frame,
        max_rows=MAX_FIT_SETTLEMENT_ROWS,
        seed=23,
    )
    macro_frame = _sample_frame(
        macro_frame,
        max_rows=MAX_FIT_SETTLEMENT_ROWS,
        seed=29,
    )

    site_feature_names, site_matrix = site_feature_matrix(site_frame)
    settlement_feature_names, settlement_matrix = settlement_feature_matrix(settlement_frame)
    pairwise_feature_names, pairwise_matrix = pairwise_feature_matrix(pairwise_frame)
    ruin_feature_names, ruin_matrix = ruin_feature_matrix(ruin_frame)
    owner_feature_names, owner_matrix = owner_feature_matrix(owner_frame)
    macro_feature_names, macro_matrix = macro_feature_matrix(macro_frame)

    site_binary_heads: list[FittedBinaryHead] = []
    settlement_binary_heads: list[FittedBinaryHead] = []
    settlement_linear_heads: list[FittedLinearHead] = []
    pairwise_binary_heads: list[FittedBinaryHead] = []
    pairwise_linear_heads: list[FittedLinearHead] = []
    ruin_binary_heads: list[FittedBinaryHead] = []
    owner_linear_heads: list[FittedLinearHead] = []
    macro_linear_heads: list[FittedLinearHead] = []

    for name, (mask, target) in site_binary_target_data(site_frame).items():
        site_binary_heads.append(
            fit_binary_head_from_matrix(
                name,
                site_feature_names,
                site_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in settlement_binary_target_data(settlement_frame).items():
        settlement_binary_heads.append(
            fit_binary_head_from_matrix(
                name,
                settlement_feature_names,
                settlement_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in settlement_linear_target_data(settlement_frame).items():
        settlement_linear_heads.append(
            fit_linear_head_from_matrix(
                name,
                settlement_feature_names,
                settlement_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in pairwise_binary_target_data(pairwise_frame).items():
        pairwise_binary_heads.append(
            fit_binary_head_from_matrix(
                name,
                pairwise_feature_names,
                pairwise_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in pairwise_linear_target_data(pairwise_frame).items():
        pairwise_linear_heads.append(
            fit_linear_head_from_matrix(
                name,
                pairwise_feature_names,
                pairwise_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in ruin_binary_target_data(ruin_frame).items():
        ruin_binary_heads.append(
            fit_binary_head_from_matrix(
                name,
                ruin_feature_names,
                ruin_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in owner_linear_target_data(owner_frame).items():
        owner_linear_heads.append(
            fit_linear_head_from_matrix(
                name,
                owner_feature_names,
                owner_matrix[mask],
                target,
                ridge_alpha=ridge_alpha,
            )
        )

    for name, (mask, target) in macro_linear_target_data(macro_frame).items():
        macro_linear_heads.append(
            fit_linear_head_from_matrix(
                name,
                macro_feature_names,
                macro_matrix[mask],
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
        ruin_feature_names=ruin_feature_names,
        owner_feature_names=owner_feature_names,
        macro_feature_names=macro_feature_names,
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


__all__ = [
    "MACRO_LINEAR_TARGETS",
    "MACRO_REQUIRED_COLUMNS",
    "OWNER_LINEAR_TARGETS",
    "OWNER_REQUIRED_COLUMNS",
    "PAIRWISE_REQUIRED_COLUMNS",
    "RUIN_BINARY_TARGETS",
    "RUIN_REQUIRED_COLUMNS",
    "SETTLEMENT_REQUIRED_COLUMNS",
    "SITE_REQUIRED_COLUMNS",
    "YEAR_SHOCK_COLUMNS",
    "YEAR_SHOCK_REQUIRED_COLUMNS",
    "DynamicLawProbeLibrary",
    "FittedBinaryHead",
    "FittedLinearHead",
    "RoundDynamicLawFit",
    "build_dynamic_law_probe_library",
    "dynamic_law_probe_summary_names",
    "fit_binary_head_from_matrix",
    "fit_linear_head_from_matrix",
    "fit_round_dynamic_law_summary",
    "macro_feature_matrix",
    "macro_linear_target_data",
    "owner_feature_matrix",
    "owner_linear_target_data",
    "pairwise_binary_target_data",
    "pairwise_feature_matrix",
    "pairwise_linear_target_data",
    "ruin_binary_target_data",
    "ruin_feature_matrix",
    "settlement_binary_target_data",
    "settlement_feature_matrix",
    "settlement_linear_target_data",
    "site_binary_target_data",
    "site_feature_matrix",
]
