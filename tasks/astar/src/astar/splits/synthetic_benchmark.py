from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable


class SyntheticBenchmarkManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    round_ids: list[str]
    episode_seeds: list[int]
    budget: int = Field(default=50, ge=0)


class BuildBenchmarkManifestsResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    manifest_paths: list[Path]
    round_count: int = Field(ge=0)


def write_benchmark_manifest(path: Path, manifest: SyntheticBenchmarkManifest) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(to_jsonable(manifest), indent=2),
        encoding="utf-8",
    )
    return path


def load_benchmark_manifest(path: Path) -> SyntheticBenchmarkManifest:
    return SyntheticBenchmarkManifest.model_validate_json(path.read_text(encoding="utf-8"))


def _default_round_splits(round_ids: list[str]) -> dict[str, list[str]]:
    if not round_ids:
        raise ValueError("no replay-backed rounds available for benchmark manifests")
    if len(round_ids) == 1:
        return {
            "smoke": [round_ids[0]],
            "dev": [round_ids[0]],
            "full": [round_ids[0]],
            "blind": [round_ids[0]],
        }
    blind_count = 1 if len(round_ids) <= 4 else max(1, len(round_ids) // 4)
    blind_rounds = round_ids[-blind_count:]
    seen_rounds = round_ids[:-blind_count] or round_ids[:1]
    dev_rounds = seen_rounds[: min(3, len(seen_rounds))]
    smoke_rounds = dev_rounds[:1]
    return {
        "smoke": smoke_rounds,
        "dev": dev_rounds,
        "full": round_ids,
        "blind": blind_rounds,
    }


def build_default_benchmark_manifests(
    paths: WorkspacePaths,
    *,
    budget: int = 50,
) -> BuildBenchmarkManifestsResult:
    round_ids = sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    split_rounds = _default_round_splits(round_ids)
    definitions = {
        "smoke": ("fast local smoke benchmark", [0]),
        "dev": ("small iterative benchmark", [0, 1]),
        "full": ("full replay-backed benchmark", [0, 1, 2]),
        "blind": ("frozen blind benchmark", [0, 1]),
    }
    manifest_paths: list[Path] = []
    for name, (description, episode_seeds) in definitions.items():
        manifest = SyntheticBenchmarkManifest(
            name=name,
            description=description,
            round_ids=split_rounds[name],
            episode_seeds=episode_seeds,
            budget=budget,
        )
        manifest_paths.append(
            write_benchmark_manifest(paths.benchmark_manifest_path(name), manifest),
        )
    return BuildBenchmarkManifestsResult(
        manifest_paths=manifest_paths,
        round_count=len(round_ids),
    )


__all__ = [
    "BuildBenchmarkManifestsResult",
    "SyntheticBenchmarkManifest",
    "build_default_benchmark_manifests",
    "load_benchmark_manifest",
    "write_benchmark_manifest",
]
