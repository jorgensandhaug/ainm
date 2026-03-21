"""Cell-type transfer predictor.

Position-invariant approach: for each initial cell type + local structural
bucket, compute the conditional year-50 class distribution from the nearest
historical rounds. This transfers between rounds because it doesn't depend
on absolute position - only on the cell type and local structure.

The key insight is that the analysis ground_truth tensor tells us:
  P(year50_class | cell_x_y) per seed per round

And we can decompose this as:
  P(year50_class | initial_type, local_structure, round_regime)

by bucketing cells by their initial type and local structural features,
then averaging the ground-truth distributions within each bucket.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, CLASS_NAMES, collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank_decoder import (
    _round_ids_with_replays_and_analyses,
)


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.sqrt(np.maximum(np.var(features, axis=0), 1.0e-6))
    return means, scales


def _build_cell_bucket_key(
    initial_class: int,
    settlement_proximity_bucket: int,
    coast_flag: int,
    forest_neighbors: int,
) -> int:
    """Encode cell type + local structure into a single bucket key."""
    return (
        initial_class * 1000
        + settlement_proximity_bucket * 100
        + coast_flag * 10
        + min(forest_neighbors, 8)
    )


def _settlement_proximity_bucket(proximity: float) -> int:
    """Bucket settlement proximity (0-1, higher=closer) into 0-4."""
    if proximity >= 0.9:
        return 0  # very close
    if proximity >= 0.7:
        return 1
    if proximity >= 0.5:
        return 2
    if proximity >= 0.3:
        return 3
    return 4  # far


class CellTypeTransferPredictor(BaseRoundPredictor):
    """Position-invariant cell-type transfer distribution predictor."""

    name: str = "f1_cell_type_transfer_v01"
    base_predictor: HistoricalBucketPriorPredictor

    # Per-round bucket distributions: round_id -> bucket_key -> (C,) mean distribution
    round_bucket_dists: dict[str, dict[int, np.ndarray]] = Field(default_factory=dict)
    # Global fallback: bucket_key -> (C,) distribution
    global_bucket_dists: dict[int, np.ndarray] = Field(default_factory=dict)

    # kNN bank
    bank_round_ids: list[str] = Field(default_factory=list)
    bank_summary_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    k_neighbors: int = Field(default=7, ge=1)
    prior_blend: float = Field(default=0.3, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        budget: int = 50,
        samples_per_round: int = 4,
        k_neighbors: int = 7,
        model_name: str = "f1_cell_type_transfer_v01",
        probability_floor: float = 0.01,
        prior_blend: float = 0.3,
        summary_feature_variant: str = "basic",
        synthetic_dataset_name: str | None = None,
    ) -> CellTypeTransferPredictor:
        selected = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected) < 2:
            raise ValueError("cell type transfer requires at least two analyzed rounds")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )

        # Build per-round and global bucket distributions from analysis tensors
        round_bucket_dists: dict[str, dict[int, np.ndarray]] = {}
        global_bucket_accum: dict[int, list[np.ndarray]] = defaultdict(list)

        for round_id in selected:
            round_detail = read_round_record(paths, round_id).round
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue

            features = compute_round_features(round_detail)
            round_buckets: dict[int, list[np.ndarray]] = defaultdict(list)

            for seed_index, analysis_record in sorted(analyses.items()):
                initial_grid = np.asarray(
                    round_detail.initial_states[seed_index].grid, dtype=np.int64,
                )
                collapsed = collapse_internal_grid(initial_grid)
                ground_truth = np.asarray(
                    analysis_record.analysis.ground_truth, dtype=np.float64,
                )
                h, w, c = ground_truth.shape

                # Compute local structural features
                seed_features = features.per_seed[seed_index]
                settlement_dist = seed_features.feature("settlement_proximity")
                coast = seed_features.feature("coast")
                forest_mask = (collapsed == 4).astype(np.float64)  # forest class

                # Count forest neighbors for each cell
                forest_neighbors = np.zeros((h, w), dtype=np.int64)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dy == 0 and dx == 0:
                            continue
                        sy = slice(max(0, -dy), min(h, h - dy))
                        sx = slice(max(0, -dx), min(w, w - dx))
                        ty = slice(max(0, dy), min(h, h + dy))
                        tx = slice(max(0, dx), min(w, w + dx))
                        forest_neighbors[ty, tx] += (collapsed[sy, sx] == 4).astype(np.int64)

                for y in range(h):
                    for x in range(w):
                        cell_class = int(collapsed[y, x])
                        prox_bucket = _settlement_proximity_bucket(float(settlement_dist[y, x]))
                        coast_flag = int(coast[y, x] > 0.5)
                        fn = int(forest_neighbors[y, x])
                        key = _build_cell_bucket_key(cell_class, prox_bucket, coast_flag, fn)
                        dist = ground_truth[y, x]
                        round_buckets[key].append(dist)
                        global_bucket_accum[key].append(dist)

            # Average per-round
            round_dist: dict[int, np.ndarray] = {}
            for key, dists in round_buckets.items():
                round_dist[key] = np.mean(np.stack(dists, axis=0), axis=0)
            round_bucket_dists[round_id] = round_dist

        # Global fallback
        global_bucket_dists: dict[int, np.ndarray] = {}
        for key, dists in global_bucket_accum.items():
            global_bucket_dists[key] = np.mean(np.stack(dists, axis=0), axis=0)

        # Build summary bank for kNN
        dataset_name = synthetic_dataset_name or f"{model_name}__synthetic_live"
        dataset = build_synthetic_live_dataset(
            paths,
            dataset_name=dataset_name,
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            round_ids=list(selected),
        )
        if dataset.index_path is None:
            raise ValueError("cell type transfer requires synthetic live dataset with index")

        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(selected),
        )

        round_summaries: dict[str, list[np.ndarray]] = defaultdict(list)
        for row in index_table.iter_rows(named=True):
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(
                episode_path,
                feature_variant=summary_feature_variant,
            )
            round_summaries[str(row["round_id"])].append(summary_vector)

        bank_round_ids: list[str] = []
        bank_vectors: list[np.ndarray] = []
        for rid in selected:
            if rid in round_summaries and round_summaries[rid]:
                mean_vec = np.mean(np.stack(round_summaries[rid], axis=0), axis=0)
                bank_round_ids.append(rid)
                bank_vectors.append(mean_vec)

        if not bank_vectors:
            raise ValueError("cell type transfer: no summary vectors found")

        bank_matrix = np.stack(bank_vectors, axis=0)
        smeans, sscales = _standardize(bank_matrix)
        normalized_bank = (bank_matrix - smeans[None, :]) / sscales[None, :]

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            round_bucket_dists=round_bucket_dists,
            global_bucket_dists=global_bucket_dists,
            bank_round_ids=bank_round_ids,
            bank_summary_matrix=normalized_bank,
            summary_means=smeans,
            summary_scales=sscales,
            k_neighbors=k_neighbors,
            prior_blend=prior_blend,
            probability_floor=probability_floor,
            summary_feature_variant=summary_feature_variant,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        # Find nearest rounds
        nearest_ids, blend_weights = self._find_nearest_rounds(evidence)

        # Pre-blend the round bucket distributions for the nearest rounds
        blended_buckets: dict[int, np.ndarray] = {}
        all_keys: set[int] = set()
        for rid in nearest_ids:
            if rid in self.round_bucket_dists:
                all_keys.update(self.round_bucket_dists[rid].keys())
        for key in all_keys:
            accum = np.zeros(CLASS_COUNT, dtype=np.float64)
            total_w = 0.0
            for j, rid in enumerate(nearest_ids):
                if rid in self.round_bucket_dists and key in self.round_bucket_dists[rid]:
                    accum += blend_weights[j] * self.round_bucket_dists[rid][key]
                    total_w += blend_weights[j]
            if total_w > 0:
                blended_buckets[key] = accum / total_w

        # Build per-cell predictions (vectorized)
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        predictions: dict[int, np.ndarray] = {}

        for seed_index in range(len(round_detail.initial_states)):
            initial_grid = np.asarray(
                round_detail.initial_states[seed_index].grid, dtype=np.int64,
            )
            collapsed = collapse_internal_grid(initial_grid)
            h, w = collapsed.shape

            seed_features = features.per_seed[seed_index]
            settlement_dist = seed_features.feature("settlement_proximity")
            coast = seed_features.feature("coast")

            # Vectorized forest neighbor count
            forest_mask = (collapsed == 4).astype(np.int64)
            forest_neighbors = np.zeros((h, w), dtype=np.int64)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    sy = slice(max(0, -dy), min(h, h - dy))
                    sx = slice(max(0, -dx), min(w, w - dx))
                    ty = slice(max(0, dy), min(h, h + dy))
                    tx = slice(max(0, dx), min(w, w + dx))
                    forest_neighbors[ty, tx] += forest_mask[sy, sx]

            # Vectorized bucket key computation (proximity: 0-1, higher=closer)
            prox_buckets = np.full((h, w), 4, dtype=np.int64)  # default: far
            prox_buckets[settlement_dist >= 0.9] = 0  # very close
            prox_buckets[(settlement_dist >= 0.7) & (settlement_dist < 0.9)] = 1
            prox_buckets[(settlement_dist >= 0.5) & (settlement_dist < 0.7)] = 2
            prox_buckets[(settlement_dist >= 0.3) & (settlement_dist < 0.5)] = 3

            coast_flags = (coast > 0.5).astype(np.int64)
            fn_capped = np.minimum(forest_neighbors, 8)

            keys = (
                collapsed.astype(np.int64) * 1000
                + prox_buckets * 100
                + coast_flags * 10
                + fn_capped
            )

            # Look up distributions for each cell
            transfer_pred = np.full((h, w, CLASS_COUNT), 1.0 / CLASS_COUNT, dtype=np.float64)
            unique_keys = np.unique(keys)
            for key in unique_keys:
                key_int = int(key)
                mask = keys == key
                if key_int in blended_buckets:
                    transfer_pred[mask] = blended_buckets[key_int]
                elif key_int in self.global_bucket_dists:
                    transfer_pred[mask] = self.global_bucket_dists[key_int]

            # Blend with prior
            prior_probs = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            blended = (1.0 - self.prior_blend) * transfer_pred + self.prior_blend * prior_probs
            predictions[seed_index] = apply_probability_floor(blended, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions,
        )

    def _find_nearest_rounds(
        self,
        evidence: RoundEvidenceBundle | None,
    ) -> tuple[list[str], np.ndarray]:
        """Find nearest rounds using kNN on transcript summaries."""
        if evidence is None or evidence.total_queries == 0 or self.bank_summary_matrix.shape[0] == 0:
            n = len(self.bank_round_ids)
            return list(self.bank_round_ids), np.ones(n, dtype=np.float64) / n

        summary = _summary_vector_from_evidence(
            evidence,
            feature_variant=self.summary_feature_variant,
        )
        normalized = (summary - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.bank_summary_matrix - normalized[None, :], axis=1)
        k = min(len(self.bank_round_ids), self.k_neighbors)
        order = np.argsort(distances)[:k]
        nearest_distances = distances[order]

        if np.max(nearest_distances) < 1e-12:
            weights = np.ones(k, dtype=np.float64) / k
        else:
            inv_dist = 1.0 / (nearest_distances + 1e-8)
            weights = inv_dist / np.sum(inv_dist)

        return [self.bank_round_ids[i] for i in order], weights
