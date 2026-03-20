#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

from norgesgruppen_prep_common import (
    EXPERIMENT_REGISTRY_JSON,
    ROOT,
    display_path,
    read_json,
    write_json,
)


def notes_markdown(experiment: dict) -> str:
    prerequisites = experiment.get("prerequisites", [])
    prereq_lines = "\n".join(f"- `{item}`" for item in prerequisites) if prerequisites else "- none"
    lines = [
        f"# {experiment['id']} {experiment['slug']}",
        "",
        "## Metadata",
        "",
        f"- id: `{experiment['id']}`",
        f"- slug: `{experiment['slug']}`",
        f"- status: `{experiment['status']}`",
        f"- phase: `{experiment['phase']}`",
        f"- priority: `{experiment['priority']}`",
        "",
        "## Question",
        "",
        experiment["question"],
        "",
        "## Prerequisites",
        "",
        prereq_lines,
        "",
        "## Success Gate",
        "",
        experiment["success_gate"],
        "",
        "## Run Notes",
        "",
        "- owner:",
        "- code path:",
        "- split:",
        "- slices:",
        "- seed:",
        "",
        "## Results",
        "",
        "- primary metrics:",
        "- bucketed metrics:",
        "- key error read:",
        "- next action:",
        "",
    ]
    return "\n".join(lines)


def artifact_readme_markdown(experiment: dict) -> str:
    return "\n".join(
        [
            f"# {experiment['id']} Artifacts",
            "",
            "Put optional run outputs here.",
            "",
            "Examples:",
            "",
            "- prediction dumps",
            "- confusion matrices",
            "- failure-case montages",
            "- plots",
            "- debug exports",
            "",
        ]
    )


def default_config(experiment: dict) -> dict:
    return {
        "id": experiment["id"],
        "slug": experiment["slug"],
        "status": experiment["status"],
        "phase": experiment["phase"],
        "priority": experiment["priority"],
        "question": experiment["question"],
        "prerequisites": experiment.get("prerequisites", []),
        "success_gate": experiment["success_gate"],
        "data_snapshot": "2026-03-19",
        "split": None,
        "recognition_slice": None,
        "seed": None,
        "code_entrypoints": [],
        "weights": [],
        "notes": "Fill before or during the run.",
    }


def default_metrics(experiment: dict) -> dict:
    return {
        "id": experiment["id"],
        "status": "not_run",
        "primary_metrics": {},
        "bucketed_metrics": {
            "theme": {},
            "readiness_bucket": {},
            "image_difficulty_bucket": {},
        },
        "artifacts": [],
        "summary": "",
    }


def scaffold_experiment(experiment: dict, overwrite: bool) -> dict:
    experiment_dir = ROOT / experiment["planned_outputs_dir"]
    experiment_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = experiment_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    files_to_write = {
        experiment_dir / "notes.md": notes_markdown(experiment) + "\n",
        artifacts_dir / "README.md": artifact_readme_markdown(experiment) + "\n",
    }

    written = []
    skipped = []
    for path, contents in files_to_write.items():
        if path.exists() and not overwrite:
            skipped.append(display_path(path))
            continue
        path.write_text(contents)
        written.append(display_path(path))

    json_files = {
        experiment_dir / "config.json": default_config(experiment),
        experiment_dir / "metrics.json": default_metrics(experiment),
    }
    for path, value in json_files.items():
        if path.exists() and not overwrite:
            skipped.append(display_path(path))
            continue
        write_json(path, value)
        written.append(display_path(path))

    return {
        "id": experiment["id"],
        "dir": display_path(experiment_dir),
        "written": written,
        "skipped": skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Scaffold experiment folders from the NorgesGruppen experiment registry.")
    parser.add_argument("--id", action="append", dest="ids", help="Experiment id to scaffold. May be passed multiple times.")
    parser.add_argument("--all", action="store_true", help="Scaffold all registry experiments.")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    registry = read_json(EXPERIMENT_REGISTRY_JSON)
    experiments = registry["experiments"]
    if args.all:
        selected = experiments
    elif args.ids:
        wanted = set(args.ids)
        selected = [experiment for experiment in experiments if experiment["id"] in wanted]
        missing = sorted(wanted - {experiment["id"] for experiment in selected})
        if missing:
            raise SystemExit(f"Unknown experiment ids: {missing}")
    else:
        selected = [experiments[0]]

    for experiment in selected:
        result = scaffold_experiment(experiment, overwrite=args.overwrite)
        print(f"{result['id']}: {result['dir']}")
        for path in result["written"]:
            print(f"  wrote {path}")
        for path in result["skipped"]:
            print(f"  skipped {path}")


if __name__ == "__main__":
    main()
