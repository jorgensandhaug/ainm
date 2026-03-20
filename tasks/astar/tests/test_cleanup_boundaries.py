from __future__ import annotations

import re
from pathlib import Path

LEGACY_IMPORT_RE = re.compile(
    r"^(?:from|import)\s+astar\.(api|domain|storage|ops|legacy|policies)\b",
)


def test_legacy_import_footprint_is_explicit_and_only_shrinks() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    astar_root = repo_root / "src" / "astar"
    allowed: set[Path] = set()

    offenders: dict[Path, list[str]] = {}
    for path in sorted(astar_root.rglob("*.py")):
        rel = path.relative_to(astar_root)
        matches = [
            line.strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if LEGACY_IMPORT_RE.match(line.strip())
        ]
        if matches:
            offenders[rel] = matches

    assert set(offenders) == allowed, (
        "legacy import footprint changed; "
        "update cleanup matrix and migrate or whitelist explicitly\n"
        f"found={sorted(str(path) for path in offenders)}"
    )
