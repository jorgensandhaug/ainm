from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank import (
    _cached_dataset_name,
    _round_ids_with_replays,
)
from astar.student.predictor.summary_bank_decoder import _round_ids_with_replays_and_analyses
from astar.student.predictor.summary_rate_decoder import _target_frame


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.std(features, axis=0)
    return means, np.maximum(scales, 1.0e-6)


def _sigmoid(values: np.ndarray | float) -> np.ndarray:
    return np.asarray(1.0 / (1.0 + np.exp(-np.clip(values, -25.0, 25.0))), dtype=np.float64)


def _local_mean(field: np.ndarray) -> np.ndarray:
    padded = np.pad(np.asarray(field, dtype=np.float64), 1, mode="constant", constant_values=0.0)
    total = (
        padded[:-2, :-2]
        + padded[:-2, 1:-1]
        + padded[:-2, 2:]
        + padded[1:-1, :-2]
        + padded[1:-1, 1:-1]
        + padded[1:-1, 2:]
        + padded[2:, :-2]
        + padded[2:, 1:-1]
        + padded[2:, 2:]
    )
    return total / 9.0


def _initial_tensor(grid: np.ndarray) -> np.ndarray:
    collapsed = np.asarray(collapse_internal_grid(np.asarray(grid, dtype=np.int64)), dtype=np.int64)
    probs = np.zeros(collapsed.shape + (6,), dtype=np.float64)
    for class_index in range(6):
        probs[:, :, class_index] = collapsed == class_index
    return probs


class SummaryRateRolloutPredictor(BaseRoundPredictor):
    name: str = "f1_summary_rate_rollout_birthcollapse_blend_v01"
    base_predictor: HistoricalBucketPriorPredictor
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    rate_target_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    target_family: str = "birth_collapse_portsplit"
    target_names: list[str] = Field(default_factory=list)
    k_neighbors: int = Field(default=7, ge=1)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"
    rollout_years: int = Field(default=50, ge=1)
    birth_scale: float = Field(default=0.16, ge=0.0)
    port_scale: float = Field(default=0.08, ge=0.0)
    collapse_scale: float = Field(default=0.14, ge=0.0)
    rebuild_scale: float = Field(default=0.11, ge=0.0)
    reclaim_scale: float = Field(default=0.08, ge=0.0)
    ruin_fade_scale: float = Field(default=0.02, ge=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)

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
        model_name: str = "f1_summary_rate_rollout_birthcollapse_blend_v01",
        probability_floor: float = 0.01,
        target_family: str = "birth_collapse_portsplit",
        synthetic_dataset_name: str | None = None,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        collapse_dataset_name: str = "f1_collapse_riskset_nr8_v1",
        summary_feature_variant: str = "basic",
        rollout_years: int = 50,
        birth_scale: float = 0.16,
        port_scale: float = 0.08,
        collapse_scale: float = 0.14,
        rebuild_scale: float = 0.11,
        reclaim_scale: float = 0.08,
        ruin_fade_scale: float = 0.02,
        prior_blend: float = 0.35,
    ) -> SummaryRateRolloutPredictor:
        selected_round_ids = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected_round_ids) < 2:
            raise ValueError("summary rate rollout requires at least two replay-backed analyzed rounds")

        target_frame = _target_frame(
            paths,
            round_ids=selected_round_ids,
            birth_dataset_name=birth_dataset_name,
            collapse_dataset_name=collapse_dataset_name,
            target_family=target_family,
        )
        target_names = [name for name in target_frame.columns if name != "round_id"]
        target_by_round = {
            str(row["round_id"]): np.asarray([row[name] for name in target_names], dtype=np.float64)
            for row in target_frame.iter_rows(named=True)
        }
        if len(target_by_round) < 2:
            raise ValueError("summary rate rollout requires targets for at least two rounds")

        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(target_by_round),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )

        dataset_round_ids = _round_ids_with_replays(paths)
        resolved_dataset_name = synthetic_dataset_name or _cached_dataset_name(
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            round_ids=dataset_round_ids,
        )
        dataset = build_synthetic_live_dataset(
            paths,
            policy_name=policy_name,
            round_ids=list(dataset_round_ids),
            samples_per_round=samples_per_round,
            dataset_name=resolved_dataset_name,
            budget=budget,
        )
        if dataset.index_path is None:
            raise ValueError("synthetic live dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(sorted(target_by_round)),
        )

        summary_vectors: list[np.ndarray] = []
        rate_vectors: list[np.ndarray] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(
                episode_path,
                feature_variant=summary_feature_variant,
            )
            summary_vectors.append(summary_vector)
            rate_vectors.append(target_by_round[round_id])
        if not summary_vectors:
            raise ValueError("summary rate rollout synthetic dataset is empty for selected rounds")
        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            rate_target_vectors=np.stack(rate_vectors, axis=0),
            summary_means=summary_means,
            summary_scales=summary_scales,
            target_family=target_family,
            target_names=target_names,
            k_neighbors=k_neighbors,
            probability_floor=probability_floor,
            summary_feature_variant=summary_feature_variant,
            rollout_years=rollout_years,
            birth_scale=birth_scale,
            port_scale=port_scale,
            collapse_scale=collapse_scale,
            rebuild_scale=rebuild_scale,
            reclaim_scale=reclaim_scale,
            ruin_fade_scale=ruin_fade_scale,
            prior_blend=prior_blend,
        )

    def infer_rate_vector(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return np.asarray(np.mean(self.rate_target_vectors, axis=0), dtype=np.float64)
        summary_vector = _summary_vector_from_evidence(
            evidence,
            feature_variant=self.summary_feature_variant,
        )
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.summary_vectors - normalized[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, self.summary_vectors.shape[0])]
        neighbor_distances = distances[order]
        weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
        weights = weights / np.sum(weights)
        return np.asarray(np.tensordot(weights, self.rate_target_vectors[order], axes=(0, 0)), dtype=np.float64)

    def _rate_dict(self, rate_vector: np.ndarray) -> dict[str, float]:
        return {
            target_name: float(rate_vector[index])
            for index, target_name in enumerate(self.target_names)
        }

    def _rollout_seed(
        self,
        seed_index: int,
        grid: np.ndarray,
        features: RoundFeatureBundle,
        rate_vector: np.ndarray,
    ) -> np.ndarray:
        probs = _initial_tensor(grid)
        seed_features = features.per_seed[seed_index]
        buildable = np.asarray(seed_features.feature("buildable"), dtype=np.float64)
        coast = np.asarray(seed_features.feature("coast"), dtype=np.float64)
        frontier = np.asarray(seed_features.feature("frontier_score"), dtype=np.float64)
        settlement_proximity = np.asarray(seed_features.feature("settlement_proximity"), dtype=np.float64)
        maritime = np.asarray(seed_features.feature("maritime_access"), dtype=np.float64)
        forest_density = np.asarray(seed_features.feature("forest_density"), dtype=np.float64)
        mountain_density = np.asarray(seed_features.feature("mountain_density"), dtype=np.float64)

        rate = self._rate_dict(rate_vector)
        birth_logit = float(rate.get("birth_logit_rate", -4.5))
        collapse_logit = float(rate.get("collapse_logit_rate", -3.5))
        collapse_port_logit = float(rate.get("collapse_logit_port", collapse_logit))
        collapse_nonport_logit = float(rate.get("collapse_logit_nonport", collapse_logit))
        port_share_logit = float(rate.get("collapse_pos_port_share_logit", 0.0))

        for _ in range(self.rollout_years):
            empty = np.asarray(probs[:, :, 0], dtype=np.float64)
            settlement = np.asarray(probs[:, :, 1], dtype=np.float64)
            port = np.asarray(probs[:, :, 2], dtype=np.float64)
            ruin = np.asarray(probs[:, :, 3], dtype=np.float64)
            forest = np.asarray(probs[:, :, 4], dtype=np.float64)
            mountain = np.asarray(probs[:, :, 5], dtype=np.float64)

            live = settlement + port
            live_neigh = _local_mean(live)
            port_neigh = _local_mean(port)
            ruin_neigh = _local_mean(ruin)
            forest_neigh = _local_mean(forest)

            birth_base = _sigmoid(
                birth_logit
                - 1.9
                + 3.6 * live_neigh
                + 1.4 * frontier
                + 1.0 * settlement_proximity
                + 0.4 * maritime
                - 1.0 * forest_density
                - 0.6 * ruin_neigh
            )
            birth_mass = empty * buildable * np.clip(self.birth_scale * birth_base, 0.0, 0.35)
            port_birth_share = _sigmoid(
                -2.2
                + 2.8 * coast
                + 1.8 * maritime
                + 1.4 * port_neigh
                + 0.6 * _sigmoid(port_share_logit)
            )
            birth_port = birth_mass * np.clip(port_birth_share, 0.0, 1.0)
            birth_settlement = birth_mass - birth_port

            portize_base = _sigmoid(
                -2.6
                + 2.8 * coast
                + 1.4 * maritime
                + 1.8 * port_neigh
                + 0.4 * live_neigh
            )
            portize_mass = settlement * np.clip(self.port_scale * portize_base, 0.0, 0.25)

            collapse_set_base = _sigmoid(
                collapse_nonport_logit
                - 2.7
                + 2.1 * ruin_neigh
                + 0.8 * live_neigh
                + 0.7 * (1.0 - frontier)
                + 0.5 * (1.0 - maritime)
                - 0.3 * forest_neigh
            )
            collapse_port_base = _sigmoid(
                collapse_port_logit
                - 2.8
                + 2.0 * ruin_neigh
                + 0.6 * live_neigh
                + 0.8 * (1.0 - maritime)
                - 0.3 * forest_neigh
            )
            settlement_collapse = settlement * np.clip(self.collapse_scale * collapse_set_base, 0.0, 0.4)
            port_collapse = port * np.clip(self.collapse_scale * collapse_port_base, 0.0, 0.4)

            rebuild_base = _sigmoid(
                -2.9
                + 4.0 * live_neigh
                + 1.0 * settlement_proximity
                + 0.8 * frontier
                + 0.5 * ruin_neigh
            )
            rebuild_mass = ruin * np.clip(self.rebuild_scale * rebuild_base, 0.0, 0.35)
            rebuild_port_share = _sigmoid(
                -2.3
                + 2.8 * coast
                + 1.5 * maritime
                + 1.4 * port_neigh
                + 0.5 * _sigmoid(port_share_logit)
            )
            rebuild_port = rebuild_mass * np.clip(rebuild_port_share, 0.0, 1.0)
            rebuild_settlement = rebuild_mass - rebuild_port

            ruin_remaining = np.clip(ruin - rebuild_mass, 0.0, 1.0)
            reclaim_base = _sigmoid(
                -2.7
                + 2.7 * forest_neigh
                + 0.4 * mountain_density
                - 1.4 * live_neigh
            )
            ruin_to_forest = ruin_remaining * np.clip(self.reclaim_scale * reclaim_base, 0.0, 0.25)
            ruin_remaining = np.clip(ruin_remaining - ruin_to_forest, 0.0, 1.0)
            ruin_to_empty = ruin_remaining * np.clip(self.ruin_fade_scale, 0.0, 0.1)

            next_empty = empty - birth_mass + ruin_to_empty
            next_settlement = settlement + birth_settlement + rebuild_settlement - portize_mass - settlement_collapse
            next_port = port + birth_port + rebuild_port + portize_mass - port_collapse
            next_ruin = ruin + settlement_collapse + port_collapse - rebuild_mass - ruin_to_forest - ruin_to_empty
            next_forest = forest + ruin_to_forest
            next_mountain = mountain

            probs = np.stack(
                [
                    np.clip(next_empty, 0.0, 1.0),
                    np.clip(next_settlement, 0.0, 1.0),
                    np.clip(next_port, 0.0, 1.0),
                    np.clip(next_ruin, 0.0, 1.0),
                    np.clip(next_forest, 0.0, 1.0),
                    np.clip(next_mountain, 0.0, 1.0),
                ],
                axis=-1,
            )
            sums = np.clip(np.sum(probs, axis=-1, keepdims=True), 1.0e-6, None)
            probs = probs / sums
            probs[:, :, 5] = mountain
            movable = np.clip(1.0 - mountain, 1.0e-6, 1.0)
            probs[:, :, :5] = probs[:, :, :5] / np.sum(probs[:, :, :5], axis=-1, keepdims=True).clip(1.0e-6, None)
            probs[:, :, :5] *= movable[:, :, None]
            probs[:, :, 5] = mountain

        return probs

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        rate_vector = self.infer_rate_vector(evidence)
        base_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        round_context = build_round_context_from_detail(round_detail)
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed in round_context.seeds:
            rollout_prediction = self._rollout_seed(
                seed.seed_index,
                seed.initial_state.grid,
                features,
                rate_vector,
            )
            prediction = rollout_prediction
            if self.prior_blend > 0.0:
                base = np.asarray(base_bundle.predictions_by_seed[seed.seed_index], dtype=np.float64)
                prediction = (1.0 - self.prior_blend) * rollout_prediction + self.prior_blend * base
            predictions_by_seed[seed.seed_index] = apply_probability_floor(
                np.asarray(prediction, dtype=np.float64),
                self.probability_floor,
            )
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["SummaryRateRolloutPredictor"]
