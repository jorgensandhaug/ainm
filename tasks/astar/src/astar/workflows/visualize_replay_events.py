from __future__ import annotations

from pathlib import Path

import polars as pl

from astar.history.replay.ingest import load_replay_run
from astar.history.summaries.events import ReplayEventTableBundle, extract_replay_event_tables
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.viz.reports import render_report_manifest_markdown, write_report_manifest
from astar.viz.transitions import plot_replay_change_timeline, plot_replay_transition
from astar.viz.types import FigureSpec, ReportManifest
from astar.workflows.results import VisualizationReportResult


def _markdown_table(frame: pl.DataFrame, *, columns: list[str], max_rows: int = 12) -> str:
    if frame.is_empty():
        return "_none_"
    selected = frame.select([pl.col(column) for column in columns if column in frame.columns]).head(max_rows)
    headers = "| " + " | ".join(selected.columns) + " |"
    divider = "| " + " | ".join("---" for _ in selected.columns) + " |"
    rows = [headers, divider]
    for row in selected.iter_rows(named=True):
        values = []
        for column in selected.columns:
            value = row[column]
            values.append("" if value is None else str(value))
        rows.append("| " + " | ".join(values) + " |")
    return "\n".join(rows)


def _selected_steps(bundle: ReplayEventTableBundle, max_steps: int) -> list[int]:
    cell_events = bundle.cell_events
    settlement_transitions = bundle.settlement_transitions
    cell_counts = {
        int(row["step"]): int(row["count"])
        for row in cell_events.group_by("step").len().rename({"len": "count"}).iter_rows(named=True)
    }
    settlement_counts = {
        int(row["step"]): int(row["count"])
        for row in settlement_transitions.filter(pl.col("changed")).group_by("step").len().rename({"len": "count"}).iter_rows(named=True)
    }
    semantic_settlement_counts = {
        int(row["step"]): int(row["count"])
        for row in settlement_transitions.filter(
            pl.col("transition_kind").is_in(
                [
                    "birth",
                    "rebuild",
                    "collapse",
                    "collapse_to_ruin",
                    "port_gain",
                    "port_loss",
                    "owner_flip",
                ],
            ),
        )
        .group_by("step")
        .len()
        .rename({"len": "count"})
        .iter_rows(named=True)
    }
    semantic_cell_counts = {
        int(row["step"]): int(row["count"])
        for row in cell_events.filter(
            pl.col("event_kind").is_in(
                ["build", "port_gain", "ruin", "rebuild", "ruin_to_forest", "clear"],
            ),
        )
        .group_by("step")
        .len()
        .rename({"len": "count"})
        .iter_rows(named=True)
    }
    steps = sorted(set(cell_counts) | set(settlement_counts))
    scored = sorted(
        (
            (
                step,
                (
                    100 * semantic_settlement_counts.get(step, 0)
                    + 10 * semantic_cell_counts.get(step, 0)
                    + settlement_counts.get(step, 0)
                    + cell_counts.get(step, 0)
                ),
            )
            for step in steps
        ),
        key=lambda item: (-item[1], item[0]),
    )
    selected = [step for step, _ in scored[: max(1, max_steps)]]
    if not selected:
        return [0]
    return sorted(selected)


def _clean_report_dir(report_dir: Path) -> None:
    for pattern in ("transition_step_*.png", "change_timeline.png", "manifest.json", "report.md"):
        for path in report_dir.glob(pattern):
            path.unlink(missing_ok=True)


def visualize_replay_events(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    *,
    replay_run_index: int = 0,
    max_steps: int = 4,
) -> VisualizationReportResult:
    run = load_replay_run(paths, round_id, seed_index, replay_run_index)
    bundle = extract_replay_event_tables([run])
    selected_steps = _selected_steps(bundle, max_steps) if len(run.frames) >= 2 else []

    report_dir = (
        paths.report_dir(round_id)
        / f"seed_index={seed_index}"
        / f"replay_events__run_index={replay_run_index}"
    )
    report_dir.mkdir(parents=True, exist_ok=True)
    _clean_report_dir(report_dir)

    figure_specs = [
        FigureSpec(
            key="change_timeline",
            title="Replay change timeline",
            path=plot_replay_change_timeline(
                bundle.cell_events,
                bundle.settlement_transitions,
                report_dir / "change_timeline.png",
            ),
            description="Changed-cell and changed-settlement counts by yearly transition step.",
        ),
    ]
    for step in selected_steps:
        previous_frame = run.frames[step]
        current_frame = run.frames[step + 1]
        figure_specs.append(
            FigureSpec(
                key=f"transition_step_{step}",
                title=f"Replay step {step} -> {step + 1}",
                path=plot_replay_transition(
                    previous_frame.grid,
                    current_frame.grid,
                    previous_frame.settlements,
                    current_frame.settlements,
                    report_dir / f"transition_step_{step}.png",
                    title=f"Round replay step {step} -> {step + 1}",
                ),
                description="Previous state, next state, and changed-cell overlay for one yearly transition.",
            ),
        )

    rerun_command = (
        "uv run astar visualize-replay-events "
        f"--round-id {round_id} --seed-index {seed_index} "
        f"--replay-run-index {replay_run_index} --max-steps {max_steps}"
    )
    report_path = report_dir / "report.md"
    manifest_path = report_dir / "manifest.json"
    manifest = ReportManifest(
        report_key="replay_events",
        title=f"Replay Event Audit Round {round_id} Seed {seed_index}",
        report_path=report_path,
        round_id=round_id,
        seed_index=seed_index,
        metadata={
            "replay_run_id": run.replay_run_id,
            "replay_run_index": replay_run_index,
            "frame_count": len(run.frames),
            "cell_event_count": bundle.cell_event_count,
            "settlement_transition_count": bundle.settlement_transition_count,
            "selected_steps": selected_steps,
            "source_path": run.source_path,
            "rerun_command": rerun_command,
        },
        figures=figure_specs,
    )
    write_report_manifest(manifest_path, manifest)

    report_lines = [render_report_manifest_markdown(manifest), "", "## Step Audits", ""]
    if not selected_steps:
        report_lines.extend(["_no frame transitions available_", ""])
    for step in selected_steps:
        step_cell_events = (
            bundle.cell_events.filter(pl.col("step") == step)
            .sort(["y", "x"])
        )
        step_settlement_transitions = (
            bundle.settlement_transitions.filter(
                (pl.col("step") == step) & pl.col("changed")
            )
            .sort(["y", "x"])
        )
        report_lines.extend(
            [
                f"### Step {step} -> {step + 1}",
                "",
                f"- cell_events: `{step_cell_events.height}`",
                f"- settlement_transitions: `{step_settlement_transitions.height}`",
                f"- figure: `{report_dir.joinpath(f'transition_step_{step}.png').name}`",
                "",
                "#### Cell Events",
                "",
                _markdown_table(
                    step_cell_events,
                    columns=[
                        "y",
                        "x",
                        "prev_code",
                        "next_code",
                        "event_kind",
                        "built_created",
                        "port_created",
                        "ruin_created",
                        "rebuilt_from_ruin",
                        "reclaimed_by_forest",
                        "matched_collapse_to_ruin",
                        "matched_settlement_rebuild",
                    ],
                ),
                "",
                "#### Settlement Transitions",
                "",
                _markdown_table(
                    step_settlement_transitions,
                    columns=[
                        "y",
                        "x",
                        "transition_kind",
                        "birth",
                        "rebuild",
                        "collapse",
                        "collapse_to_ruin",
                        "port_gain",
                        "port_loss",
                        "owner_flip",
                        "population_delta",
                        "food_delta",
                        "wealth_delta",
                        "defense_delta",
                    ],
                ),
                "",
            ],
        )
    report_path.write_text("\n".join(report_lines).strip() + "\n", encoding="utf-8")

    result = VisualizationReportResult(
        report_key=manifest.report_key,
        title=manifest.title,
        report_path=report_path,
        manifest_path=manifest_path,
        figure_paths={figure.key: figure.path for figure in figure_specs},
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="visualization_built",
            round_id=round_id,
            seed_index=seed_index,
            status="ok",
            artifact_path=result.manifest_path,
            payload_json=to_jsonable(result),
            spec_name=result.report_key,
        ),
    )
    return result


__all__ = ["visualize_replay_events"]
