from __future__ import annotations

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.score import score_prediction
from astar.history.episodes.models import RoundEpisode
from astar.history.replay.terminal_cache import (
    empirical_terminal_probs_from_terminal_grids,
    load_or_build_seed_terminal_grid_cache,
)
from astar.history.summaries.behavioral_fingerprint import (
    build_behavioral_fingerprint_probe_library,
    estimate_round_behavioral_fingerprint,
)
from astar.history.summaries.behavioral_fingerprint_core import (
    DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
    behavioral_fingerprint_summary_column_scale,
    resolve_behavioral_fingerprint_summary_profile,
    select_behavioral_fingerprint_summary_profile,
)
from astar.history.summaries.behavioral_fingerprint_manifold import (
    load_or_build_round_behavioral_fingerprint_measurement_bundles,
)
from astar.history.summaries.factorization import (
    factorize_summary_matrix,
    project_summary_vector,
    reconstruct_summary_vector,
)
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    ReplayMeasurementSeedSummary,
)
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients_from_seed_targets,
    seed_feature_names,
)
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


class RegimeHeldoutRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    effective_rank: int = Field(ge=0)
    reconstruction_mae: float = Field(ge=0.0)
    reconstruction_rmse: float = Field(ge=0.0)
    reconstruction_baseline_mae: float = Field(ge=0.0)
    reconstruction_baseline_rmse: float = Field(ge=0.0)
    reconstruction_cosine_similarity: float | None = None
    coefficient_l2: float | None = Field(default=None, ge=0.0)
    baseline_coefficient_l2: float | None = Field(default=None, ge=0.0)
    raw_summary_coefficient_l2: float | None = Field(default=None, ge=0.0)
    terminal_weighted_kl: float | None = Field(default=None, ge=0.0)
    baseline_terminal_weighted_kl: float | None = Field(default=None, ge=0.0)
    raw_summary_terminal_weighted_kl: float | None = Field(default=None, ge=0.0)
    terminal_score: float | None = Field(default=None, ge=0.0)
    baseline_terminal_score: float | None = Field(default=None, ge=0.0)
    raw_summary_terminal_score: float | None = Field(default=None, ge=0.0)
    scored_seed_count: int = Field(default=0, ge=0)
    regime_norm: float = Field(ge=0.0)

    @property
    def terminal_l1(self) -> float | None:
        return self.terminal_weighted_kl

    @property
    def baseline_terminal_l1(self) -> float | None:
        return self.baseline_terminal_weighted_kl


class RegimeRankValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    rank: int = Field(ge=1)
    round_count: int = Field(ge=1)
    summary_dim: int = Field(ge=1)
    in_sample_effective_rank: int = Field(ge=0)
    in_sample_explained_variance_ratio: tuple[float, ...]
    in_sample_cumulative_explained_variance: float | None = None
    mean_effective_rank: float | None = None
    mean_reconstruction_mae: float | None = None
    mean_reconstruction_rmse: float | None = None
    mean_reconstruction_baseline_mae: float | None = None
    mean_reconstruction_baseline_rmse: float | None = None
    mean_reconstruction_mae_improvement: float | None = None
    mean_reconstruction_rmse_improvement: float | None = None
    mean_reconstruction_cosine_similarity: float | None = None
    mean_coefficient_l2: float | None = None
    mean_baseline_coefficient_l2: float | None = None
    mean_raw_summary_coefficient_l2: float | None = None
    mean_coefficient_l2_improvement: float | None = None
    mean_low_rank_vs_raw_summary_coefficient_l2_improvement: float | None = None
    coefficient_round_count: int = Field(default=0, ge=0)
    raw_summary_round_count: int = Field(default=0, ge=0)
    mean_terminal_weighted_kl: float | None = None
    mean_baseline_terminal_weighted_kl: float | None = None
    mean_raw_summary_terminal_weighted_kl: float | None = None
    mean_terminal_weighted_kl_improvement: float | None = None
    mean_low_rank_vs_raw_summary_terminal_weighted_kl_improvement: float | None = None
    mean_terminal_score: float | None = None
    mean_baseline_terminal_score: float | None = None
    mean_raw_summary_terminal_score: float | None = None
    mean_terminal_score_improvement: float | None = None
    mean_low_rank_vs_raw_summary_terminal_score_improvement: float | None = None
    terminal_round_count: int = Field(default=0, ge=0)
    terminal_seed_count: int = Field(default=0, ge=0)
    heldout_round_results: tuple[RegimeHeldoutRoundResult, ...]

    @property
    def explained_variance_ratio(self) -> tuple[float, ...]:
        return self.in_sample_explained_variance_ratio

    @property
    def cumulative_explained_variance(self) -> float | None:
        return self.in_sample_cumulative_explained_variance

    @property
    def mean_terminal_l1(self) -> float | None:
        return self.mean_terminal_weighted_kl

    @property
    def mean_baseline_terminal_l1(self) -> float | None:
        return self.mean_baseline_terminal_weighted_kl

    @property
    def mean_terminal_l1_improvement(self) -> float | None:
        return self.mean_terminal_weighted_kl_improvement


class BehavioralFingerprintCoreRoundEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    summary_names: tuple[str, ...]
    summary_vector: np.ndarray
    summary_std: np.ndarray
    coefficient_vector: np.ndarray | None = None


class PreparedHeldoutRound(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    summary_vector: np.ndarray
    target_coefficients: np.ndarray | None = None
    target_probs_by_seed: dict[int, np.ndarray]


def _partition_frame(frame: pl.DataFrame) -> dict[str, pl.DataFrame]:
    if frame.height == 0:
        return {}
    partitions = frame.partition_by("replay_run_id", as_dict=True)
    normalized: dict[str, pl.DataFrame] = {}
    for key, partition in partitions.items():
        if isinstance(key, tuple):
            if not key:
                continue
            normalized[str(key[0])] = partition
        else:
            normalized[str(key)] = partition
    return normalized


def _concat_selected(
    frames_by_run: dict[str, pl.DataFrame],
    selected_run_ids: tuple[str, ...],
    empty_frame: pl.DataFrame,
) -> pl.DataFrame:
    parts = [frames_by_run[run_id] for run_id in selected_run_ids if run_id in frames_by_run]
    if not parts:
        return empty_frame
    if len(parts) == 1:
        return parts[0]
    return pl.concat(parts, how="vertical_relaxed")


def _subset_bundle(
    bundle: ReplayMeasurementBundle,
    selected_run_ids: tuple[str, ...],
) -> ReplayMeasurementBundle:
    unique_run_ids = tuple(sorted(set(selected_run_ids)))
    site_frame = _concat_selected(
        _partition_frame(bundle.site_opportunities),
        unique_run_ids,
        bundle.site_opportunities.head(0),
    )
    settlement_frame = _concat_selected(
        _partition_frame(bundle.settlement_measurements),
        unique_run_ids,
        bundle.settlement_measurements.head(0),
    )
    live_frame = _concat_selected(
        _partition_frame(bundle.live_settlement_transitions),
        unique_run_ids,
        bundle.live_settlement_transitions.head(0),
    )
    ruin_frame = _concat_selected(
        _partition_frame(bundle.ruin_transitions),
        unique_run_ids,
        bundle.ruin_transitions.head(0),
    )
    pairwise_frame = _concat_selected(
        _partition_frame(bundle.pairwise_candidates),
        unique_run_ids,
        bundle.pairwise_candidates.head(0),
    )
    owner_frame = _concat_selected(
        _partition_frame(bundle.owner_years),
        unique_run_ids,
        bundle.owner_years.head(0),
    )
    year_shock_frame = _concat_selected(
        _partition_frame(bundle.year_shocks),
        unique_run_ids,
        bundle.year_shocks.head(0),
    )
    macro_frame = _concat_selected(
        _partition_frame(bundle.macro_trajectories),
        unique_run_ids,
        bundle.macro_trajectories.head(0),
    )
    summary = ReplayMeasurementSeedSummary(
        round_id=bundle.round_id,
        seed_index=bundle.seed_index,
        replay_run_count=len(unique_run_ids),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_count=0,
        site_opportunity_count=int(site_frame.height),
        settlement_measurement_count=int(settlement_frame.height),
        live_settlement_transition_count=int(live_frame.height),
        ruin_transition_count=int(ruin_frame.height),
        pairwise_candidate_count=int(pairwise_frame.height),
        owner_year_count=int(owner_frame.height),
        year_shock_count=int(year_shock_frame.height),
        macro_trajectory_count=int(macro_frame.height),
    )
    return ReplayMeasurementBundle(
        round_id=bundle.round_id,
        seed_index=bundle.seed_index,
        replay_run_count=len(unique_run_ids),
        frame_transition_count=int(year_shock_frame.height),
        site_transition_counts_by_step=bundle.site_transition_counts_by_step,
        site_opportunities=site_frame,
        settlement_measurements=settlement_frame,
        live_settlement_transitions=live_frame,
        ruin_transitions=ruin_frame,
        pairwise_candidates=pairwise_frame,
        owner_years=owner_frame,
        year_shocks=year_shock_frame,
        macro_trajectories=macro_frame,
        summary=summary,
    )


def _bundle_run_ids(bundle: ReplayMeasurementBundle) -> tuple[str, ...]:
    run_ids: set[str] = set()
    for frame in (
        bundle.site_opportunities,
        bundle.settlement_measurements,
        bundle.live_settlement_transitions,
        bundle.ruin_transitions,
        bundle.pairwise_candidates,
        bundle.owner_years,
        bundle.year_shocks,
        bundle.macro_trajectories,
    ):
        if frame.height > 0 and "replay_run_id" in frame.columns:
            run_ids.update(
                str(value)
                for value in frame.get_column("replay_run_id").unique().to_list()
            )
    return tuple(sorted(run_ids))


def _split_run_ids_for_summary_and_truth(
    run_ids: tuple[str, ...],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    run_ids = tuple(sorted(run_ids))
    if len(run_ids) <= 1:
        return run_ids, ()
    summary_run_ids = tuple(run_ids[::2])
    truth_run_ids = tuple(run_ids[1::2])
    if not truth_run_ids:
        truth_run_ids = (summary_run_ids[-1],)
        summary_run_ids = summary_run_ids[:-1]
    if not summary_run_ids:
        summary_run_ids = (truth_run_ids[0],)
        truth_run_ids = truth_run_ids[1:]
    return summary_run_ids, truth_run_ids


def _load_seed_terminal_probs(
    paths: WorkspacePaths,
    *,
    round_id: str,
    seed_index: int,
    selected_run_ids: tuple[str, ...] | None = None,
) -> np.ndarray | None:
    if selected_run_ids is None:
        replay_summary_path = paths.replay_summary_path(round_id, seed_index)
        if replay_summary_path.exists():
            payload = load_named_arrays(replay_summary_path)
            if "mean_terminal_probs" in payload:
                return np.asarray(payload["mean_terminal_probs"], dtype=np.float64)
    cached = load_or_build_seed_terminal_grid_cache(paths, round_id, seed_index)
    if cached is None:
        return None
    replay_run_ids, terminal_grids = cached
    return empirical_terminal_probs_from_terminal_grids(
        replay_run_ids,
        terminal_grids,
        selected_run_ids=selected_run_ids,
    )


def _fit_round_coefficients_from_available_targets(
    paths: WorkspacePaths,
    episode: RoundEpisode,
    *,
    target_probs_by_seed: dict[int, np.ndarray] | None = None,
) -> np.ndarray | None:
    seed_targets: list[tuple[object, np.ndarray]] = []
    for seed in episode.seeds:
        empirical = None
        if target_probs_by_seed is not None:
            empirical = target_probs_by_seed.get(seed.seed_index)
        elif seed.terminal_truth is not None:
            empirical = np.asarray(seed.terminal_truth.probs, dtype=np.float64)
        else:
            empirical = _load_seed_terminal_probs(
                paths,
                round_id=episode.metadata.round_id,
                seed_index=seed.seed_index,
            )
        if empirical is None:
            continue
        seed_targets.append((seed.initial_state, empirical))
    if not seed_targets:
        return None
    coefficients = fit_round_semimechanistic_coefficients_from_seed_targets(
        round_id=episode.metadata.round_id,
        round_number=int(episode.metadata.round_number or -1),
        seed_targets=seed_targets,
    )
    return coefficients.combined_vector()


def _build_independent_heldout_round_data(
    paths: WorkspacePaths,
    episode: RoundEpisode,
    bundles: list[ReplayMeasurementBundle],
) -> tuple[list[ReplayMeasurementBundle], dict[int, np.ndarray]]:
    bundles_by_seed = {bundle.seed_index: bundle for bundle in bundles}
    summary_bundles: list[ReplayMeasurementBundle] = []
    target_probs_by_seed: dict[int, np.ndarray] = {}
    for seed in episode.seeds:
        bundle = bundles_by_seed.get(seed.seed_index)
        if seed.terminal_truth is not None:
            if bundle is not None:
                summary_bundles.append(bundle)
            target_probs_by_seed[seed.seed_index] = np.asarray(
                seed.terminal_truth.probs,
                dtype=np.float64,
            )
            continue
        if bundle is None:
            empirical = _load_seed_terminal_probs(
                paths,
                round_id=episode.metadata.round_id,
                seed_index=seed.seed_index,
            )
            if empirical is not None:
                target_probs_by_seed[seed.seed_index] = empirical
            continue
        cached_terminal = load_or_build_seed_terminal_grid_cache(
            paths,
            episode.metadata.round_id,
            seed.seed_index,
        )
        run_ids = cached_terminal[0] if cached_terminal is not None else _bundle_run_ids(bundle)
        if not run_ids:
            summary_bundles.append(bundle)
            continue
        summary_run_ids, truth_run_ids = _split_run_ids_for_summary_and_truth(run_ids)
        if summary_run_ids:
            summary_bundles.append(_subset_bundle(bundle, summary_run_ids))
        if truth_run_ids:
            empirical = _load_seed_terminal_probs(
                paths,
                round_id=episode.metadata.round_id,
                seed_index=seed.seed_index,
                selected_run_ids=truth_run_ids,
            )
            if empirical is not None:
                target_probs_by_seed[seed.seed_index] = empirical
    return summary_bundles, target_probs_by_seed


def _fit_linear_map(
    inputs: np.ndarray,
    targets: np.ndarray,
    *,
    ridge_alpha: float,
) -> tuple[np.ndarray, np.ndarray]:
    design = np.concatenate(
        [np.ones((inputs.shape[0], 1), dtype=np.float64), inputs],
        axis=1,
    )
    penalty = np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 0.0
    lhs = design.T @ design + ridge_alpha * penalty
    rhs = design.T @ targets
    try:
        solution = np.linalg.solve(lhs, rhs)
    except np.linalg.LinAlgError:
        solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _cosine_similarity(lhs: np.ndarray, rhs: np.ndarray) -> float | None:
    lhs_norm = float(np.linalg.norm(lhs))
    rhs_norm = float(np.linalg.norm(rhs))
    if lhs_norm <= 0.0 or rhs_norm <= 0.0:
        return None
    return float(np.dot(lhs, rhs) / (lhs_norm * rhs_norm))


def _metric_mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.mean(np.asarray(values, dtype=np.float64)))


def estimate_behavioral_fingerprint_core_rounds(
    paths: WorkspacePaths,
    *,
    episodes: list[RoundEpisode],
    measurement_bundles_by_round_id: dict[str, list[ReplayMeasurementBundle]] | None = None,
    summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
    bootstrap_samples: int = 4,
    rng_seed: int = 0,
    site_max_rows: int | None = None,
    live_max_rows: int | None = None,
    ruin_max_rows: int | None = None,
    pairwise_max_rows: int | None = None,
    owner_max_rows: int | None = None,
) -> tuple[tuple[str, ...], tuple[BehavioralFingerprintCoreRoundEstimate, ...]]:
    resolved_summary_profile = resolve_behavioral_fingerprint_summary_profile(summary_profile)
    probe_library = build_behavioral_fingerprint_probe_library([], [], [], [], [])
    estimates: list[BehavioralFingerprintCoreRoundEstimate] = []
    summary_names: tuple[str, ...] | None = None
    for episode in episodes:
        if measurement_bundles_by_round_id is not None:
            bundles = measurement_bundles_by_round_id.get(episode.metadata.round_id, [])
            round_number = int(episode.metadata.round_number or -1)
        else:
            round_number, bundles = load_or_build_round_behavioral_fingerprint_measurement_bundles(
                paths,
                episode.metadata.round_id,
                site_max_rows=site_max_rows,
                live_max_rows=live_max_rows,
                ruin_max_rows=ruin_max_rows,
                pairwise_max_rows=pairwise_max_rows,
                owner_max_rows=owner_max_rows,
            )
        if not bundles:
            continue
        estimate = estimate_round_behavioral_fingerprint(
            round_id=episode.metadata.round_id,
            round_number=round_number,
            bundles=bundles,
            probe_library=probe_library,
            bootstrap_samples=bootstrap_samples,
            rng_seed=rng_seed,
        )
        selection = select_behavioral_fingerprint_summary_profile(
            estimate.summary_names,
            estimate.summary_vector,
            estimate.summary_std,
            summary_profile=resolved_summary_profile,
        )
        if summary_names is None:
            summary_names = tuple(selection.summary_names)
        elif tuple(selection.summary_names) != summary_names:
            raise ValueError("behavioral fingerprint core names drifted across rounds")
        coefficient_vector = _fit_round_coefficients_from_available_targets(paths, episode)
        estimates.append(
            BehavioralFingerprintCoreRoundEstimate(
                round_id=episode.metadata.round_id,
                round_number=int(episode.metadata.round_number or -1),
                sample_count=int(estimate.sample_count),
                summary_names=tuple(selection.summary_names),
                summary_vector=np.asarray(selection.summary_vector, dtype=np.float64),
                summary_std=np.asarray(
                    selection.summary_std
                    if selection.summary_std is not None
                    else np.zeros_like(selection.summary_vector, dtype=np.float64),
                    dtype=np.float64,
                ),
                coefficient_vector=(
                    np.asarray(coefficient_vector, dtype=np.float64)
                    if coefficient_vector is not None
                    else None
                ),
            )
        )
    if summary_names is None or not estimates:
        raise ValueError("no replay-backed behavioral fingerprint core estimates available")
    return summary_names, tuple(estimates)


def prepare_regime_heldout_rounds(
    paths: WorkspacePaths,
    summary_names: tuple[str, ...],
    round_estimates: tuple[BehavioralFingerprintCoreRoundEstimate, ...],
    round_episodes: dict[str, RoundEpisode],
    round_measurement_bundles: dict[str, list[ReplayMeasurementBundle]],
    *,
    summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
) -> tuple[PreparedHeldoutRound, ...]:
    resolved_summary_profile = resolve_behavioral_fingerprint_summary_profile(summary_profile)
    probe_library = build_behavioral_fingerprint_probe_library([], [], [], [], [])
    prepared: list[PreparedHeldoutRound] = []
    for estimate in round_estimates:
        heldout_episode = round_episodes[estimate.round_id]
        (
            heldout_summary_bundles,
            heldout_target_probs_by_seed,
        ) = _build_independent_heldout_round_data(
            paths,
            heldout_episode,
            round_measurement_bundles[estimate.round_id],
        )
        if not heldout_summary_bundles:
            raise ValueError(
                f"round {estimate.round_id} produced no independent heldout summary data"
            )
        heldout_estimate = estimate_round_behavioral_fingerprint(
            round_id=estimate.round_id,
            round_number=estimate.round_number,
            bundles=heldout_summary_bundles,
            probe_library=probe_library,
            bootstrap_samples=0,
            rng_seed=0,
        )
        heldout_selection = select_behavioral_fingerprint_summary_profile(
            heldout_estimate.summary_names,
            heldout_estimate.summary_vector,
            heldout_estimate.summary_std,
            summary_profile=resolved_summary_profile,
        )
        if tuple(heldout_selection.summary_names) != summary_names:
            raise ValueError(
                f"heldout round {estimate.round_id} produced summary-name drift"
            )
        target_coefficients = _fit_round_coefficients_from_available_targets(
            paths,
            heldout_episode,
            target_probs_by_seed=heldout_target_probs_by_seed,
        )
        prepared.append(
            PreparedHeldoutRound(
                round_id=estimate.round_id,
                round_number=estimate.round_number,
                sample_count=int(heldout_estimate.sample_count),
                summary_vector=np.asarray(heldout_selection.summary_vector, dtype=np.float64),
                target_coefficients=(
                    np.asarray(target_coefficients, dtype=np.float64)
                    if target_coefficients is not None
                    else None
                ),
                target_probs_by_seed={
                    seed_index: np.asarray(probs, dtype=np.float64)
                    for seed_index, probs in heldout_target_probs_by_seed.items()
                },
            )
        )
    return tuple(prepared)


def evaluate_regime_rank(
    paths: WorkspacePaths,
    summary_names: tuple[str, ...],
    round_estimates: tuple[BehavioralFingerprintCoreRoundEstimate, ...],
    round_episodes: dict[str, RoundEpisode],
    round_measurement_bundles: dict[str, list[ReplayMeasurementBundle]],
    *,
    rank: int,
    summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
    ridge_alpha: float = 1e-2,
    prepared_heldout_rounds: tuple[PreparedHeldoutRound, ...] | None = None,
) -> RegimeRankValidationReport:
    if len(round_estimates) <= 1:
        raise ValueError("regime validation requires at least two replay-backed rounds")
    resolved_summary_profile = resolve_behavioral_fingerprint_summary_profile(summary_profile)

    summary_matrix = np.stack([item.summary_vector for item in round_estimates], axis=0)
    summary_std_matrix = np.stack([item.summary_std for item in round_estimates], axis=0)
    feature_names = list(seed_feature_names())
    prepared_by_round_id = (
        {item.round_id: item for item in prepared_heldout_rounds}
        if prepared_heldout_rounds is not None
        else None
    )
    full_scale = behavioral_fingerprint_summary_column_scale(summary_matrix, summary_std_matrix)
    full_factorization = factorize_summary_matrix(
        summary_kind="behavioral_fingerprint_core",
        summary_names=list(summary_names),
        round_ids=[item.round_id for item in round_estimates],
        round_numbers=[item.round_number for item in round_estimates],
        sample_counts=[item.sample_count for item in round_estimates],
        summary_matrix=summary_matrix,
        max_rank=rank,
        column_scale=full_scale,
        allow_zero_rank=True,
    )
    decoder = HazardTeacher(
        name="regime_validation_decoder",
        summary_backend="behavioral_fingerprint_core",
        behavioral_fingerprint_summary_profile=resolved_summary_profile,
        feature_names=feature_names,
    )

    round_results: list[RegimeHeldoutRoundResult] = []
    for heldout_index, heldout in enumerate(round_estimates):
        keep_mask = np.ones(len(round_estimates), dtype=bool)
        keep_mask[heldout_index] = False
        train_summary_matrix = summary_matrix[keep_mask]
        train_std_matrix = summary_std_matrix[keep_mask]
        train_scale = behavioral_fingerprint_summary_column_scale(
            train_summary_matrix,
            train_std_matrix,
        )
        train_factorization = factorize_summary_matrix(
            summary_kind="behavioral_fingerprint_core",
            summary_names=list(summary_names),
            round_ids=[
                round_estimates[index].round_id
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            round_numbers=[
                round_estimates[index].round_number
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            sample_counts=[
                round_estimates[index].sample_count
                for index in range(len(round_estimates))
                if keep_mask[index]
            ],
            summary_matrix=train_summary_matrix,
            max_rank=rank,
            column_scale=train_scale,
            allow_zero_rank=True,
        )
        heldout_episode = round_episodes[heldout.round_id]
        if prepared_by_round_id is None:
            prepared = prepare_regime_heldout_rounds(
                paths,
                summary_names,
                (heldout,),
                {heldout.round_id: heldout_episode},
                {heldout.round_id: round_measurement_bundles[heldout.round_id]},
                summary_profile=resolved_summary_profile,
            )[0]
        else:
            prepared = prepared_by_round_id[heldout.round_id]
        heldout_summary_vector = np.asarray(prepared.summary_vector, dtype=np.float64)
        heldout_coords = project_summary_vector(train_factorization, heldout_summary_vector)
        reconstructed = reconstruct_summary_vector(train_factorization, heldout_coords)
        baseline_summary = np.asarray(train_factorization.mean_vector, dtype=np.float64)
        reconstruction_error = heldout_summary_vector - reconstructed
        baseline_reconstruction_error = heldout_summary_vector - baseline_summary

        train_coordinate_rows: list[np.ndarray] = []
        train_summary_input_rows: list[np.ndarray] = []
        train_target_rows: list[np.ndarray] = []
        train_summary_inputs = (
            (train_summary_matrix - train_factorization.mean_vector[None, :])
            / train_factorization.scale_vector[None, :]
        )
        heldout_summary_input = (
            (heldout_summary_vector - train_factorization.mean_vector)
            / train_factorization.scale_vector
        )
        for train_index, estimate in enumerate(round_estimates):
            if not keep_mask[train_index] or estimate.coefficient_vector is None:
                continue
            compressed_index = int(np.count_nonzero(keep_mask[:train_index]))
            train_coordinate_rows.append(train_factorization.coordinates[compressed_index])
            train_summary_input_rows.append(train_summary_inputs[compressed_index])
            train_target_rows.append(np.asarray(estimate.coefficient_vector, dtype=np.float64))
        predicted_coefficients = None
        baseline_coefficients = None
        raw_summary_coefficients = None
        if train_target_rows:
            train_inputs = np.stack(train_coordinate_rows, axis=0)
            train_summary_inputs_matrix = np.stack(train_summary_input_rows, axis=0)
            train_targets = np.stack(train_target_rows, axis=0)
            intercept, weights = _fit_linear_map(
                train_inputs,
                train_targets,
                ridge_alpha=ridge_alpha,
            )
            predicted_coefficients = np.asarray(
                intercept + heldout_coords @ weights,
                dtype=np.float64,
            )
            raw_intercept, raw_weights = _fit_linear_map(
                train_summary_inputs_matrix,
                train_targets,
                ridge_alpha=ridge_alpha,
            )
            raw_summary_coefficients = np.asarray(
                raw_intercept + heldout_summary_input @ raw_weights,
                dtype=np.float64,
            )
            baseline_coefficients = np.asarray(
                np.mean(train_targets, axis=0),
                dtype=np.float64,
            )

        target_coefficients = prepared.target_coefficients

        terminal_weighted_kl_values: list[float] = []
        baseline_terminal_weighted_kl_values: list[float] = []
        raw_summary_terminal_weighted_kl_values: list[float] = []
        terminal_score_values: list[float] = []
        baseline_terminal_score_values: list[float] = []
        raw_summary_terminal_score_values: list[float] = []
        for seed in heldout_episode.seeds:
            actual_terminal = prepared.target_probs_by_seed.get(seed.seed_index)
            if (
                actual_terminal is None
                or predicted_coefficients is None
                or baseline_coefficients is None
                or raw_summary_coefficients is None
            ):
                continue
            predicted_terminal = decoder._decode_terminal_tensor(seed, predicted_coefficients)
            baseline_terminal = decoder._decode_terminal_tensor(seed, baseline_coefficients)
            raw_summary_terminal = decoder._decode_terminal_tensor(seed, raw_summary_coefficients)
            score_breakdown = score_prediction(actual_terminal, predicted_terminal)
            baseline_score_breakdown = score_prediction(actual_terminal, baseline_terminal)
            raw_summary_score_breakdown = score_prediction(
                actual_terminal,
                raw_summary_terminal,
            )
            terminal_weighted_kl_values.append(float(score_breakdown.weighted_kl))
            baseline_terminal_weighted_kl_values.append(
                float(baseline_score_breakdown.weighted_kl)
            )
            raw_summary_terminal_weighted_kl_values.append(
                float(raw_summary_score_breakdown.weighted_kl)
            )
            terminal_score_values.append(float(score_breakdown.score))
            baseline_terminal_score_values.append(float(baseline_score_breakdown.score))
            raw_summary_terminal_score_values.append(float(raw_summary_score_breakdown.score))

        round_results.append(
            RegimeHeldoutRoundResult(
                round_id=heldout.round_id,
                round_number=heldout.round_number,
                sample_count=int(prepared.sample_count),
                effective_rank=train_factorization.effective_rank,
                reconstruction_mae=float(np.mean(np.abs(reconstruction_error))),
                reconstruction_rmse=float(np.sqrt(np.mean(reconstruction_error**2))),
                reconstruction_baseline_mae=float(
                    np.mean(np.abs(baseline_reconstruction_error))
                ),
                reconstruction_baseline_rmse=float(
                    np.sqrt(np.mean(baseline_reconstruction_error**2))
                ),
                reconstruction_cosine_similarity=_cosine_similarity(
                    heldout_summary_vector,
                    reconstructed,
                ),
                coefficient_l2=(
                    float(np.linalg.norm(predicted_coefficients - target_coefficients))
                    if predicted_coefficients is not None and target_coefficients is not None
                    else None
                ),
                baseline_coefficient_l2=(
                    float(np.linalg.norm(baseline_coefficients - target_coefficients))
                    if baseline_coefficients is not None and target_coefficients is not None
                    else None
                ),
                raw_summary_coefficient_l2=(
                    float(np.linalg.norm(raw_summary_coefficients - target_coefficients))
                    if raw_summary_coefficients is not None and target_coefficients is not None
                    else None
                ),
                terminal_weighted_kl=(
                    float(np.mean(np.asarray(terminal_weighted_kl_values, dtype=np.float64)))
                    if terminal_weighted_kl_values
                    else None
                ),
                baseline_terminal_weighted_kl=(
                    float(
                        np.mean(
                            np.asarray(
                                baseline_terminal_weighted_kl_values,
                                dtype=np.float64,
                            )
                        )
                    )
                    if baseline_terminal_weighted_kl_values
                    else None
                ),
                raw_summary_terminal_weighted_kl=(
                    float(
                        np.mean(
                            np.asarray(
                                raw_summary_terminal_weighted_kl_values,
                                dtype=np.float64,
                            )
                        )
                    )
                    if raw_summary_terminal_weighted_kl_values
                    else None
                ),
                terminal_score=(
                    float(np.mean(np.asarray(terminal_score_values, dtype=np.float64)))
                    if terminal_score_values
                    else None
                ),
                baseline_terminal_score=(
                    float(np.mean(np.asarray(baseline_terminal_score_values, dtype=np.float64)))
                    if baseline_terminal_score_values
                    else None
                ),
                raw_summary_terminal_score=(
                    float(np.mean(np.asarray(raw_summary_terminal_score_values, dtype=np.float64)))
                    if raw_summary_terminal_score_values
                    else None
                ),
                scored_seed_count=len(terminal_score_values),
                regime_norm=float(np.linalg.norm(heldout_coords)),
            )
        )

    mean_reconstruction_mae = _metric_mean(
        [item.reconstruction_mae for item in round_results]
    )
    mean_reconstruction_rmse = _metric_mean(
        [item.reconstruction_rmse for item in round_results]
    )
    mean_reconstruction_baseline_mae = _metric_mean(
        [item.reconstruction_baseline_mae for item in round_results]
    )
    mean_reconstruction_baseline_rmse = _metric_mean(
        [item.reconstruction_baseline_rmse for item in round_results]
    )
    mean_effective_rank = _metric_mean([float(item.effective_rank) for item in round_results])
    coefficient_round_count = int(
        sum(item.coefficient_l2 is not None for item in round_results)
    )
    mean_coefficient_l2 = _metric_mean(
        [item.coefficient_l2 for item in round_results if item.coefficient_l2 is not None]
    )
    mean_baseline_coefficient_l2 = _metric_mean(
        [
            item.baseline_coefficient_l2
            for item in round_results
            if item.baseline_coefficient_l2 is not None
        ]
    )
    mean_raw_summary_coefficient_l2 = _metric_mean(
        [
            item.raw_summary_coefficient_l2
            for item in round_results
            if item.raw_summary_coefficient_l2 is not None
        ]
    )
    mean_terminal_weighted_kl = _metric_mean(
        [
            item.terminal_weighted_kl
            for item in round_results
            if item.terminal_weighted_kl is not None
        ]
    )
    mean_baseline_terminal_weighted_kl = _metric_mean(
        [
            item.baseline_terminal_weighted_kl
            for item in round_results
            if item.baseline_terminal_weighted_kl is not None
        ]
    )
    mean_raw_summary_terminal_weighted_kl = _metric_mean(
        [
            item.raw_summary_terminal_weighted_kl
            for item in round_results
            if item.raw_summary_terminal_weighted_kl is not None
        ]
    )
    mean_terminal_score = _metric_mean(
        [item.terminal_score for item in round_results if item.terminal_score is not None]
    )
    mean_baseline_terminal_score = _metric_mean(
        [
            item.baseline_terminal_score
            for item in round_results
            if item.baseline_terminal_score is not None
        ]
    )
    mean_raw_summary_terminal_score = _metric_mean(
        [
            item.raw_summary_terminal_score
            for item in round_results
            if item.raw_summary_terminal_score is not None
        ]
    )
    terminal_round_count = int(
        sum(item.terminal_weighted_kl is not None for item in round_results)
    )
    raw_summary_round_count = int(
        sum(item.raw_summary_coefficient_l2 is not None for item in round_results)
    )
    terminal_seed_count = int(sum(item.scored_seed_count for item in round_results))
    cosine_values = [
        item.reconstruction_cosine_similarity
        for item in round_results
        if item.reconstruction_cosine_similarity is not None
    ]

    return RegimeRankValidationReport(
        rank=rank,
        round_count=len(round_estimates),
        summary_dim=len(summary_names),
        in_sample_effective_rank=full_factorization.effective_rank,
        in_sample_explained_variance_ratio=tuple(
            float(value) for value in full_factorization.explained_variance_ratio
        ),
        in_sample_cumulative_explained_variance=float(
            np.sum(full_factorization.explained_variance_ratio)
        )
        if full_factorization.explained_variance_ratio.size > 0
        else None,
        mean_effective_rank=mean_effective_rank,
        mean_reconstruction_mae=mean_reconstruction_mae,
        mean_reconstruction_rmse=mean_reconstruction_rmse,
        mean_reconstruction_baseline_mae=mean_reconstruction_baseline_mae,
        mean_reconstruction_baseline_rmse=mean_reconstruction_baseline_rmse,
        mean_reconstruction_mae_improvement=(
            None
            if mean_reconstruction_mae is None or mean_reconstruction_baseline_mae is None
            else float(mean_reconstruction_baseline_mae - mean_reconstruction_mae)
        ),
        mean_reconstruction_rmse_improvement=(
            None
            if mean_reconstruction_rmse is None or mean_reconstruction_baseline_rmse is None
            else float(mean_reconstruction_baseline_rmse - mean_reconstruction_rmse)
        ),
        mean_reconstruction_cosine_similarity=_metric_mean(
            [float(value) for value in cosine_values]
        ),
        mean_coefficient_l2=mean_coefficient_l2,
        mean_baseline_coefficient_l2=mean_baseline_coefficient_l2,
        mean_raw_summary_coefficient_l2=mean_raw_summary_coefficient_l2,
        mean_coefficient_l2_improvement=(
            None
            if mean_coefficient_l2 is None or mean_baseline_coefficient_l2 is None
            else float(mean_baseline_coefficient_l2 - mean_coefficient_l2)
        ),
        mean_low_rank_vs_raw_summary_coefficient_l2_improvement=(
            None
            if mean_coefficient_l2 is None or mean_raw_summary_coefficient_l2 is None
            else float(mean_raw_summary_coefficient_l2 - mean_coefficient_l2)
        ),
        coefficient_round_count=coefficient_round_count,
        raw_summary_round_count=raw_summary_round_count,
        mean_terminal_weighted_kl=mean_terminal_weighted_kl,
        mean_baseline_terminal_weighted_kl=mean_baseline_terminal_weighted_kl,
        mean_raw_summary_terminal_weighted_kl=mean_raw_summary_terminal_weighted_kl,
        mean_terminal_weighted_kl_improvement=(
            None
            if mean_terminal_weighted_kl is None or mean_baseline_terminal_weighted_kl is None
            else float(mean_baseline_terminal_weighted_kl - mean_terminal_weighted_kl)
        ),
        mean_low_rank_vs_raw_summary_terminal_weighted_kl_improvement=(
            None
            if mean_terminal_weighted_kl is None or mean_raw_summary_terminal_weighted_kl is None
            else float(mean_raw_summary_terminal_weighted_kl - mean_terminal_weighted_kl)
        ),
        mean_terminal_score=mean_terminal_score,
        mean_baseline_terminal_score=mean_baseline_terminal_score,
        mean_raw_summary_terminal_score=mean_raw_summary_terminal_score,
        mean_terminal_score_improvement=(
            None
            if mean_terminal_score is None or mean_baseline_terminal_score is None
            else float(mean_terminal_score - mean_baseline_terminal_score)
        ),
        mean_low_rank_vs_raw_summary_terminal_score_improvement=(
            None
            if mean_terminal_score is None or mean_raw_summary_terminal_score is None
            else float(mean_terminal_score - mean_raw_summary_terminal_score)
        ),
        terminal_round_count=terminal_round_count,
        terminal_seed_count=terminal_seed_count,
        heldout_round_results=tuple(round_results),
    )


__all__ = [
    "BehavioralFingerprintCoreRoundEstimate",
    "PreparedHeldoutRound",
    "RegimeHeldoutRoundResult",
    "RegimeRankValidationReport",
    "estimate_behavioral_fingerprint_core_rounds",
    "evaluate_regime_rank",
    "prepare_regime_heldout_rounds",
]
