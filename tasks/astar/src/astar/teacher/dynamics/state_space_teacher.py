from __future__ import annotations

import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid, land_mask, sea_mask
from astar.core.trajectory import ReplayRun
from astar.core.world_state import InitialWorldState, SettlementFullState, WorldFrame
from astar.features.coasts import coast_mask
from astar.features.geometry import SeedFeatureBundle, compute_static_feature_dict
from astar.features.reachability import multi_source_distance
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.behavioral_fingerprint_core import (
    DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
)
from astar.history.summaries.dynamic_law import (
    PAIRWISE_REQUIRED_COLUMNS,
    RUIN_REQUIRED_COLUMNS,
    SETTLEMENT_REQUIRED_COLUMNS,
    SITE_REQUIRED_COLUMNS,
    pairwise_feature_matrix,
    ruin_feature_matrix,
    settlement_feature_matrix,
    site_feature_matrix,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    build_replay_measurement_bundle,
    load_replay_measurement_bundle_projected,
    materialize_round_replay_measurements,
)
from astar.infra.api.dto import InitialSettlement
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState
from astar.teacher.regime.replay_summary import (
    ReplaySummaryRegimeEncoder,
    ReplaySummaryRegimeEncoderCheckpoint,
)

SITE_HEAD_TARGETS: tuple[tuple[str, str], ...] = (
    ("birth", "birth"),
    ("rebuild", "rebuild"),
    ("site_ruin_created", "site_ruin_created"),
    ("rebuild_port", "rebuild_port"),
    ("ruin_to_forest", "ruin_to_forest"),
    ("ruin_to_empty", "ruin_to_empty"),
)
LIVE_SETTLEMENT_BINARY_TARGETS: tuple[tuple[str, str], ...] = (
    ("collapse", "collapse"),
    ("collapse_to_ruin", "collapse_to_ruin"),
    ("port_gain", "port_gain"),
    ("port_loss", "port_loss"),
    ("owner_flip", "owner_flip"),
)
LIVE_SETTLEMENT_LINEAR_TARGETS: tuple[tuple[str, str], ...] = (
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
INITIAL_MARK_TARGETS: tuple[tuple[str, str], ...] = (
    ("population", "prev_population"),
    ("food", "prev_food"),
    ("wealth", "prev_wealth"),
    ("defense", "prev_defense"),
)
_UNUSED_WORKSPACE_COLUMNS: tuple[str, ...] = ("round_id",)
_WORKSPACE_SITE_COLUMNS: tuple[str, ...] = tuple(
    dict.fromkeys(
        (
            "round_id",
            "step",
            *SITE_REQUIRED_COLUMNS,
            *(column_name for _name, column_name in SITE_HEAD_TARGETS),
        )
    )
)
_WORKSPACE_LIVE_COLUMNS: tuple[str, ...] = tuple(
    dict.fromkeys(("round_id", "step", *SETTLEMENT_REQUIRED_COLUMNS))
)
_WORKSPACE_PAIRWISE_COLUMNS: tuple[str, ...] = tuple(
    dict.fromkeys(("round_id", "step", *PAIRWISE_REQUIRED_COLUMNS))
)
_WORKSPACE_RUIN_COLUMNS: tuple[str, ...] = tuple(
    dict.fromkeys(("round_id", "step", *RUIN_REQUIRED_COLUMNS))
)
_WORKSPACE_INITIAL_SETTLEMENT_COLUMNS: tuple[str, ...] = (
    "round_id",
    "step",
    "prev_alive",
    "prev_has_port",
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
)


def _sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(np.asarray(values, dtype=np.float64), -30.0, 30.0)
    return np.asarray(1.0 / (1.0 + np.exp(-clipped)), dtype=np.float64)


def _sample_frame(frame: pl.DataFrame, *, max_rows: int, seed: int) -> pl.DataFrame:
    if max_rows <= 0 or frame.height <= max_rows:
        return frame
    return frame.sample(
        n=max_rows,
        with_replacement=False,
        shuffle=True,
        seed=seed,
    )


def _frame_column(
    frame: pl.DataFrame,
    name: str,
    *,
    fill_null: float | int | bool | None = None,
    dtype: np.dtype | type = np.float64,
) -> np.ndarray:
    if frame.height == 0:
        return np.zeros((0,), dtype=dtype)
    series = frame.get_column(name)
    if fill_null is not None:
        series = series.fill_null(fill_null)
    return np.asarray(series.to_numpy(), dtype=dtype)


def _time_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    step = _frame_column(frame, "step", dtype=np.float64)
    if step.size == 0:
        names = (
            "year_frac",
            "remaining_year_frac",
            "year_frac_sq",
            "early_year",
            "mid_year",
            "late_year",
            "endgame_year",
        )
        return names, np.zeros((0, len(names)), dtype=np.float64)
    year_frac = np.clip(step / 49.0, 0.0, 1.0)
    remaining = 1.0 - year_frac
    names = (
        "year_frac",
        "remaining_year_frac",
        "year_frac_sq",
        "early_year",
        "mid_year",
        "late_year",
        "endgame_year",
    )
    matrix = np.stack(
        [
            year_frac,
            remaining,
            year_frac**2,
            (year_frac <= 0.25).astype(np.float64),
            ((year_frac > 0.25) & (year_frac <= 0.65)).astype(np.float64),
            (year_frac > 0.65).astype(np.float64),
            (year_frac >= 0.90).astype(np.float64),
        ],
        axis=1,
    ).astype(np.float64)
    return names, matrix


def _append_time_features(
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    frame: pl.DataFrame,
) -> tuple[tuple[str, ...], np.ndarray]:
    time_names, time_matrix = _time_feature_matrix(frame)
    if feature_matrix.shape[0] == 0:
        return (*feature_names, *time_names), np.zeros(
            (0, len(feature_names) + len(time_names)),
            dtype=np.float64,
        )
    return (
        (*feature_names, *time_names),
        np.concatenate([feature_matrix, time_matrix], axis=1).astype(np.float64),
    )


def _latent_design_matrix(feature_matrix: np.ndarray, regimes: np.ndarray) -> np.ndarray:
    features = np.asarray(feature_matrix, dtype=np.float64)
    regime_matrix = np.asarray(regimes, dtype=np.float64)
    if features.ndim != 2:
        raise ValueError(f"expected 2D feature matrix, got shape {features.shape!r}")
    if regime_matrix.ndim != 2:
        raise ValueError(f"expected 2D regime matrix, got shape {regime_matrix.shape!r}")
    if features.shape[0] != regime_matrix.shape[0]:
        raise ValueError(
            f"feature/regime row mismatch: {features.shape[0]} != {regime_matrix.shape[0]}"
        )
    if features.shape[0] == 0:
        return np.zeros(
            (
                0,
                1
                + features.shape[1]
                + regime_matrix.shape[1]
                + (features.shape[1] * regime_matrix.shape[1]),
            ),
            dtype=np.float64,
        )
    interaction = (features[:, :, None] * regime_matrix[:, None, :]).reshape(features.shape[0], -1)
    return np.concatenate(
        [
            np.ones((features.shape[0], 1), dtype=np.float64),
            features,
            regime_matrix,
            interaction,
        ],
        axis=1,
    ).astype(np.float64)


def _fit_ridge_linear(
    design: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> np.ndarray:
    if design.shape[0] == 0:
        return np.zeros((design.shape[1],), dtype=np.float64)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ np.asarray(target, dtype=np.float64)
    try:
        return np.asarray(np.linalg.solve(lhs, rhs), dtype=np.float64)
    except np.linalg.LinAlgError:
        return np.asarray(np.linalg.pinv(lhs) @ rhs, dtype=np.float64)


def _fit_ridge_logistic(
    design: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
    max_iter: int = 12,
    tol: float = 1e-6,
) -> np.ndarray:
    if design.shape[0] == 0:
        return np.zeros((design.shape[1],), dtype=np.float64)
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    beta = np.zeros((design.shape[1],), dtype=np.float64)
    mean_target = float(np.mean(target)) if target.size else 0.5
    clipped_mean = float(np.clip(mean_target, 1e-4, 1.0 - 1e-4))
    beta[0] = float(np.log(clipped_mean / (1.0 - clipped_mean)))
    for _ in range(max_iter):
        logits = design @ beta
        probs = _sigmoid(logits)
        weights = np.maximum(probs * (1.0 - probs), 1e-4)
        working = logits + (target - probs) / weights
        lhs = design.T @ (design * weights[:, None]) + ridge_alpha * penalty
        rhs = design.T @ (weights * working)
        try:
            updated = np.asarray(np.linalg.solve(lhs, rhs), dtype=np.float64)
        except np.linalg.LinAlgError:
            updated = np.asarray(np.linalg.pinv(lhs) @ rhs, dtype=np.float64)
        if float(np.max(np.abs(updated - beta))) <= tol:
            beta = updated
            break
        beta = updated
    return beta


def _split_modulated_coefficients(
    coefficients: np.ndarray,
    *,
    feature_dim: int,
    regime_dim: int,
) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    offset = 0
    intercept = float(coefficients[offset])
    offset += 1
    feature_coefficients = np.asarray(
        coefficients[offset : offset + feature_dim],
        dtype=np.float64,
    )
    offset += feature_dim
    regime_coefficients = np.asarray(
        coefficients[offset : offset + regime_dim],
        dtype=np.float64,
    )
    offset += regime_dim
    interaction_coefficients = np.asarray(
        coefficients[offset:],
        dtype=np.float64,
    ).reshape(feature_dim, regime_dim)
    return (
        intercept,
        feature_coefficients,
        regime_coefficients,
        interaction_coefficients,
    )


def _feature_score(
    feature_matrix: np.ndarray,
    regime: np.ndarray,
    *,
    intercept: float,
    feature_coefficients: np.ndarray,
    regime_coefficients: np.ndarray,
    interaction_coefficients: np.ndarray,
) -> np.ndarray:
    features = np.asarray(feature_matrix, dtype=np.float64)
    regime_vector = np.asarray(regime, dtype=np.float64)
    if features.ndim != 2:
        raise ValueError(f"expected 2D feature matrix, got shape {features.shape!r}")
    if regime_vector.ndim != 1:
        raise ValueError(f"expected 1D regime vector, got shape {regime_vector.shape!r}")
    score = (
        intercept + (features @ feature_coefficients) + float(regime_vector @ regime_coefficients)
    )
    score += np.sum((features @ interaction_coefficients) * regime_vector[None, :], axis=1)
    return np.asarray(score, dtype=np.float64)


class LatentModulatedBinaryHead(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    feature_names: tuple[str, ...]
    regime_dim: int = Field(ge=1)
    intercept: float
    feature_coefficients: np.ndarray
    regime_coefficients: np.ndarray
    interaction_coefficients: np.ndarray
    sample_count: int = Field(ge=0)
    positive_rate: float = Field(ge=0.0)

    def predict(self, feature_matrix: np.ndarray, regime: np.ndarray) -> np.ndarray:
        return _sigmoid(
            _feature_score(
                feature_matrix,
                regime,
                intercept=self.intercept,
                feature_coefficients=np.asarray(self.feature_coefficients, dtype=np.float64),
                regime_coefficients=np.asarray(self.regime_coefficients, dtype=np.float64),
                interaction_coefficients=np.asarray(
                    self.interaction_coefficients,
                    dtype=np.float64,
                ),
            ),
        )


class LatentModulatedLinearHead(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str
    feature_names: tuple[str, ...]
    regime_dim: int = Field(ge=1)
    intercept: float
    feature_coefficients: np.ndarray
    regime_coefficients: np.ndarray
    interaction_coefficients: np.ndarray
    sample_count: int = Field(ge=0)
    target_mean: float
    residual_std: float = Field(ge=0.0)

    def predict(self, feature_matrix: np.ndarray, regime: np.ndarray) -> np.ndarray:
        return _feature_score(
            feature_matrix,
            regime,
            intercept=self.intercept,
            feature_coefficients=np.asarray(self.feature_coefficients, dtype=np.float64),
            regime_coefficients=np.asarray(self.regime_coefficients, dtype=np.float64),
            interaction_coefficients=np.asarray(
                self.interaction_coefficients,
                dtype=np.float64,
            ),
        )


class LatentModulatedBinaryHeadCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    feature_names: list[str]
    regime_dim: int = Field(ge=1)
    intercept: float
    feature_coefficients: list[float]
    regime_coefficients: list[float]
    interaction_coefficients: list[list[float]]
    sample_count: int = Field(ge=0)
    positive_rate: float = Field(ge=0.0)


class LatentModulatedLinearHeadCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    feature_names: list[str]
    regime_dim: int = Field(ge=1)
    intercept: float
    feature_coefficients: list[float]
    regime_coefficients: list[float]
    interaction_coefficients: list[list[float]]
    sample_count: int = Field(ge=0)
    target_mean: float
    residual_std: float = Field(ge=0.0)


def _binary_head_checkpoint(head: LatentModulatedBinaryHead) -> LatentModulatedBinaryHeadCheckpoint:
    return LatentModulatedBinaryHeadCheckpoint(
        name=head.name,
        feature_names=list(head.feature_names),
        regime_dim=head.regime_dim,
        intercept=head.intercept,
        feature_coefficients=np.asarray(head.feature_coefficients, dtype=np.float64).tolist(),
        regime_coefficients=np.asarray(head.regime_coefficients, dtype=np.float64).tolist(),
        interaction_coefficients=np.asarray(
            head.interaction_coefficients,
            dtype=np.float64,
        ).tolist(),
        sample_count=head.sample_count,
        positive_rate=head.positive_rate,
    )


def _linear_head_checkpoint(head: LatentModulatedLinearHead) -> LatentModulatedLinearHeadCheckpoint:
    return LatentModulatedLinearHeadCheckpoint(
        name=head.name,
        feature_names=list(head.feature_names),
        regime_dim=head.regime_dim,
        intercept=head.intercept,
        feature_coefficients=np.asarray(head.feature_coefficients, dtype=np.float64).tolist(),
        regime_coefficients=np.asarray(head.regime_coefficients, dtype=np.float64).tolist(),
        interaction_coefficients=np.asarray(
            head.interaction_coefficients,
            dtype=np.float64,
        ).tolist(),
        sample_count=head.sample_count,
        target_mean=head.target_mean,
        residual_std=head.residual_std,
    )


def _restore_binary_head(
    checkpoint: LatentModulatedBinaryHeadCheckpoint,
) -> LatentModulatedBinaryHead:
    return LatentModulatedBinaryHead(
        name=checkpoint.name,
        feature_names=tuple(checkpoint.feature_names),
        regime_dim=checkpoint.regime_dim,
        intercept=checkpoint.intercept,
        feature_coefficients=np.asarray(checkpoint.feature_coefficients, dtype=np.float64),
        regime_coefficients=np.asarray(checkpoint.regime_coefficients, dtype=np.float64),
        interaction_coefficients=np.asarray(
            checkpoint.interaction_coefficients,
            dtype=np.float64,
        ),
        sample_count=checkpoint.sample_count,
        positive_rate=checkpoint.positive_rate,
    )


def _restore_linear_head(
    checkpoint: LatentModulatedLinearHeadCheckpoint,
) -> LatentModulatedLinearHead:
    return LatentModulatedLinearHead(
        name=checkpoint.name,
        feature_names=tuple(checkpoint.feature_names),
        regime_dim=checkpoint.regime_dim,
        intercept=checkpoint.intercept,
        feature_coefficients=np.asarray(checkpoint.feature_coefficients, dtype=np.float64),
        regime_coefficients=np.asarray(checkpoint.regime_coefficients, dtype=np.float64),
        interaction_coefficients=np.asarray(
            checkpoint.interaction_coefficients,
            dtype=np.float64,
        ),
        sample_count=checkpoint.sample_count,
        target_mean=checkpoint.target_mean,
        residual_std=checkpoint.residual_std,
    )


class StateSpaceTeacherCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    summary_backend: Literal["dynamic_law", "behavioral_fingerprint_core"] = (
        "behavioral_fingerprint_core"
    )
    behavioral_fingerprint_summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE
    regime_max_rank: int = Field(default=4, ge=1)
    ridge_alpha: float = Field(default=1.0, gt=0.0)
    fit_workers: int = Field(default=1, ge=1)
    max_site_rows: int = Field(default=120_000, ge=1)
    max_live_rows: int = Field(default=120_000, ge=1)
    max_pairwise_rows: int = Field(default=180_000, ge=1)
    max_ruin_rows: int = Field(default=120_000, ge=1)
    max_initial_rows: int = Field(default=80_000, ge=1)
    rollout_noise_scale: float = Field(default=0.5, ge=0.0)
    regime_dim: int = Field(default=0, ge=0)
    regime_encoder_name: str | None = None
    regime_encoder_checkpoint: ReplaySummaryRegimeEncoderCheckpoint | None = None
    seed_rollout_horizon_by_seed_index: dict[int, int] = Field(default_factory=dict)
    site_feature_names: list[str] = Field(default_factory=list)
    live_feature_names: list[str] = Field(default_factory=list)
    pairwise_feature_names: list[str] = Field(default_factory=list)
    ruin_feature_names: list[str] = Field(default_factory=list)
    initial_mark_feature_names: list[str] = Field(default_factory=list)
    site_heads: list[LatentModulatedBinaryHeadCheckpoint] = Field(default_factory=list)
    live_binary_heads: list[LatentModulatedBinaryHeadCheckpoint] = Field(default_factory=list)
    live_linear_heads: list[LatentModulatedLinearHeadCheckpoint] = Field(default_factory=list)
    pairwise_binary_heads: list[LatentModulatedBinaryHeadCheckpoint] = Field(default_factory=list)
    pairwise_linear_heads: list[LatentModulatedLinearHeadCheckpoint] = Field(default_factory=list)
    ruin_heads: list[LatentModulatedBinaryHeadCheckpoint] = Field(default_factory=list)
    initial_mark_heads: list[LatentModulatedLinearHeadCheckpoint] = Field(default_factory=list)


@dataclass(slots=True)
class _SettlementState:
    settlement_id: str
    x: int
    y: int
    population: float
    food: float
    wealth: float
    defense: float
    has_port: bool
    owner_id: int | None
    alive: bool = True

    def to_full_state(self) -> SettlementFullState:
        return SettlementFullState(
            settlement_id=self.settlement_id,
            x=self.x,
            y=self.y,
            population=float(self.population),
            food=float(self.food),
            wealth=float(self.wealth),
            defense=float(self.defense),
            has_port=bool(self.has_port),
            owner_id=self.owner_id,
            alive=bool(self.alive),
        )


def _seed_feature_bundle(initial_state: InitialWorldState, *, seed_index: int) -> SeedFeatureBundle:
    grid = np.asarray(initial_state.grid, dtype=np.int64)
    settlements = [
        InitialSettlement(
            x=item.x,
            y=item.y,
            has_port=item.has_port,
            alive=item.alive,
        )
        for item in initial_state.settlements
    ]
    return SeedFeatureBundle(
        round_id="unknown",
        seed_index=seed_index,
        height=grid.shape[0],
        width=grid.shape[1],
        features=compute_static_feature_dict(grid, settlements),
    )


def _episode_measurement_bundles(episode: RoundEpisode) -> list[ReplayMeasurementBundle]:
    bundles: list[ReplayMeasurementBundle] = []
    for seed in episode.seeds:
        if not seed.replay_runs:
            continue
        bundles.append(
            build_replay_measurement_bundle(
                np.asarray(seed.initial_state.grid, dtype=np.int64),
                _seed_feature_bundle(seed.initial_state, seed_index=seed.seed_index),
                list(seed.replay_runs),
            ),
        )
    return bundles


@dataclass(frozen=True, slots=True)
class _MeasurementRound:
    round_id: str
    round_number: int
    bundles: tuple[ReplayMeasurementBundle, ...]


def _workspace_replay_seed_indexes(
    paths: WorkspacePaths,
    round_id: str,
    *,
    seed_count: int,
) -> list[int]:
    replay_seed_indexes: list[int] = []
    for seed_index in range(seed_count):
        if paths.replay_site_transition_path(round_id, seed_index).exists():
            replay_seed_indexes.append(seed_index)
            continue
        if paths.replay_summary_path(round_id, seed_index).exists():
            replay_seed_indexes.append(seed_index)
            continue
        replay_dir = paths.raw_replay_dir(round_id, seed_index)
        if replay_dir.exists() and any(replay_dir.glob("*.json")):
            replay_seed_indexes.append(seed_index)
    return replay_seed_indexes


def _load_projected_state_space_bundle(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> ReplayMeasurementBundle | None:
    return load_replay_measurement_bundle_projected(
        paths,
        round_id,
        seed_index,
        site_opportunity_columns=_WORKSPACE_SITE_COLUMNS,
        settlement_measurement_columns=_WORKSPACE_INITIAL_SETTLEMENT_COLUMNS,
        live_settlement_transition_columns=_WORKSPACE_LIVE_COLUMNS,
        pairwise_candidate_columns=_WORKSPACE_PAIRWISE_COLUMNS,
        ruin_transition_columns=_WORKSPACE_RUIN_COLUMNS,
        owner_year_columns=_UNUSED_WORKSPACE_COLUMNS,
        year_shock_columns=_UNUSED_WORKSPACE_COLUMNS,
        macro_trajectory_columns=_UNUSED_WORKSPACE_COLUMNS,
        owner_year_max_rows=1,
        year_shock_max_rows=1,
        macro_trajectory_max_rows=1,
    )


def _load_or_build_round_state_space_measurement_bundles(
    paths: WorkspacePaths,
    round_id: str,
) -> tuple[int, list[ReplayMeasurementBundle]]:
    round_record = read_round_record(paths, round_id)
    replay_seed_indexes = _workspace_replay_seed_indexes(
        paths,
        round_id,
        seed_count=round_record.round.seeds_count,
    )
    if not replay_seed_indexes:
        return round_record.round.round_number, []

    bundles = [
        bundle
        for seed_index in replay_seed_indexes
        if (bundle := _load_projected_state_space_bundle(paths, round_id, seed_index)) is not None
    ]
    if len(bundles) == len(replay_seed_indexes):
        return round_record.round.round_number, sorted(bundles, key=lambda item: item.seed_index)

    materialize_round_replay_measurements(paths, round_id)
    bundles = [
        bundle
        for seed_index in replay_seed_indexes
        if (bundle := _load_projected_state_space_bundle(paths, round_id, seed_index)) is not None
    ]
    return round_record.round.round_number, sorted(bundles, key=lambda item: item.seed_index)


def _seed_rollout_horizon_by_seed_index(
    measurement_rounds: list[_MeasurementRound],
) -> dict[int, int]:
    seed_rollout_horizon_by_seed_index: dict[int, int] = {}
    for measurement_round in measurement_rounds:
        for bundle in measurement_round.bundles:
            horizon = int(bundle.site_transition_counts_by_step.shape[0]) + 1
            existing_horizon = seed_rollout_horizon_by_seed_index.get(bundle.seed_index)
            if existing_horizon is None or horizon > existing_horizon:
                seed_rollout_horizon_by_seed_index[bundle.seed_index] = horizon
    return seed_rollout_horizon_by_seed_index


def _build_local_context_maps_for_rollout(
    previous_frame_grid: np.ndarray,
    previous_alive_settlements: list[SettlementFullState],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[int, np.ndarray]]:
    height, width = previous_frame_grid.shape
    nearby_live_counts = np.zeros((height, width), dtype=np.int16)
    nearby_port_counts = np.zeros((height, width), dtype=np.int16)
    nearby_ruin_counts = np.zeros((height, width), dtype=np.int16)
    nearby_same_owner_counts: dict[int, np.ndarray] = {}

    for settlement in previous_alive_settlements:
        y0 = max(0, settlement.y - 1)
        y1 = min(height, settlement.y + 2)
        x0 = max(0, settlement.x - 1)
        x1 = min(width, settlement.x + 2)
        nearby_live_counts[y0:y1, x0:x1] += 1
        if settlement.has_port:
            nearby_port_counts[y0:y1, x0:x1] += 1
        if settlement.owner_id is not None:
            owner_counts = nearby_same_owner_counts.setdefault(
                settlement.owner_id,
                np.zeros((height, width), dtype=np.int16),
            )
            owner_counts[y0:y1, x0:x1] += 1

    for y, x in np.argwhere(previous_frame_grid == 3):
        y0 = max(0, y - 1)
        y1 = min(height, y + 2)
        x0 = max(0, x - 1)
        x1 = min(width, x + 2)
        nearby_ruin_counts[y0:y1, x0:x1] += 1

    return (
        nearby_live_counts,
        nearby_port_counts,
        nearby_ruin_counts,
        nearby_same_owner_counts,
    )


def _local_context_for_rollout(
    nearby_live_counts: np.ndarray,
    nearby_port_counts: np.ndarray,
    nearby_ruin_counts: np.ndarray,
    nearby_same_owner_counts: dict[int, np.ndarray],
    *,
    x: int,
    y: int,
    owner_id: int | None,
    exclude_self: bool,
    self_has_port: bool,
) -> tuple[int, int, int, int, int]:
    nearby_live_count = int(nearby_live_counts[y, x])
    nearby_port_count = int(nearby_port_counts[y, x])
    nearby_same_owner_count = (
        int(nearby_same_owner_counts[owner_id][y, x])
        if owner_id is not None and owner_id in nearby_same_owner_counts
        else 0
    )
    if exclude_self:
        nearby_live_count -= 1
        if self_has_port:
            nearby_port_count -= 1
        if owner_id is not None:
            nearby_same_owner_count -= 1
    nearby_other_owner_count = max(0, nearby_live_count - nearby_same_owner_count)
    nearby_ruin_count = int(nearby_ruin_counts[y, x])
    return (
        nearby_live_count,
        nearby_same_owner_count,
        nearby_other_owner_count,
        nearby_port_count,
        nearby_ruin_count,
    )


def _select_pairwise_targets_for_rollout(
    previous_alive_settlements: list[SettlementFullState],
    distance_cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]],
    *,
    source: SettlementFullState,
) -> list[tuple[int, SettlementFullState, int, int]]:
    max_land_neighbors = 2
    max_sea_neighbors = 2
    candidates: list[tuple[SettlementFullState, int, int]] = []
    land_distances, sea_distances = distance_cache[(source.y, source.x)]
    for destination in previous_alive_settlements:
        if destination.x == source.x and destination.y == source.y:
            continue
        land_distance = int(land_distances[destination.y, destination.x])
        sea_distance = int(sea_distances[destination.y, destination.x])
        if land_distance < 0 and sea_distance < 0:
            continue
        candidates.append((destination, land_distance, sea_distance))

    land_ranked = sorted(
        [item for item in candidates if item[1] >= 0],
        key=lambda item: (item[1], item[0].y, item[0].x),
    )[:max_land_neighbors]
    sea_ranked = sorted(
        [item for item in candidates if item[2] >= 0],
        key=lambda item: (item[2], item[0].y, item[0].x),
    )[:max_sea_neighbors]

    selected: dict[tuple[int, int], tuple[SettlementFullState, int, int]] = {}
    for destination, land_distance, sea_distance in (*land_ranked, *sea_ranked):
        selected[(destination.y, destination.x)] = (destination, land_distance, sea_distance)

    ordered = sorted(
        selected.values(),
        key=lambda item: (
            min(value for value in (item[1], item[2]) if value >= 0),
            item[0].y,
            item[0].x,
        ),
    )
    return [
        (rank, destination, land_distance, sea_distance)
        for rank, (destination, land_distance, sea_distance) in enumerate(ordered, start=1)
    ]


def _frame_regime_matrix(
    frame: pl.DataFrame, regimes_by_round: dict[str, np.ndarray]
) -> np.ndarray:
    if frame.height == 0:
        first_regime = next(iter(regimes_by_round.values()))
        return np.zeros((0, first_regime.shape[0]), dtype=np.float64)
    round_ids = frame.get_column("round_id").to_list()
    return np.stack(
        [np.asarray(regimes_by_round[str(round_id)], dtype=np.float64) for round_id in round_ids],
        axis=0,
    )


def _site_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    prev_ruin = _frame_column(frame, "prev_ruin", dtype=bool)
    masks = {
        "birth": ~prev_ruin,
        "rebuild": prev_ruin,
        "site_ruin_created": ~prev_ruin,
        "rebuild_port": prev_ruin,
        "ruin_to_forest": prev_ruin,
        "ruin_to_empty": prev_ruin,
    }
    return {
        name: (
            masks[name],
            _frame_column(frame, column_name, dtype=np.float64)[masks[name]],
        )
        for name, column_name in SITE_HEAD_TARGETS
    }


def _live_binary_target_data(
    frame: pl.DataFrame,
) -> dict[str, tuple[slice | np.ndarray, np.ndarray]]:
    return {
        name: (
            slice(None),
            _frame_column(frame, column_name, dtype=np.float64),
        )
        for name, column_name in LIVE_SETTLEMENT_BINARY_TARGETS
    }


def _live_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    next_alive = _frame_column(frame, "next_alive", dtype=bool)
    return {
        name: (
            next_alive,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0)[next_alive],
        )
        for name, column_name in LIVE_SETTLEMENT_LINEAR_TARGETS
    }


def _pairwise_binary_target_data(
    frame: pl.DataFrame,
) -> dict[str, tuple[slice | np.ndarray, np.ndarray]]:
    return {
        name: (
            slice(None),
            _frame_column(frame, column_name, dtype=np.float64),
        )
        for name, column_name in PAIRWISE_BINARY_TARGETS
    }


def _pairwise_linear_target_data(frame: pl.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    full_mask = np.ones(frame.height, dtype=bool)
    return {
        name: (
            full_mask,
            _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0),
        )
        for name, column_name in PAIRWISE_LINEAR_TARGETS
    }


def _ruin_binary_target_data(
    frame: pl.DataFrame,
) -> dict[str, tuple[slice | np.ndarray, np.ndarray]]:
    return {
        name: (
            slice(None),
            _frame_column(frame, column_name, dtype=np.float64),
        )
        for name, column_name in RUIN_BINARY_TARGETS
    }


def _initial_mark_feature_matrix(frame: pl.DataFrame) -> tuple[tuple[str, ...], np.ndarray]:
    prev_class = collapse_internal_grid(
        _frame_column(frame, "prev_grid_code", dtype=np.int64).reshape(-1, 1),
    ).reshape(-1)
    coast_distance_steps = _frame_column(frame, "coast_distance_steps", dtype=np.float64)
    coast_distance_unreachable = _frame_column(
        frame, "coast_distance_unreachable", dtype=np.float64
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
        "prev_has_port",
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
    )
    matrix = np.stack(
        [
            _frame_column(frame, "prev_has_port", dtype=np.float64),
            *[(prev_class == class_index).astype(np.float64) for class_index in range(CLASS_COUNT)],
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


def _initial_mark_target_data(frame: pl.DataFrame) -> dict[str, np.ndarray]:
    return {
        name: _frame_column(frame, column_name, dtype=np.float64, fill_null=0.0)
        for name, column_name in INITIAL_MARK_TARGETS
    }


def _fit_binary_head(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    regimes: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> LatentModulatedBinaryHead:
    design = _latent_design_matrix(feature_matrix, regimes)
    coefficients = _fit_ridge_logistic(
        design,
        np.asarray(target, dtype=np.float64),
        ridge_alpha=ridge_alpha,
    )
    intercept, feature_coefficients, regime_coefficients, interaction_coefficients = (
        _split_modulated_coefficients(
            coefficients,
            feature_dim=len(feature_names),
            regime_dim=regimes.shape[1],
        )
    )
    return LatentModulatedBinaryHead(
        name=name,
        feature_names=feature_names,
        regime_dim=regimes.shape[1],
        intercept=intercept,
        feature_coefficients=feature_coefficients,
        regime_coefficients=regime_coefficients,
        interaction_coefficients=interaction_coefficients,
        sample_count=int(target.shape[0]),
        positive_rate=float(np.mean(target)) if target.size else 0.0,
    )


def _fit_linear_head(
    name: str,
    feature_names: tuple[str, ...],
    feature_matrix: np.ndarray,
    regimes: np.ndarray,
    target: np.ndarray,
    *,
    ridge_alpha: float,
) -> LatentModulatedLinearHead:
    design = _latent_design_matrix(feature_matrix, regimes)
    coefficients = _fit_ridge_linear(
        design,
        np.asarray(target, dtype=np.float64),
        ridge_alpha=ridge_alpha,
    )
    intercept, feature_coefficients, regime_coefficients, interaction_coefficients = (
        _split_modulated_coefficients(
            coefficients,
            feature_dim=len(feature_names),
            regime_dim=regimes.shape[1],
        )
    )
    predictions = _feature_score(
        feature_matrix,
        np.zeros((regimes.shape[1],), dtype=np.float64),
        intercept=intercept,
        feature_coefficients=feature_coefficients,
        regime_coefficients=regime_coefficients,
        interaction_coefficients=interaction_coefficients,
    )
    predictions += regimes @ regime_coefficients
    predictions += np.sum((feature_matrix @ interaction_coefficients) * regimes, axis=1)
    residual_std = float(np.std(target - predictions)) if target.size else 0.0
    return LatentModulatedLinearHead(
        name=name,
        feature_names=feature_names,
        regime_dim=regimes.shape[1],
        intercept=intercept,
        feature_coefficients=feature_coefficients,
        regime_coefficients=regime_coefficients,
        interaction_coefficients=interaction_coefficients,
        sample_count=int(target.shape[0]),
        target_mean=float(np.mean(target)) if target.size else 0.0,
        residual_std=max(0.0, residual_std),
    )


def _fit_jobs_binary(
    jobs: list[tuple[str, tuple[str, ...], np.ndarray, np.ndarray, np.ndarray]],
    *,
    ridge_alpha: float,
    fit_workers: int,
) -> tuple[LatentModulatedBinaryHead, ...]:
    if fit_workers <= 1 or len(jobs) <= 1:
        return tuple(
            _fit_binary_head(name, feature_names, matrix, regimes, target, ridge_alpha=ridge_alpha)
            for name, feature_names, matrix, regimes, target in jobs
        )
    with ThreadPoolExecutor(max_workers=fit_workers) as executor:
        futures = [
            executor.submit(
                _fit_binary_head,
                name,
                feature_names,
                matrix,
                regimes,
                target,
                ridge_alpha=ridge_alpha,
            )
            for name, feature_names, matrix, regimes, target in jobs
        ]
        return tuple(future.result() for future in futures)


def _fit_jobs_linear(
    jobs: list[tuple[str, tuple[str, ...], np.ndarray, np.ndarray, np.ndarray]],
    *,
    ridge_alpha: float,
    fit_workers: int,
) -> tuple[LatentModulatedLinearHead, ...]:
    if fit_workers <= 1 or len(jobs) <= 1:
        return tuple(
            _fit_linear_head(name, feature_names, matrix, regimes, target, ridge_alpha=ridge_alpha)
            for name, feature_names, matrix, regimes, target in jobs
        )
    with ThreadPoolExecutor(max_workers=fit_workers) as executor:
        futures = [
            executor.submit(
                _fit_linear_head,
                name,
                feature_names,
                matrix,
                regimes,
                target,
                ridge_alpha=ridge_alpha,
            )
            for name, feature_names, matrix, regimes, target in jobs
        ]
        return tuple(future.result() for future in futures)


def _find_binary_head(
    heads: tuple[LatentModulatedBinaryHead, ...],
    name: str,
) -> LatentModulatedBinaryHead | None:
    for head in heads:
        if head.name == name:
            return head
    return None


def _find_linear_head(
    heads: tuple[LatentModulatedLinearHead, ...],
    name: str,
) -> LatentModulatedLinearHead | None:
    for head in heads:
        if head.name == name:
            return head
    return None


def _combine_probs(base: float, pressure: float) -> float:
    base_value = float(np.clip(base, 0.0, 1.0))
    pressure_value = float(np.clip(pressure, 0.0, 1.0))
    return float(1.0 - (1.0 - base_value) * (1.0 - pressure_value))


def _noise_scale(head: LatentModulatedLinearHead, rollout_noise_scale: float) -> float:
    return float(max(0.0, head.residual_std) * max(0.0, rollout_noise_scale))


class StateSpaceTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "state_space_teacher_v1"
    summary_backend: Literal["dynamic_law", "behavioral_fingerprint_core"] = (
        "behavioral_fingerprint_core"
    )
    behavioral_fingerprint_summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE
    regime_max_rank: int = Field(default=4, ge=1)
    ridge_alpha: float = Field(default=1.0, gt=0.0)
    fit_workers: int = Field(default=1, ge=1)
    max_site_rows: int = Field(default=120_000, ge=1)
    max_live_rows: int = Field(default=120_000, ge=1)
    max_pairwise_rows: int = Field(default=180_000, ge=1)
    max_ruin_rows: int = Field(default=120_000, ge=1)
    max_initial_rows: int = Field(default=80_000, ge=1)
    rollout_noise_scale: float = Field(default=0.5, ge=0.0)
    regime_encoder: ReplaySummaryRegimeEncoder | None = None
    regime_dim: int = Field(default=0, ge=0)
    seed_rollout_horizon_by_seed_index: dict[int, int] = Field(default_factory=dict)
    site_feature_names: tuple[str, ...] = ()
    live_feature_names: tuple[str, ...] = ()
    pairwise_feature_names: tuple[str, ...] = ()
    ruin_feature_names: tuple[str, ...] = ()
    initial_mark_feature_names: tuple[str, ...] = ()
    site_heads: tuple[LatentModulatedBinaryHead, ...] = ()
    live_binary_heads: tuple[LatentModulatedBinaryHead, ...] = ()
    live_linear_heads: tuple[LatentModulatedLinearHead, ...] = ()
    pairwise_binary_heads: tuple[LatentModulatedBinaryHead, ...] = ()
    pairwise_linear_heads: tuple[LatentModulatedLinearHead, ...] = ()
    ruin_heads: tuple[LatentModulatedBinaryHead, ...] = ()
    initial_mark_heads: tuple[LatentModulatedLinearHead, ...] = ()

    def _fit_from_measurement_rounds(
        self,
        measurement_rounds: list[_MeasurementRound],
        *,
        regime_encoder: ReplaySummaryRegimeEncoder,
    ) -> StateSpaceTeacher:
        if not measurement_rounds:
            raise ValueError("no replay-backed rounds available for state-space teacher")
        regimes_by_round = {
            round_id: np.asarray(regime, dtype=np.float64)
            for round_id, regime in zip(
                regime_encoder.round_ids,
                np.asarray(regime_encoder.regime_bank, dtype=np.float64),
                strict=True,
            )
        }
        regime_dim = int(regime_encoder.regime_dim)
        seed_rollout_horizon_by_seed_index = _seed_rollout_horizon_by_seed_index(measurement_rounds)
        bundles_by_episode = [list(item.bundles) for item in measurement_rounds]

        site_frames = [
            bundle.site_opportunities for bundles in bundles_by_episode for bundle in bundles
        ]
        live_frames = [
            bundle.live_settlement_transitions
            for bundles in bundles_by_episode
            for bundle in bundles
        ]
        pairwise_frames = [
            bundle.pairwise_candidates for bundles in bundles_by_episode for bundle in bundles
        ]
        ruin_frames = [
            bundle.ruin_transitions for bundles in bundles_by_episode for bundle in bundles
        ]
        settlement_frames = [
            bundle.settlement_measurements for bundles in bundles_by_episode for bundle in bundles
        ]

        site_frame = _sample_frame(
            pl.concat(site_frames, how="vertical_relaxed") if site_frames else pl.DataFrame(),
            max_rows=self.max_site_rows,
            seed=3,
        )
        live_frame = _sample_frame(
            pl.concat(live_frames, how="vertical_relaxed") if live_frames else pl.DataFrame(),
            max_rows=self.max_live_rows,
            seed=5,
        )
        pairwise_frame = _sample_frame(
            pl.concat(pairwise_frames, how="vertical_relaxed")
            if pairwise_frames
            else pl.DataFrame(),
            max_rows=self.max_pairwise_rows,
            seed=7,
        )
        ruin_frame = _sample_frame(
            pl.concat(ruin_frames, how="vertical_relaxed") if ruin_frames else pl.DataFrame(),
            max_rows=self.max_ruin_rows,
            seed=11,
        )
        settlement_frame = (
            pl.concat(settlement_frames, how="vertical_relaxed")
            if settlement_frames
            else pl.DataFrame()
        )
        initial_frame = _sample_frame(
            settlement_frame.filter(pl.col("prev_alive") & (pl.col("step") == 0)),
            max_rows=self.max_initial_rows,
            seed=13,
        )

        site_feature_names, site_matrix = _append_time_features(
            *site_feature_matrix(site_frame), site_frame
        )
        live_feature_names, live_matrix = _append_time_features(
            *settlement_feature_matrix(live_frame),
            live_frame,
        )
        pairwise_feature_names, pairwise_matrix = _append_time_features(
            *pairwise_feature_matrix(pairwise_frame),
            pairwise_frame,
        )
        ruin_feature_names, ruin_matrix = _append_time_features(
            *ruin_feature_matrix(ruin_frame), ruin_frame
        )
        initial_mark_feature_names, initial_mark_matrix = _initial_mark_feature_matrix(
            initial_frame
        )

        site_regimes = _frame_regime_matrix(site_frame, regimes_by_round)
        live_regimes = _frame_regime_matrix(live_frame, regimes_by_round)
        pairwise_regimes = _frame_regime_matrix(pairwise_frame, regimes_by_round)
        ruin_regimes = _frame_regime_matrix(ruin_frame, regimes_by_round)
        initial_regimes = _frame_regime_matrix(initial_frame, regimes_by_round)

        site_binary_jobs = [
            (
                name,
                site_feature_names,
                site_matrix[mask],
                site_regimes[mask],
                target,
            )
            for name, (mask, target) in _site_target_data(site_frame).items()
        ]
        live_binary_jobs = [
            (
                name,
                live_feature_names,
                live_matrix[mask],
                live_regimes[mask],
                target,
            )
            for name, (mask, target) in _live_binary_target_data(live_frame).items()
        ]
        live_linear_jobs = [
            (
                name,
                live_feature_names,
                live_matrix[mask],
                live_regimes[mask],
                target,
            )
            for name, (mask, target) in _live_linear_target_data(live_frame).items()
        ]
        pairwise_binary_jobs = [
            (
                name,
                pairwise_feature_names,
                pairwise_matrix[mask],
                pairwise_regimes[mask],
                target,
            )
            for name, (mask, target) in _pairwise_binary_target_data(pairwise_frame).items()
        ]
        pairwise_linear_jobs = [
            (
                name,
                pairwise_feature_names,
                pairwise_matrix[mask],
                pairwise_regimes[mask],
                target,
            )
            for name, (mask, target) in _pairwise_linear_target_data(pairwise_frame).items()
        ]
        ruin_binary_jobs = [
            (
                name,
                ruin_feature_names,
                ruin_matrix[mask],
                ruin_regimes[mask],
                target,
            )
            for name, (mask, target) in _ruin_binary_target_data(ruin_frame).items()
        ]
        initial_linear_jobs = [
            (
                name,
                initial_mark_feature_names,
                initial_mark_matrix,
                initial_regimes,
                target,
            )
            for name, target in _initial_mark_target_data(initial_frame).items()
        ]

        return self.model_copy(
            update={
                "regime_encoder": regime_encoder,
                "regime_dim": regime_dim,
                "seed_rollout_horizon_by_seed_index": seed_rollout_horizon_by_seed_index,
                "site_feature_names": site_feature_names,
                "live_feature_names": live_feature_names,
                "pairwise_feature_names": pairwise_feature_names,
                "ruin_feature_names": ruin_feature_names,
                "initial_mark_feature_names": initial_mark_feature_names,
                "site_heads": _fit_jobs_binary(
                    site_binary_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "live_binary_heads": _fit_jobs_binary(
                    live_binary_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "live_linear_heads": _fit_jobs_linear(
                    live_linear_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "pairwise_binary_heads": _fit_jobs_binary(
                    pairwise_binary_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "pairwise_linear_heads": _fit_jobs_linear(
                    pairwise_linear_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "ruin_heads": _fit_jobs_binary(
                    ruin_binary_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
                "initial_mark_heads": _fit_jobs_linear(
                    initial_linear_jobs,
                    ridge_alpha=self.ridge_alpha,
                    fit_workers=self.fit_workers,
                ),
            },
        )

    def fit(self, episodes: list[RoundEpisode]) -> StateSpaceTeacher:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for state-space teacher")

        regime_encoder = ReplaySummaryRegimeEncoder(
            name=f"{self.name}__regime_encoder",
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
        ).fit(replay_episodes)
        measurement_rounds = [
            _MeasurementRound(
                round_id=episode.metadata.round_id,
                round_number=int(episode.metadata.round_number or -1),
                bundles=tuple(_episode_measurement_bundles(episode)),
            )
            for episode in replay_episodes
        ]
        return self._fit_from_measurement_rounds(
            measurement_rounds,
            regime_encoder=regime_encoder,
        )

    def fit_from_workspace(
        self,
        paths: WorkspacePaths,
        round_ids: list[str],
    ) -> StateSpaceTeacher:
        regime_encoder = ReplaySummaryRegimeEncoder(
            name=f"{self.name}__regime_encoder",
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
        ).fit_from_workspace(paths, round_ids)

        measurement_rounds: list[_MeasurementRound] = []
        for round_id in regime_encoder.round_ids:
            round_number, bundles = _load_or_build_round_state_space_measurement_bundles(
                paths,
                round_id,
            )
            if not bundles:
                continue
            measurement_rounds.append(
                _MeasurementRound(
                    round_id=round_id,
                    round_number=round_number,
                    bundles=tuple(bundles),
                )
            )
        if len(measurement_rounds) != len(regime_encoder.round_ids):
            raise ValueError(
                "state-space teacher workspace measurements drifted from regime rounds"
            )
        return self._fit_from_measurement_rounds(
            measurement_rounds,
            regime_encoder=regime_encoder,
        )

    def checkpoint(self) -> StateSpaceTeacherCheckpoint:
        return StateSpaceTeacherCheckpoint(
            name=self.name,
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
            ridge_alpha=self.ridge_alpha,
            fit_workers=self.fit_workers,
            max_site_rows=self.max_site_rows,
            max_live_rows=self.max_live_rows,
            max_pairwise_rows=self.max_pairwise_rows,
            max_ruin_rows=self.max_ruin_rows,
            max_initial_rows=self.max_initial_rows,
            rollout_noise_scale=self.rollout_noise_scale,
            regime_dim=self.regime_dim,
            regime_encoder_name=None if self.regime_encoder is None else self.regime_encoder.name,
            regime_encoder_checkpoint=(
                None if self.regime_encoder is None else self.regime_encoder.checkpoint()
            ),
            seed_rollout_horizon_by_seed_index=self.seed_rollout_horizon_by_seed_index,
            site_feature_names=list(self.site_feature_names),
            live_feature_names=list(self.live_feature_names),
            pairwise_feature_names=list(self.pairwise_feature_names),
            ruin_feature_names=list(self.ruin_feature_names),
            initial_mark_feature_names=list(self.initial_mark_feature_names),
            site_heads=[_binary_head_checkpoint(head) for head in self.site_heads],
            live_binary_heads=[_binary_head_checkpoint(head) for head in self.live_binary_heads],
            live_linear_heads=[_linear_head_checkpoint(head) for head in self.live_linear_heads],
            pairwise_binary_heads=[
                _binary_head_checkpoint(head) for head in self.pairwise_binary_heads
            ],
            pairwise_linear_heads=[
                _linear_head_checkpoint(head) for head in self.pairwise_linear_heads
            ],
            ruin_heads=[_binary_head_checkpoint(head) for head in self.ruin_heads],
            initial_mark_heads=[
                _linear_head_checkpoint(head) for head in self.initial_mark_heads
            ],
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> StateSpaceTeacher:
        checkpoint = StateSpaceTeacherCheckpoint.model_validate_json(
            path.read_text(encoding="utf-8")
        )
        regime_encoder = (
            None
            if checkpoint.regime_encoder_checkpoint is None
            else ReplaySummaryRegimeEncoder.from_checkpoint(checkpoint.regime_encoder_checkpoint)
        )
        return cls(
            name=checkpoint.name,
            summary_backend=checkpoint.summary_backend,
            behavioral_fingerprint_summary_profile=checkpoint.behavioral_fingerprint_summary_profile,
            regime_max_rank=checkpoint.regime_max_rank,
            ridge_alpha=checkpoint.ridge_alpha,
            fit_workers=checkpoint.fit_workers,
            max_site_rows=checkpoint.max_site_rows,
            max_live_rows=checkpoint.max_live_rows,
            max_pairwise_rows=checkpoint.max_pairwise_rows,
            max_ruin_rows=checkpoint.max_ruin_rows,
            max_initial_rows=checkpoint.max_initial_rows,
            rollout_noise_scale=checkpoint.rollout_noise_scale,
            regime_encoder=regime_encoder,
            regime_dim=checkpoint.regime_dim,
            seed_rollout_horizon_by_seed_index=dict(checkpoint.seed_rollout_horizon_by_seed_index),
            site_feature_names=tuple(checkpoint.site_feature_names),
            live_feature_names=tuple(checkpoint.live_feature_names),
            pairwise_feature_names=tuple(checkpoint.pairwise_feature_names),
            ruin_feature_names=tuple(checkpoint.ruin_feature_names),
            initial_mark_feature_names=tuple(checkpoint.initial_mark_feature_names),
            site_heads=tuple(_restore_binary_head(head) for head in checkpoint.site_heads),
            live_binary_heads=tuple(
                _restore_binary_head(head) for head in checkpoint.live_binary_heads
            ),
            live_linear_heads=tuple(
                _restore_linear_head(head) for head in checkpoint.live_linear_heads
            ),
            pairwise_binary_heads=tuple(
                _restore_binary_head(head) for head in checkpoint.pairwise_binary_heads
            ),
            pairwise_linear_heads=tuple(
                _restore_linear_head(head) for head in checkpoint.pairwise_linear_heads
            ),
            ruin_heads=tuple(_restore_binary_head(head) for head in checkpoint.ruin_heads),
            initial_mark_heads=tuple(
                _restore_linear_head(head) for head in checkpoint.initial_mark_heads
            ),
        )

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        if self.regime_encoder is None:
            raise ValueError("state-space teacher is not fit")
        return np.asarray(self.regime_encoder.encode_round(episode), dtype=np.float64)

    def encode_round_from_workspace(self, paths: WorkspacePaths, round_id: str) -> np.ndarray:
        if self.regime_encoder is None:
            raise ValueError("state-space teacher is not fit")
        return np.asarray(
            self.regime_encoder.encode_round_from_workspace(paths, round_id),
            dtype=np.float64,
        )

    def _static_geometry(
        self,
        initial_state: InitialWorldState,
        *,
        seed_index: int,
    ) -> tuple[np.ndarray, SeedFeatureBundle, np.ndarray]:
        grid = np.asarray(initial_state.grid, dtype=np.int64)
        feature_bundle = _seed_feature_bundle(initial_state, seed_index=seed_index)
        empty_grid = np.where(grid == 10, 10, np.where(grid == 5, 5, 11)).astype(np.int64)
        return grid, feature_bundle, empty_grid

    def _distance_cache_for_seed(
        self,
        grid: np.ndarray,
    ) -> dict[tuple[int, int], tuple[np.ndarray, np.ndarray]]:
        del grid
        # Distances are filled lazily for only the settlement positions actually touched.
        return {}

    def _site_feature_vector(
        self,
        bundle: SeedFeatureBundle,
        *,
        x: int,
        y: int,
        prev_ruin: bool,
        nearby_live_count: int,
        nearby_same_owner_count: int,
        nearby_other_owner_count: int,
        nearby_port_count: int,
        nearby_ruin_count: int,
        step: int,
    ) -> np.ndarray:
        features = bundle.features
        year_frac = float(np.clip(step / 49.0, 0.0, 1.0))
        values = np.asarray(
            [
                float(prev_ruin),
                float(features["buildable"][y, x]),
                float(features["coast"][y, x]),
                float(features["coast_distance_steps_log1p"][y, x]),
                float(features["coast_distance_unreachable"][y, x]),
                float(features["land_distance_to_settlement_steps_log1p"][y, x]),
                float(features["land_distance_to_settlement_unreachable"][y, x]),
                float(features["sea_distance_to_port_steps_log1p"][y, x]),
                float(features["sea_distance_to_port_unreachable"][y, x]),
                float(features["settlement_basin_gap_steps_log1p"][y, x]),
                float(features["settlement_basin_gap_unreachable"][y, x]),
                float(features["forest_density"][y, x]),
                float(features["mountain_density"][y, x]),
                float(features["settlement_proximity"][y, x]),
                float(features["maritime_access"][y, x]),
                float(features["frontier_score"][y, x]),
                float(np.log1p(nearby_live_count)),
                float(np.log1p(nearby_same_owner_count)),
                float(np.log1p(nearby_other_owner_count)),
                float(np.log1p(nearby_port_count)),
                float(np.log1p(nearby_ruin_count)),
                year_frac,
                1.0 - year_frac,
                year_frac**2,
                float(year_frac <= 0.25),
                float(0.25 < year_frac <= 0.65),
                float(year_frac > 0.65),
                float(year_frac >= 0.90),
            ],
            dtype=np.float64,
        )
        return values

    def _live_feature_vector(
        self,
        bundle: SeedFeatureBundle,
        *,
        grid_code: int,
        settlement: _SettlementState,
        nearby_live_count: int,
        nearby_same_owner_count: int,
        nearby_other_owner_count: int,
        nearby_port_count: int,
        nearby_ruin_count: int,
        step: int,
    ) -> np.ndarray:
        features = bundle.features
        scored_class = int(collapse_internal_grid(np.asarray([[grid_code]], dtype=np.int64))[0, 0])
        class_one_hot = [
            (1.0 if scored_class == class_index else 0.0) for class_index in range(CLASS_COUNT)
        ]
        year_frac = float(np.clip(step / 49.0, 0.0, 1.0))
        values = np.asarray(
            [
                1.0,
                float(settlement.has_port),
                float(settlement.owner_id is not None),
                *class_one_hot,
                float(features["buildable"][settlement.y, settlement.x]),
                float(features["coast"][settlement.y, settlement.x]),
                float(features["coast_distance_steps_log1p"][settlement.y, settlement.x]),
                float(features["coast_distance_unreachable"][settlement.y, settlement.x]),
                float(
                    features["land_distance_to_settlement_steps_log1p"][settlement.y, settlement.x]
                ),
                float(
                    features["land_distance_to_settlement_unreachable"][settlement.y, settlement.x]
                ),
                float(features["sea_distance_to_port_steps_log1p"][settlement.y, settlement.x]),
                float(features["sea_distance_to_port_unreachable"][settlement.y, settlement.x]),
                float(features["settlement_basin_gap_steps_log1p"][settlement.y, settlement.x]),
                float(features["settlement_basin_gap_unreachable"][settlement.y, settlement.x]),
                float(features["forest_density"][settlement.y, settlement.x]),
                float(features["mountain_density"][settlement.y, settlement.x]),
                float(features["settlement_proximity"][settlement.y, settlement.x]),
                float(features["maritime_access"][settlement.y, settlement.x]),
                float(features["frontier_score"][settlement.y, settlement.x]),
                float(np.log1p(nearby_live_count)),
                float(np.log1p(nearby_same_owner_count)),
                float(np.log1p(nearby_other_owner_count)),
                float(np.log1p(nearby_port_count)),
                float(np.log1p(nearby_ruin_count)),
                float(np.arcsinh(settlement.population)),
                float(np.arcsinh(settlement.food)),
                float(np.arcsinh(settlement.wealth)),
                float(np.arcsinh(settlement.defense)),
                year_frac,
                1.0 - year_frac,
                year_frac**2,
                float(year_frac <= 0.25),
                float(0.25 < year_frac <= 0.65),
                float(year_frac > 0.65),
                float(year_frac >= 0.90),
            ],
            dtype=np.float64,
        )
        return values

    def _ruin_feature_vector(
        self,
        bundle: SeedFeatureBundle,
        *,
        x: int,
        y: int,
        ruin_age: int,
        nearby_live_count: int,
        nearby_same_owner_count: int,
        nearby_other_owner_count: int,
        nearby_port_count: int,
        nearby_ruin_count: int,
        step: int,
    ) -> np.ndarray:
        features = bundle.features
        year_frac = float(np.clip(step / 49.0, 0.0, 1.0))
        values = np.asarray(
            [
                float(np.log1p(max(0, ruin_age))),
                float(features["coast"][y, x]),
                float(features["coast_distance_steps_log1p"][y, x]),
                float(features["coast_distance_unreachable"][y, x]),
                float(features["land_distance_to_settlement_steps_log1p"][y, x]),
                float(features["land_distance_to_settlement_unreachable"][y, x]),
                float(features["sea_distance_to_port_steps_log1p"][y, x]),
                float(features["sea_distance_to_port_unreachable"][y, x]),
                float(features["settlement_basin_gap_steps_log1p"][y, x]),
                float(features["settlement_basin_gap_unreachable"][y, x]),
                float(features["forest_density"][y, x]),
                float(features["mountain_density"][y, x]),
                float(features["settlement_proximity"][y, x]),
                float(features["maritime_access"][y, x]),
                float(features["frontier_score"][y, x]),
                float(np.log1p(nearby_live_count)),
                float(np.log1p(nearby_same_owner_count)),
                float(np.log1p(nearby_other_owner_count)),
                float(np.log1p(nearby_port_count)),
                float(np.log1p(nearby_ruin_count)),
                year_frac,
                1.0 - year_frac,
                year_frac**2,
                float(year_frac <= 0.25),
                float(0.25 < year_frac <= 0.65),
                float(year_frac > 0.65),
                float(year_frac >= 0.90),
            ],
            dtype=np.float64,
        )
        return values

    def _pairwise_feature_vector(
        self,
        source: _SettlementState,
        destination: _SettlementState,
        *,
        land_distance: int,
        sea_distance: int,
        step: int,
    ) -> np.ndarray:
        year_frac = float(np.clip(step / 49.0, 0.0, 1.0))
        values = np.asarray(
            [
                float(
                    source.owner_id is not None
                    and destination.owner_id is not None
                    and source.owner_id == destination.owner_id
                ),
                float(source.has_port),
                float(destination.has_port),
                float(source.has_port and destination.has_port and sea_distance >= 0),
                float(np.log1p(max(land_distance, 0))),
                float(land_distance < 0),
                float(np.log1p(max(sea_distance, 0))),
                float(sea_distance < 0),
                float(np.arcsinh(source.population)),
                float(np.arcsinh(source.food)),
                float(np.arcsinh(source.wealth)),
                float(np.arcsinh(source.defense)),
                float(np.arcsinh(destination.population)),
                float(np.arcsinh(destination.food)),
                float(np.arcsinh(destination.wealth)),
                float(np.arcsinh(destination.defense)),
                year_frac,
                1.0 - year_frac,
                year_frac**2,
                float(year_frac <= 0.25),
                float(0.25 < year_frac <= 0.65),
                float(year_frac > 0.65),
                float(year_frac >= 0.90),
            ],
            dtype=np.float64,
        )
        return values

    def _initial_mark_feature_vector(
        self,
        bundle: SeedFeatureBundle,
        *,
        x: int,
        y: int,
        has_port: bool,
        grid_code: int,
        nearby_live_count: int,
        nearby_same_owner_count: int,
        nearby_other_owner_count: int,
        nearby_port_count: int,
        nearby_ruin_count: int,
    ) -> np.ndarray:
        features = bundle.features
        scored_class = int(collapse_internal_grid(np.asarray([[grid_code]], dtype=np.int64))[0, 0])
        class_one_hot = [
            (1.0 if scored_class == class_index else 0.0) for class_index in range(CLASS_COUNT)
        ]
        return np.asarray(
            [
                float(has_port),
                *class_one_hot,
                float(features["buildable"][y, x]),
                float(features["coast"][y, x]),
                float(features["coast_distance_steps_log1p"][y, x]),
                float(features["coast_distance_unreachable"][y, x]),
                float(features["land_distance_to_settlement_steps_log1p"][y, x]),
                float(features["land_distance_to_settlement_unreachable"][y, x]),
                float(features["sea_distance_to_port_steps_log1p"][y, x]),
                float(features["sea_distance_to_port_unreachable"][y, x]),
                float(features["settlement_basin_gap_steps_log1p"][y, x]),
                float(features["settlement_basin_gap_unreachable"][y, x]),
                float(features["forest_density"][y, x]),
                float(features["mountain_density"][y, x]),
                float(features["settlement_proximity"][y, x]),
                float(features["maritime_access"][y, x]),
                float(features["frontier_score"][y, x]),
                float(np.log1p(nearby_live_count)),
                float(np.log1p(nearby_same_owner_count)),
                float(np.log1p(nearby_other_owner_count)),
                float(np.log1p(nearby_port_count)),
                float(np.log1p(nearby_ruin_count)),
            ],
            dtype=np.float64,
        )

    def _predict_binary_scalar(
        self,
        heads: tuple[LatentModulatedBinaryHead, ...],
        name: str,
        feature_vector: np.ndarray,
        regime: np.ndarray,
    ) -> float:
        head = _find_binary_head(heads, name)
        if head is None:
            return 0.0
        return float(head.predict(feature_vector.reshape(1, -1), regime)[0])

    def _predict_linear_scalar(
        self,
        heads: tuple[LatentModulatedLinearHead, ...],
        name: str,
        feature_vector: np.ndarray,
        regime: np.ndarray,
    ) -> tuple[float, float]:
        head = _find_linear_head(heads, name)
        if head is None:
            return 0.0, 0.0
        return (
            float(head.predict(feature_vector.reshape(1, -1), regime)[0]),
            _noise_scale(head, self.rollout_noise_scale),
        )

    def _initialize_state(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        *,
        rng: np.random.Generator,
    ) -> tuple[np.ndarray, SeedFeatureBundle, np.ndarray, list[_SettlementState], np.ndarray]:
        initial_grid, feature_bundle, empty_grid = self._static_geometry(
            seed.initial_state,
            seed_index=seed.seed_index,
        )
        alive_full = [
            SettlementFullState(
                settlement_id=f"init_{index}",
                x=item.x,
                y=item.y,
                population=0.0,
                food=0.0,
                wealth=0.0,
                defense=0.0,
                has_port=item.has_port,
                owner_id=index,
                alive=item.alive,
            )
            for index, item in enumerate(seed.initial_state.settlements)
            if item.alive
        ]
        nearby_live_counts, nearby_port_counts, nearby_ruin_counts, nearby_same_owner_counts = (
            _build_local_context_maps_for_rollout(initial_grid, alive_full)
        )
        settlements: list[_SettlementState] = []
        for index, item in enumerate(seed.initial_state.settlements):
            (
                nearby_live_count,
                nearby_same_owner_count,
                nearby_other_owner_count,
                nearby_port_count,
                nearby_ruin_count,
            ) = _local_context_for_rollout(
                nearby_live_counts,
                nearby_port_counts,
                nearby_ruin_counts,
                nearby_same_owner_counts,
                x=item.x,
                y=item.y,
                owner_id=index,
                exclude_self=item.alive,
                self_has_port=item.has_port,
            )
            feature_vector = self._initial_mark_feature_vector(
                feature_bundle,
                x=item.x,
                y=item.y,
                has_port=item.has_port,
                grid_code=int(initial_grid[item.y, item.x]),
                nearby_live_count=nearby_live_count,
                nearby_same_owner_count=nearby_same_owner_count,
                nearby_other_owner_count=nearby_other_owner_count,
                nearby_port_count=nearby_port_count,
                nearby_ruin_count=nearby_ruin_count,
            )
            population_mean, population_noise = self._predict_linear_scalar(
                self.initial_mark_heads,
                "population",
                feature_vector,
                regime,
            )
            food_mean, food_noise = self._predict_linear_scalar(
                self.initial_mark_heads,
                "food",
                feature_vector,
                regime,
            )
            wealth_mean, wealth_noise = self._predict_linear_scalar(
                self.initial_mark_heads,
                "wealth",
                feature_vector,
                regime,
            )
            defense_mean, defense_noise = self._predict_linear_scalar(
                self.initial_mark_heads,
                "defense",
                feature_vector,
                regime,
            )
            settlements.append(
                _SettlementState(
                    settlement_id=f"init_{index}",
                    x=item.x,
                    y=item.y,
                    population=max(0.5, population_mean + rng.normal(0.0, population_noise)),
                    food=food_mean + rng.normal(0.0, food_noise),
                    wealth=wealth_mean + rng.normal(0.0, wealth_noise),
                    defense=max(0.0, defense_mean + rng.normal(0.0, defense_noise)),
                    has_port=item.has_port,
                    owner_id=index,
                    alive=item.alive,
                ),
            )
        ruin_age = np.where(initial_grid == 3, 0, -1).astype(np.int64)
        return initial_grid.copy(), feature_bundle, empty_grid, settlements, ruin_age

    def _choose_owner_id(
        self,
        nearby_same_owner_counts: dict[int, np.ndarray],
        *,
        x: int,
        y: int,
        fallback_owner_id: int,
    ) -> int:
        best_owner_id = fallback_owner_id
        best_count = -1
        for owner_id, counts in nearby_same_owner_counts.items():
            value = int(counts[y, x])
            if value > best_count:
                best_owner_id = owner_id
                best_count = value
        return best_owner_id

    def _simulate_step(
        self,
        grid: np.ndarray,
        settlements: list[_SettlementState],
        ruin_age: np.ndarray,
        feature_bundle: SeedFeatureBundle,
        empty_grid: np.ndarray,
        distance_cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]],
        regime: np.ndarray,
        *,
        step: int,
        rng: np.random.Generator,
        next_owner_id: int,
    ) -> tuple[np.ndarray, list[_SettlementState], np.ndarray, int]:
        previous_grid = np.asarray(grid, dtype=np.int64)
        previous_alive = [item for item in settlements if item.alive]
        previous_alive_by_position = {(item.x, item.y): item for item in previous_alive}
        previous_alive_full = [item.to_full_state() for item in previous_alive]
        nearby_live_counts, nearby_port_counts, nearby_ruin_counts, nearby_same_owner_counts = (
            _build_local_context_maps_for_rollout(previous_grid, previous_alive_full)
        )

        incoming_collapse_probs: dict[tuple[int, int], list[float]] = defaultdict(list)
        incoming_owner_probs: dict[tuple[int, int], list[tuple[int, float]]] = defaultdict(list)
        incoming_port_gain_probs: dict[tuple[int, int], list[float]] = defaultdict(list)
        incoming_delta_vectors: dict[tuple[int, int], list[np.ndarray]] = defaultdict(list)

        land_cached = None
        sea_or_coast_cached = None
        for source in previous_alive:
            source_key = (source.y, source.x)
            if source_key not in distance_cache:
                if land_cached is None:
                    land_cached = land_mask(previous_grid)
                    sea_or_coast_cached = sea_mask(previous_grid) | coast_mask(previous_grid)
                assert land_cached is not None
                assert sea_or_coast_cached is not None
                distance_cache[source_key] = (
                    multi_source_distance(land_cached, [source_key]),
                    multi_source_distance(sea_or_coast_cached, [source_key]),
                )
        for source_full, source_state in zip(previous_alive_full, previous_alive, strict=True):
            for (
                _,
                destination_full,
                land_distance,
                sea_distance,
            ) in _select_pairwise_targets_for_rollout(
                previous_alive_full,
                distance_cache,
                source=source_full,
            ):
                destination_state = previous_alive_by_position[
                    (destination_full.x, destination_full.y)
                ]
                feature_vector = self._pairwise_feature_vector(
                    source_state,
                    destination_state,
                    land_distance=land_distance,
                    sea_distance=sea_distance,
                    step=step,
                )
                destination_key = (destination_state.x, destination_state.y)
                incoming_collapse_probs[destination_key].append(
                    self._predict_binary_scalar(
                        self.pairwise_binary_heads,
                        "dst_collapse_next",
                        feature_vector,
                        regime,
                    ),
                )
                owner_flip_probability = self._predict_binary_scalar(
                    self.pairwise_binary_heads,
                    "dst_owner_flip_next",
                    feature_vector,
                    regime,
                )
                if (
                    source_state.owner_id is not None
                    and destination_state.owner_id is not None
                    and source_state.owner_id != destination_state.owner_id
                ):
                    incoming_owner_probs[destination_key].append(
                        (source_state.owner_id, owner_flip_probability),
                    )
                incoming_port_gain_probs[destination_key].append(
                    self._predict_binary_scalar(
                        self.pairwise_binary_heads,
                        "dst_port_gain_next",
                        feature_vector,
                        regime,
                    ),
                )
                incoming_delta_vectors[destination_key].append(
                    np.asarray(
                        [
                            self._predict_linear_scalar(
                                self.pairwise_linear_heads,
                                "dst_population_delta",
                                feature_vector,
                                regime,
                            )[0],
                            self._predict_linear_scalar(
                                self.pairwise_linear_heads,
                                "dst_food_delta",
                                feature_vector,
                                regime,
                            )[0],
                            self._predict_linear_scalar(
                                self.pairwise_linear_heads,
                                "dst_wealth_delta",
                                feature_vector,
                                regime,
                            )[0],
                            self._predict_linear_scalar(
                                self.pairwise_linear_heads,
                                "dst_defense_delta",
                                feature_vector,
                                regime,
                            )[0],
                        ],
                        dtype=np.float64,
                    ),
                )

        next_grid = previous_grid.copy()
        next_settlements: list[_SettlementState] = []
        occupied_positions: set[tuple[int, int]] = set()

        for settlement in previous_alive:
            key = (settlement.x, settlement.y)
            (
                nearby_live_count,
                nearby_same_owner_count,
                nearby_other_owner_count,
                nearby_port_count,
                nearby_ruin_count,
            ) = _local_context_for_rollout(
                nearby_live_counts,
                nearby_port_counts,
                nearby_ruin_counts,
                nearby_same_owner_counts,
                x=settlement.x,
                y=settlement.y,
                owner_id=settlement.owner_id,
                exclude_self=True,
                self_has_port=settlement.has_port,
            )
            feature_vector = self._live_feature_vector(
                feature_bundle,
                grid_code=int(previous_grid[settlement.y, settlement.x]),
                settlement=settlement,
                nearby_live_count=nearby_live_count,
                nearby_same_owner_count=nearby_same_owner_count,
                nearby_other_owner_count=nearby_other_owner_count,
                nearby_port_count=nearby_port_count,
                nearby_ruin_count=nearby_ruin_count,
                step=step,
            )
            collapse_base = self._predict_binary_scalar(
                self.live_binary_heads,
                "collapse",
                feature_vector,
                regime,
            )
            collapse_pressure = (
                1.0
                - float(
                    np.prod(
                        1.0 - np.clip(incoming_collapse_probs.get(key, []), 0.0, 0.99),
                        dtype=np.float64,
                    ),
                )
                if incoming_collapse_probs.get(key)
                else 0.0
            )
            collapse_probability = _combine_probs(collapse_base, collapse_pressure)
            collapse = bool(rng.random() < collapse_probability)
            if collapse:
                collapse_to_ruin_probability = self._predict_binary_scalar(
                    self.live_binary_heads,
                    "collapse_to_ruin",
                    feature_vector,
                    regime,
                )
                next_grid[settlement.y, settlement.x] = (
                    3
                    if rng.random() < collapse_to_ruin_probability
                    else int(empty_grid[settlement.y, settlement.x])
                )
                continue

            port_gain_probability = _combine_probs(
                self._predict_binary_scalar(
                    self.live_binary_heads,
                    "port_gain",
                    feature_vector,
                    regime,
                ),
                (
                    1.0
                    - float(
                        np.prod(
                            1.0 - np.clip(incoming_port_gain_probs.get(key, []), 0.0, 0.99),
                            dtype=np.float64,
                        ),
                    )
                    if incoming_port_gain_probs.get(key)
                    else 0.0
                ),
            )
            port_loss_probability = self._predict_binary_scalar(
                self.live_binary_heads,
                "port_loss",
                feature_vector,
                regime,
            )
            owner_flip_base = self._predict_binary_scalar(
                self.live_binary_heads,
                "owner_flip",
                feature_vector,
                regime,
            )
            owner_candidates = incoming_owner_probs.get(key, [])
            owner_flip_pressure = (
                1.0
                - float(
                    np.prod(
                        1.0 - np.clip([item[1] for item in owner_candidates], 0.0, 0.99),
                        dtype=np.float64,
                    ),
                )
                if owner_candidates
                else 0.0
            )
            owner_flip_probability = _combine_probs(owner_flip_base, owner_flip_pressure)

            pairwise_delta = (
                np.mean(np.stack(incoming_delta_vectors[key], axis=0), axis=0)
                if incoming_delta_vectors.get(key)
                else np.zeros((4,), dtype=np.float64)
            )
            population_delta, population_noise = self._predict_linear_scalar(
                self.live_linear_heads,
                "population_delta",
                feature_vector,
                regime,
            )
            food_delta, food_noise = self._predict_linear_scalar(
                self.live_linear_heads,
                "food_delta",
                feature_vector,
                regime,
            )
            wealth_delta, wealth_noise = self._predict_linear_scalar(
                self.live_linear_heads,
                "wealth_delta",
                feature_vector,
                regime,
            )
            defense_delta, defense_noise = self._predict_linear_scalar(
                self.live_linear_heads,
                "defense_delta",
                feature_vector,
                regime,
            )
            new_owner_id = settlement.owner_id
            if owner_candidates and rng.random() < owner_flip_probability:
                owner_weight_map: dict[int, float] = defaultdict(float)
                for owner_id, probability in owner_candidates:
                    owner_weight_map[owner_id] += float(max(0.0, probability))
                owner_ids = np.asarray(list(owner_weight_map), dtype=np.int64)
                weights = np.asarray(
                    [owner_weight_map[int(owner_id)] for owner_id in owner_ids], dtype=np.float64
                )
                if float(np.sum(weights)) > 0.0:
                    weights = weights / float(np.sum(weights))
                    new_owner_id = int(owner_ids[int(rng.choice(len(owner_ids), p=weights))])

            has_port = settlement.has_port
            if has_port:
                if rng.random() < port_loss_probability:
                    has_port = False
            elif rng.random() < port_gain_probability:
                has_port = True

            new_population = max(
                0.5,
                settlement.population
                + population_delta
                + float(pairwise_delta[0])
                + rng.normal(0.0, population_noise),
            )
            new_food = (
                settlement.food
                + food_delta
                + float(pairwise_delta[1])
                + rng.normal(0.0, food_noise)
            )
            new_wealth = (
                settlement.wealth
                + wealth_delta
                + float(pairwise_delta[2])
                + rng.normal(0.0, wealth_noise)
            )
            new_defense = max(
                0.0,
                settlement.defense
                + defense_delta
                + float(pairwise_delta[3])
                + rng.normal(0.0, defense_noise),
            )
            next_settlement = _SettlementState(
                settlement_id=settlement.settlement_id,
                x=settlement.x,
                y=settlement.y,
                population=float(new_population),
                food=float(new_food),
                wealth=float(new_wealth),
                defense=float(new_defense),
                has_port=bool(has_port),
                owner_id=new_owner_id,
                alive=True,
            )
            next_settlements.append(next_settlement)
            occupied_positions.add((settlement.x, settlement.y))
            next_grid[settlement.y, settlement.x] = 2 if has_port else 1

        for y in range(previous_grid.shape[0]):
            for x in range(previous_grid.shape[1]):
                if (x, y) in occupied_positions:
                    continue
                previous_alive_here = any(item.x == x and item.y == y for item in previous_alive)
                if previous_alive_here:
                    continue
                (
                    nearby_live_count,
                    nearby_same_owner_count,
                    nearby_other_owner_count,
                    nearby_port_count,
                    nearby_ruin_count,
                ) = _local_context_for_rollout(
                    nearby_live_counts,
                    nearby_port_counts,
                    nearby_ruin_counts,
                    nearby_same_owner_counts,
                    x=x,
                    y=y,
                    owner_id=None,
                    exclude_self=False,
                    self_has_port=False,
                )
                previous_code = int(previous_grid[y, x])
                if previous_code == 3:
                    site_feature = self._site_feature_vector(
                        feature_bundle,
                        x=x,
                        y=y,
                        prev_ruin=True,
                        nearby_live_count=nearby_live_count,
                        nearby_same_owner_count=nearby_same_owner_count,
                        nearby_other_owner_count=nearby_other_owner_count,
                        nearby_port_count=nearby_port_count,
                        nearby_ruin_count=nearby_ruin_count,
                        step=step,
                    )
                    ruin_feature = self._ruin_feature_vector(
                        feature_bundle,
                        x=x,
                        y=y,
                        ruin_age=int(ruin_age[y, x]),
                        nearby_live_count=nearby_live_count,
                        nearby_same_owner_count=nearby_same_owner_count,
                        nearby_other_owner_count=nearby_other_owner_count,
                        nearby_port_count=nearby_port_count,
                        nearby_ruin_count=nearby_ruin_count,
                        step=step,
                    )
                    rebuild_port_weight = 0.5 * (
                        self._predict_binary_scalar(
                            self.ruin_heads, "rebuild_port", ruin_feature, regime
                        )
                        + self._predict_binary_scalar(
                            self.site_heads, "rebuild_port", site_feature, regime
                        )
                    )
                    rebuild_weight = 0.5 * (
                        self._predict_binary_scalar(
                            self.ruin_heads,
                            "rebuild_settlement",
                            ruin_feature,
                            regime,
                        )
                        + self._predict_binary_scalar(
                            self.site_heads, "rebuild", site_feature, regime
                        )
                    )
                    forest_weight = 0.5 * (
                        self._predict_binary_scalar(
                            self.ruin_heads,
                            "reclaim_forest",
                            ruin_feature,
                            regime,
                        )
                        + self._predict_binary_scalar(
                            self.site_heads, "ruin_to_forest", site_feature, regime
                        )
                    )
                    empty_weight = 0.5 * (
                        self._predict_binary_scalar(
                            self.ruin_heads, "fade_empty", ruin_feature, regime
                        )
                        + self._predict_binary_scalar(
                            self.site_heads, "ruin_to_empty", site_feature, regime
                        )
                    )
                    remain_weight = self._predict_binary_scalar(
                        self.ruin_heads,
                        "remain_ruin",
                        ruin_feature,
                        regime,
                    )
                    weights = np.asarray(
                        [
                            max(1e-3, rebuild_port_weight),
                            max(1e-3, rebuild_weight * (1.0 - rebuild_port_weight)),
                            max(1e-3, forest_weight),
                            max(1e-3, empty_weight),
                            max(1e-3, remain_weight),
                        ],
                        dtype=np.float64,
                    )
                    weights = weights / float(np.sum(weights))
                    action_index = int(rng.choice(len(weights), p=weights))
                    if action_index in (0, 1):
                        owner_id = self._choose_owner_id(
                            nearby_same_owner_counts,
                            x=x,
                            y=y,
                            fallback_owner_id=next_owner_id,
                        )
                        if owner_id == next_owner_id:
                            next_owner_id += 1
                        has_port = action_index == 0
                        initial_feature = self._initial_mark_feature_vector(
                            feature_bundle,
                            x=x,
                            y=y,
                            has_port=has_port,
                            grid_code=3,
                            nearby_live_count=nearby_live_count,
                            nearby_same_owner_count=nearby_same_owner_count,
                            nearby_other_owner_count=nearby_other_owner_count,
                            nearby_port_count=nearby_port_count,
                            nearby_ruin_count=nearby_ruin_count,
                        )
                        population_mean, population_noise = self._predict_linear_scalar(
                            self.initial_mark_heads,
                            "population",
                            initial_feature,
                            regime,
                        )
                        food_mean, food_noise = self._predict_linear_scalar(
                            self.initial_mark_heads,
                            "food",
                            initial_feature,
                            regime,
                        )
                        wealth_mean, wealth_noise = self._predict_linear_scalar(
                            self.initial_mark_heads,
                            "wealth",
                            initial_feature,
                            regime,
                        )
                        defense_mean, defense_noise = self._predict_linear_scalar(
                            self.initial_mark_heads,
                            "defense",
                            initial_feature,
                            regime,
                        )
                        next_settlements.append(
                            _SettlementState(
                                settlement_id=f"sim_{step}_{x}_{y}",
                                x=x,
                                y=y,
                                population=max(
                                    0.5, population_mean + rng.normal(0.0, population_noise)
                                ),
                                food=food_mean + rng.normal(0.0, food_noise),
                                wealth=wealth_mean + rng.normal(0.0, wealth_noise),
                                defense=max(0.0, defense_mean + rng.normal(0.0, defense_noise)),
                                has_port=has_port,
                                owner_id=owner_id,
                                alive=True,
                            ),
                        )
                        next_grid[y, x] = 2 if has_port else 1
                        occupied_positions.add((x, y))
                    elif action_index == 2:
                        next_grid[y, x] = 4
                    elif action_index == 3:
                        next_grid[y, x] = int(empty_grid[y, x])
                    else:
                        next_grid[y, x] = 3
                    continue

                if feature_bundle.feature("buildable")[y, x] <= 0.5:
                    continue
                site_feature = self._site_feature_vector(
                    feature_bundle,
                    x=x,
                    y=y,
                    prev_ruin=False,
                    nearby_live_count=nearby_live_count,
                    nearby_same_owner_count=nearby_same_owner_count,
                    nearby_other_owner_count=nearby_other_owner_count,
                    nearby_port_count=nearby_port_count,
                    nearby_ruin_count=nearby_ruin_count,
                    step=step,
                )
                birth_weight = self._predict_binary_scalar(
                    self.site_heads, "birth", site_feature, regime
                )
                ruin_weight = self._predict_binary_scalar(
                    self.site_heads,
                    "site_ruin_created",
                    site_feature,
                    regime,
                )
                stay_weight = max(1e-3, 1.0 - max(birth_weight, ruin_weight))
                weights = np.asarray(
                    [
                        max(1e-3, birth_weight),
                        max(1e-3, ruin_weight),
                        stay_weight,
                    ],
                    dtype=np.float64,
                )
                weights = weights / float(np.sum(weights))
                action_index = int(rng.choice(len(weights), p=weights))
                if action_index == 0:
                    owner_id = self._choose_owner_id(
                        nearby_same_owner_counts,
                        x=x,
                        y=y,
                        fallback_owner_id=next_owner_id,
                    )
                    if owner_id == next_owner_id:
                        next_owner_id += 1
                    initial_feature = self._initial_mark_feature_vector(
                        feature_bundle,
                        x=x,
                        y=y,
                        has_port=False,
                        grid_code=int(empty_grid[y, x]),
                        nearby_live_count=nearby_live_count,
                        nearby_same_owner_count=nearby_same_owner_count,
                        nearby_other_owner_count=nearby_other_owner_count,
                        nearby_port_count=nearby_port_count,
                        nearby_ruin_count=nearby_ruin_count,
                    )
                    population_mean, population_noise = self._predict_linear_scalar(
                        self.initial_mark_heads,
                        "population",
                        initial_feature,
                        regime,
                    )
                    food_mean, food_noise = self._predict_linear_scalar(
                        self.initial_mark_heads,
                        "food",
                        initial_feature,
                        regime,
                    )
                    wealth_mean, wealth_noise = self._predict_linear_scalar(
                        self.initial_mark_heads,
                        "wealth",
                        initial_feature,
                        regime,
                    )
                    defense_mean, defense_noise = self._predict_linear_scalar(
                        self.initial_mark_heads,
                        "defense",
                        initial_feature,
                        regime,
                    )
                    next_settlements.append(
                        _SettlementState(
                            settlement_id=f"birth_{step}_{x}_{y}",
                            x=x,
                            y=y,
                            population=max(
                                0.5, population_mean + rng.normal(0.0, population_noise)
                            ),
                            food=food_mean + rng.normal(0.0, food_noise),
                            wealth=wealth_mean + rng.normal(0.0, wealth_noise),
                            defense=max(0.0, defense_mean + rng.normal(0.0, defense_noise)),
                            has_port=False,
                            owner_id=owner_id,
                            alive=True,
                        ),
                    )
                    next_grid[y, x] = 1
                    occupied_positions.add((x, y))
                elif action_index == 1:
                    next_grid[y, x] = 3

        next_ruin_age = np.where(
            next_grid == 3,
            np.where(previous_grid == 3, ruin_age + 1, 0),
            -1,
        ).astype(np.int64)
        return next_grid, next_settlements, next_ruin_age, next_owner_id

    def rollout(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int,
        horizon: int = 50,
    ) -> list[ReplayRun]:
        if self.regime_dim <= 0 or not self.site_heads:
            raise ValueError("state-space teacher is not fit")
        regime_vector = np.asarray(regime, dtype=np.float64)
        if regime_vector.ndim != 1:
            raise ValueError(f"expected 1D regime vector, got shape {regime_vector.shape!r}")
        runs: list[ReplayRun] = []
        initial_grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
        distance_cache = self._distance_cache_for_seed(initial_grid)
        regime_seed = int(np.round(np.sum(np.abs(regime_vector) * 1_000.0))) % 1_000_000
        effective_horizon = max(1, horizon)
        seed_horizon = self.seed_rollout_horizon_by_seed_index.get(seed.seed_index)
        if seed_horizon is not None:
            effective_horizon = min(effective_horizon, max(1, int(seed_horizon)))
        for run_index in range(max(0, n_rollouts)):
            rng = np.random.default_rng(
                17_171 + seed.seed_index * 10_007 + regime_seed * 31 + run_index,
            )
            grid, feature_bundle, empty_grid, settlements, ruin_age = self._initialize_state(
                seed,
                regime_vector,
                rng=rng,
            )
            next_owner_id = len(settlements)
            frames: list[WorldFrame] = [
                WorldFrame(
                    t=0,
                    grid=np.asarray(grid, dtype=np.int64),
                    settlements=tuple(item.to_full_state() for item in settlements if item.alive),
                ),
            ]
            for step in range(min(49, max(0, effective_horizon - 1))):
                grid, settlements, ruin_age, next_owner_id = self._simulate_step(
                    grid,
                    settlements,
                    ruin_age,
                    feature_bundle,
                    empty_grid,
                    distance_cache,
                    regime_vector,
                    step=step,
                    rng=rng,
                    next_owner_id=next_owner_id,
                )
                frames.append(
                    WorldFrame(
                        t=step + 1,
                        grid=np.asarray(grid, dtype=np.int64),
                        settlements=tuple(
                            item.to_full_state() for item in settlements if item.alive
                        ),
                    ),
                )
            runs.append(
                ReplayRun(
                    replay_run_id=f"{self.name}__seed={seed.seed_index}__run={run_index}",
                    round_id="synthetic_teacher",
                    seed_index=seed.seed_index,
                    stochastic_key=f"{self.name}:{regime_seed}:{run_index}",
                    frames=tuple(frames),
                    source_digest=f"{self.name}:{seed.seed_index}:{run_index}",
                    source_path=f"state_space_teacher://{self.name}",
                ),
            )
        return runs

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        runs = self.rollout(seed, regime, n_rollouts=max(1, n_rollouts))
        if not runs:
            raise ValueError("state-space teacher produced no rollouts")
        terminal_counts = np.zeros((*runs[0].frames[-1].grid.shape, CLASS_COUNT), dtype=np.float64)
        for run in runs:
            collapsed = collapse_internal_grid(run.frames[-1].grid)
            for class_index in range(CLASS_COUNT):
                terminal_counts[:, :, class_index] += (collapsed == class_index).astype(np.float64)
        return terminal_counts / float(len(runs))

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        if posterior.particles and posterior.weights is not None:
            components = [
                self.terminal_tensor(seed, particle, n_rollouts=n_rollouts)
                for particle in posterior.particles
            ]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weight_sum = float(np.sum(weights))
            if weight_sum > 0.0:
                weights = weights / weight_sum
            else:
                weights = np.ones_like(weights) / float(len(weights))
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean, n_rollouts=n_rollouts)


__all__ = ["StateSpaceTeacher"]
