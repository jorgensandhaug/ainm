#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOTS = (
    Path("/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs"),
    Path("/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/testing/runs"),
)
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "train_requests"
REDACTED_VALUE = "REDACTED"


class IngestError(Exception):
    """Raised when a run cannot be converted safely."""


@dataclass(frozen=True)
class RunRecord:
    source_root: Path
    run_dir: Path

    @property
    def run_id(self) -> str:
        return self.run_dir.name


@dataclass
class UniquePayloadRecord:
    payload: dict[str, Any]
    payload_key: str
    source_run_ids: list[str] = field(default_factory=list)

    @property
    def canonical_run_id(self) -> str:
        return min(self.source_run_ids)


@dataclass(frozen=True)
class IngestStats:
    source_root_count: int
    scanned_runs: int
    written_files: int
    removed_files: int
    duplicate_runs: int
    duplicate_groups: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Tripletex runs into flat train_requests JSON files."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        action="append",
        dest="source_roots",
        help=(
            "Source directory containing run folders. Repeat to ingest multiple roots. "
            f"Defaults to: {', '.join(str(path) for path in DEFAULT_SOURCE_ROOTS)}"
        ),
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Destination directory for flat JSON files. Default: {DEFAULT_OUTPUT_ROOT}",
    )
    args = parser.parse_args()
    args.source_roots = args.source_roots or list(DEFAULT_SOURCE_ROOTS)
    return args


def main() -> int:
    args = parse_args()

    try:
        stats = ingest_runs(
            source_roots=[source_root.resolve() for source_root in args.source_roots],
            output_root=args.output_root.resolve(),
        )
    except IngestError as exc:
        print(f"ingestion failed: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"filesystem error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Scanned {stats.scanned_runs} run(s) across {stats.source_root_count} source root(s)"
    )
    print(f"Wrote {stats.written_files} train request file(s) to {args.output_root.resolve()}")
    print(
        f"Collapsed {stats.duplicate_runs} duplicate run(s) across "
        f"{stats.duplicate_groups} payload group(s)"
    )
    print(f"Removed {stats.removed_files} stale file(s)")
    return 0


def ingest_runs(*, source_roots: list[Path], output_root: Path) -> IngestStats:
    normalized_source_roots = normalize_source_roots(source_roots)
    run_records = collect_run_records(normalized_source_roots)

    unique_payloads: dict[str, UniquePayloadRecord] = {}
    errors: list[str] = []

    for run_record in run_records:
        try:
            payload = build_output_payload(run_record.run_dir)
        except IngestError as exc:
            errors.append(f"{run_record.run_id}: {exc}")
            continue

        payload_key = serialize_payload(payload)
        unique_record = unique_payloads.get(payload_key)
        if unique_record is None:
            unique_payloads[payload_key] = UniquePayloadRecord(
                payload=payload,
                payload_key=payload_key,
                source_run_ids=[run_record.run_id],
            )
            continue

        unique_record.source_run_ids.append(run_record.run_id)

    if errors:
        raise IngestError("\n".join(errors))

    ensure_output_directory(output_root)

    canonical_output_payloads = assign_output_payloads(unique_payloads.values())

    for run_id, payload in canonical_output_payloads.items():
        write_json(output_root / f"{run_id}.json", payload)

    removed_files = remove_stale_output_files(
        output_root,
        expected_run_ids=set(canonical_output_payloads),
    )
    duplicate_runs = len(run_records) - len(canonical_output_payloads)
    duplicate_groups = sum(
        1 for record in unique_payloads.values() if len(record.source_run_ids) > 1
    )
    return IngestStats(
        source_root_count=len(normalized_source_roots),
        scanned_runs=len(run_records),
        written_files=len(canonical_output_payloads),
        removed_files=removed_files,
        duplicate_runs=duplicate_runs,
        duplicate_groups=duplicate_groups,
    )


def normalize_source_roots(source_roots: list[Path]) -> list[Path]:
    if not source_roots:
        raise IngestError("at least one source root is required")

    unique_roots: list[Path] = []
    seen_roots: set[Path] = set()
    for source_root in source_roots:
        if source_root in seen_roots:
            continue
        validate_directory(source_root, "source root")
        seen_roots.add(source_root)
        unique_roots.append(source_root)
    return unique_roots


def collect_run_records(source_roots: list[Path]) -> list[RunRecord]:
    run_records: list[RunRecord] = []
    seen_run_ids: dict[str, Path] = {}

    for source_root in source_roots:
        run_dirs = sorted(path for path in source_root.iterdir() if path.is_dir())
        if not run_dirs:
            raise IngestError(f"no run directories found under {source_root}")

        for run_dir in run_dirs:
            existing_path = seen_run_ids.get(run_dir.name)
            if existing_path is not None:
                raise IngestError(
                    "duplicate run id found across source roots: "
                    f"{run_dir.name} in {existing_path.parent} and {source_root}"
                )
            seen_run_ids[run_dir.name] = run_dir
            run_records.append(RunRecord(source_root=source_root, run_dir=run_dir))

    return sorted(run_records, key=lambda record: (record.run_id, str(record.source_root)))


def assign_output_payloads(
    unique_payloads: list[UniquePayloadRecord],
) -> dict[str, dict[str, Any]]:
    assigned_run_ids: dict[str, dict[str, Any]] = {}
    for record in sorted(
        unique_payloads,
        key=lambda item: (item.canonical_run_id, item.payload_key),
    ):
        canonical_run_id = record.canonical_run_id
        if canonical_run_id in assigned_run_ids:
            raise IngestError(
                f"canonical output filename collision for run id {canonical_run_id}"
            )
        assigned_run_ids[canonical_run_id] = record.payload
    return assigned_run_ids


def validate_directory(path: Path, label: str) -> None:
    if not path.exists():
        raise IngestError(f"{label} does not exist: {path}")
    if not path.is_dir():
        raise IngestError(f"{label} is not a directory: {path}")


def ensure_output_directory(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise IngestError(f"unable to create output directory {path}: {exc}") from exc
    if not path.is_dir():
        raise IngestError(f"output root is not a directory: {path}")


def build_output_payload(run_dir: Path) -> dict[str, Any]:
    request_path = run_dir / "request.json"
    request_payload = load_json_object(request_path)

    prompt = require_non_empty_string(request_payload.get("prompt"), "prompt")
    files = sanitize_files_field(request_payload.get("files"), request_path)

    credentials = request_payload.get("tripletex_credentials")
    if not isinstance(credentials, dict):
        raise IngestError(f"{request_path}: tripletex_credentials must be an object")

    require_credential_field(credentials, "base_url", request_path)
    require_credential_field(credentials, "session_token", request_path)

    return {
        "prompt": prompt,
        "files": files,
        "tripletex_credentials": {
            "base_url": REDACTED_VALUE,
            "session_token": REDACTED_VALUE,
        },
    }


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        raw_text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise IngestError(f"missing required file: {path}") from exc
    except OSError as exc:
        raise IngestError(f"unable to read {path}: {exc}") from exc

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise IngestError(f"invalid JSON in {path}: {exc}") from exc

    if not isinstance(payload, dict):
        raise IngestError(f"{path}: expected a JSON object")
    return payload


def require_non_empty_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise IngestError(f"{field_name} must be a string")
    if not value.strip():
        raise IngestError(f"{field_name} must be non-empty")
    return value


def sanitize_files_field(value: Any, request_path: Path) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise IngestError(f"{request_path}: files must be a list, null, or omitted")
    sanitized_files: list[dict[str, Any]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict):
            raise IngestError(f"{request_path}: files[{index}] must be an object")
        sanitized_files.append(clone_json_object(entry, f"{request_path}: files[{index}]"))
    return sanitized_files


def clone_json_object(value: dict[str, Any], field_name: str) -> dict[str, Any]:
    cloned: dict[str, Any] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise IngestError(f"{field_name}: object keys must be strings")
        cloned[key] = clone_json_value(item, f"{field_name}.{key}")
    return cloned


def clone_json_value(value: Any, field_name: str) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [clone_json_value(item, f"{field_name}[{index}]") for index, item in enumerate(value)]
    if isinstance(value, dict):
        return clone_json_object(value, field_name)
    raise IngestError(f"{field_name}: unsupported JSON value type {type(value).__name__}")


def require_string_or_null(value: Any, field_name: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise IngestError(f"{field_name} must be a string or null")


def require_credential_field(credentials: dict[str, Any], key: str, request_path: Path) -> None:
    if key not in credentials:
        raise IngestError(f"{request_path}: tripletex_credentials.{key} is missing")
    require_string_or_null(credentials[key], f"{request_path}: tripletex_credentials.{key}")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    try:
        path.write_text(serialized, encoding="utf-8")
    except OSError as exc:
        raise IngestError(f"unable to write {path}: {exc}") from exc


def serialize_payload(payload: dict[str, Any]) -> str:
    try:
        return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        raise IngestError(f"unable to serialize sanitized payload: {exc}") from exc


def remove_stale_output_files(output_root: Path, *, expected_run_ids: set[str]) -> int:
    removed_files = 0
    for candidate in sorted(output_root.glob("*.json")):
        if candidate.stem in expected_run_ids:
            continue
        try:
            candidate.unlink()
        except OSError as exc:
            raise IngestError(f"unable to remove stale output file {candidate}: {exc}") from exc
        removed_files += 1
    return removed_files


if __name__ == "__main__":
    sys.exit(main())
