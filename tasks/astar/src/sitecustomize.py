"""Runtime bootstrap for binary wheels.

This module is auto-imported by Python's site machinery when installed into the
environment. It opportunistically preloads common C/C++ runtime libraries from
library directories exposed through environment variables so plain `uv run ...`
works across hosts with stricter dynamic-linker setups.
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path

_LOADED_LIBRARIES: list[ctypes.CDLL] = []
_REQUIRED_LIBRARY_NAMES = (
    "libstdc++.so.6",
    "libgcc_s.so.1",
    "libgomp.so.1",
)
_LIBRARY_DIR_ENV_VARS = (
    "ASTAR_EXTRA_LIBRARY_DIRS",
    "NIX_LD_LIBRARY_PATH",
)


def _library_dirs() -> tuple[Path, ...]:
    directories: list[Path] = []
    seen: set[Path] = set()
    for variable_name in _LIBRARY_DIR_ENV_VARS:
        raw_value = os.environ.get(variable_name, "")
        if not raw_value:
            continue
        for item in raw_value.split(":"):
            path = Path(item)
            if not item or not path.exists() or path in seen:
                continue
            directories.append(path)
            seen.add(path)
    return tuple(directories)


def _export_ld_library_path(library_dirs: tuple[Path, ...]) -> None:
    desired = [str(path) for path in library_dirs]
    current = [item for item in os.environ.get("LD_LIBRARY_PATH", "").split(":") if item]
    merged = desired + [item for item in current if item not in desired]
    if merged:
        os.environ["LD_LIBRARY_PATH"] = ":".join(merged)


def _preload_shared_libraries(library_dirs: tuple[Path, ...]) -> None:
    mode = getattr(os, "RTLD_GLOBAL", 0)
    for library_dir in library_dirs:
        for library_name in _REQUIRED_LIBRARY_NAMES:
            candidate = library_dir / library_name
            if not candidate.exists():
                continue
            try:
                _LOADED_LIBRARIES.append(ctypes.CDLL(str(candidate), mode=mode))
            except OSError:
                continue


def bootstrap_shared_libraries() -> None:
    if os.environ.get("ASTAR_SKIP_LIBRARY_BOOTSTRAP") == "1":
        return
    library_dirs = _library_dirs()
    if not library_dirs:
        return
    _export_ld_library_path(library_dirs)
    _preload_shared_libraries(library_dirs)


bootstrap_shared_libraries()
