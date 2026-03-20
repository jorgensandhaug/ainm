from __future__ import annotations

from datetime import UTC
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from astar.api.schemas import (
    StoredAnalysisRecord,
    StoredQueryRecord,
    StoredReplayRecord,
    StoredRoundRecord,
    StoredSubmissionRecord,
)
from astar.storage.manifests import RepoPaths


class QueryFileRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    path: Path
    record: StoredQueryRecord


class ReplayFileRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    path: Path
    record: StoredReplayRecord


def _write_json(path: Path, payload: BaseModel) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    return path


def _replay_filename(record: StoredReplayRecord) -> str:
    timestamp = record.requested_at.astimezone(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    return (
        f"{timestamp}"
        f"__sim_seed={record.response.sim_seed}"
        f"__capture_id={record.capture_id}.json"
    )


def write_round_record(paths: RepoPaths, record: StoredRoundRecord) -> Path:
    return _write_json(paths.raw_round_path(record.round.id), record)


def read_round_record(paths: RepoPaths, round_id: str) -> StoredRoundRecord:
    return StoredRoundRecord.model_validate_json(
        paths.raw_round_path(round_id).read_text(encoding="utf-8"),
    )


def write_query_record(paths: RepoPaths, round_id: str, record: StoredQueryRecord) -> Path:
    path = paths.raw_query_dir(round_id) / f"{record.query_id}.json"
    return _write_json(path, record)


def read_query_records(paths: RepoPaths, round_id: str) -> list[QueryFileRecord]:
    query_dir = paths.raw_query_dir(round_id)
    if not query_dir.exists():
        return []
    records: list[QueryFileRecord] = []
    for path in sorted(query_dir.glob("*.json")):
        record = StoredQueryRecord.model_validate_json(path.read_text(encoding="utf-8"))
        records.append(QueryFileRecord(path=path, record=record))
    return records


def write_replay_record(paths: RepoPaths, record: StoredReplayRecord) -> Path:
    replay_dir = paths.raw_replay_dir(record.request.round_id, record.request.seed_index)
    path = replay_dir / _replay_filename(record)
    return _write_json(path, record)


def read_replay_records(
    paths: RepoPaths,
    round_id: str,
    seed_index: int,
) -> list[ReplayFileRecord]:
    replay_dir = paths.raw_replay_dir(round_id, seed_index)
    if not replay_dir.exists():
        return []
    records: list[ReplayFileRecord] = []
    for path in sorted(replay_dir.glob("*.json")):
        record = StoredReplayRecord.model_validate_json(path.read_text(encoding="utf-8"))
        records.append(ReplayFileRecord(path=path, record=record))
    return records


def write_submission_record(
    paths: RepoPaths,
    round_id: str,
    seed_index: int,
    record: StoredSubmissionRecord,
) -> Path:
    path = paths.raw_submission_dir(round_id) / f"seed_index={seed_index}.json"
    return _write_json(path, record)


def read_submission_record(
    paths: RepoPaths,
    round_id: str,
    seed_index: int,
) -> StoredSubmissionRecord:
    path = paths.raw_submission_dir(round_id) / f"seed_index={seed_index}.json"
    return StoredSubmissionRecord.model_validate_json(path.read_text(encoding="utf-8"))


def read_submission_records(paths: RepoPaths, round_id: str) -> dict[int, StoredSubmissionRecord]:
    submission_dir = paths.raw_submission_dir(round_id)
    if not submission_dir.exists():
        return {}
    records: dict[int, StoredSubmissionRecord] = {}
    for path in sorted(submission_dir.glob("seed_index=*.json")):
        seed_index = int(path.stem.split("=", 1)[1])
        records[seed_index] = StoredSubmissionRecord.model_validate_json(
            path.read_text(encoding="utf-8"),
        )
    return records


def write_analysis_record(
    paths: RepoPaths,
    round_id: str,
    seed_index: int,
    record: StoredAnalysisRecord,
) -> Path:
    path = paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"
    return _write_json(path, record)


def read_analysis_record(paths: RepoPaths, round_id: str, seed_index: int) -> StoredAnalysisRecord:
    path = paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"
    return StoredAnalysisRecord.model_validate_json(path.read_text(encoding="utf-8"))


def read_analysis_records(paths: RepoPaths, round_id: str) -> dict[int, StoredAnalysisRecord]:
    analysis_dir = paths.raw_analysis_dir(round_id)
    if not analysis_dir.exists():
        return {}
    records: dict[int, StoredAnalysisRecord] = {}
    for path in sorted(analysis_dir.glob("seed_index=*.json")):
        seed_index = int(path.stem.split("=", 1)[1])
        records[seed_index] = StoredAnalysisRecord.model_validate_json(
            path.read_text(encoding="utf-8"),
        )
    return records
