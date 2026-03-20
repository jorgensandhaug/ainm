from __future__ import annotations

from datetime import UTC, datetime

import numpy as np

from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import StoredAnalysisRecord
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import save_analysis_tensor, write_analysis_record
from astar.workflows.results import FetchAnalysisResult


def fetch_analysis(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    seed_index: int,
) -> FetchAnalysisResult:
    analysis = client.get_analysis(round_id, seed_index)
    record = StoredAnalysisRecord(
        fetched_at=datetime.now(UTC),
        round_id=round_id,
        seed_index=seed_index,
        analysis=analysis,
    )
    raw_path = write_analysis_record(paths, round_id, seed_index, record)
    tensor_path = save_analysis_tensor(
        paths.analysis_tensor_path(round_id, seed_index),
        (
            np.asarray(analysis.prediction, dtype=np.float64)
            if analysis.prediction is not None
            else None
        ),
        np.asarray(analysis.ground_truth, dtype=np.float64),
    )
    return FetchAnalysisResult(
        round_id=round_id,
        seed_index=seed_index,
        width=analysis.width,
        height=analysis.height,
        score=analysis.score,
        raw_path=raw_path,
        tensor_path=tensor_path,
    )
