from __future__ import annotations

import math

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, TileSpec, Viewport, tile_viewports
from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import InteractiveQueryPolicy, OnlinePredictor, TranscriptBeliefState
from astar.envs.types import ViewportQuery
from astar.features.motifs import ViewportMotifScorer, rank_seed_viewports


def _viewport_key(seed_index: int, viewport: Viewport) -> tuple[int, int, int, int, int]:
    return (seed_index, viewport.x, viewport.y, viewport.w, viewport.h)


def _normalize_scores(values: dict[tuple[int, int, int, int, int], float]) -> dict[tuple[int, int, int, int, int], float]:
    if not values:
        return {}
    scores = np.asarray(list(values.values()), dtype=np.float64)
    low = float(np.min(scores))
    high = float(np.max(scores))
    if high <= low + 1e-9:
        return {key: 0.0 for key in values}
    return {
        key: float((value - low) / (high - low))
        for key, value in values.items()
    }


def _group_observations(
    observations: tuple[LiveQueryObs, ...],
) -> dict[tuple[int, int, int, int, int], list[LiveQueryObs]]:
    grouped: dict[tuple[int, int, int, int, int], list[LiveQueryObs]] = {}
    for observation in observations:
        grouped.setdefault(_viewport_key(observation.seed_index, observation.viewport), []).append(observation)
    return grouped


def _window_one_hot(observation: LiveQueryObs) -> np.ndarray:
    collapsed = collapse_internal_grid(observation.grid)
    return np.eye(CLASS_COUNT, dtype=np.float64)[collapsed]


def _window_prediction_patch(
    prediction: np.ndarray | None,
    viewport: Viewport,
) -> np.ndarray | None:
    if prediction is None:
        return None
    return np.asarray(
        prediction[viewport.y : viewport.y_stop, viewport.x : viewport.x_stop],
        dtype=np.float64,
    )


def _window_prediction_stats(
    prediction: np.ndarray | None,
    viewport: Viewport,
) -> tuple[float, float]:
    patch = _window_prediction_patch(prediction, viewport)
    if patch is None:
        return 0.0, 0.0
    return (
        float(np.mean(entropy_map(patch)) / math.log(CLASS_COUNT)),
        float(np.mean(patch[..., 1:4].sum(axis=-1))),
    )


def _repeat_observation_stats(
    observations: list[LiveQueryObs],
    *,
    prediction: np.ndarray | None,
) -> tuple[float, float, float, float]:
    if not observations:
        return 0.0, 0.0, 0.0, 0.0
    one_hot_rows = np.stack([_window_one_hot(item) for item in observations], axis=0)
    empirical = np.mean(one_hot_rows, axis=0)
    empirical_entropy = float(np.mean(entropy_map(empirical)) / math.log(CLASS_COUNT))
    empirical_dynamic_mass = float(np.mean(empirical[..., 1:4].sum(axis=-1)))
    settlement_density = float(
        np.mean(
            [
                float(len(item.settlements)) / float(item.grid.shape[0] * item.grid.shape[1])
                for item in observations
            ],
        ),
    )
    if prediction is None:
        return 0.0, empirical_entropy, empirical_dynamic_mass, settlement_density
    predicted_patch = _window_prediction_patch(prediction, observations[0].viewport)
    if predicted_patch is None:
        return 0.0, empirical_entropy, empirical_dynamic_mass, settlement_density
    discrepancy = float(np.mean(np.abs(empirical - predicted_patch)))
    return discrepancy, empirical_entropy, empirical_dynamic_mass, settlement_density


class PredictiveRepeatPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "postinfo_r5"
    predictor: object | None = None
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    replicate_budget: int = Field(default=5, ge=0)
    min_queries_before_repeat: int = Field(default=10, ge=0)
    max_queries_per_viewport: int = Field(default=3, ge=1)
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)
    unseen_motif_weight: float = Field(default=0.20, ge=0.0)
    unseen_entropy_weight: float = Field(default=0.65, ge=0.0)
    unseen_dynamic_weight: float = Field(default=0.15, ge=0.0)
    repeat_motif_weight: float = Field(default=0.10, ge=0.0)
    repeat_prediction_entropy_weight: float = Field(default=0.20, ge=0.0)
    repeat_dynamic_weight: float = Field(default=0.10, ge=0.0)
    repeat_discrepancy_weight: float = Field(default=0.85, ge=0.0)
    repeat_empirical_entropy_weight: float = Field(default=0.45, ge=0.0)
    repeat_settlement_weight: float = Field(default=0.10, ge=0.0)
    discrepancy_scale: float = Field(default=4.0, ge=0.0)
    repeat_penalty: float = Field(default=0.10, ge=0.0)
    repeat_margin: float = 0.03

    def _prediction_bundle(
        self,
        belief: TranscriptBeliefState,
    ) -> PredictionBundle | None:
        if self.predictor is None:
            return None
        predict = getattr(self.predictor, "predict", None)
        if not callable(predict):
            return None
        return predict(belief)

    def _coverage_items(
        self,
        belief: TranscriptBeliefState,
        *,
        prediction_bundle: PredictionBundle | None,
    ) -> list[tuple[int, Viewport, float, float]]:
        round_detail = belief.round_context.to_round_detail()
        viewports = tile_viewports(
            MapShape(width=round_detail.map_width, height=round_detail.map_height),
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )
        motif_scores: dict[tuple[int, int, int, int, int], float] = {}
        for seed_index in range(round_detail.seeds_count):
            ranked = rank_seed_viewports(
                round_detail,
                seed_index,
                viewports,
                scorer=self.motif_scorer,
            )
            motif_scores.update(
                {
                    _viewport_key(seed_index, item.viewport): float(item.diagnostic_score)
                    for item in ranked
                },
            )
        normalized_motif_scores = _normalize_scores(motif_scores)

        items: list[tuple[int, Viewport, float, float]] = []
        for seed_index in range(round_detail.seeds_count):
            prediction = None
            if prediction_bundle is not None:
                prediction = np.asarray(
                    prediction_bundle.predictions_by_seed[seed_index],
                    dtype=np.float64,
                )
            for viewport in viewports:
                key = _viewport_key(seed_index, viewport)
                motif_score = normalized_motif_scores.get(key, 0.0)
                predicted_entropy, predicted_dynamic_mass = _window_prediction_stats(
                    prediction,
                    viewport,
                )
                unseen_score = (
                    (self.unseen_motif_weight * motif_score)
                    + (self.unseen_entropy_weight * predicted_entropy)
                    + (self.unseen_dynamic_weight * predicted_dynamic_mass)
                )
                items.append((seed_index, viewport, motif_score, unseen_score))
        return sorted(
            items,
            key=lambda item: (-item[3], item[0], item[1].y, item[1].x),
        )

    def select(
        self,
        belief: TranscriptBeliefState,
        budget_left: int,
    ) -> ViewportQuery | None:
        if budget_left <= 0:
            return None

        prediction_bundle = self._prediction_bundle(belief)
        coverage_items = self._coverage_items(
            belief,
            prediction_bundle=prediction_bundle,
        )
        grouped = _group_observations(belief.observations)
        unseen_items = [
            item for item in coverage_items
            if _viewport_key(item[0], item[1]) not in grouped
        ]
        unique_window_count = len(grouped)
        repeat_query_count = len(belief.observations) - unique_window_count
        repeat_budget_left = self.replicate_budget - repeat_query_count

        best_unseen = unseen_items[0] if unseen_items else None
        if best_unseen is None and repeat_budget_left <= 0:
            return None

        best_repeat_query: ViewportQuery | None = None
        best_repeat_score = -math.inf
        if repeat_budget_left > 0 and len(belief.observations) >= self.min_queries_before_repeat:
            for seed_index, viewport, motif_score, _ in coverage_items:
                key = _viewport_key(seed_index, viewport)
                observations = grouped.get(key, [])
                if not observations:
                    continue
                if len(observations) >= self.max_queries_per_viewport:
                    continue
                prediction = None
                if prediction_bundle is not None:
                    prediction = np.asarray(
                        prediction_bundle.predictions_by_seed[seed_index],
                        dtype=np.float64,
                    )
                predicted_entropy, predicted_dynamic_mass = _window_prediction_stats(
                    prediction,
                    viewport,
                )
                discrepancy, empirical_entropy, empirical_dynamic_mass, settlement_density = (
                    _repeat_observation_stats(
                        observations,
                        prediction=prediction,
                    )
                )
                repeat_score = (
                    (self.repeat_motif_weight * motif_score)
                    + (self.repeat_prediction_entropy_weight * predicted_entropy)
                    + (self.repeat_dynamic_weight * max(predicted_dynamic_mass, empirical_dynamic_mass))
                    + (self.repeat_discrepancy_weight * self.discrepancy_scale * discrepancy)
                    + (self.repeat_empirical_entropy_weight * empirical_entropy)
                    + (self.repeat_settlement_weight * settlement_density)
                    - (self.repeat_penalty * math.log1p(float(len(observations) - 1)))
                )
                candidate = ViewportQuery(
                    seed_index=seed_index,
                    viewport=viewport,
                    rationale=f"predictive_repeat:{repeat_score:.3f}",
                )
                tie_break = (seed_index, viewport.y, viewport.x)
                if best_repeat_query is None or repeat_score > best_repeat_score + 1e-12 or (
                    abs(repeat_score - best_repeat_score) <= 1e-12
                    and tie_break
                    < (
                        best_repeat_query.seed_index,
                        best_repeat_query.viewport.y,
                        best_repeat_query.viewport.x,
                    )
                ):
                    best_repeat_query = candidate
                    best_repeat_score = repeat_score

        if best_unseen is None:
            return best_repeat_query

        best_unseen_query = ViewportQuery(
            seed_index=best_unseen[0],
            viewport=best_unseen[1],
            rationale=f"predictive_unseen:{best_unseen[3]:.3f}",
        )
        if best_repeat_query is None:
            return best_unseen_query
        if best_repeat_score >= best_unseen[3] + self.repeat_margin:
            return best_repeat_query
        return best_unseen_query


def build_named_predictive_repeat_policy(
    name: str,
    *,
    predictor: OnlinePredictor | None = None,
    replicate_budget: int,
) -> PredictiveRepeatPolicy:
    normalized = name.strip().lower()
    probe_mode = "_probe" in normalized
    if normalized.startswith("scoregain"):
        return PredictiveRepeatPolicy(
            name=normalized,
            predictor=predictor,
            replicate_budget=replicate_budget,
            min_queries_before_repeat=1 if probe_mode else 6,
            unseen_motif_weight=0.18,
            unseen_entropy_weight=0.54,
            unseen_dynamic_weight=0.28,
            repeat_motif_weight=0.08,
            repeat_prediction_entropy_weight=0.20 if probe_mode else 0.16,
            repeat_dynamic_weight=0.12,
            repeat_discrepancy_weight=1.12 if probe_mode else 1.05,
            repeat_empirical_entropy_weight=0.55,
            repeat_settlement_weight=0.10,
            discrepancy_scale=4.5,
            repeat_penalty=0.08,
            repeat_margin=-0.05 if probe_mode else -0.02,
        )
    return PredictiveRepeatPolicy(
        name=normalized,
        predictor=predictor,
        replicate_budget=replicate_budget,
        min_queries_before_repeat=1 if probe_mode else 10,
        repeat_prediction_entropy_weight=0.24 if probe_mode else 0.20,
        repeat_discrepancy_weight=0.92 if probe_mode else 0.85,
        repeat_margin=-0.02 if probe_mode else 0.03,
    )


__all__ = [
    "InteractiveQueryPolicy",
    "PredictiveRepeatPolicy",
    "build_named_predictive_repeat_policy",
]
