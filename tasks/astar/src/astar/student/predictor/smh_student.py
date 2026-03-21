from __future__ import annotations

import json
import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import load_synthetic_episode, resolve_synthetic_episode_path
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.query_residual import (
    CELL_SELECTION_TOP_ENTROPY,
    DEFAULT_BLUR_SIGMAS,
    DEFAULT_BUDGET_PREFIXES,
    GLOBAL_SUMMARY_INDEX,
    TranscriptDerivedFeatures,
    _build_static_feature_stack,
    _compose_design_tensor,
    _derive_transcript_features_from_stats,
    _ensure_synthetic_dataset,
    _fit_linear_map,
    _full_feature_names,
    _regime_input_names,
    _regime_input_vector,
    _regime_summary_names,
    _round_ids_with_analyses_and_replays,
    _safe_log_probs,
    _select_training_cells,
    _stats_from_observations,
    _stats_from_seed_evidence,
    _teacher_seed_adapter,
)
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


class SemhResidualStudentCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    base_model_name: str
    policy_name: str
    round_ids: list[str]
    samples_per_round: int = Field(ge=1)
    cells_per_seed: int = Field(ge=1)
    budget_prefixes: list[int]
    blur_sigmas: list[float]
    cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY
    ridge_lambda: float = Field(ge=0.0)
    probability_floor: float = Field(gt=0.0, lt=1.0)
    temperature: float = Field(gt=0.0)
    prior_blend: float = Field(ge=0.0, le=1.0)
    signal_scale: float = Field(gt=0.0)
    min_delta_scale: float = Field(ge=0.0, le=1.0)
    include_exact_local_residual: bool = False
    residual_class_scale: list[float]
    teacher_name: str
    teacher_feature_names: list[str]
    teacher_regime_intercept: list[float]
    teacher_regime_weights: list[list[float]]
    teacher_blend: float = Field(ge=0.0, le=1.0)
    teacher_locality_blend: bool = False
    regime_intercept: list[float]
    regime_weights: list[list[float]]
    beta_min: float = Field(ge=0.0)
    beta_scale: float = Field(ge=0.0)
    training_episode_count: int = Field(ge=0)
    sample_count: int = Field(ge=0)
    feature_names: list[str]
    coefficients: list[list[float]]
    intercept: list[float]


class SemhResidualStudentPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_residual_student_v1"
    base_model_name: str
    base_predictor: BaseRoundPredictor
    teacher: HazardTeacher
    policy_name: str = "coverage"
    round_ids: tuple[str, ...] = ()
    samples_per_round: int = Field(default=1, ge=1)
    cells_per_seed: int = Field(default=256, ge=1)
    budget_prefixes: tuple[int, ...] = DEFAULT_BUDGET_PREFIXES
    blur_sigmas: tuple[float, float] = DEFAULT_BLUR_SIGMAS
    cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY
    ridge_lambda: float = Field(default=8.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    temperature: float = Field(default=1.0, gt=0.0)
    prior_blend: float = Field(default=0.35, ge=0.0, le=1.0)
    signal_scale: float = Field(default=0.12, gt=0.0)
    min_delta_scale: float = Field(default=0.0, ge=0.0, le=1.0)
    include_exact_local_residual: bool = True
    residual_class_scale: np.ndarray = Field(
        default_factory=lambda: np.asarray([1.0, 0.65, 0.55, 0.55, 0.85, 1.0], dtype=np.float64),
    )
    teacher_blend: float = Field(default=0.08, ge=0.0, le=1.0)
    teacher_locality_blend: bool = True
    regime_intercept: np.ndarray = Field(
        default_factory=lambda: np.zeros(len(_regime_summary_names()), dtype=np.float64),
    )
    regime_weights: np.ndarray = Field(
        default_factory=lambda: np.zeros((len(_regime_input_names()), len(_regime_summary_names())), dtype=np.float64),
    )
    beta_min: float = Field(default=8.0, ge=0.0)
    beta_scale: float = Field(default=24.0, ge=0.0)
    training_episode_count: int = Field(default=0, ge=0)
    sample_count: int = Field(default=0, ge=0)
    feature_names: tuple[str, ...] = tuple(_full_feature_names(include_exact_local_residual=True))
    coefficients: np.ndarray = Field(
        default_factory=lambda: np.zeros(
            (len(_full_feature_names(include_exact_local_residual=True)), CLASS_COUNT),
            dtype=np.float64,
        ),
    )
    intercept: np.ndarray = Field(default_factory=lambda: np.zeros(CLASS_COUNT, dtype=np.float64))

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        base_predictor: BaseRoundPredictor,
        base_model_name: str,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        cells_per_seed: int = 256,
        budget_prefixes: Sequence[int] = DEFAULT_BUDGET_PREFIXES,
        blur_sigmas: Sequence[float] = DEFAULT_BLUR_SIGMAS,
        cell_selection_strategy: str = CELL_SELECTION_TOP_ENTROPY,
        ridge_lambda: float = 8.0,
        model_name: str = "smh_residual_student_v1",
        probability_floor: float = 0.01,
        temperature: float = 1.0,
        prior_blend: float = 0.20,
        signal_scale: float = 0.12,
        min_delta_scale: float = 0.0,
        include_exact_local_residual: bool = True,
        residual_class_scale: Sequence[float] = (1.0, 0.65, 0.55, 0.55, 0.85, 1.0),
        teacher_blend: float = 0.08,
        teacher_locality_blend: bool = True,
        beta_min: float = 8.0,
        beta_scale: float = 24.0,
    ) -> SemhResidualStudentPredictor:
        selected_round_ids = _round_ids_with_analyses_and_replays(paths, round_ids)
        if not selected_round_ids:
            raise ValueError("smh residual student requires at least one analyzed round with replay data")
        dataset_round_ids = _round_ids_with_analyses_and_replays(paths)

        teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(
            [build_round_episode(paths, round_id) for round_id in selected_round_ids],
        )
        index_path = _ensure_synthetic_dataset(
            paths,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            round_ids=dataset_round_ids,
        )
        index_table = pl.read_parquet(index_path).filter(pl.col("round_id").is_in(selected_round_ids))
        rows = index_table.to_dicts()
        if not rows:
            raise ValueError("smh residual student synthetic transcript dataset is empty for selected rounds")

        resolved_blur_sigmas = tuple(float(item) for item in blur_sigmas)
        resolved_budget_prefixes = tuple(int(item) for item in budget_prefixes)
        feature_dim = len(_full_feature_names(include_exact_local_residual=include_exact_local_residual))
        xtwx = np.zeros((feature_dim + 1, feature_dim + 1), dtype=np.float64)
        xtwy = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)
        training_episode_count = 0
        sample_count = 0
        training_prefixes: list[tuple[dict[str, object], TranscriptDerivedFeatures, np.ndarray, PredictionBundle]] = []

        round_cache: dict[str, dict[str, object]] = {}
        for row in rows:
            round_id = str(row["round_id"])
            cached = round_cache.get(round_id)
            if cached is None:
                round_detail = read_round_record(paths, round_id).round
                features = compute_round_features(round_detail)
                analyses = read_analysis_records(paths, round_id)
                if not analyses:
                    continue
                ground_truths: dict[int, np.ndarray] = {}
                row_weights: dict[int, np.ndarray] = {}
                selected_indices: dict[int, np.ndarray] = {}
                static_stacks: dict[int, np.ndarray] = {}
                for seed_index, analysis in analyses.items():
                    ground_truth = np.asarray(analysis.analysis.ground_truth, dtype=np.float64)
                    ground_truths[seed_index] = ground_truth
                    row_weights[seed_index] = (
                        0.05 + np.asarray(entropy_map(ground_truth), dtype=np.float64).reshape(-1) / math.log(CLASS_COUNT)
                    )
                    selected_indices[seed_index] = _select_training_cells(
                        ground_truth,
                        round_detail,
                        seed_index,
                        cells_per_seed=cells_per_seed,
                        selection_strategy=cell_selection_strategy,
                    )
                    static_stacks[seed_index] = _build_static_feature_stack(round_detail, features, seed_index)
                cached = {
                    "round_detail": round_detail,
                    "features": features,
                    "analyses": analyses,
                    "ground_truths": ground_truths,
                    "row_weights": row_weights,
                    "selected_indices": selected_indices,
                    "static_stacks": static_stacks,
                }
                round_cache[round_id] = cached

            artifact = load_synthetic_episode(
                resolve_synthetic_episode_path(index_path, Path(str(row["episode_path"]))),
            )
            full_observations = tuple(artifact.observations)
            budget_values = sorted({min(value, len(full_observations)) for value in resolved_budget_prefixes})
            for budget in budget_values:
                observations = full_observations[:budget]
                round_detail = cached["round_detail"]
                features = cached["features"]
                evidence_bundle = build_round_evidence_from_observations(
                    round_detail,
                    observations,
                )
                prior_bundle = base_predictor.build_prediction_bundle(
                    round_detail,
                    features,
                    evidence_bundle,
                )
                derived = _derive_transcript_features_from_stats(
                    round_detail,
                    features,
                    prior_bundle,
                    _stats_from_observations(round_detail, observations),
                    blur_sigmas=resolved_blur_sigmas,
                    include_exact_local_residual=include_exact_local_residual,
                )
                training_episode_count += 1
                training_prefixes.append(
                    (
                        cached,
                        derived,
                        np.asarray(artifact.regime_vector, dtype=np.float64),
                        prior_bundle,
                    ),
                )

        if not training_prefixes:
            raise ValueError("smh residual student did not produce any training prefixes")

        regime_inputs = np.stack([_regime_input_vector(derived) for _, derived, _, _ in training_prefixes], axis=0)
        regime_targets = np.stack([target for _, _, target, _ in training_prefixes], axis=0)
        regime_intercept, regime_weights = _fit_linear_map(
            regime_inputs,
            regime_targets,
            ridge_alpha=max(ridge_lambda, 1e-3),
        )

        for cached, derived, _, prior_bundle in training_prefixes:
            round_detail = cached["round_detail"]
            predicted_regime = np.asarray(
                regime_intercept + (_regime_input_vector(derived) @ regime_weights),
                dtype=np.float64,
            )
            predicted_regime = np.clip(predicted_regime, -0.25, 1.25)
            for seed_index in cached["analyses"]:
                teacher_prior = teacher.terminal_tensor(
                    _teacher_seed_adapter(round_detail, seed_index),
                    predicted_regime,
                )
                design = _compose_design_tensor(
                    cached["static_stacks"][seed_index],
                    prior_bundle.predictions_by_seed[seed_index],
                    teacher_prior,
                    derived,
                    predicted_regime,
                    seed_index=seed_index,
                    probability_floor=probability_floor,
                )
                flat_design = design.reshape(-1, feature_dim)
                selected = cached["selected_indices"][seed_index]
                batch_x = flat_design[selected]
                ground_truth = cached["ground_truths"][seed_index]
                prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
                batch_y = (
                    _safe_log_probs(ground_truth, probability_floor)
                    - _safe_log_probs(prior, probability_floor)
                ).reshape(-1, CLASS_COUNT)[selected]
                batch_w = cached["row_weights"][seed_index][selected]
                batch_aug = np.concatenate([np.ones((batch_x.shape[0], 1), dtype=np.float64), batch_x], axis=1)
                xtwx += batch_aug.T @ (batch_w[:, None] * batch_aug)
                xtwy += batch_aug.T @ (batch_w[:, None] * batch_y)
                sample_count += int(batch_x.shape[0])

        regularizer = np.eye(feature_dim + 1, dtype=np.float64)
        regularizer[0, 0] = 0.0
        regularizer *= ridge_lambda
        solved = np.linalg.solve(xtwx + regularizer + 1e-6 * np.eye(feature_dim + 1), xtwy)
        return cls(
            name=model_name,
            base_model_name=base_model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            policy_name=policy_name,
            round_ids=tuple(selected_round_ids),
            samples_per_round=samples_per_round,
            cells_per_seed=cells_per_seed,
            budget_prefixes=resolved_budget_prefixes,
            blur_sigmas=resolved_blur_sigmas,
            cell_selection_strategy=cell_selection_strategy,
            ridge_lambda=ridge_lambda,
            probability_floor=probability_floor,
            temperature=temperature,
            prior_blend=prior_blend,
            signal_scale=signal_scale,
            min_delta_scale=min_delta_scale,
            include_exact_local_residual=include_exact_local_residual,
            residual_class_scale=np.asarray(residual_class_scale, dtype=np.float64),
            teacher_blend=teacher_blend,
            teacher_locality_blend=teacher_locality_blend,
            regime_intercept=np.asarray(regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(regime_weights, dtype=np.float64),
            beta_min=beta_min,
            beta_scale=beta_scale,
            training_episode_count=training_episode_count,
            sample_count=sample_count,
            feature_names=tuple(_full_feature_names(include_exact_local_residual=include_exact_local_residual)),
            intercept=np.asarray(solved[0], dtype=np.float64),
            coefficients=np.asarray(solved[1:], dtype=np.float64),
        )

    @classmethod
    def load_checkpoint(
        cls,
        path: Path,
        *,
        base_predictor: BaseRoundPredictor,
    ) -> SemhResidualStudentPredictor:
        checkpoint = SemhResidualStudentCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        return cls(
            name=checkpoint.name,
            base_model_name=checkpoint.base_model_name,
            base_predictor=base_predictor,
            teacher=HazardTeacher(
                name=checkpoint.teacher_name,
                feature_names=list(checkpoint.teacher_feature_names),
                regime_intercept=np.asarray(checkpoint.teacher_regime_intercept, dtype=np.float64),
                regime_weights=np.asarray(checkpoint.teacher_regime_weights, dtype=np.float64),
            ),
            policy_name=checkpoint.policy_name,
            round_ids=tuple(checkpoint.round_ids),
            samples_per_round=checkpoint.samples_per_round,
            cells_per_seed=checkpoint.cells_per_seed,
            budget_prefixes=tuple(checkpoint.budget_prefixes),
            blur_sigmas=tuple(checkpoint.blur_sigmas),  # type: ignore[arg-type]
            cell_selection_strategy=checkpoint.cell_selection_strategy,
            ridge_lambda=checkpoint.ridge_lambda,
            probability_floor=checkpoint.probability_floor,
            temperature=checkpoint.temperature,
            prior_blend=checkpoint.prior_blend,
            signal_scale=checkpoint.signal_scale,
            min_delta_scale=checkpoint.min_delta_scale,
            include_exact_local_residual=checkpoint.include_exact_local_residual,
            residual_class_scale=np.asarray(checkpoint.residual_class_scale, dtype=np.float64),
            teacher_blend=checkpoint.teacher_blend,
            teacher_locality_blend=checkpoint.teacher_locality_blend,
            regime_intercept=np.asarray(checkpoint.regime_intercept, dtype=np.float64),
            regime_weights=np.asarray(checkpoint.regime_weights, dtype=np.float64),
            beta_min=checkpoint.beta_min,
            beta_scale=checkpoint.beta_scale,
            training_episode_count=checkpoint.training_episode_count,
            sample_count=checkpoint.sample_count,
            feature_names=tuple(checkpoint.feature_names),
            coefficients=np.asarray(checkpoint.coefficients, dtype=np.float64),
            intercept=np.asarray(checkpoint.intercept, dtype=np.float64),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        checkpoint = SemhResidualStudentCheckpoint(
            name=self.name,
            base_model_name=self.base_model_name,
            policy_name=self.policy_name,
            round_ids=list(self.round_ids),
            samples_per_round=self.samples_per_round,
            cells_per_seed=self.cells_per_seed,
            budget_prefixes=list(self.budget_prefixes),
            blur_sigmas=list(self.blur_sigmas),
            cell_selection_strategy=self.cell_selection_strategy,
            ridge_lambda=self.ridge_lambda,
            probability_floor=self.probability_floor,
            temperature=self.temperature,
            prior_blend=self.prior_blend,
            signal_scale=self.signal_scale,
            min_delta_scale=self.min_delta_scale,
            include_exact_local_residual=self.include_exact_local_residual,
            residual_class_scale=np.asarray(self.residual_class_scale, dtype=np.float64).tolist(),
            teacher_name=self.teacher.name,
            teacher_feature_names=list(self.teacher.feature_names),
            teacher_regime_intercept=np.asarray(self.teacher.regime_intercept, dtype=np.float64).tolist(),
            teacher_regime_weights=np.asarray(self.teacher.regime_weights, dtype=np.float64).tolist(),
            teacher_blend=self.teacher_blend,
            teacher_locality_blend=self.teacher_locality_blend,
            regime_intercept=np.asarray(self.regime_intercept, dtype=np.float64).tolist(),
            regime_weights=np.asarray(self.regime_weights, dtype=np.float64).tolist(),
            beta_min=self.beta_min,
            beta_scale=self.beta_scale,
            training_episode_count=self.training_episode_count,
            sample_count=self.sample_count,
            feature_names=list(self.feature_names),
            coefficients=np.asarray(self.coefficients, dtype=np.float64).tolist(),
            intercept=np.asarray(self.intercept, dtype=np.float64).tolist(),
        )
        path.write_text(json.dumps(to_jsonable(checkpoint), indent=2), encoding="utf-8")
        return path

    def _predict_from_derived(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        derived: TranscriptDerivedFeatures,
        prior_bundle: PredictionBundle,
    ) -> PredictionBundle:
        delta_scale = self._transcript_delta_scale(derived)
        effective_prior_blend = 1.0 - (delta_scale * (1.0 - self.prior_blend))
        inferred_regime = self._infer_regime_from_derived(derived)
        local_coverage_index = None
        if self.teacher_locality_blend:
            local_coverage_index = self.feature_names.index("local_blur40_coverage")
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in range(round_detail.seeds_count):
            static_stack = _build_static_feature_stack(round_detail, features, seed_index)
            prior = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            teacher_prior = self._teacher_prior_for_seed(round_detail, seed_index, inferred_regime)
            design = _compose_design_tensor(
                static_stack,
                prior,
                teacher_prior,
                derived,
                inferred_regime,
                seed_index=seed_index,
                probability_floor=self.probability_floor,
            )
            flat_design = design.reshape(-1, self.coefficients.shape[0])
            delta = (self.intercept[None, :] + flat_design @ np.asarray(self.coefficients, dtype=np.float64)).reshape(
                prior.shape,
            )
            delta *= delta_scale
            delta *= np.asarray(self.residual_class_scale, dtype=np.float64)[None, None, :]
            logits = _safe_log_probs(prior, self.probability_floor) + np.clip(delta, -4.0, 4.0)
            prediction = softmax_logits(logits)
            exact_counts = np.asarray(derived.exact_counts[seed_index], dtype=np.float64)
            prediction = self._exact_cell_blend(prediction, exact_counts, prior)
            if self.temperature != 1.0:
                prediction = softmax_logits(_safe_log_probs(prediction, self.probability_floor) / self.temperature)
            if self.teacher_blend > 0.0:
                teacher_weight = np.where(
                    np.sum(exact_counts, axis=-1, keepdims=True) > 0.0,
                    0.0,
                    self.teacher_blend,
                )
                if local_coverage_index is not None:
                    local_coverage = np.clip(
                        np.asarray(design[..., local_coverage_index : local_coverage_index + 1], dtype=np.float64),
                        0.0,
                        1.0,
                    )
                    teacher_weight = teacher_weight * delta_scale * local_coverage
                prediction = ((1.0 - teacher_weight) * prediction) + (teacher_weight * teacher_prior)
            if effective_prior_blend > 0.0:
                prediction = ((1.0 - effective_prior_blend) * prediction) + (effective_prior_blend * prior)
            predictions_by_seed[seed_index] = apply_probability_floor(prediction, self.probability_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def _infer_regime_from_derived(self, derived: TranscriptDerivedFeatures) -> np.ndarray:
        regime = np.asarray(
            self.regime_intercept + (_regime_input_vector(derived) @ self.regime_weights),
            dtype=np.float64,
        )
        return np.clip(regime, -0.25, 1.25)

    def _teacher_prior_for_seed(
        self,
        round_detail: RoundDetail,
        seed_index: int,
        inferred_regime: np.ndarray,
    ) -> np.ndarray:
        return np.asarray(
            self.teacher.terminal_tensor(
                _teacher_seed_adapter(round_detail, seed_index),
                inferred_regime,
            ),
            dtype=np.float64,
        )

    def _transcript_delta_scale(self, derived: TranscriptDerivedFeatures) -> float:
        summary = np.asarray(derived.global_summary, dtype=np.float64)
        signal_names = [
            "global_resid_settlement",
            "global_resid_ruin",
            "global_resid_port",
            "global_buildable_resid_settlement",
            "global_buildable_resid_ruin",
            "global_buildable_resid_port",
            "global_near_resid_settlement",
            "global_nonbuildable_resid_forest",
            "global_nonbuildable_resid_mountain",
        ]
        signal = float(
            np.linalg.norm(
                np.asarray(
                    [summary[GLOBAL_SUMMARY_INDEX[name]] for name in signal_names],
                    dtype=np.float64,
                ),
            ),
        )
        return float(np.clip(signal / self.signal_scale, self.min_delta_scale, 1.0))

    def _exact_cell_blend(
        self,
        prediction: np.ndarray,
        exact_counts: np.ndarray,
        prior: np.ndarray,
    ) -> np.ndarray:
        count_total = np.sum(exact_counts, axis=-1, keepdims=True)
        if not np.any(count_total > 0.0):
            return prediction
        prior_entropy = np.asarray(entropy_map(prior), dtype=np.float64)[..., None]
        beta = self.beta_min + self.beta_scale * (1.0 - (prior_entropy / math.log(CLASS_COUNT)))
        blended = np.where(
            count_total > 0.0,
            (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6),
            prediction,
        )
        return np.asarray(blended, dtype=np.float64)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        prior_bundle = self.base_predictor.build_prediction_bundle(
            round_detail,
            context.geometry_bundle,
            context.evidence_bundle,
        )
        derived = _derive_transcript_features_from_stats(
            round_detail,
            context.geometry_bundle,
            prior_bundle,
            _stats_from_observations(round_detail, context.observations),
            blur_sigmas=self.blur_sigmas,
            include_exact_local_residual=self.include_exact_local_residual,
        )
        return self._predict_from_derived(round_detail, context.geometry_bundle, derived, prior_bundle)

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        resolved_evidence = (
            build_round_evidence_from_observations(round_detail, ())
            if evidence is None
            else evidence
        )
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features, resolved_evidence)
        per_seed_stats = {
            seed_index: _stats_from_seed_evidence(resolved_evidence.per_seed[seed_index])
            for seed_index in range(round_detail.seeds_count)
        }
        derived = _derive_transcript_features_from_stats(
            round_detail,
            features,
            prior_bundle,
            per_seed_stats,
            blur_sigmas=self.blur_sigmas,
            include_exact_local_residual=self.include_exact_local_residual,
        )
        return self._predict_from_derived(round_detail, features, derived, prior_bundle)


__all__ = [
    "SemhResidualStudentCheckpoint",
    "SemhResidualStudentPredictor",
]
