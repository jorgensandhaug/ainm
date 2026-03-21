from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.history.datasets.cell_transition import build_cell_transition_dataset
from astar.history.summaries.round_coefficients import seed_feature_dict, seed_feature_names
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.round import BaseRoundPredictor

_TIME_FEATURE_NAMES = ("time_frac", "time_frac_sq", "time_remaining")
_MEMORY_FEATURE_NAMES = ("occupied_recent", "ruin_recent", "port_recent")
_NBR_FEATURE_NAMES = (
    "nbr_empty_frac",
    "nbr_settlement_frac",
    "nbr_port_frac",
    "nbr_ruin_frac",
    "nbr_occupied_frac",
    "nbr_forest_frac",
)
_EMPTY_VECTOR = np.asarray([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
_MOUNTAIN_VECTOR = np.asarray([0.0, 0.0, 0.0, 0.0, 0.0, 1.0], dtype=np.float64)


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp_logits = np.exp(np.clip(shifted, -50.0, 50.0))
    return exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)


def _time_features(step: int | np.ndarray, max_steps: int) -> np.ndarray:
    denominator = float(max(max_steps - 1, 1))
    frac = np.asarray(step, dtype=np.float64) / denominator
    return np.stack(
        [
            frac,
            np.square(frac),
            1.0 - frac,
        ],
        axis=-1,
    ).astype(np.float64)


def _apply_probability_floor(prediction: np.ndarray, probability_floor: float) -> np.ndarray:
    if probability_floor <= 0.0:
        return prediction
    floored = np.maximum(prediction, probability_floor)
    return floored / np.sum(floored, axis=-1, keepdims=True)


def _default_theta(current_class: int, feature_dim: int) -> np.ndarray:
    theta = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)
    theta[0, :] = -6.0
    theta[0, current_class] = 6.0
    return theta


def _nbr_feature_stack_from_probs(
    probs: np.ndarray,
    nbr_feature_names: tuple[str, ...],
) -> np.ndarray | None:
    """Compute neighborhood features from probability tensor during rollout.

    probs: shape (height, width, CLASS_COUNT) - probability of each class at each cell
    Returns: shape (height, width, len(nbr_feature_names)) or None
    """
    if not nbr_feature_names:
        return None
    height, width = probs.shape[:2]
    padded = np.pad(probs, ((1, 1), (1, 1), (0, 0)), mode="constant")
    pad_ones = np.pad(
        np.ones((height, width), dtype=np.float64), ((1, 1), (1, 1)), mode="constant"
    )
    nbr_probs = np.zeros((height, width, CLASS_COUNT), dtype=np.float64)
    nbr_count = np.zeros((height, width), dtype=np.float64)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if dy == 0 and dx == 0:
                continue
            nbr_probs += padded[1 + dy : height + 1 + dy, 1 + dx : width + 1 + dx]
            nbr_count += pad_ones[1 + dy : height + 1 + dy, 1 + dx : width + 1 + dx]
    nbr_probs /= np.maximum(nbr_count[..., None], 1.0)
    feature_arrays: list[np.ndarray] = []
    for name in nbr_feature_names:
        if name == "nbr_empty_frac":
            feature_arrays.append(nbr_probs[..., 0])
        elif name == "nbr_settlement_frac":
            feature_arrays.append(nbr_probs[..., 1])
        elif name == "nbr_port_frac":
            feature_arrays.append(nbr_probs[..., 2])
        elif name == "nbr_ruin_frac":
            feature_arrays.append(nbr_probs[..., 3])
        elif name == "nbr_occupied_frac":
            feature_arrays.append(nbr_probs[..., 1] + nbr_probs[..., 2])
        elif name == "nbr_forest_frac":
            feature_arrays.append(nbr_probs[..., 4])
        else:
            raise ValueError(f"unsupported neighborhood feature name: {name}")
    return np.stack(feature_arrays, axis=-1).astype(np.float64, copy=False)


def _memory_feature_stack_from_probs(
    probs: np.ndarray,
    memory_feature_names: tuple[str, ...],
) -> np.ndarray | None:
    if not memory_feature_names:
        return None
    feature_arrays: list[np.ndarray] = []
    for feature_name in memory_feature_names:
        if feature_name == "occupied_recent":
            feature_arrays.append(probs[..., 1] + probs[..., 2])
        elif feature_name == "ruin_recent":
            feature_arrays.append(probs[..., 3])
        elif feature_name == "port_recent":
            feature_arrays.append(probs[..., 2])
        else:
            raise ValueError(f"unsupported memory feature name: {feature_name}")
    return np.stack(feature_arrays, axis=-1).astype(np.float64, copy=False)


def _load_part_rows(
    part_path: Path,
    *,
    current_class: int,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    max_steps: int,
) -> tuple[np.ndarray, np.ndarray] | None:
    columns = [
        "step",
        "current_class",
        *[f"next_count_{class_index}" for class_index in range(CLASS_COUNT)],
        *static_feature_names,
        *memory_feature_names,
        *nbr_feature_names,
    ]
    frame = (
        pl.scan_parquet(part_path)
        .filter(pl.col("current_class") == current_class)
        .select(columns)
        .collect()
    )
    if frame.height == 0:
        return None
    static_matrix = frame.select(list(static_feature_names)).to_numpy().astype(np.float64, copy=False)
    memory_matrix = (
        frame.select(list(memory_feature_names)).to_numpy().astype(np.float64, copy=False)
        if memory_feature_names
        else np.zeros((frame.height, 0), dtype=np.float64)
    )
    nbr_matrix = (
        frame.select(list(nbr_feature_names)).to_numpy().astype(np.float64, copy=False)
        if nbr_feature_names
        else np.zeros((frame.height, 0), dtype=np.float64)
    )
    time_matrix = _time_features(frame["step"].to_numpy(), max_steps)
    design = np.concatenate([static_matrix, memory_matrix, nbr_matrix, time_matrix], axis=1)
    counts = frame.select(
        [f"next_count_{class_index}" for class_index in range(CLASS_COUNT)],
    ).to_numpy().astype(np.float64, copy=False)
    return design, counts


def _class_marginal_counts(
    part_records: list[tuple[Path, int]],
    *,
    current_class: int,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
) -> np.ndarray:
    counts = np.zeros(CLASS_COUNT, dtype=np.float64)
    for part_path, max_steps in part_records:
        matrices = _load_part_rows(
            part_path,
            current_class=current_class,
            static_feature_names=static_feature_names,
            memory_feature_names=memory_feature_names,
            nbr_feature_names=nbr_feature_names,
            max_steps=max_steps,
        )
        if matrices is None:
            continue
        _, part_counts = matrices
        counts += np.sum(part_counts, axis=0)
    return counts


def _loss_and_grad(
    theta: np.ndarray,
    design: np.ndarray,
    counts: np.ndarray,
) -> tuple[np.ndarray, float, float]:
    design_aug = np.concatenate(
        [np.ones((design.shape[0], 1), dtype=np.float64), design],
        axis=1,
    )
    logits = design_aug @ theta
    max_logits = np.max(logits, axis=1, keepdims=True)
    shifted = logits - max_logits
    exp_logits = np.exp(np.clip(shifted, -50.0, 50.0))
    probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    weight = np.sum(counts, axis=1, keepdims=True)
    error = (weight * probs) - counts
    grad = design_aug.T @ error
    log_norm = max_logits + np.log(np.sum(exp_logits, axis=1, keepdims=True))
    loss = float(np.sum(weight * log_norm - np.sum(counts * logits, axis=1, keepdims=True)))
    return grad, loss, float(np.sum(weight))


def _fit_softmax_branch(
    part_records: list[tuple[Path, int]],
    *,
    current_class: int,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    ridge_lambda: float,
    learning_rate: float,
    max_epochs: int,
) -> np.ndarray:
    feature_dim = len(static_feature_names) + len(memory_feature_names) + len(nbr_feature_names) + len(_TIME_FEATURE_NAMES)
    if current_class == 5:
        return _default_theta(current_class, feature_dim)
    marginal_counts = _class_marginal_counts(
        part_records,
        current_class=current_class,
        static_feature_names=static_feature_names,
        memory_feature_names=memory_feature_names,
        nbr_feature_names=nbr_feature_names,
    )
    if float(np.sum(marginal_counts)) <= 0.0:
        return _default_theta(current_class, feature_dim)

    theta = np.zeros((feature_dim + 1, CLASS_COUNT), dtype=np.float64)
    theta[0] = np.log(np.clip(marginal_counts, 1e-6, None) / np.sum(marginal_counts))
    first_moment = np.zeros_like(theta)
    second_moment = np.zeros_like(theta)
    best_loss = float("inf")
    stall_count = 0
    for epoch in range(max_epochs):
        total_grad = np.zeros_like(theta)
        total_loss = 0.0
        total_weight = 0.0
        for part_path, max_steps in part_records:
            matrices = _load_part_rows(
                part_path,
                current_class=current_class,
                static_feature_names=static_feature_names,
                memory_feature_names=memory_feature_names,
                nbr_feature_names=nbr_feature_names,
                max_steps=max_steps,
            )
            if matrices is None:
                continue
            design, counts = matrices
            grad, loss, weight = _loss_and_grad(theta, design, counts)
            total_grad += grad
            total_loss += loss
            total_weight += weight
        if total_weight <= 0.0:
            return _default_theta(current_class, feature_dim)

        total_grad /= total_weight
        total_loss /= total_weight
        total_grad[1:] += ridge_lambda * theta[1:]
        total_loss += 0.5 * ridge_lambda * float(np.sum(np.square(theta[1:])))

        first_moment = 0.9 * first_moment + 0.1 * total_grad
        second_moment = 0.999 * second_moment + 0.001 * np.square(total_grad)
        first_hat = first_moment / (1.0 - (0.9 ** (epoch + 1)))
        second_hat = second_moment / (1.0 - (0.999 ** (epoch + 1)))
        theta -= learning_rate * first_hat / (np.sqrt(second_hat) + 1e-8)

        if total_loss + 1e-6 < best_loss:
            best_loss = total_loss
            stall_count = 0
        else:
            stall_count += 1
        if epoch >= 5 and stall_count >= 4:
            break
    return theta


def _static_feature_stack(initial_state, static_feature_names: tuple[str, ...]) -> np.ndarray:
    feature_dict = seed_feature_dict(initial_state)
    return np.stack(
        [np.asarray(feature_dict[name], dtype=np.float64) for name in static_feature_names],
        axis=-1,
    )


def _apply_hard_constraints(probs: np.ndarray, initial_grid: np.ndarray) -> np.ndarray:
    ocean_mask = initial_grid == 10
    mountain_mask = initial_grid == 5
    if np.any(ocean_mask):
        probs[ocean_mask] = _EMPTY_VECTOR
    if np.any(mountain_mask):
        probs[mountain_mask] = _MOUNTAIN_VECTOR
    return probs


def _transition_probs_for_class(
    static_feature_stack: np.ndarray,
    memory_feature_stack: np.ndarray | None,
    weight_bank: np.ndarray,
    *,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    nbr_feature_stack: np.ndarray | None = None,
    current_class: int,
    step: int,
    rollout_steps: int,
) -> np.ndarray:
    theta = np.asarray(weight_bank[current_class], dtype=np.float64)
    spatial_shape = static_feature_stack.shape[:2]
    logits = np.broadcast_to(
        theta[0],
        spatial_shape + (CLASS_COUNT,),
    ).astype(np.float64, copy=True)
    offset = 1
    static_dim = len(static_feature_names)
    if static_dim > 0:
        logits += np.tensordot(
            static_feature_stack,
            theta[offset : offset + static_dim],
            axes=(2, 0),
        )
        offset += static_dim
    memory_dim = len(memory_feature_names)
    if memory_dim > 0:
        if memory_feature_stack is None:
            raise ValueError("memory feature stack is required when memory features are configured")
        logits += np.tensordot(
            memory_feature_stack,
            theta[offset : offset + memory_dim],
            axes=(2, 0),
        )
        offset += memory_dim
    nbr_dim = len(nbr_feature_names)
    if nbr_dim > 0:
        if nbr_feature_stack is None:
            raise ValueError("neighborhood feature stack is required when neighborhood features are configured")
        logits += np.tensordot(
            nbr_feature_stack,
            theta[offset : offset + nbr_dim],
            axes=(2, 0),
        )
        offset += nbr_dim
    time_values = _time_features(step, rollout_steps)
    for time_index, value in enumerate(np.asarray(time_values, dtype=np.float64)):
        logits += value * theta[offset + time_index][None, None, :]
    return _softmax(logits)


def _rollout_seed_prediction(
    initial_state,
    *,
    weight_bank: np.ndarray,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    memory_decay: float,
    rollout_steps: int,
    prediction_floor: float,
) -> np.ndarray:
    initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
    collapsed = collapse_internal_grid(initial_grid)
    current_probs = np.eye(CLASS_COUNT, dtype=np.float64)[collapsed]
    current_probs = _apply_hard_constraints(current_probs, initial_grid)
    static_stack = _static_feature_stack(initial_state, static_feature_names)
    memory_stack = _memory_feature_stack_from_probs(current_probs, memory_feature_names)
    nbr_stack = _nbr_feature_stack_from_probs(current_probs, nbr_feature_names)
    for step in range(rollout_steps):
        next_probs = np.zeros_like(current_probs)
        for current_class in range(CLASS_COUNT):
            transition_probs = _transition_probs_for_class(
                static_stack,
                memory_stack,
                weight_bank,
                static_feature_names=static_feature_names,
                memory_feature_names=memory_feature_names,
                nbr_feature_names=nbr_feature_names,
                nbr_feature_stack=nbr_stack,
                current_class=current_class,
                step=step,
                rollout_steps=rollout_steps,
            )
            next_probs += current_probs[..., current_class : current_class + 1] * transition_probs
        current_probs = _apply_hard_constraints(next_probs, initial_grid)
        if memory_stack is not None:
            current_memory = _memory_feature_stack_from_probs(current_probs, memory_feature_names)
            assert current_memory is not None
            memory_stack = (memory_decay * memory_stack) + ((1.0 - memory_decay) * current_memory)
        if nbr_stack is not None:
            nbr_stack = _nbr_feature_stack_from_probs(current_probs, nbr_feature_names)
    return _apply_probability_floor(current_probs, prediction_floor)


class SemhGlmmPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    round_ids: list[str]
    static_feature_names: list[str]
    memory_feature_names: list[str] = Field(default_factory=list)
    nbr_feature_names: list[str] = Field(default_factory=list)
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(ge=1)
    ridge_lambda: float = Field(ge=0.0)
    learning_rate: float = Field(gt=0.0)
    max_epochs: int = Field(ge=1)
    prediction_floor: float = Field(ge=0.0, lt=1.0)


class SemhGlmmBankPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    round_ids: list[str]
    static_feature_names: list[str]
    memory_feature_names: list[str] = Field(default_factory=list)
    nbr_feature_names: list[str] = Field(default_factory=list)
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(ge=1)
    ridge_lambda: float = Field(ge=0.0)
    learning_rate: float = Field(gt=0.0)
    max_epochs: int = Field(ge=1)
    prediction_floor: float = Field(ge=0.0, lt=1.0)


class SemhGlmmLatentPredictorCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    dataset_name: str
    checkpoint_npz_path: str
    round_ids: list[str]
    static_feature_names: list[str]
    memory_feature_names: list[str] = Field(default_factory=list)
    nbr_feature_names: list[str] = Field(default_factory=list)
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(ge=1)
    ridge_lambda: float = Field(ge=0.0)
    learning_rate: float = Field(gt=0.0)
    max_epochs: int = Field(ge=1)
    prediction_floor: float = Field(ge=0.0, lt=1.0)
    latent_dim_requested: int = Field(ge=0)
    latent_dim_used: int = Field(ge=0)
    feature_prior_enabled: bool = False
    feature_prior_ridge_lambda: float = Field(default=0.0, ge=0.0)


def _fit_round_weight_bank(
    part_records: list[tuple[Path, int]],
    *,
    static_feature_names: tuple[str, ...],
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    ridge_lambda: float,
    learning_rate: float,
    max_epochs: int,
) -> np.ndarray:
    return np.stack(
        [
            _fit_softmax_branch(
                part_records,
                current_class=current_class,
                static_feature_names=static_feature_names,
                memory_feature_names=memory_feature_names,
                nbr_feature_names=nbr_feature_names,
                ridge_lambda=ridge_lambda,
                learning_rate=learning_rate,
                max_epochs=max_epochs,
            )
            for current_class in range(CLASS_COUNT)
        ],
        axis=0,
    ).astype(np.float64)


def _fit_candidate_weight_banks(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None,
    dataset_name: str,
    memory_feature_names: tuple[str, ...],
    nbr_feature_names: tuple[str, ...] = (),
    memory_decay: float,
    ridge_lambda: float,
    learning_rate: float,
    max_epochs: int,
) -> tuple[tuple[str, ...], tuple[str, ...], int, np.ndarray]:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    dataset = build_cell_transition_dataset(
        paths,
        round_ids=selected_round_ids,
        dataset_name=dataset_name,
        include_memory_features=bool(memory_feature_names),
        memory_decay=memory_decay,
        include_neighborhood_features=bool(nbr_feature_names),
    )
    if dataset.index_path is None:
        raise ValueError("smh glmm predictors require a transition dataset index")
    index_table = pl.read_parquet(dataset.index_path)
    static_feature_names = tuple(seed_feature_names())
    rollout_steps = int(index_table["max_steps"].max()) if index_table.height > 0 else 50
    part_records_by_round: dict[str, list[tuple[Path, int]]] = {round_id: [] for round_id in selected_round_ids}
    for row in index_table.to_dicts():
        round_id = str(row["round_id"])
        if round_id not in part_records_by_round:
            continue
        part_records_by_round[round_id].append(
            (
                dataset.dataset_dir / Path(str(row["part_path"])),
                int(row["max_steps"]),
            ),
        )
    candidate_round_ids = tuple(
        round_id
        for round_id in selected_round_ids
        if part_records_by_round[round_id]
    )
    candidate_weight_bank = np.stack(
        [
            _fit_round_weight_bank(
                part_records_by_round[round_id],
                static_feature_names=static_feature_names,
                memory_feature_names=memory_feature_names,
                nbr_feature_names=nbr_feature_names,
                ridge_lambda=ridge_lambda,
                learning_rate=learning_rate,
                max_epochs=max_epochs,
            )
            for round_id in candidate_round_ids
        ],
        axis=0,
    ).astype(np.float64)
    return candidate_round_ids, static_feature_names, rollout_steps, candidate_weight_bank


def _fit_low_rank_round_manifold(
    candidate_weight_bank: np.ndarray,
    *,
    latent_dim: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if candidate_weight_bank.ndim != 4:
        raise ValueError("expected candidate weight bank with shape [round, class, feature, next_class]")
    flat = candidate_weight_bank.reshape(candidate_weight_bank.shape[0], -1)
    mean_flat = np.mean(flat, axis=0, keepdims=True)
    centered = flat - mean_flat
    if latent_dim <= 0 or flat.shape[0] <= 1:
        reconstructed = np.repeat(mean_flat, flat.shape[0], axis=0)
        return (
            mean_flat.reshape(candidate_weight_bank.shape[1:]),
            np.zeros((0, flat.shape[1]), dtype=np.float64),
            np.zeros((flat.shape[0], 0), dtype=np.float64),
            reconstructed.reshape(candidate_weight_bank.shape),
        )
    _, _, right_vectors = np.linalg.svd(centered, full_matrices=False)
    latent_dim_used = min(latent_dim, right_vectors.shape[0], max(flat.shape[0] - 1, 0))
    if latent_dim_used <= 0:
        reconstructed = np.repeat(mean_flat, flat.shape[0], axis=0)
        return (
            mean_flat.reshape(candidate_weight_bank.shape[1:]),
            np.zeros((0, flat.shape[1]), dtype=np.float64),
            np.zeros((flat.shape[0], 0), dtype=np.float64),
            reconstructed.reshape(candidate_weight_bank.shape),
        )
    basis = np.asarray(right_vectors[:latent_dim_used], dtype=np.float64)
    round_latents = centered @ basis.T
    reconstructed = mean_flat + (round_latents @ basis)
    return (
        mean_flat.reshape(candidate_weight_bank.shape[1:]),
        basis,
        round_latents.astype(np.float64),
        reconstructed.reshape(candidate_weight_bank.shape).astype(np.float64),
    )


def _round_feature_vector_from_initial_states(
    initial_states,
    *,
    static_feature_names: tuple[str, ...],
) -> np.ndarray:
    seed_feature_vectors: list[np.ndarray] = []
    for initial_state in initial_states:
        feature_dict = seed_feature_dict(initial_state)
        seed_feature_vectors.append(
            np.asarray(
                [
                    float(np.mean(np.asarray(feature_dict[name], dtype=np.float64)))
                    for name in static_feature_names
                ],
                dtype=np.float64,
            ),
        )
    if not seed_feature_vectors:
        return np.zeros(len(static_feature_names), dtype=np.float64)
    return np.mean(np.stack(seed_feature_vectors, axis=0), axis=0)


def _fit_round_feature_prior(
    paths: WorkspacePaths,
    *,
    round_ids: tuple[str, ...],
    static_feature_names: tuple[str, ...],
    round_latents: np.ndarray,
    ridge_lambda: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if round_latents.size == 0 or round_latents.shape[1] == 0:
        return (
            np.zeros((len(static_feature_names),), dtype=np.float64),
            np.ones((len(static_feature_names),), dtype=np.float64),
            np.zeros((len(static_feature_names) + 1, 0), dtype=np.float64),
            np.zeros((0,), dtype=np.float64),
        )
    feature_matrix = np.stack(
        [
            _round_feature_vector_from_initial_states(
                read_round_record(paths, round_id).round.initial_states,
                static_feature_names=static_feature_names,
            )
            for round_id in round_ids
        ],
        axis=0,
    ).astype(np.float64)
    feature_mean = np.mean(feature_matrix, axis=0)
    feature_scale = np.std(feature_matrix, axis=0)
    feature_scale = np.where(feature_scale > 1e-6, feature_scale, 1.0)
    normalized = (feature_matrix - feature_mean[None, :]) / feature_scale[None, :]
    design = np.concatenate(
        [np.ones((normalized.shape[0], 1), dtype=np.float64), normalized],
        axis=1,
    )
    penalty = ridge_lambda * np.eye(design.shape[1], dtype=np.float64)
    penalty[0, 0] = 1e-6
    beta = np.linalg.solve(
        design.T @ design + penalty,
        design.T @ round_latents,
    ).astype(np.float64)
    fitted = design @ beta
    base_variance = np.var(round_latents, axis=0) + 1e-3
    residual_variance = np.var(round_latents - fitted, axis=0)
    prior_latent_var = np.maximum(residual_variance, 0.25 * base_variance) + 1e-3
    return feature_mean, feature_scale, beta, prior_latent_var.astype(np.float64)


class SemhGlmmPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_glmm_z0_h0_covbase_calnone_v001"
    dataset_name: str
    round_ids: tuple[str, ...]
    static_feature_names: tuple[str, ...]
    memory_feature_names: tuple[str, ...] = Field(default_factory=tuple)
    weight_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((CLASS_COUNT, 1, CLASS_COUNT), dtype=np.float64),
    )
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(default=50, ge=1)
    ridge_lambda: float = Field(default=1e-3, ge=0.0)
    learning_rate: float = Field(default=0.1, gt=0.0)
    max_epochs: int = Field(default=18, ge=1)
    prediction_floor: float = Field(default=1e-4, ge=0.0, lt=1.0)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str,
        dataset_name: str,
        memory_feature_names: tuple[str, ...] = (),
        memory_decay: float = 0.85,
        ridge_lambda: float = 1e-3,
        learning_rate: float = 0.1,
        max_epochs: int = 18,
        prediction_floor: float = 1e-4,
    ) -> SemhGlmmPredictor:
        selected_round_ids, static_feature_names, rollout_steps, candidate_weight_bank = (
            _fit_candidate_weight_banks(
                paths,
                round_ids=round_ids,
                dataset_name=dataset_name,
                memory_feature_names=memory_feature_names,
                memory_decay=memory_decay,
                ridge_lambda=ridge_lambda,
                learning_rate=learning_rate,
                max_epochs=max_epochs,
            )
        )
        if candidate_weight_bank.shape[0] == 0:
            raise ValueError("smh glmm predictor requires at least one replay-backed training round")
        weight_bank = np.mean(candidate_weight_bank, axis=0)
        return cls(
            name=model_name,
            dataset_name=dataset_name,
            round_ids=tuple(selected_round_ids),
            static_feature_names=static_feature_names,
            memory_feature_names=tuple(memory_feature_names),
            weight_bank=weight_bank,
            memory_decay=memory_decay,
            rollout_steps=rollout_steps,
            ridge_lambda=ridge_lambda,
            learning_rate=learning_rate,
            max_epochs=max_epochs,
            prediction_floor=prediction_floor,
        )

    def checkpoint(self, checkpoint_npz_path: Path) -> SemhGlmmPredictorCheckpoint:
        return SemhGlmmPredictorCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            round_ids=list(self.round_ids),
            static_feature_names=list(self.static_feature_names),
            memory_feature_names=list(self.memory_feature_names),
            memory_decay=self.memory_decay,
            rollout_steps=self.rollout_steps,
            ridge_lambda=self.ridge_lambda,
            learning_rate=self.learning_rate,
            max_epochs=self.max_epochs,
            prediction_floor=self.prediction_floor,
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "smh_glmm_predictor.npz"
        json_path = checkpoint_dir / "smh_glmm_predictor.json"
        np.savez_compressed(
            npz_path,
            weight_bank=self.weight_bank,
        )
        json_path.write_text(
            json.dumps(to_jsonable(self.checkpoint(npz_path)), indent=2),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SemhGlmmPredictor:
        checkpoint = SemhGlmmPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            round_ids=tuple(checkpoint.round_ids),
            static_feature_names=tuple(checkpoint.static_feature_names),
            memory_feature_names=tuple(checkpoint.memory_feature_names),
            weight_bank=np.asarray(arrays["weight_bank"], dtype=np.float64),
            memory_decay=checkpoint.memory_decay,
            rollout_steps=checkpoint.rollout_steps,
            ridge_lambda=checkpoint.ridge_lambda,
            learning_rate=checkpoint.learning_rate,
            max_epochs=checkpoint.max_epochs,
            prediction_floor=checkpoint.prediction_floor,
        )

    def _seed_prediction(self, initial_state) -> np.ndarray:
        return _rollout_seed_prediction(
            initial_state,
            weight_bank=self.weight_bank,
            static_feature_names=self.static_feature_names,
            memory_feature_names=self.memory_feature_names,
            memory_decay=self.memory_decay,
            rollout_steps=self.rollout_steps,
            prediction_floor=self.prediction_floor,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        return self.build_prediction_bundle(
            context.round_context.to_round_detail(),
            context.geometry_bundle,
            context.evidence_bundle,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        predictions_by_seed = {
            seed_index: self._seed_prediction(initial_state)
            for seed_index, initial_state in enumerate(round_detail.initial_states)
        }
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions_by_seed,
        )


class SemhGlmmBankPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_glmmbank_zhist_h0_covbase_calnone_v001"
    dataset_name: str
    round_ids: tuple[str, ...]
    static_feature_names: tuple[str, ...]
    memory_feature_names: tuple[str, ...] = Field(default_factory=tuple)
    candidate_weight_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, CLASS_COUNT, 1, CLASS_COUNT), dtype=np.float64),
    )
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(default=50, ge=1)
    ridge_lambda: float = Field(default=1e-3, ge=0.0)
    learning_rate: float = Field(default=0.1, gt=0.0)
    max_epochs: int = Field(default=18, ge=1)
    prediction_floor: float = Field(default=1e-4, ge=0.0, lt=1.0)
    candidate_tensor_cache: dict[str, np.ndarray] = Field(default_factory=dict, exclude=True)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str,
        dataset_name: str,
        memory_feature_names: tuple[str, ...] = (),
        memory_decay: float = 0.85,
        ridge_lambda: float = 1e-3,
        learning_rate: float = 0.1,
        max_epochs: int = 18,
        prediction_floor: float = 1e-4,
    ) -> SemhGlmmBankPredictor:
        candidate_round_ids, static_feature_names, rollout_steps, candidate_weight_bank = (
            _fit_candidate_weight_banks(
                paths,
                round_ids=round_ids,
                dataset_name=dataset_name,
                memory_feature_names=memory_feature_names,
                memory_decay=memory_decay,
                ridge_lambda=ridge_lambda,
                learning_rate=learning_rate,
                max_epochs=max_epochs,
            )
        )
        return cls(
            name=model_name,
            dataset_name=dataset_name,
            round_ids=tuple(candidate_round_ids),
            static_feature_names=static_feature_names,
            memory_feature_names=tuple(memory_feature_names),
            candidate_weight_bank=candidate_weight_bank,
            memory_decay=memory_decay,
            rollout_steps=rollout_steps,
            ridge_lambda=ridge_lambda,
            learning_rate=learning_rate,
            max_epochs=max_epochs,
            prediction_floor=prediction_floor,
        )

    def checkpoint(self, checkpoint_npz_path: Path) -> SemhGlmmBankPredictorCheckpoint:
        return SemhGlmmBankPredictorCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            round_ids=list(self.round_ids),
            static_feature_names=list(self.static_feature_names),
            memory_feature_names=list(self.memory_feature_names),
            memory_decay=self.memory_decay,
            rollout_steps=self.rollout_steps,
            ridge_lambda=self.ridge_lambda,
            learning_rate=self.learning_rate,
            max_epochs=self.max_epochs,
            prediction_floor=self.prediction_floor,
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "smh_glmm_bank_predictor.npz"
        json_path = checkpoint_dir / "smh_glmm_bank_predictor.json"
        np.savez_compressed(
            npz_path,
            candidate_weight_bank=self.candidate_weight_bank,
        )
        json_path.write_text(
            json.dumps(to_jsonable(self.checkpoint(npz_path)), indent=2),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SemhGlmmBankPredictor:
        checkpoint = SemhGlmmBankPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            round_ids=tuple(checkpoint.round_ids),
            static_feature_names=tuple(checkpoint.static_feature_names),
            memory_feature_names=tuple(checkpoint.memory_feature_names),
            candidate_weight_bank=np.asarray(arrays["candidate_weight_bank"], dtype=np.float64),
            memory_decay=checkpoint.memory_decay,
            rollout_steps=checkpoint.rollout_steps,
            ridge_lambda=checkpoint.ridge_lambda,
            learning_rate=checkpoint.learning_rate,
            max_epochs=checkpoint.max_epochs,
            prediction_floor=checkpoint.prediction_floor,
        )

    def _candidate_seed_tensors(self, round_detail: RoundDetail) -> np.ndarray:
        cached = self.candidate_tensor_cache.get(round_detail.id)
        if cached is not None:
            return cached
        candidate_tensors = np.stack(
            [
                np.stack(
                    [
                        _rollout_seed_prediction(
                            initial_state,
                            weight_bank=np.asarray(candidate_weight_bank, dtype=np.float64),
                            static_feature_names=self.static_feature_names,
                            memory_feature_names=self.memory_feature_names,
                            memory_decay=self.memory_decay,
                            rollout_steps=self.rollout_steps,
                            prediction_floor=self.prediction_floor,
                        )
                        for initial_state in round_detail.initial_states
                    ],
                    axis=0,
                )
                for candidate_weight_bank in self.candidate_weight_bank
            ],
            axis=0,
        )
        self.candidate_tensor_cache[round_detail.id] = candidate_tensors
        return candidate_tensors

    def _observation_log_likelihood(
        self,
        candidate_seed_tensors: np.ndarray,
        observation,
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
        return np.sum(np.log(np.clip(chosen, self.prediction_floor, 1.0)), axis=1)

    def _posterior_weights(
        self,
        candidate_seed_tensors: np.ndarray,
        observations: tuple,
    ) -> np.ndarray:
        if candidate_seed_tensors.shape[0] == 1:
            return np.ones((1,), dtype=np.float64)
        log_weights = np.zeros(candidate_seed_tensors.shape[0], dtype=np.float64)
        for observation in observations:
            log_weights += self._observation_log_likelihood(candidate_seed_tensors, observation)
        max_log_weight = float(np.max(log_weights))
        weights = np.exp(log_weights - max_log_weight)
        return weights / np.sum(weights)

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        candidate_seed_tensors = self._candidate_seed_tensors(round_detail)
        posterior_weights = self._posterior_weights(candidate_seed_tensors, context.observations)
        mixed = np.tensordot(posterior_weights, candidate_seed_tensors, axes=(0, 0))
        normalized = _apply_probability_floor(mixed, self.prediction_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: normalized[seed_index]
                for seed_index in range(normalized.shape[0])
            },
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        candidate_seed_tensors = self._candidate_seed_tensors(round_detail)
        posterior_weights = np.full(
            candidate_seed_tensors.shape[0],
            1.0 / float(candidate_seed_tensors.shape[0]),
            dtype=np.float64,
        )
        mixed = np.tensordot(posterior_weights, candidate_seed_tensors, axes=(0, 0))
        normalized = _apply_probability_floor(mixed, self.prediction_floor)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: normalized[seed_index]
                for seed_index in range(normalized.shape[0])
            },
        )


class SemhGlmmLatentPredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "smh_glmmlatent_z2_h0_covbase_calnone_v001"
    dataset_name: str
    round_ids: tuple[str, ...]
    static_feature_names: tuple[str, ...]
    memory_feature_names: tuple[str, ...] = Field(default_factory=tuple)
    nbr_feature_names: tuple[str, ...] = Field(default_factory=tuple)
    mean_weight_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((CLASS_COUNT, 1, CLASS_COUNT), dtype=np.float64),
    )
    latent_basis: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    candidate_round_latents: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    candidate_weight_bank: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, CLASS_COUNT, 1, CLASS_COUNT), dtype=np.float64),
    )
    memory_decay: float = Field(default=0.85, ge=0.0, le=1.0)
    rollout_steps: int = Field(default=50, ge=1)
    ridge_lambda: float = Field(default=1e-3, ge=0.0)
    learning_rate: float = Field(default=0.1, gt=0.0)
    max_epochs: int = Field(default=18, ge=1)
    prediction_floor: float = Field(default=1e-4, ge=0.0, lt=1.0)
    latent_dim_requested: int = Field(default=2, ge=0)
    latent_dim_used: int = Field(default=0, ge=0)
    feature_prior_enabled: bool = False
    feature_prior_ridge_lambda: float = Field(default=8.0, ge=0.0)
    prior_feature_mean: np.ndarray = Field(default_factory=lambda: np.zeros((0,), dtype=np.float64))
    prior_feature_scale: np.ndarray = Field(default_factory=lambda: np.ones((0,), dtype=np.float64))
    prior_beta: np.ndarray = Field(default_factory=lambda: np.zeros((0, 0), dtype=np.float64))
    prior_latent_var: np.ndarray = Field(default_factory=lambda: np.zeros((0,), dtype=np.float64))
    candidate_tensor_cache: dict[str, np.ndarray] = Field(default_factory=dict, exclude=True)

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: list[str] | None,
        model_name: str,
        dataset_name: str,
        memory_feature_names: tuple[str, ...] = (),
        nbr_feature_names: tuple[str, ...] = (),
        memory_decay: float = 0.85,
        ridge_lambda: float = 1e-3,
        learning_rate: float = 0.1,
        max_epochs: int = 18,
        prediction_floor: float = 1e-4,
        latent_dim: int = 2,
        feature_prior: bool = False,
        feature_prior_ridge_lambda: float = 8.0,
    ) -> SemhGlmmLatentPredictor:
        candidate_round_ids, static_feature_names, rollout_steps, candidate_weight_bank = (
            _fit_candidate_weight_banks(
                paths,
                round_ids=round_ids,
                dataset_name=dataset_name,
                memory_feature_names=memory_feature_names,
                nbr_feature_names=nbr_feature_names,
                memory_decay=memory_decay,
                ridge_lambda=ridge_lambda,
                learning_rate=learning_rate,
                max_epochs=max_epochs,
            )
        )
        if candidate_weight_bank.shape[0] == 0:
            raise ValueError("smh glmm latent predictor requires at least one replay-backed training round")
        mean_weight_bank, latent_basis, candidate_round_latents, reconstructed_weight_bank = (
            _fit_low_rank_round_manifold(
                candidate_weight_bank,
                latent_dim=latent_dim,
            )
        )
        prior_feature_mean = np.zeros((len(static_feature_names),), dtype=np.float64)
        prior_feature_scale = np.ones((len(static_feature_names),), dtype=np.float64)
        prior_beta = np.zeros((len(static_feature_names) + 1, candidate_round_latents.shape[1]), dtype=np.float64)
        prior_latent_var = np.zeros((candidate_round_latents.shape[1],), dtype=np.float64)
        if feature_prior:
            prior_feature_mean, prior_feature_scale, prior_beta, prior_latent_var = _fit_round_feature_prior(
                paths,
                round_ids=tuple(candidate_round_ids),
                static_feature_names=static_feature_names,
                round_latents=candidate_round_latents,
                ridge_lambda=feature_prior_ridge_lambda,
            )
        return cls(
            name=model_name,
            dataset_name=dataset_name,
            round_ids=tuple(candidate_round_ids),
            static_feature_names=static_feature_names,
            memory_feature_names=tuple(memory_feature_names),
            nbr_feature_names=tuple(nbr_feature_names),
            mean_weight_bank=mean_weight_bank.astype(np.float64),
            latent_basis=latent_basis.astype(np.float64),
            candidate_round_latents=candidate_round_latents.astype(np.float64),
            candidate_weight_bank=reconstructed_weight_bank.astype(np.float64),
            memory_decay=memory_decay,
            rollout_steps=rollout_steps,
            ridge_lambda=ridge_lambda,
            learning_rate=learning_rate,
            max_epochs=max_epochs,
            prediction_floor=prediction_floor,
            latent_dim_requested=latent_dim,
            latent_dim_used=int(candidate_round_latents.shape[1]),
            feature_prior_enabled=feature_prior,
            feature_prior_ridge_lambda=feature_prior_ridge_lambda,
            prior_feature_mean=prior_feature_mean.astype(np.float64),
            prior_feature_scale=prior_feature_scale.astype(np.float64),
            prior_beta=prior_beta.astype(np.float64),
            prior_latent_var=prior_latent_var.astype(np.float64),
        )

    def checkpoint(self, checkpoint_npz_path: Path) -> SemhGlmmLatentPredictorCheckpoint:
        return SemhGlmmLatentPredictorCheckpoint(
            name=self.name,
            dataset_name=self.dataset_name,
            checkpoint_npz_path=str(checkpoint_npz_path),
            round_ids=list(self.round_ids),
            static_feature_names=list(self.static_feature_names),
            memory_feature_names=list(self.memory_feature_names),
            nbr_feature_names=list(self.nbr_feature_names),
            memory_decay=self.memory_decay,
            rollout_steps=self.rollout_steps,
            ridge_lambda=self.ridge_lambda,
            learning_rate=self.learning_rate,
            max_epochs=self.max_epochs,
            prediction_floor=self.prediction_floor,
            latent_dim_requested=self.latent_dim_requested,
            latent_dim_used=self.latent_dim_used,
            feature_prior_enabled=self.feature_prior_enabled,
            feature_prior_ridge_lambda=self.feature_prior_ridge_lambda,
        )

    def save_checkpoint(self, checkpoint_dir: Path) -> Path:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        npz_path = checkpoint_dir / "smh_glmm_latent_predictor.npz"
        json_path = checkpoint_dir / "smh_glmm_latent_predictor.json"
        np.savez_compressed(
            npz_path,
            mean_weight_bank=self.mean_weight_bank,
            latent_basis=self.latent_basis,
            candidate_round_latents=self.candidate_round_latents,
            candidate_weight_bank=self.candidate_weight_bank,
            prior_feature_mean=self.prior_feature_mean,
            prior_feature_scale=self.prior_feature_scale,
            prior_beta=self.prior_beta,
            prior_latent_var=self.prior_latent_var,
        )
        json_path.write_text(
            json.dumps(to_jsonable(self.checkpoint(npz_path)), indent=2),
            encoding="utf-8",
        )
        return json_path

    @classmethod
    def load_checkpoint(cls, path: Path) -> SemhGlmmLatentPredictor:
        checkpoint = SemhGlmmLatentPredictorCheckpoint.model_validate_json(path.read_text(encoding="utf-8"))
        arrays = np.load(Path(checkpoint.checkpoint_npz_path))
        return cls(
            name=checkpoint.name,
            dataset_name=checkpoint.dataset_name,
            round_ids=tuple(checkpoint.round_ids),
            static_feature_names=tuple(checkpoint.static_feature_names),
            memory_feature_names=tuple(checkpoint.memory_feature_names),
            nbr_feature_names=tuple(checkpoint.nbr_feature_names),
            mean_weight_bank=np.asarray(arrays["mean_weight_bank"], dtype=np.float64),
            latent_basis=np.asarray(arrays["latent_basis"], dtype=np.float64),
            candidate_round_latents=np.asarray(arrays["candidate_round_latents"], dtype=np.float64),
            candidate_weight_bank=np.asarray(arrays["candidate_weight_bank"], dtype=np.float64),
            memory_decay=checkpoint.memory_decay,
            rollout_steps=checkpoint.rollout_steps,
            ridge_lambda=checkpoint.ridge_lambda,
            learning_rate=checkpoint.learning_rate,
            max_epochs=checkpoint.max_epochs,
            prediction_floor=checkpoint.prediction_floor,
            latent_dim_requested=checkpoint.latent_dim_requested,
            latent_dim_used=checkpoint.latent_dim_used,
            feature_prior_enabled=checkpoint.feature_prior_enabled,
            feature_prior_ridge_lambda=checkpoint.feature_prior_ridge_lambda,
            prior_feature_mean=np.asarray(
                arrays["prior_feature_mean"] if "prior_feature_mean" in arrays.files else np.zeros((0,), dtype=np.float64),
                dtype=np.float64,
            ),
            prior_feature_scale=np.asarray(
                arrays["prior_feature_scale"] if "prior_feature_scale" in arrays.files else np.ones((0,), dtype=np.float64),
                dtype=np.float64,
            ),
            prior_beta=np.asarray(
                arrays["prior_beta"] if "prior_beta" in arrays.files else np.zeros((0, 0), dtype=np.float64),
                dtype=np.float64,
            ),
            prior_latent_var=np.asarray(
                arrays["prior_latent_var"] if "prior_latent_var" in arrays.files else np.zeros((0,), dtype=np.float64),
                dtype=np.float64,
            ),
        )

    def _weight_bank_from_latent(self, latent: np.ndarray | None = None) -> np.ndarray:
        if latent is None or self.latent_basis.size == 0:
            return np.asarray(self.mean_weight_bank, dtype=np.float64)
        flat_mean = self.mean_weight_bank.reshape(-1)
        flat = flat_mean + (np.asarray(latent, dtype=np.float64) @ self.latent_basis)
        return flat.reshape(self.mean_weight_bank.shape)

    def _candidate_seed_tensors(self, round_detail: RoundDetail) -> np.ndarray:
        cached = self.candidate_tensor_cache.get(round_detail.id)
        if cached is not None:
            return cached
        candidate_tensors = np.stack(
            [
                np.stack(
                    [
                        _rollout_seed_prediction(
                            initial_state,
                            weight_bank=np.asarray(weight_bank, dtype=np.float64),
                            static_feature_names=self.static_feature_names,
                            memory_feature_names=self.memory_feature_names,
                            nbr_feature_names=self.nbr_feature_names,
                            memory_decay=self.memory_decay,
                            rollout_steps=self.rollout_steps,
                            prediction_floor=self.prediction_floor,
                        )
                        for initial_state in round_detail.initial_states
                    ],
                    axis=0,
                )
                for weight_bank in self.candidate_weight_bank
            ],
            axis=0,
        )
        self.candidate_tensor_cache[round_detail.id] = candidate_tensors
        return candidate_tensors

    def _prior_log_weights(self, round_detail: RoundDetail) -> np.ndarray:
        if (
            not self.feature_prior_enabled
            or self.candidate_round_latents.shape[1] == 0
            or self.prior_beta.size == 0
        ):
            return np.zeros((self.candidate_weight_bank.shape[0],), dtype=np.float64)
        feature_vector = _round_feature_vector_from_initial_states(
            round_detail.initial_states,
            static_feature_names=self.static_feature_names,
        )
        normalized = (feature_vector - self.prior_feature_mean) / np.where(
            self.prior_feature_scale > 1e-6,
            self.prior_feature_scale,
            1.0,
        )
        design = np.concatenate([np.ones((1,), dtype=np.float64), normalized], axis=0)
        prior_latent_mean = design @ self.prior_beta
        diffs = self.candidate_round_latents - prior_latent_mean[None, :]
        latent_var = np.where(self.prior_latent_var > 1e-6, self.prior_latent_var, 1.0)
        return -0.5 * np.sum(np.square(diffs) / latent_var[None, :], axis=1)

    def _observation_log_likelihood(
        self,
        candidate_seed_tensors: np.ndarray,
        observation,
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
        return np.sum(np.log(np.clip(chosen, self.prediction_floor, 1.0)), axis=1)

    def _posterior_weights(
        self,
        candidate_seed_tensors: np.ndarray,
        observations: tuple,
        *,
        prior_log_weights: np.ndarray | None = None,
    ) -> np.ndarray:
        if candidate_seed_tensors.shape[0] == 1:
            return np.ones((1,), dtype=np.float64)
        log_weights = (
            np.zeros(candidate_seed_tensors.shape[0], dtype=np.float64)
            if prior_log_weights is None
            else np.asarray(prior_log_weights, dtype=np.float64).copy()
        )
        for observation in observations:
            log_weights += self._observation_log_likelihood(candidate_seed_tensors, observation)
        max_log_weight = float(np.max(log_weights))
        weights = np.exp(log_weights - max_log_weight)
        return weights / np.sum(weights)

    def _seed_prediction(self, initial_state, weight_bank: np.ndarray) -> np.ndarray:
        return _rollout_seed_prediction(
            initial_state,
            weight_bank=weight_bank,
            static_feature_names=self.static_feature_names,
            memory_feature_names=self.memory_feature_names,
            nbr_feature_names=self.nbr_feature_names,
            memory_decay=self.memory_decay,
            rollout_steps=self.rollout_steps,
            prediction_floor=self.prediction_floor,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        round_detail = context.round_context.to_round_detail()
        candidate_seed_tensors = self._candidate_seed_tensors(round_detail)
        posterior_weights = self._posterior_weights(
            candidate_seed_tensors,
            context.observations,
            prior_log_weights=self._prior_log_weights(round_detail),
        )
        posterior_latent = posterior_weights @ self.candidate_round_latents
        weight_bank = self._weight_bank_from_latent(posterior_latent)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: self._seed_prediction(initial_state, weight_bank)
                for seed_index, initial_state in enumerate(round_detail.initial_states)
            },
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        del features, evidence
        candidate_seed_tensors = self._candidate_seed_tensors(round_detail)
        prior_weights = self._posterior_weights(
            candidate_seed_tensors,
            tuple(),
            prior_log_weights=self._prior_log_weights(round_detail),
        )
        weight_bank = self._weight_bank_from_latent(prior_weights @ self.candidate_round_latents)
        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed={
                seed_index: self._seed_prediction(initial_state, weight_bank)
                for seed_index, initial_state in enumerate(round_detail.initial_states)
            },
        )


__all__ = [
    "SemhGlmmBankPredictor",
    "SemhGlmmBankPredictorCheckpoint",
    "SemhGlmmLatentPredictor",
    "SemhGlmmLatentPredictorCheckpoint",
    "SemhGlmmPredictor",
    "SemhGlmmPredictorCheckpoint",
]
