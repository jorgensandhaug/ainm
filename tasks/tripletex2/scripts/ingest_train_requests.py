#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = Path(
    "/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs"
)
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "train_requests"
REDACTED_VALUE = "REDACTED"


class IngestError(Exception):
    """Raised when a run cannot be converted safely."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Tripletex production runs into flat train_requests JSON files."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Source directory containing production run folders. Default: {DEFAULT_SOURCE_ROOT}",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Destination directory for flat JSON files. Default: {DEFAULT_OUTPUT_ROOT}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        written_files, removed_files = ingest_runs(
            source_root=args.source_root.resolve(),
            output_root=args.output_root.resolve(),
        )
    except IngestError as exc:
        print(f"ingestion failed: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"filesystem error: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {written_files} train request file(s) to {args.output_root.resolve()}")
    print(f"Removed {removed_files} stale file(s)")
    return 0


def ingest_runs(*, source_root: Path, output_root: Path) -> tuple[int, int]:
    validate_directory(source_root, "source root")

    run_dirs = sorted(path for path in source_root.iterdir() if path.is_dir())
    if not run_dirs:
        raise IngestError(f"no run directories found under {source_root}")

    output_payloads: dict[str, dict[str, Any]] = {}
    errors: list[str] = []

    for run_dir in run_dirs:
        try:
            output_payloads[run_dir.name] = build_output_payload(run_dir)
        except IngestError as exc:
            errors.append(f"{run_dir.name}: {exc}")

    if errors:
        raise IngestError("\n".join(errors))

    ensure_output_directory(output_root)

    for run_id, payload in output_payloads.items():
        output_path = output_root / f"{run_id}.json"
        write_json(output_path, payload)

    removed_files = remove_stale_output_files(output_root, expected_run_ids=set(output_payloads))
    return len(output_payloads), removed_files


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
    validate_files_field(request_payload.get("files"), request_path)

    credentials = request_payload.get("tripletex_credentials")
    if not isinstance(credentials, dict):
        raise IngestError(f"{request_path}: tripletex_credentials must be an object")

    require_credential_field(credentials, "base_url", request_path)
    require_credential_field(credentials, "session_token", request_path)

    return {
        "prompt": prompt,
        "files": [],
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


def validate_files_field(value: Any, request_path: Path) -> None:
    if value is None:
        return
    if not isinstance(value, list):
        raise IngestError(f"{request_path}: files must be a list, null, or omitted")


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
