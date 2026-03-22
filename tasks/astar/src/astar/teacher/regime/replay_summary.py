from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.features.geometry import SeedFeatureBundle, compute_static_feature_dict
from astar.history.episodes.models import RoundEpisode
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
from astar.history.summaries.dynamic_law import (
    DynamicLawProbeLibrary,
    build_dynamic_law_probe_library,
    fit_round_dynamic_law_summary,
)
from astar.history.summaries.factorization import factorize_summary_matrix
from astar.history.summaries.measurements import (
    ReplayMeasurementBundle,
    build_replay_measurement_bundle,
    load_or_build_round_replay_measurement_bundles,
)
from astar.infra.api.dto import InitialSettlement
from astar.infra.artifacts.paths import WorkspacePaths


def _seed_feature_bundle(episode: RoundEpisode, seed_index: int) -> SeedFeatureBundle:
    seed = next(seed for seed in episode.seeds if seed.seed_index == seed_index)
    grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
    settlements = [
        InitialSettlement(
            x=item.x,
            y=item.y,
            has_port=item.has_port,
            alive=item.alive,
        )
        for item in seed.initial_state.settlements
    ]
    return SeedFeatureBundle(
        round_id=episode.metadata.round_id,
        seed_index=seed.seed_index,
        height=episode.metadata.map_height,
        width=episode.metadata.map_width,
        features=compute_static_feature_dict(grid, settlements),
    )


def _episode_measurement_bundles(episode: RoundEpisode) -> list[ReplayMeasurementBundle]:
    bundles: list[ReplayMeasurementBundle] = []
    for seed in episode.seeds:
        if not seed.replay_runs:
            continue
        bundles.append(
            build_replay_measurement_bundle(
                np.asarray(seed.initial_state.grid, dtype=np.int64),
                _seed_feature_bundle(episode, seed.seed_index),
                list(seed.replay_runs),
            )
        )
    return bundles


def _regime_coordinate_names(prefix: str, dim: int) -> tuple[str, ...]:
    return tuple(f"{prefix}_{index:03d}" for index in range(max(1, dim)))


@dataclass(frozen=True, slots=True)
class ReplayMeasurementRound:
    round_id: str
    round_number: int
    bundles: tuple[ReplayMeasurementBundle, ...]


class ReplaySummaryRegimeEncoderCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    summary_backend: Literal["dynamic_law", "behavioral_fingerprint_core"] = (
        "behavioral_fingerprint_core"
    )
    behavioral_fingerprint_summary_profile: str = "core_v1"
    regime_max_rank: int = Field(default=3, ge=1)
    summary_bootstrap_samples: int = Field(default=4, ge=0)
    regime_summary_names: list[str]
    round_ids: list[str]
    round_numbers: list[int]
    regime_bank: list[list[float]]
    source_summary_names: list[str]
    source_summary_mean: list[float]
    source_summary_scale: list[float]
    source_summary_basis: list[list[float]]
    source_probe_library_kind: str | None = None
    source_probe_library_version: str | None = None
    site_probe_names: list[str] = Field(default_factory=list)
    site_probe_matrix: list[list[float]] = Field(default_factory=list)
    settlement_probe_names: list[str] = Field(default_factory=list)
    settlement_probe_matrix: list[list[float]] = Field(default_factory=list)
    pairwise_probe_names: list[str] = Field(default_factory=list)
    pairwise_probe_matrix: list[list[float]] = Field(default_factory=list)
    ruin_probe_names: list[str] = Field(default_factory=list)
    ruin_probe_matrix: list[list[float]] = Field(default_factory=list)
    owner_probe_names: list[str] = Field(default_factory=list)
    owner_probe_matrix: list[list[float]] = Field(default_factory=list)
    macro_probe_names: list[str] = Field(default_factory=list)
    macro_probe_matrix: list[list[float]] = Field(default_factory=list)
    site_probe_feature_names: list[str] = Field(default_factory=list)
    settlement_probe_feature_names: list[str] = Field(default_factory=list)
    pairwise_probe_feature_names: list[str] = Field(default_factory=list)
    ruin_probe_feature_names: list[str] = Field(default_factory=list)
    owner_probe_feature_names: list[str] = Field(default_factory=list)
    macro_probe_feature_names: list[str] = Field(default_factory=list)


class ReplaySummaryRegimeEncoder(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "replay_summary_regime_encoder_v1"
    summary_backend: Literal["dynamic_law", "behavioral_fingerprint_core"] = (
        "behavioral_fingerprint_core"
    )
    behavioral_fingerprint_summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE
    regime_max_rank: int = Field(default=3, ge=1)
    summary_bootstrap_samples: int = Field(default=4, ge=0)
    regime_summary_names: tuple[str, ...] = ()
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    regime_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
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

    @property
    def regime_dim(self) -> int:
        if self.regime_bank.ndim != 2 or self.regime_bank.size == 0:
            return 0
        return int(self.regime_bank.shape[1])

    def _fit_from_measurement_rounds(
        self,
        replay_rounds: list[ReplayMeasurementRound],
    ) -> ReplaySummaryRegimeEncoder:
        if not replay_rounds:
            raise ValueError("no replay-backed rounds available for regime encoder")

        measurement_bundles_by_round = [list(item.bundles) for item in replay_rounds]
        update: dict[str, object]
        if self.summary_backend == "dynamic_law":
            site_frames = [
                bundle.site_opportunities
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            settlement_frames = [
                bundle.settlement_measurements
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            pairwise_frames = [
                bundle.pairwise_candidates
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            ruin_frames = [
                bundle.ruin_transitions
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            owner_frames = [
                bundle.owner_years
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            macro_frames = [
                bundle.macro_trajectories
                for bundles in measurement_bundles_by_round
                for bundle in bundles
            ]
            dynamic_probe_library = build_dynamic_law_probe_library(
                site_frames,
                settlement_frames,
                pairwise_frames,
                ruin_frames,
                owner_frames,
                macro_frames,
            )
            regime_summary_names: list[str] | None = None
            regime_bank_rows: list[np.ndarray] = []
            for measurement_round, bundles in zip(
                replay_rounds,
                measurement_bundles_by_round,
                strict=True,
            ):
                law = fit_round_dynamic_law_summary(
                    round_id=measurement_round.round_id,
                    round_number=measurement_round.round_number,
                    bundles=bundles,
                )
                names, vector = law.probe_summary(dynamic_probe_library)
                if regime_summary_names is None:
                    regime_summary_names = list(names)
                elif list(names) != regime_summary_names:
                    raise ValueError("dynamic-law probe names drifted across rounds")
                regime_bank_rows.append(np.asarray(vector, dtype=np.float64))
            regime_bank = np.stack(regime_bank_rows, axis=0)
            update = {
                "regime_summary_names": tuple(regime_summary_names or ()),
                "regime_bank": regime_bank,
                "source_summary_names": tuple(regime_summary_names or ()),
                "source_summary_mean": np.mean(regime_bank, axis=0),
                "source_summary_scale": np.ones(regime_bank.shape[1], dtype=np.float64),
                "source_summary_basis": np.eye(regime_bank.shape[1], dtype=np.float64),
                "site_probe_names": tuple(dynamic_probe_library.site_probe_names),
                "site_probe_matrix": dynamic_probe_library.site_probe_matrix,
                "settlement_probe_names": tuple(dynamic_probe_library.settlement_probe_names),
                "settlement_probe_matrix": dynamic_probe_library.settlement_probe_matrix,
                "pairwise_probe_names": tuple(dynamic_probe_library.pairwise_probe_names),
                "pairwise_probe_matrix": dynamic_probe_library.pairwise_probe_matrix,
                "ruin_probe_names": tuple(dynamic_probe_library.ruin_probe_names),
                "ruin_probe_matrix": dynamic_probe_library.ruin_probe_matrix,
                "owner_probe_names": tuple(dynamic_probe_library.owner_probe_names),
                "owner_probe_matrix": dynamic_probe_library.owner_probe_matrix,
                "macro_probe_names": tuple(dynamic_probe_library.macro_probe_names),
                "macro_probe_matrix": dynamic_probe_library.macro_probe_matrix,
                "site_probe_feature_names": tuple(dynamic_probe_library.site_feature_names),
                "settlement_probe_feature_names": tuple(
                    dynamic_probe_library.settlement_feature_names
                ),
                "pairwise_probe_feature_names": tuple(dynamic_probe_library.pairwise_feature_names),
                "ruin_probe_feature_names": tuple(dynamic_probe_library.ruin_feature_names),
                "owner_probe_feature_names": tuple(dynamic_probe_library.owner_feature_names),
                "macro_probe_feature_names": tuple(dynamic_probe_library.macro_feature_names),
            }
        else:
            resolved_summary_profile = resolve_behavioral_fingerprint_summary_profile(
                self.behavioral_fingerprint_summary_profile
            )
            behavioral_probe_library = build_behavioral_fingerprint_probe_library(
                [],
                [],
                [],
                [],
                [],
            )
            source_summary_names: list[str] | None = None
            source_summary_rows: list[np.ndarray] = []
            source_std_rows: list[np.ndarray] = []
            for measurement_round, bundles in zip(
                replay_rounds,
                measurement_bundles_by_round,
                strict=True,
            ):
                estimate = estimate_round_behavioral_fingerprint(
                    round_id=measurement_round.round_id,
                    round_number=measurement_round.round_number,
                    bundles=bundles,
                    probe_library=behavioral_probe_library,
                    bootstrap_samples=self.summary_bootstrap_samples,
                    rng_seed=0,
                )
                selection = select_behavioral_fingerprint_summary_profile(
                    estimate.summary_names,
                    estimate.summary_vector,
                    estimate.summary_std,
                    summary_profile=resolved_summary_profile,
                )
                if source_summary_names is None:
                    source_summary_names = list(selection.summary_names)
                elif list(selection.summary_names) != source_summary_names:
                    raise ValueError("behavioral fingerprint core names drifted across rounds")
                source_summary_rows.append(np.asarray(selection.summary_vector, dtype=np.float64))
                source_std_rows.append(
                    np.asarray(
                        selection.summary_std
                        if selection.summary_std is not None
                        else np.zeros_like(selection.summary_vector, dtype=np.float64),
                        dtype=np.float64,
                    )
                )
            source_summary_matrix = np.stack(source_summary_rows, axis=0)
            source_std_matrix = np.stack(source_std_rows, axis=0)
            source_scale = behavioral_fingerprint_summary_column_scale(
                source_summary_matrix,
                source_std_matrix,
            )
            factorization = factorize_summary_matrix(
                summary_kind="behavioral_fingerprint_core",
                summary_names=list(source_summary_names or ()),
                round_ids=[item.round_id for item in replay_rounds],
                round_numbers=[item.round_number for item in replay_rounds],
                sample_counts=[
                    max(1, sum(bundle.replay_run_count for bundle in item.bundles))
                    for item in replay_rounds
                ],
                summary_matrix=source_summary_matrix,
                max_rank=self.regime_max_rank,
                column_scale=source_scale,
            )
            regime_bank = factorization.coordinates
            update = {
                "regime_summary_names": _regime_coordinate_names(
                    f"behavioral_fingerprint_{resolved_summary_profile}_coord",
                    int(regime_bank.shape[1]),
                ),
                "regime_bank": regime_bank,
                "source_summary_names": tuple(source_summary_names or ()),
                "source_summary_mean": factorization.mean_vector,
                "source_summary_scale": factorization.scale_vector,
                "source_summary_basis": factorization.basis,
                "source_probe_library_kind": behavioral_probe_library.library_kind,
                "source_probe_library_version": behavioral_probe_library.library_version,
                "behavioral_fingerprint_summary_profile": resolved_summary_profile,
                "site_probe_names": tuple(),
                "site_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "settlement_probe_names": tuple(),
                "settlement_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "pairwise_probe_names": tuple(),
                "pairwise_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "ruin_probe_names": tuple(),
                "ruin_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "owner_probe_names": tuple(),
                "owner_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "macro_probe_names": tuple(),
                "macro_probe_matrix": np.zeros((0, 0), dtype=np.float64),
                "site_probe_feature_names": tuple(),
                "settlement_probe_feature_names": tuple(),
                "pairwise_probe_feature_names": tuple(),
                "ruin_probe_feature_names": tuple(),
                "owner_probe_feature_names": tuple(),
                "macro_probe_feature_names": tuple(),
            }

        return self.model_copy(
            update={
                "round_ids": tuple(item.round_id for item in replay_rounds),
                "round_numbers": tuple(item.round_number for item in replay_rounds),
                **update,
            }
        )

    def fit(self, episodes: list[RoundEpisode]) -> ReplaySummaryRegimeEncoder:
        replay_rounds = [
            ReplayMeasurementRound(
                round_id=episode.metadata.round_id,
                round_number=int(episode.metadata.round_number or -1),
                bundles=tuple(_episode_measurement_bundles(episode)),
            )
            for episode in episodes
            if episode.replay_run_count > 0
        ]
        return self._fit_from_measurement_rounds(replay_rounds)

    def fit_from_workspace(
        self,
        paths: WorkspacePaths,
        round_ids: list[str],
    ) -> ReplaySummaryRegimeEncoder:
        replay_rounds: list[ReplayMeasurementRound] = []
        for round_id in round_ids:
            round_number, bundles = load_or_build_round_replay_measurement_bundles(paths, round_id)
            if not bundles:
                continue
            replay_rounds.append(
                ReplayMeasurementRound(
                    round_id=round_id,
                    round_number=round_number,
                    bundles=tuple(bundles),
                )
            )
        return self._fit_from_measurement_rounds(replay_rounds)

    def checkpoint(self) -> ReplaySummaryRegimeEncoderCheckpoint:
        return ReplaySummaryRegimeEncoderCheckpoint(
            name=self.name,
            summary_backend=self.summary_backend,
            behavioral_fingerprint_summary_profile=self.behavioral_fingerprint_summary_profile,
            regime_max_rank=self.regime_max_rank,
            summary_bootstrap_samples=self.summary_bootstrap_samples,
            regime_summary_names=list(self.regime_summary_names),
            round_ids=list(self.round_ids),
            round_numbers=list(self.round_numbers),
            regime_bank=np.asarray(self.regime_bank, dtype=np.float64).tolist(),
            source_summary_names=list(self.source_summary_names),
            source_summary_mean=np.asarray(self.source_summary_mean, dtype=np.float64).tolist(),
            source_summary_scale=np.asarray(self.source_summary_scale, dtype=np.float64).tolist(),
            source_summary_basis=np.asarray(self.source_summary_basis, dtype=np.float64).tolist(),
            source_probe_library_kind=self.source_probe_library_kind,
            source_probe_library_version=self.source_probe_library_version,
            site_probe_names=list(self.site_probe_names),
            site_probe_matrix=np.asarray(self.site_probe_matrix, dtype=np.float64).tolist(),
            settlement_probe_names=list(self.settlement_probe_names),
            settlement_probe_matrix=np.asarray(
                self.settlement_probe_matrix, dtype=np.float64
            ).tolist(),
            pairwise_probe_names=list(self.pairwise_probe_names),
            pairwise_probe_matrix=np.asarray(self.pairwise_probe_matrix, dtype=np.float64).tolist(),
            ruin_probe_names=list(self.ruin_probe_names),
            ruin_probe_matrix=np.asarray(self.ruin_probe_matrix, dtype=np.float64).tolist(),
            owner_probe_names=list(self.owner_probe_names),
            owner_probe_matrix=np.asarray(self.owner_probe_matrix, dtype=np.float64).tolist(),
            macro_probe_names=list(self.macro_probe_names),
            macro_probe_matrix=np.asarray(self.macro_probe_matrix, dtype=np.float64).tolist(),
            site_probe_feature_names=list(self.site_probe_feature_names),
            settlement_probe_feature_names=list(self.settlement_probe_feature_names),
            pairwise_probe_feature_names=list(self.pairwise_probe_feature_names),
            ruin_probe_feature_names=list(self.ruin_probe_feature_names),
            owner_probe_feature_names=list(self.owner_probe_feature_names),
            macro_probe_feature_names=list(self.macro_probe_feature_names),
        )

    @classmethod
    def from_checkpoint(
        cls,
        checkpoint: ReplaySummaryRegimeEncoderCheckpoint,
    ) -> ReplaySummaryRegimeEncoder:
        return cls(
            name=checkpoint.name,
            summary_backend=checkpoint.summary_backend,
            behavioral_fingerprint_summary_profile=checkpoint.behavioral_fingerprint_summary_profile,
            regime_max_rank=checkpoint.regime_max_rank,
            summary_bootstrap_samples=checkpoint.summary_bootstrap_samples,
            regime_summary_names=tuple(checkpoint.regime_summary_names),
            round_ids=tuple(checkpoint.round_ids),
            round_numbers=tuple(int(value) for value in checkpoint.round_numbers),
            regime_bank=np.asarray(checkpoint.regime_bank, dtype=np.float64),
            source_summary_names=tuple(checkpoint.source_summary_names),
            source_summary_mean=np.asarray(checkpoint.source_summary_mean, dtype=np.float64),
            source_summary_scale=np.asarray(checkpoint.source_summary_scale, dtype=np.float64),
            source_summary_basis=np.asarray(checkpoint.source_summary_basis, dtype=np.float64),
            source_probe_library_kind=checkpoint.source_probe_library_kind,
            source_probe_library_version=checkpoint.source_probe_library_version,
            site_probe_names=tuple(checkpoint.site_probe_names),
            site_probe_matrix=np.asarray(checkpoint.site_probe_matrix, dtype=np.float64),
            settlement_probe_names=tuple(checkpoint.settlement_probe_names),
            settlement_probe_matrix=np.asarray(
                checkpoint.settlement_probe_matrix,
                dtype=np.float64,
            ),
            pairwise_probe_names=tuple(checkpoint.pairwise_probe_names),
            pairwise_probe_matrix=np.asarray(checkpoint.pairwise_probe_matrix, dtype=np.float64),
            ruin_probe_names=tuple(checkpoint.ruin_probe_names),
            ruin_probe_matrix=np.asarray(checkpoint.ruin_probe_matrix, dtype=np.float64),
            owner_probe_names=tuple(checkpoint.owner_probe_names),
            owner_probe_matrix=np.asarray(checkpoint.owner_probe_matrix, dtype=np.float64),
            macro_probe_names=tuple(checkpoint.macro_probe_names),
            macro_probe_matrix=np.asarray(checkpoint.macro_probe_matrix, dtype=np.float64),
            site_probe_feature_names=tuple(checkpoint.site_probe_feature_names),
            settlement_probe_feature_names=tuple(checkpoint.settlement_probe_feature_names),
            pairwise_probe_feature_names=tuple(checkpoint.pairwise_probe_feature_names),
            ruin_probe_feature_names=tuple(checkpoint.ruin_probe_feature_names),
            owner_probe_feature_names=tuple(checkpoint.owner_probe_feature_names),
            macro_probe_feature_names=tuple(checkpoint.macro_probe_feature_names),
        )

    def encode(self, episode: RoundEpisode) -> np.ndarray:
        return self.encode_round(episode)

    def _encode_measurement_round(
        self,
        measurement_round: ReplayMeasurementRound,
    ) -> np.ndarray:
        bundles = list(measurement_round.bundles)
        if not bundles:
            raise ValueError(
                f"round {measurement_round.round_id} has no replay measurements to encode"
            )
        if self.summary_backend == "dynamic_law":
            if (
                self.site_probe_matrix.size == 0
                or self.settlement_probe_matrix.size == 0
                or self.pairwise_probe_matrix.size == 0
            ):
                raise ValueError("regime encoder has no dynamic-law probe library")
            law = fit_round_dynamic_law_summary(
                round_id=measurement_round.round_id,
                round_number=measurement_round.round_number,
                bundles=bundles,
            )
            _, vector = law.probe_summary(
                DynamicLawProbeLibrary(
                    site_feature_names=self.site_probe_feature_names,
                    settlement_feature_names=self.settlement_probe_feature_names,
                    pairwise_feature_names=self.pairwise_probe_feature_names,
                    ruin_feature_names=self.ruin_probe_feature_names,
                    owner_feature_names=self.owner_probe_feature_names,
                    macro_feature_names=self.macro_probe_feature_names,
                    site_probe_names=self.site_probe_names,
                    site_probe_matrix=self.site_probe_matrix,
                    settlement_probe_names=self.settlement_probe_names,
                    settlement_probe_matrix=self.settlement_probe_matrix,
                    pairwise_probe_names=self.pairwise_probe_names,
                    pairwise_probe_matrix=self.pairwise_probe_matrix,
                    ruin_probe_names=self.ruin_probe_names,
                    ruin_probe_matrix=self.ruin_probe_matrix,
                    owner_probe_names=self.owner_probe_names,
                    owner_probe_matrix=self.owner_probe_matrix,
                    macro_probe_names=self.macro_probe_names,
                    macro_probe_matrix=self.macro_probe_matrix,
                )
            )
            return np.asarray(vector, dtype=np.float64)
        if self.source_summary_basis.size == 0:
            raise ValueError("regime encoder has no behavioral-fingerprint-core basis")
        probe_library = build_behavioral_fingerprint_probe_library([], [], [], [], [])
        if (
            self.source_probe_library_kind is not None
            and probe_library.library_kind != self.source_probe_library_kind
        ):
            raise ValueError("behavioral fingerprint probe library kind mismatch")
        if (
            self.source_probe_library_version is not None
            and probe_library.library_version != self.source_probe_library_version
        ):
            raise ValueError("behavioral fingerprint probe library version mismatch")
        estimate = estimate_round_behavioral_fingerprint(
            round_id=measurement_round.round_id,
            round_number=measurement_round.round_number,
            bundles=bundles,
            probe_library=probe_library,
            bootstrap_samples=0,
            rng_seed=0,
        )
        selection = select_behavioral_fingerprint_summary_profile(
            estimate.summary_names,
            estimate.summary_vector,
            summary_profile=resolve_behavioral_fingerprint_summary_profile(
                self.behavioral_fingerprint_summary_profile
            ),
        )
        if tuple(selection.summary_names) != tuple(self.source_summary_names):
            raise ValueError("behavioral fingerprint core names mismatch")
        centered = np.asarray(selection.summary_vector, dtype=np.float64) - np.asarray(
            self.source_summary_mean,
            dtype=np.float64,
        )
        scaled = centered / np.asarray(self.source_summary_scale, dtype=np.float64)
        return np.asarray(scaled @ self.source_summary_basis.T, dtype=np.float64)

    def encode_round(self, episode: RoundEpisode) -> np.ndarray:
        return self._encode_measurement_round(
            ReplayMeasurementRound(
                round_id=episode.metadata.round_id,
                round_number=int(episode.metadata.round_number or -1),
                bundles=tuple(_episode_measurement_bundles(episode)),
            )
        )

    def encode_round_from_workspace(self, paths: WorkspacePaths, round_id: str) -> np.ndarray:
        round_number, bundles = load_or_build_round_replay_measurement_bundles(paths, round_id)
        return self._encode_measurement_round(
            ReplayMeasurementRound(
                round_id=round_id,
                round_number=round_number,
                bundles=tuple(bundles),
            )
        )


__all__ = [
    "ReplaySummaryRegimeEncoder",
    "ReplaySummaryRegimeEncoderCheckpoint",
]
