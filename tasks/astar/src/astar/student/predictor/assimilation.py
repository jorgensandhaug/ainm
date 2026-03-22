from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import score_prediction
from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.student.posterior.state_space_student import StateSpaceStudent
from astar.student.posterior.transcript_artifacts import (
    round_detail_from_artifact,
    terminal_targets_from_artifact,
)
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.teacher.regime.base import RegimePosteriorState


@dataclass(frozen=True, slots=True)
class _AssimilationCalibrationRow:
    prediction: np.ndarray
    exact_counts: np.ndarray
    initial_grid: np.ndarray
    target: np.ndarray


def _select_calibration_indexes(
    sample_count: int,
    *,
    max_calibration_episodes: int,
) -> tuple[int, ...]:
    if sample_count <= 0 or max_calibration_episodes <= 0:
        return ()
    calibration_count = min(max_calibration_episodes, sample_count)
    return tuple(
        sorted(
            {
                round(value)
                for value in np.linspace(
                    0,
                    sample_count - 1,
                    num=calibration_count,
                )
            }
        )
    )


class ObservedCellAssimilator(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observed_cell_assimilator_v1"
    prior_pseudocount: float = Field(default=2.0, gt=0.0)
    calibration_metric: str = "mean_weighted_kl"

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        student: StateSpaceStudent,
        *,
        max_calibration_episodes: int = 4,
        prior_pseudocount_grid: tuple[float, ...] = (0.5, 1.0, 2.0, 4.0, 8.0, 16.0),
    ) -> ObservedCellAssimilator:
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        calibration_indexes = _select_calibration_indexes(
            index_table.height,
            max_calibration_episodes=max_calibration_episodes,
        )
        if not calibration_indexes:
            return cls()

        calibration_rows = cls._build_calibration_rows(
            tuple(Path(str(index_table["episode_path"][index])) for index in calibration_indexes),
            student=student,
        )
        if not calibration_rows:
            return cls()

        best_prior_pseudocount = float(prior_pseudocount_grid[0])
        best_score = float("inf")
        for candidate_prior_pseudocount in prior_pseudocount_grid:
            candidate = cls(prior_pseudocount=float(candidate_prior_pseudocount))
            total = 0.0
            for row in calibration_rows:
                assimilated = candidate.apply(row.prediction, row.exact_counts)
                floored = apply_probability_floor(
                    assimilated,
                    student.probability_floor,
                    initial_grid=row.initial_grid,
                )
                total += score_prediction(row.target, floored).weighted_kl
            mean_score = total / float(len(calibration_rows))
            if mean_score < best_score:
                best_score = mean_score
                best_prior_pseudocount = float(candidate_prior_pseudocount)
        return cls(prior_pseudocount=best_prior_pseudocount)

    @classmethod
    def _build_calibration_rows(
        cls,
        episode_paths: tuple[Path, ...],
        *,
        student: StateSpaceStudent,
    ) -> tuple[_AssimilationCalibrationRow, ...]:
        rows: list[_AssimilationCalibrationRow] = []
        for episode_path in episode_paths:
            from astar.history.datasets.synthetic_live import load_synthetic_episode

            artifact = load_synthetic_episode(episode_path)
            round_detail = round_detail_from_artifact(episode_path)
            round_context = build_round_context_from_detail(round_detail)
            context = round_context_to_live_inference_context(
                round_context,
                artifact.observations,
            )
            posterior = student.infer_regime(context)
            targets = terminal_targets_from_artifact(episode_path)
            for seed_index, target in targets.items():
                exact_counts = np.asarray(
                    context.evidence_bundle.per_seed[seed_index].observed_class_count_tensor,
                    dtype=np.float64,
                )
                if not np.any(np.sum(exact_counts, axis=-1) > 0.0):
                    continue
                prediction = student.decode_seed_from_posterior(
                    context,
                    seed_index=int(seed_index),
                    posterior=posterior,
                    apply_floor=False,
                )
                initial_grid = np.asarray(
                    context.round_context.seeds[int(seed_index)].initial_state.grid,
                    dtype=np.int64,
                )
                rows.append(
                    _AssimilationCalibrationRow(
                        prediction=np.asarray(prediction, dtype=np.float64),
                        exact_counts=exact_counts,
                        initial_grid=initial_grid,
                        target=np.asarray(target, dtype=np.float64),
                    )
                )
        return tuple(rows)

    def apply(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
    ) -> np.ndarray:
        prior = np.asarray(prediction, dtype=np.float64)
        counts = np.asarray(exact_counts, dtype=np.float64)
        if prior.shape != counts.shape:
            raise ValueError(
                "observed-cell assimilation shape mismatch: "
                f"prediction={prior.shape!r} counts={counts.shape!r}"
            )
        count_total = np.sum(counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prior
        alpha = float(self.prior_pseudocount)
        # Treat the decoder output as a Dirichlet prior over one cell's terminal law.
        assimilated = np.where(
            count_total > 0.0,
            (alpha * prior + counts) / np.maximum(alpha + count_total, 1e-6),
            prior,
        )
        return np.asarray(assimilated, dtype=np.float64)


class StateSpaceAssimilatedPredictor(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "state_space_student_assimilated_v1"
    student: StateSpaceStudent
    assimilator: ObservedCellAssimilator

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        return self.student.infer_regime(context)

    def _predict_seed_from_posterior(
        self,
        context: LiveInferenceContext,
        *,
        seed_index: int,
        posterior: RegimePosteriorState,
    ) -> np.ndarray:
        raw_prediction = self.student.decode_seed_from_posterior(
            context,
            seed_index=seed_index,
            posterior=posterior,
            apply_floor=False,
        )
        exact_counts = np.asarray(
            context.evidence_bundle.per_seed[seed_index].observed_class_count_tensor,
            dtype=np.float64,
        )
        assimilated = self.assimilator.apply(raw_prediction, exact_counts)
        initial_grid = np.asarray(
            context.round_context.seeds[seed_index].initial_state.grid,
            dtype=np.int64,
        )
        return np.asarray(
            apply_probability_floor(
                assimilated,
                self.student.probability_floor,
                initial_grid=initial_grid,
            ),
            dtype=np.float64,
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self._predict_seed_from_posterior(
            context,
            seed_index=seed_index,
            posterior=posterior,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        posterior = self.infer_regime(context)
        predictions_by_seed = {
            seed.seed_index: self._predict_seed_from_posterior(
                context,
                seed_index=seed.seed_index,
                posterior=posterior,
            )
            for seed in context.round_context.seeds
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


__all__ = [
    "ObservedCellAssimilator",
    "StateSpaceAssimilatedPredictor",
]
