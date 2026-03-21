from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import collapse_internal_grid
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.hazard_riskset import build_hazard_riskset_dataset
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
from astar.student.predictor.heuristic import EventStructuralPriorPredictor, _neighbor_count
from astar.student.predictor.round import BaseRoundPredictor


def _round_ids_with_replays(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    available = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if round_ids is None:
        return available
    return [round_id for round_id in round_ids if round_id in available]


def _round_scope_token(round_ids: Sequence[str]) -> str:
    normalized = sorted(set(round_ids))
    digest = hashlib.sha1(",".join(normalized).encode("utf-8")).hexdigest()[:10]
    return f"n={len(normalized)}__sha1={digest}"


def _cached_dataset_name(
    *,
    policy_name: str,
    budget: int,
    samples_per_round: int,
    round_ids: Sequence[str],
) -> str:
    return (
        f"f1_birth_posterior_synth__policy={policy_name.strip().lower()}"
        f"__budget={budget}__samples={samples_per_round}"
        f"__rounds={_round_scope_token(round_ids)}"
    )


def _weighted_positive_rate(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.group_by("round_id").agg(
        (
            (
                pl.col("label").cast(pl.Float64, strict=False)
                * pl.col("sample_weight").cast(pl.Float64, strict=False)
            ).sum()
            / pl.col("sample_weight").cast(pl.Float64, strict=False).sum()
        ).alias("positive_rate"),
    )


def _logit(value: float) -> float:
    clipped = float(np.clip(value, 1.0e-4, 1.0 - 1.0e-4))
    return float(np.log(clipped / (1.0 - clipped)))


def _round_birth_target_frame(
    paths: WorkspacePaths,
    *,
    birth_dataset_name: str,
) -> pl.DataFrame:
    birth_dir = paths.dataset_dir(birth_dataset_name)
    riskset_path = birth_dir / "riskset.parquet"
    if not riskset_path.exists():
        build_hazard_riskset_dataset(
            paths,
            event_type="birth",
            dataset_name=birth_dataset_name,
            negative_ratio=8.0,
        )
    return (
        _weighted_positive_rate(
            pl.read_parquet(
                riskset_path,
                columns=["round_id", "label", "sample_weight"],
            ),
        )
        .with_columns(
            pl.col("positive_rate")
            .map_elements(_logit, return_dtype=pl.Float64)
            .alias("birth_logit_rate"),
        )
        .select("round_id", "birth_logit_rate")
        .sort("round_id")
    )


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.maximum(np.std(features, axis=0), 1.0e-6)
    return means, scales


def _knn_scalar_predict(
    train_x: np.ndarray,
    train_y: np.ndarray,
    query_x: np.ndarray,
    *,
    k_neighbors: int,
) -> float:
    distances = np.linalg.norm(train_x - query_x[None, :], axis=1)
    order = np.argsort(distances)[: min(k_neighbors, train_x.shape[0])]
    neighbor_distances = distances[order]
    weights = 1.0 / np.clip(neighbor_distances, 1.0e-6, None)
    weights = weights / np.sum(weights)
    return float(np.tensordot(weights, train_y[order], axes=(0, 0)))


class BirthPosteriorEventPredictor(BaseRoundPredictor):
    name: str = "f1_birth_posterior_event_b50s4k7_v01"
    base_predictor: EventStructuralPriorPredictor = Field(
        default_factory=EventStructuralPriorPredictor,
    )
    summary_vectors: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    birth_targets: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    birth_center: float = 0.0
    birth_target_scale: float = 1.0
    reference_budget: int = Field(default=50, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    birth_signal_scale: float = Field(default=1.0, gt=0.0)
    birth_gain: float = Field(default=1.0, gt=0.0)
    maritime_from_birth: float = Field(default=0.0, ge=0.0)
    probability_floor: float = Field(default=0.02, gt=0.0, lt=1.0)

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
        birth_signal_scale: float = 1.0,
        birth_gain: float = 1.0,
        maritime_from_birth: float = 0.0,
        model_name: str = "f1_birth_posterior_event_b50s4k7_v01",
        probability_floor: float = 0.02,
        birth_dataset_name: str = "f1_birth_riskset_nr8_v1",
        synthetic_dataset_name: str | None = None,
    ) -> BirthPosteriorEventPredictor:
        selected_round_ids = _round_ids_with_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("birth posterior predictor requires replay-backed rounds")
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
            pl.col("round_id").is_in(selected_round_ids),
        )
        if index_table.is_empty():
            raise ValueError("birth posterior synthetic dataset is empty for selected rounds")

        birth_targets_by_round = {
            str(row["round_id"]): float(row["birth_logit_rate"])
            for row in _round_birth_target_frame(
                paths,
                birth_dataset_name=birth_dataset_name,
            ).iter_rows(named=True)
        }
        summary_vectors: list[np.ndarray] = []
        birth_targets: list[float] = []
        for row in index_table.iter_rows(named=True):
            round_id = str(row["round_id"])
            if round_id not in birth_targets_by_round:
                continue
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, _ = _summary_vector_from_artifact(episode_path)
            summary_vectors.append(summary_vector)
            birth_targets.append(birth_targets_by_round[round_id])
        if not summary_vectors:
            raise ValueError("birth posterior predictor found no matching synthetic examples")

        summary_stack = np.stack(summary_vectors, axis=0)
        summary_means, summary_scales = _standardize(summary_stack)
        birth_target_array = np.asarray(birth_targets, dtype=np.float64)
        return cls(
            name=model_name,
            base_predictor=EventStructuralPriorPredictor(probability_floor=probability_floor),
            summary_vectors=(summary_stack - summary_means[None, :]) / summary_scales[None, :],
            birth_targets=birth_target_array,
            summary_means=summary_means,
            summary_scales=summary_scales,
            birth_center=float(np.mean(birth_target_array)),
            birth_target_scale=max(float(np.std(birth_target_array)), 1.0e-6),
            reference_budget=budget,
            k_neighbors=k_neighbors,
            birth_signal_scale=birth_signal_scale,
            birth_gain=birth_gain,
            maritime_from_birth=maritime_from_birth,
            probability_floor=probability_floor,
        )

    def infer_birth_signal(self, evidence: RoundEvidenceBundle | None) -> float:
        if evidence is None or evidence.total_queries == 0 or self.summary_vectors.shape[0] == 0:
            return 0.0
        summary_vector = _summary_vector_from_evidence(evidence)
        normalized = (summary_vector - self.summary_means) / self.summary_scales
        predicted_birth_logit = _knn_scalar_predict(
            self.summary_vectors,
            self.birth_targets,
            normalized,
            k_neighbors=self.k_neighbors,
        )
        centered = (predicted_birth_logit - self.birth_center) / (
            self.birth_target_scale * self.birth_signal_scale
        )
        query_fraction = min(1.0, float(evidence.total_queries) / float(self.reference_budget))
        return float(np.clip(centered * query_fraction, -1.0, 1.0) * self.birth_gain)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        base_predictions = self.base_predictor.build_prediction_bundle(round_detail, features)
        if evidence is None or evidence.total_queries == 0:
            return PredictionBundle(
                round_id=round_detail.id,
                model_name=self.name,
                predictions_by_seed=base_predictions.predictions_by_seed,
            )

        birth_signal = self.infer_birth_signal(evidence)
        maritime_signal = birth_signal * self.maritime_from_birth
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index, initial_state in enumerate(round_detail.initial_states):
            base_prediction = base_predictions.predictions_by_seed[seed_index]
            seed_features = features.per_seed[seed_index]
            scored_grid = collapse_internal_grid(np.asarray(initial_state.grid, dtype=np.int64))

            buildable = seed_features.feature("buildable")
            settlement_proximity = seed_features.feature("settlement_proximity")
            coastal_exposure = seed_features.feature("coastal_exposure")
            maritime_access = seed_features.feature("maritime_access")

            settlement_neighbors = _neighbor_count(scored_grid == 1).astype(np.float64) / 9.0
            port_neighbors = _neighbor_count(scored_grid == 2).astype(np.float64) / 9.0
            ruin_neighbors = _neighbor_count(scored_grid == 3).astype(np.float64) / 9.0

            birth_mask = buildable * (~np.isin(scored_grid, (1, 2, 3))).astype(np.float64)
            birth_support = birth_mask * (
                0.95 * settlement_proximity
                + 0.70 * settlement_neighbors
                + 0.35 * port_neighbors
                + 0.20 * ruin_neighbors
            )
            maritime_support = birth_mask * (
                0.90 * coastal_exposure * maritime_access
                + 0.50 * port_neighbors
                + 0.20 * settlement_proximity
            )

            logits = np.log(np.maximum(base_prediction, 1.0e-6))
            logits[..., 1] += birth_signal * birth_support
            logits[..., 2] += maritime_signal * maritime_support
            logits[..., 0] -= 0.35 * birth_signal * birth_mask

            shifted = logits - np.max(logits, axis=-1, keepdims=True)
            probabilities = np.exp(shifted)
            predictions_by_seed[seed_index] = apply_probability_floor(
                probabilities / np.sum(probabilities, axis=-1, keepdims=True),
                self.probability_floor,
            )

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = ["BirthPosteriorEventPredictor"]
