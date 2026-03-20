#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class DatasetError(Exception):
    """Raised when the dataset layout or source material is invalid."""


@dataclass(frozen=True)
class DatasetPaths:
    repo_root: Path
    source_runs_dir: Path
    data_root: Path
    raw_runs_dir: Path
    curated_dir: Path
    manifests_dir: Path
    attachments_dir: Path


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    created_at: str
    prompt: str
    prompt_sha256: str
    raw_run_dir: Path
    manifest_path: Path
    request_path: Path
    manifest: dict[str, Any]
    request: dict[str, Any]
    top_level_entries: list[str]
    script_names: list[str]
    attachments: list[dict[str, Any]]
    request_files: list[Any]

    @property
    def has_scripts(self) -> bool:
        return bool(self.script_names)

    @property
    def has_reflection_bundle(self) -> bool:
        return "codex-reflection.summary.md" in self.top_level_entries

    @property
    def has_trace_bundle(self) -> bool:
        return "codex-trace.snapshot.json" in self.top_level_entries


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync and validate the Tripletex2 training dataset layout.",
    )
    parser.add_argument(
        "--source-runs-dir",
        type=Path,
        default=None,
        help="Override the source Tripletex production runs directory.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("sync", help="Import source runs and regenerate manifests.")
    subparsers.add_parser("stats", help="Print a concise dataset summary.")
    subparsers.add_parser("validate", help="Validate the generated dataset layout.")
    return parser.parse_args()


def resolve_paths(source_runs_override: Path | None) -> DatasetPaths:
    repo_root = Path(__file__).resolve().parents[1]
    default_source = repo_root.parent / "tripletex" / "data" / "production" / "runs"
    source_runs_dir = (source_runs_override or default_source).resolve()
    data_root = repo_root / "data"
    return DatasetPaths(
        repo_root=repo_root,
        source_runs_dir=source_runs_dir,
        data_root=data_root,
        raw_runs_dir=data_root / "raw" / "runs",
        curated_dir=data_root / "curated",
        manifests_dir=data_root / "manifests",
        attachments_dir=data_root / "attachments",
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise DatasetError(message)


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise DatasetError(f"Required JSON file is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise DatasetError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise DatasetError(f"Expected a JSON object in {path}, found {type(data).__name__}.")
    return data


def write_json(path: Path, payload: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except OSError as exc:
        raise DatasetError(f"Failed to write {path}: {exc}") from exc


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False))
                handle.write("\n")
    except OSError as exc:
        raise DatasetError(f"Failed to write {path}: {exc}") from exc


def write_text(path: Path, contents: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
    except OSError as exc:
        raise DatasetError(f"Failed to write {path}: {exc}") from exc


def remove_tree(path: Path) -> None:
    if not path.exists():
        return
    try:
        shutil.rmtree(path)
    except OSError as exc:
        raise DatasetError(f"Failed to remove directory {path}: {exc}") from exc


def remove_file(path: Path) -> None:
    if not path.exists():
        return
    try:
        path.unlink()
    except OSError as exc:
        raise DatasetError(f"Failed to remove file {path}: {exc}") from exc


def prompt_digest(prompt: str) -> str:
    return hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest()


def safe_relpath(path: Path, base: Path) -> str:
    return path.relative_to(base).as_posix()


def discover_runs(paths: DatasetPaths, base_dir: Path | None = None) -> list[RunRecord]:
    source_dir = (base_dir or paths.source_runs_dir).resolve()
    require(source_dir.is_dir(), f"Source runs directory does not exist: {source_dir}")

    runs: list[RunRecord] = []
    try:
        run_names = sorted(entry.name for entry in source_dir.iterdir() if entry.is_dir())
    except OSError as exc:
        raise DatasetError(f"Failed to list source runs in {source_dir}: {exc}") from exc

    for run_name in run_names:
        run_dir = source_dir / run_name
        manifest_path = run_dir / "manifest.json"
        request_path = run_dir / "request.json"
        require(manifest_path.is_file(), f"Missing manifest.json in source run {run_name}")
        require(request_path.is_file(), f"Missing request.json in source run {run_name}")

        manifest = read_json(manifest_path)
        request = read_json(request_path)

        created_at = manifest.get("created_at")
        prompt = request.get("prompt")
        attachments = manifest.get("attachments", [])
        request_files = request.get("files", [])
        require(isinstance(created_at, str) and created_at, f"manifest.json missing created_at for {run_name}")
        require(isinstance(prompt, str) and prompt, f"request.json missing prompt for {run_name}")
        require(isinstance(attachments, list), f"manifest.json attachments must be a list for {run_name}")
        require(isinstance(request_files, list), f"request.json files must be a list for {run_name}")

        try:
            top_level_entries = sorted(entry.name for entry in run_dir.iterdir())
        except OSError as exc:
            raise DatasetError(f"Failed to inspect source run {run_dir}: {exc}") from exc

        scripts_dir = run_dir / "scripts"
        script_names: list[str] = []
        if scripts_dir.exists():
            require(scripts_dir.is_dir(), f"scripts exists but is not a directory in {run_name}")
            try:
                script_names = sorted(
                    entry.name for entry in scripts_dir.iterdir() if entry.is_file()
                )
            except OSError as exc:
                raise DatasetError(f"Failed to list scripts in {scripts_dir}: {exc}") from exc

        runs.append(
            RunRecord(
                run_id=run_name,
                created_at=created_at,
                prompt=prompt,
                prompt_sha256=prompt_digest(prompt),
                raw_run_dir=run_dir,
                manifest_path=manifest_path,
                request_path=request_path,
                manifest=manifest,
                request=request,
                top_level_entries=top_level_entries,
                script_names=script_names,
                attachments=attachments,
                request_files=request_files,
            )
        )

    require(runs, f"No source runs were found in {source_dir}")
    return runs


def normalize_attachment_reference(
    run: RunRecord,
    item: Any,
    field_name: str,
    index: int,
) -> tuple[Path, str, dict[str, Any]]:
    source_value: str | None = None
    metadata: dict[str, Any]
    if isinstance(item, str):
        source_value = item
        metadata = {"path": item}
    elif isinstance(item, dict):
        metadata = item
        for key in ("path", "source_path", "file_path", "local_path"):
            candidate = item.get(key)
            if isinstance(candidate, str) and candidate:
                source_value = candidate
                break
    else:
        raise DatasetError(
            f"{run.run_id} has unsupported {field_name}[{index}] type: {type(item).__name__}"
        )

    if not source_value:
        raise DatasetError(
            f"{run.run_id} has {field_name}[{index}] without a supported path field."
        )

    source_path = Path(source_value)
    if not source_path.is_absolute():
        source_path = run.raw_run_dir / source_path
    source_path = source_path.resolve()
    if not source_path.exists():
        raise DatasetError(
            f"{run.run_id} references missing attachment path in {field_name}[{index}]: {source_path}"
        )

    target_name = metadata.get("name")
    if not isinstance(target_name, str) or not target_name.strip():
        target_name = source_path.name
    return source_path, target_name, metadata


def copy_path(src: Path, dest: Path) -> None:
    try:
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    except OSError as exc:
        raise DatasetError(f"Failed to copy {src} to {dest}: {exc}") from exc


def import_attachments(paths: DatasetPaths, runs: list[RunRecord]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for run in runs:
        references = [
            ("manifest.attachments", index, item)
            for index, item in enumerate(run.attachments)
        ]
        references.extend(
            ("request.files", index, item) for index, item in enumerate(run.request_files)
        )
        for field_name, index, item in references:
            source_path, target_name, metadata = normalize_attachment_reference(
                run=run,
                item=item,
                field_name=field_name,
                index=index,
            )
            destination = paths.attachments_dir / run.run_id / f"{index:02d}-{target_name}"
            copy_path(source_path, destination)
            item_record = {
                "run_id": run.run_id,
                "source_field": field_name,
                "index": index,
                "source_path": str(source_path),
                "copied_to": safe_relpath(destination, paths.repo_root),
                "metadata": metadata,
            }
            items.append(item_record)
    attachment_manifest = {
        "generated_at": now_utc(),
        "attachment_count": len(items),
        "items": items,
    }
    write_json(paths.attachments_dir / "attachment-manifest.json", attachment_manifest)
    write_text(
        paths.attachments_dir / "README.md",
        "\n".join(
            [
                "# Attachments",
                "",
                "This directory stores material copied from `manifest.attachments` and `request.files`.",
                "",
                f"Current snapshot attachment count: {len(items)}.",
            ]
        )
        + "\n",
    )
    return attachment_manifest


def build_manifest_rows(paths: DatasetPaths, runs: list[RunRecord]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for run in runs:
        raw_run_dir = paths.raw_runs_dir / run.run_id
        rows.append(
            {
                "run_id": run.run_id,
                "created_at": run.created_at,
                "prompt_sha256": run.prompt_sha256,
                "raw_run_dir": safe_relpath(raw_run_dir, paths.repo_root),
                "request_path": safe_relpath(raw_run_dir / "request.json", paths.repo_root),
                "manifest_path": safe_relpath(raw_run_dir / "manifest.json", paths.repo_root),
                "top_level_entries": run.top_level_entries,
                "script_names": run.script_names,
                "has_scripts": run.has_scripts,
                "has_trace_bundle": run.has_trace_bundle,
                "has_reflection_bundle": run.has_reflection_bundle,
                "attachment_count": len(run.attachments),
                "request_file_count": len(run.request_files),
            }
        )
    return rows


def build_curated_rows(runs: list[RunRecord]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for run in runs:
        rows.append(
            {
                "example_id": run.run_id,
                "source_run_id": run.run_id,
                "created_at": run.created_at,
                "prompt": run.prompt,
                "prompt_sha256": run.prompt_sha256,
                "has_scripts": run.has_scripts,
                "has_trace_bundle": run.has_trace_bundle,
                "has_reflection_bundle": run.has_reflection_bundle,
                "script_names": run.script_names,
            }
        )
    return rows


def build_summary(
    paths: DatasetPaths,
    runs: list[RunRecord],
    attachment_manifest: dict[str, Any],
) -> dict[str, Any]:
    unique_prompts = {run.prompt_sha256 for run in runs}
    return {
        "generated_at": now_utc(),
        "source_runs_dir": str(paths.source_runs_dir),
        "raw_runs_dir": safe_relpath(paths.raw_runs_dir, paths.repo_root),
        "curated_examples_path": safe_relpath(
            paths.curated_dir / "examples.jsonl", paths.repo_root
        ),
        "raw_run_count": len(runs),
        "curated_example_count": len(runs),
        "runs_with_scripts": sum(1 for run in runs if run.has_scripts),
        "runs_with_trace_bundle": sum(1 for run in runs if run.has_trace_bundle),
        "runs_with_reflection_bundle": sum(1 for run in runs if run.has_reflection_bundle),
        "unique_prompt_count": len(unique_prompts),
        "duplicate_prompt_count": len(runs) - len(unique_prompts),
        "attachment_count": attachment_manifest["attachment_count"],
        "request_file_count": sum(len(run.request_files) for run in runs),
        "dedupe_policy": {
            "raw_runs": "Never dedupe raw imports; preserve one directory per source run_id.",
            "curated_examples": (
                "Dedupe only intentionally and record all contributing source_run_id values. "
                "The current snapshot retains all runs because every prompt hash is unique."
            ),
        },
    }


def sync_dataset(paths: DatasetPaths) -> None:
    runs = discover_runs(paths)

    paths.data_root.mkdir(parents=True, exist_ok=True)
    remove_tree(paths.raw_runs_dir)

    try:
        paths.raw_runs_dir.mkdir(parents=True, exist_ok=True)
        paths.curated_dir.mkdir(parents=True, exist_ok=True)
        paths.manifests_dir.mkdir(parents=True, exist_ok=True)
        paths.attachments_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise DatasetError(f"Failed to create dataset directories: {exc}") from exc

    remove_file(paths.curated_dir / "examples.jsonl")
    remove_file(paths.manifests_dir / "dataset-summary.json")
    remove_file(paths.manifests_dir / "raw-runs.jsonl")
    remove_file(paths.attachments_dir / "attachment-manifest.json")
    remove_file(paths.attachments_dir / "README.md")
    try:
        attachment_subdirs = [
            entry for entry in paths.attachments_dir.iterdir() if entry.is_dir()
        ]
    except OSError as exc:
        raise DatasetError(f"Failed to inspect attachments directory {paths.attachments_dir}: {exc}") from exc
    for attachment_subdir in attachment_subdirs:
        remove_tree(attachment_subdir)

    for run in runs:
        destination = paths.raw_runs_dir / run.run_id
        copy_path(run.raw_run_dir, destination)

    attachment_manifest = import_attachments(paths, runs)
    manifest_rows = build_manifest_rows(paths, runs)
    curated_rows = build_curated_rows(runs)
    summary = build_summary(paths, runs, attachment_manifest)

    write_jsonl(paths.manifests_dir / "raw-runs.jsonl", manifest_rows)
    write_json(paths.manifests_dir / "dataset-summary.json", summary)
    write_jsonl(paths.curated_dir / "examples.jsonl", curated_rows)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise DatasetError(f"Missing JSONL file: {path}")
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                stripped = line.strip()
                if not stripped:
                    continue
                value = json.loads(stripped)
                if not isinstance(value, dict):
                    raise DatasetError(
                        f"Expected object entries in {path}, line {line_number}, found {type(value).__name__}."
                    )
                rows.append(value)
    except json.JSONDecodeError as exc:
        raise DatasetError(f"Invalid JSONL in {path}: {exc}") from exc
    except OSError as exc:
        raise DatasetError(f"Failed to read {path}: {exc}") from exc
    return rows


def validate_dataset(paths: DatasetPaths) -> dict[str, Any]:
    require(paths.raw_runs_dir.is_dir(), f"Missing dataset raw runs directory: {paths.raw_runs_dir}")
    require(paths.curated_dir.is_dir(), f"Missing curated directory: {paths.curated_dir}")
    require(paths.manifests_dir.is_dir(), f"Missing manifests directory: {paths.manifests_dir}")
    require(paths.attachments_dir.is_dir(), f"Missing attachments directory: {paths.attachments_dir}")

    summary = read_json(paths.manifests_dir / "dataset-summary.json")
    manifest_rows = load_jsonl(paths.manifests_dir / "raw-runs.jsonl")
    curated_rows = load_jsonl(paths.curated_dir / "examples.jsonl")
    attachment_manifest = read_json(paths.attachments_dir / "attachment-manifest.json")

    require(
        summary.get("raw_run_count") == len(manifest_rows),
        "dataset-summary raw_run_count does not match manifests/raw-runs.jsonl",
    )
    require(
        summary.get("curated_example_count") == len(curated_rows),
        "dataset-summary curated_example_count does not match curated/examples.jsonl",
    )
    require(
        attachment_manifest.get("attachment_count") == len(attachment_manifest.get("items", [])),
        "attachment-manifest.json attachment_count does not match item count",
    )

    curated_by_run_id = {row.get("source_run_id"): row for row in curated_rows}
    require(
        len(curated_by_run_id) == len(curated_rows),
        "curated/examples.jsonl contains duplicate source_run_id values",
    )

    prompt_hashes: set[str] = set()
    for row in manifest_rows:
        run_id = row.get("run_id")
        require(isinstance(run_id, str) and run_id, "Manifest row missing run_id")
        raw_run_dir = paths.repo_root / str(row.get("raw_run_dir", ""))
        require(raw_run_dir.is_dir(), f"Raw run directory missing for {run_id}: {raw_run_dir}")

        request_path = raw_run_dir / "request.json"
        manifest_path = raw_run_dir / "manifest.json"
        request = read_json(request_path)
        manifest = read_json(manifest_path)
        prompt = request.get("prompt")
        require(isinstance(prompt, str) and prompt, f"{request_path} is missing prompt")
        prompt_sha256 = prompt_digest(prompt)
        require(
            row.get("prompt_sha256") == prompt_sha256,
            f"Prompt hash mismatch for {run_id}",
        )
        prompt_hashes.add(prompt_sha256)

        curated_row = curated_by_run_id.get(run_id)
        require(curated_row is not None, f"Missing curated example for {run_id}")
        require(curated_row.get("prompt") == prompt, f"Curated prompt mismatch for {run_id}")
        require(
            curated_row.get("prompt_sha256") == prompt_sha256,
            f"Curated prompt hash mismatch for {run_id}",
        )
        require(
            curated_row.get("created_at") == manifest.get("created_at"),
            f"Curated created_at mismatch for {run_id}",
        )

    require(
        summary.get("unique_prompt_count") == len(prompt_hashes),
        "dataset-summary unique_prompt_count does not match discovered prompts",
    )
    require(
        summary.get("duplicate_prompt_count") == len(manifest_rows) - len(prompt_hashes),
        "dataset-summary duplicate_prompt_count does not match discovered prompts",
    )

    return {
        "raw_run_count": len(manifest_rows),
        "curated_example_count": len(curated_rows),
        "attachment_count": attachment_manifest.get("attachment_count"),
        "unique_prompt_count": len(prompt_hashes),
    }


def print_stats(paths: DatasetPaths) -> None:
    validation = validate_dataset(paths)
    summary = read_json(paths.manifests_dir / "dataset-summary.json")
    print(f"source_runs_dir: {summary['source_runs_dir']}")
    print(f"raw_run_count: {validation['raw_run_count']}")
    print(f"curated_example_count: {validation['curated_example_count']}")
    print(f"unique_prompt_count: {validation['unique_prompt_count']}")
    print(f"runs_with_scripts: {summary['runs_with_scripts']}")
    print(f"runs_with_trace_bundle: {summary['runs_with_trace_bundle']}")
    print(f"runs_with_reflection_bundle: {summary['runs_with_reflection_bundle']}")
    print(f"attachment_count: {validation['attachment_count']}")
    print(f"request_file_count: {summary['request_file_count']}")


def main() -> int:
    args = parse_args()
    paths = resolve_paths(args.source_runs_dir)
    try:
        if args.command == "sync":
            sync_dataset(paths)
        elif args.command == "stats":
            print_stats(paths)
        elif args.command == "validate":
            result = validate_dataset(paths)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            raise DatasetError(f"Unsupported command: {args.command}")
    except DatasetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
