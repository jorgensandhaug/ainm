#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = Path(
    "/home/anders/.openclaw/workspace/dev/ainm/tasks/tripletex/data/production/runs"
)
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "data" / "request_training_dataset"
REDACTED_VALUE = "REDACTED"
ATTACHMENT_PATH_KEYS = ("path", "file_path", "source_path", "relative_path", "abs_path")
ATTACHMENT_INLINE_KEYS = ("text", "content")


class IngestionError(Exception):
    pass


@dataclass
class RunResult:
    run_id: str
    status: str
    output_dir: str | None
    prompt_chars: int
    prompt_path: str | None
    sanitized_request_path: str | None
    record_path: str | None
    imported_source_artifacts: list[dict[str, Any]]
    skipped_source_artifacts: list[dict[str, Any]]
    copied_attachments: list[dict[str, Any]]
    skipped_attachments: list[dict[str, Any]]
    notes: list[str]
    errors: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest request-side Tripletex production runs into a training dataset."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Directory containing legacy production run directories. Default: {DEFAULT_SOURCE_ROOT}",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Destination dataset directory. Default: {DEFAULT_OUTPUT_ROOT}",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Remove the output directory before regenerating the dataset.",
    )
    return parser.parse_args()


def read_json(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise IngestionError(f"Missing required file: {path}") from exc
    except OSError as exc:
        raise IngestionError(f"Unable to read file {path}: {exc}") from exc

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise IngestionError(f"Invalid JSON in {path}: {exc}") from exc


def write_json(path: Path, data: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError as exc:
        raise IngestionError(f"Unable to write JSON file {path}: {exc}") from exc


def write_text(path: Path, content: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise IngestionError(f"Unable to write text file {path}: {exc}") from exc


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise IngestionError(f"Unable to hash file {path}: {exc}") from exc
    return digest.hexdigest()


def sanitize_request(raw_request: dict[str, Any]) -> dict[str, Any]:
    sanitized = json.loads(json.dumps(raw_request))
    credentials = sanitized.get("tripletex_credentials")
    if isinstance(credentials, dict):
        sanitized["tripletex_credentials"] = {
            key: REDACTED_VALUE if value is not None else None
            for key, value in credentials.items()
        }
    return sanitized


def ensure_string(value: Any, field_name: str, run_dir: Path) -> str:
    if not isinstance(value, str):
        raise IngestionError(f"{run_dir.name}: expected {field_name} to be a string")
    if not value.strip():
        raise IngestionError(f"{run_dir.name}: expected {field_name} to be non-empty")
    return value


def normalize_list(value: Any, field_name: str, run_dir: Path, notes: list[str]) -> list[Any]:
    if value is None:
        notes.append(f"{field_name} missing; defaulted to []")
        return []
    if not isinstance(value, list):
        raise IngestionError(f"{run_dir.name}: expected {field_name} to be a list")
    return value


def resolve_attachment_path(run_dir: Path, candidate: str) -> Path | None:
    raw_path = candidate.strip()
    if not raw_path:
        return None
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (run_dir / path).resolve()


def safe_attachment_name(base_name: str, index: int) -> str:
    cleaned = Path(base_name).name or f"attachment-{index}"
    ascii_only = "".join(char if char.isalnum() or char in "._-" else "_" for char in cleaned)
    return ascii_only or f"attachment-{index}"


def classify_skipped_source_artifact(relative_path: str) -> str:
    name = Path(relative_path).name
    if relative_path.startswith("scripts/"):
        return "response_side_generated_script"
    if name == "codex-prompt.txt":
        return "derived_launch_prompt_with_credentials"
    if name.startswith("launch-codex") and name.endswith(".zsh"):
        return "launch_wrapper"
    if name.startswith("codex-reflection."):
        return "response_side_reflection_artifact"
    if name.startswith("codex-trace."):
        return "response_side_trace_artifact"
    return "unclassified_non_request_artifact"


def attachment_path_points_to_generated_output(run_dir: Path, resolved_path: Path) -> bool:
    try:
        relative = resolved_path.relative_to(run_dir).as_posix()
    except ValueError:
        return False
    return relative.startswith("scripts/")


def materialize_declared_attachments(
    *,
    declared_entries: list[Any],
    declared_in: str,
    run_dir: Path,
    output_attachment_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[Path]]:
    copied: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    imported_source_files: list[Path] = []
    output_attachment_dir.mkdir(parents=True, exist_ok=True)

    for index, entry in enumerate(declared_entries):
        metadata: dict[str, Any] = {
            "declared_in": declared_in,
            "index": index,
            "entry_type": type(entry).__name__,
        }

        declared_name: str | None = None
        candidate_path: str | None = None
        inline_content: str | None = None

        if isinstance(entry, str):
            candidate_path = entry
            metadata["declared_path"] = entry
        elif isinstance(entry, dict):
            for key in ATTACHMENT_PATH_KEYS:
                value = entry.get(key)
                if isinstance(value, str) and value.strip():
                    candidate_path = value
                    metadata["declared_path"] = value
                    metadata["declared_path_key"] = key
                    break
            for key in ATTACHMENT_INLINE_KEYS:
                value = entry.get(key)
                if isinstance(value, str):
                    inline_content = value
                    metadata["inline_content_key"] = key
                    metadata["inline_content_chars"] = len(value)
                    break
            name_value = entry.get("name")
            if isinstance(name_value, str) and name_value.strip():
                declared_name = name_value.strip()
                metadata["name"] = declared_name
            mime_type = entry.get("mime_type") or entry.get("mimeType")
            if isinstance(mime_type, str) and mime_type.strip():
                metadata["mime_type"] = mime_type.strip()
        else:
            metadata["reason"] = "unsupported_attachment_entry_type"
            skipped.append(metadata)
            continue

        if candidate_path:
            resolved_path = resolve_attachment_path(run_dir, candidate_path)
            metadata["resolved_source_path"] = str(resolved_path) if resolved_path else None
            if resolved_path is None:
                metadata["reason"] = "empty_attachment_path"
                skipped.append(metadata)
                continue
            if attachment_path_points_to_generated_output(run_dir, resolved_path):
                metadata["reason"] = "attachment_points_to_generated_output"
                skipped.append(metadata)
                continue
            if not resolved_path.exists():
                metadata["reason"] = "attachment_source_missing"
                skipped.append(metadata)
                continue
            if not resolved_path.is_file():
                metadata["reason"] = "attachment_source_not_a_file"
                skipped.append(metadata)
                continue

            destination_name = safe_attachment_name(declared_name or resolved_path.name, index)
            destination_path = output_attachment_dir / destination_name
            collision_index = 1
            while destination_path.exists():
                destination_path = output_attachment_dir / f"{destination_path.stem}-{collision_index}{destination_path.suffix}"
                collision_index += 1

            try:
                shutil.copy2(resolved_path, destination_path)
            except OSError as exc:
                metadata["reason"] = f"attachment_copy_failed: {exc}"
                skipped.append(metadata)
                continue

            imported_source_files.append(resolved_path.resolve())
            copied.append(
                {
                    **metadata,
                    "source_kind": "filesystem",
                    "stored_as": str(destination_path),
                    "size_bytes": destination_path.stat().st_size,
                    "sha256": sha256_file(destination_path),
                }
            )
            continue

        if inline_content is not None:
            destination_name = safe_attachment_name(declared_name or f"{declared_in}-{index}.txt", index)
            destination_path = output_attachment_dir / destination_name
            collision_index = 1
            while destination_path.exists():
                destination_path = output_attachment_dir / f"{destination_path.stem}-{collision_index}{destination_path.suffix}"
                collision_index += 1

            write_text(destination_path, inline_content)
            copied.append(
                {
                    **metadata,
                    "source_kind": "inline_text",
                    "stored_as": str(destination_path),
                    "size_bytes": destination_path.stat().st_size,
                    "sha256": sha256_file(destination_path),
                }
            )
            continue

        metadata["reason"] = "attachment_entry_has_no_path_or_inline_content"
        skipped.append(metadata)

    if not copied:
        try:
            output_attachment_dir.rmdir()
        except OSError:
            pass

    return copied, skipped, imported_source_files


def import_run(run_dir: Path, output_root: Path) -> RunResult:
    notes: list[str] = []
    errors: list[str] = []
    imported_source_artifacts: list[dict[str, Any]] = []
    skipped_source_artifacts: list[dict[str, Any]] = []
    copied_attachments: list[dict[str, Any]] = []
    skipped_attachments: list[dict[str, Any]] = []

    try:
        request_path = run_dir / "request.json"
        manifest_path = run_dir / "manifest.json"
        raw_request = read_json(request_path)
        raw_manifest = read_json(manifest_path)

        if not isinstance(raw_request, dict):
            raise IngestionError(f"{run_dir.name}: request.json must contain an object")
        if not isinstance(raw_manifest, dict):
            raise IngestionError(f"{run_dir.name}: manifest.json must contain an object")

        prompt_text = ensure_string(raw_request.get("prompt"), "request.prompt", run_dir)
        request_files = normalize_list(raw_request.get("files"), "request.files", run_dir, notes)
        manifest_attachments = normalize_list(
            raw_manifest.get("attachments"), "manifest.attachments", run_dir, notes
        )

        manifest_run_id = ensure_string(raw_manifest.get("run_id"), "manifest.run_id", run_dir)
        if manifest_run_id != run_dir.name:
            raise IngestionError(
                f"{run_dir.name}: manifest run_id {manifest_run_id} does not match directory name"
            )

        output_run_dir = output_root / "runs" / run_dir.name
        output_run_dir.mkdir(parents=True, exist_ok=True)
        sanitized_request_path = output_run_dir / "request.sanitized.json"
        prompt_output_path = output_run_dir / "prompt.txt"
        record_path = output_run_dir / "record.json"

        sanitized_request = sanitize_request(raw_request)
        write_json(sanitized_request_path, sanitized_request)
        write_text(prompt_output_path, prompt_text + "\n")

        imported_source_artifacts.extend(
            [
                {"path": str(request_path), "reason": "request_payload"},
                {"path": str(manifest_path), "reason": "run_metadata"},
            ]
        )

        request_attachment_dir = output_run_dir / "attachments"
        request_copied, request_skipped, request_imported_paths = materialize_declared_attachments(
            declared_entries=request_files,
            declared_in="request.files",
            run_dir=run_dir,
            output_attachment_dir=request_attachment_dir,
        )
        manifest_copied, manifest_skipped, manifest_imported_paths = materialize_declared_attachments(
            declared_entries=manifest_attachments,
            declared_in="manifest.attachments",
            run_dir=run_dir,
            output_attachment_dir=request_attachment_dir,
        )
        copied_attachments.extend(request_copied)
        copied_attachments.extend(manifest_copied)
        skipped_attachments.extend(request_skipped)
        skipped_attachments.extend(manifest_skipped)

        imported_source_files = {path.resolve() for path in request_imported_paths + manifest_imported_paths}
        for attachment_source_path in sorted(imported_source_files):
            imported_source_artifacts.append(
                {
                    "path": str(attachment_source_path),
                    "reason": "request_attachment_source",
                }
            )

        record = {
            "run_id": manifest_run_id,
            "created_at": raw_manifest.get("created_at"),
            "storage_mode": raw_manifest.get("storage_mode"),
            "prompt_text": prompt_text,
            "prompt_chars": len(prompt_text),
            "source": {
                "source_run_path": str(run_dir),
                "request_json_path": str(request_path),
                "manifest_json_path": str(manifest_path),
                "manifest_run_dir": raw_manifest.get("run_dir"),
            },
            "request_metadata": {
                "files_declared_count": len(request_files),
                "manifest_attachments_declared_count": len(manifest_attachments),
                "tripletex_credentials_present": isinstance(
                    raw_request.get("tripletex_credentials"), dict
                ),
                "credentials_source": raw_manifest.get("credentials_source"),
                "request_schema_notes": notes,
            },
            "imported_source_artifacts": imported_source_artifacts,
            "copied_attachments": copied_attachments,
            "skipped_attachments": skipped_attachments,
            "sanitized_request_json": str(sanitized_request_path),
            "prompt_text_file": str(prompt_output_path),
        }
        write_json(record_path, record)

        imported_relatives = {
            "request.json",
            "manifest.json",
        }
        for imported_path in imported_source_files:
            try:
                imported_relatives.add(imported_path.relative_to(run_dir).as_posix())
            except ValueError:
                continue

        for source_file in sorted(path for path in run_dir.rglob("*") if path.is_file()):
            relative_path = source_file.relative_to(run_dir).as_posix()
            if relative_path in imported_relatives:
                continue
            skipped_source_artifacts.append(
                {
                    "path": str(source_file),
                    "reason": classify_skipped_source_artifact(relative_path),
                }
            )

        return RunResult(
            run_id=manifest_run_id,
            status="imported",
            output_dir=str(output_run_dir),
            prompt_chars=len(prompt_text),
            prompt_path=str(prompt_output_path),
            sanitized_request_path=str(sanitized_request_path),
            record_path=str(record_path),
            imported_source_artifacts=imported_source_artifacts,
            skipped_source_artifacts=skipped_source_artifacts,
            copied_attachments=copied_attachments,
            skipped_attachments=skipped_attachments,
            notes=notes,
            errors=errors,
        )
    except IngestionError as exc:
        errors.append(str(exc))
        return RunResult(
            run_id=run_dir.name,
            status="failed",
            output_dir=None,
            prompt_chars=0,
            prompt_path=None,
            sanitized_request_path=None,
            record_path=None,
            imported_source_artifacts=imported_source_artifacts,
            skipped_source_artifacts=skipped_source_artifacts,
            copied_attachments=copied_attachments,
            skipped_attachments=skipped_attachments,
            notes=notes,
            errors=errors,
        )


def create_dataset_readme(output_root: Path) -> None:
    readme = """# Request Training Dataset

This dataset is generated by `scripts/ingest_request_dataset.py`.

Contents:
- `index.jsonl`: one request-side training record per imported run.
- `summary.json`: corpus-level import report, including skipped artifacts and schema notes.
- `runs/<run_id>/prompt.txt`: the original user prompt from `request.json`.
- `runs/<run_id>/request.sanitized.json`: request JSON with Tripletex credentials redacted.
- `runs/<run_id>/record.json`: per-run metadata, imported artifacts, and attachment handling details.

Excluded on purpose:
- `codex-prompt.txt`: derived launch prompt that includes credentials.
- `launch-codex*.zsh`: execution wrappers.
- `codex-reflection.*`: response-side reflection artifacts.
- `codex-trace.*`: response-side interaction traces.
- `scripts/*`: generated implementation output from the agent run.
"""
    write_text(output_root / "README.md", readme)


def ingest(source_root: Path, output_root: Path, force: bool) -> dict[str, Any]:
    if not source_root.exists():
        raise IngestionError(f"Source root does not exist: {source_root}")
    if not source_root.is_dir():
        raise IngestionError(f"Source root is not a directory: {source_root}")

    if output_root.exists():
        if not force:
            raise IngestionError(
                f"Output root already exists: {output_root}. Re-run with --force to replace it."
            )
        try:
            shutil.rmtree(output_root)
        except OSError as exc:
            raise IngestionError(f"Unable to remove existing output directory {output_root}: {exc}") from exc

    try:
        output_root.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        raise IngestionError(f"Unable to create output directory {output_root}: {exc}") from exc

    run_dirs = sorted(path for path in source_root.iterdir() if path.is_dir())
    results = [import_run(run_dir, output_root) for run_dir in run_dirs]

    index_path = output_root / "index.jsonl"
    skipped_reason_counter: Counter[str] = Counter()
    request_schema_variations: dict[str, list[str]] = {
        "missing_request_files_key_runs": [],
    }

    with index_path.open("w", encoding="utf-8") as handle:
        for result in results:
            for skipped in result.skipped_source_artifacts:
                skipped_reason_counter.update([skipped["reason"]])
            if "request.files missing; defaulted to []" in result.notes:
                request_schema_variations["missing_request_files_key_runs"].append(result.run_id)
            if result.status != "imported":
                continue
            payload = {
                "run_id": result.run_id,
                "prompt_text": Path(result.prompt_path).read_text(encoding="utf-8").rstrip("\n")
                if result.prompt_path
                else "",
                "prompt_chars": result.prompt_chars,
                "record_path": result.record_path,
                "sanitized_request_path": result.sanitized_request_path,
                "copied_attachments": result.copied_attachments,
                "notes": result.notes,
            }
            handle.write(json.dumps(payload, sort_keys=True) + "\n")

    create_dataset_readme(output_root)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(source_root),
        "output_root": str(output_root),
        "runs_discovered": len(run_dirs),
        "runs_imported": sum(1 for result in results if result.status == "imported"),
        "runs_failed": sum(1 for result in results if result.status == "failed"),
        "attachment_files_copied": sum(len(result.copied_attachments) for result in results),
        "attachment_entries_skipped": sum(len(result.skipped_attachments) for result in results),
        "skipped_source_artifact_reason_counts": dict(sorted(skipped_reason_counter.items())),
        "request_schema_variations": request_schema_variations,
        "imported_runs": [
            {
                "run_id": result.run_id,
                "output_dir": result.output_dir,
                "prompt_chars": result.prompt_chars,
                "prompt_path": result.prompt_path,
                "sanitized_request_path": result.sanitized_request_path,
                "record_path": result.record_path,
                "copied_attachment_count": len(result.copied_attachments),
                "skipped_attachment_count": len(result.skipped_attachments),
                "notes": result.notes,
            }
            for result in results
            if result.status == "imported"
        ],
        "failed_runs": [
            {
                "run_id": result.run_id,
                "errors": result.errors,
                "notes": result.notes,
            }
            for result in results
            if result.status == "failed"
        ],
        "skipped_source_artifacts": [
            {
                "run_id": result.run_id,
                "artifacts": result.skipped_source_artifacts,
            }
            for result in results
            if result.skipped_source_artifacts
        ],
    }
    write_json(output_root / "summary.json", summary)
    return summary


def print_summary(summary: dict[str, Any]) -> None:
    print(f"Source root: {summary['source_root']}")
    print(f"Output root: {summary['output_root']}")
    print(f"Runs discovered: {summary['runs_discovered']}")
    print(f"Runs imported: {summary['runs_imported']}")
    print(f"Runs failed: {summary['runs_failed']}")
    print(f"Attachment files copied: {summary['attachment_files_copied']}")
    print(f"Attachment entries skipped: {summary['attachment_entries_skipped']}")

    missing_files_key_runs = summary["request_schema_variations"]["missing_request_files_key_runs"]
    if missing_files_key_runs:
        print(
            "Schema variations: request.files missing in "
            f"{len(missing_files_key_runs)} run(s): {', '.join(missing_files_key_runs)}"
        )
    else:
        print("Schema variations: none")

    print("Imported runs:")
    for run in summary["imported_runs"]:
        notes = "; ".join(run["notes"]) if run["notes"] else "none"
        print(
            f"  - {run['run_id']}: prompt_chars={run['prompt_chars']}, "
            f"attachments={run['copied_attachment_count']}, notes={notes}"
        )

    print("Skipped source artifact reasons:")
    for reason, count in summary["skipped_source_artifact_reason_counts"].items():
        print(f"  - {reason}: {count}")

    if summary["failed_runs"]:
        print("Failed runs:")
        for run in summary["failed_runs"]:
            print(f"  - {run['run_id']}: {'; '.join(run['errors'])}")


def main() -> int:
    args = parse_args()
    try:
        summary = ingest(args.source_root.resolve(), args.output_root.resolve(), args.force)
    except IngestionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print_summary(summary)
    return 1 if summary["runs_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
