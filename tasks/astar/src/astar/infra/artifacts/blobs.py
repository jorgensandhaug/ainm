from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class BlobRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    path: Path
    sha1: str
    size_bytes: int


def file_sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(65536)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def describe_blob(path: Path) -> BlobRecord:
    return BlobRecord(
        path=path,
        sha1=file_sha1(path),
        size_bytes=path.stat().st_size,
    )


def write_json_blob(path: Path, payload: object) -> BlobRecord:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return describe_blob(path)
