from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.history.summaries.manifold import RoundRegimeManifold, factorize_round_regime_manifold
from astar.infra.artifacts.paths import WorkspacePaths


class FactorizeRoundSummariesResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_count: int = Field(ge=1)
    effective_rank: int = Field(ge=1)
    summary_path: Path
    basis_path: Path
    manifold: RoundRegimeManifold


def factorize_round_summaries(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    max_rank: int = 3,
    summary_name: str = "round_regime_manifold_v1",
) -> FactorizeRoundSummariesResult:
    manifold, summary_path, basis_path = factorize_round_regime_manifold(
        paths,
        round_ids=round_ids,
        max_rank=max_rank,
        summary_name=summary_name,
    )
    return FactorizeRoundSummariesResult(
        round_count=len(manifold.round_ids),
        effective_rank=manifold.effective_rank,
        summary_path=summary_path,
        basis_path=basis_path,
        manifold=manifold,
    )
