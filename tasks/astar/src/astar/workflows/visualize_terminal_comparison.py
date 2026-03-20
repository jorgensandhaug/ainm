from __future__ import annotations

import numpy as np

from astar.history.replay.ingest import load_seed_replay_runs
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_analysis_record, read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.viz.maps import plot_initial_state
from astar.viz.reports import render_report_manifest_markdown, write_report_manifest
from astar.viz.spatial import (
    plot_categorical_tensor_comparison,
    plot_categorical_tensor_residuals,
    plot_class_probability_atlas,
    plot_entropy_comparison,
)
from astar.viz.types import FigureSpec, ReportManifest
from astar.workflows.results import VisualizationReportResult
from astar.workflows.summarize_replays import summarize_round_replays


def _load_replay_terminal_probs(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> tuple[np.ndarray, int]:
    summary_path = paths.replay_summary_path(round_id, seed_index)
    if not summary_path.exists():
        summarize_round_replays(paths, round_id)
    payload = load_named_arrays(paths.replay_summary_path(round_id, seed_index))
    return (
        np.asarray(payload["mean_terminal_probs"], dtype=np.float64),
        int(payload["replay_run_count"][0]),
    )


def visualize_terminal_comparison(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> VisualizationReportResult:
    round_record = read_round_record(paths, round_id)
    if seed_index >= round_record.round.seeds_count:
        msg = f"seed_index {seed_index} out of range for round {round_id}"
        raise ValueError(msg)

    replay_tensor, replay_run_count = _load_replay_terminal_probs(paths, round_id, seed_index)
    analysis_record = read_analysis_record(paths, round_id, seed_index)
    ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)

    initial_state = round_record.round.initial_states[seed_index]
    initial_grid = np.asarray(initial_state.grid, dtype=np.int64)

    report_dir = paths.report_dir(round_id) / f"seed_index={seed_index}" / "terminal_comparison"
    report_dir.mkdir(parents=True, exist_ok=True)

    figure_specs = [
        FigureSpec(
            key="initial_map",
            title="Initial map",
            path=plot_initial_state(
                initial_grid,
                [(item.x, item.y, item.has_port) for item in initial_state.settlements],
                report_dir / "initial_map.png",
            ),
            description="Collapsed initial terrain and starting settlements.",
        ),
        FigureSpec(
            key="classwise_comparison",
            title="Replay vs ground truth by class",
            path=plot_categorical_tensor_comparison(
                replay_tensor,
                ground_truth,
                report_dir / "classwise_comparison.png",
                left_name="replay aggregate",
                right_name="ground truth",
            ),
            description="Per-class probability heatmaps, replay aggregate on left, API ground truth on right.",
        ),
        FigureSpec(
            key="replay_atlas",
            title="Replay aggregate atlas",
            path=plot_class_probability_atlas(
                replay_tensor,
                report_dir / "replay_atlas.png",
                source_name="replay aggregate",
            ),
            description="All replay-derived class probability maps.",
        ),
        FigureSpec(
            key="ground_truth_atlas",
            title="Ground truth atlas",
            path=plot_class_probability_atlas(
                ground_truth,
                report_dir / "ground_truth_atlas.png",
                source_name="ground truth",
            ),
            description="All analysis ground-truth class probability maps.",
        ),
        FigureSpec(
            key="residual_atlas",
            title="Replay minus ground truth",
            path=plot_categorical_tensor_residuals(
                replay_tensor,
                ground_truth,
                report_dir / "residual_atlas.png",
                left_name="replay aggregate",
                right_name="ground truth",
            ),
            description="Signed probability residuals per class.",
        ),
        FigureSpec(
            key="entropy_comparison",
            title="Entropy comparison",
            path=plot_entropy_comparison(
                replay_tensor,
                ground_truth,
                report_dir / "entropy_comparison.png",
                left_name="replay aggregate",
                right_name="ground truth",
            ),
            description="Uncertainty maps for replay aggregate and ground truth.",
        ),
    ]

    report_path = report_dir / "report.md"
    manifest_path = report_dir / "manifest.json"
    replay_runs = load_seed_replay_runs(paths, round_id, seed_index)
    manifest = ReportManifest(
        report_key="terminal_comparison",
        title=f"Terminal Comparison Round {round_record.round.round_number} Seed {seed_index}",
        report_path=report_path,
        round_id=round_id,
        seed_index=seed_index,
        metadata={
            "round_number": round_record.round.round_number,
            "replay_run_count": replay_run_count,
            "replay_source": str(paths.replay_summary_path(round_id, seed_index)),
            "analysis_source": str(paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"),
            "score": analysis_record.analysis.score,
            "replay_frame_count": (len(replay_runs[0].frames) if replay_runs else None),
        },
        figures=figure_specs,
    )
    write_report_manifest(manifest_path, manifest)
    report_path.write_text(render_report_manifest_markdown(manifest) + "\n", encoding="utf-8")

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
            artifact_path=manifest_path,
            payload_json=to_jsonable(manifest),
            spec_name=manifest.report_key,
        ),
    )
    return result


__all__ = ["visualize_terminal_comparison"]
