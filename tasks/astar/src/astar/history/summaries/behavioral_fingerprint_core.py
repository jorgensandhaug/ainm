from __future__ import annotations

from typing import Sequence

import numpy as np
from pydantic import BaseModel, ConfigDict, Field


CORE_BLOCK_PREFIXES: tuple[str, ...] = (
    "site_binary::",
    "live_binary::",
    "live_linear::",
    "ruin_binary::",
    "pairwise_binary::",
    "pairwise_linear::",
    "owner_linear::",
)


class BehavioralFingerprintCoreSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_names: tuple[str, ...]
    summary_vector: np.ndarray
    summary_std: np.ndarray | None = None
    source_indices: tuple[int, ...] = Field(default_factory=tuple)


def is_behavioral_fingerprint_core_name(name: str) -> bool:
    return any(name.startswith(prefix) for prefix in CORE_BLOCK_PREFIXES)


def select_behavioral_fingerprint_core(
    summary_names: Sequence[str],
    summary_vector: np.ndarray,
    summary_std: np.ndarray | None = None,
) -> BehavioralFingerprintCoreSelection:
    indices = tuple(
        index
        for index, name in enumerate(summary_names)
        if is_behavioral_fingerprint_core_name(str(name))
    )
    if not indices:
        raise ValueError("behavioral fingerprint core selection produced no summary dimensions")
    vector = np.asarray(summary_vector, dtype=np.float64)
    if vector.ndim != 1:
        raise ValueError(f"expected 1D summary vector, got shape {vector.shape!r}")
    if vector.shape[0] != len(summary_names):
        raise ValueError("summary names and summary vector length mismatch")
    selected_std: np.ndarray | None = None
    if summary_std is not None:
        std = np.asarray(summary_std, dtype=np.float64)
        if std.ndim != 1:
            raise ValueError(f"expected 1D summary std, got shape {std.shape!r}")
        if std.shape[0] != len(summary_names):
            raise ValueError("summary names and summary std length mismatch")
        selected_std = np.asarray(std[list(indices)], dtype=np.float64)
    return BehavioralFingerprintCoreSelection(
        summary_names=tuple(str(summary_names[index]) for index in indices),
        summary_vector=np.asarray(vector[list(indices)], dtype=np.float64),
        summary_std=selected_std,
        source_indices=indices,
    )


def behavioral_fingerprint_core_column_scale(
    summary_matrix: np.ndarray,
    summary_std_matrix: np.ndarray | None = None,
    *,
    eps: float = 1e-8,
) -> np.ndarray:
    matrix = np.asarray(summary_matrix, dtype=np.float64)
    if matrix.ndim != 2:
        raise ValueError(f"expected 2D summary matrix, got shape {matrix.shape!r}")
    variance = np.var(matrix, axis=0)
    noise = np.zeros(matrix.shape[1], dtype=np.float64)
    if summary_std_matrix is not None:
        std = np.asarray(summary_std_matrix, dtype=np.float64)
        if std.shape != matrix.shape:
            raise ValueError(
                "summary std matrix shape mismatch: "
                f"expected {matrix.shape!r}, got {std.shape!r}",
            )
        noise = np.mean(std**2, axis=0)
    scale = np.sqrt(np.maximum(variance + noise, eps))
    return np.asarray(scale, dtype=np.float64)


__all__ = [
    "BehavioralFingerprintCoreSelection",
    "CORE_BLOCK_PREFIXES",
    "behavioral_fingerprint_core_column_scale",
    "is_behavioral_fingerprint_core_name",
    "select_behavioral_fingerprint_core",
]
