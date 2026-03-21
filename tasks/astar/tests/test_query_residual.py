from __future__ import annotations

import numpy as np

from astar.core.grid import Viewport
from astar.core.trajectory import LiveQueryObs
from astar.core.world_state import LiveSettlementObs
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    _owner_summary,
    _safe_log_probs,
    _settlement_means_from_observations,
)


def _query_observation(
    *,
    query_index: int,
    x: int,
    y: int,
    owner_id: int | None,
    population: float | None,
    food: float | None = None,
    wealth: float | None = None,
    defense: float | None = None,
) -> LiveQueryObs:
    return LiveQueryObs(
        round_id="round",
        seed_index=0,
        viewport=Viewport(x=x, y=y, w=1, h=1),
        grid=np.array([[1]], dtype=np.int64),
        settlements=(
            LiveSettlementObs(
                x=x,
                y=y,
                population=population,
                food=food,
                wealth=wealth,
                defense=defense,
                has_port=False,
                alive=True,
                owner_id=owner_id,
            ),
        ),
        query_index=query_index,
    )


def _old_postprocess_order(
    predictor: QueryResidualPredictor,
    prediction: np.ndarray,
    exact_counts: np.ndarray,
    prior: np.ndarray,
    teacher_prior: np.ndarray,
    *,
    effective_prior_blend: float,
    initial_grid: np.ndarray,
) -> np.ndarray:
    post = predictor._exact_cell_blend(prediction, exact_counts)
    if predictor.temperature != 1.0:
        post = softmax_logits(
            _safe_log_probs(post, predictor.probability_floor) / predictor.temperature,
        )
    if predictor.teacher_blend > 0.0:
        teacher_weight = np.where(
            np.sum(exact_counts, axis=-1, keepdims=True) > 0.0,
            0.0,
            predictor.teacher_blend,
        )
        post = ((1.0 - teacher_weight) * post) + (teacher_weight * teacher_prior)
    if effective_prior_blend > 0.0:
        post = ((1.0 - effective_prior_blend) * post) + (effective_prior_blend * prior)
    return apply_probability_floor(
        post,
        predictor.probability_floor,
        initial_grid=initial_grid,
    )


def test_postprocess_prediction_keeps_evidence_blend_last() -> None:
    predictor = QueryResidualPredictor.model_construct(
        name="query_residual_test",
        base_predictor=None,
        teacher=None,
        policy_name="coverage",
        round_ids=(),
        samples_per_round=1,
        cells_per_seed=1,
        budget_prefixes=(1,),
        blur_sigmas=(1.5, 4.0),
        ridge_lambda=1.0,
        probability_floor=0.01,
        temperature=1.15,
        prior_blend=0.35,
        signal_scale=0.12,
        min_delta_scale=0.4,
        residual_class_scale=np.ones(6, dtype=np.float64),
        teacher_blend=0.12,
        regime_intercept=np.zeros(1, dtype=np.float64),
        regime_weights=np.zeros((1, 1), dtype=np.float64),
        beta_min=8.0,
        beta_scale=24.0,
        training_episode_count=0,
        sample_count=0,
        feature_names=(),
        intercept=np.zeros(6, dtype=np.float64),
        coefficients=np.zeros((1, 6), dtype=np.float64),
    )
    prediction = np.array([[[0.05, 0.80, 0.05, 0.05, 0.03, 0.02]]], dtype=np.float64)
    prior = np.array([[[0.10, 0.70, 0.10, 0.05, 0.03, 0.02]]], dtype=np.float64)
    teacher_prior = np.array([[[0.08, 0.72, 0.09, 0.06, 0.03, 0.02]]], dtype=np.float64)
    exact_counts = np.zeros((1, 1, 6), dtype=np.float64)
    exact_counts[0, 0, 2] = 20.0
    initial_grid = np.array([[11]], dtype=np.int64)

    fixed = predictor._postprocess_prediction(
        prediction,
        exact_counts,
        prior,
        teacher_prior,
        effective_prior_blend=0.35,
        initial_grid=initial_grid,
    )
    old = _old_postprocess_order(
        predictor,
        prediction,
        exact_counts,
        prior,
        teacher_prior,
        effective_prior_blend=0.35,
        initial_grid=initial_grid,
    )

    assert float(fixed[0, 0, 2]) > float(old[0, 0, 2])
    assert int(np.argmax(fixed[0, 0])) == 2
    assert np.allclose(fixed.sum(axis=-1), 1.0)


def test_exact_cell_blend_uses_current_prediction_for_beta_strength() -> None:
    predictor = QueryResidualPredictor.model_construct(
        name="query_residual_test",
        base_predictor=None,
        teacher=None,
        policy_name="coverage",
        round_ids=(),
        samples_per_round=1,
        cells_per_seed=1,
        budget_prefixes=(1,),
        blur_sigmas=(1.5, 4.0),
        ridge_lambda=1.0,
        probability_floor=0.01,
        temperature=1.0,
        prior_blend=0.35,
        signal_scale=0.12,
        min_delta_scale=0.4,
        residual_class_scale=np.ones(6, dtype=np.float64),
        teacher_blend=0.0,
        regime_intercept=np.zeros(1, dtype=np.float64),
        regime_weights=np.zeros((1, 1), dtype=np.float64),
        beta_min=8.0,
        beta_scale=24.0,
        training_episode_count=0,
        sample_count=0,
        feature_names=(),
        intercept=np.zeros(6, dtype=np.float64),
        coefficients=np.zeros((1, 6), dtype=np.float64),
    )
    exact_counts = np.zeros((1, 1, 6), dtype=np.float64)
    exact_counts[0, 0, 2] = 5.0

    confident_prediction = np.array([[[0.01, 0.01, 0.95, 0.01, 0.01, 0.01]]], dtype=np.float64)
    diffuse_prediction = np.array([[[0.20, 0.20, 0.20, 0.15, 0.15, 0.10]]], dtype=np.float64)

    confident_blend = predictor._exact_cell_blend(confident_prediction, exact_counts)
    diffuse_blend = predictor._exact_cell_blend(diffuse_prediction, exact_counts)

    assert float(confident_blend[0, 0, 2]) > float(diffuse_blend[0, 0, 2])


def test_owner_summary_uses_unique_sites_not_raw_observation_count() -> None:
    repeated_site = tuple(
        _query_observation(
            query_index=query_index,
            x=0,
            y=0,
            owner_id=1,
            population=100.0,
        )
        for query_index in range(90)
    )
    other_site = (
        _query_observation(
            query_index=90,
            x=3,
            y=4,
            owner_id=2,
            population=200.0,
        ),
    )

    owner_count, largest_owner_share, owner_hhi = _owner_summary(repeated_site + other_site)

    assert owner_count == 0.2
    assert largest_owner_share == 0.5
    assert owner_hhi == 0.5


def test_settlement_means_use_site_averages_before_global_average() -> None:
    repeated_site = tuple(
        _query_observation(
            query_index=query_index,
            x=0,
            y=0,
            owner_id=1,
            population=100.0,
            food=20.0,
            wealth=30.0,
            defense=40.0,
        )
        for query_index in range(90)
    )
    other_site = (
        _query_observation(
            query_index=90,
            x=3,
            y=4,
            owner_id=2,
            population=200.0,
            food=60.0,
            wealth=90.0,
            defense=120.0,
        ),
    )

    mean_population, mean_food, mean_wealth, mean_defense = _settlement_means_from_observations(
        repeated_site + other_site,
    )

    assert mean_population == 150.0
    assert mean_food == 40.0
    assert mean_wealth == 60.0
    assert mean_defense == 80.0
