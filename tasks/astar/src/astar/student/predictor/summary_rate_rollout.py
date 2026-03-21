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


def _masked_mean(values: np.ndarray, mask: np.ndarray) -> float:
    selected = np.asarray(values, dtype=np.float64)[np.asarray(mask, dtype=bool)]
    if selected.size == 0:
        return 0.0
    return float(np.mean(selected))


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
    rollout_variant: str = "basic"

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
        rollout_variant: str = "basic",
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
            rollout_variant=rollout_variant,
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
        if self.rollout_variant == "stateful_hidden":
            return self._rollout_seed_stateful(
                seed_index,
                grid,
                features,
                rate_vector,
            )
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
        collapse_port_gap_logit = float(rate.get("collapse_port_gap_logit", 0.0))
        collapse_port_logit = float(
            rate.get("collapse_logit_port", collapse_logit + 0.5 * collapse_port_gap_logit),
        )
        collapse_nonport_logit = float(
            rate.get("collapse_logit_nonport", collapse_logit - 0.5 * collapse_port_gap_logit),
        )
        port_share_logit = float(rate.get("collapse_pos_port_share_logit", 0.0))
        collapse_food_gap_z = float(rate.get("collapse_food_gap_z", 0.0))
        collapse_defense_gap_z = float(rate.get("collapse_defense_gap_z", 0.0))
        collapse_timing_skew = float(rate.get("collapse_timing_skew", 0.0))
        target_ruin_buildable = float(rate.get("ruin_buildable_mean", 0.0))
        target_ruin_coast = float(rate.get("ruin_coast_mean", target_ruin_buildable))
        target_port_coast = float(rate.get("port_coast_mean", 0.0))
        target_live_buildable = float(rate.get("live_buildable_mean", 0.0))
        has_terminal_controls = all(
            name in rate
            for name in (
                "ruin_buildable_mean",
                "ruin_coast_mean",
                "port_coast_mean",
                "live_buildable_mean",
            )
        )
        buildable_mask = buildable > 0.5
        coastal_buildable_mask = buildable_mask & (coast > 0.5)
        stress = np.zeros_like(buildable, dtype=np.float64)
        fragility = float(
            _sigmoid(
                np.asarray(
                    0.9 * collapse_food_gap_z
                    - 0.6 * collapse_defense_gap_z
                    + 0.4 * collapse_logit
                    + 0.25 * collapse_port_gap_logit,
                    dtype=np.float64,
                ),
            )[()],
        )

        for year_index in range(self.rollout_years):
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
            live_scale = self.birth_scale
            port_scale = self.port_scale
            collapse_scale = self.collapse_scale
            rebuild_scale = self.rebuild_scale
            reclaim_scale = self.reclaim_scale

            if has_terminal_controls:
                current_live_buildable = _masked_mean(live, buildable_mask)
                current_ruin_buildable = _masked_mean(ruin, buildable_mask)
                current_ruin_coast = _masked_mean(ruin, coastal_buildable_mask)
                current_port_coast = _masked_mean(port, coastal_buildable_mask)
                live_gap = target_live_buildable - current_live_buildable
                ruin_gap = target_ruin_buildable - current_ruin_buildable
                ruin_coast_gap = target_ruin_coast - current_ruin_coast
                port_coast_gap = target_port_coast - current_port_coast
                year_phase = (year_index + 0.5) / float(self.rollout_years)
                timing_drive = _sigmoid(
                    np.asarray(
                        2.0 * collapse_timing_skew * (0.5 - year_phase),
                        dtype=np.float64,
                    ),
                )[()]
                stress = np.clip(
                    0.82 * stress
                    + (0.20 + 0.80 * fragility * timing_drive)
                    * (
                        0.80 * ruin_neigh
                        + 0.55 * live_neigh
                        + 0.25 * (1.0 - frontier)
                        + 0.20 * (1.0 - maritime)
                    )
                    + 0.25 * max(0.0, -live_gap)
                    + 0.20 * max(0.0, ruin_gap)
                    - 0.18 * forest_neigh,
                    0.0,
                    2.5,
                )
                live_scale = float(
                    np.clip(
                        self.birth_scale * np.exp(1.8 * live_gap - 0.9 * ruin_gap),
                        0.01,
                        0.35,
                    ),
                )
                port_scale = float(
                    np.clip(
                        self.port_scale * np.exp(1.7 * port_coast_gap),
                        0.01,
                        0.25,
                    ),
                )
                collapse_scale = float(
                    np.clip(
                        self.collapse_scale
                        * np.exp(-2.0 * live_gap + 1.8 * ruin_gap + 0.8 * ruin_coast_gap),
                        0.02,
                        0.45,
                    ),
                )
                rebuild_scale = float(
                    np.clip(
                        self.rebuild_scale
                        * np.exp(1.1 * live_gap - 1.8 * ruin_gap - 0.6 * ruin_coast_gap),
                        0.01,
                        0.35,
                    ),
                )
                reclaim_scale = float(
                    np.clip(
                        self.reclaim_scale * np.exp(1.0 * max(0.0, ruin_gap)),
                        0.01,
                        0.20,
                    ),
                )

            birth_base = _sigmoid(
                birth_logit
                - 1.9
                + 3.6 * live_neigh
                + 1.4 * frontier
                + 1.0 * settlement_proximity
                + 0.4 * maritime
                - 1.0 * forest_density
                - 0.6 * ruin_neigh
                - 1.1 * stress
            )
            birth_mass = empty * buildable * np.clip(live_scale * birth_base, 0.0, 0.35)
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
                - 0.5 * stress
            )
            portize_mass = settlement * np.clip(port_scale * portize_base, 0.0, 0.25)

            collapse_set_base = _sigmoid(
                collapse_nonport_logit
                - 2.7
                + 2.1 * ruin_neigh
                + 0.8 * live_neigh
                + 0.7 * (1.0 - frontier)
                + 0.5 * (1.0 - maritime)
                - 0.3 * forest_neigh
                + 2.8 * stress
            )
            collapse_port_base = _sigmoid(
                collapse_port_logit
                - 2.8
                + 2.0 * ruin_neigh
                + 0.6 * live_neigh
                + 0.8 * (1.0 - maritime)
                - 0.3 * forest_neigh
                + 2.5 * stress
            )
            settlement_collapse = settlement * np.clip(collapse_scale * collapse_set_base, 0.0, 0.4)
            port_collapse = port * np.clip(collapse_scale * collapse_port_base, 0.0, 0.4)

            rebuild_base = _sigmoid(
                -2.9
                + 4.0 * live_neigh
                + 1.0 * settlement_proximity
                + 0.8 * frontier
                + 0.5 * ruin_neigh
                - 1.4 * stress
            )
            rebuild_mass = ruin * np.clip(rebuild_scale * rebuild_base, 0.0, 0.35)
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
                + 0.4 * stress
            )
            ruin_to_forest = ruin_remaining * np.clip(reclaim_scale * reclaim_base, 0.0, 0.25)
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

    def _rollout_seed_stateful(
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
        buildable_mask = buildable > 0.5
        coastal_buildable_mask = buildable_mask & (coast > 0.5)

        rate = self._rate_dict(rate_vector)
        birth_logit = float(rate.get("birth_logit_rate", -4.5))
        collapse_logit = float(rate.get("collapse_logit_rate", -3.5))
        collapse_port_gap_logit = float(rate.get("collapse_port_gap_logit", 0.0))
        collapse_port_logit = collapse_logit + 0.5 * collapse_port_gap_logit
        collapse_nonport_logit = collapse_logit - 0.5 * collapse_port_gap_logit
        collapse_food_gap_z = float(rate.get("collapse_food_gap_z", 0.0))
        collapse_defense_gap_z = float(rate.get("collapse_defense_gap_z", 0.0))
        collapse_timing_skew = float(rate.get("collapse_timing_skew", 0.0))
        target_ruin_buildable = float(rate.get("ruin_buildable_mean", 0.0))
        target_ruin_coast = float(rate.get("ruin_coast_mean", target_ruin_buildable))
        target_port_coast = float(rate.get("port_coast_mean", 0.0))
        target_live_buildable = float(rate.get("live_buildable_mean", 0.0))

        live0 = np.asarray(probs[:, :, 1] + probs[:, :, 2], dtype=np.float64)
        population = live0 * (0.45 + 0.30 * settlement_proximity + 0.15 * frontier)
        food = live0 * (0.55 + 0.20 * forest_density + 0.12 * frontier + 0.10 * maritime)
        wealth = live0 * (0.40 + 0.28 * maritime + 0.14 * coast + 0.10 * frontier)
        defense = live0 * (0.42 + 0.20 * mountain_density + 0.10 * coast)
        stress = np.zeros_like(buildable, dtype=np.float64)
        fragility = float(
            _sigmoid(
                np.asarray(
                    0.9 * collapse_food_gap_z
                    - 0.7 * collapse_defense_gap_z
                    + 0.4 * collapse_logit,
                    dtype=np.float64,
                ),
            )[()],
        )

        for year_index in range(self.rollout_years):
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

            current_live_buildable = _masked_mean(live, buildable_mask)
            current_ruin_buildable = _masked_mean(ruin, buildable_mask)
            current_ruin_coast = _masked_mean(ruin, coastal_buildable_mask)
            current_port_coast = _masked_mean(port, coastal_buildable_mask)
            live_gap = target_live_buildable - current_live_buildable
            ruin_gap = target_ruin_buildable - current_ruin_buildable
            ruin_coast_gap = target_ruin_coast - current_ruin_coast
            port_coast_gap = target_port_coast - current_port_coast

            year_phase = (year_index + 0.5) / float(self.rollout_years)
            timing_drive = float(
                _sigmoid(
                    np.asarray(
                        2.1 * collapse_timing_skew * (0.5 - year_phase),
                        dtype=np.float64,
                    ),
                )[()],
            )
            winter_shock = 0.10 + 0.16 * fragility * timing_drive
            food_deficit = np.maximum(-food, 0.0)
            prosperity = np.clip(0.55 * food + 0.35 * wealth + 0.18 * population - 0.60 * stress, -2.0, 2.0)

            food = np.clip(
                0.78 * food
                + live * (
                    0.14
                    + 0.14 * forest_neigh
                    + 0.10 * frontier
                    + 0.06 * maritime
                    + 0.04 * port_neigh
                )
                - live * (0.12 + 0.18 * population + winter_shock),
                -1.5,
                2.5,
            )
            wealth = np.clip(
                0.84 * wealth
                + live * (0.05 + 0.12 * maritime + 0.10 * port_neigh + 0.05 * live_neigh)
                - 0.05 * stress,
                -1.0,
                2.5,
            )
            defense = np.clip(
                0.86 * defense
                + live * (0.05 + 0.10 * wealth + 0.06 * mountain_density + 0.04 * coast)
                - 0.04 * stress,
                -1.0,
                2.5,
            )
            population = np.clip(
                0.88 * population
                + live * (0.04 + 0.10 * np.maximum(food, 0.0) + 0.05 * wealth),
                0.0,
                2.5,
            )
            stress = np.clip(
                0.82 * stress
                + 1.00 * food_deficit
                + 0.45 * ruin_neigh
                + 0.15 * np.maximum(-defense, 0.0)
                + 0.10 * np.maximum(-wealth, 0.0)
                + 0.10 * max(0.0, ruin_gap)
                - 0.10 * forest_neigh,
                0.0,
                3.0,
            )

            birth_scale = float(
                np.clip(
                    self.birth_scale * np.exp(1.4 * live_gap - 0.6 * ruin_gap),
                    0.01,
                    0.35,
                ),
            )
            port_scale = float(
                np.clip(
                    self.port_scale * np.exp(1.5 * port_coast_gap),
                    0.01,
                    0.25,
                ),
            )
            collapse_scale = float(
                np.clip(
                    self.collapse_scale
                    * np.exp(-1.6 * live_gap + 1.5 * ruin_gap + 0.6 * ruin_coast_gap),
                    0.02,
                    0.45,
                ),
            )
            rebuild_scale = float(
                np.clip(
                    self.rebuild_scale
                    * np.exp(0.9 * live_gap - 1.6 * ruin_gap - 0.5 * ruin_coast_gap),
                    0.01,
                    0.35,
                ),
            )
            reclaim_scale = float(
                np.clip(
                    self.reclaim_scale * np.exp(0.8 * max(0.0, ruin_gap)),
                    0.01,
                    0.20,
                ),
            )

            birth_base = _sigmoid(
                birth_logit
                - 2.2
                + 2.6 * prosperity
                + 1.6 * live_neigh
                + 0.7 * maritime
                + 0.5 * frontier
                - 0.8 * forest_density
                - 0.9 * stress
            )
            birth_mass = empty * buildable * np.clip(birth_scale * birth_base, 0.0, 0.35)
            port_birth_share = _sigmoid(
                -2.4
                + 2.9 * coast
                + 1.9 * maritime
                + 1.5 * port_neigh
                + 2.5 * port_coast_gap
            )
            birth_port = birth_mass * np.clip(port_birth_share, 0.0, 1.0)
            birth_settlement = birth_mass - birth_port

            portize_base = _sigmoid(
                -2.7
                + 2.8 * coast
                + 1.5 * maritime
                + 1.6 * port_neigh
                + 0.8 * wealth
                - 0.5 * stress
            )
            portize_mass = settlement * np.clip(port_scale * portize_base, 0.0, 0.25)

            collapse_set_base = _sigmoid(
                collapse_nonport_logit
                - 2.9
                + 2.4 * stress
                + 1.2 * food_deficit
                + 0.6 * ruin_neigh
                + 0.4 * np.maximum(-defense, 0.0)
                - 0.2 * wealth
            )
            collapse_port_base = _sigmoid(
                collapse_port_logit
                - 3.0
                + 2.2 * stress
                + 1.1 * food_deficit
                + 0.5 * ruin_neigh
                + 0.3 * np.maximum(-defense, 0.0)
                + 0.2 * (1.0 - maritime)
            )
            settlement_collapse = settlement * np.clip(collapse_scale * collapse_set_base, 0.0, 0.45)
            port_collapse = port * np.clip(collapse_scale * collapse_port_base, 0.0, 0.45)

            rebuild_base = _sigmoid(
                -3.1
                + 2.2 * prosperity
                + 2.6 * live_neigh
                + 0.7 * settlement_proximity
                - 1.5 * stress
            )
            rebuild_mass = ruin * np.clip(rebuild_scale * rebuild_base, 0.0, 0.35)
            rebuild_port_share = _sigmoid(
                -2.5
                + 2.8 * coast
                + 1.6 * maritime
                + 1.5 * port_neigh
                + 2.3 * port_coast_gap
            )
            rebuild_port = rebuild_mass * np.clip(rebuild_port_share, 0.0, 1.0)
            rebuild_settlement = rebuild_mass - rebuild_port

            ruin_remaining = np.clip(ruin - rebuild_mass, 0.0, 1.0)
            reclaim_base = _sigmoid(
                -2.7
                + 2.5 * forest_neigh
                + 0.4 * mountain_density
                - 1.2 * live_neigh
                + 0.3 * stress
            )
            ruin_to_forest = ruin_remaining * np.clip(reclaim_scale * reclaim_base, 0.0, 0.25)
            ruin_remaining = np.clip(ruin_remaining - ruin_to_forest, 0.0, 1.0)
            ruin_to_empty = ruin_remaining * np.clip(self.ruin_fade_scale, 0.0, 0.1)

            next_empty = empty - birth_mass + ruin_to_empty
            next_settlement = settlement + birth_settlement + rebuild_settlement - portize_mass - settlement_collapse
            next_port = port + birth_port + rebuild_port + portize_mass - port_collapse
            next_ruin = ruin + settlement_collapse + port_collapse - rebuild_mass - ruin_to_forest - ruin_to_empty
            next_forest = forest + ruin_to_forest
            next_mountain = mountain

            surviving_live = np.clip((settlement - settlement_collapse) + (port - port_collapse), 0.0, 1.0)
            newcomer_live = birth_mass + rebuild_mass
            next_live = np.clip(next_settlement + next_port, 0.0, 1.0)
            denominator = np.clip(next_live, 1.0e-6, None)
            population = ((population * surviving_live) + newcomer_live * (0.35 + 0.20 * settlement_proximity)) / denominator
            food = ((np.maximum(food, 0.0) * surviving_live) + newcomer_live * (0.30 + 0.10 * frontier)) / denominator
            wealth = ((np.maximum(wealth, 0.0) * surviving_live) + newcomer_live * (0.22 + 0.12 * maritime)) / denominator
            defense = ((np.maximum(defense, 0.0) * surviving_live) + newcomer_live * (0.24 + 0.10 * mountain_density)) / denominator
            stress = np.clip((stress * surviving_live + ruin * stress + 0.25 * newcomer_live) / np.clip(surviving_live + ruin + newcomer_live, 1.0e-6, None), 0.0, 3.0)
            population = np.where(next_live > 1.0e-5, np.clip(population, 0.0, 2.5), 0.0)
            food = np.where(next_live > 1.0e-5, np.clip(food, -1.0, 2.5), 0.0)
            wealth = np.where(next_live > 1.0e-5, np.clip(wealth, -1.0, 2.5), 0.0)
            defense = np.where(next_live > 1.0e-5, np.clip(defense, -1.0, 2.5), 0.0)

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
