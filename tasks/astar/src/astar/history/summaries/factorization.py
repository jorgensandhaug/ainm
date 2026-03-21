from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field


class RoundSummaryFactorization(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_kind: str
    summary_names: list[str]
    round_ids: tuple[str, ...]
    round_numbers: tuple[int, ...]
    sample_counts: tuple[int, ...]
    summary_matrix: np.ndarray
    mean_vector: np.ndarray
    scale_vector: np.ndarray = Field(default_factory=lambda: np.ones(0, dtype=np.float64))
    singular_values: np.ndarray
    explained_variance_ratio: np.ndarray
    basis: np.ndarray
    coordinates: np.ndarray
    effective_rank: int = Field(ge=0)


class RoundSummaryLeaveOneOutRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int
    sample_count: int = Field(ge=0)
    mae: float
    rmse: float
    baseline_mae: float
    baseline_rmse: float
    cosine_similarity: float | None = None


class RoundSummaryLeaveOneOutReport(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_kind: str
    requested_rank: int = Field(ge=0)
    eligible_round_count: int = Field(ge=0)
    round_results: tuple[RoundSummaryLeaveOneOutRoundResult, ...]
    mean_mae: float | None = None
    mean_rmse: float | None = None
    mean_baseline_mae: float | None = None
    mean_baseline_rmse: float | None = None
    mean_mae_improvement: float | None = None
    mean_rmse_improvement: float | None = None
    mean_cosine_similarity: float | None = None


def factorize_summary_matrix(
    *,
    summary_kind: str,
    summary_names: list[str] | tuple[str, ...],
    round_ids: list[str] | tuple[str, ...],
    round_numbers: list[int] | tuple[int, ...],
    sample_counts: list[int] | tuple[int, ...],
    summary_matrix: np.ndarray,
    max_rank: int = 3,
    column_scale: np.ndarray | None = None,
    allow_zero_rank: bool = False,
) -> RoundSummaryFactorization:
    matrix = np.asarray(summary_matrix, dtype=np.float64)
    if matrix.ndim != 2:
        raise ValueError(f"expected 2D summary matrix, got shape {matrix.shape!r}")
    if matrix.shape[0] == 0:
        raise ValueError("cannot factorize empty summary matrix")
    if matrix.shape[1] == 0:
        raise ValueError("cannot factorize summary matrix with zero columns")

    mean_vector = np.mean(matrix, axis=0)
    centered = matrix - mean_vector[None, :]
    if column_scale is None:
        scale_vector = np.ones(matrix.shape[1], dtype=np.float64)
    else:
        scale_vector = np.asarray(column_scale, dtype=np.float64)
        if scale_vector.ndim != 1 or scale_vector.shape[0] != matrix.shape[1]:
            raise ValueError(
                "expected column_scale shape "
                f"({matrix.shape[1]},), got {scale_vector.shape!r}",
            )
        if not np.all(np.isfinite(scale_vector)):
            raise ValueError("column_scale must be finite")
        if np.any(scale_vector <= 0.0):
            raise ValueError("column_scale must be strictly positive")
    normalized = centered / scale_vector[None, :]
    _, singular_values, vt_matrix = np.linalg.svd(normalized, full_matrices=False)
    if singular_values.size == 0:
        nonzero_rank = 0
    else:
        tolerance = (
            max(normalized.shape)
            * float(np.max(singular_values))
            * np.finfo(np.float64).eps
        )
        nonzero_rank = int(np.count_nonzero(singular_values > tolerance))
    if nonzero_rank > 0:
        effective_rank = min(max_rank, nonzero_rank)
    elif allow_zero_rank:
        effective_rank = 0
    else:
        effective_rank = min(max_rank, 1)
    basis = vt_matrix[:effective_rank]
    coordinates = normalized @ basis.T
    variance = singular_values**2
    variance_sum = float(np.sum(variance))
    if variance_sum > 0.0:
        explained_variance_ratio = variance[:effective_rank] / variance_sum
    else:
        explained_variance_ratio = np.zeros(effective_rank, dtype=np.float64)

    return RoundSummaryFactorization(
        summary_kind=summary_kind,
        summary_names=list(summary_names),
        round_ids=tuple(round_ids),
        round_numbers=tuple(int(value) for value in round_numbers),
        sample_counts=tuple(int(value) for value in sample_counts),
        summary_matrix=matrix,
        mean_vector=np.asarray(mean_vector, dtype=np.float64),
        scale_vector=np.asarray(scale_vector, dtype=np.float64),
        singular_values=np.asarray(singular_values, dtype=np.float64),
        explained_variance_ratio=np.asarray(explained_variance_ratio, dtype=np.float64),
        basis=np.asarray(basis, dtype=np.float64),
        coordinates=np.asarray(coordinates, dtype=np.float64),
        effective_rank=effective_rank,
    )


def project_summary_vector(
    factorization: RoundSummaryFactorization,
    summary_vector: np.ndarray,
) -> np.ndarray:
    centered = np.asarray(summary_vector, dtype=np.float64) - factorization.mean_vector
    scale_vector = (
        factorization.scale_vector
        if factorization.scale_vector.shape == factorization.mean_vector.shape
        else np.ones_like(factorization.mean_vector, dtype=np.float64)
    )
    normalized = centered / scale_vector
    return np.asarray(normalized @ factorization.basis.T, dtype=np.float64)


def reconstruct_summary_vector(
    factorization: RoundSummaryFactorization,
    coordinates: np.ndarray,
) -> np.ndarray:
    coordinates_array = np.asarray(coordinates, dtype=np.float64)
    scale_vector = (
        factorization.scale_vector
        if factorization.scale_vector.shape == factorization.mean_vector.shape
        else np.ones_like(factorization.mean_vector, dtype=np.float64)
    )
    return np.asarray(
        factorization.mean_vector + (coordinates_array @ factorization.basis) * scale_vector,
        dtype=np.float64,
    )


def _cosine_similarity(lhs: np.ndarray, rhs: np.ndarray) -> float | None:
    lhs_norm = float(np.linalg.norm(lhs))
    rhs_norm = float(np.linalg.norm(rhs))
    if lhs_norm <= 0.0 or rhs_norm <= 0.0:
        return None
    return float(np.dot(lhs, rhs) / (lhs_norm * rhs_norm))


def evaluate_factorization_leave_one_out(
    factorization: RoundSummaryFactorization,
    *,
    max_rank: int | None = None,
) -> RoundSummaryLeaveOneOutReport:
    matrix = np.asarray(factorization.summary_matrix, dtype=np.float64)
    requested_rank = int(max_rank or factorization.effective_rank)
    if matrix.shape[0] <= 1:
        return RoundSummaryLeaveOneOutReport(
            summary_kind=factorization.summary_kind,
            requested_rank=requested_rank,
            eligible_round_count=0,
            round_results=(),
        )

    round_results: list[RoundSummaryLeaveOneOutRoundResult] = []
    for heldout_index in range(matrix.shape[0]):
        keep_mask = np.ones(matrix.shape[0], dtype=bool)
        keep_mask[heldout_index] = False
        train_factorization = factorize_summary_matrix(
            summary_kind=factorization.summary_kind,
            summary_names=factorization.summary_names,
            round_ids=np.asarray(factorization.round_ids)[keep_mask].tolist(),
            round_numbers=np.asarray(factorization.round_numbers)[keep_mask].tolist(),
            sample_counts=np.asarray(factorization.sample_counts)[keep_mask].tolist(),
            summary_matrix=matrix[keep_mask],
            max_rank=requested_rank,
            column_scale=None,
            allow_zero_rank=True,
        )
        heldout_vector = matrix[heldout_index]
        coordinates = project_summary_vector(train_factorization, heldout_vector)
        reconstructed = reconstruct_summary_vector(train_factorization, coordinates)
        baseline = np.asarray(train_factorization.mean_vector, dtype=np.float64)
        error = heldout_vector - reconstructed
        baseline_error = heldout_vector - baseline
        round_results.append(
            RoundSummaryLeaveOneOutRoundResult(
                round_id=factorization.round_ids[heldout_index],
                round_number=factorization.round_numbers[heldout_index],
                sample_count=factorization.sample_counts[heldout_index],
                mae=float(np.mean(np.abs(error))),
                rmse=float(np.sqrt(np.mean(error**2))),
                baseline_mae=float(np.mean(np.abs(baseline_error))),
                baseline_rmse=float(np.sqrt(np.mean(baseline_error**2))),
                cosine_similarity=_cosine_similarity(heldout_vector, reconstructed),
            )
        )

    mae_values = np.asarray([item.mae for item in round_results], dtype=np.float64)
    rmse_values = np.asarray([item.rmse for item in round_results], dtype=np.float64)
    baseline_mae_values = np.asarray(
        [item.baseline_mae for item in round_results],
        dtype=np.float64,
    )
    baseline_rmse_values = np.asarray(
        [item.baseline_rmse for item in round_results],
        dtype=np.float64,
    )
    cosine_values = np.asarray(
        [item.cosine_similarity for item in round_results if item.cosine_similarity is not None],
        dtype=np.float64,
    )
    return RoundSummaryLeaveOneOutReport(
        summary_kind=factorization.summary_kind,
        requested_rank=requested_rank,
        eligible_round_count=len(round_results),
        round_results=tuple(round_results),
        mean_mae=float(np.mean(mae_values)),
        mean_rmse=float(np.mean(rmse_values)),
        mean_baseline_mae=float(np.mean(baseline_mae_values)),
        mean_baseline_rmse=float(np.mean(baseline_rmse_values)),
        mean_mae_improvement=float(np.mean(baseline_mae_values - mae_values)),
        mean_rmse_improvement=float(np.mean(baseline_rmse_values - rmse_values)),
        mean_cosine_similarity=(
            float(np.mean(cosine_values))
            if cosine_values.size > 0
            else None
        ),
    )


__all__ = [
    "RoundSummaryFactorization",
    "RoundSummaryLeaveOneOutReport",
    "RoundSummaryLeaveOneOutRoundResult",
    "evaluate_factorization_leave_one_out",
    "factorize_summary_matrix",
    "project_summary_vector",
    "reconstruct_summary_vector",
]
