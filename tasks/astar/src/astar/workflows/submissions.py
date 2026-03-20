from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from astar.core.types import FloatArray
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.infra.api.client import AstarApiClient
from astar.infra.api.dto import StoredSubmissionRecord, SubmissionRequest
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    read_round_record,
    save_prediction_tensor,
    write_submission_record,
)
from astar.student.predictor.static_semantic import (
    build_static_semantic_prediction,
    default_static_semantic_config,
)
from astar.student.predictor.uniform import build_uniform_prediction
from astar.workflows.results import BuildSubmissionResult, SubmitPredictionResult


def persist_prediction_bundle(
    paths: WorkspacePaths,
    round_id: str,
    model_name: str,
    predictions_by_seed: Mapping[int, FloatArray],
) -> list[int]:
    saved_seed_indexes: list[int] = []
    for seed_index, prediction in sorted(predictions_by_seed.items()):
        save_prediction_tensor(paths.prediction_tensor_path(round_id, seed_index), prediction)
        record = StoredSubmissionRecord(
            created_at=datetime.now(UTC),
            model_name=model_name,
            request=SubmissionRequest(
                round_id=round_id,
                seed_index=seed_index,
                prediction=prediction.tolist(),
            ),
        )
        write_submission_record(paths, round_id, seed_index, record)
        saved_seed_indexes.append(seed_index)
    return saved_seed_indexes


def build_submission(
    paths: WorkspacePaths,
    round_id: str,
    model_name: str,
) -> BuildSubmissionResult:
    round_record = read_round_record(paths, round_id)
    round_detail = round_record.round
    prediction_paths: list[Path] = []
    submission_record_paths: list[Path] = []
    static_config = default_static_semantic_config()

    for seed_index, initial_state in enumerate(round_detail.initial_states):
        initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
        if model_name == "uniform":
            prediction = build_uniform_prediction(round_detail.map_height, round_detail.map_width)
        elif model_name == "static_semantic":
            prediction = build_static_semantic_prediction(initial_grid, static_config)
        else:
            msg = f"unsupported model: {model_name}"
            raise ValueError(msg)

        validate_prediction_tensor(
            prediction,
            SubmissionSpec(height=round_detail.map_height, width=round_detail.map_width),
        )
        prediction_path = save_prediction_tensor(
            paths.prediction_tensor_path(round_id, seed_index),
            prediction,
        )
        prediction_paths.append(prediction_path)

        record = StoredSubmissionRecord(
            created_at=datetime.now(UTC),
            model_name=model_name,
            request=SubmissionRequest(
                round_id=round_id,
                seed_index=seed_index,
                prediction=prediction.tolist(),
            ),
        )
        submission_record_paths.append(
            write_submission_record(paths, round_id, seed_index, record),
        )

    return BuildSubmissionResult(
        round_id=round_id,
        model_name=model_name,
        seeds_built=round_detail.seeds_count,
        prediction_paths=prediction_paths,
        submission_record_paths=submission_record_paths,
    )


def submit_saved_prediction(
    paths: WorkspacePaths,
    client: AstarApiClient,
    round_id: str,
    seed_index: int,
) -> SubmitPredictionResult:
    path = paths.raw_submission_dir(round_id) / f"seed_index={seed_index}.json"
    record = StoredSubmissionRecord.model_validate_json(path.read_text(encoding="utf-8"))
    response = client.submit_prediction(record.request)
    return SubmitPredictionResult(
        round_id=response.round_id,
        seed_index=response.seed_index,
        status=response.status,
        model_name=record.model_name,
        submission_record_path=path,
    )
