#!/usr/bin/env python3
"""Deduplicate and curate Tripletex request examples for training use."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
TASK_ROOT = SCRIPT_PATH.parent.parent
DEFAULT_INPUT_ROOT = (TASK_ROOT.parent / "tripletex" / "data" / "production" / "runs").resolve()
DEFAULT_OUTPUT_ROOT = (TASK_ROOT / "data" / "curated" / "request_dataset_v1").resolve()
SCHEMA_VERSION = 1


class CurateError(Exception):
    """Raised when the request corpus cannot be curated safely."""


@dataclass(frozen=True)
class SourceRecord:
    run_id: str
    created_at: str | None
    request_path: str
    manifest_path: str | None
    prompt: str
    prompt_normalized: str
    files: tuple[dict[str, Any], ...]
    fingerprint: str
    example_id: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Curate and deduplicate Tripletex production request examples."
    )
    parser.add_argument(
        "--input-root",
        type=Path,
        default=DEFAULT_INPUT_ROOT,
        help=f"Directory containing run subdirectories. Default: {DEFAULT_INPUT_ROOT}",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Directory where curated artifacts will be written. Default: {DEFAULT_OUTPUT_ROOT}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        curate_dataset(args.input_root.resolve(), args.output_root.resolve())
    except CurateError as exc:
        print(f"curation failed: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"filesystem error: {exc}", file=sys.stderr)
        return 1
    return 0


def curate_dataset(input_root: Path, output_root: Path) -> None:
    validate_input_root(input_root)
    source_records = load_source_records(input_root)
    grouped_records = group_by_fingerprint(source_records)
    curated_examples = build_curated_examples(grouped_records)
    duplicate_groups = build_duplicate_groups(grouped_records)
    source_index = build_source_index(source_records)
    manifest = build_manifest(input_root, output_root, source_records, curated_examples, duplicate_groups)
    report = build_report(input_root, output_root, source_records, curated_examples, duplicate_groups, manifest)
    write_outputs(output_root, curated_examples, duplicate_groups, source_index, manifest, report)


def validate_input_root(input_root: Path) -> None:
    if not input_root.exists():
        raise CurateError(f"input root does not exist: {input_root}")
    if not input_root.is_dir():
        raise CurateError(f"input root is not a directory: {input_root}")


def load_source_records(input_root: Path) -> list[SourceRecord]:
    run_dirs = sorted(path for path in input_root.iterdir() if path.is_dir())
    if not run_dirs:
        raise CurateError(f"no run directories found under {input_root}")

    records: list[SourceRecord] = []
    errors: list[str] = []

    for run_dir in run_dirs:
        try:
            records.append(load_source_record(run_dir))
        except CurateError as exc:
            errors.append(f"{run_dir.name}: {exc}")

    if errors:
        details = "\n".join(errors)
        raise CurateError(f"encountered {len(errors)} invalid run(s):\n{details}")

    return sorted(records, key=lambda record: (record.created_at or "", record.run_id))


def load_source_record(run_dir: Path) -> SourceRecord:
    request_path = run_dir / "request.json"
    if not request_path.exists():
        raise CurateError(f"missing request.json at {request_path}")

    request_payload = load_json_object(request_path, "request.json")
    prompt = request_payload.get("prompt")
    if not isinstance(prompt, str):
        raise CurateError("request.json is missing a string prompt field")

    prompt_normalized = normalize_text(prompt, field_name="prompt")
    files = normalize_files(request_payload.get("files"), run_dir)
    manifest_path = run_dir / "manifest.json"
    created_at: str | None = None
    manifest_path_value: str | None = None

    if manifest_path.exists():
        manifest_payload = load_json_object(manifest_path, "manifest.json")
        manifest_path_value = str(manifest_path)
        created_at_value = manifest_payload.get("created_at")
        if created_at_value is not None and not isinstance(created_at_value, str):
            raise CurateError("manifest.json created_at must be a string when present")
        created_at = created_at_value

    canonical_request = {
        "files": list(files),
        "prompt_normalized": prompt_normalized,
        "schema_version": SCHEMA_VERSION,
    }
    fingerprint = sha256_hexdigest(canonical_json_bytes(canonical_request))
    example_id = f"ttxreq_{fingerprint[:16]}"

    return SourceRecord(
        run_id=run_dir.name,
        created_at=created_at,
        request_path=str(request_path),
        manifest_path=manifest_path_value,
        prompt=prompt,
        prompt_normalized=prompt_normalized,
        files=files,
        fingerprint=fingerprint,
        example_id=example_id,
    )


def load_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CurateError(f"missing {label} at {path}") from exc
    except UnicodeDecodeError as exc:
        raise CurateError(f"{label} is not valid UTF-8: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CurateError(f"{label} is not valid JSON: {path}: {exc}") from exc

    if not isinstance(payload, dict):
        raise CurateError(f"{label} must contain a JSON object: {path}")
    return payload


def normalize_text(text: str, *, field_name: str) -> str:
    normalized = unicodedata.normalize("NFC", text)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(line.rstrip() for line in normalized.split("\n")).strip()
    if not normalized:
        raise CurateError(f"{field_name} is empty after normalization")
    return normalized


def normalize_files(files_value: Any, run_dir: Path) -> tuple[dict[str, Any], ...]:
    if files_value is None:
        return ()
    if not isinstance(files_value, list):
        raise CurateError("files must be a list when present")

    normalized_files: list[dict[str, Any]] = []
    for index, file_value in enumerate(files_value):
        if not isinstance(file_value, dict):
            raise CurateError(f"files[{index}] must be an object")
        normalized_files.append(normalize_single_file(file_value, run_dir, index))
    return tuple(normalized_files)


def normalize_single_file(file_value: dict[str, Any], run_dir: Path, index: int) -> dict[str, Any]:
    filename_value = file_value.get("filename", file_value.get("name"))
    if not isinstance(filename_value, str) or not filename_value.strip():
        raise CurateError(f"files[{index}] is missing a non-empty filename/name field")
    filename = unicodedata.normalize("NFC", filename_value).strip()

    mime_value = (
        file_value.get("mime_type")
        or file_value.get("mimeType")
        or file_value.get("content_type")
        or file_value.get("contentType")
    )
    if mime_value is not None and not isinstance(mime_value, str):
        raise CurateError(f"files[{index}] mime type must be a string when present")
    mime_type = mime_value.strip().lower() if isinstance(mime_value, str) and mime_value.strip() else None

    attachment_bytes, content_origin = extract_attachment_bytes(file_value, run_dir, index)
    content_base64 = base64.b64encode(attachment_bytes).decode("ascii")
    return {
        "content_base64": content_base64,
        "content_origin": content_origin,
        "filename": filename,
        "mime_type": mime_type,
        "sha256": sha256_hexdigest(attachment_bytes),
        "size_bytes": len(attachment_bytes),
    }


def extract_attachment_bytes(file_value: dict[str, Any], run_dir: Path, index: int) -> tuple[bytes, str]:
    if "content_base64" in file_value:
        content_base64 = file_value["content_base64"]
        if not isinstance(content_base64, str):
            raise CurateError(f"files[{index}].content_base64 must be a string")
        try:
            return base64.b64decode(content_base64, validate=True), "content_base64"
        except binascii.Error as exc:
            raise CurateError(f"files[{index}].content_base64 is not valid base64") from exc

    for key in ("content", "text", "body"):
        if key in file_value:
            value = file_value[key]
            if not isinstance(value, str):
                raise CurateError(f"files[{index}].{key} must be a string")
            normalized = value.replace("\r\n", "\n").replace("\r", "\n")
            return normalized.encode("utf-8"), key

    for key in ("path", "file_path", "filepath", "relative_path"):
        if key not in file_value:
            continue
        path_value = file_value[key]
        if not isinstance(path_value, str) or not path_value.strip():
            raise CurateError(f"files[{index}].{key} must be a non-empty string")
        candidate = Path(path_value)
        if not candidate.is_absolute():
            candidate = (run_dir / candidate).resolve()
        if not candidate.exists():
            raise CurateError(f"files[{index}].{key} does not exist: {candidate}")
        if not candidate.is_file():
            raise CurateError(f"files[{index}].{key} is not a file: {candidate}")
        return candidate.read_bytes(), key

    raise CurateError(
        f"files[{index}] must provide one of content_base64, content, text, body, path, file_path, filepath, or relative_path"
    )


def group_by_fingerprint(source_records: list[SourceRecord]) -> list[tuple[str, list[SourceRecord]]]:
    grouped: dict[str, list[SourceRecord]] = {}
    for record in source_records:
        grouped.setdefault(record.fingerprint, []).append(record)
    return [(fingerprint, grouped[fingerprint]) for fingerprint in sorted(grouped)]


def build_curated_examples(grouped_records: list[tuple[str, list[SourceRecord]]]) -> list[dict[str, Any]]:
    curated_examples: list[dict[str, Any]] = []
    for fingerprint, records in grouped_records:
        representative = records[0]
        curated_examples.append(
            {
                "id": representative.example_id,
                "fingerprint": fingerprint,
                "prompt": representative.prompt,
                "prompt_normalized": representative.prompt_normalized,
                "files": list(representative.files),
                "source_count": len(records),
                "source_runs": [
                    {
                        "created_at": record.created_at,
                        "manifest_path": record.manifest_path,
                        "request_path": record.request_path,
                        "run_id": record.run_id,
                    }
                    for record in records
                ],
            }
        )
    return curated_examples


def build_duplicate_groups(grouped_records: list[tuple[str, list[SourceRecord]]]) -> dict[str, Any]:
    groups = []
    for fingerprint, records in grouped_records:
        if len(records) < 2:
            continue
        prompt_variants = sorted({record.prompt for record in records})
        groups.append(
            {
                "example_id": records[0].example_id,
                "fingerprint": fingerprint,
                "prompt_variants": prompt_variants,
                "representative_run_id": records[0].run_id,
                "source_count": len(records),
                "source_runs": [
                    {
                        "created_at": record.created_at,
                        "request_path": record.request_path,
                        "run_id": record.run_id,
                    }
                    for record in records
                ],
            }
        )

    duplicate_run_count = sum(group["source_count"] for group in groups)
    return {
        "duplicate_group_count": len(groups),
        "duplicate_run_count": duplicate_run_count,
        "groups": groups,
        "schema_version": SCHEMA_VERSION,
    }


def build_source_index(source_records: list[SourceRecord]) -> list[dict[str, Any]]:
    return [
        {
            "created_at": record.created_at,
            "example_id": record.example_id,
            "fingerprint": record.fingerprint,
            "manifest_path": record.manifest_path,
            "request_path": record.request_path,
            "run_id": record.run_id,
        }
        for record in source_records
    ]


def build_manifest(
    input_root: Path,
    output_root: Path,
    source_records: list[SourceRecord],
    curated_examples: list[dict[str, Any]],
    duplicate_groups: dict[str, Any],
) -> dict[str, Any]:
    attachment_count = sum(len(record.files) for record in source_records)
    run_ids = [record.run_id for record in source_records]
    example_fingerprints = [example["fingerprint"] for example in curated_examples]
    output_files = [
        "duplicate_groups.json",
        "examples.jsonl",
        "manifest.json",
        "report.md",
        "source_index.jsonl",
    ]

    return {
        "dataset_fingerprint": sha256_hexdigest("\n".join(example_fingerprints).encode("utf-8")),
        "dataset_id": "tripletex_request_dataset_v1",
        "deduped_example_count": len(curated_examples),
        "duplicate_group_count": duplicate_groups["duplicate_group_count"],
        "duplicate_run_count": duplicate_groups["duplicate_run_count"],
        "excluded_request_fields": ["tripletex_credentials"],
        "fingerprint_logic": {
            "attachment_fingerprint_inputs": [
                "file order",
                "filename normalized with Unicode NFC and trimmed",
                "mime type lowercased when present",
                "attachment bytes SHA-256",
            ],
            "dedupe_scope": "exact duplicates after conservative normalization only",
            "near_duplicate_heuristics_applied": False,
            "prompt_normalization": [
                "Unicode NFC normalization",
                "CRLF/CR converted to LF",
                "trailing whitespace stripped per line",
                "leading and trailing blank space stripped",
            ],
            "schema_version": SCHEMA_VERSION,
        },
        "input_root": str(input_root),
        "input_run_count": len(source_records),
        "latest_source_created_at": max((record.created_at for record in source_records if record.created_at), default=None),
        "output_files": output_files,
        "output_root": str(output_root),
        "run_id_index_fingerprint": sha256_hexdigest("\n".join(run_ids).encode("utf-8")),
        "schema_version": SCHEMA_VERSION,
        "source_attachment_count": attachment_count,
    }


def build_report(
    input_root: Path,
    output_root: Path,
    source_records: list[SourceRecord],
    curated_examples: list[dict[str, Any]],
    duplicate_groups: dict[str, Any],
    manifest: dict[str, Any],
) -> str:
    duplicate_note = (
        "No duplicate groups were found in the current production corpus."
        if duplicate_groups["duplicate_group_count"] == 0
        else f"Detected {duplicate_groups['duplicate_group_count']} duplicate group(s) spanning "
        f"{duplicate_groups['duplicate_run_count']} source run(s)."
    )
    lines = [
        "# Tripletex Request Dataset Curation Report",
        "",
        "## Summary",
        f"- Input root: `{input_root}`",
        f"- Output root: `{output_root}`",
        f"- Source runs scanned: `{len(source_records)}`",
        f"- Curated examples written: `{len(curated_examples)}`",
        f"- Total attached files across sources: `{manifest['source_attachment_count']}`",
        f"- Duplicate groups: `{duplicate_groups['duplicate_group_count']}`",
        f"- Duplicate source runs: `{duplicate_groups['duplicate_run_count']}`",
        f"- Dataset fingerprint: `{manifest['dataset_fingerprint']}`",
        "",
        "## Dedupe Strategy",
        "- Exclude request-level credentials and all run-specific execution artifacts from the fingerprint.",
        "- Normalize prompt text with Unicode NFKC, LF-only newlines, trailing-whitespace trimming, and outer trimming.",
        "- Normalize attachment metadata conservatively and fingerprint attachment bytes with SHA-256 while preserving file order.",
        "- Apply exact-duplicate dedupe only after the conservative normalization above; no near-duplicate pruning is applied.",
        "",
        "## Result",
        f"- {duplicate_note}",
        "- Stable example ids are derived from the curated request fingerprint (`ttxreq_<sha256-prefix>`).",
        "- `examples.jsonl` contains one representative record per unique fingerprint plus full source provenance.",
        "- `source_index.jsonl` maps every scanned production run to its curated example id.",
    ]
    return "\n".join(lines) + "\n"


def write_outputs(
    output_root: Path,
    curated_examples: list[dict[str, Any]],
    duplicate_groups: dict[str, Any],
    source_index: list[dict[str, Any]],
    manifest: dict[str, Any],
    report: str,
) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_root / "examples.jsonl", curated_examples)
    write_json(output_root / "duplicate_groups.json", duplicate_groups)
    write_jsonl(output_root / "source_index.jsonl", source_index)
    write_json(output_root / "manifest.json", manifest)
    (output_root / "report.md").write_text(report, encoding="utf-8")


def write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def canonical_json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_hexdigest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


if __name__ == "__main__":
    sys.exit(main())
