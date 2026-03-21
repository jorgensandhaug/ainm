from __future__ import annotations

import math

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, TileSpec, Viewport, tile_viewports
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import InteractiveQueryPolicy, TranscriptBeliefState
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
    return {key: float((value - low) / (high - low)) for key, value in values.items()}


def _group_observations(
    observations: tuple[LiveQueryObs, ...],
) -> dict[tuple[int, int, int, int, int], list[LiveQueryObs]]:
    grouped: dict[tuple[int, int, int, int, int], list[LiveQueryObs]] = {}
    for observation in observations:
        grouped.setdefault(_viewport_key(observation.seed_index, observation.viewport), []).append(observation)
    return grouped


def _repeat_score(
    observations: list[LiveQueryObs],
    *,
    motif_score: float,
    motif_weight: float,
    dynamic_weight: float,
    entropy_weight: float,
    settlement_weight: float,
    repeat_penalty: float,
) -> float:
    query_count = len(observations)
    if query_count <= 0:
        return -math.inf

    height, width = observations[0].grid.shape
    class_counts = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    settlement_density_values: list[float] = []
    for observation in observations:
        collapsed = collapse_internal_grid(observation.grid)
        for class_index in range(CLASS_COUNT):
            class_counts[:, :, class_index] += (collapsed == class_index).astype(np.float64)
        settlement_density_values.append(float(len(observation.settlements)) / float(collapsed.size))

    empirical = class_counts / float(query_count)
    dynamic_mass = float(np.mean(empirical[:, :, 1:4].sum(axis=-1)))
    mean_entropy = float(np.mean(entropy_map(empirical)) / math.log(CLASS_COUNT))
    settlement_density = float(np.mean(settlement_density_values))
    return (
        (motif_weight * motif_score)
        + (dynamic_weight * dynamic_mass)
        + (entropy_weight * mean_entropy)
        + (settlement_weight * settlement_density)
        - (repeat_penalty * math.log(float(query_count)))
    )


class CoverageAdaptiveRepeatPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "adaptive_r5"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    replicate_budget: int = Field(default=5, ge=0)
    max_repeats_per_viewport: int = Field(default=3, ge=1)
    motif_weight: float = Field(default=0.15, ge=0.0)
    dynamic_weight: float = Field(default=0.45, ge=0.0)
    entropy_weight: float = Field(default=0.60, ge=0.0)
    settlement_weight: float = Field(default=0.10, ge=0.0)
    repeat_penalty: float = Field(default=0.08, ge=0.0)
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def _coverage_items(
        self,
        belief: TranscriptBeliefState,
    ) -> list[tuple[int, Viewport, float]]:
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
        normalized_scores = _normalize_scores(motif_scores)
        return [
            (
                seed_index,
                viewport,
                normalized_scores.get(_viewport_key(seed_index, viewport), 0.0),
            )
            for seed_index in range(round_detail.seeds_count)
            for viewport in viewports
        ]

    def select(
        self,
        belief: TranscriptBeliefState,
        budget_left: int,
    ) -> ViewportQuery | None:
        if budget_left <= 0:
            return None
        coverage_items = self._coverage_items(belief)
        observation_count = len(belief.observations)
        coverage_count = len(coverage_items)
        if observation_count < coverage_count:
            seed_index, viewport, _ = coverage_items[observation_count]
            return ViewportQuery(
                seed_index=seed_index,
                viewport=viewport,
                rationale="coverage",
            )

        adaptive_query_index = observation_count - coverage_count
        if adaptive_query_index >= self.replicate_budget:
            return None

        grouped = _group_observations(belief.observations)
        best_key: tuple[int, int, int, int, int] | None = None
        best_viewport: Viewport | None = None
        best_score = -math.inf
        for seed_index, viewport, motif_score in coverage_items:
            key = _viewport_key(seed_index, viewport)
            observations = grouped.get(key, [])
            if not observations:
                continue
            if len(observations) > self.max_repeats_per_viewport:
                continue
            score = _repeat_score(
                observations,
                motif_score=motif_score,
                motif_weight=self.motif_weight,
                dynamic_weight=self.dynamic_weight,
                entropy_weight=self.entropy_weight,
                settlement_weight=self.settlement_weight,
                repeat_penalty=self.repeat_penalty,
            )
            tie_break = (seed_index, viewport.y, viewport.x)
            if best_key is None or score > best_score + 1e-12 or (
                abs(score - best_score) <= 1e-12 and tie_break < (best_key[0], best_key[2], best_key[1])
            ):
                best_key = key
                best_viewport = viewport
                best_score = score
        if best_key is None or best_viewport is None:
            return None
        return ViewportQuery(
            seed_index=best_key[0],
            viewport=best_viewport,
            rationale=f"adaptive_repeat:{best_score:.3f}",
        )


__all__ = ["CoverageAdaptiveRepeatPolicy", "InteractiveQueryPolicy"]
