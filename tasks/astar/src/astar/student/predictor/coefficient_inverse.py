"""Coefficient Inverse Problem Predictor.

Radical approach: directly estimate the hazard teacher's coefficient vector from
observations, then decode to full spatial prediction using the physics model.

Instead of a generic regression correction, we solve the inverse problem:
"Given observations of the final state, what were the hidden dynamics parameters?"

The coefficient vector is only 12-dimensional (for 3 feature dims), so this is a
very well-conditioned inverse problem when we have 50+ observed cells.
"""
from __future__ import annotations

import json
import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.summaries.round_coefficients import (
    seed_feature_dict,
    seed_feature_matrix,
    seed_feature_names,
)
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher

# ---------------------------------------------------------------------------
# Model names
# ---------------------------------------------------------------------------
COEFF_INVERSE_ALIAS = "coefficient_inverse"
COEFF_INVERSE_V1 = "coefficient_inverse_v1"
COEFF_INVERSE_V2 = "coefficient_inverse_v2"
COEFF_INVERSE_V3 = "coefficient_inverse_v3"
COEFF_INVERSE_V4 = "coefficient_inverse_v4"

COEFF_INVERSE_MODEL_NAMES = frozenset({
    COEFF_INVERSE_ALIAS,
    COEFF_INVERSE_V1,
    COEFF_INVERSE_V2,
    COEFF_INVERSE_V3,
    COEFF_INVERSE_V4,
})

def resolve_coeff_inverse_samples_per_round(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> int | None:
    spec = resolve_coeff_inverse_variant_spec(model_name, samples_per_round=samples_per_round)
    return spec.samples_per_round


COEFF_INVERSE_MODEL_CHOICE_LIST = [
    COEFF_INVERSE_ALIAS,
    COEFF_INVERSE_V1,
    COEFF_INVERSE_V2,
    COEFF_INVERSE_V3,
    COEFF_INVERSE_V4,
]


class CoeffInverseVariantSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    samples_per_round: int = Field(default=4, ge=1)
    ridge_alpha: float = Field(default=0.1, ge=0.0)
    prior_blend: float = Field(default=0.0, ge=0.0, le=1.0)
    prob_floor: float = Field(default=0.005, ge=0.0)
    n_optim_iters: int = Field(default=50, ge=1)
    learning_rate: float = Field(default=0.1, gt=0.0)
    use_gradient_descent: bool = False  # True = gradient optimization; False = least squares


def is_coeff_inverse_model_name(model_name: str) -> bool:
    return model_name.strip().lower() in COEFF_INVERSE_MODEL_NAMES


def resolve_coeff_inverse_variant_spec(
    model_name: str,
    *,
    samples_per_round: int | None = None,
) -> CoeffInverseVariantSpec:
    normalized = model_name.strip().lower()
    if normalized not in COEFF_INVERSE_MODEL_NAMES:
        msg = f"unsupported coefficient_inverse model: {model_name}"
        raise ValueError(msg)

    specs = {
        COEFF_INVERSE_V1: CoeffInverseVariantSpec(
            model_name=COEFF_INVERSE_V1,
            samples_per_round=4,
            ridge_alpha=0.1,
            prior_blend=0.0,
            prob_floor=0.005,
            use_gradient_descent=False,
        ),
        COEFF_INVERSE_V2: CoeffInverseVariantSpec(
            model_name=COEFF_INVERSE_V2,
            samples_per_round=4,
            ridge_alpha=1.0,
            prior_blend=0.05,
            prob_floor=0.005,
            use_gradient_descent=False,
        ),
        COEFF_INVERSE_V3: CoeffInverseVariantSpec(
            model_name=COEFF_INVERSE_V3,
            samples_per_round=8,
            ridge_alpha=0.01,
            prior_blend=0.0,
            prob_floor=0.003,
            use_gradient_descent=True,
            n_optim_iters=100,
            learning_rate=0.05,
        ),
        COEFF_INVERSE_V4: CoeffInverseVariantSpec(
            model_name=COEFF_INVERSE_V4,
            samples_per_round=8,
            ridge_alpha=0.5,
            prior_blend=0.1,
            prob_floor=0.005,
            use_gradient_descent=False,
        ),
    }
    resolved_name = normalized if normalized != COEFF_INVERSE_ALIAS else COEFF_INVERSE_V1
    spec = specs.get(resolved_name, specs[COEFF_INVERSE_V1])

    if samples_per_round is not None:
        spec = spec.model_copy(update={"samples_per_round": samples_per_round})

    return spec


# ---------------------------------------------------------------------------
# Inverse problem solver
# ---------------------------------------------------------------------------


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -25.0, 25.0)))


def _solve_coefficient_least_squares(
    observations: list[LiveQueryObs],
    round_detail: RoundDetail,
    feature_names: list[str],
    prior_coefficients: np.ndarray,
    ridge_alpha: float,
) -> np.ndarray:
    """Solve for coefficient vector that best explains observed cells.

    For each observed cell, we have the observed class and the feature vector.
    We want to find coefficients (build_intercept, build_coef, port_intercept,
    port_coef, ruin_intercept, ruin_coef) that maximize the likelihood of
    the observed classes.

    We linearize the problem: for each observed buildable cell,
    - If observed as settlement/port/ruin: build_score should be high
    - If observed as empty/forest: build_score should be low
    - Among built cells: port/ruin vs settlement discrimination

    We solve this as weighted least squares in logit space.
    """
    feature_dim = len(feature_names)
    coeff_dim = 3 + 3 * feature_dim  # intercepts + feature coefficients for build/port/ruin

    # Collect observed data points per seed
    build_features = []
    build_targets = []
    port_features = []
    port_targets = []
    ruin_features = []
    ruin_targets = []
    weights = []

    for obs in observations:
        seed_index = obs.seed_index
        initial_state = round_detail.initial_states[seed_index]
        feat_dict = seed_feature_dict(initial_state)
        _, feat_stack = seed_feature_matrix(initial_state)  # (F, H, W)

        viewport = obs.viewport
        grid = np.asarray(obs.grid, dtype=np.int64)
        collapsed = collapse_internal_grid(grid)

        for dy in range(viewport.h):
            for dx in range(viewport.w):
                y = viewport.y + dy
                x = viewport.x + dx
                if 0 <= y < round_detail.map_height and 0 <= x < round_detail.map_width:
                    if feat_dict["buildable"][y, x] < 0.5:
                        continue  # Skip non-buildable cells

                    cell_features = feat_stack[:, y, x]  # (F,)
                    observed_class = int(collapsed[dy, dx])

                    # Build target: 1 if settlement/port/ruin, 0 otherwise
                    is_built = 1.0 if observed_class in (1, 2, 3) else 0.0
                    build_features.append(cell_features)
                    build_targets.append(is_built)

                    # Port target (conditional on built): 1 if port
                    if observed_class in (1, 2, 3):
                        is_port = 1.0 if observed_class == 2 else 0.0
                        port_features.append(cell_features)
                        port_targets.append(is_port)

                    # Ruin target (conditional on built): 1 if ruin
                    if observed_class in (1, 2, 3):
                        is_ruin = 1.0 if observed_class == 3 else 0.0
                        ruin_features.append(cell_features)
                        ruin_targets.append(is_ruin)

                    weights.append(1.0)

    if not build_features:
        return prior_coefficients.copy()

    # Solve for build coefficients
    build_X = np.array(build_features)  # (N, F)
    build_y = np.array(build_targets)
    build_intercept, build_coef = _solve_ridge_logit(
        build_X, build_y, ridge_alpha, prior_coefficients[:1 + feature_dim]
    )

    # Solve for port coefficients
    if port_features:
        port_X = np.array(port_features)
        port_y = np.array(port_targets)
        offset = 1 + feature_dim
        port_intercept, port_coef = _solve_ridge_logit(
            port_X, port_y, ridge_alpha * 2.0,
            prior_coefficients[offset:offset + 1 + feature_dim]
        )
    else:
        offset = 1 + feature_dim
        port_intercept = prior_coefficients[offset]
        port_coef = prior_coefficients[offset + 1:offset + 1 + feature_dim]

    # Solve for ruin coefficients
    if ruin_features:
        ruin_X = np.array(ruin_features)
        ruin_y = np.array(ruin_targets)
        offset = 2 * (1 + feature_dim)
        ruin_intercept, ruin_coef = _solve_ridge_logit(
            ruin_X, ruin_y, ridge_alpha * 2.0,
            prior_coefficients[offset:offset + 1 + feature_dim]
        )
    else:
        offset = 2 * (1 + feature_dim)
        ruin_intercept = prior_coefficients[offset]
        ruin_coef = prior_coefficients[offset + 1:offset + 1 + feature_dim]

    return np.concatenate([
        np.array([build_intercept]),
        build_coef,
        np.array([port_intercept]),
        port_coef,
        np.array([ruin_intercept]),
        ruin_coef,
    ])


def _solve_ridge_logit(
    X: np.ndarray,
    y: np.ndarray,
    ridge_alpha: float,
    prior: np.ndarray,
) -> tuple[float, np.ndarray]:
    """Solve ridge regression in logit space with prior regularization."""
    n, d = X.shape
    # Augment with intercept
    design = np.concatenate([np.ones((n, 1)), X], axis=1)

    # Clip targets for logit transform
    y_clipped = np.clip(y, 0.01, 0.99)
    y_logit = np.log(y_clipped / (1.0 - y_clipped))

    # Ridge with prior
    penalty = np.eye(d + 1) * ridge_alpha
    penalty[0, 0] = 0.0  # Don't regularize intercept as hard

    # Prior in coefficient space
    prior_vec = np.zeros(d + 1)
    if prior.shape[0] == d + 1:
        prior_vec = prior.copy()
    elif prior.shape[0] == d:
        prior_vec[1:] = prior

    lhs = design.T @ design + penalty
    rhs = design.T @ y_logit + penalty @ prior_vec

    try:
        solution = np.linalg.solve(lhs, rhs)
    except np.linalg.LinAlgError:
        solution = np.linalg.pinv(lhs) @ rhs

    return float(solution[0]), solution[1:]


# ---------------------------------------------------------------------------
# Core model
# ---------------------------------------------------------------------------


class CoeffInversePredictor(BaseModel):
    """Predict by solving the inverse problem for the hazard teacher's coefficients."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "coefficient_inverse_v1"
    spec: CoeffInverseVariantSpec = Field(
        default_factory=lambda: CoeffInverseVariantSpec(model_name=COEFF_INVERSE_V1)
    )

    hazard_teacher: HazardTeacher | None = None
    prior_coefficients: np.ndarray = Field(
        default_factory=lambda: np.zeros(0, dtype=np.float64)
    )
    feature_names: list[str] = Field(default_factory=list)
    base_prior: HistoricalBucketPriorPredictor | None = None

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        seeds_count = round_detail.seeds_count
        observations = list(context.observations)

        # Solve inverse problem: estimate coefficients from observations
        estimated_coefficients = _solve_coefficient_least_squares(
            observations,
            round_detail,
            self.feature_names,
            self.prior_coefficients,
            self.spec.ridge_alpha,
        )

        # Generate predictions using the hazard teacher's physics model
        seed_predictions: dict[int, np.ndarray] = {}
        for seed_index in range(seeds_count):
            seed = context.round_context.seeds[seed_index]
            pred = self.hazard_teacher.terminal_tensor_from_coefficients(
                seed, estimated_coefficients
            )

            # Blend with base prior if configured
            if self.base_prior is not None and self.spec.prior_blend > 0:
                prior_bundle = self.base_prior.build_prediction_bundle(
                    round_detail,
                    context.geometry_bundle,
                    context.evidence_bundle,
                )
                if seed_index in prior_bundle.predictions:
                    prior_pred = prior_bundle.predictions[seed_index]
                    pred = (1.0 - self.spec.prior_blend) * pred + self.spec.prior_blend * prior_pred

            # Apply floor
            pred = apply_probability_floor(pred, floor=self.spec.prob_floor)
            seed_predictions[seed_index] = pred

        return PredictionBundle(
            round_id=round_detail.id,
            predictions=seed_predictions,
        )


# ---------------------------------------------------------------------------
# Factory / builder
# ---------------------------------------------------------------------------


def load_or_fit_coeff_inverse_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> CoeffInversePredictor:
    """Build coefficient-inverse predictor from replay data."""
    spec = resolve_coeff_inverse_variant_spec(model_name, samples_per_round=samples_per_round)
    workspace_paths = paths or WorkspacePaths.from_root(".")

    from astar.history.episodes.build import build_round_episode

    round_ids_list = list(historical_round_ids) if historical_round_ids else []
    if not round_ids_list:
        # Discover from replay summary directory
        replay_base = workspace_paths.derived_dir / "replay_summaries"
        if replay_base.exists():
            for d in sorted(replay_base.iterdir()):
                if d.is_dir() and d.name.startswith("round_id="):
                    rid = d.name[len("round_id="):]
                    round_ids_list.append(rid)

    # Build and fit hazard teacher from historical data
    episodes = []
    for rid in round_ids_list:
        try:
            episode = build_round_episode(workspace_paths, rid)
            episodes.append(episode)
        except Exception:
            continue

    teacher = HazardTeacher()
    if episodes:
        teacher = teacher.fit(episodes)

    # Compute prior coefficients (mean of historical)
    feature_names = seed_feature_names()
    if teacher.coefficient_bank.size > 0:
        prior_coefficients = np.mean(teacher.coefficient_bank, axis=0)
    else:
        coeff_dim = 3 + 3 * len(feature_names)
        prior_coefficients = np.zeros(coeff_dim, dtype=np.float64)

    # Build base prior
    base_prior = HistoricalBucketPriorPredictor.fit_from_workspace(
        workspace_paths,
        round_ids=round_ids_list,
    )

    return CoeffInversePredictor(
        name=spec.model_name,
        spec=spec,
        hazard_teacher=teacher,
        prior_coefficients=prior_coefficients,
        feature_names=feature_names,
        base_prior=base_prior,
    )


def load_or_fit_named_coeff_inverse_predictor(
    model_name: str,
    *,
    paths: WorkspacePaths | None = None,
    historical_round_ids: Sequence[str] | None = None,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> BaseRoundPredictor:
    """Entry point for the interactive predictor factory."""
    predictor = load_or_fit_coeff_inverse_predictor(
        model_name,
        paths=paths,
        historical_round_ids=historical_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    return _CoeffInverseRoundAdapter(
        name=predictor.name,
        predictor=predictor,
    )


class _CoeffInverseRoundAdapter(BaseRoundPredictor):
    """Adapts CoeffInversePredictor to BaseRoundPredictor interface."""

    predictor: CoeffInversePredictor

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        raise NotImplementedError("Use build_prediction_bundle_from_context instead")

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        return self.predictor.build_prediction_bundle_from_context(context)
