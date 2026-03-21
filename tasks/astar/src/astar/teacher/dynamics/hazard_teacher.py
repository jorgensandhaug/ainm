from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.behavioral_fingerprint_core import (
    DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
)
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients,
    seed_feature_dict,
    seed_feature_matrix,
)
from astar.infra.serialization.json_utils import to_jsonable
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState
from astar.teacher.regime.replay_summary import ReplaySummaryRegimeEncoder


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
    solution = np.linalg.pinv(lhs) @ rhs
    return np.asarray(solution[0], dtype=np.float64), np.asarray(solution[1:], dtype=np.float64)


def _sigmoid(values: np.ndarray) -> np.ndarray:
    return np.asarray(
        1.0 / (1.0 + np.exp(-np.clip(values, -25.0, 25.0))),
        dtype=np.float64,
    )


def _project_exclusive_pair(
    total_cap: np.ndarray,
    first: np.ndarray,
    second: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    cap = np.asarray(np.clip(total_cap, 0.0, None), dtype=np.float64)
    first_array = np.asarray(np.clip(first, 0.0, None), dtype=np.float64)
    second_array = np.asarray(np.clip(second, 0.0, None), dtype=np.float64)

    projected_first = np.array(first_array, copy=True)
    projected_second = np.array(second_array, copy=True)

    over_mask = (first_array + second_array) > cap
    if not np.any(over_mask):
        return projected_first, projected_second

    over_first = first_array[over_mask]
    over_second = second_array[over_mask]
    over_cap = cap[over_mask]
    diff = over_first - over_second

    first_dominates = diff >= over_cap
    second_dominates = (-diff) >= over_cap
    balanced = ~(first_dominates | second_dominates)

    projected_over_first = np.array(over_first, copy=True)
    projected_over_second = np.array(over_second, copy=True)

    projected_over_first[first_dominates] = over_cap[first_dominates]
    projected_over_second[first_dominates] = 0.0

    projected_over_first[second_dominates] = 0.0
    projected_over_second[second_dominates] = over_cap[second_dominates]

    balanced_first = over_first[balanced]
    balanced_second = over_second[balanced]
    balanced_cap = over_cap[balanced]
    projected_over_first[balanced] = 0.5 * (balanced_first - balanced_second + balanced_cap)
    projected_over_second[balanced] = 0.5 * (balanced_second - balanced_first + balanced_cap)

    projected_first[over_mask] = np.clip(projected_over_first, 0.0, None)
    projected_second[over_mask] = np.clip(projected_over_second, 0.0, None)
    return projected_first, projected_second


class HazardTeacherCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    summary_backend: str = "behavioral_fingerprint_core"
    behavioral_fingerprint_summary_profile: str = "core_v1"
    feature_names: list[str]
    round_ids: list[str]
    round_numbers: list[int]
    regime_dim: int = Field(ge=1)
    coefficient_dim: int = Field(ge=1)
    regime_summary_names: list[str]
    regime_intercept: list[float]
    regime_weights: list[list[float]]


class HazardTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v1"
    summary_backend: Literal["dynamic_law", "behavioral_fingerprint_core"] = (
        "behavioral_fingerprint_core"
    )
    behavioral_fingerprint_summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE
    regime_max_rank: int = Field(default=3, ge=1)
    summary_bootstrap_samples: int = Field(default=4, ge=0)
    regime_encoder: ReplaySummaryRegimeEncoder | None = None
    feature_names: list[str] = Field(default_factory=list)
    regime_summary_names: tuple[str, ...] = ()
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    source_summary_names: tuple[str, ...] = ()
    source_summary_mean: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    source_summary_scale: np.ndarray = Field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    source_summary_basis: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    source_probe_library_kind: str | None = None
    source_probe_library_version: str | None = None
    site_probe_names: tuple[str, ...] = ()
    site_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    settlement_probe_names: tuple[str, ...] = ()
    settlement_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    pairwise_probe_names: tuple[str, ...] = ()
    pairwise_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    ruin_probe_names: tuple[str, ...] = ()
    ruin_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    owner_probe_names: tuple[str, ...] = ()
    owner_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    macro_probe_names: tuple[str, ...] = ()
    macro_probe_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 0), dtype=np.float64)
    )
    site_probe_feature_names: tuple[str, ...] = ()
    settlement_probe_feature_names: tuple[str, ...] = ()
    pairwise_probe_feature_names: tuple[str, ...] = ()
    ruin_probe_feature_names: tuple[str, ...] = ()
    owner_probe_feature_names: tuple[str, ...] = ()
    macro_probe_feature_names: tuple[str, ...] = ()
    replay_bank_round_ids: tuple[str, ...] = ()
    replay_bank_seed_indexes: tuple[int, ...] = ()
    replay_runs_bank: tuple[tuple[ReplayRun, ...], ...] = ()

    def fit(self, episodes: list[RoundEpisode]) -> HazardTeacher:
        replay_episodes = [episode for episode in episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("no replay-backed episodes available for hazard teacher")

        coefficient_rows = [
            fit_round_semimechanistic_coefficients(episode) for episode in replay_episodes
        ]
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
        regime_encoder = ReplaySummaryRegimeEncoder(
            name=f"{self.name}__regime_encoder",
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
            summary_bootstrap_samples=self.summary_bootstrap_samples,
        ).fit(replay_episodes)
        regime_bank = np.asarray(regime_encoder.regime_bank, dtype=np.float64)
        regime_intercept, regime_weights = _fit_linear_map(
            regime_bank,
            coefficient_bank,
            ridge_alpha=1e-2,
        )

        replay_bank_round_ids: list[str] = []
        replay_bank_seed_indexes: list[int] = []
        replay_runs_bank: list[tuple[ReplayRun, ...]] = []
        for episode in replay_episodes:
            for seed in episode.seeds:
                if not seed.replay_runs:
                    continue
                replay_bank_round_ids.append(episode.metadata.round_id)
                replay_bank_seed_indexes.append(seed.seed_index)
                replay_runs_bank.append(seed.replay_runs)

        return self.model_copy(
            update={
                "regime_encoder": regime_encoder,
                "behavioral_fingerprint_summary_profile": (
                    regime_encoder.behavioral_fingerprint_summary_profile
                ),
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "regime_summary_names": regime_encoder.regime_summary_names,
                "regime_bank": regime_bank,
                "coefficient_bank": coefficient_bank,
                "regime_intercept": regime_intercept,
                "regime_weights": regime_weights,
                "source_summary_names": regime_encoder.source_summary_names,
                "source_summary_mean": np.asarray(
                    regime_encoder.source_summary_mean,
                    dtype=np.float64,
                ),
                "source_summary_scale": np.asarray(
                    regime_encoder.source_summary_scale,
                    dtype=np.float64,
                ),
                "source_summary_basis": np.asarray(
                    regime_encoder.source_summary_basis,
                    dtype=np.float64,
                ),
                "source_probe_library_kind": regime_encoder.source_probe_library_kind,
                "source_probe_library_version": regime_encoder.source_probe_library_version,
                "site_probe_names": regime_encoder.site_probe_names,
                "site_probe_matrix": np.asarray(regime_encoder.site_probe_matrix, dtype=np.float64),
                "settlement_probe_names": regime_encoder.settlement_probe_names,
                "settlement_probe_matrix": np.asarray(
                    regime_encoder.settlement_probe_matrix,
                    dtype=np.float64,
                ),
                "pairwise_probe_names": regime_encoder.pairwise_probe_names,
                "pairwise_probe_matrix": np.asarray(
                    regime_encoder.pairwise_probe_matrix,
                    dtype=np.float64,
                ),
                "ruin_probe_names": regime_encoder.ruin_probe_names,
                "ruin_probe_matrix": np.asarray(regime_encoder.ruin_probe_matrix, dtype=np.float64),
                "owner_probe_names": regime_encoder.owner_probe_names,
                "owner_probe_matrix": np.asarray(
                    regime_encoder.owner_probe_matrix,
                    dtype=np.float64,
                ),
                "macro_probe_names": regime_encoder.macro_probe_names,
                "macro_probe_matrix": np.asarray(
                    regime_encoder.macro_probe_matrix,
                    dtype=np.float64,
                ),
                "site_probe_feature_names": regime_encoder.site_probe_feature_names,
                "settlement_probe_feature_names": regime_encoder.settlement_probe_feature_names,
                "pairwise_probe_feature_names": regime_encoder.pairwise_probe_feature_names,
                "ruin_probe_feature_names": regime_encoder.ruin_probe_feature_names,
                "owner_probe_feature_names": regime_encoder.owner_probe_feature_names,
                "macro_probe_feature_names": regime_encoder.macro_probe_feature_names,
                "replay_bank_round_ids": tuple(replay_bank_round_ids),
                "replay_bank_seed_indexes": tuple(replay_bank_seed_indexes),
                "replay_runs_bank": tuple(replay_runs_bank),
            },
        )

    def checkpoint(self) -> HazardTeacherCheckpoint:
        return HazardTeacherCheckpoint(
            name=self.name,
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            feature_names=self.feature_names,
            round_ids=list(self.round_ids),
            round_numbers=list(self.round_numbers),
            regime_dim=int(self.regime_weights.shape[0]),
            coefficient_dim=int(self.regime_intercept.shape[0]),
            regime_summary_names=list(self.regime_summary_names),
            regime_intercept=self.regime_intercept.tolist(),
            regime_weights=self.regime_weights.tolist(),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    def _compat_regime_encoder(self) -> ReplaySummaryRegimeEncoder:
        if self.regime_bank.size == 0:
            raise ValueError("hazard teacher has no stored regime encoder state")
        return ReplaySummaryRegimeEncoder(
            name=f"{self.name}__compat_regime_encoder",
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
            summary_bootstrap_samples=self.summary_bootstrap_samples,
            regime_summary_names=self.regime_summary_names,
            round_ids=self.round_ids,
            round_numbers=self.round_numbers,
            regime_bank=np.asarray(self.regime_bank, dtype=np.float64),
            source_summary_names=self.source_summary_names,
            source_summary_mean=np.asarray(self.source_summary_mean, dtype=np.float64),
            source_summary_scale=np.asarray(self.source_summary_scale, dtype=np.float64),
            source_summary_basis=np.asarray(self.source_summary_basis, dtype=np.float64),
            source_probe_library_kind=self.source_probe_library_kind,
            source_probe_library_version=self.source_probe_library_version,
            site_probe_names=self.site_probe_names,
            site_probe_matrix=np.asarray(self.site_probe_matrix, dtype=np.float64),
            settlement_probe_names=self.settlement_probe_names,
            settlement_probe_matrix=np.asarray(self.settlement_probe_matrix, dtype=np.float64),
            pairwise_probe_names=self.pairwise_probe_names,
            pairwise_probe_matrix=np.asarray(self.pairwise_probe_matrix, dtype=np.float64),
            ruin_probe_names=self.ruin_probe_names,
            ruin_probe_matrix=np.asarray(self.ruin_probe_matrix, dtype=np.float64),
            owner_probe_names=self.owner_probe_names,
            owner_probe_matrix=np.asarray(self.owner_probe_matrix, dtype=np.float64),
            macro_probe_names=self.macro_probe_names,
            macro_probe_matrix=np.asarray(self.macro_probe_matrix, dtype=np.float64),
            site_probe_feature_names=self.site_probe_feature_names,
            settlement_probe_feature_names=self.settlement_probe_feature_names,
            pairwise_probe_feature_names=self.pairwise_probe_feature_names,
            ruin_probe_feature_names=self.ruin_probe_feature_names,
            owner_probe_feature_names=self.owner_probe_feature_names,
            macro_probe_feature_names=self.macro_probe_feature_names,
        )

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        encoder = self.regime_encoder
        if encoder is None:
            encoder = self._compat_regime_encoder()
        return np.asarray(encoder.encode_round(episode), dtype=np.float64)

    def _coefficients_from_regime(self, regime: np.ndarray) -> np.ndarray:
        regime_array = np.asarray(regime, dtype=np.float64)
        if regime_array.ndim != 1:
            raise ValueError(f"expected 1D regime vector, got shape {regime_array.shape!r}")
        if regime_array.shape[0] != self.regime_weights.shape[0]:
            if self.regime_bank.size == 0:
                raise ValueError("hazard teacher has no regime bank")
            if regime_array.shape[0] == self.regime_bank.shape[1]:
                pass
            else:
                raise ValueError(
                    "expected regime dim "
                    f"{self.regime_weights.shape[0]}, got {regime_array.shape[0]}",
                )
        return np.asarray(
            self.regime_intercept + regime_array @ self.regime_weights,
            dtype=np.float64,
        )

    def _split_coefficients(
        self,
        coefficient_vector: np.ndarray,
    ) -> tuple[float, np.ndarray, float, np.ndarray, float, np.ndarray]:
        feature_dim = len(self.feature_names)
        expected = 3 + 3 * feature_dim
        if coefficient_vector.shape[0] != expected:
            raise ValueError(
                f"expected coefficient dim {expected}, got {coefficient_vector.shape[0]}",
            )
        offset = 0
        build_intercept = float(coefficient_vector[offset])
        offset += 1
        build_coef = np.asarray(coefficient_vector[offset : offset + feature_dim], dtype=np.float64)
        offset += feature_dim
        port_intercept = float(coefficient_vector[offset])
        offset += 1
        port_coef = np.asarray(coefficient_vector[offset : offset + feature_dim], dtype=np.float64)
        offset += feature_dim
        ruin_intercept = float(coefficient_vector[offset])
        offset += 1
        ruin_coef = np.asarray(coefficient_vector[offset : offset + feature_dim], dtype=np.float64)
        return (
            build_intercept,
            build_coef,
            port_intercept,
            port_coef,
            ruin_intercept,
            ruin_coef,
        )

    def _decode_terminal_tensor(
        self,
        seed: SeedLike,
        coefficient_vector: np.ndarray,
    ) -> np.ndarray:
        (
            build_intercept,
            build_coef,
            port_intercept,
            port_coef,
            ruin_intercept,
            ruin_coef,
        ) = self._split_coefficients(coefficient_vector)
        _, feature_stack = seed_feature_matrix(seed.initial_state)
        feature_dict = seed_feature_dict(seed.initial_state)
        grid = np.asarray(seed.initial_state.grid, dtype=np.int64)

        build_score = build_intercept + np.tensordot(build_coef, feature_stack, axes=(0, 0))
        port_score = port_intercept + np.tensordot(port_coef, feature_stack, axes=(0, 0))
        ruin_score = ruin_intercept + np.tensordot(ruin_coef, feature_stack, axes=(0, 0))

        buildable = feature_dict["buildable"] > 0.5
        coast = feature_dict["coast"] > 0.5
        ocean = feature_dict["initial_ocean"] > 0.5
        mountain = feature_dict["initial_mountain"] > 0.5

        build_prob = _sigmoid(build_score) * buildable.astype(np.float64)
        raw_ruin = _sigmoid(ruin_score) * buildable.astype(np.float64)
        raw_port = _sigmoid(port_score) * coast.astype(np.float64)

        ruin_prob, port_prob = _project_exclusive_pair(
            build_prob,
            raw_ruin,
            raw_port,
        )
        settlement_prob = np.clip(build_prob - ruin_prob - port_prob, 0.0, 1.0)
        forest_prior = np.where(grid == 4, 0.70, 0.05)
        forest_prob = np.where(
            buildable,
            np.clip((1.0 - build_prob) * forest_prior, 0.0, 1.0),
            0.0,
        )

        empty_prob = 1.0 - (settlement_prob + port_prob + ruin_prob + forest_prob)
        empty_prob = np.clip(empty_prob, 0.0, 1.0)

        probs = np.stack(
            [
                empty_prob,
                settlement_prob,
                port_prob,
                ruin_prob,
                forest_prob,
                mountain.astype(np.float64),
            ],
            axis=-1,
        ).astype(np.float64)

        soft_mask = ~(ocean | mountain)
        prior = np.asarray([0.84, 0.05, 0.02, 0.02, 0.05, 0.02], dtype=np.float64)
        probs[soft_mask] = 0.98 * probs[soft_mask] + 0.02 * prior

        probs[ocean] = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        probs[mountain] = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)

        sums = probs.sum(axis=-1, keepdims=True)
        valid = sums[:, :, 0] > 0.0
        probs[valid] = probs[valid] / sums[valid]
        if np.any(~valid):
            probs[~valid] = prior
        return probs

    def _nearest_seed_bank_indexes(self, regime: np.ndarray, seed_index: int) -> list[int]:
        if self.regime_bank.size == 0:
            return []
        distances = np.linalg.norm(self.regime_bank - regime[None, :], axis=1)
        ordered_round_indexes = np.argsort(distances)
        selected: list[int] = []
        for round_index in ordered_round_indexes:
            round_id = self.round_ids[int(round_index)]
            round_seed_indexes = [
                index
                for index, (bank_round_id, bank_seed_index) in enumerate(
                    zip(self.replay_bank_round_ids, self.replay_bank_seed_indexes, strict=True),
                )
                if bank_round_id == round_id and bank_seed_index == seed_index
            ]
            if round_seed_indexes:
                selected.extend(round_seed_indexes)
                break
        if selected:
            return selected
        return [
            index
            for index, bank_seed_index in enumerate(self.replay_bank_seed_indexes)
            if bank_seed_index == seed_index
        ]

    def rollout(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int,
        horizon: int = 50,
    ) -> list[ReplayRun]:
        del horizon
        seed_replay_runs = tuple(getattr(seed, "replay_runs", ()))
        if seed_replay_runs:
            source_runs = list(seed_replay_runs)
        else:
            source_runs = [
                run
                for index in self._nearest_seed_bank_indexes(np.asarray(regime), seed.seed_index)
                for run in self.replay_runs_bank[index]
            ]
        if not source_runs:
            return []
        return [source_runs[index % len(source_runs)] for index in range(n_rollouts)]

    def terminal_tensor(
        self,
        seed: SeedLike,
        regime: np.ndarray,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        del n_rollouts
        coefficient_vector = self._coefficients_from_regime(np.asarray(regime, dtype=np.float64))
        return self._decode_terminal_tensor(seed, coefficient_vector)

    def posterior_predictive(
        self,
        seed: SeedLike,
        posterior: RegimePosteriorState,
        n_rollouts: int = 256,
    ) -> np.ndarray:
        if posterior.particles and posterior.weights is not None:
            components = [
                self.terminal_tensor(seed, particle, n_rollouts=n_rollouts)
                for particle in posterior.particles
            ]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weight_sum = float(np.sum(weights))
            if weight_sum > 0.0:
                weights = weights / weight_sum
            else:
                weights = np.ones_like(weights) / float(len(weights))
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean, n_rollouts=n_rollouts)
