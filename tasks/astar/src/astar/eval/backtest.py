from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.score import ScoreBreakdown, score_prediction
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_prediction_tensor, read_analysis_records


class BacktestSeedResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    score_breakdown: ScoreBreakdown


class BacktestRoundResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    seed_results: list[BacktestSeedResult]

    @property
    def mean_score(self) -> float:
        if not self.seed_results:
            return 0.0
        return float(np.mean([item.score_breakdown.score for item in self.seed_results]))


def backtest_round_from_saved_analyses(
    paths: WorkspacePaths,
    round_id: str,
) -> BacktestRoundResult:
    analyses = read_analysis_records(paths, round_id)
    seed_results = []
    for seed_index, record in sorted(analyses.items()):
        prediction_path = paths.prediction_tensor_path(round_id, seed_index)
        prediction = load_prediction_tensor(prediction_path)
        ground_truth = np.asarray(record.analysis.ground_truth, dtype=np.float64)
        seed_results.append(
            BacktestSeedResult(
                round_id=round_id,
                seed_index=seed_index,
                score_breakdown=score_prediction(ground_truth, prediction),
            ),
        )
    return BacktestRoundResult(round_id=round_id, seed_results=seed_results)
