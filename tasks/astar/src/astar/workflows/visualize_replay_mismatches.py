from __future__ import annotations

from pathlib import Path

import polars as pl

from astar.history.replay.ingest import load_replay_run
from astar.history.summaries.events import CELL_EVENT_SCHEMA, ReplayEventTableBundle, extract_replay_event_tables
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.viz.reports import render_report_manifest_markdown, write_report_manifest
from astar.viz.transitions import plot_replay_mismatch_timeline, plot_replay_transition
from astar.viz.types import FigureSpec, ReportManifest
from astar.workflows.results import VisualizationReportResult

MISMATCH_KIND_ORDER: tuple[str, ...] = (
    "ruin_without_collapse",
    "rebuild_without_settlement",
)
MISMATCH_SCHEMA: dict[str, pl.DataType] = {
    **CELL_EVENT_SCHEMA,
    "mismatch_kind": pl.String,
}


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


def _empty_mismatch_frame() -> pl.DataFrame:
    return pl.DataFrame(schema=MISMATCH_SCHEMA)


def _collect_mismatch_rows(bundle: ReplayEventTableBundle) -> pl.DataFrame:
    mismatch_frames: list[pl.DataFrame] = []
    ruin_without_collapse = bundle.cell_events.filter(
        pl.col("ruin_created") & (~pl.col("matched_collapse_to_ruin"))
    ).with_columns(pl.lit("ruin_without_collapse").alias("mismatch_kind"))
    if not ruin_without_collapse.is_empty():
        mismatch_frames.append(ruin_without_collapse)
    rebuild_without_settlement = bundle.cell_events.filter(
        pl.col("rebuilt_from_ruin") & (~pl.col("matched_settlement_rebuild"))
    ).with_columns(pl.lit("rebuild_without_settlement").alias("mismatch_kind"))
    if not rebuild_without_settlement.is_empty():
        mismatch_frames.append(rebuild_without_settlement)
    if not mismatch_frames:
        return _empty_mismatch_frame()
    return pl.concat(mismatch_frames, how="diagonal").sort(["mismatch_kind", "step", "y", "x"])


def _mismatch_breakdown(mismatch_rows: pl.DataFrame) -> pl.DataFrame:
    if mismatch_rows.is_empty():
        return pl.DataFrame(
            schema={
                "mismatch_kind": pl.String,
                "prev_code": pl.Int64,
                "next_code": pl.Int64,
                "count": pl.Int64,
                "first_step": pl.Int64,
                "last_step": pl.Int64,
            },
        )
    return (
        mismatch_rows.group_by(["mismatch_kind", "prev_code", "next_code"])
        .agg(
            pl.len().alias("count"),
            pl.col("step").min().alias("first_step"),
            pl.col("step").max().alias("last_step"),
        )
        .sort(
            ["mismatch_kind", "count", "prev_code", "next_code"],
            descending=[False, True, False, False],
        )
    )


def _select_examples(mismatch_rows: pl.DataFrame, max_examples_per_kind: int) -> list[dict[str, object]]:
    examples: list[dict[str, object]] = []
    for mismatch_kind in MISMATCH_KIND_ORDER:
        kind_rows = mismatch_rows.filter(pl.col("mismatch_kind") == mismatch_kind).sort(["step", "y", "x"])
        examples.extend(list(kind_rows.head(max(0, max_examples_per_kind)).iter_rows(named=True)))
    return examples


def _same_position_settlement_rows(
    bundle: ReplayEventTableBundle,
    *,
    step: int,
    x: int,
    y: int,
) -> pl.DataFrame:
    return (
        bundle.settlement_transitions.filter(
            (pl.col("step") == step) & (pl.col("x") == x) & (pl.col("y") == y)
        )
        .sort(["y", "x"])
    )


def _clean_report_dir(report_dir: Path) -> None:
    for pattern in ("*.png", "*.parquet", "manifest.json", "report.md"):
        for path in report_dir.glob(pattern):
            path.unlink(missing_ok=True)


def visualize_replay_mismatches(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    *,
    replay_run_index: int = 0,
    max_examples_per_kind: int = 4,
) -> VisualizationReportResult:
    run = load_replay_run(paths, round_id, seed_index, replay_run_index)
    bundle = extract_replay_event_tables([run])
    mismatch_rows = _collect_mismatch_rows(bundle)
    mismatch_breakdown = _mismatch_breakdown(mismatch_rows)
    examples = _select_examples(mismatch_rows, max_examples_per_kind)

    report_dir = (
        paths.report_dir(round_id)
        / f"seed_index={seed_index}"
        / f"replay_mismatches__run_index={replay_run_index}"
    )
    report_dir.mkdir(parents=True, exist_ok=True)
    _clean_report_dir(report_dir)

    mismatch_rows_path = report_dir / "mismatch_rows.parquet"
    mismatch_breakdown_path = report_dir / "mismatch_breakdown.parquet"
    mismatch_rows.write_parquet(mismatch_rows_path)
    mismatch_breakdown.write_parquet(mismatch_breakdown_path)

    figure_specs = [
        FigureSpec(
            key="mismatch_timeline",
            title="Replay mismatch timeline",
            path=plot_replay_mismatch_timeline(
                mismatch_rows,
                report_dir / "mismatch_timeline.png",
                total_steps=max(0, len(run.frames) - 1),
            ),
            description="Counts of unmatched ruin/rebuild cell transitions by yearly step.",
        ),
    ]
    for example in examples:
        step = int(example["step"])
        x = int(example["x"])
        y = int(example["y"])
        mismatch_kind = str(example["mismatch_kind"])
        figure_key = f"{mismatch_kind}__step_{step}__x_{x}__y_{y}"
        figure_specs.append(
            FigureSpec(
                key=figure_key,
                title=f"{mismatch_kind} at step {step} ({x}, {y})",
                path=plot_replay_transition(
                    run.frames[step].grid,
                    run.frames[step + 1].grid,
                    run.frames[step].settlements,
                    run.frames[step + 1].settlements,
                    report_dir / f"{figure_key}.png",
                    title=f"{mismatch_kind} step {step} -> {step + 1} at ({x}, {y})",
                    focus_points=[(x, y)],
                ),
                description="Focused replay transition with mismatch cell highlighted in red.",
            ),
        )

    rerun_command = (
        "uv run astar visualize-replay-mismatches "
        f"--round-id {round_id} --seed-index {seed_index} "
        f"--replay-run-index {replay_run_index} "
        f"--max-examples-per-kind {max_examples_per_kind}"
    )
    report_path = report_dir / "report.md"
    manifest_path = report_dir / "manifest.json"
    mismatch_counts = {
        mismatch_kind: int(
            mismatch_rows.filter(pl.col("mismatch_kind") == mismatch_kind).height
        )
        for mismatch_kind in MISMATCH_KIND_ORDER
    }
    manifest = ReportManifest(
        report_key="replay_mismatches",
        title=f"Replay Mismatch Audit Round {round_id} Seed {seed_index}",
        report_path=report_path,
        round_id=round_id,
        seed_index=seed_index,
        metadata={
            "replay_run_id": run.replay_run_id,
            "replay_run_index": replay_run_index,
            "frame_count": len(run.frames),
            "total_mismatch_count": mismatch_rows.height,
            "ruin_without_collapse_count": mismatch_counts["ruin_without_collapse"],
            "rebuild_without_settlement_count": mismatch_counts["rebuild_without_settlement"],
            "mismatch_rows_path": mismatch_rows_path,
            "mismatch_breakdown_path": mismatch_breakdown_path,
            "source_path": run.source_path,
            "rerun_command": rerun_command,
        },
        figures=figure_specs,
    )
    write_report_manifest(manifest_path, manifest)

    report_lines = [
        render_report_manifest_markdown(manifest),
        "",
        "## Summary",
        "",
        f"- total_mismatch_count: `{mismatch_rows.height}`",
        f"- ruin_without_collapse_count: `{mismatch_counts['ruin_without_collapse']}`",
        f"- rebuild_without_settlement_count: `{mismatch_counts['rebuild_without_settlement']}`",
        f"- mismatch_rows_path: `{mismatch_rows_path}`",
        f"- mismatch_breakdown_path: `{mismatch_breakdown_path}`",
        "",
        "## Breakdown",
        "",
        _markdown_table(
            mismatch_breakdown,
            columns=["mismatch_kind", "prev_code", "next_code", "count", "first_step", "last_step"],
            max_rows=24,
        ),
        "",
        "## Example Audits",
        "",
    ]
    if not examples:
        report_lines.extend(["_none_", ""])
    for example in examples:
        step = int(example["step"])
        x = int(example["x"])
        y = int(example["y"])
        mismatch_kind = str(example["mismatch_kind"])
        figure_key = f"{mismatch_kind}__step_{step}__x_{x}__y_{y}"
        same_position_rows = _same_position_settlement_rows(bundle, step=step, x=x, y=y)
        example_frame = pl.DataFrame([example])
        report_lines.extend(
            [
                f"### {mismatch_kind} step {step} -> {step + 1} at ({x}, {y})",
                "",
                f"- figure: `{figure_key}.png`",
                "",
                "#### Mismatch Row",
                "",
                _markdown_table(
                    example_frame,
                    columns=[
                        "step",
                        "y",
                        "x",
                        "prev_code",
                        "next_code",
                        "event_kind",
                        "ruin_created",
                        "rebuilt_from_ruin",
                        "matched_collapse_to_ruin",
                        "matched_settlement_rebuild",
                        "mismatch_kind",
                    ],
                    max_rows=1,
                ),
                "",
                "#### Same-Position Settlement Rows",
                "",
                _markdown_table(
                    same_position_rows,
                    columns=[
                        "step",
                        "y",
                        "x",
                        "transition_kind",
                        "birth",
                        "rebuild",
                        "collapse",
                        "collapse_to_ruin",
                        "changed",
                    ],
                    max_rows=4,
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


__all__ = ["visualize_replay_mismatches"]
