from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np

from astar.core.terrain import CLASS_COUNT, collapse_internal_grid
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.infra.api.dto import AnalysisResponse, StoredAnalysisRecord, StoredRoundRecord
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import write_analysis_record, write_round_record
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.workflows.visualize_model_prediction import visualize_model_prediction
from tests.conftest import ROUND_ID

TRAIN_ROUND_ID = "00000000-0000-0000-0000-000000000002"


def _copy_round(sample_paths: RepoPaths, source_round_id: str, target_round_id: str) -> None:
    payload = json.loads(sample_paths.raw_round_path(source_round_id).read_text(encoding="utf-8"))
    payload["round"]["id"] = target_round_id
    record = StoredRoundRecord.model_validate(payload)
    write_round_record(sample_paths, record)


def _write_sample_analysis(paths: RepoPaths, *, round_id: str, seed_index: int) -> None:
    round_record = json.loads(paths.raw_round_path(round_id).read_text(encoding="utf-8"))
    initial_grid = np.asarray(
        round_record["round"]["initial_states"][seed_index]["grid"],
        dtype=np.int64,
    )
    collapsed = collapse_internal_grid(initial_grid)
    ground_truth = np.zeros(
        (collapsed.shape[0], collapsed.shape[1], CLASS_COUNT),
        dtype=np.float64,
    )
    for class_index in range(CLASS_COUNT):
        ground_truth[:, :, class_index] = collapsed == class_index

    record = StoredAnalysisRecord(
        fetched_at=datetime.now(UTC),
        round_id=round_id,
        seed_index=seed_index,
        analysis=AnalysisResponse(
            prediction=None,
            ground_truth=ground_truth.tolist(),
            score=12.5,
            width=collapsed.shape[1],
            height=collapsed.shape[0],
            initial_grid=initial_grid.tolist(),
        ),
    )
    write_analysis_record(paths, round_id, seed_index, record)


def test_historical_bucket_prior_predictor_trains_and_predicts(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)

    predictor = HistoricalBucketPriorPredictor.fit_from_workspace(sample_paths)
    round_record = StoredRoundRecord.model_validate_json(
        sample_paths.raw_round_path(ROUND_ID).read_text(encoding="utf-8"),
    )
    bundle = predictor.build_prediction_bundle(round_record.round, None)
    prediction = bundle.predictions_by_seed[0]
    diagnostics = predictor.build_seed_diagnostics(round_record.round, 0)

    validate_prediction_tensor(
        prediction,
        SubmissionSpec(height=round_record.round.map_height, width=round_record.round.map_width),
    )
    assert prediction.shape == (round_record.round.map_height, round_record.round.map_width, 6)
    assert np.allclose(prediction.sum(axis=-1), 1.0)
    assert int(np.max(diagnostics.full_bucket_count)) > 0
    assert int(np.max(diagnostics.support_level)) >= 1


def test_visualize_model_prediction_for_historical_bucket_prior(sample_paths: RepoPaths) -> None:
    _copy_round(sample_paths, ROUND_ID, TRAIN_ROUND_ID)
    _write_sample_analysis(sample_paths, round_id=TRAIN_ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)

    result = visualize_model_prediction(
        sample_paths,
        ROUND_ID,
        0,
        "historical_bucket_prior",
    )

    assert result.report_key == "model_prediction_comparison"
    assert result.manifest_path.exists()
    assert set(result.figure_paths) == {
        "initial_map",
        "classwise_comparison",
        "prediction_atlas",
        "ground_truth_atlas",
        "residual_atlas",
        "entropy_comparison",
        "kl_divergence",
        "terrain_bucket_count",
        "structural_bucket_count",
        "full_bucket_count",
        "support_level",
    }
    assert all(path.exists() for path in result.figure_paths.values())
