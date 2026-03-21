from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.history.episodes.models import RoundEpisode
from astar.history.summaries.round_coefficients import (
    fit_round_semimechanistic_coefficients,
    round_regime_summary_vector,
    seed_feature_dict,
    seed_feature_matrix,
)
from astar.infra.serialization.json_utils import to_jsonable
from astar.teacher.decoder.base import SeedLike
from astar.teacher.regime.base import RegimePosteriorState


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


class HazardTeacherCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    feature_names: list[str]
    round_ids: list[str]
    round_numbers: list[int]
    regime_dim: int = Field(ge=1)
    coefficient_dim: int = Field(ge=1)
    regime_intercept: list[float]
    regime_weights: list[list[float]]


class HazardTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "hazard_teacher_v1"
    feature_names: list[str] = Field(default_factory=list)
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 12), dtype=np.float64))
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    regime_intercept: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    regime_weights: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
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
        regime_bank = np.stack([row.regime_vector for row in coefficient_rows], axis=0)
        coefficient_bank = np.stack([row.combined_vector() for row in coefficient_rows], axis=0)
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
                "feature_names": coefficient_rows[0].feature_names,
                "round_ids": tuple(row.round_id for row in coefficient_rows),
                "round_numbers": tuple(row.round_number for row in coefficient_rows),
                "regime_bank": regime_bank,
                "coefficient_bank": coefficient_bank,
                "regime_intercept": regime_intercept,
                "regime_weights": regime_weights,
                "replay_bank_round_ids": tuple(replay_bank_round_ids),
                "replay_bank_seed_indexes": tuple(replay_bank_seed_indexes),
                "replay_runs_bank": tuple(replay_runs_bank),
            },
        )

    def checkpoint(self) -> HazardTeacherCheckpoint:
        return HazardTeacherCheckpoint(
            name=self.name,
            feature_names=self.feature_names,
            round_ids=list(self.round_ids),
            round_numbers=list(self.round_numbers),
            regime_dim=int(self.regime_weights.shape[0]),
            coefficient_dim=int(self.regime_intercept.shape[0]),
            regime_intercept=self.regime_intercept.tolist(),
            regime_weights=self.regime_weights.tolist(),
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(to_jsonable(self.checkpoint()), indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> HazardTeacher:
        checkpoint = HazardTeacherCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        regime_intercept = np.asarray(checkpoint.regime_intercept, dtype=np.float64)
        regime_weights = np.asarray(checkpoint.regime_weights, dtype=np.float64)
        regime_dim = int(regime_weights.shape[0]) if regime_weights.ndim == 2 else 0
        coefficient_dim = int(regime_intercept.shape[0])
        return cls(
            name=checkpoint.name,
            feature_names=list(checkpoint.feature_names),
            round_ids=tuple(checkpoint.round_ids),
            round_numbers=tuple(checkpoint.round_numbers),
            regime_bank=np.zeros((0, regime_dim), dtype=np.float64),
            coefficient_bank=np.zeros((0, coefficient_dim), dtype=np.float64),
            regime_intercept=regime_intercept,
            regime_weights=regime_weights,
        )

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        return round_regime_summary_vector(episode)

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
        ruin_cond = _sigmoid(ruin_score)
        port_cond = _sigmoid(port_score) * coast.astype(np.float64)

        ruin_prob = build_prob * ruin_cond
        port_prob = build_prob * (1.0 - ruin_cond) * port_cond
        settlement_prob = build_prob * (1.0 - ruin_cond) * (1.0 - port_cond)
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
        if posterior.particles is not None and posterior.weights is not None:
            components = [
                self.terminal_tensor(seed, particle, n_rollouts=n_rollouts)
                for particle in posterior.particles
            ]
            stacked = np.stack(components, axis=0)
            weights = np.asarray(posterior.weights, dtype=np.float64)
            weights = weights / np.sum(weights)
            return np.tensordot(weights, stacked, axes=(0, 0))
        return self.terminal_tensor(seed, posterior.mean, n_rollouts=n_rollouts)

    def predict_from_coefficients(
        self,
        seed: SeedLike,
        coefficient_vector: np.ndarray,
    ) -> np.ndarray:
        return self._decode_terminal_tensor(
            seed,
            np.asarray(coefficient_vector, dtype=np.float64),
        )
