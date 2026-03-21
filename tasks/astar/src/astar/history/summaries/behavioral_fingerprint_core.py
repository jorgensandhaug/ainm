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
YEAR_SHOCK_BLOCK_PREFIXES: tuple[str, ...] = ("year_shock::",)
MACRO_BLOCK_PREFIXES: tuple[str, ...] = ("macro::",)
DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE = "core_v1"
BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_PREFIXES: dict[str, tuple[str, ...]] = {
    "core_v1": CORE_BLOCK_PREFIXES,
    "core_plus_year_shock_v1": CORE_BLOCK_PREFIXES + YEAR_SHOCK_BLOCK_PREFIXES,
    "core_plus_macro_v1": CORE_BLOCK_PREFIXES + MACRO_BLOCK_PREFIXES,
    "full_v1": CORE_BLOCK_PREFIXES + YEAR_SHOCK_BLOCK_PREFIXES + MACRO_BLOCK_PREFIXES,
}
BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_ALIASES: dict[str, str] = {
    "behavioral_fingerprint_core_v1": "core_v1",
    "core_plus_shock_v1": "core_plus_year_shock_v1",
    "core_plus_year_shock_macro_v1": "full_v1",
}
BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILES: tuple[str, ...] = tuple(
    BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_PREFIXES
)


class BehavioralFingerprintCoreSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_names: tuple[str, ...]
    summary_vector: np.ndarray
    summary_std: np.ndarray | None = None
    source_indices: tuple[int, ...] = Field(default_factory=tuple)


def resolve_behavioral_fingerprint_summary_profile(summary_profile: str) -> str:
    normalized = str(summary_profile).strip().lower()
    normalized = BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_ALIASES.get(normalized, normalized)
    if normalized not in BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_PREFIXES:
        available = ", ".join(BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILES)
        raise ValueError(
            f"unknown behavioral fingerprint summary profile {summary_profile!r}; "
            f"expected one of: {available}"
        )
    return normalized


def behavioral_fingerprint_summary_profile_prefixes(
    summary_profile: str,
) -> tuple[str, ...]:
    return BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE_PREFIXES[
        resolve_behavioral_fingerprint_summary_profile(summary_profile)
    ]


def is_behavioral_fingerprint_summary_name(
    name: str,
    *,
    summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
) -> bool:
    return any(
        name.startswith(prefix)
        for prefix in behavioral_fingerprint_summary_profile_prefixes(summary_profile)
    )


def is_behavioral_fingerprint_core_name(name: str) -> bool:
    return is_behavioral_fingerprint_summary_name(name, summary_profile="core_v1")


def select_behavioral_fingerprint_summary_profile(
    summary_names: Sequence[str],
    summary_vector: np.ndarray,
    summary_std: np.ndarray | None = None,
    *,
    summary_profile: str = DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE,
) -> BehavioralFingerprintCoreSelection:
    resolved_profile = resolve_behavioral_fingerprint_summary_profile(summary_profile)
    indices = tuple(
        index
        for index, name in enumerate(summary_names)
        if is_behavioral_fingerprint_summary_name(
            str(name),
            summary_profile=resolved_profile,
        )
    )
    if not indices:
        raise ValueError(
            "behavioral fingerprint selection produced no summary dimensions "
            f"for profile {resolved_profile!r}"
        )
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


def select_behavioral_fingerprint_core(
    summary_names: Sequence[str],
    summary_vector: np.ndarray,
    summary_std: np.ndarray | None = None,
) -> BehavioralFingerprintCoreSelection:
    return select_behavioral_fingerprint_summary_profile(
        summary_names,
        summary_vector,
        summary_std,
        summary_profile="core_v1",
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


def behavioral_fingerprint_summary_column_scale(
    summary_matrix: np.ndarray,
    summary_std_matrix: np.ndarray | None = None,
    *,
    eps: float = 1e-8,
) -> np.ndarray:
    return behavioral_fingerprint_core_column_scale(
        summary_matrix,
        summary_std_matrix,
        eps=eps,
    )


__all__ = [
    "BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILES",
    "DEFAULT_BEHAVIORAL_FINGERPRINT_SUMMARY_PROFILE",
    "BehavioralFingerprintCoreSelection",
    "CORE_BLOCK_PREFIXES",
    "behavioral_fingerprint_core_column_scale",
    "behavioral_fingerprint_summary_column_scale",
    "behavioral_fingerprint_summary_profile_prefixes",
    "is_behavioral_fingerprint_core_name",
    "is_behavioral_fingerprint_summary_name",
    "resolve_behavioral_fingerprint_summary_profile",
    "select_behavioral_fingerprint_core",
    "select_behavioral_fingerprint_summary_profile",
]
