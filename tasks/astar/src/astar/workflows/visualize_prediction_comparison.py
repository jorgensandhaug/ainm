from __future__ import annotations

from pathlib import Path

import numpy as np

from astar.viz.maps import plot_initial_state
from astar.viz.reports import render_report_manifest_markdown, write_report_manifest
from astar.viz.spatial import (
    plot_categorical_tensor_comparison,
    plot_categorical_tensor_residuals,
    plot_class_probability_atlas,
    plot_entropy_comparison,
    plot_kl_divergence_map,
)
from astar.viz.types import FigureSpec, ReportManifest
from astar.workflows.results import VisualizationReportResult


def write_prediction_comparison_report(
    *,
    report_key: str,
    title: str,
    report_dir: Path,
    round_id: str,
    seed_index: int,
    initial_grid: np.ndarray,
    settlements: list[tuple[int, int, bool]],
    left_tensor: np.ndarray,
    right_tensor: np.ndarray,
    left_name: str,
    right_name: str,
    left_key: str = "prediction",
    right_key: str = "ground_truth",
    metadata: dict[str, object] | None = None,
    extra_figures: list[FigureSpec] | None = None,
) -> VisualizationReportResult:
    report_dir.mkdir(parents=True, exist_ok=True)
    figure_specs = [
        FigureSpec(
            key="initial_map",
            title="Initial map",
            path=plot_initial_state(initial_grid, settlements, report_dir / "initial_map.png"),
            description="Collapsed initial terrain and starting settlements.",
        ),
        FigureSpec(
            key="classwise_comparison",
            title=f"{left_name} vs {right_name} by class",
            path=plot_categorical_tensor_comparison(
                left_tensor,
                right_tensor,
                report_dir / "classwise_comparison.png",
                left_name=left_name,
                right_name=right_name,
            ),
            description="Per-class probability heatmaps, left source against right source.",
        ),
        FigureSpec(
            key=f"{left_key}_atlas",
            title=f"{left_name} atlas",
            path=plot_class_probability_atlas(
                left_tensor,
                report_dir / f"{left_key}_atlas.png",
                source_name=left_name,
            ),
            description=f"All class probability maps for {left_name}.",
        ),
        FigureSpec(
            key=f"{right_key}_atlas",
            title=f"{right_name} atlas",
            path=plot_class_probability_atlas(
                right_tensor,
                report_dir / f"{right_key}_atlas.png",
                source_name=right_name,
            ),
            description=f"All class probability maps for {right_name}.",
        ),
        FigureSpec(
            key="residual_atlas",
            title=f"{left_name} minus {right_name}",
            path=plot_categorical_tensor_residuals(
                left_tensor,
                right_tensor,
                report_dir / "residual_atlas.png",
                left_name=left_name,
                right_name=right_name,
            ),
            description="Signed probability residuals per class.",
        ),
        FigureSpec(
            key="entropy_comparison",
            title="Entropy comparison",
            path=plot_entropy_comparison(
                left_tensor,
                right_tensor,
                report_dir / "entropy_comparison.png",
                left_name=left_name,
                right_name=right_name,
            ),
            description="Uncertainty maps for both tensors.",
        ),
        FigureSpec(
            key="kl_divergence",
            title="Cellwise KL divergence",
            path=plot_kl_divergence_map(
                right_tensor,
                left_tensor,
                report_dir / "kl_divergence.png",
                prediction_name=left_name,
            ),
            description="Per-cell KL divergence from ground truth to the left tensor.",
        ),
    ]
    if extra_figures:
        figure_specs.extend(extra_figures)

    report_path = report_dir / "report.md"
    manifest_path = report_dir / "manifest.json"
    manifest = ReportManifest(
        report_key=report_key,
        title=title,
        report_path=report_path,
        round_id=round_id,
        seed_index=seed_index,
        metadata=metadata or {},
        figures=figure_specs,
    )
    write_report_manifest(manifest_path, manifest)
    report_path.write_text(render_report_manifest_markdown(manifest) + "\n", encoding="utf-8")

    return VisualizationReportResult(
        report_key=manifest.report_key,
        title=manifest.title,
        report_path=report_path,
        manifest_path=manifest_path,
        figure_paths={figure.key: figure.path for figure in figure_specs},
    )


__all__ = ["write_prediction_comparison_report"]
