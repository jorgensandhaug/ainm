from __future__ import annotations

from collections.abc import Iterable

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    load_named_arrays,
    load_prediction_tensor,
    read_analysis_records,
    read_round_record,
    read_submission_records,
)


class SeedLearningArrays(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    feature_names: list[str]
    feature_stack: np.ndarray
    initial_grid: np.ndarray
    query_count: int = Field(ge=0)
    repeated_window_groups: int = Field(ge=0)
    coverage_counts: np.ndarray
    observed_class_counts: np.ndarray
    observed_class_frequencies: np.ndarray
    observed_class_count_tensor: np.ndarray
    replay_run_count: int = Field(default=0, ge=0)
    replay_frame_transition_count: int = Field(default=0, ge=0)
    replay_site_transition_count: int = Field(default=0, ge=0)
    replay_site_opportunity_count: int = Field(default=0, ge=0)
    replay_settlement_measurement_count: int = Field(default=0, ge=0)
    replay_live_settlement_transition_count: int = Field(default=0, ge=0)
    replay_ruin_transition_count: int = Field(default=0, ge=0)
    replay_pairwise_candidate_count: int = Field(default=0, ge=0)
    replay_owner_year_count: int = Field(default=0, ge=0)
    replay_year_shock_count: int = Field(default=0, ge=0)
    replay_macro_trajectory_count: int = Field(default=0, ge=0)
    replay_mean_terminal_probs: np.ndarray | None = None
    replay_build_hit_rate: np.ndarray | None = None
    replay_port_hit_rate: np.ndarray | None = None
    replay_ruin_hit_rate: np.ndarray | None = None
    replay_coefficient_vector: np.ndarray | None = None
    replay_event_summary_names: list[str] | None = None
    replay_event_summary_vector: np.ndarray | None = None
    submitted_prediction: np.ndarray | None = None
    ground_truth: np.ndarray | None = None

    def feature(self, name: str) -> np.ndarray:
        feature_index = self.feature_names.index(name)
        return np.asarray(self.feature_stack[feature_index], dtype=np.float64)


class RoundLearningEpisode(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    status: str
    per_seed: dict[int, SeedLearningArrays]

    @property
    def analyzed_seed_count(self) -> int:
        return sum(1 for item in self.per_seed.values() if item.ground_truth is not None)

    @property
    def query_count(self) -> int:
        return sum(item.query_count for item in self.per_seed.values())

    @property
    def replay_run_count(self) -> int:
        return sum(item.replay_run_count for item in self.per_seed.values())

    def with_hidden_evidence(self, hidden_seed_indexes: Iterable[int]) -> RoundLearningEpisode:
        hidden = set(hidden_seed_indexes)
        masked: dict[int, SeedLearningArrays] = {}
        for seed_index, item in self.per_seed.items():
            if seed_index not in hidden:
                masked[seed_index] = item
                continue
            masked[seed_index] = SeedLearningArrays(
                round_id=item.round_id,
                seed_index=item.seed_index,
                feature_names=item.feature_names,
                feature_stack=item.feature_stack,
                initial_grid=item.initial_grid,
                query_count=0,
                repeated_window_groups=0,
                coverage_counts=np.zeros_like(item.coverage_counts),
                observed_class_counts=np.zeros_like(item.observed_class_counts),
                observed_class_frequencies=np.zeros_like(item.observed_class_frequencies),
                observed_class_count_tensor=np.zeros_like(item.observed_class_count_tensor),
                replay_run_count=item.replay_run_count,
                replay_frame_transition_count=item.replay_frame_transition_count,
                replay_site_transition_count=item.replay_site_transition_count,
                replay_site_opportunity_count=item.replay_site_opportunity_count,
                replay_settlement_measurement_count=item.replay_settlement_measurement_count,
                replay_live_settlement_transition_count=item.replay_live_settlement_transition_count,
                replay_ruin_transition_count=item.replay_ruin_transition_count,
                replay_pairwise_candidate_count=item.replay_pairwise_candidate_count,
                replay_owner_year_count=item.replay_owner_year_count,
                replay_year_shock_count=item.replay_year_shock_count,
                replay_macro_trajectory_count=item.replay_macro_trajectory_count,
                replay_mean_terminal_probs=item.replay_mean_terminal_probs,
                replay_build_hit_rate=item.replay_build_hit_rate,
                replay_port_hit_rate=item.replay_port_hit_rate,
                replay_ruin_hit_rate=item.replay_ruin_hit_rate,
                replay_coefficient_vector=item.replay_coefficient_vector,
                replay_event_summary_names=item.replay_event_summary_names,
                replay_event_summary_vector=item.replay_event_summary_vector,
                submitted_prediction=item.submitted_prediction,
                ground_truth=item.ground_truth,
            )
        return RoundLearningEpisode(
            round_id=self.round_id,
            round_number=self.round_number,
            status=self.status,
            per_seed=masked,
        )


def load_round_learning_episode(
    paths: WorkspacePaths,
    round_id: str,
) -> RoundLearningEpisode:
    round_record = read_round_record(paths, round_id)
    analyses = read_analysis_records(paths, round_id)
    submissions = read_submission_records(paths, round_id)

    per_seed: dict[int, SeedLearningArrays] = {}
    for seed_index in range(round_record.round.seeds_count):
        feature_payload = load_named_arrays(paths.feature_tensor_path(round_id, seed_index))
        evidence_payload = load_named_arrays(paths.evidence_tensor_path(round_id, seed_index))

        feature_names = [str(name) for name in feature_payload["feature_names"].tolist()]
        submitted_prediction = None
        if seed_index in submissions:
            prediction_path = paths.prediction_tensor_path(round_id, seed_index)
            if prediction_path.exists():
                submitted_prediction = load_prediction_tensor(prediction_path)

        replay_payload = None
        replay_summary_path = paths.replay_summary_path(round_id, seed_index)
        if replay_summary_path.exists():
            replay_payload = load_named_arrays(replay_summary_path)

        ground_truth = None
        if seed_index in analyses:
            ground_truth = np.asarray(analyses[seed_index].analysis.ground_truth, dtype=np.float64)

        per_seed[seed_index] = SeedLearningArrays(
            round_id=round_id,
            seed_index=seed_index,
            feature_names=feature_names,
            feature_stack=np.asarray(feature_payload["feature_stack"], dtype=np.float64),
            initial_grid=np.asarray(feature_payload["initial_grid"], dtype=np.int64),
            query_count=int(evidence_payload["query_count"][0]),
            repeated_window_groups=int(evidence_payload["repeated_window_groups"][0]),
            coverage_counts=np.asarray(evidence_payload["coverage_counts"], dtype=np.int64),
            observed_class_counts=np.asarray(
                evidence_payload["observed_class_counts"],
                dtype=np.int64,
            ),
            observed_class_frequencies=np.asarray(
                evidence_payload["observed_class_frequencies"],
                dtype=np.float64,
            ),
            observed_class_count_tensor=np.asarray(
                evidence_payload["observed_class_count_tensor"],
                dtype=np.int64,
            ),
            replay_run_count=(
                int(replay_payload["replay_run_count"][0]) if replay_payload is not None else 0
            ),
            replay_frame_transition_count=(
                int(replay_payload["frame_transition_count"][0])
                if replay_payload is not None and "frame_transition_count" in replay_payload
                else 0
            ),
            replay_site_transition_count=(
                int(replay_payload["site_transition_count"][0])
                if replay_payload is not None and "site_transition_count" in replay_payload
                else 0
            ),
            replay_site_opportunity_count=(
                int(replay_payload["site_opportunity_count"][0])
                if replay_payload is not None and "site_opportunity_count" in replay_payload
                else 0
            ),
            replay_settlement_measurement_count=(
                int(replay_payload["settlement_measurement_count"][0])
                if replay_payload is not None and "settlement_measurement_count" in replay_payload
                else 0
            ),
            replay_live_settlement_transition_count=(
                int(replay_payload["live_settlement_transition_count"][0])
                if replay_payload is not None
                and "live_settlement_transition_count" in replay_payload
                else 0
            ),
            replay_ruin_transition_count=(
                int(replay_payload["ruin_transition_count"][0])
                if replay_payload is not None and "ruin_transition_count" in replay_payload
                else 0
            ),
            replay_pairwise_candidate_count=(
                int(replay_payload["pairwise_candidate_count"][0])
                if replay_payload is not None and "pairwise_candidate_count" in replay_payload
                else 0
            ),
            replay_owner_year_count=(
                int(replay_payload["owner_year_count"][0])
                if replay_payload is not None and "owner_year_count" in replay_payload
                else 0
            ),
            replay_year_shock_count=(
                int(replay_payload["year_shock_count"][0])
                if replay_payload is not None and "year_shock_count" in replay_payload
                else 0
            ),
            replay_macro_trajectory_count=(
                int(replay_payload["macro_trajectory_count"][0])
                if replay_payload is not None and "macro_trajectory_count" in replay_payload
                else 0
            ),
            replay_mean_terminal_probs=(
                np.asarray(replay_payload["mean_terminal_probs"], dtype=np.float64)
                if replay_payload is not None
                else None
            ),
            replay_build_hit_rate=(
                np.asarray(replay_payload["build_hit_rate"], dtype=np.float64)
                if replay_payload is not None
                else None
            ),
            replay_port_hit_rate=(
                np.asarray(replay_payload["port_hit_rate"], dtype=np.float64)
                if replay_payload is not None
                else None
            ),
            replay_ruin_hit_rate=(
                np.asarray(replay_payload["ruin_hit_rate"], dtype=np.float64)
                if replay_payload is not None
                else None
            ),
            replay_coefficient_vector=(
                np.asarray(replay_payload["coefficient_vector"], dtype=np.float64)
                if replay_payload is not None
                else None
            ),
            replay_event_summary_names=(
                [str(name) for name in replay_payload["event_summary_names"].tolist()]
                if replay_payload is not None and "event_summary_names" in replay_payload
                else None
            ),
            replay_event_summary_vector=(
                np.asarray(replay_payload["event_summary_vector"], dtype=np.float64)
                if replay_payload is not None and "event_summary_vector" in replay_payload
                else None
            ),
            submitted_prediction=submitted_prediction,
            ground_truth=ground_truth,
        )

    return RoundLearningEpisode(
        round_id=round_id,
        round_number=round_record.round.round_number,
        status=round_record.round.status,
        per_seed=per_seed,
    )
