"""Direct terminal tensor retrieval predictor.

Bypasses all decoders entirely. For each held-out round:
1. Build per-round mean summary vectors from synthetic-live transcripts.
2. At prediction time, use kNN on the transcript summary to find closest
   historical round(s).
3. Retrieve the actual ground-truth analysis tensors from those rounds.
4. Blend them (distance-weighted) as the prediction.

Optionally blend with the historical bucket prior for safety.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records
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


class TerminalRetrievalPredictor(BaseRoundPredictor):
    """Retrieve actual terminal distributions from nearest historical rounds."""

    name: str = "f1_terminal_retrieval_v01"
    base_predictor: HistoricalBucketPriorPredictor

    # Per-round, per-seed analysis tensors: round_id -> seed_index -> (H, W, C)
    terminal_bank: dict[str, dict[int, np.ndarray]] = Field(default_factory=dict)
    # Cross-round mean terminal tensor per seed: seed_index -> (H, W, C)
    mean_terminal: dict[int, np.ndarray] = Field(default_factory=dict)

    # kNN bank: per-round mean summary vectors
    bank_round_ids: list[str] = Field(default_factory=list)
    bank_summary_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    k_neighbors: int = Field(default=7, ge=1)
    prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
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
        model_name: str = "f1_terminal_retrieval_v01",
        probability_floor: float = 0.01,
        prior_blend: float = 0.0,
        summary_feature_variant: str = "basic",
        synthetic_dataset_name: str | None = None,
    ) -> TerminalRetrievalPredictor:
        selected = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected) < 2:
            raise ValueError("terminal retrieval requires at least two analyzed rounds")

        # Build historical bucket prior (for optional blending)
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )

        # Load all analysis tensors (ground truth year-50 distributions)
        terminal_bank: dict[str, dict[int, np.ndarray]] = {}
        all_seed_tensors: dict[int, list[np.ndarray]] = defaultdict(list)

        for round_id in selected:
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            round_tensors: dict[int, np.ndarray] = {}
            for seed_index, analysis_record in sorted(analyses.items()):
                gt = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                round_tensors[seed_index] = gt
                all_seed_tensors[seed_index].append(gt)
            terminal_bank[round_id] = round_tensors

        # Cross-round mean for fallback
        mean_terminal: dict[int, np.ndarray] = {}
        for seed_index, tensors in all_seed_tensors.items():
            mean_terminal[seed_index] = np.mean(np.stack(tensors, axis=0), axis=0)

        # Build per-round mean summary vectors from synthetic-live transcripts
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
            raise ValueError("terminal retrieval requires synthetic live dataset with index")

        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(selected),
        )

        # Collect per-round summary vectors and average per round
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

        # Build bank: one mean summary per round
        bank_round_ids: list[str] = []
        bank_vectors: list[np.ndarray] = []
        for rid in selected:
            if rid in round_summaries and round_summaries[rid]:
                mean_vec = np.mean(np.stack(round_summaries[rid], axis=0), axis=0)
                bank_round_ids.append(rid)
                bank_vectors.append(mean_vec)

        if not bank_vectors:
            raise ValueError("terminal retrieval: no summary vectors found")

        bank_matrix = np.stack(bank_vectors, axis=0)
        summary_means, summary_scales = _standardize(bank_matrix)
        normalized_bank = (bank_matrix - summary_means[None, :]) / summary_scales[None, :]

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            terminal_bank=terminal_bank,
            mean_terminal=mean_terminal,
            bank_round_ids=bank_round_ids,
            bank_summary_matrix=normalized_bank,
            summary_means=summary_means,
            summary_scales=summary_scales,
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
        # Find nearest rounds using transcript summary kNN
        retrieval_predictions = self._retrieve_and_blend(round_detail, features, evidence)

        # Optionally blend with historical bucket prior
        if self.prior_blend > 0.0:
            prior_bundle = self.base_predictor.build_prediction_bundle(
                round_detail, features,
            )
            blended: dict[int, np.ndarray] = {}
            for seed_index in retrieval_predictions:
                retrieved = retrieval_predictions[seed_index]
                prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
                raw = (1.0 - self.prior_blend) * retrieved + self.prior_blend * prior
                blended[seed_index] = apply_probability_floor(raw, self.probability_floor)
            return PredictionBundle(
                round_id=round_detail.id,
                model_name=self.name,
                predictions_by_seed=blended,
            )

        floored: dict[int, np.ndarray] = {}
        for seed_index, pred in retrieval_predictions.items():
            floored[seed_index] = apply_probability_floor(pred, self.probability_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=floored,
        )

    def _retrieve_and_blend(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None,
    ) -> dict[int, np.ndarray]:
        """Retrieve terminal tensors from nearest rounds and blend them."""
        # Build summary vector from live evidence
        if evidence is not None and evidence.total_queries > 0 and self.bank_summary_matrix.shape[0] > 0:
            summary_vector = _summary_vector_from_evidence(
                evidence,
                feature_variant=self.summary_feature_variant,
            )
            normalized = (summary_vector - self.summary_means) / self.summary_scales
            distances = np.linalg.norm(
                self.bank_summary_matrix - normalized[None, :], axis=1,
            )
            k = min(len(self.bank_round_ids), self.k_neighbors)
            order = np.argsort(distances)[:k]
            nearest_distances = distances[order]

            # Distance-weighted blending
            if np.max(nearest_distances) < 1e-12:
                blend_weights = np.ones(k, dtype=np.float64) / k
            else:
                inv_dist = 1.0 / (nearest_distances + 1e-8)
                blend_weights = inv_dist / np.sum(inv_dist)

            nearest_round_ids = [self.bank_round_ids[i] for i in order]
        else:
            # No evidence: uniform blend of all rounds
            nearest_round_ids = list(self.bank_round_ids)
            blend_weights = np.ones(len(nearest_round_ids), dtype=np.float64) / len(nearest_round_ids)

        # Blend terminal tensors from nearest rounds
        result: dict[int, np.ndarray] = {}
        seed_count = len(round_detail.initial_states)

        for seed_index in range(seed_count):
            accum = None
            total_weight = 0.0
            for j, rid in enumerate(nearest_round_ids):
                if rid in self.terminal_bank and seed_index in self.terminal_bank[rid]:
                    tensor = self.terminal_bank[rid][seed_index]
                    w = blend_weights[j]
                    if accum is None:
                        accum = w * tensor.copy()
                    else:
                        accum += w * tensor
                    total_weight += w

            if accum is not None and total_weight > 0:
                result[seed_index] = accum / total_weight
            elif seed_index in self.mean_terminal:
                result[seed_index] = self.mean_terminal[seed_index].copy()
            else:
                h, w = round_detail.map_height, round_detail.map_width
                result[seed_index] = np.full(
                    (h, w, CLASS_COUNT), 1.0 / CLASS_COUNT, dtype=np.float64,
                )

        return result
