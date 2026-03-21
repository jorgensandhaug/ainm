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
from astar.envs.types import GroundTruthBundle, build_round_context_from_detail
from astar.features.geometry import compute_round_features
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import build_round_evidence
from astar.policy.interactive import build_interactive_policy
from astar.student.predictor.heuristic import GeometryPriorPredictor, LatentRegimePredictor
from astar.student.predictor.gbx_map_prior import (
    GBX_PRIOR_MAPONLY_BUCKET_MODEL,
    GreyBoxMapOnlyBucketPredictor,
)
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.interactive import RoundPredictorAdapter, build_online_predictor
from astar.student.predictor.query_residual import (
    QueryResidualPredictor,
    is_query_residual_model_name,
    resolve_query_residual_serving_overrides,
    resolve_query_residual_training_spec,
)
from astar.student.predictor.static_semantic import (
    build_static_semantic_prediction,
    default_static_semantic_config,
)
from astar.teacher.dynamics.hazard_teacher import (
    HAZARD_TEACHER_MAPPRIOR_MODEL,
    HAZARD_TEACHER_MODEL,
    HazardTeacher,
)
from astar.teacher.dynamics.transition_teacher import (
    GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL,
    GBX_TRANSITION_TEACHER_GRAPH_MODEL,
    GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL,
    GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
    GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL,
    GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
    GBX_TRANSITION_TEACHER_MODEL,
    GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL,
    GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL,
    GBX_TRANSITION_TEACHER_PHASE_MODEL,
    GreyBoxTransitionTeacher,
    gbx_transition_round_coefficients_path,
    gbx_transition_scoped_checkpoint_path,
    load_round_transition_coefficients,
    save_round_transition_coefficients,
)
from astar.teacher.dynamics.terminal_teacher import (
    GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
    GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
    GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
    GBX_TERMINAL_REGIME_TEACHER_MODEL,
    GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL,
    GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
    GreyBoxTerminalTeacher,
    gbx_terminal_round_coefficients_path,
    gbx_terminal_scoped_checkpoint_path,
    load_round_terminal_coefficients,
    save_round_terminal_coefficients,
)
from astar.teacher.regime.base import RegimePosteriorState
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

    ensemble_specs = {
        "gbx_maponly_terminal_mapprior_blend10": ("gbx_terminal_regime_teacher_mapprior", 0.10, "uniform"),
        "gbx_maponly_terminal_mapprior_blend20": ("gbx_terminal_regime_teacher_mapprior", 0.20, "uniform"),
        "gbx_maponly_terminal_mapknn_blend10": ("gbx_terminal_regime_mapknn_teacher", 0.10, "uniform"),
        "gbx_maponly_terminal_mapknn_blend20": ("gbx_terminal_regime_mapknn_teacher", 0.20, "uniform"),
        "gbx_maponly_terminal_mapknn_entropyblend25": ("gbx_terminal_regime_mapknn_teacher", 0.25, "entropy"),
        "gbx_maponly_terminal_mapknn_entropyblend50": ("gbx_terminal_regime_mapknn_teacher", 0.50, "entropy"),
        "gbx_maponly_terminal_mapknn_dynblend50": ("gbx_terminal_regime_mapknn_teacher", 0.50, "dynamic_subspace"),
        "gbx_maponly_terminal_mapknn_dynblend100": ("gbx_terminal_regime_mapknn_teacher", 1.00, "dynamic_subspace"),
    }
    if normalized in ensemble_specs:
        terminal_model_name, teacher_weight, gate_mode = ensemble_specs[normalized]
        base_predictor = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
            paths,
            round_ids=list(training_round_ids),
        )
        base_bundle = base_predictor.build_prediction_bundle(round_detail, None)
        terminal_bundle, _, training_analyzed_seed_count, training_cell_count = _build_prediction_bundle(
            paths,
            round_id,
            terminal_model_name,
            training_round_ids=training_round_ids,
            samples_per_round=samples_per_round,
        )
        predictions_by_seed: dict[int, np.ndarray] = {}
        for seed_index in sorted(base_bundle.predictions_by_seed):
            base_prediction = np.asarray(base_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            terminal_prediction = np.asarray(terminal_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            if gate_mode == "uniform":
                blend_weight: float | np.ndarray = teacher_weight
                blended = ((1.0 - blend_weight) * base_prediction) + (blend_weight * terminal_prediction)
            elif gate_mode == "entropy":
                blend_weight = (
                    teacher_weight
                    * (entropy_map(base_prediction) / np.log(base_prediction.shape[-1]))
                )[:, :, None]
                blended = ((1.0 - blend_weight) * base_prediction) + (blend_weight * terminal_prediction)
            else:
                base_dynamic = np.asarray(base_prediction[:, :, 1:5], dtype=np.float64)
                teacher_dynamic = np.asarray(terminal_prediction[:, :, 1:5], dtype=np.float64)
                dynamic_mass = np.sum(base_dynamic, axis=-1, keepdims=True)
                teacher_dynamic_mass = np.sum(teacher_dynamic, axis=-1, keepdims=True)
                teacher_dynamic_share = np.divide(
                    teacher_dynamic,
                    np.clip(teacher_dynamic_mass, 1e-12, None),
                    out=np.full_like(teacher_dynamic, 0.25),
                    where=teacher_dynamic_mass > 1e-12,
                )
                target_dynamic = dynamic_mass * teacher_dynamic_share
                blended = np.asarray(base_prediction, dtype=np.float64).copy()
                blended[:, :, 1:5] = ((1.0 - teacher_weight) * base_dynamic) + (teacher_weight * target_dynamic)
            predictions_by_seed[seed_index] = apply_probability_floor(blended, 1e-4)
        return (
            PredictionBundle(
                round_id=round_id,
                model_name=f"{normalized}_v1",
                predictions_by_seed=predictions_by_seed,
            ),
            {},
            training_analyzed_seed_count,
            training_cell_count,
        )

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

    if normalized in {"gbx_prior_maponly_bucket", GBX_PRIOR_MAPONLY_BUCKET_MODEL}:
        predictor = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
            paths,
            round_ids=list(training_round_ids),
        )
        bundle = predictor.build_prediction_bundle(round_detail, None)
        return (
            bundle,
            {},
            predictor.analyzed_seed_count,
            predictor.cell_count,
        )

    if normalized in {"gbx_cellwise_lgb", "gbx_cellwise_lgb_v1"}:
        from astar.student.predictor.gbx_cellwise import (
            CellwiseLGBPredictor,
            cellwise_lgb_scoped_checkpoint_path,
        )
        checkpoint_path = cellwise_lgb_scoped_checkpoint_path(
            paths, round_ids=list(training_round_ids),
        )
        if checkpoint_path.exists():
            predictor = CellwiseLGBPredictor.load_checkpoint(checkpoint_path)
        else:
            predictor = CellwiseLGBPredictor.fit_from_workspace(
                paths,
                round_ids=list(training_round_ids),
            )
            predictor.save_checkpoint(checkpoint_path)
        bundle = predictor.build_prediction_bundle(round_detail, None)
        return bundle, {}, 0, 0

    if normalized in {"gbx_cellwise_replay_lgb", "gbx_cellwise_replay_lgb_v1"}:
        from astar.student.predictor.gbx_cellwise import (
            CellwiseLGBPredictor,
            GBX_CELLWISE_LGB_MODEL,
            build_cellwise_features,
            load_replay_final_grids,
        )
        import lightgbm as lgb
        from astar.core.terrain import collapse_internal_grid

        replays_dir = paths.raw_dir / "replays"
        X_parts: list[np.ndarray] = []
        Y_parts: list[np.ndarray] = []
        for train_round_id in training_round_ids:
            train_detail = read_round_record(paths, train_round_id).round
            replay_grids = load_replay_final_grids(replays_dir, train_round_id, max_replays_per_seed=30)
            for si in range(train_detail.seeds_count):
                ist = train_detail.initial_states[si]
                grid = np.asarray(ist.grid, dtype=np.int64)
                feat = build_cellwise_features(grid, ist.settlements)
                h, w, f = feat.shape
                for rg in replay_grids.get(si, []):
                    collapsed = collapse_internal_grid(rg)
                    yf = np.zeros((h * w, 6), dtype=np.float64)
                    for c in range(6):
                        yf[:, c] = (collapsed.ravel() == c).astype(np.float64)
                    X_parts.append(feat.reshape(-1, f))
                    Y_parts.append(yf)
        X_train = np.concatenate(X_parts)
        Y_train = np.concatenate(Y_parts)
        models = {}
        for cls in range(6):
            m = lgb.LGBMRegressor(
                objective="regression", n_estimators=500, max_depth=8,
                learning_rate=0.03, min_child_samples=50, subsample=0.7,
                colsample_bytree=0.7, num_leaves=63, verbose=-1, n_jobs=8, random_state=42,
            )
            m.fit(X_train, Y_train[:, cls])
            models[cls] = m
        predictions_by_seed = {}
        for si in range(round_detail.seeds_count):
            ist = round_detail.initial_states[si]
            grid = np.asarray(ist.grid, dtype=np.int64)
            feat = build_cellwise_features(grid, ist.settlements)
            h, w, f = feat.shape
            Xe = feat.reshape(-1, f)
            probs = np.zeros((h * w, 6), dtype=np.float64)
            for c in range(6):
                probs[:, c] = np.clip(models[c].predict(Xe), 0.0, 1.0)
            probs /= probs.sum(axis=1, keepdims=True)
            probs = np.maximum(probs, 0.01)
            probs /= probs.sum(axis=1, keepdims=True)
            predictions_by_seed[si] = probs.reshape(h, w, 6)
        return (
            PredictionBundle(round_id=round_id, model_name="gbx_cellwise_replay_lgb_v1", predictions_by_seed=predictions_by_seed),
            {}, 0, 0,
        )

    if normalized in {
        "hazard_teacher",
        HAZARD_TEACHER_MODEL,
        "hazard_teacher_mapprior",
        HAZARD_TEACHER_MAPPRIOR_MODEL,
    }:
        replay_episodes = [
            build_round_episode(paths, training_round_id)
            for training_round_id in training_round_ids
        ]
        teacher = HazardTeacher(
            name=HAZARD_TEACHER_MODEL,
        ).fit(
            [episode for episode in replay_episodes if episode.replay_run_count > 0],
        )
        round_context = build_round_context_from_detail(round_detail)
        if normalized in {"hazard_teacher_mapprior", HAZARD_TEACHER_MAPPRIOR_MODEL}:
            teacher = teacher.model_copy(update={"name": HAZARD_TEACHER_MAPPRIOR_MODEL})
            posterior = teacher.map_posterior(round_context.seeds)
        elif teacher.regime_bank.size > 0:
            regime_particles = tuple(np.asarray(item, dtype=np.float64) for item in teacher.regime_bank)
            posterior = RegimePosteriorState(
                mean=np.asarray(np.mean(teacher.regime_bank, axis=0), dtype=np.float64),
                particles=regime_particles,
                weights=np.full(len(regime_particles), 1.0 / len(regime_particles), dtype=np.float64),
            )
        else:
            posterior = RegimePosteriorState(mean=np.zeros(12, dtype=np.float64))
        predictions_by_seed = {
            seed.seed_index: teacher.posterior_predictive(seed, posterior)
            for seed in round_context.seeds
        }
        return (
            PredictionBundle(
                round_id=round_id,
                model_name=teacher.name,
                predictions_by_seed=predictions_by_seed,
            ),
            {},
            sum(seed.terminal_truth is not None for episode in replay_episodes for seed in episode.seeds),
            sum(
                int(np.prod(np.asarray(seed.initial_state.grid, dtype=np.int64).shape))
                for episode in replay_episodes
                for seed in episode.seeds
                if seed.terminal_truth is not None
            ),
        )

    if normalized in {
        "gbx_terminal_regime_teacher",
        GBX_TERMINAL_REGIME_TEACHER_MODEL,
        "gbx_terminal_regime_teacher_mapprior",
        GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
        "gbx_terminal_regime_mapknn_teacher",
        GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
        "gbx_terminal_regime_mapllr_teacher",
        GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
        "gbx_terminal_regime_residual_teacher",
        GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
        "gbx_terminal_regime_residual_teacher_mapprior",
        GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL,
    }:
        terminal_variant_specs = {
            "gbx_terminal_regime_teacher": (
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                False,
                "regime_space_knn",
                3,
            ),
            GBX_TERMINAL_REGIME_TEACHER_MODEL: (
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                False,
                "regime_space_knn",
                3,
            ),
            "gbx_terminal_regime_teacher_mapprior": (
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
                False,
                "regime_space_knn",
                3,
            ),
            GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL: (
                GBX_TERMINAL_REGIME_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
                False,
                "regime_space_knn",
                3,
            ),
            "gbx_terminal_regime_mapknn_teacher": (
                GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
                False,
                "map_summary_knn",
                5,
            ),
            GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL: (
                GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
                False,
                "map_summary_knn",
                5,
            ),
            "gbx_terminal_regime_mapllr_teacher": (
                GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
                False,
                "map_summary_local_linear",
                5,
            ),
            GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL: (
                GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
                GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
                False,
                "map_summary_local_linear",
                5,
            ),
            "gbx_terminal_regime_residual_teacher": (
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                True,
                "regime_space_knn",
                3,
            ),
            GBX_TERMINAL_RESIDUAL_TEACHER_MODEL: (
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                True,
                "regime_space_knn",
                3,
            ),
            "gbx_terminal_regime_residual_teacher_mapprior": (
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL,
                True,
                "regime_space_knn",
                3,
            ),
            GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL: (
                GBX_TERMINAL_RESIDUAL_TEACHER_MODEL,
                GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL,
                True,
                "regime_space_knn",
                3,
            ),
        }
        checkpoint_model_name, serving_model_name, use_base_residual, map_posterior_mode, map_neighbor_count = terminal_variant_specs[normalized]
        checkpoint_path = gbx_terminal_scoped_checkpoint_path(
            paths,
            round_ids=training_round_ids,
            model_name=checkpoint_model_name,
        )
        if checkpoint_path.exists():
            teacher = GreyBoxTerminalTeacher.load_checkpoint(checkpoint_path)
        else:
            replay_episodes = [
                build_round_episode(paths, training_round_id)
                for training_round_id in training_round_ids
            ]
            replay_episodes = [
                episode
                for episode in replay_episodes
                if any(seed.terminal_truth is not None for seed in episode.seeds)
            ]
            coefficient_rows = []
            for episode in replay_episodes:
                coefficient_path = gbx_terminal_round_coefficients_path(
                    paths,
                    round_id=episode.metadata.round_id,
                    model_name=checkpoint_model_name,
                )
                if coefficient_path.exists():
                    coefficient_rows.append(load_round_terminal_coefficients(coefficient_path))
                else:
                    base_predictions_by_seed = None
                    if use_base_residual:
                        support_round_ids = [item for item in training_round_ids if item != episode.metadata.round_id]
                        if not support_round_ids:
                            support_round_ids = list(training_round_ids)
                        row_base_predictor = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
                            paths,
                            round_ids=support_round_ids,
                        )
                        episode_round_detail = read_round_record(paths, episode.metadata.round_id).round
                        row_base_bundle = row_base_predictor.build_prediction_bundle(episode_round_detail, None)
                        base_predictions_by_seed = {
                            int(seed_index): np.asarray(prediction, dtype=np.float64)
                            for seed_index, prediction in row_base_bundle.predictions_by_seed.items()
                        }
                    row = GreyBoxTerminalTeacher(
                        name=checkpoint_model_name,
                        use_base_residual=use_base_residual,
                    )._fit_round_coefficients(
                        episode,
                        ridge_alpha=1.0,
                        base_predictions_by_seed=base_predictions_by_seed,
                    )
                    save_round_terminal_coefficients(coefficient_path, row)
                    coefficient_rows.append(row)
            teacher = GreyBoxTerminalTeacher(
                name=checkpoint_model_name,
                use_base_residual=use_base_residual,
            ).fit(
                replay_episodes,
                coefficient_rows=coefficient_rows,
            )
            teacher.save_checkpoint(checkpoint_path)
        round_context = build_round_context_from_detail(round_detail)
        teacher = teacher.model_copy(
            update={
                "name": serving_model_name,
                "map_posterior_mode": map_posterior_mode,
                "map_neighbor_count": map_neighbor_count,
            },
        )
        if serving_model_name in {
            GBX_TERMINAL_REGIME_TEACHER_MAPPRIOR_MODEL,
            GBX_TERMINAL_RESIDUAL_TEACHER_MAPPRIOR_MODEL,
            GBX_TERMINAL_REGIME_MAPKNN_TEACHER_MODEL,
            GBX_TERMINAL_REGIME_MAPLLR_TEACHER_MODEL,
        }:
            posterior = teacher.map_posterior(round_context.seeds)
        elif teacher.regime_bank.size > 0:
            regime_particles = tuple(np.asarray(item, dtype=np.float64) for item in teacher.regime_bank)
            posterior = RegimePosteriorState(
                mean=np.asarray(np.mean(teacher.regime_bank, axis=0), dtype=np.float64),
                particles=regime_particles,
                weights=np.full(len(regime_particles), 1.0 / float(len(regime_particles)), dtype=np.float64),
            )
        else:
            posterior = RegimePosteriorState(mean=np.zeros(12, dtype=np.float64))
        base_bundle = None
        if use_base_residual:
            base_predictor = GreyBoxMapOnlyBucketPredictor.fit_from_workspace(
                paths,
                round_ids=list(training_round_ids),
            )
            base_bundle = base_predictor.build_prediction_bundle(round_detail, None)
        predictions_by_seed = {
            seed.seed_index: teacher.posterior_predictive(
                seed,
                posterior,
                base_prediction=(
                    None
                    if base_bundle is None
                    else np.asarray(base_bundle.predictions_by_seed[seed.seed_index], dtype=np.float64)
                ),
            )
            for seed in round_context.seeds
        }
        replay_episodes = [
            build_round_episode(paths, training_round_id)
            for training_round_id in training_round_ids
        ]
        return (
            PredictionBundle(
                round_id=round_id,
                model_name=teacher.name,
                predictions_by_seed=predictions_by_seed,
            ),
            {},
            sum(seed.terminal_truth is not None for episode in replay_episodes for seed in episode.seeds),
            sum(
                int(np.prod(np.asarray(seed.initial_state.grid, dtype=np.int64).shape))
                for episode in replay_episodes
                for seed in episode.seeds
                if seed.terminal_truth is not None
            ),
        )

    if normalized in {
        "gbx_transition_teacher",
        GBX_TRANSITION_TEACHER_MODEL,
        "gbx_transition_teacher_mapprior",
        GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL,
        "gbx_transition_teacher_phase",
        GBX_TRANSITION_TEACHER_PHASE_MODEL,
        "gbx_transition_teacher_phase_mapprior",
        GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL,
        "gbx_transition_teacher_graph",
        GBX_TRANSITION_TEACHER_GRAPH_MODEL,
        "gbx_transition_teacher_graph_mapprior",
        GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL,
        "gbx_transition_teacher_graph_phase",
        GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
        "gbx_transition_teacher_graph_phase_mapprior",
        GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL,
        "gbx_transition_teacher_graph_phase_global",
        GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
        "gbx_transition_teacher_graph_phase_global_mapprior",
        GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL,
    }:
        transition_variant_specs = {
            "gbx_transition_teacher": (
                GBX_TRANSITION_TEACHER_MODEL,
                GBX_TRANSITION_TEACHER_MODEL,
                False,
                False,
                False,
            ),
            GBX_TRANSITION_TEACHER_MODEL: (
                GBX_TRANSITION_TEACHER_MODEL,
                GBX_TRANSITION_TEACHER_MODEL,
                False,
                False,
                False,
            ),
            "gbx_transition_teacher_mapprior": (
                GBX_TRANSITION_TEACHER_MODEL,
                GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL,
                False,
                False,
                False,
            ),
            GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL: (
                GBX_TRANSITION_TEACHER_MODEL,
                GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL,
                False,
                False,
                False,
            ),
            "gbx_transition_teacher_phase": (
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                False,
                True,
                False,
            ),
            GBX_TRANSITION_TEACHER_PHASE_MODEL: (
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                False,
                True,
                False,
            ),
            "gbx_transition_teacher_phase_mapprior": (
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL,
                False,
                True,
                False,
            ),
            GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL: (
                GBX_TRANSITION_TEACHER_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL,
                False,
                True,
                False,
            ),
            "gbx_transition_teacher_graph": (
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                True,
                False,
                False,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                True,
                False,
                False,
            ),
            "gbx_transition_teacher_graph_mapprior": (
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL,
                True,
                False,
                False,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL,
                True,
                False,
                False,
            ),
            "gbx_transition_teacher_graph_phase": (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                True,
                True,
                False,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                True,
                True,
                False,
            ),
            "gbx_transition_teacher_graph_phase_mapprior": (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL,
                True,
                True,
                False,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL,
                True,
                True,
                False,
            ),
            "gbx_transition_teacher_graph_phase_global": (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                True,
                True,
                True,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                True,
                True,
                True,
            ),
            "gbx_transition_teacher_graph_phase_global_mapprior": (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL,
                True,
                True,
                True,
            ),
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL: (
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MODEL,
                GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL,
                True,
                True,
                True,
            ),
        }
        (
            checkpoint_model_name,
            serving_model_name,
            include_graph_features,
            include_phase_features,
            include_global_features,
        ) = transition_variant_specs[normalized]
        checkpoint_path = gbx_transition_scoped_checkpoint_path(
            paths,
            round_ids=training_round_ids,
            model_name=checkpoint_model_name,
        )
        if checkpoint_path.exists():
            teacher = GreyBoxTransitionTeacher.load_checkpoint(checkpoint_path)
        else:
            replay_episodes = [
                build_round_episode(paths, training_round_id)
                for training_round_id in training_round_ids
            ]
            replay_episodes = [episode for episode in replay_episodes if episode.replay_run_count > 0]
            coefficient_rows = []
            for episode in replay_episodes:
                coefficient_path = gbx_transition_round_coefficients_path(
                    paths,
                    round_id=episode.metadata.round_id,
                    model_name=checkpoint_model_name,
                )
                if coefficient_path.exists():
                    coefficient_rows.append(load_round_transition_coefficients(coefficient_path))
                else:
                    row = GreyBoxTransitionTeacher(
                        name=checkpoint_model_name,
                        include_graph_features=include_graph_features,
                        include_phase_features=include_phase_features,
                        include_global_features=include_global_features,
                    )._fit_round_coefficients(
                        episode,
                        ridge_alpha=1.0,
                    )
                    save_round_transition_coefficients(coefficient_path, row)
                    coefficient_rows.append(row)
            teacher = GreyBoxTransitionTeacher(
                name=checkpoint_model_name,
                include_graph_features=include_graph_features,
                include_phase_features=include_phase_features,
                include_global_features=include_global_features,
            ).fit(
                replay_episodes,
                coefficient_rows=coefficient_rows,
            )
            teacher.save_checkpoint(checkpoint_path)
        round_context = build_round_context_from_detail(round_detail)
        teacher = teacher.model_copy(update={"name": serving_model_name})
        if serving_model_name in {
            GBX_TRANSITION_TEACHER_MAPPRIOR_MODEL,
            GBX_TRANSITION_TEACHER_PHASE_MAPPRIOR_MODEL,
            GBX_TRANSITION_TEACHER_GRAPH_MAPPRIOR_MODEL,
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_MAPPRIOR_MODEL,
            GBX_TRANSITION_TEACHER_GRAPH_PHASE_GLOBAL_MAPPRIOR_MODEL,
        }:
            posterior = teacher.map_posterior(round_context.seeds)
        elif teacher.regime_bank.size > 0:
            regime_particles = tuple(np.asarray(item, dtype=np.float64) for item in teacher.regime_bank)
            posterior = RegimePosteriorState(
                mean=np.asarray(np.mean(teacher.regime_bank, axis=0), dtype=np.float64),
                particles=regime_particles,
                weights=np.full(len(regime_particles), 1.0 / float(len(regime_particles)), dtype=np.float64),
            )
        else:
            posterior = RegimePosteriorState(mean=np.zeros(12, dtype=np.float64))
        predictions_by_seed = {
            seed.seed_index: teacher.posterior_predictive(seed, posterior)
            for seed in round_context.seeds
        }
        return (
            PredictionBundle(
                round_id=round_id,
                model_name=teacher.name,
                predictions_by_seed=predictions_by_seed,
            ),
            {},
            0,
            0,
        )

    if is_query_residual_model_name(normalized):
        checkpoint_model_name, resolved_samples_per_round, cell_selection_strategy, include_exact_local_residual = (
            resolve_query_residual_training_spec(
                normalized,
                samples_per_round=samples_per_round,
            )
        )
        predictor = QueryResidualPredictor.fit_from_workspace(
            paths,
            round_ids=list(training_round_ids),
            samples_per_round=resolved_samples_per_round,
            model_name=checkpoint_model_name,
            cell_selection_strategy=cell_selection_strategy,
            include_exact_local_residual=include_exact_local_residual,
        )
        serving_overrides = resolve_query_residual_serving_overrides(normalized)
        if serving_overrides:
            predictor = predictor.model_copy(update={"name": normalized, **serving_overrides})
        bundle = predictor.build_prediction_bundle(round_detail, compute_round_features(round_detail), None)
        return (
            bundle,
            {},
            predictor.base_predictor.analyzed_seed_count,
            predictor.base_predictor.cell_count,
        )

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
    predictor: RoundPredictorAdapter | None = None,
) -> tuple[
    PredictionBundle,
    dict[int, dict[str, np.ndarray]],
    int,
    int,
    int,
]:
    resolved_predictor = predictor or build_online_predictor(
        model_name,
        paths=paths,
        historical_round_ids=training_round_ids,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    policy = build_interactive_policy(policy_name)
    online_episode: OnlineEpisodeRun = run_online_episode(
        HistoricalReplayOracle(paths=paths),
        round_id=round_id,
        predictor=resolved_predictor,
        policy=policy,
        budget=budget,
        episode_seed=episode_seed,
    )

    diagnostics_by_seed: dict[int, dict[str, np.ndarray]] = {}
    training_analyzed_seed_count = 0
    training_cell_count = 0
    if (
        isinstance(resolved_predictor, RoundPredictorAdapter)
        and isinstance(resolved_predictor.predictor, HistoricalBucketPriorPredictor)
    ):
        round_detail = read_round_record(paths, round_id).round
        diagnostics_by_seed = {
            seed_index: resolved_predictor.predictor.build_seed_diagnostics(
                round_detail,
                seed_index,
            ).model_dump(
                mode="python",
            )
            for seed_index in range(round_detail.seeds_count)
        }
        training_analyzed_seed_count = resolved_predictor.predictor.analyzed_seed_count
        training_cell_count = resolved_predictor.predictor.cell_count
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
    online_predictor: RoundPredictorAdapter | None = None,
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
        resolved_samples_per_round = (
            resolve_query_residual_training_spec(
                model_name.strip().lower(),
                samples_per_round=samples_per_round,
            )[1]
            if is_query_residual_model_name(model_name.strip().lower())
            else None
        )
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
            predictor=online_predictor,
        )
        resolved_policy_name = build_interactive_policy(policy_name).name
        resolved_samples_per_round = (
            resolve_query_residual_training_spec(
                model_name.strip().lower(),
                samples_per_round=samples_per_round,
            )[1]
            if is_query_residual_model_name(model_name.strip().lower())
            else samples_per_round
        )
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
