"""Cell-level gradient-boosted predictor for final class distributions.

Radical departure from the linear/KNN/ridge approaches used in other model families.
Uses LightGBM with rich per-cell spatial features to predict the 6-class probability
distribution for each cell, trained on historical ground truth data.

Key ideas:
1. Per-cell features capture local topology, neighborhood composition, distance
   gradients, and spatial context at multiple scales.
2. LightGBM captures nonlinear interactions that ridge regression misses.
3. Round-regime conditioning via cross-round aggregate features.
4. Can be used as prior-only or augmented with online query evidence.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import (
    CLASS_COUNT,
    buildable_mask,
    collapse_internal_grid,
    land_mask,
    mountain_mask,
    sea_mask,
)
from astar.features.coasts import coast_mask
from astar.features.reachability import multi_source_distance, normalize_distances
from astar.infra.api.dto import InitialSettlement, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.round import BaseRoundPredictor

GBX_CELLWISE_LGB_MODEL = "gbx_cellwise_lgb_v1"
GBX_CELLWISE_LGB_ONLINE_MODEL = "gbx_cellwise_lgb_online_v1"


def _neighbor_sum(arr: np.ndarray, radius: int = 1) -> np.ndarray:
    """Sum of values in a square neighborhood of given radius."""
    h, w = arr.shape[:2]
    out = np.zeros_like(arr, dtype=np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            sy = slice(max(0, -dy), min(h, h - dy))
            sx = slice(max(0, -dx), min(w, w - dx))
            ty = slice(max(0, dy), min(h, h + dy))
            tx = slice(max(0, dx), min(w, w + dx))
            out[ty, tx] += arr[sy, sx]
    return out


def _neighbor_count(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    """Count neighbors matching mask in square neighborhood."""
    return _neighbor_sum(mask.astype(np.float64), radius)


def _box_mean_fast(arr: np.ndarray, radius: int) -> np.ndarray:
    """Fast box mean using cumulative sums."""
    h, w = arr.shape
    padded = np.pad(arr.astype(np.float64), radius, mode='constant', constant_values=0)
    integral = np.cumsum(np.cumsum(padded, axis=0), axis=1)
    y1, x1 = radius * 2, radius * 2
    result = np.zeros((h, w), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            py, px = y + y1, x + x1
            result[y, x] = (
                integral[py, px]
                - integral[y, px]
                - integral[py, x]
                + integral[y, x]
            )
    # Normalize by actual neighborhood size (handling edges)
    ones = np.ones((h, w), dtype=np.float64)
    padded_ones = np.pad(ones, radius, mode='constant', constant_values=0)
    count_integral = np.cumsum(np.cumsum(padded_ones, axis=0), axis=1)
    counts = np.zeros((h, w), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            py, px = y + y1, x + x1
            counts[y, x] = (
                count_integral[py, px]
                - count_integral[y, px]
                - count_integral[py, x]
                + count_integral[y, x]
            )
    return result / np.maximum(counts, 1.0)


def _settlement_positions(settlements: list[InitialSettlement]) -> list[tuple[int, int]]:
    return [(s.y, s.x) for s in settlements]


def _port_positions(settlements: list[InitialSettlement]) -> list[tuple[int, int]]:
    return [(s.y, s.x) for s in settlements if s.has_port]


def build_cellwise_features(
    grid: np.ndarray,
    settlements: list[InitialSettlement],
    *,
    round_summary: np.ndarray | None = None,
) -> np.ndarray:
    """Build rich per-cell feature array of shape (H, W, F).

    Features include terrain identity, spatial context at multiple scales,
    distance gradients, topology, and optional round-level summary.
    """
    h, w = grid.shape
    collapsed = collapse_internal_grid(grid)
    features: list[np.ndarray] = []
    feature_names: list[str] = []

    # 1. Terrain one-hot (6 features)
    for cls in range(CLASS_COUNT):
        features.append((collapsed == cls).astype(np.float64))
        feature_names.append(f"terrain_{cls}")

    # 2. Land/sea/mountain/buildable masks
    is_land = land_mask(grid).astype(np.float64)
    is_sea = sea_mask(grid).astype(np.float64)
    is_mountain = mountain_mask(grid).astype(np.float64)
    is_buildable = buildable_mask(grid).astype(np.float64)
    is_coast = coast_mask(grid).astype(np.float64)
    is_forest = (grid == 4).astype(np.float64)

    features.extend([is_land, is_sea, is_mountain, is_buildable, is_coast, is_forest])
    feature_names.extend(["land", "sea", "mountain", "buildable", "coast", "forest"])

    # 3. Settlement/port maps
    sett_map = np.zeros((h, w), dtype=np.float64)
    port_map = np.zeros((h, w), dtype=np.float64)
    for s in settlements:
        sett_map[s.y, s.x] = 1.0
        if s.has_port:
            port_map[s.y, s.x] = 1.0
    features.extend([sett_map, port_map])
    feature_names.extend(["settlement", "port"])

    # 4. Neighborhood features at multiple scales
    for radius in [1, 2, 3, 5]:
        for arr, name in [
            (is_forest, "forest"),
            (is_mountain, "mountain"),
            (sett_map, "settlement"),
            (port_map, "port"),
            (is_coast, "coast"),
            (is_buildable, "buildable"),
            (is_land, "land"),
        ]:
            nbr = _neighbor_count(arr, radius)
            features.append(nbr)
            feature_names.append(f"nbr_{name}_r{radius}")

    # 5. Distance to nearest settlement (land path)
    sett_sources = _settlement_positions(settlements)
    if sett_sources:
        sett_dist = multi_source_distance(is_land.astype(bool), sett_sources)
        sett_dist_norm = normalize_distances(sett_dist)
    else:
        sett_dist_norm = np.ones((h, w), dtype=np.float64)
        sett_dist = np.full((h, w), -1)
    features.append(sett_dist_norm)
    feature_names.append("dist_settlement_norm")

    # Raw settlement distance (capped)
    raw_sett_dist = np.where(sett_dist >= 0, sett_dist.astype(np.float64), 50.0)
    features.append(np.minimum(raw_sett_dist / 20.0, 2.5))
    feature_names.append("dist_settlement_raw")

    # 6. Distance to nearest port (sea path for port access)
    port_sources = _port_positions(settlements)
    if port_sources:
        port_dist = multi_source_distance(is_land.astype(bool), port_sources)
        port_dist_norm = normalize_distances(port_dist)
    else:
        port_dist_norm = np.ones((h, w), dtype=np.float64)
    features.append(port_dist_norm)
    feature_names.append("dist_port_norm")

    # 7. Coast distance
    coast_sources = [tuple(idx) for idx in np.argwhere(is_coast.astype(bool))]
    if coast_sources:
        coast_dist = multi_source_distance(is_land.astype(bool), coast_sources)
        coast_dist_norm = normalize_distances(coast_dist)
    else:
        coast_dist_norm = np.ones((h, w), dtype=np.float64)
    features.append(coast_dist_norm)
    feature_names.append("dist_coast_norm")

    # 8. Map-level summary features (replicated per cell)
    n_sett = len(settlements)
    n_port = sum(1 for s in settlements if s.has_port)
    land_frac = float(is_land.mean())
    forest_frac = float(is_forest.mean())
    coast_frac = float(is_coast.mean())
    mountain_frac = float(is_mountain.mean())

    for val, name in [
        (n_sett / 60.0, "map_settlement_count"),
        (n_port / 10.0, "map_port_count"),
        (land_frac, "map_land_frac"),
        (forest_frac, "map_forest_frac"),
        (coast_frac, "map_coast_frac"),
        (mountain_frac, "map_mountain_frac"),
    ]:
        features.append(np.full((h, w), val, dtype=np.float64))
        feature_names.append(name)

    # 9. Position features (normalized)
    yy, xx = np.mgrid[0:h, 0:w]
    features.append(yy.astype(np.float64) / max(h - 1, 1))
    feature_names.append("pos_y")
    features.append(xx.astype(np.float64) / max(w - 1, 1))
    feature_names.append("pos_x")
    # Distance to map center
    center_dist = np.sqrt(((yy - h / 2.0) ** 2 + (xx - w / 2.0) ** 2)) / (h / 2.0)
    features.append(center_dist)
    feature_names.append("dist_center")
    # Distance to nearest edge
    edge_dist = np.minimum(
        np.minimum(yy, h - 1 - yy),
        np.minimum(xx, w - 1 - xx),
    ).astype(np.float64) / max(min(h, w) / 2.0, 1.0)
    features.append(edge_dist)
    feature_names.append("dist_edge")

    # 10. Local terrain heterogeneity
    for radius in [1, 2]:
        local_entropy = np.zeros((h, w), dtype=np.float64)
        for cls in range(CLASS_COUNT):
            cls_frac = _box_mean_fast((collapsed == cls).astype(np.float64), radius)
            local_entropy -= np.where(cls_frac > 0, cls_frac * np.log(cls_frac + 1e-10), 0)
        features.append(local_entropy)
        feature_names.append(f"local_entropy_r{radius}")

    # 11. Connected component size (for settlements)
    # Rough proxy: settlement density in larger radius
    for radius in [4, 7]:
        sett_density = _box_mean_fast(sett_map, radius)
        features.append(sett_density)
        feature_names.append(f"sett_density_r{radius}")

    # 12. Optional round summary (if provided)
    if round_summary is not None:
        for i, val in enumerate(round_summary):
            features.append(np.full((h, w), float(val), dtype=np.float64))
            feature_names.append(f"round_summary_{i}")

    # Stack into (H, W, F)
    feature_stack = np.stack(features, axis=-1)
    return feature_stack


def _flatten_features_and_targets(
    feature_arrays: list[np.ndarray],
    target_arrays: list[np.ndarray],
    weight_arrays: list[np.ndarray] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray | None]:
    """Flatten list of (H,W,F) feature arrays and (H,W,C) target arrays into 2D."""
    X_parts = [f.reshape(-1, f.shape[-1]) for f in feature_arrays]
    Y_parts = [t.reshape(-1, t.shape[-1]) for t in target_arrays]
    X = np.concatenate(X_parts, axis=0)
    Y = np.concatenate(Y_parts, axis=0)
    W = None
    if weight_arrays is not None:
        W_parts = [w.reshape(-1) for w in weight_arrays]
        W = np.concatenate(W_parts, axis=0)
    return X, Y, W


class CellwiseLGBCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    training_round_ids: list[str]
    feature_count: int = Field(ge=1)
    training_cell_count: int = Field(ge=0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    temperature: float = Field(gt=0.0)
    model_paths: dict[int, str]  # class_index -> relative path to LGB model


class CellwiseLGBPredictor(BaseRoundPredictor):
    """LightGBM cell-level predictor for final class distributions."""

    name: str = GBX_CELLWISE_LGB_MODEL
    models: dict[int, object] = Field(default_factory=dict)
    feature_count: int = Field(default=0, ge=0)
    training_round_ids: list[str] = Field(default_factory=list)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.0, gt=0.0)

    model_config = ConfigDict(
        extra="forbid",
        arbitrary_types_allowed=True,
        frozen=False,
    )

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str],
        probability_floor: float = 0.01,
        temperature: float = 1.0,
        n_estimators: int = 300,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        min_child_samples: int = 20,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        reg_alpha: float = 0.1,
        reg_lambda: float = 1.0,
        use_entropy_weights: bool = True,
    ) -> CellwiseLGBPredictor:
        """Train LightGBM models on historical ground truth data."""
        import lightgbm as lgb
        from astar.core.score import entropy_map

        feature_arrays: list[np.ndarray] = []
        target_arrays: list[np.ndarray] = []
        weight_arrays: list[np.ndarray] = []

        for round_id in round_ids:
            round_record = read_round_record(paths, round_id)
            round_detail = round_record.round
            analyses = read_analysis_records(paths, round_id)

            for seed_index, analysis_record in sorted(analyses.items()):
                initial_state = round_detail.initial_states[seed_index]
                grid = np.asarray(initial_state.grid, dtype=np.int64)
                gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)

                feat = build_cellwise_features(grid, initial_state.settlements)
                feature_arrays.append(feat)
                target_arrays.append(gt)

                if use_entropy_weights:
                    ent = entropy_map(gt)
                    # Add small floor so static cells still get some training weight
                    weights = np.maximum(ent, 0.01)
                    weight_arrays.append(weights)

        X, Y, W = _flatten_features_and_targets(
            feature_arrays, target_arrays,
            weight_arrays if use_entropy_weights else None,
        )
        feature_count = X.shape[1]

        # Train one binary classifier per class
        models: dict[int, object] = {}
        for class_idx in range(CLASS_COUNT):
            y_cls = Y[:, class_idx]

            params = {
                "objective": "regression",
                "metric": "mse",
                "n_estimators": n_estimators,
                "max_depth": max_depth,
                "learning_rate": learning_rate,
                "min_child_samples": min_child_samples,
                "subsample": subsample,
                "colsample_bytree": colsample_bytree,
                "reg_alpha": reg_alpha,
                "reg_lambda": reg_lambda,
                "verbose": -1,
                "n_jobs": 4,
                "random_state": 42,
            }

            model = lgb.LGBMRegressor(**params)
            if W is not None:
                model.fit(X, y_cls, sample_weight=W)
            else:
                model.fit(X, y_cls)

            models[class_idx] = model

        predictor = cls(
            name=GBX_CELLWISE_LGB_MODEL,
            models=models,
            feature_count=feature_count,
            training_round_ids=list(round_ids),
            probability_floor=probability_floor,
            temperature=temperature,
        )
        return predictor

    def predict_seed(
        self,
        grid: np.ndarray,
        settlements: list[InitialSettlement],
        *,
        round_summary: np.ndarray | None = None,
    ) -> np.ndarray:
        """Predict (H, W, 6) probability tensor for one seed."""
        h, w = grid.shape
        feat = build_cellwise_features(grid, settlements, round_summary=round_summary)
        X = feat.reshape(-1, feat.shape[-1])

        probs = np.zeros((X.shape[0], CLASS_COUNT), dtype=np.float64)
        for class_idx in range(CLASS_COUNT):
            model = self.models[class_idx]
            pred = model.predict(X)
            probs[:, class_idx] = np.clip(pred, 0.0, 1.0)

        # Apply temperature
        if self.temperature != 1.0:
            log_probs = np.log(np.maximum(probs, 1e-10))
            log_probs /= self.temperature
            probs = np.exp(log_probs)

        # Normalize to valid probability distribution
        row_sums = probs.sum(axis=1, keepdims=True)
        probs = probs / np.maximum(row_sums, 1e-10)

        # Apply probability floor
        probs = np.maximum(probs, self.probability_floor)
        row_sums = probs.sum(axis=1, keepdims=True)
        probs = probs / row_sums

        return probs.reshape(h, w, CLASS_COUNT)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features=None,
        evidence=None,
    ) -> PredictionBundle:
        predictions: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            initial_state = round_detail.initial_states[seed_index]
            grid = np.asarray(initial_state.grid, dtype=np.int64)
            pred = self.predict_seed(grid, initial_state.settlements)
            predictions[seed_index] = pred

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions,
        )

    def save_checkpoint(self, checkpoint_path: Path) -> None:
        """Save models and metadata."""
        import lightgbm as lgb

        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        model_paths: dict[int, str] = {}
        for class_idx, model in self.models.items():
            model_file = checkpoint_path.parent / f"lgb_class_{class_idx}.txt"
            model.booster_.save_model(str(model_file))
            model_paths[class_idx] = model_file.name

        ckpt = CellwiseLGBCheckpoint(
            name=self.name,
            training_round_ids=self.training_round_ids,
            feature_count=self.feature_count,
            training_cell_count=0,
            probability_floor=self.probability_floor,
            temperature=self.temperature,
            model_paths=model_paths,
        )
        checkpoint_path.write_text(json.dumps(ckpt.model_dump(), indent=2))

    @classmethod
    def load_checkpoint(cls, checkpoint_path: Path) -> CellwiseLGBPredictor:
        """Load from saved checkpoint."""
        import lightgbm as lgb

        ckpt_data = json.loads(checkpoint_path.read_text())
        ckpt = CellwiseLGBCheckpoint(**ckpt_data)

        models: dict[int, object] = {}
        for class_idx_str, model_file in ckpt.model_paths.items():
            class_idx = int(class_idx_str)
            model_path = checkpoint_path.parent / model_file
            booster = lgb.Booster(model_file=str(model_path))
            # Wrap in a simple predict-compatible object
            models[class_idx] = _BoosterWrapper(booster)

        return cls(
            name=ckpt.name,
            models=models,
            feature_count=ckpt.feature_count,
            training_round_ids=ckpt.training_round_ids,
            probability_floor=ckpt.probability_floor,
            temperature=ckpt.temperature,
        )


class _BoosterWrapper:
    """Minimal wrapper to make LGB Booster compatible with predict() interface."""

    def __init__(self, booster):
        self.booster_ = booster

    def predict(self, X):
        return self.booster_.predict(X)


def load_replay_final_grids(
    replays_dir: Path,
    round_id: str,
    max_replays_per_seed: int = 100,
) -> dict[int, list[np.ndarray]]:
    """Load year-50 grids from replay data for a given round."""
    import json as _json

    round_dir = replays_dir / round_id
    if not round_dir.exists():
        return {}

    result: dict[int, list[np.ndarray]] = {}
    for seed_dir in sorted(round_dir.iterdir()):
        if not seed_dir.is_dir() or not seed_dir.name.startswith("seed_index="):
            continue
        seed_index = int(seed_dir.name.split("=")[1])
        grids = []
        for replay_file in sorted(seed_dir.iterdir())[:max_replays_per_seed]:
            try:
                with open(replay_file) as f:
                    data = _json.load(f)
                frames = data["response"]["frames"]
                final_grid = np.asarray(frames[-1]["grid"], dtype=np.int64)
                grids.append(final_grid)
            except (KeyError, IndexError, _json.JSONDecodeError):
                continue
        if grids:
            result[seed_index] = grids
    return result


def cellwise_lgb_scoped_checkpoint_path(
    paths: WorkspacePaths,
    *,
    round_ids: Sequence[str],
    model_name: str = GBX_CELLWISE_LGB_MODEL,
) -> Path:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    checkpoint_dir = paths.model_dir(
        f"{model_name}__rounds=n={len(normalized)}__sha1={digest}",
    )
    return checkpoint_dir / "checkpoint.json"
