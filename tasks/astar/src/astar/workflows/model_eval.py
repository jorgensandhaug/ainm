from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.score import ScoreBreakdown, cellwise_kl_divergence, entropy_map
from astar.core.terrain import CLASS_NAMES
from astar.envs import CompetitionEvaluator
from astar.envs.historical import HistoricalReplayOracle
from astar.envs.types import GroundTruthBundle
from astar.features.geometry import compute_round_features
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import build_round_evidence
from astar.policy.interactive import build_interactive_policy
from astar.policy.registry import resolve_policy_name
from astar.student.predictor.ffam_config import is_ffam_model_name
from astar.student.predictor.ffam_knn_config import is_ffam_knn_model_name
from astar.student.predictor.ffam_mode_config import is_ffam_mode_model_name
from astar.student.predictor.ffam_operator_config import is_ffam_operator_model_name
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.interactive import RoundPredictorAdapter, build_online_predictor
from astar.student.predictor.query_residual import QueryResidualPredictor
from astar.student.predictor.query_residual_config import is_query_residual_model_name
from astar.student.predictor.static_semantic import (
    build_static_semantic_prediction,
    default_static_semantic_config,
)
from astar.workflows.results import HistoricalBenchmarkCellIssue, HistoricalBenchmarkSeedResult
from astar.workflows.online_episode import OnlineEpisodeRun, run_online_episode


class ModelSeedEvaluationContext(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    seed_index: int = Field(ge=0)
    mode: str
    model_name: str
    training_round_ids: tuple[str, ...] = ()
    training_analyzed_seed_count: int = Field(ge=0)
    training_cell_count: int = Field(ge=0)
    policy_name: str | None = None
    samples_per_round: int | None = Field(default=None, ge=1)
    budget: int | None = Field(default=None, ge=0)
    episode_seed: int | None = Field(default=None, ge=0)
    executed_queries: int | None = Field(default=None, ge=0)
    initial_grid: np.ndarray
    settlements: list[tuple[int, int, bool]]
    prediction: np.ndarray
    ground_truth: np.ndarray
    score_breakdown: ScoreBreakdown
    mean_prediction_entropy: float = Field(ge=0.0)
    mean_ground_truth_entropy: float = Field(ge=0.0)
    argmax_agreement_rate: float = Field(ge=0.0, le=1.0)
    predicted_class_mass: list[float]
    ground_truth_class_mass: list[float]
    residual_class_mass: list[float]
    top_kl_cells: list[HistoricalBenchmarkCellIssue]
    diagnostics: dict[str, np.ndarray] = Field(default_factory=dict)

    def to_seed_result(
        self,
        *,
        report_path: Path | str | None = None,
        manifest_path: Path | str | None = None,
    ) -> HistoricalBenchmarkSeedResult:
        support_level = self.diagnostics.get("support_level")
        full_bucket_count = self.diagnostics.get("full_bucket_count")
        support_full_pct = None
        support_structural_pct = None
        support_terrain_pct = None
        support_global_pct = None
        full_bucket_count_p10 = None
        full_bucket_count_p50 = None
        full_bucket_count_p90 = None

        if support_level is not None:
            level = np.asarray(support_level, dtype=np.int64)
            support_full_pct = float(np.mean(level == 3))
            support_structural_pct = float(np.mean(level == 2))
            support_terrain_pct = float(np.mean(level == 1))
            support_global_pct = float(np.mean(level == 0))
        if full_bucket_count is not None:
            quantiles = np.percentile(np.asarray(full_bucket_count, dtype=np.float64), [10, 50, 90])
            full_bucket_count_p10 = float(quantiles[0])
            full_bucket_count_p50 = float(quantiles[1])
            full_bucket_count_p90 = float(quantiles[2])

        return HistoricalBenchmarkSeedResult(
            round_id=self.round_id,
            round_number=self.round_number,
            seed_index=self.seed_index,
            mode=self.mode,
            model_name=self.model_name,
            training_round_count=len(self.training_round_ids),
            training_analyzed_seed_count=self.training_analyzed_seed_count,
            training_cell_count=self.training_cell_count,
            policy_name=self.policy_name,
            samples_per_round=self.samples_per_round,
            budget=self.budget,
            episode_seed=self.episode_seed,
            executed_queries=self.executed_queries,
            score=self.score_breakdown.score,
            weighted_kl=self.score_breakdown.weighted_kl,
            mean_prediction_entropy=self.mean_prediction_entropy,
            mean_ground_truth_entropy=self.mean_ground_truth_entropy,
            argmax_agreement_rate=self.argmax_agreement_rate,
            predicted_class_mass=self.predicted_class_mass,
            ground_truth_class_mass=self.ground_truth_class_mass,
            residual_class_mass=self.residual_class_mass,
            support_full_pct=support_full_pct,
            support_structural_pct=support_structural_pct,
            support_terrain_pct=support_terrain_pct,
            support_global_pct=support_global_pct,
            full_bucket_count_p10=full_bucket_count_p10,
            full_bucket_count_p50=full_bucket_count_p50,
            full_bucket_count_p90=full_bucket_count_p90,
            top_kl_cells=self.top_kl_cells,
            report_path=None if report_path is None else Path(report_path),
            manifest_path=None if manifest_path is None else Path(manifest_path),
        )


def _discover_analyzed_round_ids(paths: WorkspacePaths) -> list[str]:
    round_ids: list[str] = []
    for analysis_dir in sorted(paths.raw_dir.joinpath("analyses").glob("*")):
        if not analysis_dir.is_dir():
            continue
        if any(analysis_dir.glob("seed_index=*.json")):
            round_ids.append(analysis_dir.name)
    return round_ids


def discover_historical_eval_round_ids(
    paths: WorkspacePaths,
    round_ids: Sequence[str] | None = None,
) -> list[str]:
    available = set(_discover_analyzed_round_ids(paths))
    if round_ids is None:
        selected = sorted(available)
    else:
        selected = []
        for round_id in round_ids:
            if round_id not in available:
                raise ValueError(f"round {round_id} has no saved analyses")
            selected.append(round_id)
    if not selected:
        raise ValueError("no analyzed rounds available for historical evaluation")
    return selected


def _analysis_ground_truth_bundle(
    paths: WorkspacePaths,
    round_id: str,
) -> tuple[dict[int, object], GroundTruthBundle]:
    analyses = read_analysis_records(paths, round_id)
    if not analyses:
        raise ValueError(f"round {round_id} has no saved analyses")
    truths_by_seed = {
        seed_index: np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
        for seed_index, analysis_record in sorted(analyses.items())
    }
    return analyses, GroundTruthBundle(round_id=round_id, truths_by_seed=truths_by_seed)


def _build_prediction_bundle(
    paths: WorkspacePaths,
    round_id: str,
    model_name: str,
    *,
    training_round_ids: Sequence[str],
    samples_per_round: int,
) -> tuple[PredictionBundle, dict[int, dict[str, np.ndarray]], int, int]:
    round_detail = read_round_record(paths, round_id).round
    normalized = model_name.strip().lower()

    if normalized == "static_semantic":
        config = default_static_semantic_config()
        predictions_by_seed = {
            seed_index: build_static_semantic_prediction(
                np.asarray(initial_state.grid, dtype=np.int64),
                config,
            )
            for seed_index, initial_state in enumerate(round_detail.initial_states)
        }
        return (
            PredictionBundle(
                round_id=round_id,
                model_name="static_semantic",
                predictions_by_seed=predictions_by_seed,
            ),
            {},
            0,
            0,
        )

    if normalized == "geometry_prior":
        predictor = GeometryPriorPredictor()
        bundle = predictor.build_prediction_bundle(round_detail, compute_round_features(round_detail))
        return bundle, {}, 0, 0

    if normalized == "historical_bucket_prior":
        predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(training_round_ids),
        )
        bundle = predictor.build_prediction_bundle(round_detail, None)
        diagnostics_by_seed = {
            seed_index: predictor.build_seed_diagnostics(round_detail, seed_index).model_dump(
                mode="python",
            )
            for seed_index in range(round_detail.seeds_count)
        }
        return (
            bundle,
            diagnostics_by_seed,
            predictor.analyzed_seed_count,
            predictor.cell_count,
        )

    if is_query_residual_model_name(model_name):
        predictor = QueryResidualPredictor.fit_named_from_workspace(
            paths,
            model_name=model_name,
            round_ids=list(training_round_ids),
            samples_per_round=samples_per_round,
        )
        bundle = predictor.build_prediction_bundle(round_detail, compute_round_features(round_detail), None)
        return (
            bundle,
            {},
            predictor.base_predictor.analyzed_seed_count,
            predictor.base_predictor.cell_count,
        )

    _is_ensemble = model_name.strip().lower().startswith("ffam_ensemble")
    if is_ffam_model_name(model_name) or is_ffam_mode_model_name(model_name) or is_ffam_operator_model_name(model_name) or is_ffam_knn_model_name(model_name) or _is_ensemble:
        raise ValueError("ffam retrieval requires mode=online_interactive for historical benchmark")

    if normalized == "latent_regime":
        predictor = LatentRegimePredictor()
        features = compute_round_features(round_detail)
        evidence = build_round_evidence(paths, round_id)
        bundle = predictor.build_prediction_bundle(round_detail, features, evidence)
        return bundle, {}, 0, 0

    msg = f"unsupported historical eval model: {model_name}"
    raise ValueError(msg)


def _build_online_prediction_bundle(
    paths: WorkspacePaths,
    round_id: str,
    model_name: str,
    *,
    training_round_ids: Sequence[str],
    policy_name: str,
    samples_per_round: int,
    budget: int,
    episode_seed: int,
) -> tuple[
    PredictionBundle,
    dict[int, dict[str, np.ndarray]],
    int,
    int,
    int,
]:
    resolved_policy_name = resolve_policy_name(policy_name, model_name=model_name)
    predictor = build_online_predictor(
        model_name,
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=resolved_policy_name,
        samples_per_round=samples_per_round,
    )
    policy = build_interactive_policy(resolved_policy_name)
    online_episode: OnlineEpisodeRun = run_online_episode(
        HistoricalReplayOracle(paths=paths),
        round_id=round_id,
        predictor=predictor,
        policy=policy,
        budget=budget,
        episode_seed=episode_seed,
    )

    diagnostics_by_seed: dict[int, dict[str, np.ndarray]] = {}
    training_analyzed_seed_count = 0
    training_cell_count = 0
    if (
        isinstance(predictor, RoundPredictorAdapter)
        and isinstance(predictor.predictor, HistoricalBucketPriorPredictor)
    ):
        round_detail = read_round_record(paths, round_id).round
        diagnostics_by_seed = {
            seed_index: predictor.predictor.build_seed_diagnostics(round_detail, seed_index).model_dump(
                mode="python",
            )
            for seed_index in range(round_detail.seeds_count)
        }
        training_analyzed_seed_count = predictor.predictor.analyzed_seed_count
        training_cell_count = predictor.predictor.cell_count
    return (
        online_episode.prediction_bundle,
        diagnostics_by_seed,
        training_analyzed_seed_count,
        training_cell_count,
        online_episode.executed_queries,
    )


def _top_kl_cells(
    ground_truth: np.ndarray,
    prediction: np.ndarray,
    *,
    limit: int = 10,
) -> list[HistoricalBenchmarkCellIssue]:
    kl_map = np.asarray(cellwise_kl_divergence(ground_truth, prediction), dtype=np.float64)
    prediction_argmax = np.argmax(prediction, axis=-1)
    truth_argmax = np.argmax(ground_truth, axis=-1)
    safe = np.where(np.isfinite(kl_map), kl_map, np.inf)
    flat_order = np.argsort(safe.reshape(-1))[::-1]

    issues: list[HistoricalBenchmarkCellIssue] = []
    width = kl_map.shape[1]
    for flat_index in flat_order[:limit]:
        y = int(flat_index // width)
        x = int(flat_index % width)
        predicted_class_index = int(prediction_argmax[y, x])
        ground_truth_class_index = int(truth_argmax[y, x])
        issues.append(
            HistoricalBenchmarkCellIssue(
                x=x,
                y=y,
                kl=float(kl_map[y, x]),
                predicted_class_index=predicted_class_index,
                predicted_class_name=CLASS_NAMES[predicted_class_index],
                ground_truth_class_index=ground_truth_class_index,
                ground_truth_class_name=CLASS_NAMES[ground_truth_class_index],
            ),
        )
    return issues


def evaluate_model_on_round(
    paths: WorkspacePaths,
    *,
    round_id: str,
    model_name: str,
    training_round_ids: Sequence[str],
    mode: str = "prior_only",
    policy_name: str | None = None,
    samples_per_round: int = 1,
    budget: int = 50,
    episode_seed: int = 0,
) -> list[ModelSeedEvaluationContext]:
    round_record = read_round_record(paths, round_id)
    analyses, truth_bundle = _analysis_ground_truth_bundle(paths, round_id)

    if mode == "prior_only":
        prediction_bundle, diagnostics_by_seed, training_analyzed_seed_count, training_cell_count = (
            _build_prediction_bundle(
                paths,
                round_id,
                model_name,
                training_round_ids=training_round_ids,
                samples_per_round=samples_per_round,
            )
        )
        resolved_policy_name = None
        resolved_samples_per_round = samples_per_round if model_name.strip().lower() == "query_residual" else None
        resolved_budget = None
        resolved_episode_seed = None
        executed_queries = 0
    elif mode == "online_interactive":
        if policy_name is None:
            raise ValueError("online_interactive historical eval requires policy_name")
        (
            prediction_bundle,
            diagnostics_by_seed,
            training_analyzed_seed_count,
            training_cell_count,
            executed_queries,
        ) = _build_online_prediction_bundle(
            paths,
            round_id,
            model_name,
            training_round_ids=training_round_ids,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
            budget=budget,
            episode_seed=episode_seed,
        )
        resolved_policy_name = build_interactive_policy(policy_name).name
        resolved_samples_per_round = samples_per_round
        resolved_budget = budget
        resolved_episode_seed = episode_seed
    else:
        raise ValueError(f"unsupported historical eval mode: {mode}")

    score_by_seed = CompetitionEvaluator().score_prediction(prediction_bundle, truth_bundle)
    contexts: list[ModelSeedEvaluationContext] = []
    for seed_index, analysis_record in sorted(analyses.items()):
        initial_state = round_record.round.initial_states[seed_index]
        prediction = np.asarray(prediction_bundle.predictions_by_seed[seed_index], dtype=np.float64)
        ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
        predicted_class_mass = np.mean(prediction, axis=(0, 1))
        ground_truth_class_mass = np.mean(ground_truth, axis=(0, 1))
        contexts.append(
            ModelSeedEvaluationContext(
                round_id=round_id,
                round_number=round_record.round.round_number,
                seed_index=seed_index,
                mode=mode,
                model_name=prediction_bundle.model_name,
                training_round_ids=tuple(training_round_ids),
                training_analyzed_seed_count=training_analyzed_seed_count,
                training_cell_count=training_cell_count,
                policy_name=resolved_policy_name,
                samples_per_round=resolved_samples_per_round,
                budget=resolved_budget,
                episode_seed=resolved_episode_seed,
                executed_queries=executed_queries,
                initial_grid=np.asarray(initial_state.grid, dtype=np.int64),
                settlements=[(item.x, item.y, item.has_port) for item in initial_state.settlements],
                prediction=prediction,
                ground_truth=ground_truth,
                score_breakdown=score_by_seed[seed_index],
                mean_prediction_entropy=float(np.mean(entropy_map(prediction))),
                mean_ground_truth_entropy=float(np.mean(entropy_map(ground_truth))),
                argmax_agreement_rate=float(
                    np.mean(
                        np.argmax(prediction, axis=-1) == np.argmax(ground_truth, axis=-1),
                    ),
                ),
                predicted_class_mass=predicted_class_mass.tolist(),
                ground_truth_class_mass=ground_truth_class_mass.tolist(),
                residual_class_mass=(predicted_class_mass - ground_truth_class_mass).tolist(),
                top_kl_cells=_top_kl_cells(ground_truth, prediction),
                diagnostics={
                    key: np.asarray(value)
                    for key, value in diagnostics_by_seed.get(seed_index, {}).items()
                    if isinstance(value, np.ndarray)
                },
            ),
        )
    return contexts

__all__ = [
    "ModelSeedEvaluationContext",
    "discover_historical_eval_round_ids",
    "evaluate_model_on_round",
]
