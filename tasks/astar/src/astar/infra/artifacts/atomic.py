from __future__ import annotations

import fcntl
import os
import tempfile
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import polars as pl


@contextmanager
def file_lock(path: Path) -> Iterator[Path]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield path
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def _atomic_path(path: Path) -> Iterator[tuple[int, Path]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp_path = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    tmp_path = Path(raw_tmp_path)
    try:
        yield (fd, tmp_path)
    except Exception:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass
        raise


@contextmanager
def atomic_output_path(path: Path) -> Iterator[Path]:
    with _atomic_path(path) as (fd, tmp_path):
        os.close(fd)
        try:
            yield tmp_path
            os.replace(tmp_path, path)
        except Exception:
            try:
                tmp_path.unlink()
            except FileNotFoundError:
                pass
            raise


def atomic_write_text(path: Path, text: str, *, encoding: str = "utf-8") -> Path:
    with _atomic_path(path) as (fd, tmp_path):
        with os.fdopen(fd, "w", encoding=encoding) as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    return path


def atomic_write_npz(path: Path, arrays: Mapping[str, np.ndarray]) -> Path:
    with _atomic_path(path) as (fd, tmp_path):
        with os.fdopen(fd, "wb") as handle:
            np.savez_compressed(file=handle, **dict(arrays))  # type: ignore[arg-type]
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    return path


def atomic_write_parquet(path: Path, frame: pl.DataFrame) -> Path:
    with atomic_output_path(path) as tmp_path:
        frame.write_parquet(tmp_path)
    return path


__all__ = [
    "atomic_output_path",
    "atomic_write_npz",
    "atomic_write_parquet",
    "atomic_write_text",
    "file_lock",
]
