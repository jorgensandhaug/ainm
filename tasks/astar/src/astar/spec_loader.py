from __future__ import annotations

import importlib


def load_object(import_path: str) -> object:
    if ":" not in import_path:
        msg = f"expected import path in module:object form, got {import_path!r}"
        raise ValueError(msg)
    module_name, object_name = import_path.split(":", 1)
    module = importlib.import_module(module_name)
    try:
        return getattr(module, object_name)
    except AttributeError as exc:
        msg = f"module {module_name!r} has no attribute {object_name!r}"
        raise ValueError(msg) from exc

