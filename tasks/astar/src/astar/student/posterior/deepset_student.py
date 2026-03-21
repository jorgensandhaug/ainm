from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.grid import MapShape, coverage_counts
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.history.datasets.base import SyntheticEpisodeDatasetRef
from astar.history.datasets.synthetic_live import load_synthetic_episode
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.teacher.regime.base import RegimePosteriorState

_OBSERVATION_FEATURE_DIM = 19 + CLASS_COUNT


def _optional_float(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _safe_mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else 0.0


def _safe_std(values: list[float]) -> float:
    return float(np.std(values)) if values else 0.0


def _normalize(value: float | None, scale: float) -> float:
    return 0.0 if value is None else float(value) / scale


def _summary_vector_from_evidence(evidence: RoundEvidenceBundle) -> np.ndarray:
    components: list[float] = []
    for seed_index in sorted(evidence.per_seed):
        seed = evidence.per_seed[seed_index]
        components.append(float(seed.query_count))
        components.extend(seed.observed_class_frequencies.astype(np.float64).tolist())
        components.append(_optional_float(seed.mean_population))
        components.append(_optional_float(seed.mean_food))
        components.append(_optional_float(seed.mean_wealth))
        components.append(_optional_float(seed.mean_defense))
    return np.asarray(components, dtype=np.float64)


def _summary_vector_from_artifact(path: Path) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path)
    grouped: dict[int, list[LiveQueryObs]] = {}
    for observation in artifact.observations:
        grouped.setdefault(observation.seed_index, []).append(observation)

    components: list[float] = []
    for seed_index in sorted(grouped):
        observations = grouped[seed_index]
        class_counts = np.zeros(CLASS_COUNT, dtype=np.float64)
        populations: list[float] = []
        foods: list[float] = []
        wealths: list[float] = []
        defenses: list[float] = []
        for observation in observations:
            collapsed = collapse_internal_grid(observation.grid)
            bincount = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
            class_counts += bincount
            for settlement in observation.settlements:
                if settlement.population is not None:
                    populations.append(float(settlement.population))
                if settlement.food is not None:
                    foods.append(float(settlement.food))
                if settlement.wealth is not None:
                    wealths.append(float(settlement.wealth))
                if settlement.defense is not None:
                    defenses.append(float(settlement.defense))
        total = float(np.sum(class_counts))
        class_frequencies = (
            class_counts / total if total > 0 else np.zeros(CLASS_COUNT, dtype=np.float64)
        )
        components.append(float(len(observations)))
        components.extend(class_frequencies.tolist())
        components.append(float(np.mean(populations)) if populations else 0.0)
        components.append(float(np.mean(foods)) if foods else 0.0)
        components.append(float(np.mean(wealths)) if wealths else 0.0)
        components.append(float(np.mean(defenses)) if defenses else 0.0)
    return np.asarray(components, dtype=np.float64), artifact.regime_vector


def _owner_summary_from_settlements(
    settlements: tuple | list,
) -> tuple[float, float, float]:
    owner_counts: dict[int, int] = {}
    for settlement in settlements:
        owner_id = getattr(settlement, "owner_id", None)
        if owner_id is None:
            continue
        owner_counts[int(owner_id)] = owner_counts.get(int(owner_id), 0) + 1
    if not owner_counts:
        return (0.0, 0.0, 0.0)
    total = float(sum(owner_counts.values()))
    shares = np.asarray([count / total for count in owner_counts.values()], dtype=np.float64)
    return (
        float(len(owner_counts)) / 10.0,
        float(np.max(shares)),
        float(np.sum(shares * shares)),
    )


def _class_frequencies(grid: np.ndarray) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(grid, dtype=np.int64))
    counts = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
    total = float(np.sum(counts))
    return counts / total if total > 0.0 else np.zeros(CLASS_COUNT, dtype=np.float64)


def _observation_feature_vector(
    observation: LiveQueryObs,
    *,
    map_width: int,
    map_height: int,
) -> np.ndarray:
    class_freq = _class_frequencies(observation.grid)
    settlements = observation.settlements
    area = float(observation.viewport.w * observation.viewport.h)
    populations = [
        float(settlement.population)
        for settlement in settlements
        if settlement.population is not None
    ]
    foods = [float(settlement.food) for settlement in settlements if settlement.food is not None]
    wealths = [float(settlement.wealth) for settlement in settlements if settlement.wealth is not None]
    defenses = [
        float(settlement.defense)
        for settlement in settlements
        if settlement.defense is not None
    ]
    owner_count, largest_owner_share, owner_hhi = _owner_summary_from_settlements(settlements)
    settlement_count = len(settlements)
    alive_share = (
        float(sum(1 for settlement in settlements if settlement.alive)) / float(max(1, settlement_count))
    )
    port_share = (
        float(sum(1 for settlement in settlements if settlement.has_port)) / float(max(1, settlement_count))
    )
    center_x = (observation.viewport.x + 0.5 * observation.viewport.w) / float(max(1, map_width))
    center_y = (observation.viewport.y + 0.5 * observation.viewport.h) / float(max(1, map_height))
    return np.asarray(
        [
            center_x,
            center_y,
            float(observation.viewport.w) / float(max(1, map_width)),
            float(observation.viewport.h) / float(max(1, map_height)),
            area / float(max(1, map_width * map_height)),
            float(settlement_count) / area,
            alive_share,
            port_share,
            owner_count,
            largest_owner_share,
            owner_hhi,
            _normalize(_safe_mean(populations), 4.5),
            _normalize(_safe_std(populations), 4.5),
            _normalize(_safe_mean(foods), 1.2),
            _normalize(_safe_std(foods), 1.2),
            _normalize(_safe_mean(wealths), 1.5),
            _normalize(_safe_std(wealths), 1.5),
            _normalize(_safe_mean(defenses), 1.0),
            _normalize(_safe_std(defenses), 1.0),
            *class_freq.tolist(),
        ],
        dtype=np.float64,
    )


def _coverage_moments(coverage: np.ndarray) -> np.ndarray:
    weight_sum = float(np.sum(coverage))
    if weight_sum <= 0.0:
        return np.zeros(4, dtype=np.float64)
    ys, xs = np.indices(coverage.shape)
    mean_x = float(np.sum(xs * coverage) / weight_sum) / float(max(1, coverage.shape[1]))
    mean_y = float(np.sum(ys * coverage) / weight_sum) / float(max(1, coverage.shape[0]))
    var_x = float(np.sum(((xs / float(max(1, coverage.shape[1]))) - mean_x) ** 2 * coverage) / weight_sum)
    var_y = float(np.sum(((ys / float(max(1, coverage.shape[0]))) - mean_y) ** 2 * coverage) / weight_sum)
    return np.asarray([mean_x, mean_y, np.sqrt(max(var_x, 0.0)), np.sqrt(max(var_y, 0.0))], dtype=np.float64)


def _repeat_variance(
    observations: list[LiveQueryObs],
) -> float:
    by_window: dict[tuple[int, int, int, int], list[np.ndarray]] = {}
    for observation in observations:
        viewport = observation.viewport
        key = (viewport.x, viewport.y, viewport.w, viewport.h)
        by_window.setdefault(key, []).append(_class_frequencies(observation.grid))
    repeated = [
        float(np.mean(np.var(np.stack(items, axis=0), axis=0)))
        for items in by_window.values()
        if len(items) > 1
    ]
    return float(np.mean(repeated)) if repeated else 0.0


def _seed_transcript_vector(
    observations: list[LiveQueryObs],
    *,
    map_width: int,
    map_height: int,
) -> np.ndarray:
    if not observations:
        return np.zeros(
            12 + 3 * _OBSERVATION_FEATURE_DIM + CLASS_COUNT,
            dtype=np.float64,
        )

    observation_matrix = np.stack(
        [
            _observation_feature_vector(
                observation,
                map_width=map_width,
                map_height=map_height,
            )
            for observation in observations
        ],
        axis=0,
    )
    coverage = coverage_counts(
        MapShape(width=map_width, height=map_height),
        [observation.viewport for observation in observations],
    ).astype(np.float64)
    observed_mask = coverage > 0.0
    repeat_mask = coverage > 1.0
    pooled_class = np.mean(
        np.stack([_class_frequencies(observation.grid) for observation in observations], axis=0),
        axis=0,
    )
    repeated_window_groups = len(
        {
            (obs.viewport.x, obs.viewport.y, obs.viewport.w, obs.viewport.h)
            for obs in observations
        },
    )
    return np.concatenate(
        [
            np.asarray(
                [
                    float(len(observations)) / 50.0,
                    float(repeated_window_groups) / float(max(1, len(observations))),
                    float(np.mean(observed_mask)),
                    float(np.mean(repeat_mask)),
                    float(np.mean(np.log1p(coverage[observed_mask]))) / np.log1p(float(len(observations)))
                    if np.any(observed_mask)
                    else 0.0,
                    _repeat_variance(observations),
                    *_coverage_moments(coverage).tolist(),
                    float(np.max(coverage)) / float(max(1, len(observations))),
                    float(np.sum(coverage)) / float(max(1, map_width * map_height * len(observations))),
                ],
                dtype=np.float64,
            ),
            np.mean(observation_matrix, axis=0),
            np.std(observation_matrix, axis=0),
            np.max(observation_matrix, axis=0),
            pooled_class.astype(np.float64),
        ],
        axis=0,
    ).astype(np.float64)


def _observation_token_groups(
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    *,
    map_width: int,
    map_height: int,
    seed_count: int,
) -> tuple[np.ndarray, ...]:
    grouped: dict[int, list[np.ndarray]] = {seed_index: [] for seed_index in range(seed_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(
            _observation_feature_vector(
                observation,
                map_width=map_width,
                map_height=map_height,
            ),
        )
    return tuple(
        np.stack(grouped[seed_index], axis=0)
        if grouped[seed_index]
        else np.zeros((0, _OBSERVATION_FEATURE_DIM), dtype=np.float64)
        for seed_index in range(seed_count)
    )


def _select_inducing_points(
    normalized_tokens: np.ndarray,
    *,
    inducing_count: int,
) -> np.ndarray:
    feature_dim = normalized_tokens.shape[1] if normalized_tokens.ndim == 2 else _OBSERVATION_FEATURE_DIM
    if inducing_count <= 0:
        raise ValueError("inducing_count must be positive")
    if normalized_tokens.size == 0:
        return np.zeros((inducing_count, feature_dim), dtype=np.float64)

    tokens = np.asarray(normalized_tokens, dtype=np.float64)
    centers = [np.mean(tokens, axis=0)]
    nearest_distance = np.sum((tokens - centers[0][None, :]) ** 2, axis=1)
    while len(centers) < inducing_count:
        farthest_index = int(np.argmax(nearest_distance))
        candidate = np.asarray(tokens[farthest_index], dtype=np.float64)
        centers.append(candidate)
        candidate_distance = np.sum((tokens - candidate[None, :]) ** 2, axis=1)
        nearest_distance = np.minimum(nearest_distance, candidate_distance)
    return np.stack(centers, axis=0).astype(np.float64)


def _attention_pool_features(
    token_matrix: np.ndarray,
    *,
    token_feature_mean: np.ndarray,
    token_feature_scale: np.ndarray,
    inducing_points: np.ndarray,
) -> np.ndarray:
    inducing_count = inducing_points.shape[0]
    if token_matrix.shape[0] == 0:
        return np.zeros(
            inducing_count * (_OBSERVATION_FEATURE_DIM + 1),
            dtype=np.float64,
        )
    normalized = (np.asarray(token_matrix, dtype=np.float64) - token_feature_mean[None, :]) / token_feature_scale[None, :]
    similarity = normalized @ inducing_points.T / np.sqrt(float(normalized.shape[1]))
    similarity = np.asarray(similarity, dtype=np.float64)
    shifted = similarity - np.max(similarity, axis=0, keepdims=True)
    attention = np.exp(np.clip(shifted, -25.0, 25.0))
    attention = attention / np.clip(np.sum(attention, axis=0, keepdims=True), 1e-8, None)
    pooled = attention.T @ normalized
    peak_similarity = np.max(similarity, axis=0)
    return np.concatenate(
        [
            pooled.reshape(-1),
            peak_similarity.astype(np.float64),
        ],
        axis=0,
    ).astype(np.float64)


def _attention_augmented_summary_vector(
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    *,
    map_width: int,
    map_height: int,
    seed_count: int,
    token_feature_mean: np.ndarray,
    token_feature_scale: np.ndarray,
    inducing_points: np.ndarray,
) -> np.ndarray:
    base_summary = _summary_vector_from_observations(
        observations,
        map_width=map_width,
        map_height=map_height,
        seed_count=seed_count,
    )
    token_groups = _observation_token_groups(
        observations,
        map_width=map_width,
        map_height=map_height,
        seed_count=seed_count,
    )
    attention_summary = np.concatenate(
        [
            _attention_pool_features(
                token_matrix,
                token_feature_mean=token_feature_mean,
                token_feature_scale=token_feature_scale,
                inducing_points=inducing_points,
            )
            for token_matrix in token_groups
        ],
        axis=0,
    ).astype(np.float64)
    return np.concatenate([base_summary, attention_summary], axis=0).astype(np.float64)


def _summary_vector_from_observations(
    observations: list[LiveQueryObs] | tuple[LiveQueryObs, ...],
    *,
    map_width: int,
    map_height: int,
    seed_count: int,
) -> np.ndarray:
    grouped: dict[int, list[LiveQueryObs]] = {seed_index: [] for seed_index in range(seed_count)}
    for observation in observations:
        grouped.setdefault(observation.seed_index, []).append(observation)
    return np.concatenate(
        [
            _seed_transcript_vector(
                grouped[seed_index],
                map_width=map_width,
                map_height=map_height,
            )
            for seed_index in range(seed_count)
        ],
        axis=0,
    ).astype(np.float64)


def _summary_vector_from_artifact_v2(path: Path) -> tuple[np.ndarray, np.ndarray]:
    artifact = load_synthetic_episode(path)
    observations = list(artifact.observations)
    target_seed_indexes = [int(seed_index) for seed_index in artifact.target_sources]
    inferred_width = artifact.map_width or max(
        (observation.viewport.x + observation.viewport.w for observation in observations),
        default=1,
    )
    inferred_height = artifact.map_height or max(
        (observation.viewport.y + observation.viewport.h for observation in observations),
        default=1,
    )
    seed_count = max(
        [observation.seed_index for observation in observations] + target_seed_indexes,
        default=-1,
    ) + 1
    return (
        _summary_vector_from_observations(
            observations,
            map_width=max(1, inferred_width),
            map_height=max(1, inferred_height),
            seed_count=max(1, seed_count),
        ),
        artifact.regime_vector,
    )


def _load_v2_training_pairs(
    dataset: SyntheticEpisodeDatasetRef,
) -> tuple[np.ndarray, np.ndarray]:
    if dataset.index_path is None:
        raise ValueError("synthetic dataset requires an index path")
    index_table = pl.read_parquet(dataset.index_path)
    summary_vectors: list[np.ndarray] = []
    regime_vectors: list[np.ndarray] = []
    for path_value in index_table["episode_path"].to_list():
        summary_vector, regime_vector = _summary_vector_from_artifact_v2(Path(str(path_value)))
        summary_vectors.append(summary_vector)
        regime_vectors.append(regime_vector)
    if not summary_vectors:
        raise ValueError("synthetic dataset did not yield any summary vectors")
    return np.stack(summary_vectors, axis=0), np.stack(regime_vectors, axis=0)


def _fit_refined_student_components(
    dataset: SyntheticEpisodeDatasetRef,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
    summary_mean = np.mean(summary_matrix, axis=0)
    summary_scale = np.std(summary_matrix, axis=0)
    summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
    normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]

    regime_mean = np.mean(regime_matrix, axis=0)
    centered_regime = regime_matrix - regime_mean[None, :]
    gram = normalized_summary.T @ normalized_summary
    rhs = normalized_summary.T @ centered_regime
    projection = np.linalg.solve(
        gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
        rhs,
    )
    regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
    regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
    regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
    return (
        summary_matrix,
        regime_matrix,
        summary_mean.astype(np.float64),
        summary_scale.astype(np.float64),
        regime_mean.astype(np.float64),
        np.asarray(projection, dtype=np.float64),
        np.asarray(regime_clip, dtype=np.float64),
    )


def _fit_attention_refined_student_components(
    dataset: SyntheticEpisodeDatasetRef,
    *,
    ridge_alpha: float,
    inducing_count: int,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    if dataset.index_path is None:
        raise ValueError("synthetic dataset requires an index path")
    index_table = pl.read_parquet(dataset.index_path)
    if index_table.height == 0:
        raise ValueError("synthetic dataset did not yield any episodes")

    episode_rows: list[tuple[np.ndarray, tuple[np.ndarray, ...], np.ndarray]] = []
    token_rows: list[np.ndarray] = []
    for path_value in index_table["episode_path"].to_list():
        artifact = load_synthetic_episode(Path(str(path_value)))
        observations = list(artifact.observations)
        target_seed_indexes = [int(seed_index) for seed_index in artifact.target_sources]
        inferred_width = artifact.map_width or max(
            (observation.viewport.x + observation.viewport.w for observation in observations),
            default=1,
        )
        inferred_height = artifact.map_height or max(
            (observation.viewport.y + observation.viewport.h for observation in observations),
            default=1,
        )
        seed_count = max(
            [observation.seed_index for observation in observations] + target_seed_indexes,
            default=-1,
        ) + 1
        resolved_width = max(1, inferred_width)
        resolved_height = max(1, inferred_height)
        resolved_seed_count = max(1, seed_count)
        base_summary = _summary_vector_from_observations(
            observations,
            map_width=resolved_width,
            map_height=resolved_height,
            seed_count=resolved_seed_count,
        )
        token_groups = _observation_token_groups(
            observations,
            map_width=resolved_width,
            map_height=resolved_height,
            seed_count=resolved_seed_count,
        )
        for token_matrix in token_groups:
            if token_matrix.shape[0] > 0:
                token_rows.append(token_matrix)
        episode_rows.append(
            (
                base_summary,
                token_groups,
                np.asarray(artifact.regime_vector, dtype=np.float64),
            ),
        )

    all_tokens = (
        np.concatenate(token_rows, axis=0)
        if token_rows
        else np.zeros((1, _OBSERVATION_FEATURE_DIM), dtype=np.float64)
    )
    token_feature_mean = np.mean(all_tokens, axis=0)
    token_feature_scale = np.std(all_tokens, axis=0)
    token_feature_scale = np.where(token_feature_scale > 1e-6, token_feature_scale, 1.0)
    normalized_tokens = (all_tokens - token_feature_mean[None, :]) / token_feature_scale[None, :]
    inducing_points = _select_inducing_points(
        normalized_tokens,
        inducing_count=inducing_count,
    )

    summary_matrix = np.stack(
        [
            np.concatenate(
                [
                    base_summary,
                    np.concatenate(
                        [
                            _attention_pool_features(
                                token_matrix,
                                token_feature_mean=token_feature_mean,
                                token_feature_scale=token_feature_scale,
                                inducing_points=inducing_points,
                            )
                            for token_matrix in token_groups
                        ],
                        axis=0,
                    ),
                ],
                axis=0,
            ).astype(np.float64)
            for base_summary, token_groups, _ in episode_rows
        ],
        axis=0,
    )
    regime_matrix = np.stack([regime_vector for _, _, regime_vector in episode_rows], axis=0)

    summary_mean = np.mean(summary_matrix, axis=0)
    summary_scale = np.std(summary_matrix, axis=0)
    summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
    normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]
    regime_mean = np.mean(regime_matrix, axis=0)
    centered_regime = regime_matrix - regime_mean[None, :]
    gram = normalized_summary.T @ normalized_summary
    rhs = normalized_summary.T @ centered_regime
    projection = np.linalg.solve(
        gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
        rhs,
    )
    regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
    regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
    regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
    return (
        summary_matrix.astype(np.float64),
        regime_matrix.astype(np.float64),
        summary_mean.astype(np.float64),
        summary_scale.astype(np.float64),
        regime_mean.astype(np.float64),
        np.asarray(projection, dtype=np.float64),
        np.asarray(regime_clip, dtype=np.float64),
        token_feature_mean.astype(np.float64),
        token_feature_scale.astype(np.float64),
        inducing_points.astype(np.float64),
    )


def _observation_grid_loglikelihood(
    predictive_tensor: np.ndarray,
    observation: LiveQueryObs,
    *,
    class_floor: float,
    class_weights: np.ndarray,
) -> float:
    viewport = observation.viewport
    patch = np.asarray(
        predictive_tensor[
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
            :,
        ],
        dtype=np.float64,
    )
    observed_classes = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
    class_probabilities = np.take_along_axis(
        patch,
        observed_classes[..., None],
        axis=-1,
    ).reshape(-1)
    observation_weights = np.asarray(class_weights[observed_classes.reshape(-1)], dtype=np.float64)
    safe_probabilities = np.clip(class_probabilities, class_floor, 1.0)
    if safe_probabilities.size == 0:
        return 0.0
    weight_sum = float(np.sum(observation_weights))
    if not np.isfinite(weight_sum) or weight_sum <= 0.0:
        return float(np.mean(np.log(safe_probabilities)))
    return float(np.sum(observation_weights * np.log(safe_probabilities)) / weight_sum)


def _posterior_reweighted_by_observations(
    context: LiveInferenceContext,
    *,
    teacher: object,
    particles: tuple[np.ndarray, ...],
    base_weights: np.ndarray,
    observation_weight: float,
    observation_class_floor: float,
    observation_class_weights: np.ndarray,
) -> np.ndarray:
    if observation_weight <= 0.0 or not context.observations:
        return np.asarray(base_weights, dtype=np.float64)
    terminal_tensor = getattr(teacher, "terminal_tensor", None)
    if not callable(terminal_tensor):
        return np.asarray(base_weights, dtype=np.float64)

    seed_cache: dict[int, list[np.ndarray]] = {}
    log_likelihoods = np.zeros(len(particles), dtype=np.float64)
    for particle_index in range(len(particles)):
        total_log_likelihood = 0.0
        for observation in context.observations:
            per_seed = seed_cache.setdefault(observation.seed_index, [])
            while len(per_seed) <= particle_index:
                seed = context.round_context.seeds[observation.seed_index]
                per_seed.append(
                    np.asarray(terminal_tensor(seed, particles[len(per_seed)]), dtype=np.float64),
                )
            total_log_likelihood += _observation_grid_loglikelihood(
                per_seed[particle_index],
                observation,
                class_floor=observation_class_floor,
                class_weights=observation_class_weights,
            )
        log_likelihoods[particle_index] = total_log_likelihood

    log_prior = np.log(np.clip(np.asarray(base_weights, dtype=np.float64), 1e-12, None))
    centered_log_likelihoods = log_likelihoods - float(np.mean(log_likelihoods))
    logits = log_prior + observation_weight * centered_log_likelihoods
    logits = logits - float(np.max(logits))
    refined = np.exp(np.clip(logits, -60.0, 0.0))
    total = float(np.sum(refined))
    if not np.isfinite(total) or total <= 0.0:
        return np.asarray(base_weights, dtype=np.float64)
    return np.asarray(refined / total, dtype=np.float64)


class SummaryBankStudentCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    teacher_checkpoint_path: str
    k_neighbors: int = Field(ge=1)
    sample_count: int = Field(ge=0)
    summary_dim: int = Field(ge=1)
    regime_dim: int = Field(ge=1)


class SummaryBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "summary_bank_student_v1"
    dataset_name: str = "synthetic_live_v1"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    teacher: HazardTeacher

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: HazardTeacher,
        *,
        k_neighbors: int = 5,
    ) -> SummaryBankStudent:
        if dataset.index_path is None:
            raise ValueError("synthetic dataset requires an index path")
        index_table = pl.read_parquet(dataset.index_path)
        summary_vectors: list[np.ndarray] = []
        regime_vectors: list[np.ndarray] = []
        for path_value in index_table["episode_path"].to_list():
            summary_vector, regime_vector = _summary_vector_from_artifact(Path(str(path_value)))
            summary_vectors.append(summary_vector)
            regime_vectors.append(regime_vector)
        if not summary_vectors:
            raise ValueError("synthetic dataset did not yield any summary vectors")
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=np.stack(summary_vectors, axis=0),
            regime_vectors=np.stack(regime_vectors, axis=0),
            k_neighbors=k_neighbors,
            teacher=teacher,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        teacher_checkpoint_path: Path,
    ) -> SummaryBankStudentCheckpoint:
        return SummaryBankStudentCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            k_neighbors=self.k_neighbors,
            sample_count=int(self.summary_vectors.shape[0]),
            summary_dim=int(self.summary_vectors.shape[1]),
            regime_dim=int(self.regime_vectors.shape[1]),
        )

    def save_checkpoint(self, checkpoint_dir: Path, teacher_checkpoint_path: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "bank.npz"
        json_path = checkpoint_dir / "summary_bank_student.json"
        np.savez_compressed(
            npz_path,
            summary_vectors=self.summary_vectors,
            regime_vectors=self.regime_vectors,
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(npz_path, teacher_checkpoint_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = _summary_vector_from_evidence(context.evidence_bundle)
        distances = np.linalg.norm(self.summary_vectors - query_vector[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        mean = np.tensordot(weights, self.regime_vectors[order], axes=(0, 0))
        particles = tuple(self.regime_vectors[index] for index in order)
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetBankStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_bank_student_v2"
    dataset_name: str = "synthetic_live_v2"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
    ) -> ObservationSetBankStudent:
        summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale.astype(np.float64),
            k_neighbors=k_neighbors,
            teacher=teacher,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        normalized_query = (query_vector - self.summary_mean) / self.summary_scale
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        nearest_distances = distances[order]
        weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        weights = weights / np.sum(weights)
        mean = np.tensordot(weights, self.regime_vectors[order], axes=(0, 0))
        particles = tuple(self.regime_vectors[index] for index in order)
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetDistilledStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_distilled_student_v3"
    dataset_name: str = "synthetic_live_v3"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=8.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 8.0,
        predicted_particle_weight: float = 0.35,
    ) -> ObservationSetDistilledStudent:
        summary_matrix, regime_matrix = _load_v2_training_pairs(dataset)
        summary_mean = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        normalized_summary = (summary_matrix - summary_mean[None, :]) / summary_scale[None, :]

        regime_mean = np.mean(regime_matrix, axis=0)
        centered_regime = regime_matrix - regime_mean[None, :]
        gram = normalized_summary.T @ normalized_summary
        rhs = normalized_summary.T @ centered_regime
        projection = np.linalg.solve(
            gram + ridge_alpha * np.eye(gram.shape[0], dtype=np.float64),
            rhs,
        )
        regime_clip = np.percentile(np.abs(centered_regime), 95.0, axis=0)
        regime_clip = np.maximum(regime_clip, np.max(np.abs(centered_regime), axis=0))
        regime_clip = np.where(regime_clip > 1e-6, regime_clip, 1.0)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean.astype(np.float64),
            summary_scale=summary_scale.astype(np.float64),
            regime_mean=regime_mean.astype(np.float64),
            regime_projection=np.asarray(projection, dtype=np.float64),
            regime_clip=np.asarray(regime_clip, dtype=np.float64),
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            teacher=teacher,
        )

    def _predict_regime_mean(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        normalized_query = (query_vector - self.summary_mean) / self.summary_scale
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        predicted_mean = self._predict_regime_mean(context)
        distances = np.linalg.norm(self.regime_vectors - predicted_mean[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_refined_student_v4"
    dataset_name: str = "synthetic_live_v4"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=16.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 16.0,
        predicted_particle_weight: float = 0.5,
    ) -> ObservationSetRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
        ) = _fit_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
        )
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetParticleRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_particle_refined_student_v5"
    dataset_name: str = "synthetic_live_v5"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    observation_weight: float = Field(default=8.0, gt=0.0)
    observation_class_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    observation_class_weights: np.ndarray = Field(
        default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64),
    )
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        k_neighbors: int = 5,
        ridge_alpha: float = 32.0,
        predicted_particle_weight: float = 0.7,
        observation_weight: float = 8.0,
        observation_class_floor: float = 0.01,
        observation_class_weights: np.ndarray | None = None,
    ) -> ObservationSetParticleRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
        ) = _fit_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
        )
        resolved_class_weights = (
            np.asarray(observation_class_weights, dtype=np.float64)
            if observation_class_weights is not None
            else np.ones(CLASS_COUNT, dtype=np.float64)
        )
        if resolved_class_weights.shape != (CLASS_COUNT,):
            msg = (
                "observation_class_weights must have shape "
                f"({CLASS_COUNT},), got {resolved_class_weights.shape!r}"
            )
            raise ValueError(msg)
        resolved_class_weights = np.clip(resolved_class_weights, 1e-6, None)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_floor=observation_class_floor,
            observation_class_weights=resolved_class_weights,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _summary_vector_from_observations(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        refined_weights = _posterior_reweighted_by_observations(
            context,
            teacher=self.teacher,
            particles=particles,
            base_weights=weights,
            observation_weight=self.observation_weight,
            observation_class_floor=self.observation_class_floor,
            observation_class_weights=self.observation_class_weights,
        )
        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(refined_weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(refined_weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )


class ObservationSetAttentionParticleRefinedStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "observation_set_attention_particle_refined_student_v1"
    dataset_name: str = "synthetic_live_v6"
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    regime_mean: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_projection: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    regime_clip: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    token_feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros(_OBSERVATION_FEATURE_DIM, dtype=np.float64))
    token_feature_scale: np.ndarray = Field(default_factory=lambda: np.ones(_OBSERVATION_FEATURE_DIM, dtype=np.float64))
    inducing_points: np.ndarray = Field(default_factory=lambda: np.zeros((1, _OBSERVATION_FEATURE_DIM), dtype=np.float64))
    inducing_count: int = Field(default=6, ge=1)
    k_neighbors: int = Field(default=5, ge=1)
    ridge_alpha: float = Field(default=32.0, gt=0.0)
    predicted_particle_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    observation_weight: float = Field(default=8.0, gt=0.0)
    observation_class_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    observation_class_weights: np.ndarray = Field(
        default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64),
    )
    teacher: object

    @classmethod
    def fit_from_dataset(
        cls,
        dataset: SyntheticEpisodeDatasetRef,
        teacher: object,
        *,
        inducing_count: int = 6,
        k_neighbors: int = 5,
        ridge_alpha: float = 32.0,
        predicted_particle_weight: float = 0.7,
        observation_weight: float = 8.0,
        observation_class_floor: float = 0.01,
        observation_class_weights: np.ndarray | None = None,
    ) -> ObservationSetAttentionParticleRefinedStudent:
        (
            summary_matrix,
            regime_matrix,
            summary_mean,
            summary_scale,
            regime_mean,
            projection,
            regime_clip,
            token_feature_mean,
            token_feature_scale,
            inducing_points,
        ) = _fit_attention_refined_student_components(
            dataset,
            ridge_alpha=ridge_alpha,
            inducing_count=inducing_count,
        )
        resolved_class_weights = (
            np.asarray(observation_class_weights, dtype=np.float64)
            if observation_class_weights is not None
            else np.ones(CLASS_COUNT, dtype=np.float64)
        )
        if resolved_class_weights.shape != (CLASS_COUNT,):
            msg = (
                "observation_class_weights must have shape "
                f"({CLASS_COUNT},), got {resolved_class_weights.shape!r}"
            )
            raise ValueError(msg)
        resolved_class_weights = np.clip(resolved_class_weights, 1e-6, None)
        return cls(
            dataset_name=dataset.dataset_name,
            summary_vectors=summary_matrix,
            regime_vectors=regime_matrix,
            summary_mean=summary_mean,
            summary_scale=summary_scale,
            regime_mean=regime_mean,
            regime_projection=projection,
            regime_clip=regime_clip,
            token_feature_mean=token_feature_mean,
            token_feature_scale=token_feature_scale,
            inducing_points=inducing_points,
            inducing_count=inducing_points.shape[0],
            k_neighbors=k_neighbors,
            ridge_alpha=ridge_alpha,
            predicted_particle_weight=predicted_particle_weight,
            observation_weight=observation_weight,
            observation_class_floor=observation_class_floor,
            observation_class_weights=resolved_class_weights,
            teacher=teacher,
        )

    def _normalized_query_vector(self, context: LiveInferenceContext) -> np.ndarray:
        query_vector = _attention_augmented_summary_vector(
            context.observations,
            map_width=context.round_context.map_width,
            map_height=context.round_context.map_height,
            seed_count=len(context.round_context.seeds),
            token_feature_mean=self.token_feature_mean,
            token_feature_scale=self.token_feature_scale,
            inducing_points=self.inducing_points,
        )
        return np.asarray((query_vector - self.summary_mean) / self.summary_scale, dtype=np.float64)

    def _predict_regime_mean(self, normalized_query: np.ndarray) -> np.ndarray:
        predicted = self.regime_mean + normalized_query @ self.regime_projection
        clip = 1.5 * self.regime_clip
        return np.clip(
            np.asarray(predicted, dtype=np.float64),
            self.regime_mean - clip,
            self.regime_mean + clip,
        )

    def infer_regime(self, context: LiveInferenceContext) -> RegimePosteriorState:
        normalized_query = self._normalized_query_vector(context)
        predicted_mean = self._predict_regime_mean(normalized_query)
        normalized_bank = (self.summary_vectors - self.summary_mean[None, :]) / self.summary_scale[None, :]
        distances = np.linalg.norm(normalized_bank - normalized_query[None, :], axis=1)
        order = np.argsort(distances)[: min(self.k_neighbors, len(distances))]
        if len(order) == 0:
            return RegimePosteriorState(mean=predicted_mean)

        nearest_distances = distances[order]
        neighbor_weights = 1.0 / np.clip(nearest_distances, 1e-6, None)
        if not np.all(np.isfinite(neighbor_weights)) or float(np.sum(neighbor_weights)) <= 0.0:
            neighbor_weights = np.ones(len(order), dtype=np.float64)
        neighbor_weights = neighbor_weights / np.sum(neighbor_weights)

        if self.predicted_particle_weight > 0.0:
            particles = (predicted_mean,) + tuple(self.regime_vectors[index] for index in order)
            weights = np.concatenate(
                [
                    np.asarray([self.predicted_particle_weight], dtype=np.float64),
                    (1.0 - self.predicted_particle_weight) * neighbor_weights,
                ],
                axis=0,
            )
        else:
            particles = tuple(self.regime_vectors[index] for index in order)
            weights = neighbor_weights

        refined_weights = _posterior_reweighted_by_observations(
            context,
            teacher=self.teacher,
            particles=particles,
            base_weights=weights,
            observation_weight=self.observation_weight,
            observation_class_floor=self.observation_class_floor,
            observation_class_weights=self.observation_class_weights,
        )
        particle_matrix = np.stack(particles, axis=0)
        mean = np.tensordot(refined_weights, particle_matrix, axes=(0, 0))
        return RegimePosteriorState(
            mean=np.asarray(mean, dtype=np.float64),
            particles=particles,
            weights=np.asarray(refined_weights, dtype=np.float64),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
        )
