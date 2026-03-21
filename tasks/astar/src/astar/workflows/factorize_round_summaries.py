from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.behavioral_fingerprint_manifold import (
    factorize_round_behavioral_fingerprint_subspace,
)
from astar.history.summaries.dynamic_law_manifold import factorize_round_dynamic_law_subspace
from astar.history.summaries.event_manifold import factorize_round_event_summary_subspace
from astar.history.summaries.factorization import (
    RoundSummaryFactorization,
    RoundSummaryLeaveOneOutReport,
    evaluate_factorization_leave_one_out,
)
from astar.history.summaries.manifold import factorize_round_regime_manifold
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable


class FactorizeRoundSummariesResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_kind: str
    round_count: int = Field(ge=1)
    effective_rank: int = Field(ge=1)
    summary_path: Path
    basis_path: Path
    leave_one_out_path: Path
    factorization: RoundSummaryFactorization
    leave_one_out_report: RoundSummaryLeaveOneOutReport


def _legacy_summary_names(feature_names: list[str]) -> list[str]:
    return [
        "build_intercept",
        *[f"build::{name}" for name in feature_names],
        "port_intercept",
        *[f"port::{name}" for name in feature_names],
        "ruin_intercept",
        *[f"ruin::{name}" for name in feature_names],
    ]


def factorize_round_summaries(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    summary_kind: Literal[
        "dynamic_law",
        "behavioral_fingerprint",
        "event_summary",
        "legacy_terminal_coeff",
    ] = "dynamic_law",
    max_rank: int = 3,
    bootstrap_samples: int = 4,
    summary_name: str | None = None,
) -> FactorizeRoundSummariesResult:
    if summary_kind == "dynamic_law":
        resolved_summary_name = summary_name or "round_dynamic_law_subspace_v1"
        factorization, summary_path, basis_path = factorize_round_dynamic_law_subspace(
            paths,
            round_ids=round_ids,
            max_rank=max_rank,
            summary_name=resolved_summary_name,
        )
    elif summary_kind == "behavioral_fingerprint":
        resolved_summary_name = summary_name or "round_behavioral_fingerprint_subspace_v1"
        factorization, summary_path, basis_path = factorize_round_behavioral_fingerprint_subspace(
            paths,
            round_ids=round_ids,
            max_rank=max_rank,
            bootstrap_samples=bootstrap_samples,
            summary_name=resolved_summary_name,
        )
    elif summary_kind == "event_summary":
        resolved_summary_name = summary_name or "round_event_summary_subspace_v1"
        factorization, summary_path, basis_path = factorize_round_event_summary_subspace(
            paths,
            round_ids=round_ids,
            max_rank=max_rank,
            summary_name=resolved_summary_name,
        )
    else:
        resolved_summary_name = summary_name or "round_regime_manifold_legacy_v1"
        manifold, summary_path, basis_path = factorize_round_regime_manifold(
            paths,
            round_ids=round_ids,
            max_rank=max_rank,
            summary_name=resolved_summary_name,
        )
        factorization = RoundSummaryFactorization(
            summary_kind="legacy_terminal_coeff",
            summary_names=_legacy_summary_names(manifold.feature_names),
            round_ids=manifold.round_ids,
            round_numbers=manifold.round_numbers,
            sample_counts=manifold.sample_counts,
            summary_matrix=manifold.coefficient_matrix,
            mean_vector=manifold.mean_vector,
            singular_values=manifold.singular_values,
            explained_variance_ratio=manifold.explained_variance_ratio,
            basis=manifold.basis,
            coordinates=manifold.coordinates,
            effective_rank=manifold.effective_rank,
        )
    leave_one_out_report = evaluate_factorization_leave_one_out(
        factorization,
        max_rank=max_rank,
    )
    leave_one_out_path = summary_path.with_name(f"{summary_path.stem}__loo.json")
    leave_one_out_path.write_text(
        json.dumps(to_jsonable(leave_one_out_report), indent=2),
        encoding="utf-8",
    )

    return FactorizeRoundSummariesResult(
        summary_kind=factorization.summary_kind,
        round_count=len(factorization.round_ids),
        effective_rank=factorization.effective_rank,
        summary_path=summary_path,
        basis_path=basis_path,
        leave_one_out_path=leave_one_out_path,
        factorization=factorization,
        leave_one_out_report=leave_one_out_report,
    )
