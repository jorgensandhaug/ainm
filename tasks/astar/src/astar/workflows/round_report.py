from __future__ import annotations

import numpy as np

from astar.core.grid import MapShape
from astar.core.validation import SubmissionSpec, validate_prediction_tensor
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import (
    read_query_records,
    read_round_record,
    save_prediction_tensor,
)
from astar.student.predictor.static_semantic import (
    build_static_semantic_prediction,
    default_static_semantic_config,
)
from astar.viz.reports import render_report_manifest_markdown, write_report_manifest
from astar.viz.types import FigureSpec, ReportManifest
from astar.viz.coverage import plot_query_coverage
from astar.viz.entropy import plot_entropy_heatmap
from astar.viz.maps import plot_argmax_prediction, plot_initial_state
from astar.workflows.results import RoundReportArtifacts


def build_round_report(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> RoundReportArtifacts:
    round_record = read_round_record(paths, round_id)
    query_files = [
        item
        for item in read_query_records(paths, round_id)
        if item.record.request.seed_index == seed_index
    ]
    report_dir = paths.report_dir(round_id) / f"seed_index={seed_index}"
    report_dir.mkdir(parents=True, exist_ok=True)

    initial_state = round_record.round.initial_states[seed_index]
    initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
    initial_map_path = plot_initial_state(
        initial_grid,
        [(item.x, item.y, item.has_port) for item in initial_state.settlements],
        report_dir / "initial_map.png",
    )

    coverage_path = plot_query_coverage(
        MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
        [item.record.response.viewport for item in query_files],
        report_dir / "query_coverage.png",
    )

    prediction = build_static_semantic_prediction(initial_grid, default_static_semantic_config())
    validate_prediction_tensor(
        prediction,
        SubmissionSpec(height=round_record.round.map_height, width=round_record.round.map_width),
    )
    save_prediction_tensor(paths.prediction_tensor_path(round_id, seed_index), prediction)

    baseline_path = plot_argmax_prediction(prediction, report_dir / "baseline_prediction.png")
    entropy_path = plot_entropy_heatmap(prediction, report_dir / "prediction_entropy.png")
    manifest_path = report_dir / "manifest.json"
    figure_specs = [
        FigureSpec(
            key="initial_map",
            title="Initial map",
            path=initial_map_path,
            description="Collapsed initial terrain and starting settlements.",
        ),
        FigureSpec(
            key="query_coverage",
            title="Query coverage",
            path=coverage_path,
            description="Coverage counts over executed live viewports.",
        ),
        FigureSpec(
            key="baseline_prediction",
            title="Baseline argmax and confidence",
            path=baseline_path,
            description="Static semantic baseline argmax plus confidence.",
        ),
        FigureSpec(
            key="prediction_entropy",
            title="Prediction entropy",
            path=entropy_path,
            description="Entropy map for the baseline prediction tensor.",
        ),
    ]
    manifest = ReportManifest(
        report_key="round_report",
        title=f"Round {round_record.round.round_number} Seed {seed_index}",
        report_path=report_dir / "report.md",
        round_id=round_id,
        seed_index=seed_index,
        metadata={
            "map_shape": f"{round_record.round.map_height}x{round_record.round.map_width}",
            "queries_logged": len(query_files),
            "baseline_model": "static_semantic",
        },
        figures=figure_specs,
    )
    write_report_manifest(manifest_path, manifest)

    report_path = report_dir / "report.md"
    report_path.write_text(render_report_manifest_markdown(manifest) + "\n", encoding="utf-8")

    return RoundReportArtifacts(
        report_path=report_path,
        manifest_path=manifest_path,
        figure_paths={figure.key: figure.path for figure in figure_specs},
        initial_map_path=initial_map_path,
        coverage_path=coverage_path,
        baseline_path=baseline_path,
        entropy_path=entropy_path,
    )
