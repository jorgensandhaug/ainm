from __future__ import annotations

import json
from pathlib import Path

from astar.infra.serialization.json_utils import to_jsonable
from astar.viz.types import ReportManifest


def write_report_manifest(path: Path, manifest: ReportManifest) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(to_jsonable(manifest), indent=2), encoding="utf-8")
    return path


def render_report_manifest_markdown(manifest: ReportManifest) -> str:
    lines = [f"# {manifest.title}", ""]
    if manifest.round_id is not None:
        lines.append(f"- round_id: `{manifest.round_id}`")
    if manifest.seed_index is not None:
        lines.append(f"- seed_index: `{manifest.seed_index}`")
    for key, value in sorted(manifest.metadata.items()):
        lines.append(f"- {key}: `{value}`")
    if manifest.figures:
        lines.extend(["", "## Figures", ""])
        for figure in manifest.figures:
            lines.append(f"- {figure.key}: `{figure.path.name}`")
            if figure.description is not None:
                lines.append(f"  {figure.description}")
    return "\n".join(lines)


__all__ = ["render_report_manifest_markdown", "write_report_manifest"]
