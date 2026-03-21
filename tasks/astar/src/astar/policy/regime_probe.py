from __future__ import annotations

from collections import defaultdict
from math import exp, log

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, TileSpec, Viewport, tile_viewports
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import TranscriptBeliefState
from astar.envs.types import ViewportQuery
from astar.features.motifs import ViewportMotifScorer, rank_seed_viewports


def _viewport_key(seed_index: int, viewport: Viewport) -> tuple[int, int, int, int, int]:
    return (seed_index, viewport.x, viewport.y, viewport.w, viewport.h)


def _class_frequencies(grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    counts = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
    total = float(np.sum(counts))
    return counts / total if total > 0.0 else np.zeros(CLASS_COUNT, dtype=np.float64)


def _safe_mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else 0.0


def _safe_entropy(probabilities: np.ndarray) -> float:
    positive = probabilities[probabilities > 0.0]
    if positive.size == 0:
        return 0.0
    return float(-np.sum(positive * np.log(positive)))


def _observation_features(observation: LiveQueryObs) -> np.ndarray:
    area = float(max(1, observation.viewport.w * observation.viewport.h))
    class_freq = _class_frequencies(observation.grid)
    settlements = list(observation.settlements)
    populations = [float(item.population) for item in settlements if item.population is not None]
    foods = [float(item.food) for item in settlements if item.food is not None]
    wealths = [float(item.wealth) for item in settlements if item.wealth is not None]
    defenses = [float(item.defense) for item in settlements if item.defense is not None]
    owner_count = len({int(item.owner_id) for item in settlements if item.owner_id is not None})
    port_share = float(sum(1 for item in settlements if item.has_port)) / float(max(1, len(settlements)))
    alive_share = float(sum(1 for item in settlements if item.alive)) / float(max(1, len(settlements)))
    return np.asarray(
        [
            len(settlements) / area,
            owner_count / 8.0,
            port_share,
            alive_share,
            _safe_mean(populations) / 4.5,
            _safe_mean(foods) / 1.2,
            _safe_mean(wealths) / 1.5,
            _safe_mean(defenses) / 1.0,
            _safe_entropy(class_freq) / log(CLASS_COUNT),
            class_freq[1],
            class_freq[2],
            class_freq[3],
            class_freq[4],
        ],
        dtype=np.float64,
    )


def _observation_interest(observation: LiveQueryObs) -> float:
    features = _observation_features(observation)
    return float(
        2.2 * features[0]
        + 0.9 * features[1]
        + 0.7 * features[2]
        + 0.8 * features[8]
        + 1.2 * (features[9] + features[10] + features[11])
        + 0.5 * features[4]
        + 0.35 * features[5]
        + 0.35 * features[6]
    )


def _window_repeat_signal(observations: list[LiveQueryObs]) -> float:
    if not observations:
        return 0.0
    features = np.stack([_observation_features(item) for item in observations], axis=0)
    mean_interest = float(np.mean([_observation_interest(item) for item in observations]))
    if len(observations) == 1:
        return mean_interest
    return mean_interest + 2.0 * float(np.mean(np.var(features, axis=0)))


def _viewport_center(viewport: Viewport) -> tuple[float, float]:
    return (viewport.x + 0.5 * viewport.w, viewport.y + 0.5 * viewport.h)


def _neighbor_bonus(
    viewport: Viewport,
    observations: list[LiveQueryObs],
    *,
    map_width: int,
    map_height: int,
) -> float:
    if not observations:
        return 0.0
    center_x, center_y = _viewport_center(viewport)
    scale = float(max(viewport.w, viewport.h, 1))
    best = 0.0
    for observation in observations:
        other_x, other_y = _viewport_center(observation.viewport)
        distance = abs(center_x - other_x) / scale + abs(center_y - other_y) / scale
        proximity = exp(-distance / 1.5)
        normalized = _observation_interest(observation) / 6.0
        best = max(best, normalized * proximity)
    return best


class RegimeProbePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "regime_probe_v1"
    viewport_w: int = Field(default=15, ge=1)
    viewport_h: int = Field(default=15, ge=1)
    max_queries: int = Field(default=50, ge=1)
    max_repeats_per_window: int = Field(default=3, ge=1)
    unseen_weight: float = Field(default=1.0, gt=0.0)
    repeat_weight: float = Field(default=1.8, gt=0.0)
    neighbor_weight: float = Field(default=0.9, ge=0.0)
    repeat_decay: float = Field(default=0.6, gt=0.0, le=1.0)
    motif_scorer: ViewportMotifScorer = Field(default_factory=ViewportMotifScorer)

    def select(
        self,
        belief: TranscriptBeliefState,
        budget_left: int,
    ) -> ViewportQuery | None:
        if budget_left <= 0:
            return None

        round_detail = belief.round_context.to_round_detail()
        map_shape = MapShape(width=round_detail.map_width, height=round_detail.map_height)
        viewports = tile_viewports(
            map_shape,
            TileSpec(width=self.viewport_w, height=self.viewport_h),
        )
        motif_rankings = {
            seed_index: rank_seed_viewports(
                round_detail,
                seed_index,
                viewports,
                scorer=self.motif_scorer,
            )
            for seed_index in range(round_detail.seeds_count)
        }
        motif_scores: dict[tuple[int, int, int, int, int], float] = {}
        for seed_index, ranked in motif_rankings.items():
            denom = max(ranked[0].diagnostic_score, 1e-6) if ranked else 1.0
            for item in ranked:
                motif_scores[_viewport_key(seed_index, item.viewport)] = (
                    float(item.diagnostic_score) / denom
                )

        observations_by_key: dict[tuple[int, int, int, int, int], list[LiveQueryObs]] = defaultdict(list)
        observations_by_seed: dict[int, list[LiveQueryObs]] = defaultdict(list)
        seed_query_counts = {seed_index: 0 for seed_index in range(round_detail.seeds_count)}
        for observation in belief.observations:
            observations_by_key[_viewport_key(observation.seed_index, observation.viewport)].append(observation)
            observations_by_seed[observation.seed_index].append(observation)
            seed_query_counts[observation.seed_index] += 1

        min_seed_queries = min(seed_query_counts.values(), default=0)
        candidate_seeds = {
            seed_index
            for seed_index, count in seed_query_counts.items()
            if count == min_seed_queries
        }

        scored: list[tuple[float, int, int, int, int, int, str]] = []
        for seed_index in range(round_detail.seeds_count):
            if seed_index not in candidate_seeds:
                continue
            for viewport in viewports:
                key = _viewport_key(seed_index, viewport)
                repeat_count = len(observations_by_key.get(key, ()))
                if repeat_count >= self.max_repeats_per_window:
                    continue
                base_score = motif_scores.get(key, 0.0)
                if repeat_count == 0:
                    score = self.unseen_weight * (
                        1.0
                        + base_score
                        + self.neighbor_weight
                        * _neighbor_bonus(
                            viewport,
                            observations_by_seed.get(seed_index, []),
                            map_width=round_detail.map_width,
                            map_height=round_detail.map_height,
                        )
                    )
                    tag = "regime_probe_expand"
                else:
                    score = self.repeat_weight * (
                        0.25 * base_score
                        + _window_repeat_signal(observations_by_key[key])
                    ) * (self.repeat_decay ** (repeat_count - 1))
                    tag = "regime_probe_repeat"
                scored.append(
                    (
                        -score,
                        repeat_count,
                        seed_index,
                        viewport.y,
                        viewport.x,
                        viewport.w * viewport.h,
                        tag,
                    ),
                )

        if not scored:
            return None

        best = min(scored)
        _, _, seed_index, y, x, area, tag = best
        viewport = next(
            item
            for item in viewports
            if item.x == x and item.y == y and item.w * item.h == area
        )
        return ViewportQuery(
            seed_index=seed_index,
            viewport=viewport,
            rationale=tag,
        )


__all__ = ["RegimeProbePolicy"]
