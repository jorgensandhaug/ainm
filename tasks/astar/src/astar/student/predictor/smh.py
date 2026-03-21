from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.trajectory import LiveQueryObs
from astar.envs.conversion import round_context_to_online_episode
from astar.envs.types import RoundContext, build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.history.learning import RoundLearningEpisode, load_round_learning_episode
from astar.history.summaries.manifold import factorize_round_coefficients
from astar.history.summaries.round_coefficients import (
    RoundSemimechanisticCoefficients,
    fit_round_semimechanistic_coefficients,
)
from astar.infra.api.dto import InitialState, RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle, SeedEvidenceBundle, build_round_evidence_from_observations
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor
from astar.teacher.dynamics.hazard_teacher import HazardTeacher

SummaryVariant = Literal["covsum", "covaug", "covmark"]
LatentKind = Literal["regime", "manifold"]


def _safe_optional(value: float | None) -> float:
    return 0.0 if value is None else float(value)


def _safe_ratio(numerator: float, denominator: float) -> float:
    if abs(denominator) <= 1e-9:
        return 0.0
    return float(numerator / denominator)


def _seed_covsum_components(seed_evidence: SeedEvidenceBundle) -> list[float]:
    return [
        float(seed_evidence.query_count),
        *seed_evidence.observed_class_frequencies.astype(np.float64).tolist(),
        _safe_optional(seed_evidence.mean_population),
        _safe_optional(seed_evidence.mean_food),
        _safe_optional(seed_evidence.mean_wealth),
        _safe_optional(seed_evidence.mean_defense),
    ]


def _initial_state_class_frequencies(initial_state: InitialState) -> np.ndarray:
    collapsed = collapse_internal_grid(np.asarray(initial_state.grid, dtype=np.int64))
    bincount = np.bincount(collapsed.reshape(-1), minlength=CLASS_COUNT).astype(np.float64)
    total = float(np.sum(bincount))
    if total <= 0.0:
        return np.zeros(CLASS_COUNT, dtype=np.float64)
    return bincount / total


def _seed_covaug_components(
    initial_state: InitialState,
    seed_evidence: SeedEvidenceBundle,
) -> list[float]:
    observed_frequencies = np.asarray(seed_evidence.observed_class_frequencies, dtype=np.float64)
    built_frequency = float(np.sum(observed_frequencies[1:4]))
    initial_frequencies = _initial_state_class_frequencies(initial_state)
    settlement_count = float(len(initial_state.settlements))
    port_count = float(sum(1 for item in initial_state.settlements if item.has_port))
    coverage_fraction = float(np.mean(seed_evidence.coverage_counts > 0))
    repeat_rate = _safe_ratio(
        float(seed_evidence.repeated_window_groups),
        float(max(seed_evidence.query_count, 1)),
    )
    return [
        float(seed_evidence.query_count),
        coverage_fraction,
        repeat_rate,
        *observed_frequencies.tolist(),
        built_frequency,
        _safe_ratio(float(observed_frequencies[2]), built_frequency),
        _safe_ratio(float(observed_frequencies[3]), built_frequency),
        _safe_optional(seed_evidence.mean_population),
        _safe_optional(seed_evidence.mean_food),
        _safe_optional(seed_evidence.mean_wealth),
        _safe_optional(seed_evidence.mean_defense),
        _safe_ratio(settlement_count, float(np.asarray(initial_state.grid).size)),
        _safe_ratio(port_count, settlement_count),
        *initial_frequencies.tolist(),
    ]


def _seed_covmark_components(seed_evidence: SeedEvidenceBundle) -> list[float]:
    observed_frequencies = np.asarray(seed_evidence.observed_class_frequencies, dtype=np.float64)
    built_frequency = float(np.sum(observed_frequencies[1:4]))
    return [
        float(seed_evidence.query_count),
        float(np.mean(seed_evidence.coverage_counts > 0)),
        _safe_ratio(
            float(seed_evidence.repeated_window_groups),
            float(max(seed_evidence.query_count, 1)),
        ),
        built_frequency,
        _safe_ratio(float(observed_frequencies[2]), built_frequency),
        _safe_ratio(float(observed_frequencies[3]), built_frequency),
        _safe_optional(seed_evidence.mean_population),
        _safe_optional(seed_evidence.mean_food),
        _safe_optional(seed_evidence.mean_wealth),
        _safe_optional(seed_evidence.mean_defense),
    ]


def _summary_vector_from_round_detail(
    round_detail: RoundDetail,
    evidence_bundle: RoundEvidenceBundle,
    *,
    summary_variant: SummaryVariant,
) -> np.ndarray:
    components: list[float] = []
    for seed_index in range(round_detail.seeds_count):
        seed_evidence = evidence_bundle.per_seed[seed_index]
        initial_state = round_detail.initial_states[seed_index]
        if summary_variant == "covsum":
            components.extend(_seed_covsum_components(seed_evidence))
            continue
        if summary_variant == "covaug":
            components.extend(_seed_covaug_components(initial_state, seed_evidence))
            continue
        if summary_variant == "covmark":
            components.extend(_seed_covmark_components(seed_evidence))
            continue
        raise ValueError(f"unsupported summary variant: {summary_variant}")
    return np.asarray(components, dtype=np.float64)


def _fit_round_summary_statistics(
    paths: WorkspacePaths,
    *,
    index_path: Path,
    round_ids: list[str],
    summary_variant: SummaryVariant,
) -> tuple[np.ndarray, np.ndarray]:
    round_detail_cache: dict[str, RoundDetail] = {}
    rows_by_round: dict[str, list[np.ndarray]] = {round_id: [] for round_id in round_ids}
    index_table = pl.read_parquet(index_path)
    for path_value, round_id in zip(
        index_table["episode_path"].to_list(),
        index_table["round_id"].to_list(),
        strict=True,
    ):
        resolved_round_id = str(round_id)
        if resolved_round_id not in rows_by_round:
            continue
        artifact_path = resolve_synthetic_episode_path(index_path, Path(str(path_value)))
        artifact = load_synthetic_episode(artifact_path)
        round_detail = round_detail_cache.get(resolved_round_id)
        if round_detail is None:
            round_detail = read_round_record(paths, resolved_round_id).round
            round_detail_cache[resolved_round_id] = round_detail
        evidence_bundle = build_round_evidence_from_observations(round_detail, artifact.observations)
        rows_by_round[resolved_round_id].append(
            _summary_vector_from_round_detail(
                round_detail,
                evidence_bundle,
                summary_variant=summary_variant,
            ),
        )
    first_nonempty = next((rows[0] for rows in rows_by_round.values() if rows), None)
    if first_nonempty is None:
        raise ValueError("summary-aware smh coeffbank synthetic dataset produced no summary rows")
    summary_dim = int(first_nonempty.shape[0])
    mean_rows: list[np.ndarray] = []
    scale_rows: list[np.ndarray] = []
    for round_id in round_ids:
        round_rows = rows_by_round[round_id]
        if not round_rows:
            mean_rows.append(np.zeros(summary_dim, dtype=np.float64))
            scale_rows.append(np.ones(summary_dim, dtype=np.float64))
            continue
        stacked = np.stack(round_rows, axis=0).astype(np.float64)
        mean_rows.append(np.mean(stacked, axis=0))
        scale_rows.append(np.clip(np.std(stacked, axis=0), 0.05, None))
    return np.stack(mean_rows, axis=0), np.stack(scale_rows, axis=0)


def _seed_target_tensor(learning_episode: RoundLearningEpisode, seed_index: int) -> np.ndarray:
    seed = learning_episode.per_seed[seed_index]
    if seed.ground_truth is not None:
        return np.asarray(seed.ground_truth, dtype=np.float64)
    if seed.replay_mean_terminal_probs is not None:
        return np.asarray(seed.replay_mean_terminal_probs, dtype=np.float64)
    raise ValueError(
        f"round {learning_episode.round_id} seed {seed_index} has no terminal target",
    )


class SemimechKnnPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    teacher_checkpoint_path: str
    summary_variant: SummaryVariant
    latent_kind: LatentKind
    k_neighbors: int = Field(ge=1)
    distance_power: float = Field(gt=0.0)
    terminal_blend_weight: float = Field(ge=0.0, le=1.0)
    prediction_floor: float = Field(default=0.01, ge=0.0, lt=1.0)
    sample_count: int = Field(ge=1)
    summary_dim: int = Field(ge=1)
    latent_dim: int = Field(ge=1)
    seed_count: int = Field(ge=1)


class SemimechCoefficientBankPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    checkpoint_npz_path: str
    round_ids: list[str]
    round_numbers: list[int]
    feature_names: list[str]
    candidate_count: int = Field(ge=1)
    coefficient_dim: int = Field(ge=1)
    class_weights: list[float]
    posterior_temperature: float = Field(gt=0.0)
    prediction_floor: float = Field(default=0.01, ge=0.0, lt=1.0)
    summary_variant: SummaryVariant | None = None
    summary_weight: float = Field(default=0.0, ge=0.0)
    summary_dim: int = Field(default=0, ge=0)


class SemimechKnnPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_knn_v1"
    dataset_name: str = "smh_synthetic_live_v1"
    summary_variant: SummaryVariant = "covsum"
    latent_kind: LatentKind = "regime"
    summary_center: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scale: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    summary_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    latent_vectors: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    terminal_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1, 1, 1, 6), dtype=np.float64))
    teacher_terminal_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1, 1, 1, 6), dtype=np.float64),
    )
    k_neighbors: int = Field(default=5, ge=1)
    distance_power: float = Field(default=1.0, gt=0.0)
    terminal_blend_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    prediction_floor: float = Field(default=0.01, ge=0.0, lt=1.0)
    teacher: HazardTeacher
    manifold_mean_vector: np.ndarray | None = None
    manifold_basis: np.ndarray | None = None

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        policy_name: str,
        samples_per_round: int,
        model_name: str,
        dataset_name: str,
        summary_variant: SummaryVariant,
        latent_kind: LatentKind,
        latent_rank: int | None = None,
        k_neighbors: int = 5,
        distance_power: float = 1.0,
        terminal_blend_weight: float = 0.0,
        prediction_floor: float = 0.01,
    ) -> SemimechKnnPredictor:
        selected_round_ids = round_ids or sorted(
            round_dir.name
            for round_dir in paths.raw_dir.joinpath("replays").glob("*")
            if round_dir.is_dir()
        )
        replay_episodes = [
            build_round_episode(paths, round_id)
            for round_id in selected_round_ids
        ]
        replay_episodes = [episode for episode in replay_episodes if episode.replay_run_count > 0]
        if not replay_episodes:
            raise ValueError("smh predictor requires replay-backed rounds")

        teacher = HazardTeacher(name=f"{model_name}__hazard_teacher").fit(replay_episodes)
        coefficient_rows = [
            fit_round_semimechanistic_coefficients(episode) for episode in replay_episodes
        ]
        if latent_kind == "regime":
            round_latents = {
                row.round_id: np.asarray(row.regime_vector, dtype=np.float64)
                for row in coefficient_rows
            }
            manifold_mean_vector = None
            manifold_basis = None
        elif latent_kind == "manifold":
            resolved_rank = 3 if latent_rank is None else latent_rank
            manifold = factorize_round_coefficients(
                coefficient_rows,
                max_rank=resolved_rank,
            )
            round_latents = {
                round_id: np.asarray(manifold.coordinates[index], dtype=np.float64)
                for index, round_id in enumerate(manifold.round_ids)
            }
            manifold_mean_vector = np.asarray(manifold.mean_vector, dtype=np.float64)
            manifold_basis = np.asarray(manifold.basis, dtype=np.float64)
        else:
            raise ValueError(f"unsupported latent kind: {latent_kind}")

        dataset = build_synthetic_live_dataset(
            paths,
            policy_name=policy_name,
            round_ids=[episode.metadata.round_id for episode in replay_episodes],
            samples_per_round=samples_per_round,
            dataset_name=dataset_name,
        )
        if dataset.index_path is None:
            raise ValueError("smh synthetic dataset requires an index path")

        learning_by_round: dict[str, RoundLearningEpisode] = {}
        round_detail_by_round: dict[str, RoundDetail] = {}
        round_context_by_round: dict[str, RoundContext] = {}
        summary_vectors: list[np.ndarray] = []
        latent_vectors: list[np.ndarray] = []
        terminal_rows: list[np.ndarray] = []
        teacher_terminal_rows: list[np.ndarray] = []

        index_table = pl.read_parquet(dataset.index_path)
        for path_value in index_table["episode_path"].to_list():
            artifact_path = resolve_synthetic_episode_path(dataset.index_path, Path(str(path_value)))
            artifact = load_synthetic_episode(artifact_path)
            round_id = artifact.round_id
            if round_id not in round_detail_by_round:
                round_detail_by_round[round_id] = read_round_record(paths, round_id).round
                round_context_by_round[round_id] = build_round_context_from_detail(round_detail_by_round[round_id])
            if round_id not in learning_by_round:
                learning_by_round[round_id] = load_round_learning_episode(paths, round_id)
            round_detail = round_detail_by_round[round_id]
            round_context = round_context_by_round[round_id]
            learning_episode = learning_by_round[round_id]
            evidence_bundle = build_round_evidence_from_observations(round_detail, artifact.observations)
            summary_vectors.append(
                _summary_vector_from_round_detail(
                    round_detail,
                    evidence_bundle,
                    summary_variant=summary_variant,
                ),
            )
            latent_vectors.append(round_latents[round_id])
            terminal_rows.append(
                np.stack(
                    [
                        _seed_target_tensor(learning_episode, seed_index)
                        for seed_index in range(round_detail.seeds_count)
                    ],
                    axis=0,
                ),
            )
            if latent_kind == "regime":
                teacher_terminal_rows.append(
                    np.stack(
                        [
                            teacher.terminal_tensor(round_context.seeds[seed_index], round_latents[round_id])
                            for seed_index in range(round_detail.seeds_count)
                        ],
                        axis=0,
                    ),
                )
            else:
                coefficient_vector = np.asarray(
                    manifold_mean_vector + round_latents[round_id] @ manifold_basis,
                    dtype=np.float64,
                )
                teacher_terminal_rows.append(
                    np.stack(
                        [
                            teacher.terminal_tensor_from_coefficients(
                                round_context.seeds[seed_index],
                                coefficient_vector,
                            )
                            for seed_index in range(round_detail.seeds_count)
                        ],
                        axis=0,
                    ),
                )

        if not summary_vectors:
            raise ValueError("smh synthetic dataset produced no summary vectors")

        summary_matrix = np.stack(summary_vectors, axis=0).astype(np.float64)
        summary_center = np.mean(summary_matrix, axis=0)
        summary_scale = np.std(summary_matrix, axis=0)
        summary_scale = np.where(summary_scale > 1e-6, summary_scale, 1.0)
        normalized_summary_matrix = (summary_matrix - summary_center[None, :]) / summary_scale[None, :]

        return cls(
            name=model_name,
            dataset_name=dataset_name,
            summary_variant=summary_variant,
            latent_kind=latent_kind,
            summary_center=summary_center,
            summary_scale=summary_scale,
            summary_vectors=normalized_summary_matrix,
            latent_vectors=np.stack(latent_vectors, axis=0).astype(np.float64),
            terminal_bank=np.stack(terminal_rows, axis=0).astype(np.float64),
            teacher_terminal_bank=np.stack(teacher_terminal_rows, axis=0).astype(np.float64),
            k_neighbors=k_neighbors,
            distance_power=distance_power,
            terminal_blend_weight=terminal_blend_weight,
            prediction_floor=prediction_floor,
            teacher=teacher,
            manifold_mean_vector=manifold_mean_vector,
            manifold_basis=manifold_basis,
        )

    def checkpoint(
        self,
        checkpoint_npz_path: Path,
        teacher_checkpoint_path: Path,
    ) -> SemimechKnnPredictorCheckpoint:
        return SemimechKnnPredictorCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            teacher_checkpoint_path=str(teacher_checkpoint_path),
            summary_variant=self.summary_variant,
            latent_kind=self.latent_kind,
            k_neighbors=self.k_neighbors,
            distance_power=self.distance_power,
            terminal_blend_weight=self.terminal_blend_weight,
            prediction_floor=self.prediction_floor,
            sample_count=int(self.summary_vectors.shape[0]),
            summary_dim=int(self.summary_vectors.shape[1]),
            latent_dim=int(self.latent_vectors.shape[1]),
            seed_count=int(self.terminal_bank.shape[1]),
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        teacher_path = self.teacher.save_checkpoint(checkpoint_dir / "hazard_teacher.json")
        npz_path = checkpoint_dir / "smh_knn_predictor.npz"
        json_path = checkpoint_dir / "smh_knn_predictor.json"
        np.savez_compressed(
            npz_path,
            summary_center=self.summary_center,
            summary_scale=self.summary_scale,
            summary_vectors=self.summary_vectors,
            latent_vectors=self.latent_vectors,
            terminal_bank=self.terminal_bank,
            teacher_terminal_bank=self.teacher_terminal_bank,
            manifold_mean_vector=(
                np.zeros((0,), dtype=np.float64)
                if self.manifold_mean_vector is None
                else self.manifold_mean_vector
            ),
            manifold_basis=(
                np.zeros((0, 0), dtype=np.float64)
                if self.manifold_basis is None
                else self.manifold_basis
            ),
        )
        json_path.write_text(
            json.dumps(
                to_jsonable(self.checkpoint(npz_path, teacher_path)),
                indent=2,
            ),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SemimechKnnPredictor:
        payload = json.loads(path.read_text(encoding="utf-8"))
        checkpoint = SemimechKnnPredictorCheckpoint.model_validate(payload)
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        manifold_mean_vector = np.asarray(arrays["manifold_mean_vector"], dtype=np.float64)
        manifold_basis = np.asarray(arrays["manifold_basis"], dtype=np.float64)
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            summary_variant=checkpoint.summary_variant,
            latent_kind=checkpoint.latent_kind,
            summary_center=np.asarray(arrays["summary_center"], dtype=np.float64),
            summary_scale=np.asarray(arrays["summary_scale"], dtype=np.float64),
            summary_vectors=np.asarray(arrays["summary_vectors"], dtype=np.float64),
            latent_vectors=np.asarray(arrays["latent_vectors"], dtype=np.float64),
            terminal_bank=np.asarray(arrays["terminal_bank"], dtype=np.float64),
            teacher_terminal_bank=np.asarray(arrays["teacher_terminal_bank"], dtype=np.float64),
            k_neighbors=checkpoint.k_neighbors,
            distance_power=checkpoint.distance_power,
            terminal_blend_weight=checkpoint.terminal_blend_weight,
            prediction_floor=checkpoint.prediction_floor,
            teacher=HazardTeacher.load_checkpoint(Path(checkpoint.teacher_checkpoint_path)),
            manifold_mean_vector=(
                None if manifold_mean_vector.size == 0 else manifold_mean_vector
            ),
            manifold_basis=None if manifold_basis.size == 0 else manifold_basis,
        )

    def _normalized_summary_vector(
        self,
        round_context: RoundContext,
        evidence_bundle: RoundEvidenceBundle,
    ) -> np.ndarray:
        round_detail = round_context.to_round_detail()
        summary_vector = _summary_vector_from_round_detail(
            round_detail,
            evidence_bundle,
            summary_variant=self.summary_variant,
        )
        return (summary_vector - self.summary_center) / self.summary_scale

    def _neighbor_weights(
        self,
        normalized_summary_vector: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        distances = np.linalg.norm(self.summary_vectors - normalized_summary_vector[None, :], axis=1)
        neighbor_count = min(self.k_neighbors, len(distances))
        order = np.argsort(distances)[:neighbor_count]
        selected_distances = np.clip(distances[order], 1e-6, None)
        raw_weights = 1.0 / np.power(selected_distances, self.distance_power)
        weight_sum = float(np.sum(raw_weights))
        if weight_sum <= 0.0:
            weights = np.full(order.shape, 1.0 / float(len(order)), dtype=np.float64)
        else:
            weights = raw_weights / weight_sum
        return order.astype(np.int64), np.asarray(weights, dtype=np.float64)

    def _teacher_prediction(
        self,
        seed_index: int,
        neighbor_indexes: np.ndarray,
        weights: np.ndarray,
    ) -> np.ndarray:
        return np.tensordot(
            weights,
            self.teacher_terminal_bank[neighbor_indexes, seed_index],
            axes=(0, 0),
        )

    def _neighbor_terminal_prediction(
        self,
        seed_index: int,
        neighbor_indexes: np.ndarray,
        weights: np.ndarray,
    ) -> np.ndarray:
        return np.tensordot(
            weights,
            self.terminal_bank[neighbor_indexes, seed_index],
            axes=(0, 0),
        )

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        normalized_summary_vector = self._normalized_summary_vector(
            context.round_context,
            context.evidence_bundle,
        )
        neighbor_indexes, weights = self._neighbor_weights(normalized_summary_vector)
        teacher_prediction = self._teacher_prediction(seed_index, neighbor_indexes, weights)
        if self.terminal_blend_weight <= 0.0:
            prediction = teacher_prediction
        else:
            replay_prediction = self._neighbor_terminal_prediction(seed_index, neighbor_indexes, weights)
            prediction = (
            (1.0 - self.terminal_blend_weight) * teacher_prediction
            + self.terminal_blend_weight * replay_prediction
            )
        if self.prediction_floor <= 0.0:
            return prediction
        floored = np.maximum(prediction, self.prediction_floor)
        return floored / np.sum(floored, axis=-1, keepdims=True)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        predictions_by_seed = {
            seed_index: self.predict_seed(context, seed_index)
            for seed_index in range(len(context.round_context.seeds))
        }
        return PredictionBundle(
            round_id=context.round_context.round_id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        round_context = build_round_context_from_detail(round_detail)
        resolved_evidence = (
            evidence
            if evidence is not None
            else build_round_evidence_from_observations(round_detail, ())
        )
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context, ()),
            geometry_bundle=features,
            evidence_bundle=resolved_evidence,
        )
        return self.build_prediction_bundle_from_context(context)


class SemimechCoefficientBankPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_coeffbank_v1"
    round_ids: tuple[str, ...] = ()
    round_numbers: tuple[int, ...] = ()
    feature_names: list[str] = Field(default_factory=list)
    coefficient_bank: np.ndarray = Field(default_factory=lambda: np.zeros((0, 1), dtype=np.float64))
    class_weights: np.ndarray = Field(default_factory=lambda: np.ones(CLASS_COUNT, dtype=np.float64))
    posterior_temperature: float = Field(default=1.0, gt=0.0)
    prediction_floor: float = Field(default=0.01, ge=0.0, lt=1.0)
    summary_variant: SummaryVariant | None = None
    summary_weight: float = Field(default=0.0, ge=0.0)
    summary_mean_matrix: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    summary_scale_matrix: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    candidate_tensor_cache: dict[str, np.ndarray] = Field(default_factory=dict, exclude=True)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str,
        class_weights: list[float] | np.ndarray | None = None,
        posterior_temperature: float = 1.0,
        prediction_floor: float = 0.01,
        summary_variant: SummaryVariant | None = None,
        summary_weight: float = 0.0,
        policy_name: str = "coverage",
        samples_per_round: int = 1,
        dataset_name: str | None = None,
    ) -> SemimechCoefficientBankPredictor:
        selected_round_ids = round_ids or sorted(
            round_dir.name
            for round_dir in paths.raw_dir.joinpath("replays").glob("*")
            if round_dir.is_dir()
        )
        coefficient_rows: list[RoundSemimechanisticCoefficients] = []
        for round_id in selected_round_ids:
            episode = build_round_episode(paths, round_id)
            if episode.replay_run_count == 0:
                continue
            coefficient_rows.append(fit_round_semimechanistic_coefficients(episode))
        if not coefficient_rows:
            raise ValueError("smh coefficient bank requires replay-backed rounds")
        resolved_class_weights = (
            np.ones(CLASS_COUNT, dtype=np.float64)
            if class_weights is None
            else np.asarray(class_weights, dtype=np.float64)
        )
        if resolved_class_weights.shape != (CLASS_COUNT,):
            raise ValueError(
                f"expected class weights shape {(CLASS_COUNT,)}, got {resolved_class_weights.shape!r}",
            )
        summary_mean_matrix = np.zeros((0, 0), dtype=np.float64)
        summary_scale_matrix = np.zeros((0, 0), dtype=np.float64)
        if summary_variant is not None and summary_weight > 0.0:
            resolved_dataset_name = dataset_name or (
                f"{model_name}__synthetic_live__policy={policy_name}__samples={samples_per_round}"
            )
            dataset = build_synthetic_live_dataset(
                paths,
                policy_name=policy_name,
                round_ids=[row.round_id for row in coefficient_rows],
                samples_per_round=samples_per_round,
                dataset_name=resolved_dataset_name,
            )
            if dataset.index_path is None:
                raise ValueError("summary-aware smh coeffbank requires a synthetic-live dataset index")
            summary_mean_matrix, summary_scale_matrix = _fit_round_summary_statistics(
                paths,
                index_path=dataset.index_path,
                round_ids=[row.round_id for row in coefficient_rows],
                summary_variant=summary_variant,
            )
        return cls(
            name=model_name,
            round_ids=tuple(row.round_id for row in coefficient_rows),
            round_numbers=tuple(row.round_number for row in coefficient_rows),
            feature_names=list(coefficient_rows[0].feature_names),
            coefficient_bank=np.stack(
                [row.combined_vector() for row in coefficient_rows],
                axis=0,
            ).astype(np.float64),
            class_weights=resolved_class_weights,
            posterior_temperature=posterior_temperature,
            prediction_floor=prediction_floor,
            summary_variant=summary_variant,
            summary_weight=summary_weight,
            summary_mean_matrix=summary_mean_matrix,
            summary_scale_matrix=summary_scale_matrix,
        )

    def checkpoint(self, checkpoint_npz_path: Path) -> SemimechCoefficientBankPredictorCheckpoint:
        return SemimechCoefficientBankPredictorCheckpoint(
            name=self.name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            round_ids=list(self.round_ids),
            round_numbers=list(self.round_numbers),
            feature_names=list(self.feature_names),
            candidate_count=int(self.coefficient_bank.shape[0]),
            coefficient_dim=int(self.coefficient_bank.shape[1]),
            class_weights=self.class_weights.astype(np.float64).tolist(),
            posterior_temperature=self.posterior_temperature,
            prediction_floor=self.prediction_floor,
            summary_variant=self.summary_variant,
            summary_weight=self.summary_weight,
            summary_dim=int(self.summary_mean_matrix.shape[1]) if self.summary_mean_matrix.ndim == 2 else 0,
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "smh_coeffbank_predictor.npz"
        json_path = checkpoint_dir / "smh_coeffbank_predictor.json"
        np.savez_compressed(
            npz_path,
            coefficient_bank=self.coefficient_bank,
            summary_mean_matrix=self.summary_mean_matrix,
            summary_scale_matrix=self.summary_scale_matrix,
        )
        json_path.write_text(
            json.dumps(to_jsonable(self.checkpoint(npz_path)), indent=2),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SemimechCoefficientBankPredictor:
        payload = json.loads(path.read_text(encoding="utf-8"))
        checkpoint = SemimechCoefficientBankPredictorCheckpoint.model_validate(payload)
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        summary_mean_matrix = (
            np.asarray(arrays["summary_mean_matrix"], dtype=np.float64)
            if "summary_mean_matrix" in arrays.files
            else np.zeros((0, 0), dtype=np.float64)
        )
        summary_scale_matrix = (
            np.asarray(arrays["summary_scale_matrix"], dtype=np.float64)
            if "summary_scale_matrix" in arrays.files
            else np.zeros((0, 0), dtype=np.float64)
        )
        return cls(
            name=checkpoint.name,
            round_ids=tuple(checkpoint.round_ids),
            round_numbers=tuple(checkpoint.round_numbers),
            feature_names=list(checkpoint.feature_names),
            coefficient_bank=np.asarray(arrays["coefficient_bank"], dtype=np.float64),
            class_weights=np.asarray(checkpoint.class_weights, dtype=np.float64),
            posterior_temperature=checkpoint.posterior_temperature,
            prediction_floor=checkpoint.prediction_floor,
            summary_variant=checkpoint.summary_variant,
            summary_weight=checkpoint.summary_weight,
            summary_mean_matrix=summary_mean_matrix,
            summary_scale_matrix=summary_scale_matrix,
        )

    def _decoder(self) -> HazardTeacher:
        return HazardTeacher(name=f"{self.name}__decoder", feature_names=list(self.feature_names))

    def _candidate_seed_tensors(
        self,
        round_context: RoundContext,
    ) -> np.ndarray:
        cached = self.candidate_tensor_cache.get(round_context.round_id)
        if cached is not None:
            return cached
        decoder = self._decoder()
        seed_count = len(round_context.seeds)
        candidate_seed_tensors = np.stack(
            [
                np.stack(
                    [
                        decoder.terminal_tensor_from_coefficients(seed, coefficient_vector)
                        for seed in round_context.seeds
                    ],
                    axis=0,
                )
                for coefficient_vector in self.coefficient_bank
            ],
            axis=0,
        ).reshape(len(self.coefficient_bank), seed_count, round_context.map_height, round_context.map_width, CLASS_COUNT)
        self.candidate_tensor_cache[round_context.round_id] = candidate_seed_tensors
        return candidate_seed_tensors

    def _observation_log_likelihood(
        self,
        candidate_seed_tensors: np.ndarray,
        observation: LiveQueryObs,
    ) -> np.ndarray:
        collapsed = collapse_internal_grid(np.asarray(observation.grid, dtype=np.int64))
        viewport = observation.viewport
        patch_predictions = candidate_seed_tensors[
            :,
            observation.seed_index,
            viewport.y : viewport.y + viewport.h,
            viewport.x : viewport.x + viewport.w,
            :,
        ]
        flat_patch = patch_predictions.reshape(patch_predictions.shape[0], -1, CLASS_COUNT)
        flat_classes = collapsed.reshape(-1)
        chosen = np.take_along_axis(
            flat_patch,
            flat_classes[None, :, None],
            axis=-1,
        )[:, :, 0]
        class_weights = self.class_weights[flat_classes][None, :]
        return np.sum(class_weights * np.log(np.clip(chosen, self.prediction_floor, 1.0)), axis=1)

    def _summary_log_likelihood(
        self,
        context: LiveInferenceContext,
    ) -> np.ndarray:
        if (
            self.summary_variant is None
            or self.summary_weight <= 0.0
            or self.summary_mean_matrix.size == 0
            or self.summary_scale_matrix.size == 0
        ):
            return np.zeros(self.coefficient_bank.shape[0], dtype=np.float64)
        round_detail = context.round_context.to_round_detail()
        summary_vector = _summary_vector_from_round_detail(
            round_detail,
            context.evidence_bundle,
            summary_variant=self.summary_variant,
        )
        if summary_vector.shape[0] != self.summary_mean_matrix.shape[1]:
            raise ValueError(
                "summary-aware smh coeffbank dimension mismatch: "
                f"expected {self.summary_mean_matrix.shape[1]}, got {summary_vector.shape[0]}",
            )
        scaled_delta = (summary_vector[None, :] - self.summary_mean_matrix) / np.clip(
            self.summary_scale_matrix,
            0.05,
            None,
        )
        scaled_delta = np.clip(scaled_delta, -6.0, 6.0)
        query_fraction = min(max(context.evidence_bundle.total_queries, 0) / 50.0, 1.0)
        if query_fraction <= 0.0:
            return np.zeros(self.coefficient_bank.shape[0], dtype=np.float64)
        return (
            self.summary_weight
            * query_fraction
            * (-0.5 * np.mean(np.square(scaled_delta), axis=1))
        )

    def _posterior_weights(
        self,
        candidate_seed_tensors: np.ndarray,
        observations: tuple[LiveQueryObs, ...],
        summary_log_likelihood: np.ndarray | None = None,
    ) -> np.ndarray:
        log_weights = np.zeros(candidate_seed_tensors.shape[0], dtype=np.float64)
        if summary_log_likelihood is not None:
            log_weights += np.asarray(summary_log_likelihood, dtype=np.float64)
        for observation in observations:
            log_weights += self._observation_log_likelihood(candidate_seed_tensors, observation)
        if self.posterior_temperature != 1.0:
            log_weights = log_weights / self.posterior_temperature
        max_log_weight = float(np.max(log_weights))
        weights = np.exp(log_weights - max_log_weight)
        return weights / np.sum(weights)

    def _mix_predictions(
        self,
        candidate_seed_tensors: np.ndarray,
        posterior_weights: np.ndarray,
    ) -> PredictionBundle:
        mixed = np.tensordot(posterior_weights, candidate_seed_tensors, axes=(0, 0))
        floored = np.maximum(mixed, self.prediction_floor)
        normalized = floored / np.sum(floored, axis=-1, keepdims=True)
        return PredictionBundle(
            round_id="",
            model_name=self.name,
            predictions_by_seed={
                seed_index: normalized[seed_index]
                for seed_index in range(normalized.shape[0])
            },
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        candidate_seed_tensors = self._candidate_seed_tensors(context.round_context)
        summary_log_likelihood = self._summary_log_likelihood(context)
        posterior_weights = self._posterior_weights(
            candidate_seed_tensors,
            context.observations,
            summary_log_likelihood=summary_log_likelihood,
        )
        bundle = self._mix_predictions(candidate_seed_tensors, posterior_weights)
        return bundle.model_copy(update={"round_id": context.round_context.round_id})

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del evidence
        round_context = build_round_context_from_detail(round_detail)
        context = LiveInferenceContext(
            online_episode=round_context_to_online_episode(round_context, ()),
            geometry_bundle=features,
            evidence_bundle=build_round_evidence_from_observations(round_detail, ()),
        )
        return self.build_prediction_bundle_from_context(context)


__all__ = [
    "SemimechCoefficientBankPredictor",
    "SemimechCoefficientBankPredictorCheckpoint",
    "SemimechKnnPredictor",
    "SemimechKnnPredictorCheckpoint",
]
