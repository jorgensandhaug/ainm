from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
STAGES = [
    ("stage1.txt", "stage-1: broken\n", "stage-1: fixed\n"),
    ("stage2.txt", "stage-2: broken\n", "stage-2: fixed\n"),
    ("stage3.txt", "stage-3: broken\n", "stage-3: fixed\n"),
]


def read_iteration() -> int:
    raw = os.environ.get("FAMILY_1_ITERATION", "").strip()
    if not raw:
        print("missing FAMILY_1_ITERATION")
        raise SystemExit(2)
    try:
        value = int(raw)
    except ValueError:
        print(f"invalid FAMILY_1_ITERATION: {raw!r}")
        raise SystemExit(2)
    if value < 1:
        print(f"FAMILY_1_ITERATION must be >= 1, got {value}")
        raise SystemExit(2)
    return value


def main() -> int:
    iteration = read_iteration()
    unlocked = min(iteration, len(STAGES))
    errors: list[str] = []

    for index, (name, broken, fixed) in enumerate(STAGES, start=1):
        actual = (ROOT / name).read_text()
        expected = fixed if index <= unlocked else broken
        if actual != expected:
            expected_label = "fixed" if index <= unlocked else "broken"
            errors.append(
                f"{name}: expected {expected_label!r} content for iteration {iteration}, got {actual.strip()!r}"
            )

    if errors:
        print("dummy verifier failed")
        for error in errors:
            print(f"- {error}")
        return 1

    if unlocked < len(STAGES):
        print(
            f"stage {unlocked}/3 complete for outer iteration {iteration}; stop now; do not emit sentinel"
        )
        return 0

    print("all 3 stages complete; emit <promise>COMPLETE</promise>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
